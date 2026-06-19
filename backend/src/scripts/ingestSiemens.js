import 'dotenv/config';
import path from 'path';
import { connectDb } from '../db.js';
import { Company } from '../models/company.js';
import { Filing } from '../models/filing.js';
import { ingestFiling } from '../ai/ingest.js';

const targets = [
  { year: 2024, file: 'data/siemens-2024.pdf' },
  { year: 2025, file: 'data/siemens-2025.pdf' },
];

await connectDb();
const siemens = await Company.findOne({ isin: 'DE0007236101' });
if (!siemens) {
  console.error('Run npm run seed first');
  process.exit(1);
}

for (const t of targets) {
  const filing = await Filing.findOne({ companyId: siemens._id, fiscalYear: t.year });
  if (!filing) {
    console.error(`No filing record for Siemens ${t.year}`);
    continue;
  }
  filing.fileName = path.basename(t.file);
  await filing.save();

  const started = Date.now();
  console.log(`\n=== Ingesting Siemens ${t.year} ===`);
  const result = await ingestFiling(filing._id, path.resolve(t.file), {
    onProgress: (p) => {
      if (p.stage === 'embedding' && p.done) {
        process.stdout.write(`\r  embedding ${p.done}/${p.total}…`);
      } else {
        process.stdout.write(`\n  ${p.stage}${p.total ? ` (${p.total} paragraphs)` : ''}`);
      }
    },
  });
  console.log(`\n  done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${result.pageCount} pages, ${result.paragraphCount} paragraphs`);
}

process.exit(0);
