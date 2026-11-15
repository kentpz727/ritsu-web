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

export interface GraphDomain {
  min: number;
  max: number;
}

/**
 * Y-axis domain for the metric graph. A flat series needs padding so its ticks
 * do not collapse. Accuracy is capped at 100 when every recorded value is at
 * or below 100, so a single 100% play cannot invent ticks like 101.00%.
 * Values genuinely stored above 100 stay visible instead of being clipped.
 */
export function graphDomain(values: number[], metric: 'accuracy' | 'score'): GraphDomain {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { min: 0, max: 1 };

  const rawMin = Math.min(...clean);
  const rawMax = Math.max(...clean);
  let min = rawMin;
  let max = rawMax;

  if (max === min) {
    const pad = metric === 'accuracy' ? 0.5 : Math.max(1, Math.abs(max) * 0.01);
    min = Math.max(0, min - pad);
    max += pad;
  }
  if (metric === 'accuracy' && max > 100 && rawMax <= 100) max = 100;
  return { min, max };
}
