import { Paragraph } from '../models/paragraph.js';
import { Filing } from '../models/filing.js';
import { embedQuery } from './embed.js';
import { chat } from './llm.js';
import { normalize, dot } from './vec.js';
import { resolveQuote } from './quoteResolver.js';

// Sentence-level chunks are short (~80–250 chars), so we can hand a much
// larger pool to the LLM than with the old paragraph chunks.
const TOP_K = 70;

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
  const context = scored.slice(0, TOP_K).map(({ i, score }) => ({ ...paragraphs[i], score }));

  const passageBlock = context
    .map((p, idx) => {
      const filing = filingsById.get(p.filingId.toString());
      return `[${idx + 1}] FY${filing?.fiscalYear ?? '?'}, page ${p.page}:\n${p.text}`;
    })
    .join('\n\n');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Question: ${questionText}\n\nPassages:\n${passageBlock}` },
  ];

  let parsed;
  try {
    parsed = await chat('qa', messages, {
      temperature: 0.1,
      maxTokens: 1500,
      timeoutMs: 60000,
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

  const raw = Array.isArray(parsed.citations) ? parsed.citations : [];
  const citations = [];
  const seenMarker = new Set();
  for (const c of raw) {
    const passageNumber = c.passage_number || 0;
    const idx = passageNumber - 1;
    if (idx < 0 || idx >= context.length) continue;
    if (seenMarker.has(passageNumber)) continue;
    const passage = context[idx];
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

  const validMarkers = new Set(citations.map((c) => c.marker));
  const cleanedAnswer = answer
    .replace(/\[(\d+)\]/g, (full, n) => (validMarkers.has(+n) ? full : ''))
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();

  return { status: 'ready', answer: cleanedAnswer, citations };
}

const SYSTEM_PROMPT = [
  'You answer questions about German annual reports using only the numbered passages.',
  'Output strict JSON: { "answer": string, "citations": [ { "passage_number": int, "quote": string } ] }.',
  '',
  '- Cite every claim with bracket markers like [1], [2]. Each marker must appear in the citations array.',
  '- "quote" must be an exact substring of the cited passage.',
  '- Each passage header shows its filing year (e.g. "FY2025"). A passage may also reference prior-year values inline; quote them when relevant.',
  '- Answer in the same language as the question. Keep numbers verbatim (German: "." thousands, "," decimal).',
  '- Be precise. A maximum/cap is not the same as an actual paid figure; a target is not a realized value. If your passages describe a related concept but not the exact one asked, return {"answer":"INSUFFICIENT_EVIDENCE","citations":[]}.',
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
