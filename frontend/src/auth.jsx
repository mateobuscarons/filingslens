import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiFetch, ApiError } from './api.js';

const AuthContext = createContext(null);

// The auth context holds three pieces of state, loaded sequentially:
//   1. user          — null if no token, or the public profile from GET /me
//   2. subscription  — null until billing succeeds, or the active sub object
//   3. ready         — true once /me (and /billing/subscription, if there's a user) have returned
//
// Three route guards consume them:
//   ProtectedRoute  — requires user + subscription
//   AuthOnlyRoute   — requires user but tolerates missing subscription (PlanAndPay)
//   AdminRoute      — requires firm_admin role + subscription
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [ready, setReady] = useState(false);

  const loadSubscription = useCallback(async () => {
    try {
      const data = await apiFetch('/billing/subscription');
      setSubscription(data.subscription);
    } catch (err) {
      setSubscription(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const token = localStorage.getItem('token');
      if (!token) { setReady(true); return; }
      try {
        const me = await apiFetch('/me');
        if (cancelled) return;
        setUser(me);
        await loadSubscription();
      } catch {
        localStorage.removeItem('token');
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [loadSubscription]);

  async function login(token, userData) {
    localStorage.setItem('token', token);
    setUser(userData);
    await loadSubscription(); // fresh signups will set sub=null; existing users will get their sub
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
    setSubscription(null);
  }

  return (
    <AuthContext.Provider value={{ user, subscription, ready, login, logout, reloadSubscription: loadSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function ProtectedRoute({ children }) {
  const { user, subscription, ready } = useAuth();
  const { pathname } = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/" replace state={{ from: pathname }} />;
  if (!subscription) return <Navigate to="/billing/setup" replace />;
  return children;
}

export function AuthOnlyRoute({ children }) {
  const { user, subscription, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/" replace />;
  if (subscription) return <Navigate to="/dashboard" replace />;
  return children;
}

export function AdminRoute({ children }) {
  const { user, subscription, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/" replace />;
  if (!subscription) return <Navigate to="/billing/setup" replace />;
  if (user.role !== 'firm_admin') return <Navigate to="/dashboard" replace />;
  return children;
}
