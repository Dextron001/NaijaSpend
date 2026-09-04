import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.secret');
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s) return s;
  } catch { /* first boot */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s);
  return s;
}
const SECRET = getSecret();

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, expiresInSec = 60 * 60 * 24 * 7) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  const a = Buffer.from(s);
  const c = Buffer.from(expected);
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(pw), salt, 64);
  const orig = Buffer.from(hash, 'hex');
  return orig.length === test.length && crypto.timingSafeEqual(orig, test);
}

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id, name, email, currency, created_at FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

// ---------- date/month helpers (keys are 'YYYY-MM') ----------
export const pad2 = (n) => String(n).padStart(2, '0');
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const currentMonth = () => todayISO().slice(0, 7);
export const monthKeyOf = (dateStr) => String(dateStr).slice(0, 7);

export function addMonths(key, n) {
  const [y, m] = String(key).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function daysInMonth(key) {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-NG', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const isValidMonth = (k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(k || ''));
export const isValidDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

export const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};

export const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
