import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Company } from '../models/company.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const companies = await Company.find().sort({ name: 1 });
  res.json(companies);
});

router.get('/:id', requireAuth, async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found' });
  res.json(company);
});

export default router;
