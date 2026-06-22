import React from 'react';

export default function Field({ label, value, error, type = 'text', ...inputProps }) {
  const isDisplay = value !== undefined && !inputProps.onChange;

  return (
    <div className="login-field">
      <div className="field-label">{label}</div>
      {isDisplay ? (
        <div className="field-value">{value}</div>
      ) : (
        <input
          className="field-input"
          type={type}
          value={value}
          {...inputProps}
        />
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
