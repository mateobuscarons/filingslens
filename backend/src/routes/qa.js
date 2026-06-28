import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { QASession, Question } from '../models/qa.js';
import { Company } from '../models/company.js';
import { Citation } from '../models/citation.js';
import { answerQuestion } from '../ai/qa.js';

const router = Router();

router.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await QASession.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .populate('companyId');
  res.json(sessions);
});

const sessionSchema = z.object({ companyId: z.string().min(1) });

router.post('/sessions', requireAuth, validate(sessionSchema), async (req, res, next) => {
  try {
    const company = await Company.findById(req.body.companyId);
    if (!company) return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found' });
    const session = await QASession.findOneAndUpdate(
      { userId: req.user._id, companyId: company._id },
      { $setOnInsert: { userId: req.user._id, companyId: company._id } },
      { upsert: true, new: true }
    ).populate('companyId');
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.get('/sessions/:id', requireAuth, async (req, res) => {
  const session = await QASession.findOne({ _id: req.params.id, userId: req.user._id }).populate('companyId');
  if (!session) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
  const questions = await Question.find({ sessionId: session._id }).sort({ createdAt: 1 });
  const ids = questions.map((q) => q._id);
  const citations = await Citation.find({ sourceType: 'Question', sourceId: { $in: ids } });
  const byQ = new Map();
  for (const c of citations) {
    const k = c.sourceId.toString();
    if (!byQ.has(k)) byQ.set(k, []);
    byQ.get(k).push(c);
  }
  res.json({
    session,
    questions: questions.map((q) => ({ ...q.toObject(), citations: byQ.get(q._id.toString()) || [] })),
  });
});

const askSchema = z.object({ text: z.string().min(3).max(500) });

router.post('/sessions/:id/questions', requireAuth, validate(askSchema), async (req, res, next) => {
  try {
    const session = await QASession.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });

    const question = await Question.create({ sessionId: session._id, text: req.body.text, status: 'pending' });
    try {
      const { status, answer, citations } = await answerQuestion(session.companyId, req.body.text);
      question.status = status;
      question.answer = answer;
      await question.save();

      const citationDocs = citations.map((c) => ({
        ...c,
        sourceType: 'Question',
        sourceId: question._id,
      }));
      const inserted = citationDocs.length ? await Citation.insertMany(citationDocs) : [];

      res.status(201).json({ ...question.toObject(), citations: inserted });
    } catch (err) {
      question.status = 'failed';
      question.error = err.message;
      await question.save();
      console.error('[qa] failed', err);
      res.status(500).json({ error: 'QA_FAILED', message: err.message });
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:id/questions/:qid', requireAuth, async (req, res) => {
  const session = await QASession.findOne({ _id: req.params.id, userId: req.user._id });
  if (!session) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
  const question = await Question.findOne({ _id: req.params.qid, sessionId: session._id });
  if (!question) return res.status(404).json({ error: 'NOT_FOUND', message: 'Question not found' });
  await Citation.deleteMany({ sourceType: 'Question', sourceId: question._id });
  await question.deleteOne();
  res.json({ ok: true });
});

export default router;
