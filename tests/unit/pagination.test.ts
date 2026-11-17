import { describe, expect, it } from 'vitest';
import { SCORE_PAGE_SIZE, clampPage, pageCount, pageRange, pageSlice } from '../../src/lib/pagination.ts';

describe('P-08 score pagination', () => {
  it('uses 50-row pages', () => {
    expect(SCORE_PAGE_SIZE).toBe(50);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
    expect(pageCount(10_000)).toBe(200);
  });

  it('clamps out-of-range, negative, fractional, and non-finite pages', () => {
    expect(clampPage(-1, 10_000)).toBe(0);
    expect(clampPage(0, 10_000)).toBe(0);
    expect(clampPage(199, 10_000)).toBe(199);
    expect(clampPage(999, 10_000)).toBe(199);
    expect(clampPage(2.9, 10_000)).toBe(2);
    expect(clampPage(Number.NaN, 10_000)).toBe(0);
    expect(clampPage(3, 0)).toBe(0);
  });

  it('returns exactly the visible rows for a page', () => {
    const rows = Array.from({ length: 123 }, (_, i) => i);
    expect(pageSlice(rows, 0)).toHaveLength(50);
    expect(pageSlice(rows, 0)[0]).toBe(0);
    expect(pageSlice(rows, 2)).toEqual(rows.slice(100, 123));
    expect(pageSlice(rows, 99)).toEqual(rows.slice(100, 123));
    expect(pageSlice([], 0)).toEqual([]);
  });

  it('labels the one-based row range, including the empty list', () => {
    expect(pageRange(0, 123)).toEqual([1, 50]);
    expect(pageRange(2, 123)).toEqual([101, 123]);
    expect(pageRange(0, 0)).toEqual([0, 0]);
    expect(pageRange(99, 123)).toEqual([101, 123]);
  });

  it('supports a custom page size for future lists', () => {
    expect(pageCount(10, 3)).toBe(4);
    expect(pageSlice([1, 2, 3, 4], 1, 3)).toEqual([4]);
    expect(pageRange(1, 10, 3)).toEqual([4, 6]);
  });
});
