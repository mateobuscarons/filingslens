import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function AuthGate() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('signin'); // 'signin' | 'register' | 'forgot'
  const [mode, setMode] = useState('solo');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firmName, setFirmName] = useState('');
  const [seatLimit, setSeatLimit] = useState(5);
  const [inviteCode, setInviteCode] = useState('');

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setErrors({}); setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await login(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      if (err?.code === 'EMAIL_NOT_VERIFIED') {
        setPendingEmail(email);
        return;
      }
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
      if (data.pending) { setPendingEmail(email); return; }
      await login(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ ...(err?.fields ?? {}), _form: err?.message || 'Something went wrong. Try again.' });
    } finally { setLoading(false); }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setForgotSent(true);
    } catch {
      setForgotSent(true); // still show success to avoid email enumeration
    } finally { setLoading(false); }
  }

  if (pendingEmail) {
    return (
      <section className="screen">
        <div className="login-grid">
          <div>
            <p className="eyebrow">Almost there</p>
            <h2>Check your inbox.</h2>
            <p className="lead">We sent a verification link to confirm your email before you can sign in.</p>
          </div>
          <div className="login-card">
            <div className="brand">FilingLens</div>
            <p style={{ marginTop: 24, fontSize: 14, color: 'var(--ink)' }}>
              Verification email sent to <strong>{pendingEmail}</strong>.
            </p>
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
              Click the link in that email to activate your account, then come back here to sign in.
            </p>
            <button className="button" style={{ marginTop: 24 }} onClick={() => { setPendingEmail(null); setTab('signin'); }}>
              Back to sign in
            </button>
          </div>
        </div>
      </section>
    );
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
            Compare two annual reports paragraph by paragraph. Get LLM
            summaries, citations, and team-shared research reports.
          </p>
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
              <Field label="Work email" type="email" value={email} onChange={setEmail} autoFocus required />
              <PasswordField label="Password" value={password} onChange={setPassword} required />
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
              <PasswordField label="Password (min. 8 chars)" value={password} onChange={setPassword} required error={errors.password} />

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
                <Field label="Work email" type="email" value={email} onChange={setEmail} autoFocus required style={{ marginTop: 24 }} />
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
          {show ? '🙈' : '👁'}
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
