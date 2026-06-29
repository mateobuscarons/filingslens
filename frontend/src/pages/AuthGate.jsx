import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';

// The whole sign-in + register surface in one page. Three register modes:
//   solo       — name, email, password
//   team-new   — same + firmName + seatLimit
//   team-join  — same + inviteCode (no firmName, no seats)
// After register the AuthProvider has no subscription yet, so the route
// guard sends the user to /billing/setup.
export default function AuthGate() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('signin'); // 'signin' | 'register'
  const [mode, setMode] = useState('solo'); // 'solo' | 'team-new' | 'team-join'

  // shared
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // team-new
  const [firmName, setFirmName] = useState('');
  const [seatLimit, setSeatLimit] = useState(5);
  // team-join
  const [inviteCode, setInviteCode] = useState('');

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setErrors({}); setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await login(data.token, data.user);
      navigate('/', { replace: true }); // Root routes based on subscription state
    } catch (err) {
      // Don't use `instanceof ApiError` — Vite HMR can produce two class
      // identities. Duck-type instead.
      setErrors({ _form: err?.message || 'Something went wrong. Try again.' });
    } finally { setLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setErrors({}); setLoading(true);
    const body = { mode, name, email, password };
    if (mode === 'team-new') { body.firmName = firmName; body.seatLimit = Number(seatLimit); }
    if (mode === 'team-join') { body.inviteCode = inviteCode.trim().toUpperCase(); }
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await login(data.token, data.user);
      navigate('/', { replace: true }); // Root routes to /billing/setup for fresh users, /dashboard for team-join
    } catch (err) {
      // Duck-type instead of `instanceof ApiError` — survives HMR reloads.
      setErrors({ ...(err?.fields ?? {}), _form: err?.message || 'Something went wrong. Try again.' });
    } finally { setLoading(false); }
  }

  return (
    <section className="screen">
      <div className="login-grid">
        <div>
          <p className="eyebrow">{tab === 'signin' ? 'Welcome back' : 'Get started'}</p>
          <h2>
            {tab === 'signin'
              ? 'Sign in to your analyst workspace.'
              : 'Create your analyst workspace.'}
          </h2>
          <p className="lead">
            For German equity analysts. Compare two filings, ask follow-ups,
            ship a sourced report — every claim cites its exact line in the PDF.
          </p>

          <div className="auth-pitch">
            <p className="pitch-label">What analysts get</p>
            <ul className="pitch-bullets">
              <li>Changes between two filings surface in seconds, ranked by impact</li>
              <li>Every finding and answer is grounded with citations</li>
              <li>Share analyses and co-author reports with your team</li>
            </ul>

            <p className="pitch-label">Pricing</p>
            <div className="pitch-pricing">
              <span className="chip soft-accent"><strong>Solo</strong> €29/mo · 1 analyst</span>
              <span className="chip soft-accent"><strong>Team</strong> €149/mo · 5 seats (+€25/seat)</span>
            </div>
          </div>
        </div>

        <div className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="brand">FilingLens</div>
            <span className="chip soft-accent">{tab === 'signin' ? 'Sign in' : 'New account'}</span>
          </div>

          <div className="product-nav" style={{ marginTop: 24, display: 'inline-flex' }}>
            <span className={tab === 'signin' ? 'active' : ''} onClick={() => setTab('signin')} style={{ cursor: 'pointer' }}>Sign in</span>
            <span className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')} style={{ cursor: 'pointer' }}>Register</span>
          </div>

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn}>
              <Field label="Work email" type="email" value={email} onChange={setEmail} autoFocus required />
              <Field label="Password" type="password" value={password} onChange={setPassword} required />
              <FormError msg={errors._form} />
              <div className="actions" style={{ marginTop: 26 }}>
                <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="product-nav" style={{ marginTop: 16, display: 'inline-flex', gap: 4 }}>
                <span className={mode === 'solo' ? 'active' : ''} onClick={() => setMode('solo')} style={{ cursor: 'pointer' }}>Solo</span>
                <span className={mode === 'team-new' ? 'active' : ''} onClick={() => setMode('team-new')} style={{ cursor: 'pointer' }}>Team</span>
                <span className={mode === 'team-join' ? 'active' : ''} onClick={() => setMode('team-join')} style={{ cursor: 'pointer' }}>Join team</span>
              </div>

              <Field label="Full name" value={name} onChange={setName} required autoFocus error={errors.name} />
              <Field label="Work email" type="email" value={email} onChange={setEmail} required error={errors.email} />
              <Field label="Password (min. 8 chars)" type="password" value={password} onChange={setPassword} required error={errors.password} />

              {mode === 'team-new' && (
                <>
                  <Field label="Firm name" value={firmName} onChange={setFirmName} required error={errors.firmName} />
                  <Field label="Seats (5–25)" type="number" min={5} max={25} value={seatLimit} onChange={setSeatLimit} required error={errors.seatLimit} />
                </>
              )}
              {mode === 'team-join' && (
                <Field label="Invite code" value={inviteCode} onChange={setInviteCode} required error={errors.inviteCode} placeholder="ABCD1234" />
              )}

              <FormError msg={errors._form} />
              <div className="actions" style={{ marginTop: 26 }}>
                <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Creating account…' : 'Continue'}
                </button>
              </div>
              <p className="row-sub" style={{ marginTop: 18 }}>
                Next step: choose your plan and confirm payment.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, error, type = 'text', ...rest }) {
  return (
    <div className="login-field">
      <div className="field-label">{label}</div>
      <input
        className="field-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function FormError({ msg }) {
  if (!msg) return null;
  return <p style={{ marginTop: 14, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>{msg}</p>;
}
