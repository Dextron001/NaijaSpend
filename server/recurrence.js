import { db } from './db.js';

const pad2 = (n) => String(n).padStart(2, '0');
export const todayISO = () => new Date().toISOString().slice(0, 10);

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthlyDate(y, m, day) {
  const yy = m > 12 ? y + 1 : y;
  const mm = m > 12 ? m - 12 : m;
  return `${yy}-${pad2(mm)}-${pad2(Math.min(day, daysInMonth(yy, mm)))}`;
}

/** First occurrence strictly AFTER `after` (ISO date) for a recurrence rule. */
export function computeNextRun(frequency, day, after = todayISO()) {
  if (frequency === 'weekly') {
    const d = new Date(after + 'T00:00:00Z');
    let diff = (day - d.getUTCDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  // monthly: day = day of month (1-28 stored, but tolerate up to 31 with clamping)
  const [y, m] = after.split('-').map(Number);
  let cand = monthlyDate(y, m, day);
  if (cand <= after) cand = monthlyDate(y, m + 1, day);
  return cand;
}

function advance(isoDate, frequency, day) {
  if (frequency === 'weekly') {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const [y, m] = isoDate.split('-').map(Number);
  return monthlyDate(y, m + 1, day);
}

/**
 * Create any transactions that are due for a user (idempotent via next_run).
 * Missed periods are back-filled with their correct dates. Cheap when nothing is due.
 */
export function runDueRecurrences(userId) {
  const today = todayISO();
  const due = db.prepare(
    `SELECT r.*, c.type AS cat_type FROM recurrences r
     JOIN categories c ON c.id = r.category_id
     WHERE r.user_id = ? AND r.active = 1 AND r.next_run <= ?`
  ).all(userId, today);
  if (!due.length) return 0;

  const ins = db.prepare(
    'INSERT INTO transactions (user_id, type, amount, category_id, description, date, method) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const upd = db.prepare('UPDATE recurrences SET next_run = ?, last_created = ? WHERE id = ?');
  let created = 0;

  for (const r of due) {
    if (r.cat_type !== r.type) continue; // category changed type — skip rather than corrupt
    let next = r.next_run;
    let guard = 0;
    while (next <= today && guard < 60) {
      ins.run(userId, r.type, r.amount, r.category_id, r.description, next, r.method);
      created++;
      next = advance(next, r.frequency, r.day);
      guard++;
    }
    upd.run(next, today, r.id);
  }
  return created;
}
