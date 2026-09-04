import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmt0, fmtDate } from '../format.js';
import { Loading, EmptyState, Progress, Modal, ErrorNote } from '../components/ui.jsx';
import { IconPlus, IconPencil, IconTrash } from '../components/Icons.jsx';

const emptyForm = { name: '', target_amount: '', saved_amount: '', deadline: '', note: '' };

export default function Goals() {
  const [goals, setGoals] = useState(null);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [contrib, setContrib] = useState(null);
  const [contribAmt, setContribAmt] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api('/goals').then((d) => setGoals(d.goals)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEdit(null); setForm(emptyForm); setError(''); setModalOpen(true); };
  const openEdit = (g) => {
    setEdit(g);
    setForm({ name: g.name, target_amount: String(g.target_amount), saved_amount: String(g.saved_amount), deadline: g.deadline || '', note: g.note || '' });
    setError('');
    setModalOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        name: form.name,
        target_amount: Number(form.target_amount),
        saved_amount: Number(form.saved_amount || 0),
        deadline: form.deadline || null,
        note: form.note,
      };
      if (edit) await api('/goals/' + edit.id, { method: 'PUT', body });
      else await api('/goals', { method: 'POST', body });
      setModalOpen(false);
      load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const contribute = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/goals/${contrib.id}/contribute`, { method: 'POST', body: { amount: Number(contribAmt) } });
      setContrib(null); setContribAmt('');
      load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const remove = async (g) => {
    if (!window.confirm(`Delete goal "${g.name}"?`)) return;
    try { await api('/goals/' + g.id, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
  };

  const totalSaved = (goals || []).reduce((s, g) => s + g.saved_amount, 0);
  const totalTarget = (goals || []).reduce((s, g) => s + g.target_amount, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Savings Goals</h2>
          <p className="page-sub">Named savings beat vague intentions</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><IconPlus size={16} /> New goal</button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {goals && goals.length > 0 && (
        <div className="card budget-summary">
          <div><div className="stat-label">Total saved</div><div className="stat-value sm">{fmt0(totalSaved)}</div></div>
          <div><div className="stat-label">Combined target</div><div className="stat-value sm">{fmt0(totalTarget)}</div></div>
          <div><div className="stat-label">Overall progress</div><div className="stat-value sm">{totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0}%</div></div>
          <div className="budget-summary-bar"><Progress value={totalTarget ? totalSaved / totalTarget : 0} height={10} /></div>
        </div>
      )}

      {!goals ? <Loading label="Loading goals…" /> : goals.length === 0 ? (
        <div className="card">
          <EmptyState icon="🏁" title="No goals yet" body="Give your savings a name — “Emergency Fund”, “New Laptop”, “Japa money” — and watch the progress bar fill up."
            action={<button className="btn btn-primary" onClick={openAdd}><IconPlus size={15} /> Create your first goal</button>} />
        </div>
      ) : (
        <div className="goal-grid">
          {goals.map((g) => {
            const pct = Math.min(1, g.target_amount > 0 ? g.saved_amount / g.target_amount : 0);
            const done = pct >= 1;
            return (
              <div key={g.id} className={`card goal-card ${done ? 'goal-done' : ''}`}>
                <div className="goal-head">
                  <span className="goal-name">{done ? '🏆 ' : ''}{g.name}</span>
                  <span className="row-actions">
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(g)}><IconPencil size={14} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => remove(g)}><IconTrash size={14} /></button>
                  </span>
                </div>
                {g.note && <div className="goal-note">{g.note}</div>}
                <div className="goal-nums">
                  <span className="goal-saved">{fmt0(g.saved_amount)}</span>
                  <span className="muted"> of {fmt0(g.target_amount)}</span>
                </div>
                <Progress value={pct} color={done ? '#16a34a' : undefined} height={10} />
                <div className="goal-foot">
                  <span className={`badge ${done ? 'badge-green' : 'badge-soft'}`}>{Math.round(pct * 100)}% funded</span>
                  {g.deadline && <span className="muted">by {fmtDate(g.deadline)}</span>}
                </div>
                <button className="btn btn-soft btn-block" onClick={() => { setContrib(g); setContribAmt(''); }}>＋ Add money</button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={edit ? 'Edit goal' : 'New savings goal'}>
        <form onSubmit={save} className="form">
          <label className="field"><span>Goal name</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emergency Fund" required autoFocus />
          </label>
          <div className="field-row">
            <label className="field"><span>Target (₦)</span>
              <input className="input" inputMode="decimal" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="1000000" required />
            </label>
            <label className="field"><span>Already saved (₦)</span>
              <input className="input" inputMode="decimal" value={form.saved_amount} onChange={(e) => setForm({ ...form, saved_amount: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="0" />
            </label>
          </div>
          <div className="field-row">
            <label className="field"><span>Target date</span>
              <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </label>
            <label className="field"><span>Note</span>
              <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="optional" />
            </label>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save goal'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!contrib} onClose={() => setContrib(null)} title={`Add money — ${contrib?.name || ''}`}>
        <form onSubmit={contribute} className="form">
          <label className="field"><span>Amount (use a negative number to withdraw)</span>
            <input className="input" inputMode="decimal" value={contribAmt} onChange={(e) => setContribAmt(e.target.value.replace(/[^0-9.\-]/g, ''))} placeholder="e.g. 25000" autoFocus required />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setContrib(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add to goal'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
