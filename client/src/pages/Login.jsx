import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { ErrorNote } from '../components/ui.jsx';

export default function Login() {
  const { login, register, demo } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
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

  const continueDemo = async () => {
    setError('');
    setBusy(true);
    try { await demo(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="auth-logo"><span className="logo-mark">₦</span>NaijaSpend</div>

        <div className="auth-side-body">
          <h1>Every naira,<br />accounted for.</h1>
          <p className="auth-side-sub">
            A local-first personal finance tracker. Log what you earn and spend,
            set budgets that mean something, and let the analysis engine do the maths.
          </p>
          <ul className="auth-points">
            <li>Manual entry, bank-alert import, or recurring rules — however you bank</li>
            <li>Category budgets with projected over-spend warnings</li>
            <li>Health score, anomaly detection and forecasts, computed from your own ledger</li>
          </ul>
        </div>

        <footer className="auth-side-foot">
          <span>Node · React · SQLite</span>
          <span>v1.3.0</span>
        </footer>
      </aside>

      <main className="auth-main">
        <div className="auth-form-col">
          <div className="auth-mobile-logo"><span className="logo-mark">₦</span>NaijaSpend</div>

          <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'signin'} className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
            <button role="tab" aria-selected={mode === 'signup'} className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
          </div>

          <form onSubmit={submit} className="auth-form" noValidate={false}>
            {mode === 'signup' && (
              <label className="field">
                <span>Full name</span>
                <input className="input" name="name" autoComplete="name" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Adaeze Okafor" required minLength={2} />
              </label>
            )}

            <label className="field">
              <span>Email</span>
              <input className="input" type="email" name="email" autoComplete="email" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </label>

            <label className="field">
              <span>Password</span>
              <div className="pw-wrap">
                <input className="input" type={showPw ? 'text' : 'password'} name="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'} required minLength={6} />
                <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <ErrorNote>{error}</ErrorNote>

            <button className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="demo-box">
            <div className="demo-box-title">Just looking around?</div>
            <div className="demo-creds">demo@naijaspend.ng · demo1234</div>
            <button className="btn btn-ghost btn-sm" onClick={continueDemo} disabled={busy}>
              Continue with demo data →
            </button>
          </div>

          <p className="auth-legal">
            {mode === 'signup'
              ? 'By creating an account you agree to take reasonable care of your password. Your records stay on the server you run this on.'
              : 'Sessions last 7 days. Nothing is shared with third parties.'}
          </p>
        </div>

        <footer className="auth-main-foot">© 2026 NaijaSpend</footer>
      </main>
    </div>
  );
}
