import { describe, expect, it } from 'vitest';
import {
  createPerplexityAuthHeader,
  createPerplexityValidationBody,
  formatPerplexityErrorMessage,
  normalizeApiKey,
} from './perplexity';

describe('normalizeApiKey', () => {
  it('trims whitespace from copied API keys', () => {
    expect(normalizeApiKey('  pplx-example-key\n')).toBe('pplx-example-key');
  });
});

describe('createPerplexityAuthHeader', () => {
  it('uses the trimmed key in the bearer token', () => {
    expect(createPerplexityAuthHeader('  pplx-example-key\n')).toBe('Bearer pplx-example-key');
  });
});

describe('createPerplexityValidationBody', () => {
  it('uses a valid sonar max_tokens value', () => {
    expect(createPerplexityValidationBody()).toEqual({
      model: 'sonar',
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 16,
    });
  });
});

describe('formatPerplexityErrorMessage', () => {
  it('does not call billing and rate-limit failures invalid API keys', () => {
    expect(formatPerplexityErrorMessage(402, 'Insufficient credits')).toContain('billing');
    expect(formatPerplexityErrorMessage(429, 'Rate limit exceeded')).toContain('rate limit');
  });

  it('uses the provider message for unexpected validation failures', () => {
    expect(formatPerplexityErrorMessage(400, 'Model not found')).toBe('Perplexity rejected the validation request: Model not found');
  });
});
