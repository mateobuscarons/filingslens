import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/user.js';
import { InvestmentFirm } from '../models/firm.js';
import { PricingPlan } from '../models/pricingPlan.js';
import { Subscription } from '../models/subscription.js';
import { signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const registerSchema = z
  .object({
    mode: z.enum(['solo', 'team']),
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    firmName: z.string().min(2).optional(),
  })
  .refine((d) => d.mode !== 'team' || !!d.firmName, {
    message: 'firmName is required for team registration',
    path: ['firmName'],
  });

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { mode, name, email, password, firmName } = req.body;
    if (await User.findOne({ email })) {
      return res.status(409).json({
        error: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
        fields: { email: 'Already registered' },
      });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    let firm = null;
    let role = 'solo';
    if (mode === 'team') {
      firm = await InvestmentFirm.create({ name: firmName, seatLimit: 5 });
      role = 'firm_admin';
    }

    const user = await User.create({ name, email, passwordHash, role, firmId: firm?._id || null });

    const plan = await PricingPlan.findOne({ key: mode === 'team' ? 'team' : 'solo' });
    if (plan) {
      await Subscription.create({
        subscriberType: mode === 'team' ? 'InvestmentFirm' : 'User',
        subscriberId: mode === 'team' ? firm._id : user._id,
        planId: plan._id,
        status: 'active',
      });
    }

    res.status(201).json({ token: signToken(user), user: publicUser(user, firm) });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password incorrect' });
    }
    const firm = user.firmId ? await InvestmentFirm.findById(user.firmId) : null;
    res.json({ token: signToken(user), user: publicUser(user, firm) });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'VALIDATION', message: 'email required' });
    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: true }); // don't reveal whether email exists
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    user.resetToken = token;
    user.resetTokenExpiry = new Date(Date.now() + 3600_000); // 1 hour
    await user.save();
    res.json({ ok: true, resetToken: token }); // dev: token in response body
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'VALIDATION', message: 'token and password required' });
    }
    const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: new Date() } });
    if (!user) {
      return res.status(400).json({ error: 'INVALID_TOKEN', message: 'Token is invalid or expired' });
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

function publicUser(user, firm) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    firmId: user.firmId,
    firm: firm ? { id: firm._id, name: firm.name, seatLimit: firm.seatLimit } : null,
  };
}

export default router;
