import { Router } from 'express';
import { db } from '../db.js';
import { auth, wrap, bad, isValidDate, todayISO } from '../util.js';

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


/* ---------------- bank statement FILE parsing (CSV) ---------------- */

/** RFC4180-ish CSV parser: handles quoted fields with commas/newlines. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => String(f).trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => String(f).trim() !== '')) rows.push(row);
  return rows;
}

/** Parse the many date formats banks use. Returns ISO string or null. */
function parseDateValue(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 32) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    let d, mo;
    if (a > 12) { d = a; mo = b; }        // definitely day-first
    else if (b > 12) { d = b; mo = a; }   // definitely month-first
    else { d = a; mo = b; }               // Nigerian banks default: day-first
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return iso(y, mo, d);
    return null;
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]([a-z]{3,9})[\s\-,]*(\d{2,4})$/i); // 01 Sep 2026
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    let y = +m[3]; if (y < 100) y += 2000;
    if (mo && +m[1] >= 1 && +m[1] <= 31) return iso(y, mo, +m[1]);
  }
  m = s.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s*(\d{2,4})$/i); // Sep 1, 2026
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    let y = +m[3]; if (y < 100) y += 2000;
    if (mo) return iso(y, mo, +m[2]);
  }
  return null;
}

/** Parse money values: "₦5,000.00", "NGN 2,500 DR", "(1,200.00)", "-450", "+9000". */
function parseMoney(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s || s === 'n/a' || s === '-' || s === 'nil') return null;
  let neg = false;
  if (s.includes('(') && s.includes(')')) neg = true;
  if (/^-/.test(s)) neg = true;
  const drcr = s.match(/\b(dr|cr)\b/);
  if (drcr && drcr[1] === 'dr') neg = true;
  s = s.replace(/[^0-9.]/g, '');
  if (!s || s === '.') return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0 || n > 1e12) return null;
  return { n: Math.round(n * 100) / 100, neg };
}

