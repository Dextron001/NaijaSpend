import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { currentMonth, fmt0 } from '../format.js';
import { Loading, ErrorNote } from '../components/ui.jsx';
import { HealthGauge, ForecastChart } from '../components/charts.jsx';
import { IconSparkles, IconSend, IconCheck, IconArrowUpRight, IconArrowDownRight, IconAlert } from '../components/Icons.jsx';

const SUGGESTIONS = [
  'How much did I spend on Food?',
  'Can I afford 150k for a laptop?',
  "What's my savings rate?",
  'Any unusual spending?',
  'How much did I spend last month?',
  'Where is my money going?',
];

export default function Insights() {
  const [month, setMonth] = useState(currentMonth());
  const [ins, setIns] = useState(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState({});
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const chatEndRef = useRef(null);

  const load = useCallback(() => {
    api('/insights?month=' + month).then((d) => setIns(d.insights)).catch((e) => setError(e.message));
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('tx-changed', h);
    return () => window.removeEventListener('tx-changed', h);
  }, [load]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    try {
      const d = await api('/assistant', { method: 'POST', body: { message: q, history } });
      setMessages((m) => [...m, { role: 'assistant', content: d.reply, engine: d.engine }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ ' + e.message }]);
    } finally {
      setBusy(false);
    }
  };

  const applyRec = async (rec) => {
    try {
      await api('/budgets', { method: 'POST', body: { category_id: rec.category_id, amount: rec.suggested, month } });
      setApplied((a) => ({ ...a, [rec.category_id]: true }));
      load();
    } catch (e) { setError(e.message); }
  };

  if (error && !ins) return <ErrorNote>{error}</ErrorNote>;
  if (!ins) return <Loading label="The AI is reading your ledger…" />;

  const scoreColor = ins.health.score >= 80 ? '#16a34a' : ins.health.score >= 65 ? '#0a7d43' : ins.health.score >= 45 ? '#f5a524' : '#d92d20';
  const forecastData = [...ins.series.map((s) => ({ label: s.label, expense: Math.round(s.expense), partial: s.partial }))];
  if (ins.forecast) forecastData.push({ label: ins.forecast.nextMonth, expense: ins.forecast.expense, projected: true });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2><span className="ai-title-icon"><IconSparkles size={18} /></span> AI Insights</h2>
          <p className="page-sub">{ins.label} · analysis of your real numbers</p>
        </div>
        <input className="input month-input" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="card ai-summary">
        <span className="ai-strip-icon big"><IconSparkles size={20} /></span>
        <div>
          <div className="ai-summary-title">What the AI sees</div>
          <p>{ins.summary}</p>
        </div>
      </div>

      <div className="grid-3">
        <div className="card health-card">
          <div className="card-head"><h3>Financial health</h3></div>
          <HealthGauge score={ins.health.score} tier={ins.health.tier} color={scoreColor} />
          <div className="health-parts">
            {ins.health.parts.map((p) => (
              <div key={p.label} className="health-part">
                <div className="hp-top">
                  <span>{p.label}</span>
                  <span className="muted">{Math.round(p.points)}/{p.max}</span>
                </div>
                <div className="hp-bar"><div className="hp-fill" style={{ width: `${(p.points / p.max) * 100}%` }} /></div>
                <div className="hp-note">{p.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>⚠️ Anomalies & outliers</h3></div>
          {ins.anomalies.length === 0 && ins.bigTx.length === 0 ? (
            <p className="muted ai-quiet">Nothing unusual — your spending pattern looks steady this month. 🧘</p>
          ) : (
            <div className="stack-list">
              {ins.anomalies.map((a) => (
                <div key={a.category} className="anomaly-item">
                  <span className="tx-icon" style={{ background: a.color + '1a', color: a.color }}>{a.icon}</span>
                  <div>
                    <b>{a.category} +{a.changePct}%</b>
                    <div className="hp-note">{a.message}</div>
                  </div>
                </div>
              ))}
              {ins.bigTx.map((b) => (
                <div key={b.id} className="anomaly-item">
                  <span className="tx-icon" style={{ background: b.color + '1a', color: b.color }}>{b.icon}</span>
                  <div>
                    <b>Large transaction</b>
                    <div className="hp-note">{b.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {ins.movers.length > 0 && (
            <>
              <div className="card-head sub"><h4>Biggest movers vs last month</h4></div>
              <div className="mover-chips">
                {ins.movers.slice(0, 6).map((m) => (
                  <span key={m.category} className={`chip ${m.delta >= 0 ? 'chip-out' : 'chip-in'}`}>
                    {m.delta >= 0 ? <IconArrowUpRight size={12} /> : <IconArrowDownRight size={12} />}
                    {m.category} {Math.abs(m.deltaPct)}%
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>🔮 Next-month forecast</h3></div>
          {ins.forecast ? (
            <>
              <ForecastChart data={forecastData} height={180} />
              <div className="forecast-nums">
                <div><span className="stat-label">Projected spending</span><b>{fmt0(ins.forecast.expense)}</b></div>
                <div><span className="stat-label">Avg income</span><b>{fmt0(ins.forecast.income)}</b></div>
                <div><span className="stat-label">Could save</span><b style={{ color: '#0a7d43' }}>{fmt0(ins.forecast.savings)}</b></div>
              </div>
              <p className="hp-note">Based on {ins.forecast.basis}. Solid bars are actuals{ins.series.some((s) => s.partial) ? ' (striped month is still in progress)' : ''}.</p>
            </>
          ) : <p className="muted ai-quiet">Keep logging for a couple of months and I'll start projecting.</p>}
        </div>
      </div>

      {ins.budgetRecs.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>🎯 Suggested budgets</h3>
            <Link to="/budgets" className="card-link">Manage budgets</Link>
          </div>
          <p className="hp-note">Derived from your average monthly spend in categories you haven't budgeted yet.</p>
          <div className="rec-row">
            {ins.budgetRecs.map((r) => (
              <div key={r.category_id} className="rec-item">
                <span className="rec-cat">{r.icon} {r.category}</span>
                <span className="muted">avg {fmt0(r.avg)}/mo</span>
                <button className="btn btn-soft btn-sm" disabled={applied[r.category_id]} onClick={() => applyRec(r)}>
                  {applied[r.category_id] ? <><IconCheck size={13} /> Set</> : `Set ${fmt0(r.suggested)}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {ins.tips.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>💡 Personalised tips</h3></div>
          <div className="tips-grid">
            {ins.tips.map((t, i) => (
              <div key={i} className="tip-item">
                <div className="tip-icon">{t.icon}</div>
                <div>
                  <b>{t.title}</b>
                  <p>{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card chat-card">
        <div className="card-head">
          <h3>🤖 Ask Naija AI</h3>
          <span className="card-hint">answers from your own numbers</span>
        </div>
        <div className="chat-scroll">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Ask me anything about your money. Try:</p>
              <div className="mover-chips">
                {SUGGESTIONS.map((s) => <button key={s} className="chip chip-btn" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <div className="bubble">{m.content}</div>
              {m.role === 'assistant' && m.engine && <div className="chat-engine">{m.engine === 'llm' ? 'LLM-powered' : 'rules engine · your data never leaves this server'}</div>}
            </div>
          ))}
          {busy && <div className="chat-msg assistant"><div className="bubble typing">Thinking…</div></div>}
          <div ref={chatEndRef} />
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. How much did I spend on Transport this month?" maxLength={300} />
          <button className="btn btn-primary" disabled={busy || !input.trim()}><IconSend size={16} /></button>
        </form>
      </div>
    </div>
  );
}
