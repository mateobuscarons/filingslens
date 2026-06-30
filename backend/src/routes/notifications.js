import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Notification } from '../models/notification.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const notes = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(notes);
  } catch (err) { next(err); }
});

router.patch('/read-all', requireAuth, async (req, res, next) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
