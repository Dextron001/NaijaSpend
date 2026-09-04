import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap } from '../util.js';

const router = Router();
router.use(auth);

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/', wrap((req, res) => {
  const rows = db.prepare(
    `SELECT t.id, t.date, t.type, t.amount, c.name AS category, t.description, t.method
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC`
  ).all(req.user.id);
  const lines = ['Date,Type,Category,Description,Method,Amount (NGN)'];
  for (const r of rows) {
    lines.push([r.date, r.type, csvCell(r.category), csvCell(r.description), r.method, r.amount].map(csvCell).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="naijaspend-transactions.csv"');
  res.send(lines.join('\n'));
}));

export default router;
