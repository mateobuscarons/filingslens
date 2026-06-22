import React from 'react';

export default function Chip({ variant = 'default', children, className = '', ...props }) {
  const variantClass = variant === 'default' ? '' : variant;
  return (
    <span className={`chip ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
