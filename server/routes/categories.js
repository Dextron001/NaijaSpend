import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, bad } from '../util.js';

const router = Router();
router.use(auth);

router.get('/', wrap((req, res) => {
  const cats = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, name').all(req.user.id);
  res.json({ categories: cats });
}));

router.post('/', wrap((req, res) => {
  const name = String(req.body?.name || '').trim();
  const type = req.body?.type === 'income' ? 'income' : 'expense';
  const icon = String(req.body?.icon || (type === 'income' ? '💰' : '🏷️')).slice(0, 8);
  const color = /^#[0-9a-fA-F]{6}$/.test(String(req.body?.color || '')) ? req.body.color : '#0a7d43';
  if (name.length < 2) return bad(res, 'Category name is too short.');
  const dup = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?').get(req.user.id, name, type);
  if (dup) return bad(res, 'You already have a category with that name.', 409);
  const r = db.prepare('INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)').run(req.user.id, name, type, icon, color);
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(r.lastInsertRowid)) });
}));

router.delete('/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cat) return bad(res, 'Category not found.', 404);
  const used = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?').get(id).n;
  if (used > 0) return bad(res, `"${cat.name}" is used by ${used} transaction(s) and cannot be deleted.`, 409);
  db.prepare('DELETE FROM budgets WHERE category_id = ? AND user_id = ?').run(id, req.user.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
}));

export default router;
