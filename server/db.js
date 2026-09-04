import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'naijaspend.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  icon TEXT NOT NULL DEFAULT '💼',
  color TEXT NOT NULL DEFAULT '#0a7d43'
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'Transfer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  UNIQUE(user_id, category_id, month)
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL CHECK (target_amount > 0),
  saved_amount REAL NOT NULL DEFAULT 0,
  deadline TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'Transfer',
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','weekly')),
  day INTEGER NOT NULL,
  next_run TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_created TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_user_month ON budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_rec_user ON recurrences(user_id, active, next_run);
`);

// light-weight migration: add receipt column to existing databases
try {
  db.exec("ALTER TABLE transactions ADD COLUMN receipt TEXT;");
} catch { /* column already exists */ }

export const DEFAULT_CATEGORIES = [
  { name: 'Food & Groceries', type: 'expense', icon: '🍲', color: '#f59e0b' },
  { name: 'Transport', type: 'expense', icon: '🚌', color: '#3b82f6' },
  { name: 'Data & Airtime', type: 'expense', icon: '📱', color: '#8b5cf6' },
  { name: 'Rent', type: 'expense', icon: '🏠', color: '#0ea5e9' },
  { name: 'Utilities', type: 'expense', icon: '⚡', color: '#eab308' },
  { name: 'Entertainment', type: 'expense', icon: '🎬', color: '#ec4899' },
  { name: 'Health', type: 'expense', icon: '💊', color: '#ef4444' },
  { name: 'Education', type: 'expense', icon: '📚', color: '#14b8a6' },
  { name: 'Shopping', type: 'expense', icon: '🛍️', color: '#f97316' },
  { name: 'Personal Care', type: 'expense', icon: '💈', color: '#64748b' },
  { name: 'Giving', type: 'expense', icon: '🤲', color: '#22c55e' },
  { name: 'Others', type: 'expense', icon: '📦', color: '#94a3b8' },
  { name: 'Salary', type: 'income', icon: '💼', color: '#16a34a' },
  { name: 'Business', type: 'income', icon: '🏪', color: '#0ea5e9' },
  { name: 'Freelance', type: 'income', icon: '🧑‍💻', color: '#8b5cf6' },
  { name: 'Investment', type: 'income', icon: '📈', color: '#f59e0b' },
  { name: 'Gifts', type: 'income', icon: '🎁', color: '#ec4899' },
  { name: 'Other Income', type: 'income', icon: '➕', color: '#94a3b8' },
];

export function ensureDefaultCategories(userId) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM categories WHERE user_id=?').get(userId).n;
  if (existing > 0) return;
  const ins = db.prepare('INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)');
  for (const c of DEFAULT_CATEGORIES) ins.run(userId, c.name, c.type, c.icon, c.color);
}

export function wipeUserData(userId) {
  db.prepare('DELETE FROM transactions WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM budgets WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM goals WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM chat_log WHERE user_id=?').run(userId);
}
