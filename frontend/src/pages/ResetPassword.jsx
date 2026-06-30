import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api.js';

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const token = params.get('token');

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError(''); setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(err?.message || 'Link is invalid or expired.');
    } finally { setLoading(false); }
  }

  return (
    <section className="screen">
      <div className="login-grid">
        <div>
          <p className="eyebrow">{done ? 'All done' : 'Almost there'}</p>
          <h2>{done ? 'Password updated.' : 'Choose a new password.'}</h2>
        </div>
        <div className="login-card">
          <div className="brand">FilingLens</div>
          {done ? (
            <>
              <p style={{ marginTop: 24, fontSize: 14, color: 'var(--ink)' }}>
                Your password has been updated. You can now sign in.
              </p>
              <button className="button accent" style={{ marginTop: 20 }} onClick={() => navigate('/')}>
                Sign in
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="login-field" style={{ marginTop: 24 }}>
                <div className="field-label">New password</div>
                <div className="pwd-wrap">
                  <input
                    className="field-input"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShow(s => !s)} tabIndex={-1}>
                    {show ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>
              <div className="login-field">
                <div className="field-label">Confirm password</div>
                <input
                  className="field-input"
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <div className="actions form">
                <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Saving…' : 'Set new password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
