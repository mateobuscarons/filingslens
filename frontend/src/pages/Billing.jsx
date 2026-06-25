import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import TopBar from '../components/TopBar.jsx';

// Read-only. Subscription writes happen only at signup time (PlanAndPay).
export default function Billing() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/billing/subscription').then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;
  const { subscription: sub, plan, payments } = data;
  const latest = payments[0]?.amount ?? plan?.basePrice;

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Billing</p>
          <h2>{plan?.name} plan · €{latest}/mo</h2>
          <p className="lead">
            Status: {sub.status} · started {new Date(sub.startedAt).toLocaleDateString()}.
            Plan and seat changes are not available in-app — contact support.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Payment history</h3>
              <p className="panel-sub">{payments.length} mock payment{payments.length === 1 ? '' : 's'} on file.</p>
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
                  <div className="row-sub">{new Date(p.paidAt).toLocaleString()} · {p.method}</div>
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
