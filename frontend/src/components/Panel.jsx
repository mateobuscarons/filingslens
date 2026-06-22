import React from 'react';

export function Panel({ dark = false, children, className = '', ...props }) {
  return (
    <div className={`panel ${dark ? 'dark' : ''} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function PanelHead({ title, sub, action }) {
  return (
    <div className="panel-head">
      <div>
        <h3 className="panel-title">{title}</h3>
        {sub && <p className="panel-sub">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
