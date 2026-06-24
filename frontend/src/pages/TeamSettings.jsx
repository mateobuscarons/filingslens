import React, { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

export default function TeamSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const firmId = user?.firmId;

  const [firm, setFirm] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('firm_analyst');
  const [inviting, setInviting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!firmId) return;
    Promise.all([
      apiFetch(`/firms/${firmId}`),
      apiFetch(`/firms/${firmId}/members`),
    ]).then(([f, m]) => { setFirm(f); setMembers(m); }).finally(() => setLoading(false));
  }, [firmId]);

  async function handleInvite(e) {
    e.preventDefault();
    setFieldErrors({});
    setInviting(true);
    try {
      const newMember = await apiFetch(`/firms/${firmId}/members`, {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      setMembers(prev => [...prev, newMember]);
      setName(''); setEmail(''); setPassword(''); setRole('firm_analyst');
      toast.success(`${newMember.name} added to the firm.`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SEAT_LIMIT') toast.error(err.message);
        else setFieldErrors(err.fields || { _form: err.message });
      }
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(memberId, memberName) {
    try {
      await apiFetch(`/firms/${firmId}/members/${memberId}`, { method: 'DELETE' });
      setMembers(prev => prev.filter(m => m._id !== memberId));
      toast.success(`${memberName} removed.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove member.');
    }
  }

  if (!firmId) return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />
        <p className="lead">You are not part of a firm workspace.</p>
      </div>
    </div>
  );

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Team</p>
          <h2>{firm?.name ?? 'Team settings'}</h2>
          <p className="lead">Manage your firm's members and seats.</p>
        </div>

        {firm && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span className="chip soft-accent">{firm.memberCount} of {firm.seatLimit} seats used</span>
            <span className="chip">{firm.name}</span>
          </div>
        )}

        <div className="two-col">
          {/* Members list */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Members</h3>
                <p className="panel-sub">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="row-list">
              {loading && <p className="panel-sub" style={{ padding: '0 4px' }}>Loading…</p>}
              {members.map(m => (
                <div className="data-row" key={m._id}>
                  <div>
                    <div className="row-title">{m.name}</div>
                    <div className="row-sub">{m.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`chip ${m.role === 'firm_admin' ? 'accent' : ''}`}>
                      {m.role === 'firm_admin' ? 'Admin' : 'Analyst'}
                    </span>
                    {m._id !== user?.id && (
                      <button
                        onClick={() => removeMember(m._id, m.name)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--red)', fontSize: 12, fontWeight: 800, padding: 0,
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invite form */}
          <div className="panel dark">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Add member</h3>
                <p className="panel-sub">Create a login for a new analyst in your firm.</p>
              </div>
            </div>
            <form onSubmit={handleInvite} style={{ padding: '24px 36px 36px', display: 'grid', gap: 14 }}>
              <div className="login-field" style={{ background: 'var(--dark-soft)', borderColor: 'transparent' }}>
                <div className="field-label" style={{ color: '#c6d1ca' }}>Full name</div>
                <input className="field-input" style={{ color: 'white' }} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Klaus Müller" required />
                {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
              </div>
              <div className="login-field" style={{ background: 'var(--dark-soft)', borderColor: 'transparent' }}>
                <div className="field-label" style={{ color: '#c6d1ca' }}>Work email</div>
                <input className="field-input" style={{ color: 'white' }} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="analyst@firm.com" required />
                {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
              </div>
              <div className="login-field" style={{ background: 'var(--dark-soft)', borderColor: 'transparent' }}>
                <div className="field-label" style={{ color: '#c6d1ca' }}>Temporary password</div>
                <input className="field-input" style={{ color: 'white' }} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required />
              </div>
              <div className="login-field" style={{ background: 'var(--dark-soft)', borderColor: 'transparent' }}>
                <div className="field-label" style={{ color: '#c6d1ca' }}>Role</div>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 15, fontWeight: 750, fontFamily: 'inherit', marginTop: 6, outline: 'none', width: '100%' }}
                >
                  <option value="firm_analyst" style={{ color: 'var(--ink)' }}>Analyst</option>
                  <option value="firm_admin" style={{ color: 'var(--ink)' }}>Admin</option>
                </select>
              </div>
              {fieldErrors._form && <p style={{ color: 'var(--red)', fontSize: 13, fontWeight: 700, margin: 0 }}>{fieldErrors._form}</p>}
              <button className="button accent" type="submit" disabled={inviting}>
                {inviting ? 'Adding…' : 'Add member'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
