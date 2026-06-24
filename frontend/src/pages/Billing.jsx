import React, { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

function statusChipClass(status) {
  if (status === 'active') return 'chip soft-accent';
  if (status === 'canceled') return 'chip red';
  return 'chip';
}

export default function Billing() {
  const toast = useToast();

  const [sub, setSub] = useState(null);
  const [plan, setPlan] = useState(null);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [upgrading, setUpgrading] = useState(null);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/billing/plans'),
      apiFetch('/billing/subscription').catch(err => {
        if (err instanceof ApiError && err.status === 404) { setNotFound(true); return null; }
        throw err;
      }),
    ]).then(([pl, data]) => {
      setPlans(pl);
      if (data) { setSub(data.subscription); setPlan(data.plan); setPayments(data.payments); }
    }).finally(() => setLoading(false));
  }, []);

  async function upgrade(planKey) {
    setUpgrading(planKey);
    try {
      const data = await apiFetch('/billing/subscription', {
        method: 'POST',
        body: JSON.stringify({ planKey }),
      });
      setSub(data.subscription);
      setPlan(data.plan);
      setPayments(prev => [data.payment, ...prev]);
      toast.success(`Switched to ${data.plan.name} plan.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change plan.');
    } finally {
      setUpgrading(null);
    }
  }

  async function cancel() {
    setCanceling(true);
    try {
      const updated = await apiFetch('/billing/subscription', { method: 'DELETE' });
      setSub(updated);
      toast.success('Subscription canceled.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel.');
    } finally {
      setCanceling(false);
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatEur(cents) {
    return `€${(cents / 100).toFixed(2)}`;
  }

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Billing</p>
          <h2>Plan &amp; payments.</h2>
          <p className="lead">Manage your subscription and view payment history.</p>
        </div>

        {loading && <p className="panel-sub">Loading…</p>}

        {!loading && (
          <div className="two-col">
            {/* Current plan */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Current plan</h3>
                  <p className="panel-sub">
                    {notFound
                      ? 'No active subscription.'
                      : plan
                        ? `${plan.name} · ${formatEur(plan.monthlyPrice ?? 0)}/mo`
                        : '—'}
                  </p>
                </div>
                {sub && (
                  <span className={statusChipClass(sub.status)}>
                    {sub.status === 'active' ? 'Active' : sub.status === 'canceled' ? 'Canceled' : sub.status}
                  </span>
                )}
              </div>

              {/* Plans */}
              <div className="row-list">
                {plans.map(p => {
                  const isCurrent = plan?._id === p._id || plan?.key === p.key;
                  return (
                    <div className="data-row" key={p._id}>
                      <div>
                        <div className="row-title">{p.name}</div>
                        <div className="row-sub">{p.description ?? `Up to ${p.seatLimit} seat${p.seatLimit !== 1 ? 's' : ''}`}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span className="chip">{formatEur(p.monthlyPrice ?? 0)}/mo</span>
                        {!isCurrent ? (
                          <button
                            className="button accent"
                            style={{ minHeight: 34, padding: '0 14px', fontSize: 12 }}
                            disabled={!!upgrading || sub?.status === 'canceled'}
                            onClick={() => upgrade(p.key)}
                          >
                            {upgrading === p.key ? 'Switching…' : 'Switch'}
                          </button>
                        ) : (
                          <span className="chip soft-accent">Current</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {sub && sub.status === 'active' && (
                <div className="actions" style={{ paddingTop: 20 }}>
                  <button
                    className="button ghost"
                    style={{ fontSize: 13, color: 'var(--muted)' }}
                    onClick={cancel}
                    disabled={canceling}
                  >
                    {canceling ? 'Canceling…' : 'Cancel subscription'}
                  </button>
                </div>
              )}

              {sub?.canceledAt && (
                <p className="panel-sub" style={{ padding: '0 4px', marginTop: 12 }}>
                  Canceled on {formatDate(sub.canceledAt)}. Access continues until end of billing period.
                </p>
              )}
            </div>

            {/* Payment history */}
            <div className="panel dark">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Payment history</h3>
                  <p className="panel-sub">{payments.length} payment{payments.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="row-list">
                {payments.length === 0 && (
                  <p className="panel-sub" style={{ padding: '0 4px' }}>No payments yet.</p>
                )}
                {payments.map(p => (
                  <div className="data-row" key={p._id}>
                    <div>
                      <div className="row-title" style={{ color: 'white' }}>{formatEur(p.amount)}</div>
                      <div className="row-sub" style={{ color: '#8fa898' }}>{formatDate(p.paidAt ?? p.createdAt)}</div>
                    </div>
                    <span className={`chip ${p.status === 'succeeded' ? 'soft-accent' : 'red'}`}>
                      {p.status === 'succeeded' ? 'Paid' : p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
