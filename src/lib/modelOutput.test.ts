import { describe, expect, it } from 'vitest';
import {
  ApiStatusError,
  parseFactCheckResults,
  shouldRetryScanError,
} from './modelOutput';

describe('parseFactCheckResults', () => {
  it('extracts JSON from markdown and validates claim objects', () => {
    const claims = parseFactCheckResults(`Here you go:
\`\`\`json
[
  {
    "quote": "GDP grew 3 percent",
    "verdict": "true",
    "claim": "GDP grew 3 percent",
    "comments": "Supported by official data",
    "source": "https://example.com/report"
  }
]
\`\`\``);

    expect(claims).toEqual([
      {
        quote: 'GDP grew 3 percent',
        verdict: 'true',
        claim: 'GDP grew 3 percent',
        comments: 'Supported by official data',
        source: 'https://example.com/report',
      },
    ]);
  });

  it('normalizes unsupported verdicts to unverified', () => {
    const claims = parseFactCheckResults(JSON.stringify([
      {
        quote: 'The merger closed Monday',
        verdict: 'mostly true',
        claim: 'The merger closed Monday',
        comments: 'Ambiguous search results',
        source: 'https://example.com/news',
      },
    ]));

    expect(claims[0]?.verdict).toBe('unverified');
  });

  it('drops claims that cannot be anchored or understood', () => {
    const claims = parseFactCheckResults(JSON.stringify([
      {
        quote: '',
        verdict: 'true',
        claim: 'Missing quote',
        comments: 'Bad output',
        source: 'https://example.com',
      },
      {
        quote: 'Valid quote',
        verdict: 'false',
        claim: 'Valid claim',
        comments: 'Contradicted by source',
        source: 'javascript:alert(1)',
      },
    ]));

    expect(claims).toEqual([
      {
        quote: 'Valid quote',
        verdict: 'unverified',
        claim: 'Valid claim',
        comments: 'Unable to verify from search results.',
        source: '',
      },
    ]);
  });

  it('throws when no valid claims remain', () => {
    expect(() => parseFactCheckResults('[{"quote":"","claim":""}]')).toThrow('No valid fact-check claims');
  });

  it('throws instead of accepting partial truncated output', () => {
    const truncated = `[
      {
        "quote": "Complete quote",
        "verdict": "true",
        "claim": "Complete claim",
        "comments": "Supported",
        "source": "https://example.com"
      },
      {
        "quote": "Incomplete quote",
        "verdict": "false"`;

    expect(() => parseFactCheckResults(truncated)).toThrow('JSON parsing failed');
  });
});

describe('shouldRetryScanError', () => {
  it('does not retry authentication errors', () => {
    expect(shouldRetryScanError(new ApiStatusError(401, 'Unauthorized'), 0, 3)).toBe(false);
  });

  it('retries rate limits and malformed model output within the retry budget', () => {
    expect(shouldRetryScanError(new ApiStatusError(429, 'Rate limited'), 0, 3)).toBe(true);
    expect(shouldRetryScanError(new Error('JSON parsing failed'), 1, 3)).toBe(true);
  });

  it('stops retrying after the retry budget is exhausted', () => {
    expect(shouldRetryScanError(new ApiStatusError(500, 'Server error'), 3, 3)).toBe(false);
  });
});
