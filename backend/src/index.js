import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import companyRoutes from './routes/companies.js';
import filingRoutes from './routes/filings.js';
import comparisonRoutes from './routes/comparisons.js';
import findingRoutes from './routes/findings.js';
import qaRoutes from './routes/qa.js';
import reportRoutes from './routes/reports.js';
import firmRoutes from './routes/firms.js';
import billingRoutes from './routes/billing.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/me', userRoutes);
app.use('/companies', companyRoutes);
app.use('/filings', filingRoutes);
app.use('/comparisons', comparisonRoutes);
app.use('/findings', findingRoutes);
app.use('/qa', qaRoutes);
app.use('/reports', reportRoutes);
app.use('/firms', firmRoutes);
app.use('/billing', billingRoutes);
app.use('/notifications', notificationRoutes);

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL',
    message: err.message || 'Internal server error',
    fields: err.fields,
  });
});

const port = process.env.PORT || 4000;
connectDb()
  .then(() => app.listen(port, () => console.log(`[api] listening on :${port}`)))
  .catch((e) => {
    console.error('[boot] failed to connect to mongo', e);
    process.exit(1);
  });
