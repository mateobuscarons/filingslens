import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { requireAuth, requireFirmAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Filing } from '../models/filing.js';
import { Company } from '../models/company.js';
import { ingestFiling } from '../ai/ingest.js';
import { getNimClient } from '../ai/nim.js';

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

const uploadSchema = z.object({
  companyId: z.string().min(1),
  fiscalYear: z.coerce.number().int().min(2000).max(2099),
});

router.post('/upload', requireAuth, requireFirmAdmin, upload.single('file'), validate(uploadSchema), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'VALIDATION', message: 'PDF file required', fields: { file: 'Required' } });
    if (!getNimClient()) return res.status(503).json({ error: 'NIM_UNAVAILABLE', message: 'NIM_API_KEY not configured' });

    const { companyId, fiscalYear } = req.body;
    if (!(await Company.findById(companyId))) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found' });
    }

    const fileName = `${companyId}-${fiscalYear}.pdf`;
    const targetPath = path.join(UPLOAD_DIR, fileName);
    await fs.rename(req.file.path, targetPath);

    const filing = await Filing.findOneAndUpdate(
      { companyId, fiscalYear },
      { $set: { companyId, fiscalYear, fileName, ingestStatus: 'pending' } },
      { upsert: true, new: true }
    );

    ingestFiling(filing._id, targetPath).catch((err) => {
      console.error('[ingest] failed', err);
      Filing.updateOne({ _id: filing._id }, { $set: { ingestStatus: 'failed' } });
    });

    res.status(202).json({ filingId: filing._id, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

export default router;
