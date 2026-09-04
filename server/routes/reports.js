import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, currentMonth, addMonths, monthLabel } from '../util.js';

const router = Router();
router.use(auth);

router.get('/', wrap((req, res) => {
  const months = Math.min(24, Math.max(3, Number(req.query.months) || 12));
  const cur = currentMonth();
  const keys = [];
  for (let i = months - 1; i >= 0; i--) keys.push(addMonths(cur, -i));
  const fromDate = keys[0] + '-01';

  const rows = db.prepare(
    `SELECT substr(date, 1, 7) AS k, type, SUM(amount) AS s
     FROM transactions WHERE user_id = ? AND date >= ? AND substr(date,1,7) <= ?
     GROUP BY k, type`
  ).all(req.user.id, fromDate, cur);
  const get = (k, type) => rows.find((r) => r.k === k && r.type === type)?.s || 0;

  const series = keys.map((k) => {
    const income = get(k, 'income');
    const expense = get(k, 'expense');
    return {
      key: k, label: monthLabel(k), income, expense,
      net: income - expense,
      rate: income > 0 ? (income - expense) / income : null,
    };
  });
  const active = series.filter((s) => s.income > 0 || s.expense > 0);
  const avg = (fn) => (active.length ? active.reduce((s, x) => s + fn(x), 0) / active.length : 0);
  const withRate = active.filter((s) => s.rate !== null);
  const best = withRate.length ? withRate.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;

  // category × month matrix (last 6 months of the window)
  const matrixKeys = keys.slice(-6);
  const catRows = db.prepare(
    `SELECT c.id, c.name, c.icon, c.color, substr(t.date, 1, 7) AS k, SUM(t.amount) AS s
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND substr(t.date,1,7) <= ?
     GROUP BY c.id, k`
  ).all(req.user.id, matrixKeys[0] + '-01', cur);
  const catMap = new Map();
  for (const r of catRows) {
    if (!catMap.has(r.id)) catMap.set(r.id, { id: r.id, name: r.name, icon: r.icon, color: r.color, values: {} });
    catMap.get(r.id).values[r.k] = r.s;
  }
  const categories = [...catMap.values()]
    .map((c) => ({
      ...c,
      total: matrixKeys.reduce((s, k) => s + (c.values[k] || 0), 0),
      avg: matrixKeys.reduce((s, k) => s + (c.values[k] || 0), 0) / matrixKeys.length,
    }))
    .sort((a, b) => b.total - a.total);

  const allTime = db.prepare(
    'SELECT type, SUM(amount) AS s FROM transactions WHERE user_id = ? GROUP BY type'
  ).all(req.user.id);

  res.json({
    months, series,
    matrixKeys,
    matrixLabels: matrixKeys.map(monthLabel),
    categories,
    avgIncome: avg((s) => s.income),
    avgExpense: avg((s) => s.expense),
    avgNet: avg((s) => s.net),
    avgRate: withRate.length ? withRate.reduce((s, x) => s + x.rate, 0) / withRate.length : null,
    bestMonth: best ? { label: best.label, rate: best.rate } : null,
    allTime: {
      income: allTime.find((r) => r.type === 'income')?.s || 0,
      expense: allTime.find((r) => r.type === 'expense')?.s || 0,
    },
    activeMonths: active.length,
  });
}));

export default router;
