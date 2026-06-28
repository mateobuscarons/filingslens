import OpenAI from 'openai';

let client = null;

export function getGroqClient() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return client;
}

export class GroqUnavailableError extends Error {
  constructor() {
    super('GROQ_API_KEY not configured');
    this.status = 503;
    this.code = 'GROQ_UNAVAILABLE';
  }
}

export function requireGroq() {
  const c = getGroqClient();
  if (!c) throw new GroqUnavailableError();
  return c;
}
