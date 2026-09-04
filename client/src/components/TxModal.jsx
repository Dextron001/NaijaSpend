import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { todayISO } from '../format.js';
import { Modal, ErrorNote } from './ui.jsx';
import { txChanged } from './Layout.jsx';

const METHODS = ['Transfer', 'Card', 'Cash', 'USSD', 'POS'];

/** Downscale an image file in the browser so uploads stay small (~100–300 KB). */
function compressImage(file, maxDim = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

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
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    setUploading(false);
    setReceiptUrl(edit?.receipt ? `/api/receipts/${edit.id}?token=${encodeURIComponent(localStorage.getItem('ns_token') || '')}&v=${Date.now()}` : null);
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

  const onReceiptFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !edit) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await compressImage(file);
      const d = await api(`/transactions/${edit.id}/receipt`, { method: 'PUT', body: { dataUrl } });
      setReceiptUrl(`/api/receipts/${edit.id}?token=${encodeURIComponent(localStorage.getItem('ns_token') || '')}&v=${Date.now()}`);
      edit.receipt = d.receipt;
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeReceipt = async () => {
    if (!edit) return;
    setUploading(true);
    setError('');
    try {
      await api(`/transactions/${edit.id}/receipt`, { method: 'DELETE' });
      setReceiptUrl(null);
      edit.receipt = null;
      txChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
  const viewReceipt = async () => {
    try {
      const token = localStorage.getItem('ns_token');
      const res = await fetch(`/api/receipts/${edit.id}`, { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('Could not load the receipt.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setError(err.message); }
  };

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

        {edit ? (
          <div className="field">
            <span>Receipt</span>
            {receiptUrl ? (
              <div className="receipt-preview">
                <img src={receiptUrl} alt="Receipt" onClick={viewReceipt} title="Click to view full size" />
                <div className="receipt-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={viewReceipt}>View</button>
                  <button type="button" className="btn btn-danger-ghost btn-sm" onClick={removeReceipt} disabled={uploading}>Remove</button>
                </div>
              </div>
            ) : (
              <div className="receipt-upload">
                <input type="file" accept="image/*" hidden id="receipt-file-input" onChange={onReceiptFile} />
                <button type="button" className="btn btn-soft btn-sm" disabled={uploading}
                  onClick={() => document.getElementById('receipt-file-input')?.click()}>
                  {uploading ? 'Uploading…' : '📎 Attach photo'}
                </button>
                <span className="muted receipt-hint">JPEG/PNG — compressed automatically</span>
              </div>
            )}
          </div>
        ) : (
          <p className="hp-note">📎 You can attach a receipt after saving — just edit the transaction.</p>
        )}

        <ErrorNote>{error}</ErrorNote>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : edit ? 'Save changes' : 'Add transaction'}</button>
        </div>
      </form>
    </Modal>
  );
}
