import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, bad } from '../util.js';
import { answer } from '../assistant.js';

const router = Router();
router.use(auth);

router.post('/', wrap(async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 500);
  if (!message) return bad(res, 'Type a question first.');
  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content || '').slice(0, 500) }))
    : [];
  const result = await answer(db, req.user, message, history);
  try {
    const ins = db.prepare('INSERT INTO chat_log (user_id, role, message) VALUES (?, ?, ?)');
    ins.run(req.user.id, 'user', message);
    ins.run(req.user.id, 'assistant', result.reply);
  } catch { /* logging is best-effort */ }
  res.json(result);
}));

export default router;
