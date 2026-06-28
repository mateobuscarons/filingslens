import { chat } from './llm.js';
import { normalize, dot } from './vec.js';
import { resolveQuote } from './quoteResolver.js';

// Lean comparison: ONE LLM call per analysis.
//
//   1. For each current paragraph, find its closest previous paragraph by
//      cosine. Keep pairs in the [0.65, 0.95] band — close enough to be
//      "the same passage with edits", not identical, not unrelated.
//   2. Sort by similarity DESC (boilerplate-with-one-number-changed first —
//      that's where the material changes hide).
//   3. Send the top 20 pairs to the judge in one shot. It returns up to 10
//      grounded changes with verbatim quotes from both sides.
//   4. Resolve quotes to paragraph spans for citation.

const SIM_MIN = 0.65;
const SIM_MAX = 0.95;
const TOP_PAIRS = 12;
const MAX_CHANGES = 8;

// Match every current paragraph to its closest previous. Returns the top
// candidates already sliced — no scoring heuristics, just embedding cosine.
export function findCandidatePairs(prevParagraphs, currParagraphs) {
  const prevVecs = prevParagraphs.map((p) => normalize(p.embedding));
  const pairs = [];
  for (const curr of currParagraphs) {
    const q = normalize(curr.embedding);
    let best = -1, bestIdx = -1;
    for (let i = 0; i < prevVecs.length; i++) {
      const s = dot(q, prevVecs[i]);
      if (s > best) { best = s; bestIdx = i; }
    }
    if (best >= SIM_MIN && best <= SIM_MAX) {
      pairs.push({ prev: prevParagraphs[bestIdx], curr, similarity: best });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);
  return pairs.slice(0, TOP_PAIRS);
}

const CHANGE_SCHEMA = {
  name: 'comparison_changes',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      changes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pair_id: { type: 'integer' },
            topic: { type: 'string' },
            summary: { type: 'string' },
            prev_quote: { type: 'string' },
            curr_quote: { type: 'string' },
            impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['pair_id', 'topic', 'summary', 'prev_quote', 'curr_quote', 'impact'],
        },
      },
    },
    required: ['changes'],
  },
};

const SYSTEM_PROMPT = [
  'You compare two annual reports of the same company.',
  'You receive numbered pairs of paragraphs (PREV = older filing, CURR = newer). Each pair was pre-matched by semantic similarity, so they discuss the same topic.',
  '',
  'Identify the material changes — figures that moved, risks added/removed, outlook shifts. Skip cosmetic edits (year labels, formatting).',
  '',
  'CRITICAL — keep quotes SHORT and FOCUSED:',
  '- prev_quote and curr_quote MUST be short — at most ~80 characters each, ideally just the changed phrase or number ("75,9 Mrd. €", "neue Cyber-Risiken").',
  '- Quotes MUST be exact verbatim substrings of the indicated paragraph.',
  '- Never quote a whole sentence. Quote ONLY the few words that prove the change.',
  '',
  'For each change:',
  '- pair_id: 1-based pair number.',
  '- topic: 2–5 word noun phrase categorizing the change (e.g. "Board compensation", "Pension provisions", "Strategic risks"). Always in English, even when the passages are German.',
  '- summary: ONE short declarative sentence in the source language. Max 25 words.',
  '- impact: high (key metric/risk/outlook), medium (secondary), low (minor).',
  '',
  'German numbers: "." thousands, "," decimal. Quote character-for-character.',
  'If nothing material changed, return {"changes": []}.',
].join('\n');

export async function judgeAllPairs(pairs, { prevYear, currYear }) {
  if (!pairs.length) return [];
  const user = [
    `You are comparing FY${prevYear} (PREV) vs FY${currYear} (CURR).`,
    '',
    ...pairs.flatMap((p, i) => [
      `--- Pair ${i + 1} ---`,
      `PREV: ${p.prev.text}`,
      `CURR: ${p.curr.text}`,
      '',
    ]),
  ].join('\n');

  let parsed;
  try {
    parsed = await chat(
      'judge',
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }],
      { temperature: 0.1, maxTokens: 4000, timeoutMs: 90000, schema: CHANGE_SCHEMA }
    );
  } catch (err) {
    throw new Error(`Judge call failed: ${err.message}`);
  }

  const changes = parsed?.changes ?? [];
  const out = [];
  for (const c of changes) {
    const pair = pairs[(c.pair_id || 0) - 1];
    if (!pair) continue;
    const prevHit = c.prev_quote ? resolveQuote(c.prev_quote, [pair.prev]) : null;
    const currHit = c.curr_quote ? resolveQuote(c.curr_quote, [pair.curr]) : null;
    if (!prevHit && !currHit) continue;
    out.push({
      pair,
      topic: (c.topic || '').trim() || 'Untitled',
      summary: (c.summary || '').trim(),
      impact: c.impact || 'medium',
      prev: prevHit,
      curr: currHit,
    });
  }
  return out;
}

export const COMPARE_CONSTANTS = { SIM_MIN, SIM_MAX, TOP_PAIRS, MAX_CHANGES };
