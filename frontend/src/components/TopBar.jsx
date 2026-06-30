import { useEffect, useRef, useState } from 'react';
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
        <div className="topbar-actions">
          {subscription?.cancelAtPeriodEnd && (
            <Link className="cancel-chip" to="/settings/billing">
              Plan cancels {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Link>
          )}

          {/* Bell */}
          <div className="bell-wrap" ref={bellRef}>
            <button className="bell-btn" onClick={openBell}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {bellOpen && (
              <div className="notif-dropdown">
                <div className="notif-head">Notifications</div>
                {notifications.length === 0 ? (
                  <div className="notif-empty">All caught up.</div>
                ) : notifications.map(n => (
                  <div
                    key={n._id}
                    className={`notif-item${n.read ? '' : ' unread'}${n.link ? ' linked' : ''}`}
                    onClick={() => { if (n.link) { navigate(n.link); setBellOpen(false); } }}
                  >
                    <div>{n.message}</div>
                    <div className="notif-time">
                      {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div className="avatar-wrap" ref={ref}>
            <div className="avatar" onClick={() => setOpen(o => !o)}>
              {getInitials(user.name)}
            </div>
            {open && (
              <div className="user-dropdown">
                <div className="user-dropdown-head">
                  <div className="user-dropdown-name">{user.name}</div>
                  <div className="user-dropdown-email">{user.email}</div>
                </div>
                <div className="user-dropdown-body">
                  <Link className="user-dropdown-item" to="/settings/profile" onClick={() => setOpen(false)}>Profile</Link>
                  <Link className="user-dropdown-item" to="/settings/billing" onClick={() => setOpen(false)}>Billing</Link>
                  {(user.role === 'firm_admin' || user.role === 'admin') && (
                    <Link className="user-dropdown-item" to="/settings/team" onClick={() => setOpen(false)}>Team settings</Link>
                  )}
                  <button className="user-dropdown-item danger" onClick={handleLogout}>Sign out</button>
                  <div className="user-dropdown-divider" />
                  {!confirmDelete ? (
                    <button className="user-dropdown-item secondary" onClick={() => setConfirmDelete(true)}>
                      Delete account
                    </button>
                  ) : (
                    <div className="user-dropdown-confirm">
                      <div className="user-dropdown-confirm-text">This is permanent. Sure?</div>
                      <div className="user-dropdown-confirm-actions">
                        <button className="btn-danger" onClick={handleDeleteAccount}>Yes, delete</button>
                        <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
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
