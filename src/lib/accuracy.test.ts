import { describe, expect, it } from 'vitest';
import {
  calculateIntegrityScore,
  fuzzyMatch,
  getVerdictPresentation,
  normalizeVerdict,
} from './accuracy';

describe('normalizeVerdict', () => {
  it('preserves supported verdicts including unverified', () => {
    expect(normalizeVerdict('true')).toBe('true');
    expect(normalizeVerdict('false')).toBe('false');
    expect(normalizeVerdict('context')).toBe('context');
    expect(normalizeVerdict('unverified')).toBe('unverified');
  });

  it('maps unsupported verdicts to unverified', () => {
    expect(normalizeVerdict('mostly true')).toBe('unverified');
    expect(normalizeVerdict(undefined)).toBe('unverified');
  });
});

describe('calculateIntegrityScore', () => {
  it('scores only verified claims and reports uncertainty separately', () => {
    const result = calculateIntegrityScore({
      true: 2,
      context: 1,
      false: 1,
      unverified: 3,
      unmatched: 2,
    });

    expect(result.score).toBe(63);
    expect(result.verifiedClaims).toBe(4);
    expect(result.totalClaims).toBe(9);
    expect(result.unverifiedClaims).toBe(3);
    expect(result.unmatchedClaims).toBe(2);
  });

  it('returns a null score when no claims were verified', () => {
    const result = calculateIntegrityScore({
      true: 0,
      context: 0,
      false: 0,
      unverified: 2,
      unmatched: 1,
    });

    expect(result.score).toBeNull();
    expect(result.verifiedClaims).toBe(0);
    expect(result.totalClaims).toBe(3);
  });
});

describe('getVerdictPresentation', () => {
  it('presents unverified claims neutrally', () => {
    const presentation = getVerdictPresentation('unverified');

    expect(presentation.label).toBe('Unverified');
    expect(presentation.scoreWeight).toBeNull();
    expect(presentation.badgeColor).not.toBe('#10B981');
  });
});

describe('fuzzyMatch', () => {
  it('does not match unrelated text that only shares common words', () => {
    const result = fuzzyMatch(
      'The president signed a climate bill after months of debate.',
      'The president visited the moon last night',
    );

    expect(result.match).toBe(false);
  });

  it('matches a distinctive phrase from the same text', () => {
    const result = fuzzyMatch(
      'The company reported $4.2 billion in revenue for the second quarter.',
      '$4.2 billion in revenue',
    );

    expect(result.match).toBe(true);
  });
});
