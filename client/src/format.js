const ng0 = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const ng2 = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ngC = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 });

export const fmt0 = (n) => ng0.format(Number(n) || 0);
export const fmt2 = (n) => ng2.format(Number(n) || 0);
export const fmtSmart = (n) => (Number.isInteger(Number(n)) ? fmt0(n) : fmt2(n));
export const fmtCompact = (n) => ngC.format(Number(n) || 0);
export const fmtNum = (n) => new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Number(n) || 0);

export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fmtDateShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
};

export const monthLabel = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const todayISO = () => new Date().toISOString().slice(0, 10);
