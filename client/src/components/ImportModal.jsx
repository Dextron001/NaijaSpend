import { useRef, useState } from 'react';
import { api } from '../api.js';
import { todayISO, fmtSmart } from '../format.js';
import { Modal, ErrorNote, Spinner } from './ui.jsx';
import { txChanged } from './Layout.jsx';

const SAMPLE = `GTB: Debit Alert || Acct: 0123**** Chidi O || Amt: N5,000.00 || Desc: TRANSFER TO MUSA IBRAHIM || Date: 01/09/2026 || Bal: N50,000
Kuda: You debited NGN 2,500.00 on 03/09/2026 at 10:23. Narration: POS/SHOPRITE IKEJA
Credit Alert: NGN 505,000.00 from LUMINA TECH LTD Desc: SALARY Date: 01/09/2026
OPay: Debit of NGN 4,000 for MTN data subscription on 04/09/2026. Bal: N1,200`;

export default function ImportModal({ open, onClose, categories }) {
  const [tab, setTab] = useState('file');
  const [text, setText] = useState('');
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const [busyLabel, setBusyLabel] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef(null);

  const applyParsed = (d) => {
    setMeta(d.mapped ? `Columns detected — ${d.mapped}` : d.scanned ? `${d.scanned} row(s) scanned` : null);
    if (!d.items.length) {
      setItems(null);
      setError('No transactions detected in that content.');
    } else {
      setItems(d.items.map((it) => ({ ...it, selected: !it.dup })));
    }
  };

  const parseText = async () => {
    setError(''); setResult(null); setMeta(null);
    if (!text.trim()) return setError('Paste your bank alerts first — one alert per line.');
    setBusyLabel('Parsing…');
    try { applyParsed(await api('/import/parse', { method: 'POST', body: { text } })); }
    catch (e) { setError(e.message); }
    finally { setBusyLabel(''); }
  };

  const parseFileContent = async (filename, content) => {
    setError(''); setResult(null); setMeta(null);
    setBusyLabel('Reading statement…');
    try { applyParsed(await api('/import/file', { method: 'POST', body: { filename, content } })); }
    catch (e) { setError(e.message); }
    finally { setBusyLabel(''); }
  };

  const onFileChosen = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return setError('File too large (max 3 MB). Export a shorter date range from your bank app.');
    const reader = new FileReader();
    reader.onerror = () => setError('Could not read that file.');
    reader.onload = () => parseFileContent(file.name, String(reader.result || ''));
    reader.readAsText(file);
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
    if (!selected.length) return setError('Select at least one row to import.');
    setImporting(true); setError('');
    try {
      const d = await api('/import/commit', {
        method: 'POST',
        body: { items: selected.map(({ type, amount, category_id, description, date, method }) => ({ type, amount, category_id, description, date, method })) },
      });
      setResult(d); setItems(null); setText(''); setMeta(null);
      txChanged();
    } catch (e) { setError(e.message); }
    finally { setImporting(false); }
  };

  const freshCount = items ? items.filter((i) => i.selected && !i.dup).length : 0;
  const dupCount = items ? items.filter((i) => i.dup).length : 0;
  const confClass = (c) => (c >= 0.75 ? 'hi' : c >= 0.5 ? 'mid' : 'low');

  return (
    <Modal open={open} onClose={onClose} title="Import your bank statement" width={720}>
      {result ? (
        <div className="import-done">
          <div className="empty-icon">✅</div>
          <h4>Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}</h4>
          {result.skipped > 0 && <p className="muted">{result.skipped} row{result.skipped > 1 ? 's were' : ' was'} skipped (invalid or missing category).</p>}
          <div className="form-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <>
          <div className="import-tabs">
            <button type="button" className={`import-tab ${tab === 'file' ? 'active' : ''}`} onClick={() => { setTab('file'); setError(''); }}>📄 Upload statement</button>
            <button type="button" className={`import-tab ${tab === 'paste' ? 'active' : ''}`} onClick={() => { setTab('paste'); setError(''); }}>💬 Paste alerts</button>
          </div>

          {tab === 'file' ? (
            <>
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); onFileChosen(e.dataTransfer.files?.[0]); }}
                onClick={() => fileInput.current?.click()}
                role="button" tabIndex={0}
              >
                <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFileChosen(f); }} />
                {busyLabel ? (
                  <><Spinner /> <div className="dz-title">{busyLabel}</div></>
                ) : (
                  <>
                    <div className="dz-title">Drop your statement file here, or click to browse</div>
                    <div className="dz-sub">CSV or TXT export from your bank app — GTB, Kuda, OPay, Access, Moniepoint etc. (max 3 MB)</div>
                  </>
                )}
              </div>
              <p className="hp-note">In your bank app: <b>Statement → Export → CSV</b>, then drop the file here. Date, description and amount columns are detected automatically; anything already in your ledger is flagged as a duplicate and skipped unless you tick it.</p>
            </>
          ) : (
            <>
              <textarea
                className="input import-textarea"
                rows={6}
                placeholder={SAMPLE}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="import-toolbar">
                <button className="link-btn" onClick={() => setText(SAMPLE)}>Use sample alerts</button>
                <button className="btn btn-soft btn-sm" onClick={parseText} disabled={!!busyLabel || !text.trim()}>
                  {busyLabel ? <><Spinner size={14} /> {busyLabel}</> : '🔍 Detect transactions'}
                </button>
              </div>
            </>
          )}

          {meta && !error && <p className="form-msg">{meta}</p>}
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
                        {it.dup && <span className="badge badge-soft" title="A transaction with this date, amount and type already exists in your ledger">duplicate</span>}
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
                <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>
                  {freshCount} to import{dupCount ? ` · ${dupCount} duplicate${dupCount === 1 ? '' : 's'} unticked` : ''}
                </span>
                <button className="btn btn-primary" onClick={commit} disabled={importing || !freshCount}>
                  {importing ? 'Importing…' : `Import ${freshCount} transaction${freshCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
