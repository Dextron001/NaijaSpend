import { IconX } from './Icons.jsx';

export function Modal({ open, onClose, title, children, width = 480 }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export const Spinner = ({ size = 22 }) => <span className="spinner" style={{ width: size, height: size }} />;

export const Loading = ({ label = 'Loading…' }) => (
  <div className="loading-block"><Spinner /><span>{label}</span></div>
);

export const EmptyState = ({ icon = '🗂️', title, body, action }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h4>{title}</h4>
    {body && <p>{body}</p>}
    {action}
  </div>
);

export function Progress({ value, color, height = 8 }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="progress-track" style={{ height }}>
      <div className="progress-fill" style={{ width: `${pct}%`, background: color || 'var(--primary)' }} />
    </div>
  );
}

export const ErrorNote = ({ children }) => children ? <div className="error-note">⚠️ {children}</div> : null;

export const Delta = ({ value, invert = false }) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  return (
    <span className={`delta ${good ? 'delta-good' : 'delta-bad'}`}>
      {positive ? '▲' : '▼'} {Math.abs(Math.round(value))}%
    </span>
  );
};
