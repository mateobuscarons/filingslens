import { FilingComparison } from './models/comparison.js';
import { Finding } from './models/finding.js';
import { Citation } from './models/citation.js';
import { Paragraph } from './models/paragraph.js';
import { normalize } from './ai/vec.js';
import {
  buildIndex,
  findBestMatch,
  diffParagraphs,
  scoreModified,
  scoreAddedOrRemoved,
  impactBucket,
  summarizeModifiedFinding,
  COMPARE_CONSTANTS,
} from './ai/compare.js';

async function setStatus(comparison, status, extra = {}) {
  comparison.status = status;
  Object.assign(comparison, extra);
  await comparison.save();
}

export async function runComparison(comparisonId) {
  const comparison = await FilingComparison.findById(comparisonId);
  if (!comparison) return;
  try {
    await setStatus(comparison, 'comparing', { progress: 0.05 });

    const [currParas, prevParas] = await Promise.all([
      Paragraph.find({ filingId: comparison.currentFilingId }).lean(),
      Paragraph.find({ filingId: comparison.previousFilingId }).lean(),
    ]);
    if (!currParas.length || !prevParas.length) {
      throw new Error('One of the filings has no ingested paragraphs');
    }

    const prevIndex = buildIndex(prevParas);
    const matched = new Set();
    const rawFindings = [];

    for (const curr of currParas) {
      const q = normalize(curr.embedding);
      const { index, similarity } = findBestMatch(q, prevIndex);

      if (similarity > COMPARE_CONSTANTS.SIMILAR_THRESHOLD) {
        matched.add(index);
        continue;
      }
      if (similarity >= COMPARE_CONSTANTS.MATCH_THRESHOLD) {
        matched.add(index);
        const prev = prevParas[index];
        rawFindings.push({
          type: 'modified',
          section: curr.section,
          currentParagraphId: curr._id,
          previousParagraphId: prev._id,
          similarity,
          materialityScore: scoreModified(prev, curr),
          excerpt: curr.text,
          _prevText: prev.text,
          _currText: curr.text,
        });
      } else {
        rawFindings.push({
          type: 'added',
          section: curr.section,
          currentParagraphId: curr._id,
          previousParagraphId: null,
          similarity,
          materialityScore: scoreAddedOrRemoved(curr),
          excerpt: curr.text,
        });
      }
    }

    for (let i = 0; i < prevParas.length; i++) {
      if (matched.has(i)) continue;
      const prev = prevParas[i];
      rawFindings.push({
        type: 'removed',
        section: prev.section,
        currentParagraphId: null,
        previousParagraphId: prev._id,
        similarity: 0,
        materialityScore: scoreAddedOrRemoved(prev),
        excerpt: prev.text,
      });
    }

    rawFindings.sort((a, b) => b.materialityScore - a.materialityScore);
    const counts = { modified: 0, added: 0, removed: 0 };
    for (const f of rawFindings) counts[f.type]++;

    await setStatus(comparison, 'summarizing', {
      counts,
      progress: 0.7,
      overallScore: average(rawFindings.slice(0, 20).map((f) => f.materialityScore)),
    });

    const summaryTargets = rawFindings
      .slice(0, COMPARE_CONSTANTS.TOP_SUMMARIES)
      .map((f, idx) => ({ idx, f }))
      .filter(({ f }) => f.type === 'modified');

    const summaries = new Map();
    await runPool(summaryTargets, COMPARE_CONSTANTS.SUMMARY_CONCURRENCY, async ({ idx, f }) => {
      try {
        summaries.set(idx, await summarizeModifiedFinding(f._prevText, f._currText));
      } catch (err) {
        console.warn(`[summary] #${idx} failed: ${err.message}`);
      }
    });

    const findingsToInsert = rawFindings.map((f, i) => ({
      comparisonId: comparison._id,
      type: f.type,
      section: f.section,
      currentParagraphId: f.currentParagraphId,
      previousParagraphId: f.previousParagraphId,
      similarity: f.similarity,
      materialityScore: f.materialityScore,
      impact: impactBucket(f.materialityScore),
      summary: summaries.get(i) || null,
      excerpt: f.excerpt,
      diff:
        f.type === 'modified'
          ? diffParagraphs(f._prevText, f._currText)
          : f.type === 'added'
          ? [{ op: 'add', text: f.excerpt }]
          : [{ op: 'rem', text: f.excerpt }],
    }));

    const insertedFindings = await Finding.insertMany(findingsToInsert);
    await insertFindingCitations(insertedFindings, rawFindings, prevParas, currParas);

    await setStatus(comparison, 'completed', { progress: 1 });
  } catch (err) {
    console.error('[worker] comparison failed', err);
    await setStatus(comparison, 'failed', { error: err.message });
  }
}

async function insertFindingCitations(insertedFindings, rawFindings, prevParas, currParas) {
  const docs = [];
  const prevById = new Map(prevParas.map((p) => [p._id.toString(), p]));
  const currById = new Map(currParas.map((p) => [p._id.toString(), p]));
  for (let i = 0; i < insertedFindings.length; i++) {
    const inserted = insertedFindings[i];
    const raw = rawFindings[i];
    if (raw.previousParagraphId) {
      const p = prevById.get(raw.previousParagraphId.toString());
      if (p) docs.push({ sourceType: 'Finding', sourceId: inserted._id, paragraphId: p._id, page: p.page, excerpt: p.text.slice(0, 200) });
    }
    if (raw.currentParagraphId) {
      const p = currById.get(raw.currentParagraphId.toString());
      if (p) docs.push({ sourceType: 'Finding', sourceId: inserted._id, paragraphId: p._id, page: p.page, excerpt: p.text.slice(0, 200) });
    }
  }
  if (docs.length) await Citation.insertMany(docs);
}

function average(arr) {
  return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
}

async function runPool(items, concurrency, worker) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(workers);
}
