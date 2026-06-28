import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { sendReportShared } from '../email.js';
import { validate } from '../middleware/validate.js';
import { ResearchReport, ReportItem } from '../models/report.js';
import { Finding } from '../models/finding.js';
import { Question } from '../models/qa.js';
import { Citation } from '../models/citation.js';

const router = Router();

// Read = owner OR firm-mate on a shared report.
function canRead(user, report) {
  if (report.userId.equals(user._id)) return true;
  return Boolean(report.isShared && user.firmId && report.firmId?.equals(user.firmId));
}
// Edit (items + notes) = owner OR firm-mate on a shared report.
// Share toggle + report delete stay owner-only — see ownedReport below.
function canEdit(user, report) {
  return canRead(user, report);
}

async function readableReport(req, res) {
  const report = await ResearchReport.findById(req.params.id);
  if (!report || !canRead(req.user, report)) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Report not found' });
    return null;
  }
  return report;
}
async function editableReport(req, res) {
  const report = await ResearchReport.findById(req.params.id);
  if (!report || !canEdit(req.user, report)) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Report not found' });
    return null;
  }
  return report;
}
async function ownedReport(req, res) {
  const report = await ResearchReport.findById(req.params.id);
  if (!report) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Report not found' });
    return null;
  }
  if (!report.userId.equals(req.user._id)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Only the owner can do that' });
    return null;
  }
  return report;
}

router.get('/', requireAuth, async (req, res) => {
  const orClauses = [{ userId: req.user._id }];
  if (req.user.firmId) orClauses.push({ firmId: req.user.firmId, isShared: true });
  const reports = await ResearchReport.find({ $or: orClauses })
    .sort({ updatedAt: -1 })
    .populate('userId', 'name email')
    .populate('comparisonId');
  res.json(reports);
});

const createSchema = z.object({
  title: z.string().min(2).max(120),
  comparisonId: z.string().optional(),
  summary: z.string().max(2000).optional(),
});

router.post('/', requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const report = await ResearchReport.create({
      userId: req.user._id,
      firmId: req.user.firmId || null,
      title: req.body.title,
      summary: req.body.summary || '',
      comparisonId: req.body.comparisonId || null,
    });
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const report = await ResearchReport.findById(req.params.id)
    .populate('userId', 'name email')
    .populate('comparisonId');
  if (!report || !canRead(req.user, report)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Report not found' });
  }
  const items = await ReportItem.find({ reportId: report._id, isActive: true }).sort({ order: 1, createdAt: 1 });
  const findingIds = items.filter((i) => i.kind === 'finding').map((i) => i.refId);
  const answerIds = items.filter((i) => i.kind === 'answer').map((i) => i.refId);
  const [findings, answers, citations] = await Promise.all([
    findingIds.length ? Finding.find({ _id: { $in: findingIds } }) : [],
    answerIds.length ? Question.find({ _id: { $in: answerIds } }) : [],
    Citation.find({
      $or: [
        { sourceType: 'Finding', sourceId: { $in: findingIds } },
        { sourceType: 'Question', sourceId: { $in: answerIds } },
      ],
    }),
  ]);
  const findingsById = new Map(findings.map((f) => [f._id.toString(), f]));
  const answersById = new Map(answers.map((a) => [a._id.toString(), a]));
  const citesBy = new Map();
  for (const c of citations) {
    const k = `${c.sourceType}:${c.sourceId}`;
    if (!citesBy.has(k)) citesBy.set(k, []);
    citesBy.get(k).push(c);
  }
  const enriched = items.map((item) => {
    const target = item.kind === 'finding'
      ? findingsById.get(item.refId.toString())
      : answersById.get(item.refId.toString());
    const k = `${item.kind === 'finding' ? 'Finding' : 'Question'}:${item.refId}`;
    return { ...item.toObject(), target, citations: citesBy.get(k) || [] };
  });
  res.json({ report, items: enriched });
});

const patchSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  summary: z.string().max(2000).optional(),
  isShared: z.boolean().optional(),
});

