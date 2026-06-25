import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';

// Forced after register, also reachable if someone manually visits while
// already without a subscription. The user can't change plans; the plan
// (solo or team) is determined by the firm presence and seats are baked
// into the firm at registration.
//
// Server-computed amount mirrored on the frontend for display:
//   amount = basePrice + max(0, seats - baseSeats) * extraSeatPrice
export default function PlanAndPay() {
  const { user, reloadSubscription } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [cardName, setCardName] = useState(user?.name ?? '');
  const [cardLast4, setCardLast4] = useState('4242');

  useEffect(() => {
    apiFetch('/billing/plans').then(setPlans).finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const isTeam = !!user?.firmId;
  const plan = plans.find((p) => p.key === (isTeam ? 'team' : 'solo'));
  const seats = isTeam ? user.firm?.seatLimit ?? plan?.baseSeats : 1;
  const amount = plan ? plan.basePrice + Math.max(0, seats - plan.baseSeats) * plan.extraSeatPrice : 0;

  async function confirm() {
    setPaying(true);
    try {
      await apiFetch('/billing/subscribe', { method: 'POST', body: JSON.stringify({}) });
      await reloadSubscription();
      toast.success(`Charged €${amount}/mo. You're in.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Payment failed.');
    } finally { setPaying(false); }
  }

  return (
    <section className="screen">
      <div className="login-grid">
        <div>
          <p className="eyebrow">One more step</p>
          <h2>Confirm your plan.</h2>
          <p className="lead">
            Mock payment — no real charge. You can run analyses, save reports
            and invite team members once we record this transaction.
          </p>
        </div>

        <div className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="brand">FilingLens</div>
            <span className="chip soft-accent">{plan?.name} plan</span>
          </div>

          <h3 className="panel-title" style={{ marginTop: 28 }}>{plan?.name} · €{amount}/mo</h3>
          <p className="panel-sub">
            {isTeam
              ? `€${plan.basePrice} base for ${plan.baseSeats} seats + €${plan.extraSeatPrice} × ${Math.max(0, seats - plan.baseSeats)} extra = €${amount}/mo for ${seats} seats.`
              : `€${plan.basePrice}/mo for one analyst.`}
          </p>

          <div className="login-field" style={{ marginTop: 24 }}>
            <div className="field-label">Cardholder</div>
            <input className="field-input" value={cardName} onChange={(e) => setCardName(e.target.value)} />
          </div>
          <div className="login-field">
            <div className="field-label">Card (last 4 digits)</div>
            <input className="field-input" value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} maxLength={4} pattern="\d{4}" />
          </div>
          <p className="row-sub" style={{ marginTop: 6 }}>Demo card. No real charge.</p>

          <div className="actions" style={{ marginTop: 26 }}>
            <button className="button accent" onClick={confirm} disabled={paying || !cardName || !cardLast4} style={{ flex: 1 }}>
              {paying ? 'Charging…' : `Confirm & charge €${amount} monthly`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
