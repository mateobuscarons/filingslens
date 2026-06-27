import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAuth, requireFirmAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { InvestmentFirm } from '../models/firm.js';
import { User } from '../models/user.js';
import { TeamInvite } from '../models/teamInvite.js';
import { sendInvite } from '../email.js';

const router = Router();

function assertFirmAccess(req, firm) {
  if (!req.user.firmId || !req.user.firmId.equals(firm._id)) {
    const err = new Error('Not a member of this firm');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
}

async function loadFirmOr404(req, res) {
  const firm = await InvestmentFirm.findById(req.params.id);
  if (!firm) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Firm not found' });
    return null;
  }
  assertFirmAccess(req, firm);
  return firm;
}

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const firm = await loadFirmOr404(req, res);
    if (!firm) return;
    const memberCount = await User.countDocuments({ firmId: firm._id });
    res.json({ ...firm.toObject(), memberCount });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const firm = await loadFirmOr404(req, res);
    if (!firm) return;
    const members = await User.find({ firmId: firm._id }).select('name email role createdAt');
    res.json(members);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:userId', requireAuth, requireFirmAdmin, async (req, res, next) => {
  try {
    const firm = await loadFirmOr404(req, res);
    if (!firm) return;
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'VALIDATION', message: 'Admins cannot remove themselves' });
    }
    const user = await User.findOne({ _id: req.params.userId, firmId: firm._id });
    if (!user) return res.status(404).json({ error: 'NOT_FOUND', message: 'Member not found' });
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Invites ---------------------------------------------------------------

router.get('/:id/invites', requireAuth, async (req, res, next) => {
  try {
    const firm = await loadFirmOr404(req, res);
    if (!firm) return;
    const invites = await TeamInvite.find({ firmId: firm._id }).sort({ createdAt: -1 });
    res.json(invites);
  } catch (err) {
    next(err);
  }
});

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

router.post('/:id/invites', requireAuth, requireFirmAdmin, validate(inviteSchema), async (req, res, next) => {
  try {
    const firm = await loadFirmOr404(req, res);
    if (!firm) return;

    const members = await User.countDocuments({ firmId: firm._id });
    const pending = await TeamInvite.countDocuments({ firmId: firm._id, status: 'pending' });
    if (members + pending >= firm.seatLimit) {
      return res.status(409).json({
        error: 'SEAT_LIMIT',
        message: `Firm has reached its seat limit of ${firm.seatLimit} (members + pending invites)`,
      });
    }

    if (await User.findOne({ email: req.body.email })) {
      return res.status(409).json({
        error: 'EMAIL_TAKEN',
        message: 'A user with this email already exists',
        fields: { email: 'Already registered' },
      });
    }

    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const invite = await TeamInvite.create({
      firmId: firm._id,
      name: req.body.name,
      email: req.body.email,
      code,
    });

    sendInvite({ toName: invite.name, toEmail: invite.email, firmName: firm.name, code });

    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/invites/:inviteId', requireAuth, requireFirmAdmin, async (req, res, next) => {
  try {
    const firm = await loadFirmOr404(req, res);
    if (!firm) return;
    const invite = await TeamInvite.findOne({ _id: req.params.inviteId, firmId: firm._id });
    if (!invite) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invite not found' });
    if (invite.status === 'pending') {
      invite.status = 'revoked';
      await invite.save();
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
