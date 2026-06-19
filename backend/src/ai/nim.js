import OpenAI from 'openai';

let client = null;

export function getNimClient() {
  if (!process.env.NIM_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.NIM_API_KEY,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }
  return client;
}

export class NimUnavailableError extends Error {
  constructor() {
    super('NIM_API_KEY not configured');
    this.status = 503;
    this.code = 'NIM_UNAVAILABLE';
  }
}

export function requireNim() {
  const c = getNimClient();
  if (!c) throw new NimUnavailableError();
  return c;
}
