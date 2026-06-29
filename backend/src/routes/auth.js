import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/user.js';
import { InvestmentFirm } from '../models/firm.js';
import { TeamInvite } from '../models/teamInvite.js';
import { signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendWelcomeEmail, sendPasswordReset } from '../email.js';

const router = Router();

// One register endpoint, three branches selected by `mode`:
//   solo       — new user, no firm.
//   team-new   — new user becomes firm_admin of a brand new firm with N seats.
//   team-join  — new user joins an existing firm via an invite code.
const registerSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('solo'),
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
  z.object({
    mode: z.literal('team-new'),
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    firmName: z.string().min(2),
    seatLimit: z.number().int().min(5).max(25),
  }),
  z.object({
    mode: z.literal('team-join'),
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    inviteCode: z.string().min(4),
  }),
]);

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const body = req.body;

    const existing = await User.findOne({ email: body.email });
    if (existing) {
      return res.status(409).json({
        error: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
        fields: { email: 'Already registered' },
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    let firm = null;
    let role = 'solo';

    if (body.mode === 'team-new') {
      firm = await InvestmentFirm.create({ name: body.firmName, seatLimit: body.seatLimit });
      role = 'firm_admin';
    }

    if (body.mode === 'team-join') {
      const invite = await TeamInvite.findOne({ code: body.inviteCode.trim().toUpperCase() });
      if (!invite || invite.status !== 'pending') {
        return res.status(400).json({
          error: 'INVALID_INVITE',
          message: 'Invite code is invalid or already used',
          fields: { inviteCode: 'Invalid or used' },
        });
      }
      firm = await InvestmentFirm.findById(invite.firmId);
      if (!firm) {
        return res.status(400).json({ error: 'INVALID_INVITE', message: 'Firm no longer exists' });
      }
      // Recheck seats — another invite may have been used since this one was created.
      const seats = await User.countDocuments({ firmId: firm._id });
      if (seats >= firm.seatLimit) {
        return res.status(409).json({ error: 'SEAT_LIMIT', message: 'Firm is full' });
      }
      role = 'firm_analyst';
      invite.status = 'accepted';
      invite.acceptedAt = new Date();
      await invite.save();
    }

    const user = await User.create({
      name: body.name,
      email: body.email,
      passwordHash,
      role,
      firmId: firm?._id || null,
      emailVerified: true,
    });

    sendWelcomeEmail({ toName: user.name, toEmail: user.email });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user, firm) });
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
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    // Always return 200 to avoid exposing which emails are registered
    if (!user) return res.json({ ok: true });
    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    sendPasswordReset({ toName: user.name, toEmail: user.email, token });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 8) {
      return res.status(400).json({ error: 'VALIDATION', message: 'Token and password (min 8 chars) required' });
    }
    const user = await User.findOne({ passwordResetToken: token });
    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ error: 'INVALID_TOKEN', message: 'Link is invalid or has expired.' });
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;
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
