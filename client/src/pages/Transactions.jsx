import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { currentMonth, fmtSmart, fmt0, fmtDateShort } from '../format.js';
import { Loading, EmptyState, ErrorNote } from '../components/ui.jsx';
import { useTxModal } from '../components/Layout.jsx';
import ImportModal from '../components/ImportModal.jsx';
import { IconSearch, IconPencil, IconTrash, IconDownload, IconChevronLeft, IconChevronRight, IconPlus } from '../components/Icons.jsx';

export default function Transactions() {
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const { openTx } = useTxModal();

  const load = useCallback(() => {
    const params = new URLSearchParams({ month, page: String(page), pageSize: '15' });
    if (type) params.set('type', type);
    if (categoryId) params.set('category_id', categoryId);
    if (q) params.set('q', q);
    api('/transactions?' + params).then(setData).catch((e) => setError(e.message));
  }, [month, type, categoryId, q, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [month, type, categoryId, q]);
  useEffect(() => { api('/categories').then((d) => setCategories(d.categories)).catch(() => { }); }, []);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('tx-changed', h);
    return () => window.removeEventListener('tx-changed', h);
  }, [load]);
  useEffect(() => {
    const h = () => { setNotice('✅ Imported transactions added to your ledger.'); setTimeout(() => setNotice(''), 6000); };
    window.addEventListener('tx-changed', h);
    return () => window.removeEventListener('tx-changed', h);
  }, []);

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.description || t.category_name}" (${fmtSmart(t.amount)})?`)) return;
    try { await api('/transactions/' + t.id, { method: 'DELETE' }); load(); }
    catch (e) { setError(e.message); }
  };

  const exportCsv = async () => {
    try {
      const token = localStorage.getItem('ns_token');
      const res = await fetch('/api/export', { headers: { Authorization: 'Bearer ' + token } });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'naijaspend-transactions.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setError('Export failed: ' + e.message); }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const net = data ? data.income - data.expense : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Transactions</h2>
          <p className="page-sub">Every Naira, accounted for</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>📥 Import alerts</button>
          <button className="btn btn-ghost" onClick={exportCsv}><IconDownload size={15} /> Export CSV</button>
          <button className="btn btn-primary" onClick={() => openTx()}><IconPlus size={16} /> Add</button>
        </div>
      </div>

      <div className="filter-bar card">
        <input className="input" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} />
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <div className="search-wrap">
          <IconSearch size={15} />
          <input className="input" placeholder="Search description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {data && (
        <div className="sum-chips">
          <span className="chip chip-in">In {fmt0(data.income)}</span>
          <span className="chip chip-out">Out {fmt0(data.expense)}</span>
          <span className={`chip ${net >= 0 ? 'chip-in' : 'chip-out'}`}>Net {fmt0(net)}</span>
          <span className="chip">{data.total} transaction{data.total === 1 ? '' : 's'}</span>
        </div>
      )}

      {notice && <div className="form-msg">{notice}</div>}
      <ErrorNote>{error}</ErrorNote>

      {!data ? <Loading label="Loading transactions…" /> : data.items.length === 0 ? (
        <div className="card"><EmptyState icon="🔍" title="No transactions found" body="Try a different month or filter — or add your first transaction." /></div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th className="hide-mobile">Method</th><th className="num">Amount</th><th /></tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id}>
                  <td className="muted nowrap">{fmtDateShort(t.date)}</td>
                  <td className="tx-desc-cell">{t.description || <span className="muted">—</span>}</td>
                  <td>
                    <span className="cat-badge" style={{ background: t.category_color + '14', color: t.category_color }}>
                      {t.category_icon} {t.category_name}
                    </span>
                  </td>
                  <td className="muted hide-mobile">{t.method}</td>
                  <td className={`num tx-amount ${t.type}`}>{t.type === 'income' ? '+' : '−'}{fmtSmart(t.amount)}</td>
                  <td className="row-actions">
                    <button className="icon-btn" title="Edit" onClick={() => openTx(t)}><IconPencil size={15} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => remove(t)}><IconTrash size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="pager">
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><IconChevronLeft size={14} /> Prev</button>
              <span className="muted">Page {data.page} of {pages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <IconChevronRight size={14} /></button>
            </div>
          )}
        </div>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} categories={categories} />
    </div>
  );
}
