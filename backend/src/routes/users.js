import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { InvestmentFirm } from '../models/firm.js';

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

export default router;
