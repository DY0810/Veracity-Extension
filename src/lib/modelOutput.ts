import type { FactCheckResult } from '../types';
import { normalizeVerdict } from './accuracy';

export class ApiStatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiStatusError';
    this.status = status;
  }
}

export function parseFactCheckResults(content: string): FactCheckResult[] {
  const jsonString = extractJsonString(content);
  const parsed = parseJsonArray(jsonString);
  const claims = parsed.map(validateClaim).filter((claim): claim is FactCheckResult => claim !== null);

  if (claims.length === 0) {
    throw new Error('No valid fact-check claims in model output');
  }

  return claims;
}

export function shouldRetryScanError(error: unknown, retryCount: number, maxRetries: number): boolean {
  if (retryCount >= maxRetries) {
    return false;
  }

  if (error instanceof ApiStatusError) {
    if ([400, 401, 403, 404].includes(error.status)) {
      return false;
    }

    return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }

  if (error instanceof Error && error.message.includes('JSON parsing failed')) {
    return true;
  }

  return true;
}

function extractJsonString(content: string): string {
  const trimmed = content.trim();
  const jsonCodeBlock = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (jsonCodeBlock?.[1]) {
    return jsonCodeBlock[1].trim();
  }

  const codeBlock = trimmed.match(/```\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) {
    return codeBlock[1].trim();
  }

  const jsonMatch = trimmed.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  if (trimmed.startsWith('[')) {
    return trimmed;
  }

  throw new Error('Could not find JSON in API response');
}

function parseJsonArray(jsonString: string): unknown[] {
  const attempts = [
    jsonString,
    repairJsonString(jsonString),
  ].filter((value): value is string => Boolean(value));

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      if (Array.isArray(parsed)) {
        return parsed;
      }
      errors.push('Parsed JSON was not an array');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`JSON parsing failed: ${errors[errors.length - 1] ?? 'unknown error'}`);
}

function repairJsonString(jsonString: string): string {
  return removeControlCharacters(jsonString)
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function removeControlCharacters(value: string): string {
  return [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return !((code >= 0 && code <= 31) || (code >= 127 && code <= 159));
  }).join('');
}

function validateClaim(value: unknown): FactCheckResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const quote = readRequiredString(value.quote);
  const claim = readRequiredString(value.claim);
  if (!quote || !claim) {
    return null;
  }

  const source = normalizeSource(value.source);
  const normalizedVerdict = normalizeVerdict(value.verdict);
  const downgradedForMissingSource = !source && normalizedVerdict !== 'unverified';
  const verdict = downgradedForMissingSource ? 'unverified' : normalizedVerdict;
  const comments = downgradedForMissingSource
    ? defaultCommentForVerdict('unverified')
    : readOptionalString(value.comments) || defaultCommentForVerdict(verdict);

  return {
    quote,
    verdict,
    claim,
    comments,
    source: verdict === 'unverified' && !source ? '' : source,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSource(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function defaultCommentForVerdict(verdict: FactCheckResult['verdict']): string {
  return verdict === 'unverified'
    ? 'Unable to verify from search results.'
    : 'No explanation provided by the model.';
}
