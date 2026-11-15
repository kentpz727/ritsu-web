import { describe, expect, it } from 'vitest';
import { graphDomain } from '../../src/lib/numbers.ts';

describe('P-20 metric graph axis domain', () => {
  it('never invents accuracy ticks above 100 for a single 100% play', () => {
    const domain = graphDomain([100], 'accuracy');
    expect(domain).toEqual({ min: 99.5, max: 100 });
    const ticks = [0, 1, 2, 3].map((t) => domain.min + ((domain.max - domain.min) * t) / 3);
    expect(Math.max(...ticks)).toBe(100);
  });

  it('pads a flat accuracy series symmetrically without crossing 100', () => {
    expect(graphDomain([99.2], 'accuracy')).toEqual({ min: 98.7, max: 99.7 });
  });

  it('keeps the real range when accuracy values differ', () => {
    expect(graphDomain([97.5, 99.5, 100], 'accuracy')).toEqual({ min: 97.5, max: 100 });
  });

  it('pads a flat score series by one percent so ticks stay readable', () => {
    expect(graphDomain([1_000_000], 'score')).toEqual({ min: 990_000, max: 1_010_000 });
  });

  it('does not clip values genuinely stored above 100', () => {
    expect(graphDomain([101], 'accuracy')).toEqual({ min: 100.5, max: 101.5 });
  });

  it('ignores non-finite values and defaults an empty series to 0..1', () => {
    expect(graphDomain([Number.NaN, 98, Number.POSITIVE_INFINITY], 'accuracy')).toEqual({ min: 97.5, max: 98.5 });
    expect(graphDomain([], 'score')).toEqual({ min: 0, max: 1 });
  });
});
