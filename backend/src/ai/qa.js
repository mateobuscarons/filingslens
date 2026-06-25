import { Paragraph } from '../models/paragraph.js';
import { Filing } from '../models/filing.js';
import { embedQuery } from './embed.js';
import { chat } from './llm.js';
import { normalize, dot } from './vec.js';

const TOP_K = 4;

export async function answerQuestion(companyId, questionText) {
  const filings = await Filing.find({ companyId, ingestStatus: 'ready' }).lean();
  if (!filings.length) {
    return { status: 'no_evidence', answer: 'No ingested filings available for this company.', sources: [] };
  }
  const filingIds = filings.map((f) => f._id);
  const filingsByIdStr = new Map(filings.map((f) => [f._id.toString(), f]));

  const paragraphs = await Paragraph.find({ filingId: { $in: filingIds } }).lean();
  if (!paragraphs.length) {
    return { status: 'no_evidence', answer: 'No paragraphs indexed yet for this company.', sources: [] };
  }

  const qVec = normalize(await embedQuery(questionText));

  const scored = new Array(paragraphs.length);
  for (let i = 0; i < paragraphs.length; i++) {
    scored[i] = { i, score: dot(qVec, normalize(paragraphs[i].embedding)) };
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_K).map(({ i, score }) => ({ ...paragraphs[i], score }));

  const minScore = top[0]?.score ?? 0;
  if (minScore < 0.3) {
    return {
      status: 'no_evidence',
      answer: 'The indexed filings do not contain a clear answer to that question.',
      sources: [],
    };
  }

  const context = top
    .map((p, idx) => {
      const filing = filingsByIdStr.get(p.filingId.toString());
      const year = filing?.fiscalYear ?? '?';
      return `[${idx + 1}] FY${year}, page ${p.page}:\n${p.text}`;
    })
    .join('\n\n');

  const messages = [
    {
      role: 'system',
      content: [
        'You are a financial-analyst assistant answering questions about German annual reports.',
        'STRICT RULES:',
        '- Answer using ONLY the numbered passages provided. Never use outside knowledge.',
        '- Cite every factual claim with the passage number in square brackets, e.g. [1] or [2][3].',
        '- If the passages do not contain enough information, reply with exactly: "INSUFFICIENT_EVIDENCE" and nothing else.',
        '- LANGUAGE: You MUST answer in the SAME language as the question. If the user asks in English, answer in English even if the cited passages are in German — translate the surrounding wording but keep the numbers verbatim. If the user asks in German, answer in German.',
        '- Be concise (max 4 sentences).',
        '- Quote numbers exactly as they appear. German format uses "." as thousands separator and "," as decimal.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Question: ${questionText}\n\nPassages:\n${context}`,
    },
  ];

  const raw = await chat('qa', messages, { temperature: 0.1, maxTokens: 400, timeoutMs: 45000 });

  if (raw.includes('INSUFFICIENT_EVIDENCE')) {
    return {
      status: 'no_evidence',
      answer: 'The indexed filings do not contain a clear answer to that question.',
      sources: [],
    };
  }

  const citedIndices = new Set();
  for (const match of raw.matchAll(/\[(\d+)\]/g)) {
    const idx = parseInt(match[1], 10) - 1;
    if (idx >= 0 && idx < top.length) citedIndices.add(idx);
  }
  const sources = [...citedIndices].map((idx) => {
    const p = top[idx];
    const filing = filingsByIdStr.get(p.filingId.toString());
    return {
      paragraphId: p._id,
      filingId: p.filingId,
      fiscalYear: filing?.fiscalYear,
      page: p.page,
      excerpt: p.text.slice(0, 220),
      score: p.score,
      passageNumber: idx + 1,
    };
  });

  return { status: sources.length ? 'ready' : 'ready', answer: raw, sources };
}
