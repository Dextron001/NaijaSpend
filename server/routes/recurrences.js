import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, bad, todayISO } from '../util.js';
import { computeNextRun, runDueRecurrences } from '../recurrence.js';

const router = Router();
router.use(auth);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const METHODS = ['Transfer', 'Card', 'Cash', 'USSD', 'POS'];
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; };

function validate(body, user, res) {
  const type = body?.type === 'income' ? 'income' : body?.type === 'expense' ? 'expense' : null;
  if (!type) return bad(res, 'Type must be income or expense.');
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'Please enter a valid amount.');
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(Number(body?.category_id), user.id);
  if (!cat) return bad(res, 'Please pick a valid category.');
  if (cat.type !== type) return bad(res, `"${cat.name}" is an ${cat.type} category — pick a matching category.`);
  const frequency = body?.frequency === 'weekly' ? 'weekly' : body?.frequency === 'monthly' ? 'monthly' : null;
  if (!frequency) return bad(res, 'Frequency must be monthly or weekly.');
  const day = Number(body?.day);
  if (frequency === 'monthly' && (!Number.isInteger(day) || day < 1 || day > 28)) return bad(res, 'Pick a day of the month between 1 and 28.');
  if (frequency === 'weekly' && (!Number.isInteger(day) || day < 0 || day > 6)) return bad(res, 'Pick a weekday.');
  const method = METHODS.includes(body?.method) ? body.method : 'Transfer';
  const description = String(body?.description || '').trim().slice(0, 200);
  return { type, amount: Math.round(amount * 100) / 100, category_id: cat.id, frequency, day, method, description };
}

router.get('/', wrap((req, res) => {
  // piggy-back: log anything due so the list is always current
  try { runDueRecurrences(req.user.id); } catch { /* best effort */ }
  const items = db.prepare(
    `SELECT r.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM recurrences r JOIN categories c ON c.id = r.category_id
     WHERE r.user_id = ?
     ORDER BY r.active DESC, r.next_run`
  ).all(req.user.id);
  res.json({
    recurrences: items.map((r) => ({
      ...r,
      schedule_label: r.frequency === 'weekly'
        ? `Every ${WEEKDAYS[r.day]}`
        : `Monthly on the ${r.day}${ordinal(r.day)}`,
    })),
  });
}));

router.post('/', wrap((req, res) => {
  const v = validate(req.body, req.user, res);
  if (!v || res.headersSent) return;
  const nextRun = computeNextRun(v.frequency, v.day, todayISO());
  const r = db.prepare(
    `INSERT INTO recurrences (user_id, type, amount, category_id, description, method, frequency, day, next_run)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, v.type, v.amount, v.category_id, v.description, v.method, v.frequency, v.day, nextRun);
  res.json({ recurrence: db.prepare('SELECT * FROM recurrences WHERE id = ?').get(Number(r.lastInsertRowid)) });
}));

router.put('/:id', wrap((req, res) => {
  const existing = db.prepare('SELECT * FROM recurrences WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return bad(res, 'Recurring transaction not found.', 404);
  const v = validate(req.body, req.user, res);
  if (!v || res.headersSent) return;
  const active = req.body?.active === false || req.body?.active === 0 ? 0 : req.body?.active === true || req.body?.active === 1 ? 1 : existing.active;
  const nextRun = active ? computeNextRun(v.frequency, v.day, todayISO()) : existing.next_run;
  db.prepare(
    `UPDATE recurrences SET type=?, amount=?, category_id=?, description=?, method=?, frequency=?, day=?, active=?, next_run=? WHERE id=?`
  ).run(v.type, v.amount, v.category_id, v.description, v.method, v.frequency, v.day, active, nextRun, existing.id);
  res.json({ recurrence: db.prepare('SELECT * FROM recurrences WHERE id = ?').get(existing.id) });
}));

router.post('/:id/toggle', wrap((req, res) => {
  const existing = db.prepare('SELECT * FROM recurrences WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return bad(res, 'Recurring transaction not found.', 404);
  const active = existing.active ? 0 : 1;
  const nextRun = active ? computeNextRun(existing.frequency, existing.day, todayISO()) : existing.next_run;
  db.prepare('UPDATE recurrences SET active = ?, next_run = ? WHERE id = ?').run(active, nextRun, existing.id);
  res.json({ recurrence: db.prepare('SELECT * FROM recurrences WHERE id = ?').get(existing.id) });
}));

// log the next occurrence immediately (dated today) and advance the schedule
router.post('/:id/run-now', wrap((req, res) => {
  const existing = db.prepare(
    `SELECT r.*, c.type AS cat_type FROM recurrences r JOIN categories c ON c.id = r.category_id
     WHERE r.id = ? AND r.user_id = ?`
  ).get(Number(req.params.id), req.user.id);
  if (!existing) return bad(res, 'Recurring transaction not found.', 404);
  if (existing.cat_type !== existing.type) return bad(res, 'Category type mismatch — edit this recurrence first.', 409);
  const today = todayISO();
  const tx = db.prepare(
    'INSERT INTO transactions (user_id, type, amount, category_id, description, date, method) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, existing.type, existing.amount, existing.category_id, existing.description, today, existing.method);
  db.prepare('UPDATE recurrences SET next_run = ?, last_created = ? WHERE id = ?')
    .run(computeNextRun(existing.frequency, existing.day, today), today, existing.id);
  res.json({
    transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(tx.lastInsertRowid)),
    recurrence: db.prepare('SELECT * FROM recurrences WHERE id = ?').get(existing.id),
  });
}));

router.delete('/:id', wrap((req, res) => {
  const r = db.prepare('DELETE FROM recurrences WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  if (r.changes === 0) return bad(res, 'Recurring transaction not found.', 404);
  res.json({ ok: true });
}));

export default router;
