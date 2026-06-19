import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Finding } from '../models/finding.js';
import { Paragraph } from '../models/paragraph.js';
import { Citation } from '../models/citation.js';
import { FilingComparison } from '../models/comparison.js';

const router = Router();

router.get('/:id', requireAuth, async (req, res) => {
  const finding = await Finding.findById(req.params.id);
  if (!finding) return res.status(404).json({ error: 'NOT_FOUND', message: 'Finding not found' });
  const comparison = await FilingComparison.findOne({ _id: finding.comparisonId, userId: req.user._id });
  if (!comparison) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your comparison' });

  const [currentParagraph, previousParagraph, citations] = await Promise.all([
    finding.currentParagraphId ? Paragraph.findById(finding.currentParagraphId).select('-embedding') : null,
    finding.previousParagraphId ? Paragraph.findById(finding.previousParagraphId).select('-embedding') : null,
    Citation.find({ sourceType: 'Finding', sourceId: finding._id }),
  ]);

  res.json({
    ...finding.toObject(),
    currentParagraph,
    previousParagraph,
    citations,
  });
});

export default router;
