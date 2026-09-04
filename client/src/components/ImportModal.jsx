import { useState } from 'react';
import { api } from '../api.js';
import { todayISO, fmtSmart } from '../format.js';
import { Modal, ErrorNote, Spinner } from './ui.jsx';
import { txChanged } from './Layout.jsx';

const SAMPLE = `GTB: Debit Alert || Acct: 0123**** Chidi O || Amt: N5,000.00 || Desc: TRANSFER TO MUSA IBRAHIM || Date: 01/09/2026 || Bal: N50,000
Kuda: You debited NGN 2,500.00 on 03/09/2026 at 10:23. Narration: POS/SHOPRITE IKEJA
Credit Alert: NGN 505,000.00 from LUMINA TECH LTD Desc: SALARY Date: 01/09/2026
OPay: Debit of NGN 4,000 for MTN data subscription on 04/09/2026. Bal: N1,200`;

export default function ImportModal({ open, onClose, categories }) {
  const [text, setText] = useState('');
  const [items, setItems] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const parse = async () => {
    setError('');
    setResult(null);
    if (!text.trim()) return setError('Paste your bank alerts first — one alert per line.');
    setParsing(true);
    try {
      const d = await api('/import/parse', { method: 'POST', body: { text } });
      if (!d.items.length) {
        setItems(null);
        setError('No transactions detected. Make sure each alert line includes an amount (e.g. N5,000.00).');
      } else {
        setItems(d.items.map((it) => ({ ...it, selected: true })));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  };

  const patch = (i, fields) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...fields } : it)));

  const switchType = (i) => {
    const it = items[i];
    const nextType = it.type === 'expense' ? 'income' : 'expense';
    const opts = categories.filter((c) => c.type === nextType);
    const keep = opts.find((c) => c.id === it.category_id);
    const fallback = opts.find((c) => (nextType === 'income' ? /other income/i.test(c.name) : /others/i.test(c.name))) || opts[0];
    patch(i, { type: nextType, category_id: (keep || fallback)?.id });
  };

  const commit = async () => {
    const selected = items.filter((it) => it.selected);
    if (!selected.length) return setError('Select at least one alert to import.');
    setImporting(true);
    setError('');
    try {
      const d = await api('/import/commit', {
        method: 'POST',
        body: {
          items: selected.map(({ type, amount, category_id, description, date, method }) => ({ type, amount, category_id, description, date, method })),
        },
      });
      setResult(d);
      setItems(null);
      setText('');
      txChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = items ? items.filter((i) => i.selected).length : 0;
  const confClass = (c) => (c >= 0.75 ? 'hi' : c >= 0.5 ? 'mid' : 'low');

  return (
    <Modal open={open} onClose={onClose} title="Import bank alerts" width={720}>
      {result ? (
        <div className="import-done">
          <div className="empty-icon">✅</div>
          <h4>Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}</h4>
          {result.skipped > 0 && <p className="muted">{result.skipped} line{result.skipped > 1 ? 's were' : ' was'} skipped (invalid or missing category).</p>}
          <div className="form-actions">
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <>
          <p className="hp-note" style={{ marginBottom: 12 }}>
            Paste debit/credit alert texts from GTBank, Kuda, OPay, Access, Moniepoint etc. — <b>one alert per line</b>.
            NaijaSpend detects the amount, type, date and narration, and <b>auto-suggests a category</b> for each. Review, tweak, then import.
          </p>
          <textarea
            className="input import-textarea"
            rows={6}
            placeholder={SAMPLE}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="import-toolbar">
            <button className="link-btn" onClick={() => setText(SAMPLE)}>Use sample alerts</button>
            <button className="btn btn-soft btn-sm" onClick={parse} disabled={parsing || !text.trim()}>
              {parsing ? <><Spinner size={14} /> Parsing…</> : '🔍 Detect transactions'}
            </button>
          </div>

          <ErrorNote>{error}</ErrorNote>

          {items && (
            <>
              <div className="import-list">
                {items.map((it, i) => (
                  <div key={i} className={`import-row ${it.selected ? '' : 'off'}`}>
                    <input type="checkbox" checked={it.selected} onChange={(e) => patch(i, { selected: e.target.checked })} title="Include" />
                    <span className={`conf-dot ${confClass(it.confidence)}`} title={`Match confidence: ${Math.round(it.confidence * 100)}%`} />
                    <div className="ir-main">
                      <input className="input ir-desc" value={it.description} onChange={(e) => patch(i, { description: e.target.value })} />
                      <div className="ir-sub">
                        <span className={`chip ${it.type === 'income' ? 'chip-in' : 'chip-out'}`}>{it.type}</span>
                        <button type="button" className="link-btn" onClick={() => switchType(i)}>switch</button>
                        <span className="muted">· {it.method}</span>
                        <input className="input ir-date" type="date" value={it.date} max={todayISO()} onChange={(e) => patch(i, { date: e.target.value })} />
                      </div>
                    </div>
                    <select className="input ir-cat" value={it.category_id} onChange={(e) => patch(i, { category_id: Number(e.target.value) })}>
                      {categories.filter((c) => c.type === it.type).map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                    <div className={`ir-amt ${it.type}`}>{it.type === 'income' ? '+' : '−'}{fmtSmart(it.amount)}</div>
                  </div>
                ))}
              </div>
              <div className="form-actions">
                <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>{selectedCount} selected</span>
                <button className="btn btn-primary" onClick={commit} disabled={importing || !selectedCount}>
                  {importing ? 'Importing…' : `Import ${selectedCount} transaction${selectedCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
