import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { todayISO } from '../format.js';
import { Modal, ErrorNote } from './ui.jsx';
import { txChanged } from './Layout.jsx';

const METHODS = ['Transfer', 'Card', 'Cash', 'USSD', 'POS'];

export default function TxModal({ open, onClose, edit = null, onSaved }) {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('Transfer');
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    api('/categories').then((d) => {
      setCategories(d.categories);
      if (edit) {
        setType(edit.type);
        setAmount(String(edit.amount));
        setCategoryId(String(edit.category_id));
        setDescription(edit.description || '');
        setDate(edit.date);
        setMethod(edit.method || 'Transfer');
      } else {
        setType('expense');
        setAmount('');
        setCategoryId('');
        setDescription('');
        setDate(todayISO());
        setMethod('Transfer');
      }
    }).catch((e) => setError(e.message));
  }, [open, edit]);

  const options = categories.filter((c) => c.type === type);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount.');
    if (!categoryId) return setError('Pick a category.');
    setSaving(true);
    try {
      const body = { type, amount: Number(amount), category_id: Number(categoryId), description, date, method };
      if (edit) await api(`/transactions/${edit.id}`, { method: 'PUT', body });
      else await api('/transactions', { method: 'POST', body });
      txChanged();
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Edit Transaction' : 'Add Transaction'}>
      <form onSubmit={save} className="form">
        <div className="segmented">
          <button type="button" className={`seg ${type === 'expense' ? 'seg-expense active' : ''}`} onClick={() => { setType('expense'); setCategoryId(''); }}>− Expense</button>
          <button type="button" className={`seg ${type === 'income' ? 'seg-income active' : ''}`} onClick={() => { setType('income'); setCategoryId(''); }}>+ Income</button>
        </div>

        <label className="field">
          <span>Amount (₦)</span>
          <input className="input amount-input" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Category</span>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="" disabled>Choose…</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <input className="input" placeholder={type === 'expense' ? 'e.g. Shoprite Ikeja' : 'e.g. Monthly salary'} value={description}
            onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </label>

        <label className="field">
          <span>Payment method</span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <ErrorNote>{error}</ErrorNote>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : edit ? 'Save changes' : 'Add transaction'}</button>
        </div>
      </form>
    </Modal>
  );
}
