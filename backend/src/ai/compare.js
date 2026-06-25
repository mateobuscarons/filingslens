import { diffWordsWithSpace } from 'diff';
import { chat } from './llm.js';
import { normalize, dot } from './vec.js';

// ---- Tunable constants -----------------------------------------------------

const SIMILAR_THRESHOLD = 0.95;   // paragraphs above this are "unchanged"
const MATCH_THRESHOLD   = 0.70;   // below MATCH = added; in [MATCH..SIMILAR) = modified

const MIN_PARAGRAPH_LENGTH = 60;  // filter out page numbers, table fragments, etc.
const JACCARD_DUPLICATE   = 0.80; // findings sharing >=80% tokens are duplicates

const TOP_MODIFIED = 10;
const TOP_ADDED    = 3;
const TOP_REMOVED  = 2;
const SUMMARY_CONCURRENCY = 4;

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

// ---- Paragraph filtering & cosine matching --------------------------------

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

export function diffParagraphs(prevText, currText) {
  return diffWordsWithSpace(prevText, currText).map((p) => ({
    op: p.added ? 'add' : p.removed ? 'rem' : 'eq',
    text: p.value,
  }));
}

// ---- Materiality scoring ---------------------------------------------------

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

export function scoreAddedOrRemoved(p) {
  return clamp01(
    0.55 * keywordSignal(p.text) +
    0.25 * sectionWeight(p.text, p.section) +
    0.20 * lengthBonus(p.text)
  );
}

export function impactBucket(score) {
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

// ---- Dedup (greedy by Jaccard token overlap) ------------------------------

function tokenize(text) {
  return new Set((text.toLowerCase().match(/[\wäöüß]+/g) || []).filter((t) => t.length >= 3));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Greedy dedup. `findings` must already be sorted by descending materiality.
export function dedupFindings(findings) {
  const kept = [];
  for (const f of findings) {
    const tokens = tokenize(f.excerpt);
    let dupe = false;
    for (const k of kept) {
      if (jaccard(tokens, k._tokens) >= JACCARD_DUPLICATE) { dupe = true; break; }
    }
    if (!dupe) {
      f._tokens = tokens;
      kept.push(f);
    }
  }
  for (const k of kept) delete k._tokens;
  return kept;
}

// ---- LLM summaries (one prompt per type, single sentence) -----------------

const COMMON_RULES = [
  'Reply with EXACTLY one declarative sentence in the language of the excerpt, max 30 words.',
  'Numbers must appear verbatim in the excerpt. Never invent figures.',
  'German numbers use "." as thousands separator and "," as decimal point.',
  'Do not self-correct. Do not write "Note:", "Correction:" or any commentary.',
];

const SYSTEM_MODIFIED = [
  'You compare two excerpts from a German annual report. The first is from the PREVIOUS filing, the second from the CURRENT filing.',
  'Describe the change between them. If a metric appears with old and new values, write "<metric> changed from <old> to <new>".',
  ...COMMON_RULES,
].join('\n');

const SYSTEM_ADDED = [
  'You read one excerpt newly present in the CURRENT filing of a German annual report — it was not in the previous filing.',
  'Describe what is new in plain prose.',
  ...COMMON_RULES,
].join('\n');

const SYSTEM_REMOVED = [
  'You read one excerpt from a PREVIOUS filing that no longer appears in the current filing.',
  'Describe what was removed in plain prose.',
  ...COMMON_RULES,
].join('\n');

export async function summarizeFinding(finding) {
  let system, user;
  if (finding.type === 'modified') {
    system = SYSTEM_MODIFIED;
    user = `PREVIOUS:\n${finding._prevText}\n\nCURRENT:\n${finding._currText}`;
  } else if (finding.type === 'added') {
    system = SYSTEM_ADDED;
    user = finding.excerpt;
  } else {
    system = SYSTEM_REMOVED;
    user = finding.excerpt;
  }
  return chat(
    'summary',
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { temperature: 0.1, maxTokens: 120, timeoutMs: 45000 }
  );
}

// ---- Runtime helpers -------------------------------------------------------

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
  TOP_MODIFIED,
  TOP_ADDED,
  TOP_REMOVED,
  SUMMARY_CONCURRENCY,
};
