import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, isValidMonth, currentMonth } from '../util.js';
import { buildInsights } from '../insights.js';

const router = Router();
router.use(auth);

router.get('/', wrap((req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : currentMonth();
  res.json({ insights: buildInsights(db, req.user.id, month) });
}));

export default router;
