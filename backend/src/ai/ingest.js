import { Filing } from '../models/filing.js';
import { Paragraph } from '../models/paragraph.js';
import { extractPages, paginateToParagraphs } from './pdf.js';
import { embedPassages } from './embed.js';
import { validateIsAnnualReport } from './validate.js';

export async function ingestFiling(filingId, filePath, { onProgress } = {}) {
  const filing = await Filing.findById(filingId);
  if (!filing) throw new Error(`Filing ${filingId} not found`);

  filing.ingestStatus = 'parsing';
  await filing.save();
  onProgress?.({ stage: 'parsing' });

  const { pageCount, pages } = await extractPages(filePath);
  const paragraphs = paginateToParagraphs(pages);
  filing.pageCount = pageCount;
  await filing.save();
  onProgress?.({ stage: 'embedding', total: paragraphs.length });

  await Paragraph.deleteMany({ filingId: filing._id });
  filing.ingestStatus = 'embedding';
  await filing.save();

  const BATCH = 32;
  for (let i = 0; i < paragraphs.length; i += BATCH) {
    const slice = paragraphs.slice(i, i + BATCH);
    const vectors = await embedPassages(slice.map((p) => p.text));
    const docs = slice.map((p, k) => ({ ...p, filingId: filing._id, embedding: vectors[k] }));
    await Paragraph.insertMany(docs);
    onProgress?.({ stage: 'embedding', done: Math.min(i + BATCH, paragraphs.length), total: paragraphs.length });
  }

  filing.ingestStatus = 'ready';
  await filing.save();
  onProgress?.({ stage: 'ready', total: paragraphs.length });
  return { pageCount, paragraphCount: paragraphs.length };
}

export async function ingestFromText(filingId, rawText) {
  const filing = await Filing.findById(filingId);
  if (!filing) throw new Error(`Filing ${filingId} not found`);

  filing.ingestStatus = 'parsing';
  await filing.save();

  const check = await validateIsAnnualReport(rawText);
  if (check.valid === false) {
    filing.ingestStatus = 'failed';
    filing.ingestError = check.reason || 'Not an annual report';
    await filing.save();
    return;
  }

  // Split into paragraphs: double-newline first, then single-newline fallback
  const lines = rawText.split(/\n\n+/).flatMap((chunk) => {
    const trimmed = chunk.trim();
    return trimmed.length >= 40 ? [trimmed] : trimmed.split(/\n/).filter((l) => l.trim().length >= 40);
  });

  const paragraphs = [...new Set(lines)];

  await Paragraph.deleteMany({ filingId: filing._id });
  filing.ingestStatus = 'embedding';
  await filing.save();

  const BATCH = 32;
  for (let i = 0; i < paragraphs.length; i += BATCH) {
    const slice = paragraphs.slice(i, i + BATCH);
    const vectors = await embedPassages(slice);
    const docs = slice.map((text, k) => ({ text, page: 0, filingId: filing._id, embedding: vectors[k] }));
    await Paragraph.insertMany(docs);
  }

  filing.ingestStatus = 'ready';
  filing.pageCount = 0;
  await filing.save();
  return { paragraphCount: paragraphs.length };
}
