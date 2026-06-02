import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from '../src/lib/accuracy';
import { parseFactCheckResults } from '../src/lib/modelOutput';

interface EvalCase {
  name: string;
  article: string;
  mockModelResponse: unknown;
  expectedVerdicts: string[];
}

const fixtureUrl = new URL('./fixtures/fact-checker-cases.json', import.meta.url);
const cases = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as EvalCase[];

describe('fact-checker offline eval fixtures', () => {
  it.each(cases)('$name', (fixture) => {
    const parsed = parseFactCheckResults(JSON.stringify(fixture.mockModelResponse));
    const verdicts = parsed.map((claim) => claim.verdict);
    const anchoredClaims = parsed.filter((claim) => fuzzyMatch(fixture.article, claim.quote).match);

    expect(verdicts).toEqual(fixture.expectedVerdicts);
    expect(anchoredClaims.length).toBe(parsed.length);
  });
});
