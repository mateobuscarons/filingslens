import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="screen" id="login">
      <div className="login-grid">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to your analyst workspace.</h2>
          <p className="lead">
            Use your work account to access your firm's comparisons, cited answers, and reports.
          </p>
        </div>

        <div className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="brand">FilingLens</div>
            <span className="chip soft-accent">Analyst workspace</span>
          </div>

          <h3 className="panel-title" style={{ marginTop: 28 }}>Sign in</h3>
          <p className="panel-sub">Use your firm email.</p>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <div className="field-label">Work email</div>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@firm.com"
                required
                autoFocus
              />
            </div>
            <div className="login-field" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="field-label">Password</div>
                <input
                  className="field-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, marginTop: 18, lineHeight: 0 }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            {error && (
              <p style={{ marginTop: 14, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>
                {error}
              </p>
            )}

            <div className="actions" style={{ marginTop: 26 }}>
              <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>

          <p className="row-sub" style={{ marginTop: 22 }}>
            <Link to="/forgot">Forgot password</Link>
            {' · '}
            <Link to="/signup">Request access</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
