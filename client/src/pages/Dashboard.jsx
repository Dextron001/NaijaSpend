import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { currentMonth, fmt0, fmtDateShort, fmtSmart } from '../format.js';
import { TrendChart, DonutChart } from '../components/charts.jsx';
import { Loading, EmptyState, Progress, Delta, ErrorNote } from '../components/ui.jsx';
import { useTxModal } from '../components/Layout.jsx';
import { IconPlus, IconSparkles, IconArrowUpRight, IconArrowDownRight } from '../components/Icons.jsx';

function StatCard({ label, value, delta, invert, tint, foot }) {
  return (
    <div className="card stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {delta !== undefined && <Delta value={delta} invert={invert} />}
      </div>
      <div className="stat-value" style={{ color: tint }}>{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [ins, setIns] = useState(null);
  const [error, setError] = useState('');
  const { openTx } = useTxModal();
  const navigate = useNavigate();

  const load = useCallback(() => {
    api('/dashboard?month=' + month).then(setData).catch((e) => setError(e.message));
    api('/insights?month=' + month).then((d) => setIns(d.insights)).catch(() => { });
  }, [month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('tx-changed', h);
    return () => window.removeEventListener('tx-changed', h);
  }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading label="Crunching your Naira…" />;

  const emptyAccount = data.counts.transactions < 3;

  const idx = data.series.findIndex((s) => s.key === month);
  const cur = data.series[idx] || {};
  const prevMonth = data.series[idx - 1];
  const delta = (a, b) => (b && b > 0 ? ((a - b) / b) * 100 : undefined);
  const donutData = data.categories.slice(0, 7).map((c) => ({ name: c.name, value: c.amount, color: c.color }));
  const otherTotal = data.categories.slice(7).reduce((s, c) => s + c.amount, 0);
  if (otherTotal > 0) donutData.push({ name: 'Others', value: otherTotal, color: '#cbd5d1' });
  const savingsRate = data.income > 0 ? (data.income - data.expense) / data.income : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p className="page-sub">{data.label}{idx === data.series.length - 1 ? ' · month in progress' : ''}</p>
        </div>
        <button className="btn btn-import" onClick={() => navigate('/transactions?import=1')}>📥 Import statement</button>
        <input className="input month-input" type="month" value={month} max={currentMonth()}
          onChange={(e) => setMonth(e.target.value)} aria-label="Choose month" />
      </div>

      {emptyAccount && (
        <div className="card empty-hero">
          <div className="empty-hero-text">
            <h3>Bring your money in</h3>
            <p>Upload your bank statement (CSV) or paste debit/credit alerts — NaijaSpend categorises everything and the AI starts analysing immediately.</p>
          </div>
          <div className="empty-hero-actions">
            <button className="btn btn-primary" onClick={() => navigate('/transactions?import=1')}>📥 Import statement</button>
            <button className="btn btn-ghost" onClick={() => openTx()}>Add manually</button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Money In" value={fmt0(data.income)} delta={delta(data.income, prevMonth?.income)} tint="#16a34a" foot="income this month" />
        <StatCard label="Money Out" value={fmt0(data.expense)} delta={delta(data.expense, prevMonth?.expense)} invert tint="#d92d20" foot="spending this month" />
        <StatCard label="Kept" value={fmt0(data.net)} tint={data.net >= 0 ? '#0a7d43' : '#d92d20'} foot={data.net >= 0 ? 'still with you' : 'overspent!'} />
        <StatCard label="Savings rate" value={savingsRate === null ? '—' : `${Math.round(savingsRate * 100)}%`} foot={savingsRate === null ? 'no income yet' : savingsRate >= 0.2 ? 'hitting the 20% target 🎯' : 'aim for 20%+'} />
      </div>

      {ins && (
        <Link to="/insights" className="ai-strip">
          <span className="ai-strip-icon"><IconSparkles size={18} /></span>
          <div className="ai-strip-text">
            <b>Naija AI:</b> {ins.summary}
          </div>
          <span className="ai-strip-cta">Open insights <IconArrowUpRight size={14} /></span>
        </Link>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Income vs spending</h3>
            <span className="card-hint">last 6 months</span>
          </div>
          <TrendChart data={data.series} />
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Where it went</h3>
            <span className="card-hint">{fmt0(data.expense)} total</span>
          </div>
          {data.categories.length ? (
            <div className="donut-row">
              <DonutChart data={donutData} />
              <div className="donut-legend">
                {data.categories.slice(0, 6).map((c) => (
                  <div key={c.id} className="legend-row">
                    <span className="dot" style={{ background: c.color }} />
                    <span className="legend-name">{c.icon} {c.name}</span>
                    <span className="legend-pct">{Math.round(c.share * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon="🧾" title="No expenses yet" body="Add your first expense for this month to see the breakdown." />
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Budgets</h3>
            <Link to="/budgets" className="card-link">Manage</Link>
          </div>
          {data.budgets.length ? (
            <div className="budget-mini-list">
              {data.budgets.slice(0, 5).map((b) => {
                const pct = b.amount > 0 ? b.spent / b.amount : 0;
                const color = pct >= 1 ? '#d92d20' : pct >= 0.75 ? '#f5a524' : '#0a7d43';
                return (
                  <div key={b.id} className="budget-mini">
                    <div className="budget-mini-top">
                      <span>{b.icon} {b.category_name}</span>
                      <span className="muted">{fmt0(b.spent)} / {fmt0(b.amount)}</span>
                    </div>
                    <Progress value={pct} color={color} />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="🎯" title="No budgets for this month" body="Set monthly limits per category and NaijaSpend will warn you before you overspend."
              action={<Link to="/budgets" className="btn btn-primary btn-sm">Set budgets</Link>} />
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Recent transactions</h3>
            <Link to="/transactions" className="card-link">See all</Link>
          </div>
          {data.recent.length ? (
            <div className="tx-list">
              {data.recent.map((t) => (
                <div key={t.id} className="tx-row" onDoubleClick={() => openTx(t)}>
                  <div className="tx-icon" style={{ background: t.category_color + '1a', color: t.category_color }}>{t.category_icon}</div>
                  <div className="tx-meta">
                    <div className="tx-desc">{t.description || t.category_name}</div>
                    <div className="tx-sub">{t.category_name} · {fmtDateShort(t.date)} · {t.method}</div>
                  </div>
                  <div className={`tx-amount ${t.type}`}>{t.type === 'income' ? '+' : '−'}{fmtSmart(t.amount)}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="📭" title="Nothing logged yet" body="Double-click any transaction later to edit it."
              action={<button className="btn btn-primary btn-sm" onClick={() => openTx()}><IconPlus size={14} /> Add transaction</button>} />
          )}
        </div>
      </div>
    </div>
  );
}
