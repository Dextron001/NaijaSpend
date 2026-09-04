import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, currentMonth, isValidMonth, addMonths, monthLabel } from '../util.js';

const router = Router();
router.use(auth);

const SPENT_SQL = `(SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE t.user_id = b.user_id AND t.category_id = b.category_id AND t.type = 'expense' AND substr(t.date, 1, 7) = b.month)`;

router.get('/', wrap((req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : currentMonth();

  const monthTx = db.prepare(
    `SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND substr(t.date, 1, 7) = ?
     ORDER BY t.date DESC, t.id DESC`
  ).all(req.user.id, month);

  const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const series = [];
  for (let i = 5; i >= 0; i--) {
    const key = addMonths(month, -i);
    const rows = db.prepare("SELECT type, SUM(amount) AS s FROM transactions WHERE user_id = ? AND substr(date,1,7) = ? GROUP BY type").all(req.user.id, key);
    series.push({
      key, label: monthLabel(key),
      income: rows.find((r) => r.type === 'income')?.s || 0,
      expense: rows.find((r) => r.type === 'expense')?.s || 0,
    });
  }

  const categories = db.prepare(
    `SELECT c.id, c.name, c.color, c.icon, SUM(t.amount) AS amount, COUNT(*) AS count
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND substr(t.date,1,7) = ? AND t.type = 'expense'
     GROUP BY c.id ORDER BY amount DESC`
  ).all(req.user.id, month).map((c) => ({ ...c, share: expense > 0 ? c.amount / expense : 0 }));

  const budgets = db.prepare(
    `SELECT b.id, b.category_id, b.month, b.amount, c.name AS category_name, c.color, c.icon,
            ${SPENT_SQL} AS spent
     FROM budgets b JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = ? AND b.month = ? ORDER BY b.amount DESC`
  ).all(req.user.id, month);

  const recent = monthTx.slice(0, 8);

  res.json({
    month, label: monthLabel(month),
    income, expense, net: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
    series, categories, budgets, recent,
    counts: { transactions: monthTx.length },
  });
}));

export default router;
