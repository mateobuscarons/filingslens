import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Subscription } from '../models/subscription.js';
import { PricingPlan } from '../models/pricingPlan.js';
import { Payment } from '../models/payment.js';
import { InvestmentFirm } from '../models/firm.js';

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

router.get('/subscription', requireAuth, async (req, res) => {
  const sub = await findSubscription(req.user);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'No subscription yet' });
  const plan = await PricingPlan.findById(sub.planId);
  const payments = await Payment.find({ subscriptionId: sub._id }).sort({ paidAt: -1 });
  res.json({ subscription: sub, plan, payments });
});

router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    if (await findSubscription(req.user)) {
      return res.status(409).json({
        error: 'ALREADY_SUBSCRIBED',
        message: 'A subscription already exists for this account',
      });
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
      method: 'mock',
    });

    res.status(201).json({ subscription: sub, plan, payment, amount });
  } catch (err) {
    next(err);
  }
});

export default router;
