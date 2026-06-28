import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { FilingComparison } from '../models/comparison.js';
import { Filing } from '../models/filing.js';
import { Finding } from '../models/finding.js';
import { Citation } from '../models/citation.js';
import { runComparison } from '../worker.js';
import { User } from '../models/user.js';
import { sendComparisonShared } from '../email.js';

const router = Router();

// Visibility: a user sees their own comparisons + comparisons shared by a
// firm-mate. canRead is true for the owner or any analyst in the firm the
// comparison was shared into.
function visibilityFilter(user) {
  const or = [{ userId: user._id }];
  if (user.firmId) or.push({ firmId: user.firmId, isShared: true });
  return { $or: or };
}
function canRead(user, comparison) {
  if (comparison.userId.equals(user._id)) return true;
  return Boolean(comparison.isShared && user.firmId && comparison.firmId?.equals(user.firmId));
}
function isOwner(user, comparison) {
  return comparison.userId.equals(user._id);
}

router.get('/', requireAuth, async (req, res) => {
  const comparisons = await FilingComparison.find(visibilityFilter(req.user))
    .sort({ createdAt: -1 })
    .populate('currentFilingId previousFilingId companyId')
    .populate('userId', 'name email');
  res.json(comparisons);
});

const createSchema = z.object({
  currentFilingId: z.string().min(1),
  previousFilingId: z.string().min(1),
});

router.post('/', requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const { currentFilingId, previousFilingId } = req.body;
    if (currentFilingId === previousFilingId) {
      return res.status(400).json({
        error: 'VALIDATION',
        message: 'Filings must be different',
        fields: { previousFilingId: 'Choose a different filing' },
      });
    }
    const [current, previous] = await Promise.all([
      Filing.findById(currentFilingId),
      Filing.findById(previousFilingId),
    ]);
    if (!current || !previous) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Filing not found' });
    }
    if (!current.companyId.equals(previous.companyId)) {
      return res.status(400).json({
        error: 'VALIDATION',
        message: 'Filings must belong to the same company',
        fields: { previousFilingId: 'Different company' },
      });
    }
    if (current.ingestStatus !== 'ready' || previous.ingestStatus !== 'ready') {
      return res.status(409).json({
        error: 'NOT_READY',
        message: 'Both filings must be fully ingested before comparing',
      });
    }
    const comparison = await FilingComparison.create({
      userId: req.user._id,
      firmId: req.user.firmId || null,
      companyId: current.companyId,
      currentFilingId,
      previousFilingId,
    });

    setImmediate(() => {
      runComparison(comparison._id).catch((err) => console.error('[worker] crashed', err));
    });

    res.status(202).json(comparison);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const comparison = await FilingComparison.findById(req.params.id)
    .populate('currentFilingId previousFilingId companyId')
    .populate('userId', 'name email');
  if (!comparison || !canRead(req.user, comparison)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Comparison not found' });
  }
  res.json(comparison);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const comparison = await FilingComparison.findById(req.params.id);
  if (!comparison || !isOwner(req.user, comparison)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Comparison not found' });
  }
  const findings = await Finding.find({ comparisonId: comparison._id }).select('_id');
  await Citation.deleteMany({ sourceType: 'Finding', sourceId: { $in: findings.map((f) => f._id) } });
  await Finding.deleteMany({ comparisonId: comparison._id });
  await comparison.deleteOne();
  res.json({ ok: true });
});

router.get('/:id/findings', requireAuth, async (req, res) => {
  const comparison = await FilingComparison.findById(req.params.id);
  if (!comparison || !canRead(req.user, comparison)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Comparison not found' });
  }
  const findings = await Finding.find({ comparisonId: comparison._id })
    .sort({ materialityScore: -1 })
    .limit(Number(req.query.limit) || 50);
  res.json(findings);
});

// Share / unshare. Owner-only; requires a firm (solo accounts can't share).
async function setShared(req, res, isShared) {
  const comparison = await FilingComparison.findById(req.params.id);
  if (!comparison || !isOwner(req.user, comparison)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Comparison not found' });
  }
  if (isShared && !req.user.firmId) {
    return res.status(400).json({
      error: 'VALIDATION',
      message: 'Solo accounts cannot share analyses',
      fields: { isShared: 'Requires a firm workspace' },
    });
  }
  comparison.isShared = isShared;
  if (isShared && !comparison.firmId) comparison.firmId = req.user.firmId;
  await comparison.save();

  if (isShared && req.user.firmId) {
    User.find({ firmId: req.user.firmId, _id: { $ne: req.user._id } })
      .select('name email')
      .then(members => sendComparisonShared({
        comparisonTitle: comparison.title || 'an analysis',
        sharedByName: req.user.name,
        firmMembers: members,
      }));
  }

  res.json(comparison);
}
router.post('/:id/share', requireAuth, (req, res) => setShared(req, res, true));
router.delete('/:id/share', requireAuth, (req, res) => setShared(req, res, false));

export default router;
