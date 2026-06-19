import { requireNim } from './nim.js';

const MODELS = {
  summary: () => process.env.LLM_SUMMARY_MODEL || 'meta/llama-3.1-8b-instruct',
  qa: () => process.env.LLM_QA_MODEL || 'meta/llama-3.3-70b-instruct',
};

export async function chat(task, messages, { temperature = 0.2, maxTokens = 400, timeoutMs = 30000, retries = 1 } = {}) {
  const client = requireNim();
  const model = (MODELS[task] || MODELS.summary)();
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await client.chat.completions.create(
        { model, messages, temperature, max_tokens: maxTokens },
        { timeout: timeoutMs }
      );
      return res.choices[0]?.message?.content?.trim() || '';
    } catch (err) {
      lastErr = err;
      const code = err?.cause?.code || err?.code;
      const transient = code === 'ETIMEDOUT' || code === 'ECONNRESET' || /timeout|timed out/i.test(err.message || '');
      if (!transient || attempt === retries) break;
      console.warn(`[llm] ${task} attempt ${attempt + 1} transient error (${code}), retrying`);
    }
  }
  throw lastErr;
}
