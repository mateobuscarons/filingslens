import { Paragraph } from '../models/paragraph.js';
import { Filing } from '../models/filing.js';
import { embedQuery } from './embed.js';
import { chat } from './llm.js';
import { normalize, dot } from './vec.js';
import { resolveQuote } from './quoteResolver.js';

const TOP_K = 20;            // retrieved candidates before LLM
const MAX_CONTEXT = 8;       // passages passed to the LLM
const MIN_PER_YEAR = 2;      // floor per filing year if available

// Public entry: returns
//   { status, answer, citations }
// citations are ready-to-persist objects (caller adds sourceType/sourceId).
export async function answerQuestion(companyId, questionText) {
  const filings = await Filing.find({ companyId, ingestStatus: 'ready' }).lean();
  if (!filings.length) {
    return { status: 'no_evidence', answer: 'No ingested filings available for this company.', citations: [] };
  }
  const filingIds = filings.map((f) => f._id);
  const filingsById = new Map(filings.map((f) => [f._id.toString(), f]));

  const paragraphs = await Paragraph.find({ filingId: { $in: filingIds } }).lean();
  if (!paragraphs.length) {
    return { status: 'no_evidence', answer: 'No paragraphs indexed yet for this company.', citations: [] };
  }

  const qVec = normalize(await embedQuery(questionText));
  const scored = paragraphs.map((p, i) => ({ i, score: dot(qVec, normalize(p.embedding)) }));
  scored.sort((a, b) => b.score - a.score);

  // Retrieve top K, then rebalance: at least MIN_PER_YEAR per filing year
  // when available. Avoids the "all answers from one year" failure mode.
  const ranked = scored.slice(0, TOP_K).map(({ i, score }) => ({ ...paragraphs[i], score }));
  const balanced = rebalanceByFiling(ranked, filings, MIN_PER_YEAR, MAX_CONTEXT);

  // Stable order for the LLM: oldest filing first, then by score within year.
  balanced.sort((a, b) => {
    const ya = filingsById.get(a.filingId.toString())?.fiscalYear ?? 0;
    const yb = filingsById.get(b.filingId.toString())?.fiscalYear ?? 0;
    return ya - yb || b.score - a.score;
  });

  const context = balanced
    .map((p, idx) => {
      const filing = filingsById.get(p.filingId.toString());
      return `[${idx + 1}] FY${filing?.fiscalYear ?? '?'}, page ${p.page}:\n${p.text}`;
    })
    .join('\n\n');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Question: ${questionText}\n\nPassages:\n${context}` },
  ];

  let parsed;
  try {
    parsed = await chat('qa', messages, {
      temperature: 0.1,
      maxTokens: 800,
      timeoutMs: 45000,
      schema: ANSWER_SCHEMA,
    });
  } catch (err) {
    throw new Error(`QA model call failed: ${err.message}`);
  }

  const answer = (parsed?.answer || '').trim();
  if (!answer || answer === 'INSUFFICIENT_EVIDENCE') {
    return {
      status: 'no_evidence',
      answer: 'The indexed filings do not contain a clear answer to that question.',
      citations: [],
    };
  }

  // Resolve quoted spans back to paragraph offsets. Citations that fail to
  // resolve are dropped — we never persist a citation without a real anchor.
  // marker = passage_number directly so the [N] markers in the answer text
  // line up with the citation cards.
  const raw = Array.isArray(parsed.citations) ? parsed.citations : [];
  const citations = [];
  const seenMarker = new Set();
  for (const c of raw) {
    const passageNumber = c.passage_number || 0;
    const idx = passageNumber - 1;
    if (idx < 0 || idx >= balanced.length) continue;
    if (seenMarker.has(passageNumber)) continue; // dedupe same passage cited twice
    const passage = balanced[idx];
    const hit = c.quote ? resolveQuote(c.quote, [passage]) : null;
    if (!hit) continue;
    const filing = filingsById.get(passage.filingId.toString());
    citations.push({
      paragraphId: passage._id,
      filingId: passage.filingId,
      filingYear: filing?.fiscalYear,
      page: passage.page,
      excerpt: passage.text,
      claimText: hit.claimText,
      charStart: hit.charStart,
      charEnd: hit.charEnd,
      marker: passageNumber,
    });
    seenMarker.add(passageNumber);
  }

  // Strip [N] markers from the answer that don't map to a resolved citation,
  // so the UI never renders a dead-link bracket. Trailing whitespace from
  // removed markers is collapsed.
  const validMarkers = new Set(citations.map((c) => c.marker));
  const cleanedAnswer = answer
    .replace(/\[(\d+)\]/g, (full, n) => (validMarkers.has(+n) ? full : ''))
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();

  return { status: 'ready', answer: cleanedAnswer, citations };
}

function rebalanceByFiling(ranked, filings, minPerYear, max) {
  const byFiling = new Map(filings.map((f) => [f._id.toString(), []]));
  for (const p of ranked) {
    const k = p.filingId.toString();
    if (byFiling.has(k)) byFiling.get(k).push(p);
  }

  const picked = [];
  // First pass: take up to minPerYear from each filing.
  for (const list of byFiling.values()) {
    picked.push(...list.slice(0, minPerYear));
  }
  // Second pass: fill remaining slots by global score.
  const used = new Set(picked.map((p) => p._id.toString()));
  for (const p of ranked) {
    if (picked.length >= max) break;
    if (used.has(p._id.toString())) continue;
    picked.push(p);
    used.add(p._id.toString());
  }
  return picked.slice(0, max);
}

const SYSTEM_PROMPT = [
  'You are a financial-analyst assistant answering questions about German annual reports.',
  'Output strict JSON: { "answer": string, "citations": [ { "passage_number": int, "quote": string } ] }.',
  '',
  'Rules:',
  '- Answer ONLY from the numbered passages. Never use outside knowledge.',
  '- Reference passages inline with bracket markers like [1], [2][3]. Each marker must correspond to a passage in your citations array, in order of first appearance.',
  '- For each citation, "quote" MUST be an exact substring of the cited passage. Do not paraphrase.',
  '- LANGUAGE: answer in the SAME language as the question. Translate surrounding wording but keep numbers verbatim.',
  '- Be concise (max 4 sentences).',
  '- German numbers use "." as thousands separator and "," as decimal.',
  '- If the passages do not contain enough information, return {"answer":"INSUFFICIENT_EVIDENCE","citations":[]}.',
].join('\n');

const ANSWER_SCHEMA = {
  name: 'qa_answer',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string' },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            passage_number: { type: 'integer' },
            quote: { type: 'string' },
          },
          required: ['passage_number', 'quote'],
        },
      },
    },
    required: ['answer', 'citations'],
  },
};
