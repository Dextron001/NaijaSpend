import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmt0, fmtDate } from '../format.js';
import { Loading, EmptyState, Modal, ErrorNote } from '../components/ui.jsx';
import { txChanged } from '../components/Layout.jsx';
import { IconPlus, IconPencil, IconTrash, IconPause, IconPlay, IconRepeat } from '../components/Icons.jsx';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const METHODS = ['Transfer', 'Card', 'Cash', 'USSD', 'POS'];
const emptyForm = { type: 'expense', amount: '', category_id: '', description: '', method: 'Transfer', frequency: 'monthly', day: 1 };

export default function Recurring() {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api('/recurrences').then((d) => setItems(d.recurrences)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/categories').then((d) => setCategories(d.categories)).catch(() => { }); }, []);

  const options = categories.filter((c) => c.type === form.type);

  const openAdd = () => { setEdit(null); setForm(emptyForm); setError(''); setOpen(true); };
  const openEdit = (r) => {
    setEdit(r);
    setForm({
      type: r.type, amount: String(r.amount), category_id: String(r.category_id),
      description: r.description || '', method: r.method || 'Transfer',
      frequency: r.frequency, day: r.day,
    });
    setError('');
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        type: form.type,
        amount: Number(form.amount),
        category_id: Number(form.category_id),
        description: form.description,
        method: form.method,
        frequency: form.frequency,
        day: form.frequency === 'weekly' ? Number(form.day) : Number(form.day),
      };
      if (edit) await api('/recurrences/' + edit.id, { method: 'PUT', body });
      else await api('/recurrences', { method: 'POST', body });
      setOpen(false);
      load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const toggle = async (r) => {
    try { await api(`/recurrences/${r.id}/toggle`, { method: 'POST' }); load(); }
    catch (e) { setError(e.message); }
  };

  const runNow = async (r) => {
    try {
      await api(`/recurrences/${r.id}/run-now`, { method: 'POST' });
      txChanged();
      load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Stop tracking "${r.description || r.category_name}"? Past transactions are kept.`)) return;
    try { await api('/recurrences/' + r.id, { method: 'DELETE' }); load(); }
    catch (e) { setError(e.message); }
  };

  const activeCount = (items || []).filter((r) => r.active).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2><span className="ai-title-icon repeat-icon"><IconRepeat size={18} /></span> Recurring</h2>
          <p className="page-sub">Rent, salaries, subscriptions — logged automatically, {activeCount} active</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><IconPlus size={16} /> New recurring</button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="card info-strip">🔁 NaijaSpend logs these for you automatically — even catches up on missed periods (e.g. if you don't open the app for a week). New rules start from their <b>next</b> due date.</div>

      {!items ? <Loading label="Loading recurring rules…" /> : items.length === 0 ? (
        <div className="card">
          <EmptyState icon="🔁" title="Nothing on auto-pilot yet" body="Set up things you pay or earn regularly — house rent, Netflix, salary, tithe — and they'll be logged for you on schedule."
            action={<button className="btn btn-primary" onClick={openAdd}><IconPlus size={15} /> Create your first rule</button>} />
        </div>
      ) : (
        <div className="rec-grid">
          {items.map((r) => (
            <div key={r.id} className={`card rec-card ${r.active ? '' : 'rec-paused'}`}>
              <div className="rec-head">
                <span className="tx-icon" style={{ background: r.category_color + '1a', color: r.category_color }}>{r.category_icon}</span>
                <div className="rec-title">
                  <div className="tx-desc">{r.description || r.category_name}</div>
                  <div className="tx-sub">{r.category_name} · {r.schedule_label}</div>
                </div>
                <div className={`tx-amount ${r.type}`}>{r.type === 'income' ? '+' : '−'}{fmt0(r.amount)}</div>
              </div>
              <div className="rec-foot">
                {r.active
                  ? <span className="badge badge-soft">Next: {fmtDate(r.next_run)}</span>
                  : <span className="badge badge-red">Paused</span>}
                <span className="row-actions">
                  <button className="icon-btn" title="Log now" onClick={() => runNow(r)}>⚡</button>
                  <button className="icon-btn" title={r.active ? 'Pause' : 'Resume'} onClick={() => toggle(r)}>
                    {r.active ? <IconPause size={15} /> : <IconPlay size={15} />}
                  </button>
                  <button className="icon-btn" title="Edit" onClick={() => openEdit(r)}><IconPencil size={14} /></button>
                  <button className="icon-btn danger" title="Delete" onClick={() => remove(r)}><IconTrash size={14} /></button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Edit recurring rule' : 'New recurring rule'}>
        <form onSubmit={save} className="form">
          <div className="segmented">
            <button type="button" className={`seg ${form.type === 'expense' ? 'seg-expense active' : ''}`} onClick={() => setForm({ ...form, type: 'expense', category_id: '' })}>− Expense</button>
            <button type="button" className={`seg ${form.type === 'income' ? 'seg-income active' : ''}`} onClick={() => setForm({ ...form, type: 'income', category_id: '' })}>+ Income</button>
          </div>
          <label className="field"><span>Amount (₦)</span>
            <input className="input amount-input" inputMode="decimal" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="0.00" autoFocus required />
          </label>
          <div className="field-row">
            <label className="field"><span>Category</span>
              <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
                <option value="" disabled>Choose…</option>
                {options.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Method</span>
              <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label className="field"><span>Description</span>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={form.type === 'expense' ? 'e.g. House rent' : 'e.g. Monthly salary'} maxLength={200} />
          </label>
          <div className="field-row">
            <label className="field"><span>Frequency</span>
              <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value, day: e.target.value === 'weekly' ? 1 : 1 })}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            {form.frequency === 'monthly' ? (
              <label className="field"><span>Day of month (1–28)</span>
                <input className="input" type="number" min="1" max="28" value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value.replace(/\D/g, '').slice(0, 2) })} required />
              </label>
            ) : (
              <label className="field"><span>On weekday</span>
                <select className="input" value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>
                  {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
                </select>
              </label>
            )}
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
