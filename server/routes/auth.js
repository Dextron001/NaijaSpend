import { Router } from 'express';
import { db, ensureDefaultCategories, wipeUserData } from '../db.js';
import { signToken, hashPassword, verifyPassword, auth, wrap, bad } from '../util.js';

const router = Router();
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, currency: u.currency, created_at: u.created_at });

router.post('/register', wrap((req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (name.length < 2) return bad(res, 'Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Please enter a valid email address.');
  if (password.length < 6) return bad(res, 'Password must be at least 6 characters.');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return bad(res, 'An account with this email already exists.', 409);
  const r = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hashPassword(password));
  const userId = Number(r.lastInsertRowid);
  ensureDefaultCategories(userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({ token: signToken({ sub: userId }), user: publicUser(user) });
}));

router.post('/login', wrap((req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) return bad(res, 'Invalid email or password.', 401);
  res.json({ token: signToken({ sub: user.id }), user: publicUser(user) });
}));

router.get('/me', auth, wrap((req, res) => res.json({ user: req.user })));

router.put('/me', auth, wrap((req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2) return bad(res, 'Please enter your name.');
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  res.json({ user: { ...req.user, name } });
}));

router.put('/password', auth, wrap((req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, u.password_hash)) return bad(res, 'Current password is incorrect.', 401);
  if (next.length < 6) return bad(res, 'New password must be at least 6 characters.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
}));

// wipe my data
router.delete('/data', auth, wrap((req, res) => {
  wipeUserData(req.user.id);
  ensureDefaultCategories(req.user.id);
  res.json({ ok: true });
}));


export default router;
