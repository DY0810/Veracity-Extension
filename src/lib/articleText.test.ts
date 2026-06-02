import { describe, expect, it } from 'vitest';
import { buildArticleTextPayload } from './articleText';

describe('buildArticleTextPayload', () => {
  it('deduplicates repeated text blocks before applying the scan limit', () => {
    const payload = buildArticleTextPayload([
      'The same paragraph appears once.',
      'The same paragraph appears once.',
      'A second paragraph adds detail.',
    ], 1000);

    expect(payload.text).toBe('The same paragraph appears once.\n\nA second paragraph adds detail.');
    expect(payload.truncated).toBe(false);
  });

  it('reports truncation when text exceeds the scan limit', () => {
    const payload = buildArticleTextPayload([
      'First long paragraph.',
      'Second long paragraph.',
      'Third long paragraph.',
    ], 42);

    expect(payload.text.length).toBeLessThanOrEqual(42);
    expect(payload.truncated).toBe(true);
    expect(payload.includedCharacters).toBeLessThan(payload.totalCharacters);
  });
});
