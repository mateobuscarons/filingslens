import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const ELEMENT_STYLE = {
  style: {
    base: {
      fontFamily: '"Inter", "DM Sans", sans-serif',
      fontSize: '15px',
      color: '#1a1a1a',
      '::placeholder': { color: '#aab4c4' },
    },
    invalid: { color: '#d94f4f' },
  },
};

function CheckoutForm({ amount }) {
  const stripe = useStripe();
  const elements = useElements();
  const { reloadSubscription } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [paying, setPaying] = useState(false);
  const [cardError, setCardError] = useState('');

  async function confirm(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setCardError('');
    try {
      const { clientSecret } = await apiFetch('/billing/create-payment-intent', { method: 'POST' });

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardNumberElement) },
      });
      if (error) {
        setCardError(error.message);
        setPaying(false);
        return;
      }

      await apiFetch('/billing/subscribe', {
        method: 'POST',
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      });
      await reloadSubscription();
      toast.success(`Payment confirmed. You're in.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Payment failed.');
    } finally { setPaying(false); }
  }

  return (
    <form onSubmit={confirm}>
      <div className="login-field" style={{ marginTop: 24 }}>
        <div className="field-label">Card number</div>
        <div className="stripe-field">
          <CardNumberElement options={ELEMENT_STYLE} onChange={() => setCardError('')} />
        </div>
      </div>

      <div className="card-pair">
        <div className="login-field">
          <div className="field-label">Expiry</div>
          <div className="stripe-field">
            <CardExpiryElement options={ELEMENT_STYLE} onChange={() => setCardError('')} />
          </div>
        </div>
        <div className="login-field">
          <div className="field-label">CVC</div>
          <div className="stripe-field">
            <CardCvcElement options={ELEMENT_STYLE} onChange={() => setCardError('')} />
          </div>
        </div>
      </div>

      {cardError && <p className="card-error">{cardError}</p>}
      <div className="actions form">
        <button className="button accent" type="submit" disabled={!stripe || paying} style={{ flex: 1 }}>
          {paying ? 'Processing…' : `Pay €${amount}/mo`}
        </button>
      </div>
    </form>
  );
}

export default function PlanAndPay() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/billing/plans').then(setPlans).finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const isTeam = !!user?.firmId;
  const plan = plans.find((p) => p.key === (isTeam ? 'team' : 'solo'));
  const seats = isTeam ? user.firm?.seatLimit ?? plan?.baseSeats : 1;
  const amount = plan ? plan.basePrice + Math.max(0, seats - plan.baseSeats) * plan.extraSeatPrice : 0;

  return (
    <section className="screen">
      <div className="login-grid">
        <div>
          <p className="eyebrow">One more step</p>
          <h2>Confirm your plan.</h2>
          <p className="lead">
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>

        <div className="login-card">
          <div className="login-card-head">
            <div className="brand">FilingLens</div>
            <span className="chip soft-accent">{plan?.name} plan</span>
          </div>

          <h3 className="panel-title" style={{ marginTop: 28 }}>{plan?.name} · €{amount}/mo</h3>
          <p className="panel-sub">
            {isTeam
              ? `€${plan.basePrice} base for ${plan.baseSeats} seats + €${plan.extraSeatPrice} × ${Math.max(0, seats - plan.baseSeats)} extra = €${amount}/mo for ${seats} seats.`
              : `€${plan.basePrice}/mo for one analyst.`}
          </p>

          <Elements stripe={stripePromise}>
            <CheckoutForm amount={amount} />
          </Elements>
        </div>
      </div>
    </section>
  );
}