router.patch('/:id', requireAuth, validate(patchSchema), async (req, res, next) => {
  try {
    const report = await ownedReport(req, res);
    if (!report) return;
    if (req.body.isShared && !req.user.firmId) {
      return res.status(400).json({
        error: 'VALIDATION',
        message: 'Solo accounts cannot share reports',
        fields: { isShared: 'Requires a firm workspace' },
      });
    }
    Object.assign(report, req.body);
    await report.save();
    res.json(report);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const report = await ownedReport(req, res);
  if (!report) return;
  await ReportItem.deleteMany({ reportId: report._id });
  await report.deleteOne();
  res.json({ ok: true });
});

// ---- Items -----------------------------------------------------------------

const itemSchema = z.object({
  kind: z.enum(['finding', 'answer']),
  refId: z.string().min(1),
});

router.post('/:id/items', requireAuth, validate(itemSchema), async (req, res, next) => {
  try {
    const report = await editableReport(req, res);
    if (!report) return;
    const last = await ReportItem.findOne({ reportId: report._id }).sort({ order: -1 });
    const item = await ReportItem.create({
      reportId: report._id,
      kind: req.body.kind,
      refId: req.body.refId,
      addedBy: req.user._id,
      addedByName: req.user.name,
      order: (last?.order ?? -1) + 1,
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

const itemPatchSchema = z.object({
  isActive: z.boolean().optional(),
});

router.patch('/:id/items/:itemId', requireAuth, validate(itemPatchSchema), async (req, res, next) => {
  try {
    const report = await editableReport(req, res);
    if (!report) return;
    const item = await ReportItem.findOne({ _id: req.params.itemId, reportId: report._id });
    if (!item) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
    Object.assign(item, req.body);
    await item.save();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
  const report = await editableReport(req, res);
  if (!report) return;
  await ReportItem.deleteOne({ _id: req.params.itemId, reportId: report._id });
  res.json({ ok: true });
});

// ---- Notes (thread under each item) ----------------------------------------

const noteSchema = z.object({ text: z.string().min(1).max(1000) });

// Add a note. Owner can always add. Firm-mates can add when the report is
// shared. Any author identifies themselves via req.user.
router.post('/:id/items/:itemId/notes', requireAuth, validate(noteSchema), async (req, res, next) => {
  try {
    const report = await editableReport(req, res);
    if (!report) return;
    const item = await ReportItem.findOne({ _id: req.params.itemId, reportId: report._id });
    if (!item) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
    item.notes.push({
      authorId: req.user._id,
      authorName: req.user.name,
      text: req.body.text.trim(),
    });
    await item.save();
    res.status(201).json(item.notes[item.notes.length - 1]);
  } catch (err) {
    next(err);
  }
});

// Delete a note. Only the note's author can delete their own.
router.delete('/:id/items/:itemId/notes/:noteId', requireAuth, async (req, res) => {
  const report = await editableReport(req, res);
  if (!report) return;
  const item = await ReportItem.findOne({ _id: req.params.itemId, reportId: report._id });
  if (!item) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
  const note = item.notes.id(req.params.noteId);
  if (!note) return res.status(404).json({ error: 'NOT_FOUND', message: 'Note not found' });
  if (!note.authorId.equals(req.user._id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only delete your own notes' });
  }
  note.deleteOne();
  await item.save();
  res.json({ ok: true });
});

// ---- Share -----------------------------------------------------------------

async function setShared(req, res, isShared) {
  const report = await ownedReport(req, res);
  if (!report) return;
  if (isShared && !req.user.firmId) {
    return res.status(400).json({
      error: 'VALIDATION',
      message: 'Solo accounts cannot share reports',
      fields: { isShared: 'Requires a firm workspace' },
    });
  }
  report.isShared = isShared;
  await report.save();

  if (isShared && req.user.firmId) {
    User.find({ firmId: req.user.firmId, _id: { $ne: req.user._id } })
      .select('name email')
      .then(members => sendReportShared({
        reportTitle: report.title,
        sharedByName: req.user.name,
        firmMembers: members,
      }));
  }

  res.json(report);
}
router.post('/:id/share', requireAuth, (req, res) => setShared(req, res, true));
router.delete('/:id/share', requireAuth, (req, res) => setShared(req, res, false));

export default router;
