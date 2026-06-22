import React from 'react';

export default function Button({ variant = 'default', as: Tag = 'button', children, className = '', ...props }) {
  const variantClass = variant === 'default' ? '' : variant;
  return (
    <Tag className={`button ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
}
