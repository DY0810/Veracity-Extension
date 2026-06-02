import type { FactCheckVerdict } from '../types';

export interface VerdictCounts {
  true: number;
  context: number;
  false: number;
  unverified: number;
  unmatched: number;
}

export interface IntegrityScoreResult {
  score: number | null;
  verifiedClaims: number;
  unverifiedClaims: number;
  unmatchedClaims: number;
  totalClaims: number;
}

export interface MatchResult {
  match: boolean;
  startIndex: number;
  endIndex: number;
}

export interface VerdictPresentation {
  label: string;
  badgeColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  icon: string;
  scoreWeight: number | null;
}

const SUPPORTED_VERDICTS: FactCheckVerdict[] = ['true', 'false', 'context', 'unverified'];

export function normalizeVerdict(value: unknown): FactCheckVerdict {
  return typeof value === 'string' && SUPPORTED_VERDICTS.includes(value as FactCheckVerdict)
    ? value as FactCheckVerdict
    : 'unverified';
}

export function calculateIntegrityScore(counts: VerdictCounts): IntegrityScoreResult {
  const verifiedClaims = counts.true + counts.context + counts.false;
  const totalClaims = verifiedClaims + counts.unverified + counts.unmatched;
  const score = verifiedClaims > 0
    ? Math.round(((counts.true + counts.context * 0.5) / verifiedClaims) * 100)
    : null;

  return {
    score,
    verifiedClaims,
    unverifiedClaims: counts.unverified,
    unmatchedClaims: counts.unmatched,
    totalClaims,
  };
}

export function getVerdictPresentation(verdict: FactCheckVerdict): VerdictPresentation {
  switch (verdict) {
    case 'false':
      return {
        label: 'False',
        badgeColor: '#EF4444',
        backgroundColor: '#fee2e2',
        borderColor: '#dc2626',
        textColor: '#991b1b',
        icon: 'x',
        scoreWeight: 0,
      };
    case 'context':
      return {
        label: 'Needs Context',
        badgeColor: '#F59E0B',
        backgroundColor: '#fef3c7',
        borderColor: '#f59e0b',
        textColor: '#92400e',
        icon: '!',
        scoreWeight: 0.5,
      };
    case 'true':
      return {
        label: 'True',
        badgeColor: '#10B981',
        backgroundColor: '#d1fae5',
        borderColor: '#059669',
        textColor: '#065f46',
        icon: '✓',
        scoreWeight: 1,
      };
    case 'unverified':
      return {
        label: 'Unverified',
        badgeColor: '#64748B',
        backgroundColor: '#f1f5f9',
        borderColor: '#64748b',
        textColor: '#334155',
        icon: '?',
        scoreWeight: null,
      };
  }
}

export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .trim()
    .toLowerCase();
}

function stripPunctuation(text: string): string {
  return normalizeText(text).replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toDistinctiveWords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'after',
    'before',
    'into',
    'over',
    'under',
    'last',
    'night',
  ]);

  return stripPunctuation(text)
    .split(' ')
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

export function fuzzyMatch(haystack: string, needle: string): MatchResult {
  const normHaystack = normalizeText(haystack);
  const normNeedle = normalizeText(needle);

  if (!normNeedle) {
    return { match: false, startIndex: 0, endIndex: 0 };
  }

  const exactIndex = normHaystack.indexOf(normNeedle);
  if (exactIndex !== -1) {
    return { match: true, startIndex: exactIndex, endIndex: exactIndex + normNeedle.length };
  }

  const cleanHaystack = stripPunctuation(haystack);
  const cleanNeedle = stripPunctuation(needle);
  const cleanIndex = cleanHaystack.indexOf(cleanNeedle);
  if (cleanNeedle.length >= 12 && cleanIndex !== -1) {
    return { match: true, startIndex: cleanIndex, endIndex: cleanIndex + cleanNeedle.length };
  }

  const needleWords = toDistinctiveWords(needle);
  if (needleWords.length < 4) {
    return { match: false, startIndex: 0, endIndex: 0 };
  }

  const cleanWords = cleanHaystack.split(' ');
  for (let windowSize = Math.min(needleWords.length, 6); windowSize >= 4; windowSize--) {
    for (let i = 0; i <= needleWords.length - windowSize; i++) {
      const phrase = needleWords.slice(i, i + windowSize).join(' ');
      const start = cleanHaystack.indexOf(phrase);
      if (start !== -1 && cleanWords.includes(needleWords[i])) {
        return { match: true, startIndex: start, endIndex: start + phrase.length };
      }
    }
  }

  return { match: false, startIndex: 0, endIndex: 0 };
}
