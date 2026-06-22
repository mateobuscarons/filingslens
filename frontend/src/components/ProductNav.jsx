import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Analyses',  to: '/analyses/new' },
  { label: 'Reports',   to: '/reports' },
];

export default function ProductNav() {
  const { pathname } = useLocation();

  function isActive(to) {
    if (to === '/dashboard') return pathname === '/dashboard';
    if (to === '/analyses/new') return pathname.startsWith('/analyses');
    if (to === '/reports') return pathname.startsWith('/reports');
    return false;
  }

  return (
    <nav className="product-nav">
      {LINKS.map(({ label, to }) => (
        <Link key={to} to={to} className={isActive(to) ? 'active' : ''}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
