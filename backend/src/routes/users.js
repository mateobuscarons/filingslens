import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { InvestmentFirm } from '../models/firm.js';
import { User } from '../models/user.js';
import { Subscription } from '../models/subscription.js';
import { Payment } from '../models/payment.js';
import { ResearchReport, ReportItem } from '../models/report.js';
import { TeamInvite } from '../models/teamInvite.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const firm = req.user.firmId ? await InvestmentFirm.findById(req.user.firmId) : null;
  res.json({
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    firmId: req.user.firmId,
    firm: firm ? { id: firm._id, name: firm.name, seatLimit: firm.seatLimit } : null,
  });
});

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

router.patch('/', requireAuth, validate(patchSchema), async (req, res, next) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    if (name) req.user.name = name;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          error: 'VALIDATION',
          message: 'currentPassword required to change password',
          fields: { currentPassword: 'Required when changing password' },
        });
      }
      const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
      if (!ok) {
        return res.status(400).json({
          error: 'VALIDATION',
          message: 'Current password is incorrect',
          fields: { currentPassword: 'Incorrect' },
        });
      }
      req.user.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user;

    // Block solo accounts from deleting if they're a firm admin with other members
    if (user.firmId && user.role === 'firm_admin') {
      const otherMembers = await User.countDocuments({ firmId: user.firmId, _id: { $ne: user._id } });
      if (otherMembers > 0) {
        return res.status(400).json({
          error: 'VALIDATION',
          message: 'Transfer admin role or remove all members before deleting your account',
        });
      }
      // Last person in the firm — delete firm, invites, and its subscription
      const firm = await InvestmentFirm.findById(user.firmId);
      if (firm) {
        const sub = await Subscription.findOne({ subscriberType: 'InvestmentFirm', subscriberId: firm._id });
        if (sub) {
          await Payment.deleteMany({ subscriptionId: sub._id });
          await sub.deleteOne();
        }
        await TeamInvite.deleteMany({ firmId: firm._id });
        await firm.deleteOne();
      }
    } else {
      // Solo user — delete their own subscription
      const sub = await Subscription.findOne({ subscriberType: 'User', subscriberId: user._id });
      if (sub) {
        await Payment.deleteMany({ subscriptionId: sub._id });
        await sub.deleteOne();
      }
    }

    // Delete all reports and their items
    const reports = await ResearchReport.find({ userId: user._id });
    for (const r of reports) {
      await ReportItem.deleteMany({ reportId: r._id });
      await r.deleteOne();
    }

    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
