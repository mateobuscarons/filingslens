import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api.js';

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
                <div style={{ position: 'relative' }}>
                  <input
                    className="field-input"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    style={{ paddingRight: 40 }}
                  />
                  <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>
                    {show ? '🙈' : '👁'}
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
              {error && <p style={{ marginTop: 12, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>{error}</p>}
              <div className="actions" style={{ marginTop: 26 }}>
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
