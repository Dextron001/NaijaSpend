import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { ErrorNote } from '../components/ui.jsx';

export default function Login() {
  const { login, register } = useAuth();
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

  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="auth-logo"><span className="logo-badge"><img src="/logo.png" alt="" /></span>NaijaSpend</div>

        <div className="auth-side-body">
          <h1>Every naira,<br />accounted for.</h1>
        </div>

        <span className="auth-watermark">₦</span>
      </aside>

      <main className="auth-main">
        <div className="auth-mobile-logo"><span className="logo-badge"><img src="/logo.png" alt="" /></span>NaijaSpend</div>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'}
              className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'}
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
          </div>

          <form onSubmit={submit} className="auth-form">
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
        </div>

        <footer className="auth-main-foot">© 2026 NaijaSpend</footer>
      </main>
    </div>
  );
}
