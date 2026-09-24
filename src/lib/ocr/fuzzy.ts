// Probabilistic OCR fix-up: confusion-weighted string similarity.
//
// Rhythm-game fonts mangle glyphs in predictable ways (5/S, 0/O, 8/B...),
// so a raw read is matched against known values (library song titles,
// difficulty names, ranks) with cheap substitution costs for common
// confusions. Best candidate above threshold wins; otherwise raw is kept.

const CONFUSIONS: Array<[string, string]> = [
  ['0', 'O'],
  ['1', 'I'],
  ['1', 'L'],
  ['5', 'S'],
  ['8', 'B'],
  ['6', 'G'],
  ['2', 'Z'],
];

function subCost(x: string, y: string): number {
  if (x === y) return 0;
  for (const [p, q] of CONFUSIONS) {
    if ((x === p && y === q) || (x === q && y === p)) return 0.3;
  }
  return 1;
}

/** Weighted Levenshtein distance (case-insensitive). */
export function fuzzyDistance(a: string, b: string): number {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  const m = A.length;
  const n = B.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + subCost(A[i - 1], B[j - 1]));
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[n];
}

/** 0 (nothing alike) to 1 (identical, case-insensitive). */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return Math.max(0, 1 - fuzzyDistance(a, b) / maxLen);
}

/** Best candidate at or above threshold, or null (keep raw). */
export function bestMatch(
  raw: string,
  candidates: string[],
  threshold: number,
): { value: string; score: number } | null {
  return bestMatchBy(raw, candidates, threshold, (c) => c);
}

/** Best candidate matched on a derived key (e.g. normalized titles), returning the original. */
export function bestMatchBy<T>(
  raw: string,
  candidates: T[],
  threshold: number,
  key: (c: T) => string,
): { value: T; score: number } | null {
  let best: { value: T; score: number } | null = null;
  for (const c of candidates) {
    const k = key(c);
    if (!k) continue;
    const score = similarity(raw, k);
    if (score >= threshold && (!best || score > best.score)) best = { value: c, score };
  }
  return best;
}

/** Common rank universe; observed ranks for the game are added at match time. */
export const GENERIC_RANKS = [
  'SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S',
  'A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F',
];
