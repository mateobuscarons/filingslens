import React from 'react';
import { Link } from 'react-router-dom';
import ProductNav from './ProductNav.jsx';
import Chip from './Chip.jsx';
import { useAuth } from '../auth.jsx';

export default function TopBar() {
  const { user } = useAuth();
  const initials = user ? `${user.name.split(' ')[0]} ${user.name.split(' ').slice(-1)[0][0]}.` : '';

  return (
    <div className="topbar">
      <Link to="/dashboard" className="brand">FilingLens</Link>
      <ProductNav />
      <Chip>{initials}</Chip>
    </div>
  );
}
