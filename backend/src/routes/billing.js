import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Subscription } from '../models/subscription.js';
import { PricingPlan } from '../models/pricingPlan.js';
import { Payment } from '../models/payment.js';

const router = Router();

async function currentSubscription(user) {
  if (user.firmId) {
    return Subscription.findOne({ subscriberType: 'InvestmentFirm', subscriberId: user.firmId });
  }
  return Subscription.findOne({ subscriberType: 'User', subscriberId: user._id });
}

router.get('/plans', requireAuth, async (req, res) => {
  const plans = await PricingPlan.find().sort({ monthlyPrice: 1 });
  res.json(plans);
});

router.get('/subscription', requireAuth, async (req, res) => {
  const sub = await currentSubscription(req.user);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'No subscription found' });
  const plan = await PricingPlan.findById(sub.planId);
  const payments = await Payment.find({ subscriptionId: sub._id }).sort({ paidAt: -1 }).limit(20);
  res.json({ subscription: sub, plan, payments });
});

const upgradeSchema = z.object({ planKey: z.enum(['solo', 'team']) });

router.post('/subscription', requireAuth, validate(upgradeSchema), async (req, res, next) => {
  try {
    const plan = await PricingPlan.findOne({ key: req.body.planKey });
    if (!plan) return res.status(404).json({ error: 'NOT_FOUND', message: 'Plan not found' });
    const sub = await currentSubscription(req.user);
    if (!sub) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'No subscription found — sign up first' });
    }
    sub.planId = plan._id;
    sub.status = 'active';
    sub.canceledAt = null;
    await sub.save();
    const payment = await Payment.create({
      subscriptionId: sub._id,
      amount: plan.monthlyPrice,
      currency: 'EUR',
      status: 'succeeded',
      method: 'mock',
    });
    res.json({ subscription: sub, plan, payment });
  } catch (err) {
    next(err);
  }
});

router.delete('/subscription', requireAuth, async (req, res, next) => {
  try {
    const sub = await currentSubscription(req.user);
    if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'No subscription found' });
    sub.status = 'canceled';
    sub.canceledAt = new Date();
    await sub.save();
    res.json(sub);
  } catch (err) {
    next(err);
  }
});

export default router;
