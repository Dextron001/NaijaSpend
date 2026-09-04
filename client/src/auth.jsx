import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ns_token');
    if (!token) { setLoading(false); return; }
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => localStorage.removeItem('ns_token'))
      .finally(() => setLoading(false));
  }, []);

  const applyAuth = useCallback(({ token, user }) => {
    localStorage.setItem('ns_token', token);
    setUser(user);
  }, []);

  const login = async (email, password) => applyAuth(await api('/auth/login', { method: 'POST', body: { email, password } }));
  const register = async (name, email, password) => applyAuth(await api('/auth/register', { method: 'POST', body: { name, email, password } }));
  const demo = async () => applyAuth(await api('/auth/demo', { method: 'POST' }));
  const logout = () => { localStorage.removeItem('ns_token'); setUser(null); };
  const refreshUser = async () => { const d = await api('/auth/me'); setUser(d.user); };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, demo, logout, refreshUser, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
