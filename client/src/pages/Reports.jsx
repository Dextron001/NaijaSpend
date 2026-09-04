import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmt0 } from '../format.js';
import { Loading, ErrorNote } from '../components/ui.jsx';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="chart-tip-row">
          <span className="dot" style={{ background: p.color }} />
          <span>{p.name}:</span>&nbsp;<strong>{fmt0(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/reports?months=12').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading label="Building your reports…" />;

  const chartData = data.series.map((s) => ({ label: s.label, Income: Math.round(s.income), Spending: Math.round(s.expense) }));
  const ratePct = data.avgRate === null ? '—' : `${Math.round(data.avgRate * 100)}%`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Reports</h2>
          <p className="page-sub">The long view — last 12 months of your money</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <span className="stat-label">Avg monthly income</span>
          <div className="stat-value" style={{ color: '#16a34a' }}>{fmt0(data.avgIncome)}</div>
          <div className="stat-foot">across {data.activeMonths} active month{data.activeMonths === 1 ? '' : 's'}</div>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg monthly spending</span>
          <div className="stat-value" style={{ color: '#d92d20' }}>{fmt0(data.avgExpense)}</div>
          <div className="stat-foot">your typical burn rate</div>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Avg savings rate</span>
          <div className="stat-value">{ratePct}</div>
          <div className="stat-foot">{data.avgRate !== null && data.avgRate >= 0.2 ? 'above the 20% target 🎯' : 'target: 20%+'}</div>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Best savings month</span>
          <div className="stat-value sm" style={{ marginTop: 9 }}>{data.bestMonth ? data.bestMonth.label : '—'}</div>
          <div className="stat-foot">{data.bestMonth ? `${Math.round(data.bestMonth.rate * 100)}% of income kept` : 'no income logged yet'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Income vs spending — 12 months</h3>
          <span className="card-hint">all-time: {fmt0(data.allTime.income)} in · {fmt0(data.allTime.expense)} out</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1ef" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#5f6f66' }} interval={0} angle={-32} textAnchor="end" height={52} />
            <YAxis tickFormatter={(v) => new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(v)} tickLine={false} axisLine={false} width={54} tick={{ fontSize: 11, fill: '#5f6f66' }} />
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(10,125,67,.06)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Income" fill="#16a34a" radius={[5, 5, 0, 0]} />
            <Bar dataKey="Spending" fill="#f5a524" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card table-card">
        <div className="card-head" style={{ padding: '12px 12px 0' }}><h3>Month by month</h3></div>
        <table className="table">
          <thead>
            <tr><th>Month</th><th className="num">Income</th><th className="num">Spending</th><th className="num">Net</th><th className="num">Savings rate</th></tr>
          </thead>
          <tbody>
            {[...data.series].reverse().map((s) => (
              <tr key={s.key} className={s.income === 0 && s.expense === 0 ? 'row-muted' : ''}>
                <td className="nowrap" style={{ fontWeight: 600 }}>{s.label}</td>
                <td className="num tx-amount income">{fmt0(s.income)}</td>
                <td className="num tx-amount expense">{fmt0(s.expense)}</td>
                <td className={`num tx-amount ${s.net >= 0 ? 'income' : 'expense'}`}>{fmt0(s.net)}</td>
                <td className="num">
                  {s.rate === null ? <span className="muted">—</span> : (
                    <span className={`badge ${s.rate >= 0.2 ? 'badge-green' : s.rate >= 0 ? 'badge-soft' : 'badge-red'}`}>
                      {Math.round(s.rate * 100)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card table-card">
        <div className="card-head" style={{ padding: '12px 12px 0' }}>
          <h3>Spending by category</h3>
          <span className="card-hint">last 6 months</span>
        </div>
        {data.categories.length === 0 ? <p className="muted" style={{ padding: 14 }}>No expenses in this window yet.</p> : (
          <table className="table matrix-table">
            <thead>
              <tr>
                <th>Category</th>
                {data.matrixLabels.map((m) => <th key={m} className="num">{m.split(' ')[0]}</th>)}
                <th className="num">Total</th>
                <th className="num">Avg/mo</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.id}>
                  <td><span className="cat-badge" style={{ background: c.color + '14', color: c.color }}>{c.icon} {c.name}</span></td>
                  {data.matrixKeys.map((k) => (
                    <td key={k} className="num muted">{c.values[k] ? fmt0(c.values[k]) : '·'}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 700 }}>{fmt0(c.total)}</td>
                  <td className="num muted">{fmt0(c.avg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
