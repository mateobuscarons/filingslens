import { FilingComparison } from './models/comparison.js';
import { Filing } from './models/filing.js';
import { Finding } from './models/finding.js';
import { Citation } from './models/citation.js';
import { Paragraph } from './models/paragraph.js';
import { normalize } from './ai/vec.js';
import {
  buildIndex,
  findBestMatch,
  diffParagraphs,
  isUsefulParagraph,
  scoreModified,
  scoreAddedOrRemoved,
  impactBucket,
  dedupFindings,
  summarizeFinding,
  runPool,
  COMPARE_CONSTANTS,
} from './ai/compare.js';

async function setStatus(comparison, status, extra = {}) {
  comparison.status = status;
  Object.assign(comparison, extra);
  await comparison.save();
}

// Public API. The /comparisons route fires this and returns 202 immediately;
// the FE polls /comparisons/:id to track the stages below.
//
// Pipeline:
//   1. Load both filings' paragraphs (skip page-fragments).
//   2. Match each current paragraph to its best prev (cosine).
//   3. Classify each pair as unchanged / modified / added; collect removed.
//   4. Score materiality, dedup, hard-cap to 10 modified + 3 added + 2 removed.
//   5. Summarize all 15 via 70B (concurrency 4).
//   6. Persist 15 Findings + their Citations.
export async function runComparison(comparisonId) {
  const comparison = await FilingComparison.findById(comparisonId);
  if (!comparison) return;

  try {
    await setStatus(comparison, 'comparing', { progress: 0.05 });

    const [currFiling, prevFiling] = await Promise.all([
      Filing.findById(comparison.currentFilingId).lean(),
      Filing.findById(comparison.previousFilingId).lean(),
    ]);

    const [currAll, prevAll] = await Promise.all([
      Paragraph.find({ filingId: comparison.currentFilingId }).lean(),
      Paragraph.find({ filingId: comparison.previousFilingId }).lean(),
    ]);

    const currParas = currAll.filter(isUsefulParagraph);
    const prevParas = prevAll.filter(isUsefulParagraph);
    if (!currParas.length || !prevParas.length) {
      throw new Error('One of the filings has no ingested paragraphs after filtering');
    }

    // Step 2 + 3: classify
    const prevIndex = buildIndex(prevParas);
    const matchedPrev = new Set();
    const raw = { modified: [], added: [], removed: [] };

    for (const curr of currParas) {
      const { index, similarity } = findBestMatch(normalize(curr.embedding), prevIndex);
      if (similarity > COMPARE_CONSTANTS.SIMILAR_THRESHOLD) {
        matchedPrev.add(index);
        continue;
      }
      if (similarity >= COMPARE_CONSTANTS.MATCH_THRESHOLD) {
        matchedPrev.add(index);
        const prev = prevParas[index];
        raw.modified.push({
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
        raw.added.push({
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
      if (matchedPrev.has(i)) continue;
      const prev = prevParas[i];
      raw.removed.push({
        type: 'removed',
        section: prev.section,
        currentParagraphId: null,
        previousParagraphId: prev._id,
        similarity: 0,
        materialityScore: scoreAddedOrRemoved(prev),
        excerpt: prev.text,
      });
    }

    // Step 4: sort, dedup, cap per type
    const surfaced = [
      ...take(raw.modified, COMPARE_CONSTANTS.TOP_MODIFIED),
      ...take(raw.added, COMPARE_CONSTANTS.TOP_ADDED),
      ...take(raw.removed, COMPARE_CONSTANTS.TOP_REMOVED),
    ];

    await setStatus(comparison, 'summarizing', {
      progress: 0.6,
      counts: {
        modified: countOf(surfaced, 'modified'),
        added: countOf(surfaced, 'added'),
        removed: countOf(surfaced, 'removed'),
      },
      overallScore: averageScore(surfaced),
    });

    // Step 5: summarize all 15 in parallel
    await runPool(surfaced, COMPARE_CONSTANTS.SUMMARY_CONCURRENCY, async (f) => {
      try {
        f.summary = (await summarizeFinding(f))?.trim() || null;
      } catch (err) {
        console.warn(`[summary] ${f.type} failed: ${err.message}`);
        f.summary = null;
      }
    });

    // Step 6: persist
    const findingDocs = surfaced.map((f) => ({
      comparisonId: comparison._id,
      type: f.type,
      section: f.section,
      currentParagraphId: f.currentParagraphId,
      previousParagraphId: f.previousParagraphId,
      similarity: f.similarity,
      materialityScore: f.materialityScore,
      impact: impactBucket(f.materialityScore),
      summary: f.summary,
      excerpt: f.excerpt,
      diff:
        f.type === 'modified'
          ? diffParagraphs(f._prevText, f._currText)
          : [{ op: f.type === 'added' ? 'add' : 'rem', text: f.excerpt }],
    }));
    const inserted = await Finding.insertMany(findingDocs);
    await insertCitations(inserted, surfaced, prevParas, currParas, prevFiling, currFiling);

    await setStatus(comparison, 'completed', { progress: 1 });
  } catch (err) {
    console.error('[worker] comparison failed', err);
    await setStatus(comparison, 'failed', { error: err.message });
  }
}

// ---- Helpers ---------------------------------------------------------------

function take(bucket, n) {
  bucket.sort((a, b) => b.materialityScore - a.materialityScore);
  return dedupFindings(bucket).slice(0, n);
}

function countOf(arr, type) {
  return arr.reduce((sum, f) => sum + (f.type === type ? 1 : 0), 0);
}

function averageScore(arr) {
  return arr.length ? arr.reduce((s, f) => s + f.materialityScore, 0) / arr.length : 0;
}

async function insertCitations(inserted, surfaced, prevParas, currParas, prevFiling, currFiling) {
  const prevById = new Map(prevParas.map((p) => [p._id.toString(), p]));
  const currById = new Map(currParas.map((p) => [p._id.toString(), p]));
  const docs = [];
  for (let i = 0; i < inserted.length; i++) {
    const f = surfaced[i];
    const findingId = inserted[i]._id;
    if (f.previousParagraphId) {
      const p = prevById.get(f.previousParagraphId.toString());
      if (p) {
        docs.push({
          sourceType: 'Finding',
          sourceId: findingId,
          paragraphId: p._id,
          filingId: prevFiling._id,
          filingYear: prevFiling.fiscalYear,
          page: p.page,
          excerpt: p.text.slice(0, 220),
        });
      }
    }
    if (f.currentParagraphId) {
      const p = currById.get(f.currentParagraphId.toString());
      if (p) {
        docs.push({
          sourceType: 'Finding',
          sourceId: findingId,
          paragraphId: p._id,
          filingId: currFiling._id,
          filingYear: currFiling.fiscalYear,
          page: p.page,
          excerpt: p.text.slice(0, 220),
        });
      }
    }
  }
  if (docs.length) await Citation.insertMany(docs);
}
