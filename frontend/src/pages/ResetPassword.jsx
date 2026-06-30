import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api.js';
import PasswordField from '../components/PasswordField.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
              <PasswordField label="New password" value={password} onChange={setPassword} required autoFocus />
              <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} required />
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
