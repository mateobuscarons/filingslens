import { diffWordsWithSpace } from 'diff';
import { chat } from './llm.js';
import { normalize, dot } from './vec.js';

const SIMILAR_THRESHOLD = 0.95;
const MATCH_THRESHOLD = 0.70;
const TOP_SUMMARIES = 10;
const SUMMARY_CONCURRENCY = 4;

const KEYWORDS = [
  'risiko', 'risk', 'wesentlich', 'material', 'rückgang', 'decline',
  'rekord', 'record', 'einbruch', 'verlust', 'loss', 'haftung',
  'liability', 'rechtsstreit', 'litigation', 'krise', 'crisis', 'einfluss',
  'auswirk', 'impact', 'ergebnis', 'gewinn', 'profit', 'umsatz', 'revenue',
];

const SECTION_MARKERS = [
  'lagebericht', 'konzernabschluss', 'risikobericht', 'prognose',
  'vergütung', 'segment', 'ebit', 'cash flow', 'kapital',
];

export function buildIndex(paragraphs) {
  const vectors = paragraphs.map((p) => normalize(p.embedding));
  return { paragraphs, vectors };
}

export function findBestMatch(queryVec, index) {
  let best = -1;
  let bestIdx = -1;
  for (let i = 0; i < index.vectors.length; i++) {
    const s = dot(queryVec, index.vectors[i]);
    if (s > best) {
      best = s;
      bestIdx = i;
    }
  }
  return { index: bestIdx, similarity: best };
}

export function diffParagraphs(prevText, currText) {
  const parts = diffWordsWithSpace(prevText, currText);
  return parts.map((p) => ({
    op: p.added ? 'add' : p.removed ? 'rem' : 'eq',
    text: p.value,
  }));
}

function extractNumbers(text) {
  const matches = [...text.matchAll(/(?<![\w.])\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?!\w)/g)];
  return matches
    .map((m) => parseFloat(m[0].replace(/\./g, '').replace(',', '.')))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

export function numericDelta(prevText, currText) {
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

export function keywordSignal(text) {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of KEYWORDS) if (lower.includes(kw)) hits++;
  return Math.min(hits / 4, 1);
}

export function sectionWeight(text, sectionLabel) {
  const blob = `${sectionLabel} ${text.slice(0, 200)}`.toLowerCase();
  for (const m of SECTION_MARKERS) if (blob.includes(m)) return 1;
  return 0.4;
}

function lengthBonus(text) {
  return Math.min(text.length / 400, 1);
}

export function scoreModified(prevPara, currPara) {
  const nd = numericDelta(prevPara.text, currPara.text);
  const kw = keywordSignal(currPara.text);
  const sw = sectionWeight(currPara.text, currPara.section);
  const lb = lengthBonus(currPara.text);
  return clamp01(0.45 * nd + 0.30 * kw + 0.15 * sw + 0.10 * lb);
}

export function scoreAddedOrRemoved(para) {
  const kw = keywordSignal(para.text);
  const sw = sectionWeight(para.text, para.section);
  const lb = lengthBonus(para.text);
  return clamp01(0.55 * kw + 0.25 * sw + 0.20 * lb);
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function impactBucket(score) {
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

export async function summarizeModifiedFinding(prevText, currText) {
  const messages = [
    {
      role: 'system',
      content: [
        'You summarize one change between matching excerpts from a German annual report.',
        'Reply with exactly one sentence in English, max 25 words.',
        'Include the metric name and BOTH the old value and the new value when both are visible in the text (e.g. "X decreased from A to B").',
        'Numbers must appear verbatim in the excerpts. Never invent figures or units.',
        'Note: German numbers use "." as thousands separator and "," as decimal point. Treat 1.373 as one-thousand-three-hundred-seventy-three.',
        'Skip percentage calculations unless both raw values are explicit.',
        'If no clear quantitative change is present, describe the qualitative shift in one sentence.',
        'No commentary, no recommendations.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `PREVIOUS (older filing):\n${prevText}\n\nCURRENT (newer filing):\n${currText}`,
    },
  ];
  return chat('summary', messages, { temperature: 0.1, maxTokens: 120, timeoutMs: 45000 });
}

export const COMPARE_CONSTANTS = { SIMILAR_THRESHOLD, MATCH_THRESHOLD, TOP_SUMMARIES, SUMMARY_CONCURRENCY };
