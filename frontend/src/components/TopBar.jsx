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
  const { user, logout, subscription } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const ref = useRef(null);
  const bellRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setConfirmDelete(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!user) return;
    function fetchNotifications() {
      apiFetch('/notifications').then(setNotifications).catch(() => {});
    }
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [user]);

  const unread = notifications.filter(n => !n.read).length;

  async function openBell() {
    setBellOpen(o => !o);
    if (unread > 0) {
      apiFetch('/notifications/read-all', { method: 'PATCH' }).then(() => {
        setNotifications(ns => ns.map(n => ({ ...n, read: true })));
      });
    }
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {subscription?.cancelAtPeriodEnd && (
          <Link
            to="/settings/billing"
            style={{
              fontSize: 12, fontWeight: 750, color: 'var(--red)',
              background: '#fff0f0', border: '1px solid #ffc5c5',
              borderRadius: 20, padding: '4px 12px',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            Plan cancels {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </Link>
        )}

        {/* Bell */}
        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            onClick={openBell}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, position: 'relative', display: 'flex', alignItems: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                background: 'var(--accent)', color: 'white',
                borderRadius: '50%', width: 14, height: 14,
                fontSize: 9, fontWeight: 860, display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {bellOpen && (
            <div style={{
              position: 'absolute', top: 38, right: 0,
              background: 'white', border: '1px solid var(--line)',
              borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
              minWidth: 280, maxWidth: 340, zIndex: 100, overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--line)', fontSize: 13, fontWeight: 860 }}>
                Notifications
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: '18px', fontSize: 13, color: 'var(--muted)' }}>All caught up.</div>
              ) : notifications.map(n => (
                <div
                  key={n._id}
                  onClick={() => { if (n.link) { navigate(n.link); setBellOpen(false); } }}
                  style={{
                    padding: '11px 18px',
                    fontSize: 13,
                    fontWeight: n.read ? 500 : 750,
                    color: 'var(--ink)',
                    cursor: n.link ? 'pointer' : 'default',
                    borderBottom: '1px solid var(--line)',
                    background: n.read ? 'white' : 'var(--surface)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'white' : 'var(--surface)'}
                >
                  <div>{n.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avatar */}
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
                  to="/settings/profile"
                  onClick={() => setOpen(false)}
                  style={{ display: 'block', padding: '9px 18px', fontSize: 13, fontWeight: 750, color: 'var(--ink)', textDecoration: 'none' }}
                >
                  Profile
                </Link>
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
        </div>
      )}
    </div>
  );
}
