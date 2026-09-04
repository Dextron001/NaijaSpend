import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, bad, currentMonth, isValidMonth } from '../util.js';

const router = Router();
router.use(auth);

const SPENT_SQL = `(SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE t.user_id = b.user_id AND t.category_id = b.category_id AND t.type = 'expense' AND substr(t.date, 1, 7) = b.month)`;

router.get('/', wrap((req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : currentMonth();
  const budgets = db.prepare(
    `SELECT b.id, b.category_id, b.month, b.amount, c.name AS category_name, c.color, c.icon,
            ${SPENT_SQL} AS spent
     FROM budgets b JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = ? AND b.month = ?
     ORDER BY b.amount DESC`
  ).all(req.user.id, month);
  res.json({ month, budgets });
}));

// upsert
router.post('/', wrap((req, res) => {
  const categoryId = Number(req.body?.category_id);
  const amount = Number(req.body?.amount);
  const month = isValidMonth(req.body?.month) ? req.body.month : currentMonth();
  if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'Please enter a valid budget amount.');
  const cat = db.prepare("SELECT * FROM categories WHERE id = ? AND user_id = ? AND type = 'expense'").get(categoryId, req.user.id);
  if (!cat) return bad(res, 'Please pick a valid expense category.');
  db.prepare(
    `INSERT INTO budgets (user_id, category_id, month, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, category_id, month) DO UPDATE SET amount = excluded.amount`
  ).run(req.user.id, categoryId, month, Math.round(amount * 100) / 100);
  const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?').get(req.user.id, categoryId, month);
  res.json({ budget });
}));

router.delete('/:id', wrap((req, res) => {
  const r = db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  if (r.changes === 0) return bad(res, 'Budget not found.', 404);
  res.json({ ok: true });
}));

export default router;
