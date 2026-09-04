import { db, ensureDefaultCategories, wipeUserData } from './db.js';
import { hashPassword, addMonths, currentMonth, todayISO, pad2 } from './util.js';

// Deterministic-ish RNG so demo data looks plausible every time
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round50 = (n) => Math.max(100, Math.round(n / 50) * 50);
const ri = (rng, min, max) => Math.round(min + rng() * (max - min));

export function seedDemoData(userId) {
  wipeUserData(userId);
  ensureDefaultCategories(userId);

  const cats = {};
  for (const c of db.prepare('SELECT * FROM categories WHERE user_id=?').all(userId)) cats[c.name] = c.id;

  const rng = mulberry32(Date.now() % 100000);
  const today = todayISO();
  const cur = currentMonth();
  const insert = db.prepare(
    'INSERT INTO transactions (user_id, type, amount, category_id, description, date, method) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const addTx = (type, catName, amount, desc, date, method = 'Transfer') => {
    if (!cats[catName] || date > today) return;
    insert.run(userId, type, Math.round(amount * 100) / 100, cats[catName], desc, date, method);
  };
  const d = (key, day) => `${key}-${pad2(Math.min(day, 28))}`;

  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(cur, -i));

  months.forEach((key, idx) => {
    const isCurrent = key === cur;

    // ---- income ----
    addTx('income', 'Salary', idx >= 2 ? 505000 : 485000, 'Monthly salary — Lumina Tech Ltd', d(key, 1), 'Transfer');
    if (idx === 1) addTx('income', 'Freelance', 95000, 'Landing page project — client in Yaba', d(key, 14), 'Transfer');
    if (idx === 3) addTx('income', 'Freelance', 180000, 'Brand design gig', d(key, 19), 'Transfer');
    if (idx === 4) addTx('income', 'Other Income', 40000, 'Affiliate payout', d(key, 21), 'Transfer');

    // ---- fixed spending ----
    addTx('expense', 'Rent', 120000, 'House rent', d(key, 3), 'Transfer');
    addTx('expense', 'Giving', 10000, 'Church offering / tithe', d(key, 1), 'Transfer');
    addTx('expense', 'Data & Airtime', ri(rng, 15000, 22000), 'MTN data subscription', d(key, ri(rng, 1, 3)), 'USSD');
    addTx('expense', 'Data & Airtime', ri(rng, 2000, 5000), 'Airtime top-up', d(key, ri(rng, 5, 20)), 'USSD');
    if (rng() > 0.4) addTx('expense', 'Data & Airtime', 5000, 'Glo backup data', d(key, ri(rng, 10, 24)), 'USSD');
    addTx('expense', 'Utilities', ri(rng, 8000, 14000), 'IKEDC prepaid units', d(key, ri(rng, 5, 10)), 'Card');
    if (rng() > 0.5) addTx('expense', 'Utilities', ri(rng, 22000, 32000), 'Diesel top-up (generator)', d(key, ri(rng, 8, 22)), 'Transfer');
    addTx('expense', 'Utilities', ri(rng, 1500, 3000), 'Water refill', d(key, ri(rng, 6, 25)), 'Cash');

    // ---- food ----
    addTx('expense', 'Food & Groceries', ri(rng, 14000, 26000), 'Mile 12 market run', d(key, 2), 'Cash');
    addTx('expense', 'Food & Groceries', ri(rng, 18000, 34000), 'Shoprite Ikeja', d(key, 9), 'Card');
    addTx('expense', 'Food & Groceries', ri(rng, 12000, 22000), 'Spar Lekki', d(key, 16), 'Card');
    addTx('expense', 'Food & Groceries', ri(rng, 12000, 20000), 'Mile 12 market restock', d(key, 22), 'Cash');
    const lunchSpots = ['Iya Basira lunch', 'Chicken Republic', 'Iya Yusuf amala', 'Pit-stop shawarma'];
    const nLunch = ri(rng, 3, 6);
    for (let i = 0; i < nLunch; i++) {
      addTx('expense', 'Food & Groceries', ri(rng, 1500, 7000), lunchSpots[ri(rng, 0, lunchSpots.length - 1)], d(key, ri(rng, 4, 27)), 'Card');
    }

    // ---- transport ----
    const nRides = ri(rng, 4, 8);
    for (let i = 0; i < nRides; i++) {
      addTx('expense', 'Transport', ri(rng, 2500, 6000), 'Bolt ride', d(key, ri(rng, 1, 27)), 'Card');
    }
    addTx('expense', 'Transport', ri(rng, 10000, 18000), 'Fuel — Total filling station', d(key, ri(rng, 3, 12)), 'Card');
    if (rng() > 0.5) addTx('expense', 'Transport', ri(rng, 10000, 16000), 'Fuel — NNPC station', d(key, ri(rng, 14, 26)), 'Card');

    // ---- entertainment (spike this month so AI has an anomaly to catch) ----
    addTx('expense', 'Entertainment', 7900, 'Netflix subscription', d(key, 6), 'Card');
    addTx('expense', 'Entertainment', 1400, 'Spotify Premium', d(key, 8), 'Card');
    addTx('expense', 'Entertainment', ri(rng, 6000, 9000), 'Filmhouse cinema', d(key, ri(rng, 12, 24)), 'Card');
    if (rng() > 0.5) addTx('expense', 'Entertainment', ri(rng, 4500, 8000), 'Cold Stone Creamery', d(key, ri(rng, 10, 26)), 'Card');
    if (isCurrent) {
      addTx('expense', 'Entertainment', 25000, 'Detty weekend outing with the guys', d(key, 3), 'Card');
      addTx('expense', 'Entertainment', 12500, 'Concert ticket — Afrobeats live', d(key, 2), 'Card');
    }

    // ---- personal care & occasional ----
    addTx('expense', 'Personal Care', ri(rng, 3000, 5000), 'Barber shop', d(key, ri(rng, 20, 28)), 'Cash');
    if (rng() > 0.55) addTx('expense', 'Health', ri(rng, 5000, 15000), 'Pharmacy — malaria meds & vitamins', d(key, ri(rng, 7, 25)), 'Card');
    if (rng() > 0.7) addTx('expense', 'Education', ri(rng, 15000, 25000), 'Udemy course', d(key, ri(rng, 8, 24)), 'Card');
    if (rng() > 0.6) addTx('expense', 'Shopping', ri(rng, 15000, 45000), 'Jumia order', d(key, ri(rng, 9, 26)), 'Card');
    if (isCurrent) {
      addTx('expense', 'Shopping', 85000, 'Jumia — new wireless headphones', d(key, 1), 'Card');
      addTx('expense', 'Transport', 6800, 'Uber to the airport', d(key, 4), 'Card');
    }
  });

  // ---- budgets for the last 3 months (incl. current) ----
  const budgetIns = db.prepare('INSERT INTO budgets (user_id, category_id, month, amount) VALUES (?, ?, ?, ?)');
  const budgetPlan = [
    ['Food & Groceries', 140000],
    ['Transport', 55000],
    ['Data & Airtime', 35000],
    ['Utilities', 30000],
    ['Entertainment', 25000],
    ['Shopping', 40000],
  ];
  for (const key of months.slice(3)) {
    for (const [name, amount] of budgetPlan) budgetIns.run(userId, cats[name], key, amount);
  }

  // ---- goals ----
  const goalIns = db.prepare('INSERT INTO goals (user_id, name, target_amount, saved_amount, deadline, note) VALUES (?, ?, ?, ?, ?, ?)');
  goalIns.run(userId, 'Emergency Fund', 1500000, 820000, `${addMonths(cur, 8)}-28`, '3 months of living expenses');
  goalIns.run(userId, 'New MacBook', 1850000, 460000, `${addMonths(cur, 10)}-28`, 'For design & dev work');
  goalIns.run(userId, 'Land in Lekki', 2500000, 310000, `${addMonths(cur, 14)}-28`, 'Small plot, big dreams 🏡');
}

export function ensureDemoUser() {
  const email = 'demo@naijaspend.ng';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const r = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run('Demo User', email, hashPassword('demo1234'));
  seedDemoData(Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}
