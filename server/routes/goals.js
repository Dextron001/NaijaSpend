import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, bad, isValidDate } from '../util.js';

const router = Router();
router.use(auth);

router.get('/', wrap((req, res) => {
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at').all(req.user.id);
  res.json({ goals });
}));

function validateGoal(body, res) {
  const name = String(body?.name || '').trim().slice(0, 80);
  const target = Number(body?.target_amount);
  const saved = Number(body?.saved_amount ?? 0);
  const deadline = body?.deadline ? String(body.deadline) : null;
  const note = String(body?.note || '').trim().slice(0, 200);
  if (name.length < 2) return bad(res, 'Please give the goal a name.');
  if (!Number.isFinite(target) || target <= 0) return bad(res, 'Please enter a valid target amount.');
  if (!Number.isFinite(saved) || saved < 0) return bad(res, 'Saved amount must be zero or more.');
  if (deadline && !isValidDate(deadline)) return bad(res, 'Deadline must be a valid date.');
  return { name, target, saved, deadline, note };
}

router.post('/', wrap((req, res) => {
  const v = validateGoal(req.body, res);
  if (!v || res.headersSent) return;
  const r = db.prepare('INSERT INTO goals (user_id, name, target_amount, saved_amount, deadline, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, v.name, v.target, v.saved, v.deadline, v.note);
  res.json({ goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(Number(r.lastInsertRowid)) });
}));

router.put('/:id', wrap((req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return bad(res, 'Goal not found.', 404);
  const v = validateGoal(req.body, res);
  if (!v || res.headersSent) return;
  db.prepare('UPDATE goals SET name=?, target_amount=?, saved_amount=?, deadline=?, note=? WHERE id=?')
    .run(v.name, v.target, v.saved, v.deadline, v.note, existing.id);
  res.json({ goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(existing.id) });
}));

router.post('/:id/contribute', wrap((req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return bad(res, 'Goal not found.', 404);
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount)) return bad(res, 'Please enter a valid amount.');
  const saved = Math.max(0, existing.saved_amount + amount);
  db.prepare('UPDATE goals SET saved_amount = ? WHERE id = ?').run(Math.round(saved * 100) / 100, existing.id);
  res.json({ goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(existing.id) });
}));

router.delete('/:id', wrap((req, res) => {
  const r = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  if (r.changes === 0) return bad(res, 'Goal not found.', 404);
  res.json({ ok: true });
}));

export default router;
