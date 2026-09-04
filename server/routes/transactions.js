import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, bad, currentMonth, isValidMonth, isValidDate } from '../util.js';
import { saveReceiptDataUrl, removeReceiptFile } from './receipts.js';

const router = Router();
router.use(auth);

const METHODS = ['Transfer', 'Card', 'Cash', 'USSD', 'POS'];

function validateTx(body, user, res) {
  const type = body?.type === 'income' ? 'income' : body?.type === 'expense' ? 'expense' : null;
  if (!type) return bad(res, 'Type must be income or expense.');
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return bad(res, 'Please enter a valid amount.');
  if (!isValidDate(body?.date)) return bad(res, 'Please choose a valid date.');
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(Number(body?.category_id), user.id);
  if (!cat) return bad(res, 'Please pick a valid category.');
  if (cat.type !== type) return bad(res, `"${cat.name}" is an ${cat.type} category — pick a matching category.`);
  const method = METHODS.includes(body?.method) ? body.method : 'Transfer';
  const description = String(body?.description || '').trim().slice(0, 200);
  return { type, amount: Math.round(amount * 100) / 100, date: body.date, category_id: cat.id, method, description };
}

router.get('/', wrap((req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : currentMonth();
  const type = req.query.type === 'income' || req.query.type === 'expense' ? req.query.type : null;
  const categoryId = Number(req.query.category_id) || null;
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 25));

  const where = ['t.user_id = ?', "substr(t.date, 1, 7) = ?"];
  const params = [req.user.id, month];
  if (type) { where.push('t.type = ?'); params.push(type); }
  if (categoryId) { where.push('t.category_id = ?'); params.push(categoryId); }
  if (q) { where.push("lower(t.description) LIKE ?"); params.push('%' + q.replace(/[%_]/g, '') + '%'); }
  const whereSql = where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS n FROM transactions t WHERE ${whereSql}`).get(...params).n;
  const sums = db.prepare(`SELECT t.type, SUM(t.amount) AS s FROM transactions t WHERE ${whereSql} GROUP BY t.type`).all(...params);
  const items = db.prepare(
    `SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE ${whereSql}
     ORDER BY t.date DESC, t.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);

  res.json({
    items, total, page, pageSize,
    income: sums.find((s) => s.type === 'income')?.s || 0,
    expense: sums.find((s) => s.type === 'expense')?.s || 0,
  });
}));

router.post('/', wrap((req, res) => {
  const v = validateTx(req.body, req.user, res);
  if (!v || res.headersSent) return;
  const r = db.prepare('INSERT INTO transactions (user_id, type, amount, category_id, description, date, method) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, v.type, v.amount, v.category_id, v.description, v.date, v.method);
  res.json({ transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(r.lastInsertRowid)) });
}));

router.put('/:id', wrap((req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return bad(res, 'Transaction not found.', 404);
  const v = validateTx(req.body, req.user, res);
  if (!v || res.headersSent) return;
  db.prepare('UPDATE transactions SET type=?, amount=?, category_id=?, description=?, date=?, method=? WHERE id = ?')
    .run(v.type, v.amount, v.category_id, v.description, v.date, v.method, existing.id);
  res.json({ transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(existing.id) });
}));

router.delete('/:id', wrap((req, res) => {
  const existing = db.prepare('SELECT id, receipt FROM transactions WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return bad(res, 'Transaction not found.', 404);
  db.prepare('DELETE FROM transactions WHERE id = ?').run(existing.id);
  removeReceiptFile(existing);
  res.json({ ok: true });
}));

// ---- receipts ----
router.put('/:id/receipt', wrap((req, res) => {
  const tx = db.prepare('SELECT id, receipt FROM transactions WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!tx) return bad(res, 'Transaction not found.', 404);
  let name;
  try {
    name = saveReceiptDataUrl(tx.id, req.body?.dataUrl);
  } catch (e) {
    return bad(res, e.message, e.status || 400);
  }
  removeReceiptFile(tx); // remove previous file if replacing
  db.prepare('UPDATE transactions SET receipt = ? WHERE id = ?').run(name, tx.id);
  res.json({ receipt: name });
}));

router.delete('/:id/receipt', wrap((req, res) => {
  const tx = db.prepare('SELECT id, receipt FROM transactions WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!tx) return bad(res, 'Transaction not found.', 404);
  removeReceiptFile(tx);
  db.prepare('UPDATE transactions SET receipt = NULL WHERE id = ?').run(tx.id);
  res.json({ ok: true });
}));

export default router;
