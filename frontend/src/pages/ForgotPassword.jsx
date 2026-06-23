import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState('request'); // 'request' | 'reset'
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setToken(data.resetToken || '');
      setStep('reset');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      toast.success('Password updated — please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="screen" id="forgot">
      <div className="login-grid">
        <div>
          <p className="eyebrow">Account recovery</p>
          <h2>Reset your password.</h2>
          <p className="lead">
            Enter your work email and we'll give you a reset token. No email service — token appears on screen for the demo.
          </p>
        </div>

        <div className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="brand">FilingLens</div>
            <span className="chip soft-accent">{step === 'request' ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
          </div>

          {step === 'request' ? (
            <>
              <h3 className="panel-title" style={{ marginTop: 28 }}>Forgot password</h3>
              <p className="panel-sub">Enter your registered email.</p>
              <form onSubmit={handleRequest}>
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
                {error && <p style={{ marginTop: 14, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>{error}</p>}
                <div className="actions" style={{ marginTop: 26 }}>
                  <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                    {loading ? 'Sending…' : 'Get reset token'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h3 className="panel-title" style={{ marginTop: 28 }}>Set new password</h3>
              <p className="panel-sub">Your reset token is shown below — copy it or use it directly.</p>
              <form onSubmit={handleReset}>
                <div className="login-field">
                  <div className="field-label">Reset token</div>
                  <input
                    className="field-input"
                    type="text"
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    required
                  />
                </div>
                <div className="login-field" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div className="field-label">New password</div>
                    <input
                      className="field-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
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
                {error && <p style={{ marginTop: 14, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>{error}</p>}
                <div className="actions" style={{ marginTop: 26 }}>
                  <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                    {loading ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="row-sub" style={{ marginTop: 22 }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
