import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import authRoutes from './routes/auth.js';
import categoriesRoutes from './routes/categories.js';
import transactionsRoutes from './routes/transactions.js';
import budgetsRoutes from './routes/budgets.js';
import goalsRoutes from './routes/goals.js';
import dashboardRoutes from './routes/dashboard.js';
import insightsRoutes from './routes/insights.js';
import assistantRoutes from './routes/assistant.js';
import exportRoutes from './routes/export.js';
import importRoutes from './routes/import.js';
import recurrencesRoutes from './routes/recurrences.js';
import reportsRoutes from './routes/reports.js';
import receiptsRoutes from './routes/receipts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const api = express.Router();
api.get('/stats', (req, res) => {
  if (req.query.key !== 'CHANGE-THIS-SECRET') return res.status(404).json({ error: 'Not found' });
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const withData = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM transactions').get().n;
  const transactions = db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
  res.json({ users, usersWithStatements: withData, transactions });
});
api.get('/health', (req, res) => res.json({ ok: true, version: '1.4.0' }));
api.use('/auth', authRoutes);
api.use('/categories', categoriesRoutes);
api.use('/transactions', transactionsRoutes);
api.use('/budgets', budgetsRoutes);
api.use('/goals', goalsRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/insights', insightsRoutes);
api.use('/assistant', assistantRoutes);
api.use('/export', exportRoutes);
api.use('/import', importRoutes);
api.use('/recurrences', recurrencesRoutes);
api.use('/reports', reportsRoutes);
api.use('/receipts', receiptsRoutes);
api.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// serve the built frontend (client builds into server/public)
const dist = path.join(__dirname, 'public');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong on our side.' });
});


// real data only: remove any legacy auto-generated demo accounts (@naijaspend.ng placeholder domain)
try {
  const { db } = await import('./db.js');
  const gone = db.prepare("DELETE FROM users WHERE email LIKE '%@naijaspend.ng'").run();
  if (gone.changes > 0) console.log(`🧹 Removed ${gone.changes} legacy demo account(s)`);
} catch { /* best effort */ }

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ NaijaSpend v1.4.0 running → open http://localhost:${port} in your browser`);
});
