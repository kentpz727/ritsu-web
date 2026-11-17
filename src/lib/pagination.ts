/** 50-row pages keep the score list bounded as the library grows (P-08). */
export const SCORE_PAGE_SIZE = 50;

/** Pages needed for `total` items; an empty list still has page 1. */
export function pageCount(total: number, size: number = SCORE_PAGE_SIZE): number {
  const safeSize = Number.isFinite(size) && size > 0 ? Math.trunc(size) : SCORE_PAGE_SIZE;
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.ceil(total) : 0;
  return Math.max(1, Math.ceil(safeTotal / safeSize));
}

/** Clamp an arbitrary page index into the list's real range. */
export function clampPage(page: number, total: number, size: number = SCORE_PAGE_SIZE): number {
  const last = pageCount(total, size) - 1;
  const value = Number.isFinite(page) ? Math.trunc(page) : 0;
  return Math.min(Math.max(0, value), last);
}

/** The visible slice for a page, after clamping. */
export function pageSlice<T>(items: readonly T[], page: number, size: number = SCORE_PAGE_SIZE): T[] {
  const start = clampPage(page, items.length, size) * size;
  return items.slice(start, start + size);
}

/** One-based row range for the pager label, e.g. [1, 50] or [0, 0] when empty. */
export function pageRange(page: number, total: number, size: number = SCORE_PAGE_SIZE): [number, number] {
  if (total <= 0) return [0, 0];
  const start = clampPage(page, total, size) * size;
  return [start + 1, Math.min(total, start + size)];
}
