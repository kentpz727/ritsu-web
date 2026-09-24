// Numeric hygiene for stored scores and graphs. A single NaN/undefined value
// used to poison whole SVG polylines (one bad token invalidates the entire
// `points` attribute), so every graph input is sanitized and every write coerced.

/** Finite number or fallback (NaN, ±Infinity, non-numbers all become fallback). */
export function finiteOr(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export interface GraphPoint {
  accuracy: number;
  totalScore: number;
  playTimestamp: number;
}

/**
 * Graph-safe point or null when accuracy/score/timestamp is unusable.
 * Corrupt rows are dropped from graphs (never rendered as NaN/undefined).
 */
export function toGraphPoint(
  raw: { accuracy?: unknown; totalScore?: unknown; playTimestamp?: unknown },
): GraphPoint | null {
  const accuracy = finiteOr(raw.accuracy, NaN);
  const totalScore = finiteOr(raw.totalScore, NaN);
  const playTimestamp = finiteOr(raw.playTimestamp, NaN);
  if (!Number.isFinite(accuracy) || !Number.isFinite(totalScore) || !Number.isFinite(playTimestamp)) {
    return null;
  }
  return { accuracy, totalScore, playTimestamp };
}
