import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth, requireFirmAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { InvestmentFirm } from '../models/firm.js';
import { User } from '../models/user.js';

const router = Router();

function assertFirmAccess(req, firm) {
  if (!req.user.firmId || !req.user.firmId.equals(firm._id)) {
    const err = new Error('Not a member of this firm');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
}

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const firm = await InvestmentFirm.findById(req.params.id);
    if (!firm) return res.status(404).json({ error: 'NOT_FOUND', message: 'Firm not found' });
    assertFirmAccess(req, firm);
    const memberCount = await User.countDocuments({ firmId: firm._id });
    res.json({ ...firm.toObject(), memberCount });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  seatLimit: z.number().int().min(1).max(50).optional(),
});

router.patch('/:id', requireAuth, requireFirmAdmin, validate(patchSchema), async (req, res, next) => {
  try {
    const firm = await InvestmentFirm.findById(req.params.id);
    if (!firm) return res.status(404).json({ error: 'NOT_FOUND', message: 'Firm not found' });
    assertFirmAccess(req, firm);
    Object.assign(firm, req.body);
    await firm.save();
    res.json(firm);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const firm = await InvestmentFirm.findById(req.params.id);
    if (!firm) return res.status(404).json({ error: 'NOT_FOUND', message: 'Firm not found' });
    assertFirmAccess(req, firm);
    const members = await User.find({ firmId: firm._id }).select('name email role createdAt');
    res.json(members);
  } catch (err) {
    next(err);
  }
});

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['firm_admin', 'firm_analyst']).default('firm_analyst'),
});

router.post('/:id/members', requireAuth, requireFirmAdmin, validate(inviteSchema), async (req, res, next) => {
  try {
    const firm = await InvestmentFirm.findById(req.params.id);
    if (!firm) return res.status(404).json({ error: 'NOT_FOUND', message: 'Firm not found' });
    assertFirmAccess(req, firm);
    const current = await User.countDocuments({ firmId: firm._id });
    if (current >= firm.seatLimit) {
      return res.status(409).json({
        error: 'SEAT_LIMIT',
        message: `Firm has reached its seat limit of ${firm.seatLimit}`,
      });
    }
    const existing = await User.findOne({ email: req.body.email });
    if (existing) {
      return res.status(409).json({
        error: 'EMAIL_TAKEN',
        message: 'A user with this email already exists',
        fields: { email: 'Already registered' },
      });
    }
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      passwordHash,
      role: req.body.role,
      firmId: firm._id,
    });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:userId', requireAuth, requireFirmAdmin, async (req, res, next) => {
  try {
    const firm = await InvestmentFirm.findById(req.params.id);
    if (!firm) return res.status(404).json({ error: 'NOT_FOUND', message: 'Firm not found' });
    assertFirmAccess(req, firm);
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

export default router;
