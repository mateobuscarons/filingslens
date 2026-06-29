import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

export default function Billing() {
  const { reloadSubscription, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    apiFetch('/billing/subscription').then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;
  const { subscription: sub, plan, payments } = data;
  const latest = payments[0]?.amount ?? plan?.basePrice;
  const isTeamAdmin = user?.role === 'firm_admin';

  async function cancelSub() {
    setCanceling(true);
    try {
      const result = await apiFetch('/billing/subscription', { method: 'DELETE' });
      const cancelDate = new Date(result.cancelAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      setData(prev => ({ ...prev, subscription: { ...prev.subscription, cancelAtPeriodEnd: true, currentPeriodEnd: result.cancelAt } }));
      toast.success(`Subscription cancelled. Access until ${cancelDate}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel.');
    } finally { setCanceling(false); setConfirming(false); }
  }

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p className="eyebrow">Billing</p>
            <h2>{plan?.name} plan · €{latest}/mo</h2>
            <p className="lead">
              {sub.cancelAtPeriodEnd
                ? `Cancels on ${new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} — full access until then.`
                : `Active since ${new Date(sub.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
            </p>
          </div>
          {!isTeamAdmin && (
            <div style={{ flexShrink: 0, paddingTop: 8, display: 'flex', gap: 14, alignItems: 'center' }}>
              {sub.cancelAtPeriodEnd ? (
                <Link to="/billing/setup" style={{ fontSize: 13, color: '#22a05a', textDecoration: 'underline', fontWeight: 750 }}>
                  Renew
                </Link>
              ) : !confirming ? (
                <button onClick={() => setConfirming(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--red)', textDecoration: 'underline', padding: 0, fontWeight: 750 }}>
                  Cancel subscription
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>Sure?</span>
                  <button onClick={cancelSub} disabled={canceling} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--red)', textDecoration: 'underline', padding: 0, fontWeight: 750 }}>
                    {canceling ? 'Cancelling…' : 'Yes'}
                  </button>
                  <button onClick={() => setConfirming(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', textDecoration: 'underline', padding: 0 }}>
                    Keep
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Payment history</h3>
              <p className="panel-sub">{payments.length} payment{payments.length === 1 ? '' : 's'} on file.</p>
            </div>
          </div>
          <div className="row-list">
            {payments.length === 0 && (
              <p className="panel-sub" style={{ padding: '0 4px' }}>No payments yet.</p>
            )}
            {payments.map((p) => (
              <div className="data-row" key={p._id}>
                <div>
                  <div className="row-title">€{p.amount}</div>
                  <div className="row-sub">{new Date(p.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
                <span className={`chip ${p.status === 'succeeded' ? 'soft-accent' : 'red'}`}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
