import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSignIn({ email, password }) {
  const e = {};
  if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.';
  if (!password) e.password = 'Password is required.';
  return e;
}

function validateRegister({ name, email, password, confirm, mode, firmName, inviteCode }) {
  const e = {};
  if (!name || name.trim().length < 2) e.name = 'Name must be at least 2 characters.';
  if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.';
  if (password.length < 8) e.password = 'Password must be at least 8 characters.';
  if (confirm !== password) e.confirm = 'Passwords do not match.';
  if (mode === 'team-new' && !firmName.trim()) e.firmName = 'Firm name is required.';
  if (mode === 'team-join' && !inviteCode.trim()) e.inviteCode = 'Invite code is required.';
  return e;
}

function validateForgot({ email }) {
  const e = {};
  if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.';
  return e;
}

export default function AuthGate() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('signin'); // 'signin' | 'register' | 'forgot'
  const [mode, setMode] = useState('solo');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firmName, setFirmName] = useState('');
  const [seatLimit, setSeatLimit] = useState(5);
  const [inviteCode, setInviteCode] = useState('');

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    const ve = validateSignIn({ email, password });
    if (Object.keys(ve).length) { setErrors(ve); return; }
    setErrors({}); setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await login(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ _form: err?.message || 'Something went wrong. Try again.' });
    } finally { setLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const ve = validateRegister({ name, email, password, confirm, mode, firmName, inviteCode });
    if (Object.keys(ve).length) { setErrors(ve); return; }
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
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ ...(err?.fields ?? {}), _form: err?.message || 'Something went wrong. Try again.' });
    } finally { setLoading(false); }
  }

  async function handleForgot(e) {
    e.preventDefault();
    const ve = validateForgot({ email });
    if (Object.keys(ve).length) { setErrors(ve); return; }
    setErrors({}); setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setForgotSent(true);
    } catch {
      setForgotSent(true); // still show success to avoid email enumeration
    } finally { setLoading(false); }
  }

  return (
    <section className="screen">
      <div className="login-grid">
        <div>
          <p className="eyebrow">{tab === 'signin' ? 'Welcome back' : tab === 'register' ? 'Get started' : 'Reset password'}</p>
          <h2>
            {tab === 'signin' ? 'Sign in to your analyst workspace.'
              : tab === 'register' ? 'Create your analyst workspace.'
              : 'Forgot your password?'}
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
            <span className="chip soft-accent">
              {tab === 'signin' ? 'Sign in' : tab === 'register' ? 'New account' : 'Reset'}
            </span>
          </div>

          {tab !== 'forgot' && (
            <div className="product-nav" style={{ marginTop: 24, display: 'inline-flex' }}>
              <span className={tab === 'signin' ? 'active' : ''} onClick={() => setTab('signin')} style={{ cursor: 'pointer' }}>Sign in</span>
              <span className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')} style={{ cursor: 'pointer' }}>Register</span>
            </div>
          )}

          {tab === 'signin' && (
            <form onSubmit={handleSignIn}>
              <Field label="Work email" type="email" value={email} onChange={setEmail} autoFocus error={errors.email} />
              <PasswordField label="Password" value={password} onChange={setPassword} error={errors.password} />
              <FormError msg={errors._form} />
              <div className="actions" style={{ marginTop: 26 }}>
                <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setTab('forgot'); setForgotSent(false); }}>
                  Forgot password?
                </span>
              </p>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister}>
              <div className="product-nav" style={{ marginTop: 16, display: 'inline-flex', gap: 4 }}>
                <span className={mode === 'solo' ? 'active' : ''} onClick={() => setMode('solo')} style={{ cursor: 'pointer' }}>Solo</span>
                <span className={mode === 'team-new' ? 'active' : ''} onClick={() => setMode('team-new')} style={{ cursor: 'pointer' }}>Team</span>
                <span className={mode === 'team-join' ? 'active' : ''} onClick={() => setMode('team-join')} style={{ cursor: 'pointer' }}>Join team</span>
              </div>

              <Field label="Full name" value={name} onChange={setName} required autoFocus error={errors.name} />
              <Field label="Work email" type="email" value={email} onChange={setEmail} required error={errors.email} />
              <PasswordField label="Password (min. 8 chars)" value={password} onChange={setPassword} error={errors.password} />
              <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} error={errors.confirm} />

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

          {tab === 'forgot' && (
            forgotSent ? (
              <>
                <p style={{ marginTop: 24, fontSize: 14, color: 'var(--ink)' }}>
                  If an account exists for <strong>{email}</strong>, a reset link is on its way.
                </p>
                <button className="button" style={{ marginTop: 20 }} onClick={() => setTab('signin')}>
                  Back to sign in
                </button>
              </>
            ) : (
              <form onSubmit={handleForgot}>
                <Field label="Work email" type="email" value={email} onChange={setEmail} autoFocus error={errors.email} style={{ marginTop: 24 }} />
                <div className="actions" style={{ marginTop: 26 }}>
                  <button className="button accent" type="submit" style={{ flex: 1 }} disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset link'}
                  </button>
                </div>
                <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setTab('signin')}>
                    Back to sign in
                  </span>
                </p>
              </form>
            )
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

function PasswordField({ label, value, onChange, error, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="login-field">
      <div className="field-label">{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          className="field-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingRight: 40 }}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--muted)', fontSize: 16, lineHeight: 1,
          }}
          tabIndex={-1}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function FormError({ msg }) {
  if (!msg) return null;
  return <p style={{ marginTop: 14, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>{msg}</p>;
}

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
