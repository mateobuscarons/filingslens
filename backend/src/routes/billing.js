import Stripe from 'stripe';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Subscription } from '../models/subscription.js';
import { PricingPlan } from '../models/pricingPlan.js';
import { Payment } from '../models/payment.js';
import { InvestmentFirm } from '../models/firm.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const router = Router();

// Subscriptions are immutable post-signup: one POST /billing/subscribe creates
// both the Subscription and the first Payment. There is no upgrade endpoint,
// no cancel endpoint, no PATCH on the firm.
//
// Pricing is server-computed:
//   amount = plan.basePrice + max(0, seats - plan.baseSeats) * plan.extraSeatPrice
//   seats  = firm.seatLimit for team plans, 1 for solo

function computeAmount(plan, seats) {
  return plan.basePrice + Math.max(0, seats - plan.baseSeats) * plan.extraSeatPrice;
}

async function findSubscription(user) {
  if (user.firmId) {
    return Subscription.findOne({ subscriberType: 'InvestmentFirm', subscriberId: user.firmId });
  }
  return Subscription.findOne({ subscriberType: 'User', subscriberId: user._id });
}

router.get('/plans', requireAuth, async (req, res) => {
  const plans = await PricingPlan.find().sort({ basePrice: 1 });
  res.json(plans);
});

router.post('/create-payment-intent', requireAuth, async (req, res, next) => {
  try {
    const isTeam = !!req.user.firmId;
    const plan = await PricingPlan.findOne({ key: isTeam ? 'team' : 'solo' });
    if (!plan) return res.status(500).json({ error: 'CONFIG', message: 'Pricing plan missing — reseed' });

    let seats = 1;
    if (isTeam) {
      const firm = await InvestmentFirm.findById(req.user.firmId);
      seats = firm.seatLimit;
    }
    const amountEur = computeAmount(plan, seats);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountEur * 100), // cents
      currency: 'eur',
      metadata: { userId: String(req.user._id) },
    });
    res.json({ clientSecret: intent.client_secret, amount: amountEur });
  } catch (err) { next(err); }
});

router.get('/subscription', requireAuth, async (req, res) => {
  const sub = await findSubscription(req.user);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'No subscription yet' });
  const plan = await PricingPlan.findById(sub.planId);
  const payments = await Payment.find({ subscriptionId: sub._id }).sort({ paidAt: -1 });
  res.json({ subscription: sub, plan, payments });
});

router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const existing = await findSubscription(req.user);
    if (existing && existing.status !== 'canceled' && !existing.cancelAtPeriodEnd) {
      return res.status(409).json({ error: 'ALREADY_SUBSCRIBED', message: 'A subscription already exists for this account' });
    }
    if (existing) await existing.deleteOne();

    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'VALIDATION', message: 'paymentIntentId required' });
    }

    // Verify with Stripe that the payment actually succeeded
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(402).json({ error: 'PAYMENT_FAILED', message: `Payment status: ${intent.status}` });
    }

    const isTeam = !!req.user.firmId;
    const plan = await PricingPlan.findOne({ key: isTeam ? 'team' : 'solo' });
    if (!plan) return res.status(500).json({ error: 'CONFIG', message: 'Pricing plan missing — reseed' });

    let seats = 1;
    if (isTeam) {
      const firm = await InvestmentFirm.findById(req.user.firmId);
      seats = firm.seatLimit;
    }
    const amount = computeAmount(plan, seats);

    const sub = await Subscription.create({
      subscriberType: isTeam ? 'InvestmentFirm' : 'User',
      subscriberId: isTeam ? req.user.firmId : req.user._id,
      planId: plan._id,
      status: 'active',
    });
    const payment = await Payment.create({
      subscriptionId: sub._id,
      amount,
      currency: 'EUR',
      status: 'succeeded',
      method: 'stripe',
      stripePaymentIntentId: paymentIntentId,
    });

    res.status(201).json({ subscription: sub, plan, payment, amount });
  } catch (err) {
    next(err);
  }
});


router.post('/subscription/renew', requireAuth, async (req, res, next) => {
  try {
    const sub = await findSubscription(req.user);
    if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'No subscription' });
    if (!sub.cancelAtPeriodEnd) return res.status(409).json({ error: 'NOT_CANCELED', message: 'Not scheduled for cancellation' });
    sub.cancelAtPeriodEnd = false;
    sub.currentPeriodEnd = null;
    sub.canceledAt = null;
    await sub.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/subscription', requireAuth, async (req, res, next) => {
  try {
    const sub = await findSubscription(req.user);
    if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'No active subscription' });
    if (sub.status === 'canceled' || sub.cancelAtPeriodEnd) {
      return res.status(409).json({ error: 'ALREADY_CANCELED', message: 'Subscription already scheduled for cancellation' });
    }
    // Compute next billing date: same day-of-month next month
    const now = new Date();
    const periodEnd = new Date(sub.startedAt);
    while (periodEnd <= now) periodEnd.setMonth(periodEnd.getMonth() + 1);
    sub.cancelAtPeriodEnd = true;
    sub.currentPeriodEnd = periodEnd;
    sub.canceledAt = now;
    await sub.save();
    res.json({ ok: true, cancelAt: periodEnd });
  } catch (err) { next(err); }
});

export default router;
