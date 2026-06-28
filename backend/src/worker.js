import { FilingComparison } from './models/comparison.js';
import { Filing } from './models/filing.js';
import { Finding } from './models/finding.js';
import { Citation } from './models/citation.js';
import { Paragraph } from './models/paragraph.js';
import { findCandidatePairs, judgeAllPairs } from './ai/compare.js';

const IMPACT_SCORE = { high: 0.9, medium: 0.6, low: 0.3 };

async function setStatus(id, status, extra = {}) {
  await FilingComparison.updateOne({ _id: id }, { status, ...extra });
}

// One run = one LLM call.
//   1. Cosine-pair every current paragraph with its closest previous.
//   2. Keep the 20 best candidate pairs (similar enough to compare, not identical).
//   3. Judge them in one shot with strict JSON; resolve quoted spans.
//   4. Persist Findings + Citations.
export async function runComparison(comparisonId) {
  try {
    await setStatus(comparisonId, 'comparing', { progress: 0.05 });

    const comparison = await FilingComparison.findById(comparisonId).lean();
    if (!comparison) return;

    const [currFiling, prevFiling] = await Promise.all([
      Filing.findById(comparison.currentFilingId).lean(),
      Filing.findById(comparison.previousFilingId).lean(),
    ]);

    const [currAll, prevAll] = await Promise.all([
      Paragraph.find({ filingId: comparison.currentFilingId }).lean(),
      Paragraph.find({ filingId: comparison.previousFilingId }).lean(),
    ]);
    if (!currAll.length || !prevAll.length) {
      throw new Error('One of the filings has no paragraphs');
    }

    const pairs = findCandidatePairs(prevAll, currAll);
    await setStatus(comparisonId, 'summarizing', { progress: 0.4 });

    const changes = await judgeAllPairs(pairs, {
      prevYear: prevFiling.fiscalYear,
      currYear: currFiling.fiscalYear,
    });

    const findingDocs = changes.map((c) => ({
      comparisonId,
      type: !c.prev ? 'added' : !c.curr ? 'removed' : 'modified',
      // The LLM-provided topic ("Board compensation", "Pension provisions")
      // beats the raw PDF section label, which the heading regex often
      // mis-captures from table headers like "30. Sep. 30. Sep.".
      section: c.topic,
      currentParagraphId: c.curr?.paragraph._id ?? c.pair.curr._id,
      previousParagraphId: c.prev?.paragraph._id ?? c.pair.prev._id,
      materialityScore: IMPACT_SCORE[c.impact] ?? 0.5,
      impact: c.impact,
      summary: c.summary,
      excerpt: c.pair.curr.text,
    }));

    const inserted = findingDocs.length ? await Finding.insertMany(findingDocs) : [];

    const citationDocs = [];
    for (let i = 0; i < inserted.length; i++) {
      const finding = inserted[i];
      const c = changes[i];
      if (c.prev) citationDocs.push(buildCitation(finding._id, c.prev, prevFiling, 1));
      if (c.curr) citationDocs.push(buildCitation(finding._id, c.curr, currFiling, c.prev ? 2 : 1));
    }
    if (citationDocs.length) await Citation.insertMany(citationDocs);

    const counts = inserted.reduce(
      (acc, f) => { acc[f.type] = (acc[f.type] || 0) + 1; return acc; },
      { modified: 0, added: 0, removed: 0 }
    );

    await setStatus(comparisonId, 'completed', {
      progress: 1,
      counts,
      overallScore: average(inserted.map((f) => f.materialityScore)),
    });
  } catch (err) {
    console.error('[worker] comparison failed', err);
    await setStatus(comparisonId, 'failed', { error: err.message });
  }
}

function buildCitation(findingId, hit, filing, marker) {
  return {
    sourceType: 'Finding',
    sourceId: findingId,
    paragraphId: hit.paragraph._id,
    filingId: filing._id,
    filingYear: filing.fiscalYear,
    page: hit.paragraph.page,
    excerpt: hit.paragraph.text,
    claimText: hit.claimText,
    charStart: hit.charStart,
    charEnd: hit.charEnd,
    marker,
  };
}

function average(arr) {
  return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
}
