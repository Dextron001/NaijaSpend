import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, isValidDate, todayISO } from '../util.js';

const router = Router();
router.use(auth);

/* ---------------- parsing helpers ---------------- */

const norm = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

function normalizeText(s) {
  return String(s || '')
    .replace(/NGN/ig, '₦')
    .replace(/naira/ig, '₦');
}

/** Find plausible amounts on a line; flags ones preceded by "bal"/"balance". */
function parseAmounts(line) {
  const candidates = [];
  // 1) explicitly-marked amounts: ₦5,000 / #5,000 / N5,000.00 / 2,500.00 (2-dp) / 7.5k
  const re = /(?:₦|#|\bN)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*\.[0-9]{2})(?![0-9/])|([0-9]+(?:\.[0-9]+)?)\s*k\b/gi;
  let m;
  while ((m = re.exec(line))) {
    const pre = line.slice(Math.max(0, m.index - 18), m.index).toLowerCase();
    let n;
    if (m[1] != null) n = parseFloat(m[1].replace(/,/g, ''));
    else if (m[2] != null) n = parseFloat(m[2].replace(/,/g, ''));
    else n = parseFloat(m[3]) * 1000;
    if (Number.isFinite(n) && n > 0 && n < 1e12) candidates.push({ n, isBal: /bal/.test(pre) });
  }
  // 2) casual phrasing: "paid 15000 for fuel", "received 50000 from ..."
  if (!candidates.some((a) => !a.isBal)) {
    const re2 = /\b(?:paid|spent|cost|bought|sent|gave|transferred|transfer|debited|charged|received|earned|credited)\b[^0-9]{0,24}([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i;
    const m2 = line.match(re2);
    if (m2) {
      const n = parseFloat(m2[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0 && n < 1e12) candidates.push({ n, isBal: false });
    }
  }
  return candidates;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function parseDate(line, fallback) {
  let m = line.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    let dd = +m[1], mm = +m[2], yy = +m[3];
    if (yy < 100) yy += 2000;
    if (dd <= 12 && mm > 12) [dd, mm] = [mm, dd]; // tolerate mm/dd
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yy >= 2000 && yy <= 2100) return iso(yy, mm, dd);
  }
  m = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,]*(\d{2,4})\b/i);
  if (m) {
    let dd = +m[1], mm = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, yy = +m[3];
    if (yy < 100) yy += 2000;
    if (mm && dd >= 1 && dd <= 31 && yy >= 2000 && yy <= 2100) return iso(yy, mm, dd);
  }
  return { date: fallback, found: false };
}
function findDate(line, fallback) {
  const r = parseDate(line, fallback);
  return typeof r === 'string' ? { date: r, found: true } : r;
}

const CREDIT_RE = /\bcredit(?:ed| alert)?\b|\bcr\b|salary|payroll|wages|received|inflow|refund|reversal|funding|\bcommission\b/i;
const DEBIT_RE = /\bdebit(?:ed| alert)?\b|\bdr\b|\bspent\b|\bpaid\b|purchase|\bwithdraw|uepin|\bpos\b|transfer(?:red)? to|\bbought\b|\bbuy\b|payment|subscription|\bcharge[sd]?\b|\bfee\b/i;

/* narration → category rules (ordered: specific first, generic last) */
const CAT_RULES = [
  [/\bsalary\b|payroll|wages/i, 'Salary'],
  [/shoprite|spar|\bmarket\b|grocer|supermarket|restaurant|\bfood\b|kitchen|chicken republic|\bkfc\b|domino|amala|iya\b|buka|jollof/i, 'Food & Groceries'],
  [/\bmtn\b|\bglo\b|\bairtel\b|9mobile|etisalat|airtime|\bdata\b|smile|spectranet|subscription bundle/i, 'Data & Airtime'],
  [/ikedc|ekedc|aedc|jed[a-z]{2}|\bphcn\b|electricit|prepaid|disco\b|diesel|gen\b|generator|water corp|\bibedc\b|\bjek\b/i, 'Utilities'],
  [/netflix|spotify|showmax|dstv|gotv|cinema|filmhouse|netflix|ticket|concert|\bshow\b/i, 'Entertainment'],
  [/pharmac|hospital|clinic|healthplus|medplus|\bmeds\b|malaria|\bhmo\b/i, 'Health'],
  [/school|udemy|coursera|textbook|\bexam\b|\bwaec\b|\bjamb\b|tuition|course/i, 'Education'],
  [/jumia|konga|amazon|aliexpress|shein|temu|\bshop\b|boutique/i, 'Shopping'],
  [/uber|\bbolt\b|gokada|taxify|danfo|\bbrt\b|lagride|\bmax\.?okada\b|oridor/i, 'Transport'],
  [/\bfuel\b|petrol|filling station|\bnnpc\b|oando|conoil|\bmobil\b|total (filling|station|g)/i, 'Transport'],
  [/\batm\b|withdraw|cashpoint|uepin/i, 'Others'],
];

function guessCategoryName(text, type) {
  for (const [re, name] of CAT_RULES) if (re.test(text)) return name;
  return type === 'income' ? 'Other Income' : 'Others';
}

function guessMethod(text) {
  if (/ussd/i.test(text)) return 'USSD';
  if (/\bpos\b|point of sale/i.test(text)) return 'POS';
  if (/\batm\b|withdraw|cashpoint|uepin/i.test(text)) return 'Cash';
  if (/\bcard\b|web|online/i.test(text)) return 'Card';
  return 'Transfer';
}

function cleanDesc(s) {
  return s
    .replace(/\bbal(?:ance)?\s*[:\-]?\s*[₦Nn]?\s*[\d,]+(?:\.\d{1,2})?/ig, '')
    .replace(/\bdate\s*[:\-]?\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/ig, '')
    .replace(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g, '')
    .replace(/\bat\s+\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:am|pm)?/ig, '')
    .replace(/\btime\s*[:\-]?\s*\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:am|pm)?/ig, '')
    .replace(/\bamt(?:ount)?\s*[:\-]?\s*/ig, '')
    .replace(/[₦#]\s*[\d,]+(?:\.\d{1,2})?/g, '')
    .replace(/\bN\s*[\d,]+(?:\.\d{1,2})?/g, '')
    .replace(/acct(?:ount)?\s*(?:no\.?)?\s*[:\-][^,|]*/ig, '')
    .replace(/\b(debit|credit)\s*alert\b/ig, '')
    .replace(/\bavail(?:able)?\b/ig, '')
    .replace(/\|\|/g, ' ')
    .replace(/\b(ref|refno|ref no)\s*[:\-]?\s*[a-z0-9]{6,}/ig, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*(?:gtb|gtbank|kuda|opay|palmpay|paycom|moniepoint|access|uba|zenith|first bank|fidelity|sterling|wema|fcmb|union bank|stanbic|jaiz|taj ?bank|providus)\s*[:\-]\s*/i, '')
    .replace(/^\s*(?:you\s+)?(?:debit(?:ed)?|credit(?:ed)?|txn|transaction)\s+(?:of\s+|alert\s+)?/i, '')
    .replace(/\s+\b(on|at|of|in|for)\b\s*[.,]?\s*$/i, '')
    .replace(/\s+([.,])/g, '$1')
    .replace(/^[\s:\-–,.]+|[\s:\-–,]+$/g, '')
    .trim()
    .slice(0, 120);
}

function extractDesc(line) {
  const m = line.match(/(?:desc(?:ription)?|narration|details?|remark)s?\s*[:\-]\s*(.+)$/i);
  if (m) return { text: cleanDesc(m[1]) || 'Bank transaction', matched: true };
  const ref = line.match(/\bref(?:erence)?\s*[:\-]\s*(.+)$/i);
  if (ref) return { text: cleanDesc(ref[1]) || 'Bank transaction', matched: true };
  return { text: cleanDesc(line) || 'Bank transaction', matched: false };
}

/* ---------------- routes ---------------- */

router.post('/parse', wrap((req, res) => {
  const text = normalizeText(String(req.body?.text || '')).slice(0, 50000);
  const cats = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(req.user.id);
  const byNorm = new Map(cats.map((c) => [norm(c.name), c]));
  const fallbackCatId = (type) => (byNorm.get(type === 'income' ? 'otherincome' : 'others')?.id
    || cats.find((c) => c.type === type)?.id);

  const lines = text.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  const today = todayISO();
  const items = [];

  for (const line of lines) {
    const amounts = parseAmounts(line);
    const amt = amounts.find((a) => !a.isBal);
    if (!amt) continue; // nothing usable on this line (e.g. balance-only)

    const isCredit = CREDIT_RE.test(line);
    const isDebit = DEBIT_RE.test(line);
    const type = isCredit && !isDebit ? 'income' : 'expense';
    const { date, found: dateFound } = findDate(line, today);
    const desc = extractDesc(line);
    const catName = guessCategoryName(line, type);
    const cat = byNorm.get(norm(catName));

    let confidence = 0.3;
    if (cat) confidence += 0.3;
    if (dateFound) confidence += 0.2;
    if (isCredit || isDebit) confidence += 0.2;
    if (desc.matched) confidence += 0.05;

    items.push({
      type,
      amount: Math.round(amt.n * 100) / 100,
      date,
      description: desc.text,
      method: guessMethod(line),
      category_id: (cat || fallbackCatId(type))?.id,
      category_name: cat?.name || catName,
      confidence: Math.min(1, Math.round(confidence * 100) / 100),
      raw: line.slice(0, 160),
    });
  }

  res.json({ items, scanned: lines.length });
}));

router.post('/commit', wrap((req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 300) : [];
  const cats = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(req.user.id);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const METHODS = ['Transfer', 'Card', 'Cash', 'USSD', 'POS'];
  const ins = db.prepare('INSERT INTO transactions (user_id, type, amount, category_id, description, date, method) VALUES (?, ?, ?, ?, ?, ?, ?)');

  let imported = 0, skipped = 0;
  for (const it of items) {
    const type = it?.type === 'income' ? 'income' : it?.type === 'expense' ? 'expense' : null;
    const amount = Number(it?.amount);
    const cat = byId.get(Number(it?.category_id));
    const date = String(it?.date || '');
    if (!type || !cat || cat.type !== type || !Number.isFinite(amount) || amount <= 0 || !isValidDate(date)) {
      skipped++;
      continue;
    }
    const method = METHODS.includes(it?.method) ? it.method : 'Transfer';
    ins.run(req.user.id, type, Math.round(amount * 100) / 100, cat.id, String(it?.description || '').slice(0, 200), date, method);
    imported++;
  }
  res.json({ imported, skipped });
}));

export default router;
