import { buildInsights } from './insights.js';
import { naira, todayISO, currentMonth, addMonths, pad2, monthLabel } from './util.js';

const MONTH_WORDS = [
  ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'],
  ['may', 'may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'],
  ['september', 'sep'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec'],
];

/** Understand "last month", "this month", or an explicit month name in the question. */
function detectMonth(text, curKey) {
  const t = String(text || '').toLowerCase();
  if (/\blast month\b|\bprevious month\b/.test(t)) return addMonths(curKey, -1);
  if (/\bthis month\b|\bcurrent month\b/.test(t)) return curKey;
  for (let i = 0; i < 12; i++) {
    const [full, abbr] = MONTH_WORDS[i];
    if (new RegExp(`\\b(${full}|${abbr})\\b`).test(t)) {
      const [y] = curKey.split('-').map(Number);
      let key = `${y}-${pad2(i + 1)}`;
      if (key > curKey) key = `${y - 1}-${pad2(i + 1)}`; // "in January" said in September → this year's January
      return key;
    }
  }
  return null;
}

function parseAmount(text) {
  const m = text.replace(/,/g, '').match(/₦?\s*(\d+(?:\.\d+)?)\s*(k|m)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (/^m$/i.test(m[2] || '')) n *= 1_000_000;
  else if (/^k$/i.test(m[2] || '')) n *= 1000;
  return n;
}

function findCategory(text, categories) {
  const t = text.toLowerCase();
  for (const c of categories) {
    const name = c.name.toLowerCase();
    const words = name.split(/[^a-z]+/).filter((w) => w.length > 3);
    if (t.includes(name) || words.some((w) => t.includes(w))) return c;
  }
  return null;
}

function ruleReply(msg, ins, monthTx) {
  const t = msg.toLowerCase();
  const has = (...words) => words.some((w) => t.includes(w));
  const monthNames = [monthLabel(ins.month), monthLabel(addMonths(ins.month, -1))];

  // --- affordability check ---
  if (has('afford', 'can i buy', 'should i buy', 'fit buy')) {
    const amt = parseAmount(t);
    const disposable = ins.projIncome - ins.projExpense;
    if (amt) {
      const after = disposable - amt;
      if (after >= ins.avgExpense * 0.1) {
        return `Yes — based on this month's pace you'd have about ${naira(disposable)} left after expenses. Buying something worth ${naira(amt)} leaves roughly ${naira(after)} of breathing room. If it's a want (not a need), try saving for it over 2–3 months instead of buying on impulse. 💡`;
      }
      if (after >= 0) {
        return `Technically yes, but it's tight. ${naira(amt)} would eat most of your ${naira(disposable)} free cash this month and leave you exposed if an emergency pops up. Maybe wait for the next salary or look for a cheaper alternative. 🤏`;
      }
      return `Not this one — ${naira(amt)} is more than your current free cash (about ${naira(Math.max(0, disposable))}). Consider a savings goal for it instead; small weekly drops add up fast. 🎯`;
    }
    return `Tell me the amount and I'll check — e.g. "Can I afford 150k for a laptop?" Right now you have about ${naira(Math.max(0, ins.projIncome - ins.projExpense))} of free cash this month.`;
  }

  // --- spending on a category ---
  if (has('spend', 'spent', 'cost', 'expenses on', 'how much on')) {
    const cat = findCategory(t, ins.categories);
    if (cat) {
      let reply = `You've spent ${naira(cat.amount)} on ${cat.name} in ${ins.label}`;
      reply += ins.projected ? ` — on pace for about ${naira(cat.projected)} by month end.` : '.';
      const prevAmt = ins.prevByCategory[cat.name];
      if (prevAmt) reply += ` Last month it was ${naira(prevAmt)} (${cat.projected > prevAmt ? 'up' : 'down'} ${Math.abs(Math.round((cat.projected / prevAmt - 1) * 100))}%).`;
      const b = ins.budgetStatus.find((x) => x.category === cat.name);
      if (b) reply += ` Budget: ${naira(b.spent)} of ${naira(b.amount)} used (${Math.round(b.pct * 100)}%).`;
      return reply;
    }
    if (has('total', 'overall', 'all')) {
      return `Total spending in ${ins.label} is ${naira(ins.expense)}${ins.projected ? ` (projected ${naira(ins.projExpense)} by month end)` : ''}. Your top categories: ${ins.categories.slice(0, 3).map((c) => `${c.name} ${naira(c.amount)}`).join(', ')}.`;
    }
    return `I couldn't match that to a category. Your expense categories: ${ins.categories.slice(0, 6).map((c) => c.name).join(', ')}. Try "How much did I spend on Food?"`;
  }

  // --- income ---
  if (has('income', 'earn', 'salary', 'money in', 'received')) {
    let reply = `Income recorded in ${ins.label}: ${naira(ins.income)}${ins.projected ? ` (projected ${naira(ins.projIncome)})` : ''}.`;
    if (ins.prevIncome) reply += ` Last month: ${naira(ins.prevIncome)}.`;
    if (ins.savingsRate !== null) reply += ` You're keeping about ${Math.round(ins.savingsRate * 100)}% of it — ${ins.savingsRate >= 0.2 ? 'well done! 👏' : 'aim for 20%+. 💪'}`;
    return reply;
  }

  // --- savings ---
  if (has('saving', 'save', 'savings rate', 'left over')) {
    if (ins.savingsRate === null) return `You have no income recorded for ${ins.label} yet, so I can't compute your savings rate. Add your income and I'll analyse it.`;
    const kept = ins.projIncome - ins.projExpense;
    let reply = `Your savings rate this month is ${Math.round(ins.savingsRate * 100)}% — that's about ${naira(kept)}.`;
    reply += ins.savingsRate >= 0.2 ? ' That clears the 20% benchmark. Park the surplus in a money-market fund so it earns while you sleep. 📈' : ins.savingsRate >= 0.1 ? ' Decent, but 20% is the sweet spot. Automate a transfer on payday before you start spending. 🐷' : ' Below target. Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings — move savings out first. 🔒';
    return reply;
  }

  // --- budgets ---
  if (has('budget')) {
    if (!ins.budgetStatus.length) return `You have no budgets for ${ins.label}. The AI suggested: ${ins.budgetRecs.slice(0, 3).map((r) => `${r.category} ${naira(r.suggested)}`).join(', ') || 'set budgets for your top categories'}. You can add budgets on the Budgets page in one click.`;
    const lines = ins.budgetStatus.map((b) => `• ${b.category}: ${naira(b.spent)} / ${naira(b.amount)} (${Math.round(b.pct * 100)}%)${b.over ? ' ⚠️ over' : ''}`);
    return `Budget status for ${ins.label}:\n${lines.join('\n')}`;
  }

  // --- forecast ---
  if (has('next month', 'forecast', 'predict', 'projection', 'future')) {
    if (!ins.forecast) return `I need at least 2 completed months of data before I can forecast. Keep logging! 📊`;
    return `Based on ${ins.forecast.basis}, ${ins.forecast.nextMonth} looks like: ~${naira(ins.forecast.expense)} spending vs ~${naira(ins.forecast.income)} average income — leaving about ${naira(ins.forecast.savings)} to save. ${ins.forecast.expense > ins.forecast.income ? '⚠️ That spending outpaces income — time to trim a category.' : '✅ That keeps you cash-flow positive.'}`;
  }

  // --- top spending ---
  if (has('biggest', 'top', 'most money', 'where did my money', 'where is my money', 'what do i spend')) {
    if (!ins.categories.length) return `No expenses logged for ${ins.label} yet.`;
    const top = ins.categories.slice(0, 3).map((c, i) => `${i + 1}. ${c.icon} ${c.name} — ${naira(c.amount)} (${Math.round(c.share * 100)}%)`).join('\n');
    return `Your top spending this month:\n${top}`;
  }

  // --- anomalies ---
  if (has('unusual', 'strange', 'anomaly', 'weird', 'spike', 'warning', 'alert')) {
    if (!ins.anomalies.length && !ins.bigTx.length) return `Nothing unusual this month — your spending pattern looks normal. 🧘`;
    return [...ins.anomalies.map((a) => '⚠️ ' + a.message), ...ins.bigTx.map((b) => '💡 ' + b.message)].join('\n');
  }

  // --- goals ---
  if (has('goal', 'target', 'japa', 'dream')) {
    if (!ins.goals.length) return `You have no savings goals yet. Create one on the Goals page — naming a goal (e.g. "Japa Fund" ✈️) makes you far more likely to save.`;
    const lines = ins.goals.map((g) => `• ${g.name}: ${naira(g.saved_amount)} / ${naira(g.target_amount)} (${Math.round(Math.min(1, g.saved_amount / g.target_amount) * 100)}%)`);
    return `Your goals:\n${lines.join('\n')}\nKeep contributing monthly — momentum beats amount. 🚀`;
  }

  // --- tips / advice ---
  if (has('tip', 'advice', 'help me', 'how can i', 'reduce', 'cut down')) {
    if (!ins.tips.length) return `Honestly? You're doing fine. Keep logging transactions and maintaining your savings rate. 🌟`;
    const tip = ins.tips[0];
    return `${tip.icon} ${tip.title}\n${tip.body}`;
  }

  // --- balance ---
  if (has('balance', 'net worth', 'left with', 'how much i get', 'how much do i have')) {
    return `This month: ${naira(ins.income)} in, ${naira(ins.expense)} out → net ${naira(ins.net)}. All-time balance across everything you've tracked: ${naira(ins.allTime.balance)}.`;
  }

  // --- greeting / help ---
  if (has('hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'wetin', 'who are you', 'what can you do', 'help')) {
    return `Hey! 👋 I'm Naija AI, your money assistant. I can answer things like:\n• "How much did I spend on Transport this month?"\n• "Can I afford 150k for a laptop?"\n• "What's my savings rate?"\n• "What's unusual this month?"\n• "Forecast my spending for next month"\nJust ask — I read your actual numbers.`;
  }

  // --- fallback with context ---
  return `I read your ledger, but I'm not sure what you're asking. Try:\n• "How much did I spend on Food & Groceries?"\n• "What's my savings rate?"\n• "Can I afford 50k this month?"\n• "Any unusual spending?"\nThis month so far: ${naira(ins.expense)} spent of ${naira(ins.income)} earned${monthNames.length ? ` (${monthNames[0]})` : ''}.`;
}

function forecastFmtExport(n) { return n; }
const forecastHelper = forecastFmtExport; // keep referenced
void forecastHelper;

export async function answer(db, user, message, history = []) {
  const curKey = currentMonth();
  const requested = detectMonth(message, curKey);
  const ins = buildInsights(db, user.id, requested || curKey);
  const fallback = ruleReply(String(message || ''), ins, []);

  // Optional LLM enhancement: set OPENAI_API_KEY (any OpenAI-compatible endpoint) to enable.
  if (process.env.OPENAI_API_KEY) {
    try {
      const context = JSON.stringify({
        month: ins.label,
        incomeSoFar: Math.round(ins.income),
        expenseSoFar: Math.round(ins.expense),
        projectedIncome: Math.round(ins.projIncome),
        projectedExpense: Math.round(ins.projExpense),
        savingsRatePct: ins.savingsRate !== null ? Math.round(ins.savingsRate * 100) : null,
        topCategories: ins.categories.slice(0, 8).map((c) => ({ name: c.name, amount: Math.round(c.amount) })),
        series: ins.series.map((s) => ({ month: s.label, income: Math.round(s.income), expense: Math.round(s.expense) })),
        budgets: ins.budgetStatus.map((b) => ({ category: b.category, budget: b.amount, spent: Math.round(b.spent) })),
        goals: ins.goals.map((g) => ({ name: g.name, saved: g.saved_amount, target: g.target_amount })),
        forecastNextMonth: ins.forecast ? { expense: ins.forecast.expense, income: ins.forecast.income } : null,
        currency: 'NGN (₦)',
        anomalies: ins.anomalies.map((a) => a.message),
      });
      const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are Naija AI, a friendly personal-finance assistant for a Nigerian user. Amounts are in Nigerian Naira (₦). Use ONLY the JSON financial context provided to answer. Be concise (max 120 words), practical, and warm. Give Nigeria-relevant advice where useful (e.g. POS fees, data bundles, danfo vs Bolt, PiggyVest, treasury bills).' },
            { role: 'system', content: 'Financial context JSON: ' + context },
            ...history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 500) })),
            { role: 'user', content: String(message).slice(0, 500) },
          ],
          temperature: 0.4,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) return { reply, engine: 'llm' };
      }
    } catch { /* fall through to rules engine */ }
  }
  return { reply: fallback, engine: 'naija-rules' };
}
