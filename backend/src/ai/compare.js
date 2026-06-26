import { chat } from './llm.js';
import { normalize, dot } from './vec.js';

// ─── Tunables ─────────────────────────────────────────────────────────────
//
// Pipeline outline:
//   1. Filter paragraphs that are too short / table-fragment.
//   2. Cosine-match each current paragraph to its best previous; classify
//      as unchanged / modified by similarity thresholds.
//   3. Rank "modified" pairs by materiality (heuristic) and take top 15.
//   4. For each top candidate: pull a few "RAG" context passages from each
//      filing (most semantically similar to the candidate), then ask the
//      LLM to either describe the change OR refuse with `not_a_change`.
//      Citations come from the passages the LLM picked.

const SIMILAR_THRESHOLD = 0.95;   // above this = paragraph unchanged
const MATCH_THRESHOLD   = 0.65;   // between MATCH and SIMILAR = candidate modified pair
const MIN_PARAGRAPH_LENGTH = 60;

const TOP_CANDIDATES   = 15;
const RAG_CONTEXT_K    = 3;       // context passages per filing per candidate
const JUDGE_CONCURRENCY = 6;

const KEYWORDS = [
  'risiko', 'risk', 'wesentlich', 'material', 'rückgang', 'decline',
  'rekord', 'record', 'einbruch', 'verlust', 'loss', 'haftung',
  'liability', 'rechtsstreit', 'litigation', 'krise', 'crisis',
  'auswirk', 'impact', 'ergebnis', 'gewinn', 'profit', 'umsatz', 'revenue',
];

const SECTION_MARKERS = [
  'lagebericht', 'konzernabschluss', 'risikobericht', 'prognose',
  'vergütung', 'segment', 'ebit', 'cash flow', 'kapital',
];

// ─── Paragraph filtering + cosine ─────────────────────────────────────────

export function isUsefulParagraph(p) {
  if (!p?.text || p.text.length < MIN_PARAGRAPH_LENGTH) return false;
  return /[a-zA-ZäöüÄÖÜß]{4,}/.test(p.text);
}

export function buildIndex(paragraphs) {
  return { paragraphs, vectors: paragraphs.map((p) => normalize(p.embedding)) };
}

export function findBestMatch(queryVec, index) {
  let best = -1, bestIdx = -1;
  for (let i = 0; i < index.vectors.length; i++) {
    const s = dot(queryVec, index.vectors[i]);
    if (s > best) { best = s; bestIdx = i; }
  }
  return { index: bestIdx, similarity: best };
}

