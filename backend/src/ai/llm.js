import { requireGroq } from './groq.js';

// Task → (model, default options). One place to change provider behavior.
//
//   judge   = comparison change detection, needs deterministic JSON.
//   qa      = RAG answerer, German-friendly, longer context.
//   utility = cheap helper calls (rewrites, titling). Keep this fast.
const TASKS = {
  judge: {
    model: () => process.env.GROQ_JUDGE_MODEL || 'openai/gpt-oss-120b',
    supportsStrictSchema: true,
  },
  qa: {
    model: () => process.env.GROQ_QA_MODEL || 'qwen/qwen3-32b',
    supportsStrictSchema: false,
  },
  utility: {
    model: () => process.env.GROQ_UTILITY_MODEL || 'llama-3.1-8b-instant',
    supportsStrictSchema: false,
  },
};

// chat(task, messages, opts)
//   opts.schema  → strict JSON Schema (object). Will throw if used with a task
//                  whose model does not support strict schema. The returned
//                  value is the parsed JSON object.
//   opts.json    → request JSON object mode (no schema). Returns parsed JSON.
//   default      → returns the trimmed text content.
export async function chat(task, messages, opts = {}) {
  const cfg = TASKS[task];
  if (!cfg) throw new Error(`Unknown llm task: ${task}`);
  const client = requireGroq();
  const {
    temperature = 0.1,
    maxTokens = 800,
    timeoutMs = 60000,
    retries = 1,
    schema,
    json,
  } = opts;

  const body = {
    model: cfg.model(),
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (schema) {
    if (!cfg.supportsStrictSchema) {
      // Fall back to JSON object mode; caller still gets parsed JSON.
      body.response_format = { type: 'json_object' };
    } else {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: schema.name || 'output', schema: schema.schema || schema, strict: true },
      };
    }
  } else if (json) {
    body.response_format = { type: 'json_object' };
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await client.chat.completions.create(body, { timeout: timeoutMs });
      const raw = res.choices[0]?.message?.content?.trim() || '';
      if (schema || json) return parseJsonLoose(raw);
      return raw;
    } catch (err) {
      lastErr = err;
      const code = err?.cause?.code || err?.code;
      const transient =
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        /timeout|timed out|rate.?limit|429/i.test(err.message || '');
      if (!transient || attempt === retries) break;
      console.warn(`[llm] ${task} attempt ${attempt + 1} transient error (${code || err.message}), retrying`);
    }
  }
  throw lastErr;
}

// Tolerant JSON parser. Strict schema responses are always valid JSON, but
// JSON-object mode and fallbacks occasionally wrap output in code fences.
function parseJsonLoose(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
}
