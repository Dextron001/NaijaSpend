import { db } from './db.js';
import { addMonths, daysInMonth, todayISO, monthLabel, currentMonth, naira } from './util.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sumBy = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
const round = (n, step = 1) => Math.round(n / step) * step;

function linregSlope(ys) {
  const n = ys.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = sumBy(ys, (y) => y) / n;
  let num = 0, den = 0;
  ys.forEach((y, i) => { num += (i - xm) * (y - ym); den += (i - xm) ** 2; });
  return den === 0 ? 0 : num / den;
}

/**
 * Build the full AI insight pack for a user & month ('YYYY-MM').
 * Handles partially-elapsed months via run-rate projection.
 */
export function buildInsights(db_, userId, monthRaw) {
  const month = monthRaw || currentMonth();
  const today = todayISO();
  const isCurrent = month === today.slice(0, 7);
  const isFuture = month > today.slice(0, 7);
  const dim = daysInMonth(month);
  const elapsedDays = isCurrent ? Number(today.slice(8, 10)) : dim;
  const progress = isFuture ? 0 : clamp(elapsedDays / dim, 0.05, 1);

  const startKey = addMonths(month, -5);
  const tx = db.prepare(
    `SELECT t.id, t.type, t.amount, t.date, t.description, t.method, t.category_id,
            c.name AS category, c.color, c.icon
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.date >= ?
     ORDER BY t.date`
  ).all(userId, startKey + '-01');
  const budgets = db.prepare(
    `SELECT b.id, b.category_id, b.month, b.amount, c.name AS category_name, c.color, c.icon
     FROM budgets b JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = ? AND b.month = ?`
  ).all(userId, month);
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at').all(userId);

  const monthTx = tx.filter((t) => t.date.slice(0, 7) === month);
  const sumType = (arr, type) => sumBy(arr.filter((t) => t.type === type), (t) => t.amount);
  const income = sumType(monthTx, 'income');
  const expense = sumType(monthTx, 'expense');

  // ---- 6-month series ----
  const series = [];
  for (let i = 0; i < 6; i++) {
    const key = addMonths(startKey, i);
    const m = tx.filter((t) => t.date.slice(0, 7) === key);
    series.push({
      key,
      label: monthLabel(key),
      income: sumType(m, 'income'),
      expense: sumType(m, 'expense'),
      partial: isCurrent && key === month,
    });
  }
  const prev = series.find((s) => s.key === addMonths(month, -1));
  const completed = series.filter((s) => !s.partial);
  const activeCompleted = completed.filter((s) => s.income > 0 || s.expense > 0);

  // ---- projections: spent so far + historical average for the rest of the
  // month (blended model is far saner than raw run-rate early in a month) ----
  const avgIncomePast = activeCompleted.length ? sumBy(activeCompleted, (s) => s.income) / activeCompleted.length : 0;
  const avgExpensePast = activeCompleted.length ? sumBy(activeCompleted, (s) => s.expense) / activeCompleted.length : 0;
  const restFrac = isCurrent ? 1 - progress : 0;
  const projIncome = isCurrent ? income + Math.max(0, avgIncomePast - income) : income;
  const projExpense = isCurrent
    ? expense + (avgExpensePast > 0 ? avgExpensePast * restFrac : expense / progress)
    : expense;
  const savingsRate = projIncome > 0 ? (projIncome - projExpense) / projIncome : null;
  const projectCat = (current, avg) => isCurrent
    ? current + (avg > 0 ? avg * restFrac : (progress > 0 ? current / progress : current))
    : current;

  // ---- per-category stats ----
  const catMap = new Map();
  const touch = (id, name, color, icon) => {
    if (!catMap.has(id)) catMap.set(id, { id, name, color, icon, current: 0, hist: {}, histCount: 0, histSum: 0, perTxSum: 0, perTxN: 0 });
    return catMap.get(id);
  };
  // history over completed months
  const completedKeys = new Set(completed.map((s) => s.key));
  for (const t of tx) {
    if (t.type !== 'expense' || !completedKeys.has(t.date.slice(0, 7))) continue;
    const st = touch(t.category_id, t.category, t.color, t.icon);
    const k = t.date.slice(0, 7);
    st.hist[k] = (st.hist[k] || 0) + t.amount;
    st.perTxSum += t.amount;
    st.perTxN += 1;
  }
  const activeCompletedCount = Math.max(1, activeCompleted.length);
  for (const st of catMap.values()) {
    st.histSum = sumBy(Object.values(st.hist), (v) => v);
    st.avg = st.histSum / activeCompletedCount;
    st.perTx = st.perTxN > 0 ? st.perTxSum / st.perTxN : 0;
  }
  for (const t of monthTx) {
    if (t.type !== 'expense') continue;
    const st = touch(t.category_id, t.category, t.color, t.icon);
    st.current += t.amount;
  }

  const categories = [...catMap.values()]
    .filter((c) => c.current > 0)
    .sort((a, b) => b.current - a.current)
    .map((c) => ({
      id: c.id, name: c.name, icon: c.icon, color: c.color,
      amount: c.current,
      projected: projectCat(c.current, c.avg),
      share: expense > 0 ? c.current / expense : 0,
      avg: c.avg,
    }));

  const prevMonthKey = addMonths(month, -1);
  const prevByCategory = {};
  for (const st of catMap.values()) if (st.hist[prevMonthKey]) prevByCategory[st.name] = st.hist[prevMonthKey];

  // ---- anomalies (projected vs historical average) ----
  const anomalies = [];
  for (const st of catMap.values()) {
    if (st.current <= 0 || st.avg <= 0) continue;
    const projected = projectCat(st.current, st.avg);
    const ratio = projected / st.avg;
    if (ratio >= 1.3 && projected - st.avg >= 2000) {
      anomalies.push({
        category: st.name, icon: st.icon, color: st.color,
        current: st.current, projected, avg: st.avg,
        changePct: Math.round((ratio - 1) * 100),
        message: `${st.name} is trending ${Math.round((ratio - 1) * 100)}% above your usual ${naira(st.avg)}/month${isCurrent ? ' (projected from spending so far)' : ''}.`,
      });
    }
  }
  anomalies.sort((a, b) => b.changePct - a.changePct);

  // ---- unusually large single transactions ----
  const bigTx = monthTx
    .filter((t) => t.type === 'expense')
    .map((t) => {
      const st = catMap.get(t.category_id);
      const ratio = st && st.perTx > 0 ? t.amount / st.perTx : 0;
      return { ...t, ratio };
    })
    .filter((t) => t.ratio >= 2)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((t) => ({
      id: t.id, description: t.description, amount: t.amount, category: t.category,
      icon: t.icon, color: t.color, date: t.date,
      message: `${t.description} (${naira(t.amount)}) is about ${Math.round(t.ratio)}× your typical ${t.category} transaction.`,
    }));

  // ---- month-over-month movers (last two completed months) ----
  const movers = [];
  if (activeCompleted.length >= 2) {
    const a = activeCompleted[activeCompleted.length - 2];
    const b = activeCompleted[activeCompleted.length - 1];
    const per = (s) => {
      const m = {};
      for (const st of catMap.values()) if (st.hist[s.key]) m[st.name] = { sum: st.hist[s.key], color: st.color, icon: st.icon };
      return m;
    };
    const ma = per(a), mb = per(b);
    const names = new Set([...Object.keys(ma), ...Object.keys(mb)]);
    for (const name of names) {
      const from = ma[name]?.sum || 0;
      const to = mb[name]?.sum || 0;
      if (to + from < 4000) continue;
      const delta = to - from;
      const deltaPct = from > 0 ? Math.round((delta / from) * 100) : 100;
      if (Math.abs(deltaPct) < 10) continue;
      movers.push({ category: name, icon: ma[name]?.icon || mb[name]?.icon, color: ma[name]?.color || mb[name]?.color, from, to, delta, deltaPct });
    }
    movers.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  }

  // ---- budget status ----
  const budgetStatus = budgets.map((b) => {
    const spent = sumBy(monthTx.filter((t) => t.type === 'expense' && t.category_id === b.category_id), (t) => t.amount);
    const histAvg = catMap.get(b.category_id)?.avg || 0;
    const projected = projectCat(spent, histAvg);
    return {
      id: b.id, category: b.category_name, color: b.color, icon: b.icon,
      amount: b.amount, spent, projected,
      remaining: b.amount - spent,
      pct: b.amount > 0 ? spent / b.amount : 0,
      over: projected > b.amount,
    };
  });

  // ---- forecast next month ----
  const pastExpenses = completed.map((s) => s.expense);
  const pastIncomes = completed.map((s) => s.income);
  let forecast = null;
  if (pastExpenses.length >= 2) {
    const avgE = sumBy(pastExpenses, (v) => v) / pastExpenses.length;
    const slope = linregSlope(pastExpenses);
    let next = avgE + slope * (pastExpenses.length + 1) / 2;
    next = clamp(next, avgE * 0.55, avgE * 1.8);
    const avgI = pastIncomes.length ? sumBy(pastIncomes, (v) => v) / pastIncomes.length : 0;
    forecast = {
      nextMonth: monthLabel(addMonths(month, 1)),
      expense: Math.max(0, round(next, 500)),
      income: Math.max(0, round(avgI, 500)),
      savings: Math.max(0, round(avgI - next, 500)),
      basis: pastExpenses.length >= 3 ? 'trend of your last few months' : 'your recent months',
    };
  }

  // ---- budget recommendations for unbudgeted active categories ----
  const budgetedIds = new Set(budgets.map((b) => b.category_id));
  const budgetRecs = [...catMap.values()]
    .filter((c) => c.avg >= 5000 && !budgetedIds.has(c.id))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5)
    .map((c) => ({
      category_id: c.id, category: c.name, icon: c.icon, color: c.color,
      avg: round(c.avg, 500),
      suggested: round(Math.max(c.avg * 1.05, c.avg + 1000), 1000),
    }));

  // ---- financial health score ----
  const parts = [];
  // 1. savings discipline (40)
  if (savingsRate === null) parts.push({ label: 'Savings', points: 0, max: 40, detail: 'No income recorded this month.' });
  else parts.push({ label: 'Savings', points: clamp(savingsRate / 0.2, 0, 1) * 40, max: 40, detail: `Saving ${Math.round(savingsRate * 100)}% of income (target ≥ 20%).` });
  // 2. budget adherence (25)
  if (budgetStatus.length) {
    const adh = budgetStatus.reduce((s, b) => s + clamp(1 - Math.max(0, b.projected - b.amount) / b.amount, 0, 1), 0) / budgetStatus.length;
    const overs = budgetStatus.filter((b) => b.over).length;
    parts.push({ label: 'Budgets', points: adh * 25, max: 25, detail: overs ? `${overs} budget${overs > 1 ? 's' : ''} trending over.` : 'All budgets on track.' });
  } else {
    parts.push({ label: 'Budgets', points: 10, max: 25, detail: 'No budgets set yet — you are flying blind.' });
  }
  // 3. consistency (15)
  if (activeCompleted.length >= 3) {
    const vals = activeCompleted.map((s) => s.expense);
    const mean = sumBy(vals, (v) => v) / vals.length;
    const sd = Math.sqrt(sumBy(vals, (v) => (v - mean) ** 2) / vals.length);
    const cv = mean > 0 ? sd / mean : 1;
    parts.push({ label: 'Consistency', points: clamp(1 - cv / 0.5, 0, 1) * 15, max: 15, detail: `Monthly spending varies ${Math.round(cv * 100)}% around your average.` });
  } else {
    parts.push({ label: 'Consistency', points: 7, max: 15, detail: 'Need a few more months of data.' });
  }
  // 4. income trend (10)
  if (activeCompleted.length >= 2) {
    const incomes = activeCompleted.map((s) => s.income);
    const mean = sumBy(incomes, (v) => v) / incomes.length;
    const slope = linregSlope(incomes);
    const pts = slope > mean * 0.05 ? 9 : slope < -mean * 0.05 ? 3 : 6;
    parts.push({ label: 'Income trend', points: pts, max: 10, detail: slope > 0 ? 'Income trending up. 👍' : slope < 0 ? 'Income trending down.' : 'Income steady.' });
  } else {
    parts.push({ label: 'Income trend', points: 5, max: 10, detail: 'Need more months of data.' });
  }
  // 5. goals (10)
  if (goals.length) {
    const gp = goals.reduce((s, g) => s + clamp(g.saved_amount / g.target_amount, 0, 1), 0) / goals.length;
    parts.push({ label: 'Goals', points: gp * 10, max: 10, detail: `Goals are ${Math.round(gp * 100)}% funded on average.` });
  } else {
    parts.push({ label: 'Goals', points: 5, max: 10, detail: 'No savings goals yet.' });
  }
  const score = Math.round(sumBy(parts, (p) => p.points));
  const tier = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : 'Needs work';

  // ---- tips ----
  const tips = [];
  const topCat = categories[0];
  if (budgetStatus.length === 0) {
    tips.push({ icon: '🎯', title: 'Set your first budgets', body: `You average about ${naira(sumBy(activeCompleted, (s) => s.expense) / activeCompletedCount)} in monthly expenses. Budgets for your top 3 categories are the fastest way to take control — the AI can suggest them on the Insights page.` });
  }
  const overBudget = budgetStatus.filter((b) => b.over).sort((a, b) => (b.projected - b.amount) - (a.projected - a.amount))[0];
  if (overBudget) {
    tips.push({ icon: '🚨', title: `${overBudget.category} is over budget`, body: `Projected ${naira(overBudget.projected)} against a ${naira(overBudget.amount)} budget. Pause non-essential spending here or raise the budget to something realistic.` });
  }
  if (savingsRate !== null && savingsRate < 0.1 && projIncome > 0) {
    tips.push({ icon: '🐷', title: 'Pay yourself first', body: `You are on track to save only ${Math.round(savingsRate * 100)}% of income this month. Automate a standing order that moves 20% out on payday — before you can touch it.` });
  }
  if (savingsRate !== null && savingsRate >= 0.2) {
    tips.push({ icon: '🏆', title: 'Strong savings month', body: `You are saving ${Math.round(savingsRate * 100)}% of income. Consider parking the surplus in a money-market fund or treasury bills so inflation does not eat it.` });
  }
  const avgExpense = activeCompleted.length ? sumBy(activeCompleted, (s) => s.expense) / activeCompleted.length : projExpense;
  if (avgExpense > 0) {
    const target = avgExpense * 3;
    const ef = goals.find((g) => /emergency|rainy/i.test(g.name));
    tips.push({
      icon: '☔', title: 'Emergency fund check',
      body: ef
        ? `Experts suggest 3 months of expenses (~${naira(target)}). Your "${ef.name}" fund is ${Math.round(clamp(ef.saved_amount / ef.target_amount, 0, 1) * 100)}% of its target — keep pushing.`
        : `3 months of expenses is about ${naira(target)}. Create an "Emergency Fund" goal and build toward it before investing in riskier assets.`,
    });
  }
  if (topCat && topCat.share > 0.3) {
    tips.push({ icon: topCat.icon, title: `${topCat.name} dominates your spending`, body: `${Math.round(topCat.share * 100)}% of this month's spending went here. Try meal-prepping/buying in bulk at the market — small tweaks free up real cash.` });
  }
  const dataCat = categories.find((c) => /data|airtime/i.test(c.name));
  if (dataCat && dataCat.share > 0.08) {
    tips.push({ icon: '📱', title: 'Data & airtime leak', body: `${naira(dataCat.amount)} this month (${Math.round(dataCat.share * 100)}% of spend). Monthly bundles are far cheaper than daily renewals — and check for MTN/Airtel app-only offers.` });
  }
  const transportCat = categories.find((c) => /transport/i.test(c.name));
  if (transportCat && transportCat.share > 0.15) {
    tips.push({ icon: '🚌', title: 'Transport squeeze', body: `${naira(transportCat.amount)} on movement this month. Consider batching errands, or a weekly danfo/BRT budget instead of daily Bolt rides.` });
  }
  if (forecast && forecast.expense > forecast.income && forecast.income > 0) {
    tips.push({ icon: '📉', title: 'Rough road ahead', body: `Based on your trend, next month could cost ${naira(forecast.expense)} against average income of ${naira(forecast.income)}. Trim one discretionary category to stay positive.` });
  }

  // ---- narrative summary ----
  let summary;
  if (!monthTx.length) {
    summary = `No transactions recorded for ${monthLabel(month)} yet. Upload a bank statement (Transactions → Import statement) or add transactions manually, and the AI will start spotting patterns immediately.`;
  } else {
    const dir = prev && prev.expense > 0 ? (projExpense > prev.expense ? 'higher' : 'lower') : null;
    const pctVsPrev = prev && prev.expense > 0 ? Math.abs(Math.round((projExpense / prev.expense - 1) * 100)) : null;
    summary = `You've spent ${naira(expense)} in ${monthLabel(month)}${isCurrent ? ` with ${dim - elapsedDays} day${dim - elapsedDays === 1 ? '' : 's'} to go — projected to land around ${naira(projExpense)} for the month` : ''}.`;
    if (dir && pctVsPrev !== null) summary += ` That's ${pctVsPrev}% ${dir} than last month.`;
    if (savingsRate !== null) summary += ` At this rate you keep ${naira(Math.max(0, projIncome - projExpense))} (${Math.round(savingsRate * 100)}% savings rate).`;
    if (anomalies[0]) summary += ` Watch out: ${anomalies[0].message}`;
  }

  // ---- all-time net ----
  const all = db.prepare('SELECT type, SUM(amount) AS s FROM transactions WHERE user_id=? GROUP BY type').all(userId);
  const allIncome = sumBy(all.filter((r) => r.type === 'income'), (r) => r.s);
  const allExpense = sumBy(all.filter((r) => r.type === 'expense'), (r) => r.s);

  return {
    month, label: monthLabel(month), isCurrent, isFuture, progress,
    elapsedDays, daysInMonth: dim,
    income, expense, net: income - expense,
    projIncome, projExpense, projected: isCurrent,
    savingsRate, avgExpense,
    series, categories, prevByCategory,
    prevIncome: prev?.income ?? 0, prevExpense: prev?.expense ?? 0,
    health: { score, tier, parts: parts.map((p) => ({ ...p, points: Math.round(p.points * 10) / 10 })) },
    anomalies, bigTx, movers, forecast, budgetRecs, budgetStatus, tips, summary,
    goals,
    allTime: { income: allIncome, expense: allExpense, balance: allIncome - allExpense },
  };
}
