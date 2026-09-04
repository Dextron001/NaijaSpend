import { createContext, useContext, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import {
  IconDashboard, IconReceipt, IconWallet, IconTarget, IconSparkles, IconSettings,
  IconLogout, IconPlus, IconRepeat, IconReport,
} from './Icons.jsx';
import TxModal from './TxModal.jsx';

const TxModalCtx = createContext(null);
export const useTxModal = () => useContext(TxModalCtx);
export const txChanged = () => window.dispatchEvent(new Event('tx-changed'));

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt },
  { to: '/budgets', label: 'Budgets', icon: IconWallet },
  { to: '/goals', label: 'Goals', icon: IconTarget },
  { to: '/recurring', label: 'Recurring', icon: IconRepeat },
  { to: '/reports', label: 'Reports', icon: IconReport },
  { to: '/insights', label: 'AI Insights', icon: IconSparkles },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [txOpen, setTxOpen] = useState(false);
  const [txEdit, setTxEdit] = useState(null);
  const navigate = useNavigate();

  const openTx = useCallback((tx = null) => { setTxEdit(tx); setTxOpen(true); }, []);
  const closeTx = () => setTxOpen(false);

  const initials = (user?.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <TxModalCtx.Provider value={{ openTx }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand" onClick={() => navigate('/')} role="button">
            <span className="logo-badge"><img src="/logo.png" alt="" /></span>
            <span className="brand-name">Naija<span className="brand-accent">Spend</span></span>
          </div>
          <nav className="nav">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="user-chip">
              <div className="avatar">{initials}</div>
              <div className="user-meta">
                <div className="user-name">{user?.name}</div>
                <div className="user-email">{user?.email}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="main-col">
          <header className="topbar">
            <div className="topbar-brand mobile-only">
              <span className="logo-badge small"><img src="/logo.png" alt="" /></span> Naija<b>Spend</b>
            </div>
            <div className="topbar-actions">
              <button className="btn btn-primary" onClick={() => openTx()}><IconPlus size={16} /> Add Transaction</button>
              <button className="icon-btn" onClick={() => navigate('/settings')} title="Settings"><IconSettings size={17} /></button>
              <button className="icon-btn hide-mobile" onClick={logout} title="Log out"><IconLogout size={17} /></button>
            </div>
          </header>
          <main className="content">{children}</main>
        </div>

        <nav className="bottomnav mobile-only">
          {NAV.slice(0, 7).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} />
              <span>{label.split(' ')[0]}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <TxModal open={txOpen} onClose={closeTx} edit={txEdit} onSaved={closeTx} />
    </TxModalCtx.Provider>
  );
}
