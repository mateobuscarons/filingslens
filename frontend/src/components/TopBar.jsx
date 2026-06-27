import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProductNav from './ProductNav.jsx';
import { useAuth } from '../auth.jsx';
import { apiFetch } from '../api.js';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  async function handleDeleteAccount() {
    await apiFetch('/me', { method: 'DELETE' });
    logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="topbar">
      <Link to="/dashboard" className="brand">FilingLens</Link>
      <ProductNav />
      {user && (
        <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
          <div
            onClick={() => setOpen(o => !o)}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 860,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {getInitials(user.name)}
          </div>

          {open && (
            <div style={{
              position: 'absolute',
              top: 42,
              right: 0,
              background: 'white',
              border: '1px solid var(--line)',
              borderRadius: 14,
              boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
              minWidth: 200,
              zIndex: 100,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontSize: 14, fontWeight: 860, color: 'var(--ink)' }}>{user.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{user.email}</div>
              </div>
              <div style={{ padding: '8px 0' }}>
                <Link
                  to="/settings/billing"
                  onClick={() => setOpen(false)}
                  style={{ display: 'block', padding: '9px 18px', fontSize: 13, fontWeight: 750, color: 'var(--ink)', textDecoration: 'none' }}
                >
                  Billing
                </Link>
                {(user.role === 'firm_admin' || user.role === 'admin') && (
                  <Link
                    to="/settings/team"
                    onClick={() => setOpen(false)}
                    style={{ display: 'block', padding: '9px 18px', fontSize: 13, fontWeight: 750, color: 'var(--ink)', textDecoration: 'none' }}
                  >
                    Team settings
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 18px', fontSize: 13, fontWeight: 750,
                    color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  Sign out
                </button>
                <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0' }} />
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 18px', fontSize: 12, fontWeight: 750,
                      color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Delete account
                  </button>
                ) : (
                  <div style={{ padding: '8px 18px' }}>
                    <div style={{ fontSize: 12, color: 'var(--ink)', marginBottom: 8 }}>This is permanent. Sure?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleDeleteAccount}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 750,
                          color: 'white', background: 'var(--red)', border: 'none',
                          borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        Yes, delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 750,
                          color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)',
                          borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
