import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth, } from '../auth.jsx';
import { txChanged } from '../components/Layout.jsx';
import { Modal, ErrorNote } from '../components/ui.jsx';

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [categories, setCategories] = useState([]);
  const [catMsg, setCatMsg] = useState('');
  const [catErr, setCatErr] = useState('');
  const [newCat, setNewCat] = useState({ type: 'expense', name: '', icon: '🏷️', color: '#0a7d43' });
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadCats = () => api('/categories').then((d) => setCategories(d.categories)).catch(() => { });
  useEffect(() => { loadCats(); }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg('');
    try {
      const d = await api('/auth/me', { method: 'PUT', body: { name } });
      setUser(d.user);
      setProfileMsg('✅ Profile updated.');
    } catch (err) { setProfileMsg('⚠️ ' + err.message); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwErr(''); setPwMsg('');
    if (pw.next !== pw.confirm) return setPwErr('New passwords do not match.');
    try {
      await api('/auth/password', { method: 'PUT', body: { current: pw.current, next: pw.next } });
      setPwMsg('✅ Password changed.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) { setPwErr(err.message); }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    setCatErr(''); setCatMsg('');
    try {
      await api('/categories', { method: 'POST', body: newCat });
      setNewCat({ type: newCat.type, name: '', icon: '🏷️', color: '#0a7d43' });
      setCatMsg('✅ Category added.');
      loadCats();
    } catch (err) { setCatErr(err.message); }
  };

  const deleteCategory = async (c) => {
    setCatErr(''); setCatMsg('');
    try {
      await api('/categories/' + c.id, { method: 'DELETE' });
      loadCats();
    } catch (err) { setCatErr(err.message); }
  };

  const exportCsv = async () => {
    const token = localStorage.getItem('ns_token');
    const res = await fetch('/api/export', { headers: { Authorization: 'Bearer ' + token } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'naijaspend-transactions.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const runConfirm = async () => {
    setBusy(true);
    try {
      if (confirm === 'wipe') {
        await api('/auth/data', { method: 'DELETE' });
        txChanged();
        setConfirm(null);
        window.location.reload();
      }
    } catch (err) { setCatErr(err.message); setConfirm(null); } finally { setBusy(false); }
  };

  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p className="page-sub">Profile, categories and your data</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>👤 Profile</h3></div>
          <form onSubmit={saveProfile} className="form">
            <label className="field"><span>Full name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </label>
            <label className="field"><span>Email</span>
              <input className="input" value={user?.email || ''} disabled />
            </label>
            <label className="field"><span>Currency</span>
              <input className="input" value="₦ Nigerian Naira (NGN)" disabled />
            </label>
            {profileMsg && <p className="form-msg">{profileMsg}</p>}
            <button className="btn btn-primary btn-sm self-start">Save profile</button>
          </form>
        </div>

        <div className="card">
          <div className="card-head"><h3>🔒 Change password</h3></div>
          <form onSubmit={savePassword} className="form">
            <label className="field"><span>Current password</span>
              <input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
            </label>
            <div className="field-row">
              <label className="field"><span>New password</span>
                <input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={6} />
              </label>
              <label className="field"><span>Confirm new</span>
                <input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={6} />
              </label>
            </div>
            <ErrorNote>{pwErr}</ErrorNote>
            {pwMsg && <p className="form-msg">{pwMsg}</p>}
            <button className="btn btn-primary btn-sm self-start">Update password</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>🏷️ Categories</h3><span className="card-hint">used when logging transactions</span></div>
        <div className="cat-cols">
          <div>
            <h4 className="cat-col-title">Expenses</h4>
            <div className="cat-list">
              {expenseCats.map((c) => (
                <span key={c.id} className="cat-badge big" style={{ background: c.color + '14', color: c.color }}>
                  {c.icon} {c.name}
                  <button className="cat-x" title="Delete" onClick={() => deleteCategory(c)}>×</button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="cat-col-title">Income</h4>
            <div className="cat-list">
              {incomeCats.map((c) => (
                <span key={c.id} className="cat-badge big" style={{ background: c.color + '14', color: c.color }}>
                  {c.icon} {c.name}
                  <button className="cat-x" title="Delete" onClick={() => deleteCategory(c)}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <form onSubmit={addCategory} className="cat-add">
          <select className="input" value={newCat.type} onChange={(e) => setNewCat({ ...newCat, type: e.target.value })}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <input className="input emoji-input" value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value.slice(0, 4) })} title="Emoji" />
          <input className="input" placeholder="Category name" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} required minLength={2} />
          <input type="color" className="color-input" value={newCat.color} onChange={(e) => setNewCat({ ...newCat, color: e.target.value })} title="Colour" />
          <button className="btn btn-soft btn-sm">Add category</button>
        </form>
        <ErrorNote>{catErr}</ErrorNote>
        {catMsg && <p className="form-msg">{catMsg}</p>}
        <p className="hp-note">Categories used by existing transactions can't be deleted — that keeps your history intact.</p>
      </div>

      <div className="card">
        <div className="card-head"><h3>🗄️ Your data</h3></div>
        <div className="data-actions">
          <button className="btn btn-ghost" onClick={exportCsv}>⬇️ Export transactions (CSV)</button>
          <button className="btn btn-danger-ghost" onClick={() => setConfirm('wipe')}>🗑️ Delete all my data</button>
        </div>
        <p className="hp-note">Your ledger lives only on the server running NaijaSpend. Export a CSV any time from here or the Transactions page.</p>
      </div>

      <div className="card about-card">
        <b>NaijaSpend</b> · personal finance tracker with AI insights · your data stays on the server you run it on.
        Optional: set an <code>OPENAI_API_KEY</code> environment variable on the server to upgrade the assistant chat from the built-in rules engine to an LLM.
        <button className="btn btn-ghost btn-sm self-end" onClick={logout}>Log out</button>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete all data?">
        <p>This permanently deletes all your transactions, budgets and goals. This cannot be undone.</p>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={runConfirm} disabled={busy}>
            {busy ? 'Working…' : 'Yes, delete everything'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
