import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Filing } from '../models/filing.js';
import { Company } from '../models/company.js';
import { ingestFiling, ingestFromText } from '../ai/ingest.js';
import { getNimClient } from '../ai/nim.js';
import { searchCompanies, fetchReportText } from '../ai/bundesanzeiger.js';

const router = Router();
const UPLOAD_DIR = path.resolve('data/uploads');
await fs.mkdir(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', requireAuth, async (req, res) => {
  const filter = {};
  if (req.query.companyId) filter.companyId = req.query.companyId;
  res.json(await Filing.find(filter).sort({ fiscalYear: -1 }));
});

router.get('/:id', requireAuth, async (req, res) => {
  const filing = await Filing.findById(req.params.id);
  if (!filing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Filing not found' });
  res.json(filing);
});

// Stream the original uploaded PDF inline so the browser's native viewer
// can render it. Citations link here with #page=N to jump to the cited page.
router.get('/:id/file', requireAuth, async (req, res) => {
  const filing = await Filing.findById(req.params.id);
  if (!filing || !filing.fileName) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Filing not found' });
  }
  const filePath = path.join(UPLOAD_DIR, filing.fileName);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="FY${filing.fiscalYear}.pdf"`);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'FILE_READ', message: err.message });
    }
  });
});

const uploadSchema = z.object({
  companyName: z.string().min(2).max(120),
  fiscalYear: z.coerce.number().int().min(2000).max(2099),
});

router.post('/upload', requireAuth, upload.single('file'), validate(uploadSchema), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'VALIDATION', message: 'PDF file required', fields: { file: 'Required' } });
    }
    if (!getNimClient()) {
      return res.status(503).json({ error: 'NIM_UNAVAILABLE', message: 'NIM_API_KEY not configured' });
    }

    const { companyName, fiscalYear } = req.body;
    const nameLower = companyName.trim().toLowerCase();
    const company = await Company.findOneAndUpdate(
      { nameLower },
      { $setOnInsert: { name: companyName.trim(), nameLower } },
      { upsert: true, new: true }
    );

    const fileName = `${company._id}-${fiscalYear}.pdf`;
    const targetPath = path.join(UPLOAD_DIR, fileName);
    await fs.rename(req.file.path, targetPath);

    const filing = await Filing.findOneAndUpdate(
      { companyId: company._id, fiscalYear },
      { $set: { companyId: company._id, fiscalYear, fileName, ingestStatus: 'pending' } },
      { upsert: true, new: true }
    );

    ingestFiling(filing._id, targetPath).catch((err) => {
      console.error('[ingest] failed', err);
      Filing.updateOne({ _id: filing._id }, { $set: { ingestStatus: 'failed' } });
    });

    res.status(202).json({ filingId: filing._id, companyId: company._id, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

// ── Fetch from URL ────────────────────────────────────────────────────────────
const fetchUrlSchema = z.object({
  url: z.string().url().startsWith('http'),
  companyName: z.string().min(2).max(120),
  fiscalYear: z.coerce.number().int().min(2000).max(2099),
});

router.post('/fetch-url', requireAuth, validate(fetchUrlSchema), async (req, res, next) => {
  try {
    if (!getNimClient()) {
      return res.status(503).json({ error: 'NIM_UNAVAILABLE', message: 'NIM_API_KEY not configured' });
    }
    const { url, companyName, fiscalYear } = req.body;

    const nameLower = companyName.trim().toLowerCase();
    const company = await Company.findOneAndUpdate(
      { nameLower },
      { $setOnInsert: { name: companyName.trim(), nameLower } },
      { upsert: true, new: true }
    );

    const fileName = `${company._id}-${fiscalYear}.pdf`;
    const targetPath = path.join(UPLOAD_DIR, fileName);

    const dlRes = await fetch(url);
    if (!dlRes.ok) return res.status(422).json({ error: 'DOWNLOAD_FAILED', message: `Could not download PDF: ${dlRes.status}` });
    const buf = Buffer.from(await dlRes.arrayBuffer());
    await fs.writeFile(targetPath, buf);

    const filing = await Filing.findOneAndUpdate(
      { companyId: company._id, fiscalYear },
      { $set: { companyId: company._id, fiscalYear, fileName, ingestStatus: 'pending', ingestError: null } },
      { upsert: true, new: true }
    );

    ingestFiling(filing._id, targetPath).catch((err) => {
      console.error('[ingest/url] failed', err);
      Filing.updateOne({ _id: filing._id }, { $set: { ingestStatus: 'failed', ingestError: err.message } });
    });

    res.status(202).json({ filingId: filing._id, companyId: company._id, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

// ── Bundesanzeiger search ─────────────────────────────────────────────────────
router.get('/bundesanzeiger/search', requireAuth, async (req, res, next) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Query must be at least 2 characters' });
  }
  try {
    const results = await searchCompanies(q);
    res.json(results);
  } catch (err) {
    console.error('[bundesanzeiger/search]', err.message);
    res.status(503).json({ error: 'BUNDESANZEIGER_UNAVAILABLE', message: err.message });
  }
});

// ── Bundesanzeiger fetch ──────────────────────────────────────────────────────
const baFetchSchema = z.object({
  reportUrl: z.string().url(),
  companyName: z.string().min(2).max(120),
  fiscalYear: z.coerce.number().int().min(2000).max(2099),
});

router.post('/bundesanzeiger/fetch', requireAuth, validate(baFetchSchema), async (req, res, next) => {
  try {
    if (!getNimClient()) {
      return res.status(503).json({ error: 'NIM_UNAVAILABLE', message: 'NIM_API_KEY not configured' });
    }
    const { reportUrl, companyName, fiscalYear } = req.body;

    const nameLower = companyName.trim().toLowerCase();
    const company = await Company.findOneAndUpdate(
      { nameLower },
      { $setOnInsert: { name: companyName.trim(), nameLower } },
      { upsert: true, new: true }
    );

    const filing = await Filing.findOneAndUpdate(
      { companyId: company._id, fiscalYear },
      { $set: { companyId: company._id, fiscalYear, fileName: null, ingestStatus: 'pending', ingestError: null } },
      { upsert: true, new: true }
    );

    fetchReportText(reportUrl)
      .then((text) => ingestFromText(filing._id, text))
      .catch((err) => {
        console.error('[bundesanzeiger/fetch] failed', err);
        Filing.updateOne({ _id: filing._id }, { $set: { ingestStatus: 'failed', ingestError: err.message } });
      });

    res.status(202).json({ filingId: filing._id, companyId: company._id, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

export default router;
