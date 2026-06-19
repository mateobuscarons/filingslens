import { Filing } from '../models/filing.js';
import { Paragraph } from '../models/paragraph.js';
import { extractPages, paginateToParagraphs } from './pdf.js';
import { embedPassages } from './embed.js';

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
