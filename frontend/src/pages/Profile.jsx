import { useState } from 'react';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwErrors, setPwErrors] = useState({});
  const [pwSaving, setPwSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setNameError('Name must be at least 2 characters.');
      return;
    }
    setNameError('');
    setNameSaving(true);
    try {
      await apiFetch('/me', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
      toast.success('Name updated.');
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : 'Could not update name.');
    } finally { setNameSaving(false); }
  }

  async function savePassword(e) {
    e.preventDefault();
    const e2 = {};
    if (!currentPassword) e2.currentPassword = 'Enter your current password.';
    if (newPassword.length < 8) e2.newPassword = 'New password must be at least 8 characters.';
    if (newPassword !== confirmPassword) e2.confirmPassword = 'Passwords do not match.';
    if (Object.keys(e2).length) { setPwErrors(e2); return; }
    setPwErrors({});
    setPwSaving(true);
    try {
      await apiFetch('/me', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
      toast.success('Password updated.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setPwErrors(err.fields);
      else setPwErrors({ currentPassword: err?.message || 'Could not update password.' });
    } finally { setPwSaving(false); }
  }

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Account</p>
          <h2>Profile settings.</h2>
          <p className="lead">{user?.email}</p>
        </div>

        <div className="two-col">
          {/* Name */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Display name</h3>
                <p className="panel-sub">How your name appears in reports and mentions.</p>
              </div>
            </div>
            <form onSubmit={saveName} className="panel-form">
              <div className="login-field">
                <div className="field-label">Full name</div>
                <input
                  className="field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                {nameError && <div className="field-error">{nameError}</div>}
              </div>
              <div className="actions">
                <button className="button accent" type="submit" disabled={nameSaving}>
                  {nameSaving ? 'Saving…' : 'Save name'}
                </button>
              </div>
            </form>
          </div>

          {/* Password */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Change password</h3>
                <p className="panel-sub">Must be at least 8 characters.</p>
              </div>
            </div>
            <form onSubmit={savePassword} className="panel-form">
              <PasswordField
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggle={() => setShowCurrent(s => !s)}
                error={pwErrors.currentPassword}
              />
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                show={showNew}
                onToggle={() => setShowNew(s => !s)}
                error={pwErrors.newPassword}
              />
              <PasswordField
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showNew}
                onToggle={() => setShowNew(s => !s)}
                error={pwErrors.confirmPassword}
              />
              <div className="actions">
                <button className="button accent" type="submit" disabled={pwSaving}>
                  {pwSaving ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
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

function PasswordField({ label, value, onChange, show, onToggle, error }) {
  return (
    <div className="login-field">
      <div className="field-label">{label}</div>
      <div className="pwd-wrap">
        <input
          className="field-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="pwd-toggle" onClick={onToggle} tabIndex={-1}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
