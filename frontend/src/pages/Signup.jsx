import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { apiFetch, ApiError } from '../api.js';

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('solo');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firmName, setFirmName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const body = { mode, name, email, password };
      if (mode === 'team') body.firmName = firmName;
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields || { _form: err.message });
      } else {
        setErrors({ _form: 'Something went wrong. Try again.' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="screen" id="signup">
      <div className="login-grid">
        <div>
          <p className="eyebrow">Get started</p>
          <h2>Create your analyst workspace.</h2>
          <p className="lead">
            Solo analysts get a personal workspace. Teams share comparisons, findings, and reports across the firm.
          </p>
        </div>

        <div className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="brand">FilingLens</div>
            <span className="chip soft-accent">New account</span>
          </div>

          <h3 className="panel-title" style={{ marginTop: 28 }}>Sign up</h3>

          {/* Mode toggle */}
          <div className="product-nav" style={{ marginTop: 16, display: 'inline-flex' }}>
            <span
              className={mode === 'solo' ? 'active' : ''}
              onClick={() => setMode('solo')}
              style={{ cursor: 'pointer' }}
            >
              Solo
            </span>
            <span
              className={mode === 'team' ? 'active' : ''}
              onClick={() => setMode('team')}
              style={{ cursor: 'pointer' }}
            >
              Team
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <div className="field-label">Full name</div>
              <input
                className="field-input"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Elena Steiner"
                required
                autoFocus
              />
              {errors.name && <div className="field-error">{errors.name}</div>}
            </div>

            <div className="login-field">
              <div className="field-label">Work email</div>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@firm.com"
                required
              />
              {errors.email && <div className="field-error">{errors.email}</div>}
            </div>

            <div className="login-field" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="field-label">Password</div>
                <input
                  className="field-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                />
                {errors.password && <div className="field-error">{errors.password}</div>}
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

            {mode === 'team' && (
              <div className="login-field">
                <div className="field-label">Firm name</div>
                <input
                  className="field-input"
                  type="text"
                  value={firmName}
                  onChange={e => setFirmName(e.target.value)}
                  placeholder="Frankfurt Investments GmbH"
                  required
                />
                {errors.firmName && <div className="field-error">{errors.firmName}</div>}
              </div>
            )}

            {errors._form && (
              <p style={{ marginTop: 14, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>
                {errors._form}
              </p>
            )}

            <div className="actions" style={{ marginTop: 26 }}>
              <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>

          <p className="row-sub" style={{ marginTop: 22 }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
