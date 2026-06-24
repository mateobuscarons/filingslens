import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function ProductNav() {
  const { pathname } = useLocation();

  function isActive(prefix, exact = false) {
    return exact ? pathname === prefix : pathname.startsWith(prefix);
  }

  return (
    <nav className="product-nav">
      <Link to="/dashboard" className={isActive('/dashboard', true) ? 'active' : ''}>Dashboard</Link>
      <Link to="/analyses/new" className={isActive('/analyses') ? 'active' : ''}>Analyses</Link>
      <Link to="/reports" className={isActive('/reports') ? 'active' : ''}>Reports</Link>
    </nav>
  );
}
