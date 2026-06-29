import React, { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

// Members list + Invites panel. Admin-only (route is wrapped in AdminRoute).
export default function TeamSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const firmId = user?.firmId;

  const [firm, setFirm] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [errors, setErrors] = useState({});

  async function refresh() {
    if (!firmId) return;
    const [f, m, i] = await Promise.all([
      apiFetch(`/firms/${firmId}`),
      apiFetch(`/firms/${firmId}/members`),
      apiFetch(`/firms/${firmId}/invites`),
    ]);
    setFirm(f); setMembers(m); setInvites(i);
  }

  useEffect(() => { refresh(); /* eslint-disable-line */ }, [firmId]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleInvite(e) {
    e.preventDefault();
    const ve = {};
    if (!name.trim() || name.trim().length < 2) ve.name = 'Name must be at least 2 characters.';
    if (!EMAIL_RE.test(email)) ve.email = 'Enter a valid email address.';
    if (Object.keys(ve).length) { setErrors(ve); return; }
    setInviting(true); setErrors({});
    try {
      const invite = await apiFetch(`/firms/${firmId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ name, email }),
      });
      setInvites((prev) => [invite, ...prev]);
      setName(''); setEmail('');
      toast.success(`Invite sent to ${invite.email}. They'll receive a code by email.`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields ?? { _form: err.message });
      else toast.error('Could not create invite.');
    } finally { setInviting(false); }
  }

  async function revoke(inv) {
    try {
      await apiFetch(`/firms/${firmId}/invites/${inv._id}`, { method: 'DELETE' });
      setInvites((prev) => prev.map((i) => i._id === inv._id ? { ...i, status: 'revoked' } : i));
    } catch (err) { toast.error('Could not revoke invite.'); }
  }

  async function removeMember(m) {
    const ok = confirm(
      `Delete ${m.name}'s account?\n\n` +
      `This permanently removes ${m.name} from the firm AND deletes everything they own — ` +
      `their analyses, findings, reports, and Q&A sessions. This cannot be undone.`
    );
    if (!ok) return;
    try {
      await apiFetch(`/firms/${firmId}/members/${m._id}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((x) => x._id !== m._id));
      toast.success(`${m.name}'s account deleted.`);
    } catch (err) { toast.error('Could not delete account.'); }
  }

  if (!firmId) {
    return (
      <div className="screen">
        <div className="app-grid">
          <TopBar />
          <p className="lead">You are not part of a firm.</p>
        </div>
      </div>
    );
  }

  const pendingInvites = invites.filter((i) => i.status === 'pending');
  const seatsUsed = members.length + pendingInvites.length;

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Team</p>
          <h2>{firm?.name ?? 'Team settings'}</h2>
          <p className="lead">
            {seatsUsed} of {firm?.seatLimit ?? '?'} seats used ({members.length} members, {pendingInvites.length} pending invites).
          </p>
        </div>

        <div className="two-col">
          {/* Members */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Members</h3>
                <p className="panel-sub">Everyone with access to this firm.</p>
              </div>
            </div>
            <div className="row-list">
              {members.map((m) => (
                <div className="data-row" key={m._id}>
                  <div>
                    <div className="row-title">{m.name}</div>
                    <div className="row-sub">{m.email} · {m.role === 'firm_admin' ? 'Admin' : 'Analyst'}</div>
                  </div>
                  {m._id !== user.id && (
                    <button className="chip red" style={{ border: 'none', cursor: 'pointer' }} onClick={() => removeMember(m)}>
                      Delete account
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Invites */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Invite a member</h3>
                <p className="panel-sub">An invite code is emailed directly to the invitee. They register using it.</p>
              </div>
            </div>
            <form onSubmit={handleInvite} style={{ padding: '0 40px 32px' }}>
              <div className="login-field">
                <div className="field-label">Full name</div>
                <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
                {errors.name && <div className="field-error">{errors.name}</div>}
              </div>
              <div className="login-field">
                <div className="field-label">Email</div>
                <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {errors.email && <div className="field-error">{errors.email}</div>}
              </div>
              {errors._form && <p style={{ color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>{errors._form}</p>}
              <div className="actions">
                <button className="button accent" type="submit" disabled={inviting || seatsUsed >= (firm?.seatLimit ?? 0)}>
                  {inviting ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>

            {pendingInvites.length > 0 && (
              <div className="row-list">
                {pendingInvites.map((inv) => (
                  <div className="data-row" key={inv._id}>
                    <div>
                      <div className="row-title">{inv.name}</div>
                      <div className="row-sub">{inv.email}</div>
                    </div>
                    <button className="chip" style={{ border: 'none', cursor: 'pointer' }} onClick={() => revoke(inv)}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