// Returns the top-K paragraphs in `index` by cosine to queryVec, skipping
// any paragraph whose _id appears in excludeIds.
export function findTopK(queryVec, index, k, excludeIds = []) {
  const exclude = new Set(excludeIds.map((x) => String(x)));
  const scored = [];
  for (let i = 0; i < index.vectors.length; i++) {
    if (exclude.has(String(index.paragraphs[i]._id))) continue;
    scored.push({ i, score: dot(queryVec, index.vectors[i]) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => ({ ...index.paragraphs[s.i], score: s.score }));
}

// ─── Materiality scoring (heuristic candidate ranker only) ────────────────

function extractNumbers(text) {
  const matches = [...text.matchAll(/(?<![\w.])\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?!\w)/g)];
  return matches
    .map((m) => parseFloat(m[0].replace(/\./g, '').replace(',', '.')))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function numericDelta(prevText, currText) {
  const a = extractNumbers(prevText).sort((x, y) => y - x).slice(0, 5);
  const b = extractNumbers(currText).sort((x, y) => y - x).slice(0, 5);
  if (!a.length || !b.length) return 0;
  let max = 0;
  const k = Math.min(a.length, b.length);
  for (let i = 0; i < k; i++) {
    if (a[i] < 1) continue;
    const d = Math.abs(b[i] - a[i]) / a[i];
    if (d > max) max = d;
  }
  return Math.min(max, 1);
}

function keywordSignal(text) {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of KEYWORDS) if (lower.includes(kw)) hits++;
  return Math.min(hits / 4, 1);
}

function sectionWeight(text, label) {
  const blob = `${label} ${text.slice(0, 200)}`.toLowerCase();
  for (const m of SECTION_MARKERS) if (blob.includes(m)) return 1;
  return 0.4;
}

function lengthBonus(text) { return Math.min(text.length / 400, 1); }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

export function scoreModified(prev, curr) {
  return clamp01(
    0.45 * numericDelta(prev.text, curr.text) +
    0.30 * keywordSignal(curr.text) +
    0.15 * sectionWeight(curr.text, curr.section) +
    0.10 * lengthBonus(curr.text)
  );
}

export function impactBucket(score) {
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

// ─── LLM judge ────────────────────────────────────────────────────────────
//
// One call per candidate. The LLM sees the candidate pair PLUS 3 supporting
// passages from each filing (most semantically similar to the candidate).
// It returns JSON: either {verdict:"change", summary, cites_prev, cites_curr}
// or {verdict:"not_a_change"}.

const JUDGE_SYSTEM = [
  'You are a financial-analyst assistant comparing two annual reports of the same company.',
  'You will see numbered PREV passages (from the previous filing) and CURR passages (from the current filing).',
  'Passage [1] on each side is the strongest candidate; passages [2..] are supporting context retrieved by semantic similarity.',
  'Decide whether the passages together describe a real, meaningful change of the SAME metric or topic.',
  '',
  'Reply with ONE LINE of strict JSON only. No prose, no markdown fences.',
  '',
  'If it IS a real change:',
  '  {"verdict":"change","summary":"<one declarative sentence in the source language, max 30 words>","cites_prev":[<one or more 1-based numbers from PREV passages>],"cites_curr":[<one or more 1-based numbers from CURR passages>]}',
  '',
  'If it is NOT a real change (mismatched table fragments, different metrics, no clear comparison, or no supporting evidence on both sides):',
  '  {"verdict":"not_a_change"}',
  '',
  'Rules:',
  '- Numbers must appear VERBATIM in the cited passages. German numbers use "." as thousands separator and "," as decimal.',
  '- The summary must be ONE declarative sentence — no commentary, no self-correction, no "Note:" prefixes.',
  '- cites_prev MUST include the passages that contain the OLD value. cites_curr MUST include the passages that contain the NEW value.',
  '- You MUST cite at least one passage from EACH side. If the numbers/metric in your summary do not appear in the cited passages, reply not_a_change.',
].join('\n');

export async function judgeCandidate({ prevParagraph, currParagraph, prevFilingYear, currFilingYear }, prevContext, currContext) {
  // The candidate paragraphs become passage [1] on each side. Context follows
  // as [2..]. The LLM then cites by passage number; we resolve those back to
  // paragraph rows for Citation persistence.
  const prevList = [prevParagraph, ...prevContext];
  const currList = [currParagraph, ...currContext];
  const user = [
    `PREV passages (FY${prevFilingYear}):`,
    ...prevList.map((p, i) => `[${i + 1}] page ${p.page}: ${p.text}`),
    '',
    `CURR passages (FY${currFilingYear}):`,
    ...currList.map((p, i) => `[${i + 1}] page ${p.page}: ${p.text}`),
  ].join('\n');

  const raw = await chat(
    'summary',
    [{ role: 'system', content: JUDGE_SYSTEM }, { role: 'user', content: user }],
    { temperature: 0.1, maxTokens: 250, timeoutMs: 60000 }
  );

  // Tolerate stray prose around the JSON. Take the first {...} block.
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed;
  if (match) {
    try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
  }
  if (!parsed) return { verdict: 'not_a_change', _raw: raw };
  // Attach the resolved lists so the worker can map cites_* indices.
  parsed._prevList = prevList;
  parsed._currList = currList;
  return parsed;
}

// ─── Runtime helpers ──────────────────────────────────────────────────────

export async function runPool(items, concurrency, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

export const COMPARE_CONSTANTS = {
  SIMILAR_THRESHOLD,
  MATCH_THRESHOLD,
  TOP_CANDIDATES,
  RAG_CONTEXT_K,
  JUDGE_CONCURRENCY,
};
