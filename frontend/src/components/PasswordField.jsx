import { useState } from 'react';

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

// show/onToggle are optional — if omitted, state is managed internally.
export default function PasswordField({ label, value, onChange, error, show: showProp, onToggle, ...rest }) {
  const [internalShow, setInternalShow] = useState(false);
  const controlled = showProp !== undefined;
  const show = controlled ? showProp : internalShow;
  const toggle = controlled ? onToggle : () => setInternalShow(s => !s);

  return (
    <div className="login-field">
      <div className="field-label">{label}</div>
      <div className="pwd-wrap">
        <input
          className="field-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
        <button type="button" className="pwd-toggle" onClick={toggle} tabIndex={-1}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
