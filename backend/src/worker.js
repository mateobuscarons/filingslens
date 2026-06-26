import { FilingComparison } from './models/comparison.js';
import { Filing } from './models/filing.js';
import { Finding } from './models/finding.js';
import { Citation } from './models/citation.js';
import { Paragraph } from './models/paragraph.js';
import { normalize } from './ai/vec.js';
import {
  buildIndex,
  findBestMatch,
  findTopK,
  isUsefulParagraph,
  scoreModified,
  impactBucket,
  judgeCandidate,
  runPool,
  COMPARE_CONSTANTS,
} from './ai/compare.js';

async function setStatus(comparison, status, extra = {}) {
  comparison.status = status;
  Object.assign(comparison, extra);
  await comparison.save();
}

// Public entry point. Driven by POST /comparisons via setImmediate.
//
// Pipeline:
//   1. Load both filings, filter usable paragraphs.
//   2. Build cosine indexes for BOTH filings.
//   3. Match each current paragraph to its best previous; keep pairs whose
//      similarity is in [MATCH_THRESHOLD, SIMILAR_THRESHOLD] as candidates.
//   4. Score materiality; take top TOP_CANDIDATES = 15.
//   5. For each candidate: fetch RAG_CONTEXT_K = 3 nearest passages from
//      each filing; LLM judges + summarizes (or refuses with not_a_change).
//   6. Persist confirmed findings + their cited passages as Citations.
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
      throw new Error('One of the filings has no usable paragraphs');
    }

    const prevIndex = buildIndex(prevParas);
    const currIndex = buildIndex(currParas);

    // Stage 1: candidate matches (modified pairs only)
    const candidates = [];
    for (const curr of currParas) {
      const q = normalize(curr.embedding);
      const { index, similarity } = findBestMatch(q, prevIndex);
      if (similarity > COMPARE_CONSTANTS.SIMILAR_THRESHOLD) continue;     // unchanged
      if (similarity < COMPARE_CONSTANTS.MATCH_THRESHOLD) continue;        // added — not surfaced in new pipeline
      const prev = prevParas[index];
      candidates.push({
        section: curr.section,
        currParagraph: curr,
        prevParagraph: prev,
        similarity,
        materialityScore: scoreModified(prev, curr),
      });
    }
    candidates.sort((a, b) => b.materialityScore - a.materialityScore);
    const top = candidates.slice(0, COMPARE_CONSTANTS.TOP_CANDIDATES);

    await setStatus(comparison, 'summarizing', { progress: 0.4 });

    // Stage 2 + 3: RAG context + LLM judge (in parallel)
    const confirmed = [];
    await runPool(top, COMPARE_CONSTANTS.JUDGE_CONCURRENCY, async (cand) => {
      const queryVec = normalize(cand.currParagraph.embedding);
      const prevContext = findTopK(queryVec, prevIndex, COMPARE_CONSTANTS.RAG_CONTEXT_K, [cand.prevParagraph._id]);
      const currContext = findTopK(queryVec, currIndex, COMPARE_CONSTANTS.RAG_CONTEXT_K, [cand.currParagraph._id]);
      try {
        const verdict = await judgeCandidate(
          {
            prevParagraph: cand.prevParagraph,
            currParagraph: cand.currParagraph,
            prevFilingYear: prevFiling.fiscalYear,
            currFilingYear: currFiling.fiscalYear,
          },
          prevContext,
          currContext,
        );
        if (verdict.verdict !== 'change' || !verdict.summary) return;
        // judgeCandidate attaches _prevList = [candidate, ...prevContext]
        // and _currList = [candidate, ...currContext], so cites_* index 1
        // resolves to the candidate paragraph itself.
        const citedPrev = (verdict.cites_prev ?? []).map((i) => verdict._prevList?.[i - 1]).filter(Boolean);
        const citedCurr = (verdict.cites_curr ?? []).map((i) => verdict._currList?.[i - 1]).filter(Boolean);
        if (citedPrev.length === 0 || citedCurr.length === 0) return;
        confirmed.push({ ...cand, summary: verdict.summary.trim(), citedPrev, citedCurr });
      } catch (err) {
        console.warn(`[judge] candidate failed: ${err.message}`);
      }
    });

    // Stage 4: persist
    const findingDocs = confirmed.map((c) => ({
      comparisonId: comparison._id,
      type: 'modified',
      section: c.section,
      currentParagraphId: c.currParagraph._id,
      previousParagraphId: c.prevParagraph._id,
      similarity: c.similarity,
      materialityScore: c.materialityScore,
      impact: impactBucket(c.materialityScore),
      summary: c.summary,
      excerpt: c.currParagraph.text,
      diff: [],
    }));
    const inserted = findingDocs.length ? await Finding.insertMany(findingDocs) : [];

    const citationDocs = [];
    for (let i = 0; i < inserted.length; i++) {
      const finding = inserted[i];
      const c = confirmed[i];
      for (const p of c.citedPrev) {
        citationDocs.push(buildCitation(finding._id, p, prevFiling));
      }
      for (const p of c.citedCurr) {
        citationDocs.push(buildCitation(finding._id, p, currFiling));
      }
    }
    if (citationDocs.length) await Citation.insertMany(citationDocs);

    await setStatus(comparison, 'completed', {
      progress: 1,
      counts: { modified: inserted.length, added: 0, removed: 0 },
      overallScore: average(confirmed.map((c) => c.materialityScore)),
    });
  } catch (err) {
    console.error('[worker] comparison failed', err);
    await setStatus(comparison, 'failed', { error: err.message });
  }
}

function buildCitation(findingId, paragraph, filing) {
  return {
    sourceType: 'Finding',
    sourceId: findingId,
    paragraphId: paragraph._id,
    filingId: filing._id,
    filingYear: filing.fiscalYear,
    page: paragraph.page,
    excerpt: paragraph.text.slice(0, 320),
  };
}

function average(arr) {
  return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
}
