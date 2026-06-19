import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { FilingComparison } from '../models/comparison.js';
import { Filing } from '../models/filing.js';
import { Finding } from '../models/finding.js';
import { Citation } from '../models/citation.js';
import { runComparison } from '../worker.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const comparisons = await FilingComparison.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .populate('currentFilingId previousFilingId companyId');
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
  const comparison = await FilingComparison.findOne({ _id: req.params.id, userId: req.user._id })
    .populate('currentFilingId previousFilingId companyId');
  if (!comparison) return res.status(404).json({ error: 'NOT_FOUND', message: 'Comparison not found' });
  res.json(comparison);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const comparison = await FilingComparison.findOne({ _id: req.params.id, userId: req.user._id });
  if (!comparison) return res.status(404).json({ error: 'NOT_FOUND', message: 'Comparison not found' });
  const findings = await Finding.find({ comparisonId: comparison._id }).select('_id');
  await Citation.deleteMany({ sourceType: 'Finding', sourceId: { $in: findings.map((f) => f._id) } });
  await Finding.deleteMany({ comparisonId: comparison._id });
  await comparison.deleteOne();
  res.json({ ok: true });
});

router.get('/:id/findings', requireAuth, async (req, res) => {
  const comparison = await FilingComparison.findOne({ _id: req.params.id, userId: req.user._id });
  if (!comparison) return res.status(404).json({ error: 'NOT_FOUND', message: 'Comparison not found' });
  const findings = await Finding.find({ comparisonId: comparison._id })
    .sort({ materialityScore: -1 })
    .limit(Number(req.query.limit) || 50);
  res.json(findings);
});

export default router;
