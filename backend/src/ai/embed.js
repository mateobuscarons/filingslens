import { requireNim } from './nim.js';

const MODEL = () => process.env.NIM_EMBED_MODEL || 'nvidia/nv-embedqa-e5-v5';
const BATCH_SIZE = 16;

export async function embedPassages(texts) {
  return embedBatched(texts, 'passage');
}

export async function embedQuery(text) {
  const [v] = await embedBatched([text], 'query');
  return v;
}

async function embedBatched(texts, inputType) {
  const client = requireNim();
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: MODEL(),
      input: batch,
      input_type: inputType,
      truncate: 'END',
    });
    for (const r of res.data) out.push(r.embedding);
  }
  return out;
}