router.post('/file', wrap((req, res) => {
  const filename = String(req.body?.filename || 'statement');
  const content = String(req.body?.content || '');
  if (!content.trim()) return bad(res, 'That file looks empty.');
  if (content.length > 3_000_000) return bad(res, 'File too large — keep statements under 3 MB (export a shorter date range).');

  const cats = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(req.user.id);
  const byNorm = new Map(cats.map((c) => [norm(c.name), c]));
  const fallbackCatId = (type) => (byNorm.get(type === 'income' ? 'otherincome' : 'others')?.id || cats.find((c) => c.type === type)?.id);
  const today = todayISO();
  const dupCheck = db.prepare('SELECT 1 FROM transactions WHERE user_id = ? AND date = ? AND amount = ? AND type = ? LIMIT 1');

  const rows = parseCSV(content);
  if (!rows.length) return bad(res, 'Could not read any rows from that file.');
  if (rows.length > 501) { rows.length = 501; }

  // ---- column mapping: (a) by header names, else (b) by sniffing values ----
  const looksTexty = (row) => row.filter((c) => String(c).trim() !== '' && !parseDateValue(c) && parseMoney(c) === null).length >= Math.max(2, Math.ceil(row.length * 0.5));
  let map = null;
  let headerOffset = 0;

  if (rows.length > 1 && looksTexty(rows[0])) {
    const headers = rows[0].map((h) => String(h).trim());
    const find = (re) => headers.findIndex((h, i) => h && re.test(h));
    const used = new Set();
    const take = (re) => { const i = find(re); if (i >= 0) { used.add(i); return i; } return -1; };
    const iDate = take(/\bdate\b|posted|value\s*d/i);
    const iType = take(/^(type|dr\s*\/\s*cr|d\/c|indicator|direction)$/i);
    const iBal = take(/balanc|^bal\b/i);
    let iDebit = -1, iCredit = -1, iAmt = -1;
    if (iBal >= 0) used.add(iBal);
    iDebit = take(/debit|withdraw|paid\s*out|^dr$/i);
    iCredit = take(/credit|deposit|paid\s*in|^cr$/i);
    if (iDebit < 0 && iCredit < 0) iAmt = take(/^amount$|amount|amt\b|^value$|^naira$|^total$/i);
    const iDesc = headers.findIndex((h, i) => !used.has(i) && /narration|descri|detail|remark|memo|particular|payee|info/i.test(h));
    if (iDesc >= 0) used.add(iDesc);
    if (iDate >= 0 && (iAmt >= 0 || iDebit >= 0 || iCredit >= 0)) {
      map = { iDate, iAmt, iDebit, iCredit, iType, iDesc, headers };
      headerOffset = 1;
    }
  }

  if (!map) {
    // positional sniffing across all rows: most date-like col = date, most
    // money-like col = amount (earliest on tie, so "amount" beats "balance"),
    // longest average text col = description
    const sample = rows.slice(0, 200);
    const width = Math.max(...sample.map((r) => r.length));
    let best = { date: -1, dateN: 0, amt: -1, amtN: 0, desc: -1, descLen: 0 };
    for (let c = 0; c < width; c++) {
      let dateN = 0, amtN = 0, textLen = 0, textN = 0;
      for (const r of sample) {
        const v = String(r[c] ?? '').trim();
        if (!v) continue;
        if (parseDateValue(v)) dateN++;
        if (parseMoney(v)) amtN++;
        textLen += v.length; textN++;
      }
      const avg = textN ? textLen / textN : 0;
      if (dateN > best.dateN && dateN >= sample.length * 0.5) best = { ...best, date: c, dateN };
      if (c !== best.date && amtN > best.amtN && amtN >= sample.length * 0.5) best = { ...best, amt: c, amtN };
      if (c !== best.date && c !== best.amt && avg > best.descLen && textN >= sample.length * 0.5) best = { ...best, desc: c, descLen: avg };
    }
    if (best.date >= 0 && best.amt >= 0) {
      map = { iDate: best.date, iAmt: best.amt, iDebit: -1, iCredit: -1, iType: -1, iDesc: best.desc, headers: [] };
    }
  }

  const items = [];
  if (map) {
    for (const row of rows.slice(headerOffset)) {
      const cell = (i) => (i >= 0 && i < row.length ? String(row[i] ?? '').trim() : '');
      const date = parseDateValue(cell(map.iDate));
      if (!date) continue;
      const raw = row.join(' | ');
      let type = null, money = null;
      if (map.iType >= 0) {
        const t = cell(map.iType).toLowerCase();
        if (/\bdr\b|debit/.test(t)) type = 'expense';
        else if (/\bcr\b|credit/.test(t)) type = 'income';
      }
      if (map.iDebit >= 0 || map.iCredit >= 0) {
        const d = parseMoney(cell(map.iDebit));
        const c = parseMoney(cell(map.iCredit));
        if (d) { type = 'expense'; money = d; }
        else if (c) { type = 'income'; money = c; }
      } else if (map.iAmt >= 0) {
        const a = parseMoney(cell(map.iAmt));
        if (a) { money = a; if (!type) type = a.neg ? 'expense' : 'income'; }
      }
      if (!type) type = /\bcr\b|credit|salary|refund/i.test(cell(map.iDesc)) ? 'income' : 'expense';
      if (!money) continue;
      const descSrc = cell(map.iDesc) || raw;
      const desc = cleanDesc(descSrc).slice(0, 120) || 'Statement entry';
      const catName = guessCategoryName(`${desc} ${raw}`, type);
      const cat = byNorm.get(norm(catName));
      items.push({
        type, amount: money.n, date, description: desc, method: guessMethod(raw),
        category_id: (cat || fallbackCatId(type))?.id,
        category_name: cat?.name || catName,
        confidence: 0.85,
        dup: !!dupCheck.get(req.user.id, date, money.n, type),
        raw: descSrc.slice(0, 160),
      });
      if (items.length >= 500) break;
    }
  }

  // fallback: not tabular at all → try it as one bank alert per line (.txt exports, SMS dumps)
  if (!items.length) {
    for (const line of content.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 300)) {
      const amounts = parseAmounts(normalizeText(line));
      const amt = amounts.find((a) => !a.isBal);
      if (!amt) continue;
      const isCredit = CREDIT_RE.test(line);
      const isDebit = DEBIT_RE.test(line);
      const type = isCredit && !isDebit ? 'income' : 'expense';
      const { date } = findDate(line, today);
      const desc = extractDesc(line);
      const catName = guessCategoryName(line, type);
      const cat = byNorm.get(norm(catName));
      items.push({
        type, amount: amt.n, date, description: desc.text, method: guessMethod(line),
        category_id: (cat || fallbackCatId(type))?.id,
        category_name: cat?.name || catName,
        confidence: 0.7,
        dup: !!dupCheck.get(req.user.id, date, amt.n, type),
        raw: line.slice(0, 160),
      });
    }
  }

  if (!items.length) {
    return bad(res, 'No transactions could be read from that file. Export a CSV from your bank app (it should have Date, Description/Narration and Amount columns) and try again.');
  }

  const mapped = map && map.headers.length
    ? Object.entries({ date: map.iDate, description: map.iDesc, amount: map.iAmt, debit: map.iDebit, credit: map.iCredit, 'dr/cr': map.iType })
        .filter(([, i]) => i >= 0)
        .map(([k, i]) => `${k} → "${map.headers[i]}"`)
        .join(' · ')
    : null;

  res.json({ items, scanned: rows.length - headerOffset, mapped });
}));

export default router;
