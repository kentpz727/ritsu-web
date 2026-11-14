import { describe, expect, it } from 'vitest';
import { GENERIC_RANKS, bestMatch, bestMatchBy, fuzzyDistance, similarity } from '../../src/lib/ocr/fuzzy.ts';

describe('fuzzy OCR matching', () => {
  it('returns string lengths when one side is empty', () => {
    expect(fuzzyDistance('', 'abc')).toBe(3);
    expect(fuzzyDistance('abc', '')).toBe(3);
    expect(fuzzyDistance('', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(fuzzyDistance('Song', 'SONG')).toBe(0);
    expect(fuzzyDistance('AbC', 'abc')).toBe(0);
  });

  it('discounts common glyph confusions', () => {
    expect(fuzzyDistance('5', 'S')).toBeCloseTo(0.3, 10);
    expect(fuzzyDistance('0', 'O')).toBeCloseTo(0.3, 10);
    expect(fuzzyDistance('1', 'L')).toBeCloseTo(0.3, 10);
    expect(fuzzyDistance('8', 'B')).toBeCloseTo(0.3, 10);
    expect(fuzzyDistance('S0NG', 'SONG')).toBeCloseTo(0.3, 10);
  });

  it('charges full cost for unrelated substitutions', () => {
    expect(fuzzyDistance('abc', 'xyz')).toBe(3);
    expect(fuzzyDistance('kitten', 'sitting')).toBe(3);
  });

  it('computes similarity in the 0..1 range', () => {
    expect(similarity('', '')).toBe(0);
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('0', 'O')).toBeCloseTo(0.7, 10);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('bestMatch picks the closest candidate at or above the threshold', () => {
    expect(bestMatch('S0NG', ['SONG'], 0.6)).toEqual({ value: 'SONG', score: 0.925 });
    expect(bestMatch('SONG', ['SONG'], 1)).toEqual({ value: 'SONG', score: 1 });
  });

  it('bestMatch keeps the raw read when nothing clears the threshold', () => {
    expect(bestMatch('abcdef', ['SONG'], 0.6)).toBeNull();
    expect(bestMatch('', ['SONG'], 0)).toEqual({ value: 'SONG', score: 0 });
  });

  it('bestMatchBy matches on a derived key but returns the original value', () => {
    const candidates = [
      { title: 'Hello World', id: 1 },
      { title: 'Other Song', id: 2 },
    ];
    const match = bestMatchBy('hello world!', candidates, 0.9, (c) => c.title.toLowerCase());
    expect(match?.value).toBe(candidates[0]);
    expect(match?.score).toBeCloseTo(1 - 1 / 12, 10);
  });

  it('bestMatchBy skips empty derived keys', () => {
    expect(bestMatchBy('anything', [{ title: '' }], 0, (c) => c.title)).toBeNull();
  });

  it('exports a generic rank universe', () => {
    expect(GENERIC_RANKS).toContain('SSS+');
    expect(GENERIC_RANKS).toContain('F');
    expect(new Set(GENERIC_RANKS).size).toBe(GENERIC_RANKS.length);
  });
});
