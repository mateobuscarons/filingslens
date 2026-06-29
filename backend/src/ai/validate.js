import { chat } from './llm.js';

export async function validateIsAnnualReport(text) {
  try {
    const snippet = text.slice(0, 2000);
    const result = await chat(
      'utility',
      [
        {
          role: 'system',
          content:
            'You are a document classifier. Reply ONLY with valid JSON: {"valid": true/false, "reason": "short reason"}.',
        },
        {
          role: 'user',
          content: `Is the following text from a corporate annual report or financial filing (Geschäftsbericht, Jahresabschluss, etc.)? Answer true if yes, false if it appears to be something else (news article, product manual, etc.).\n\nText:\n${snippet}`,
        },
      ],
      { json: true, maxTokens: 80 }
    );
    if (typeof result?.valid === 'boolean') return result;
    return { valid: true, reason: 'validation skipped' };
  } catch {
    return { valid: true, reason: 'validation skipped' };
  }
}
