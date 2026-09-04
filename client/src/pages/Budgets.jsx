import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { currentMonth, fmt0, monthLabel } from '../format.js';
import { Loading, EmptyState, Progress, Modal, ErrorNote } from '../components/ui.jsx';
import { useTxModal } from '../components/Layout.jsx';
import { IconPlus, IconPencil, IconTrash } from '../components/Icons.jsx';

export default function Budgets() {
  const [month, setMonth] = useState(currentMonth());
  const [budgets, setBudgets] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [catId, setCatId] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const { openTx } = useTxModal();

  const load = useCallback(() => {
    api('/budgets?month=' + month).then((d) => setBudgets(d.budgets)).catch((e) => setError(e.message));
  }, [month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/categories').then((d) => setCategories(d.categories.filter((c) => c.type === 'expense'))).catch(() => { }); }, []);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('tx-changed', h);
    return () => window.removeEventListener('tx-changed', h);
  }, [load]);

  const openAdd = () => { setEdit(null); setCatId(''); setAmount(''); setError(''); setModalOpen(true); };
  const openEdit = (b) => { setEdit(b); setCatId(String(b.category_id)); setAmount(String(b.amount)); setError(''); setModalOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!catId) return setError('Pick a category.');
    if (!Number(amount) || Number(amount) <= 0) return setError('Enter a valid amount.');
    setSaving(true);
    try {
      await api('/budgets', { method: 'POST', body: { category_id: Number(catId), amount: Number(amount), month } });
      setModalOpen(false);
      load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const remove = async (b) => {
    if (!window.confirm(`Remove the ${b.category_name} budget?`)) return;
    try { await api('/budgets/' + b.id, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
  };

  const totalBudget = (budgets || []).reduce((s, b) => s + b.amount, 0);
  const totalSpent = (budgets || []).reduce((s, b) => s + b.spent, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Budgets</h2>
          <p className="page-sub">{monthLabel(month)} · monthly limits per category</p>
        </div>
        <div className="head-actions">
          <input className="input month-input" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn btn-primary" onClick={openAdd}><IconPlus size={16} /> Budget</button>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {budgets && budgets.length > 0 && (
        <div className="card budget-summary">
          <div>
            <div className="stat-label">Total budgeted</div>
            <div className="stat-value sm">{fmt0(totalBudget)}</div>
          </div>
          <div>
            <div className="stat-label">Spent so far</div>
            <div className="stat-value sm">{fmt0(totalSpent)}</div>
          </div>
          <div>
            <div className="stat-label">Remaining</div>
            <div className="stat-value sm" style={{ color: totalBudget - totalSpent >= 0 ? '#0a7d43' : '#d92d20' }}>{fmt0(totalBudget - totalSpent)}</div>
          </div>
          <div className="budget-summary-bar">
            <Progress value={totalBudget > 0 ? totalSpent / totalBudget : 0} color={totalSpent > totalBudget ? '#d92d20' : '#0a7d43'} height={10} />
            <span className="muted">{totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0}% used</span>
          </div>
        </div>
      )}

      {!budgets ? <Loading label="Loading budgets…" /> : budgets.length === 0 ? (
        <div className="card">
          <EmptyState icon="🎯" title={`No budgets for ${monthLabel(month)}`} body="Budgets keep your spending honest. Set a limit for each category — NaijaSpend tracks progress automatically as you log transactions."
            action={<button className="btn btn-primary" onClick={openAdd}><IconPlus size={15} /> Create your first budget</button>} />
        </div>
      ) : (
        <div className="budget-grid">
          {budgets.map((b) => {
            const pct = b.amount > 0 ? b.spent / b.amount : 0;
            const color = pct >= 1 ? '#d92d20' : pct >= 0.75 ? '#f5a524' : '#0a7d43';
            return (
              <div key={b.id} className="card budget-card">
                <div className="budget-card-head">
                  <span className="budget-cat">{b.icon} {b.category_name}</span>
                  <span className="row-actions">
                    <button className="icon-btn" onClick={() => openEdit(b)}><IconPencil size={14} /></button>
                    <button className="icon-btn danger" onClick={() => remove(b)}><IconTrash size={14} /></button>
                  </span>
                </div>
                <div className="budget-nums">
                  <span className="budget-spent" style={{ color }}>{fmt0(b.spent)}</span>
                  <span className="muted"> of {fmt0(b.amount)}</span>
                </div>
                <Progress value={pct} color={color} height={10} />
                <div className="budget-foot">
                  {pct >= 1
                    ? <span className="badge badge-red">Over by {fmt0(b.spent - b.amount)}</span>
                    : <span className="badge badge-green">{fmt0(b.amount - b.spent)} left</span>}
                  <span className="muted">{Math.round(pct * 100)}% used</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="page-note">💡 Tip: log a transaction on the <button className="link-btn" onClick={() => openTx()}>Transactions page</button> and watch budgets update instantly.</p>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={edit ? 'Edit budget' : 'New budget'}>
        <form onSubmit={save} className="form">
          <label className="field">
            <span>Category</span>
            <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)} required disabled={!!edit}>
              <option value="" disabled>Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Monthly limit (₦)</span>
            <input className="input" inputMode="decimal" placeholder="e.g. 50000" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus required />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save budget'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
