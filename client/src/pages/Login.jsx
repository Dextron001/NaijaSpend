import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { ErrorNote } from '../components/ui.jsx';

export default function Login() {
  const { login, register, demo } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') await login(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    setError('');
    setBusy(true);
    try { await demo(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <div className="brand-row"><span className="brand-badge">₦</span><span className="brand-name light">Naija<span className="brand-accent">Spend</span></span></div>
          <h1>Know where every <em>Naira</em> goes.</h1>
          <p>Track spending, budget smart, and let the built-in AI turn your ledger into plain-language advice — built for how money moves in Naija.</p>
          <ul className="auth-feats">
            <li>🍲 <div><b>Log expenses in seconds</b><span>Food, Bolt rides, data subscriptions, rent — categories that match real life.</span></div></li>
            <li>🎯 <div><b>Budgets & goals that stick</b><span>Monthly limits per category, savings goals with progress tracking.</span></div></li>
            <li>🤖 <div><b>AI insights & assistant</b><span>Spending anomaly alerts, forecasts, a financial health score, and a chat that answers with your actual numbers.</span></div></li>
          </ul>
          <div className="auth-naira-strip">₦100 · ₦500 · ₦1,000 · ₦5,000 · ₦10,000 · ₦50,000</div>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="segmented auth-seg">
            <button type="button" className={`seg ${mode === 'signin' ? 'active' : ''}`} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
            <button type="button" className={`seg ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
          </div>

          <form onSubmit={submit} className="form">
            {mode === 'signup' && (
              <label className="field"><span>Full name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Adaeze Okafor" required minLength={2} />
              </label>
            )}
            <label className="field"><span>Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </label>
            <label className="field"><span>Password</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </label>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create my account'}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>
          <button className="btn btn-demo btn-block" onClick={tryDemo} disabled={busy}>
            ⚡ Try the instant demo (seeded data)
          </button>
          <p className="auth-foot">No sign-up needed for the demo — you get a fresh account with 6 months of realistic transactions, budgets and goals.</p>
        </div>
      </div>
    </div>
  );
}
