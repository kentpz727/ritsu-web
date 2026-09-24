// Port of Android `data/AccuracyCalculator.kt` + `data/RankingUtils.kt`,
// plus the web rule: combo derived from judgments when the screenshot has
// no combo box.

import type { ConfigField, GameConfigData } from '../config/types.ts';

/**
 * Weighted accuracy: Σ(value × weight) ÷ Σ(value) × 100 over all judgments
 * (miss included in the total at weight 0, so misses drag the result down).
 * Perfect counts fully; lower grades contribute only their weight — set per
 * judgment in the BoxEditor. Used when the screenshot shows no accuracy value;
 * an OCR'd accuracy (accuracy box set) always wins over this at the call site.
 */
export function calculateAccuracy(counts: Record<string, number>, config: GameConfigData): number {
  const judgments = config.judgments ?? [];
  let num = 0;
  let den = 0;
  for (const j of judgments) {
    const w = j.weight ?? 0;
    const c = counts[j.key] ?? 0;
    num += c * w;
    den += c;
  }
  if (den === 0) return 0;
  return (num / den) * 100;
}

export function totalNotes(counts: Record<string, number>, config: GameConfigData): number {
  return (config.judgments ?? []).reduce((s, j) => s + (counts[j.key] ?? 0), 0);
}

/**
 * Port of GenericScore.parseDifficulty: digits/dot value plus a 0.5 bonus when
 * the level contains '+' ("Master 14+" sorts above "14" at 14.5).
 */
export function parseDifficultySort(diffStr: string): number {
  const numericPart = Number([...diffStr].filter((c) => /[0-9.]/.test(c)).join('')) || 0;
  return numericPart + (diffStr.includes('+') ? 0.5 : 0);
}

/** Which judgment counts as a miss: explicit flag, else key/label containing "miss". */
export function isMissField(f: ConfigField): boolean {
  if (f.isMiss === true) return true;
  if (f.isMiss === false) return false;
  return /miss/i.test(f.key) || /miss/i.test(f.label);
}

/** Combo fallback when the game has no combo box: hits (all judgments except miss). */
export function universalCombo(config: GameConfigData, values: Record<string, number>): number {
  let hits = 0;
  for (const j of config.judgments ?? []) {
    if (!isMissField(j)) hits += Number(values[j.key]) || 0;
  }
  return hits;
}

export type SortMode = 'SCORE' | 'ACCURACY' | 'COMBO';

/** Port of RankingUtils.calculateRankingValue: max(notes,1) * metric. */
export function rankingValue(
  counts: Record<string, number>,
  config: GameConfigData,
  score: { totalScore: number; maxCombo: number; accuracy: number },
  sortMode: SortMode,
): number {
  const notes = Math.max(totalNotes(counts, config), 1);
  if (sortMode === 'ACCURACY') return notes * score.accuracy;
  if (sortMode === 'COMBO') return notes * score.maxCombo;
  return notes * score.totalScore;
}

export function booleanLabels(details: Array<{ key: string; value: string }>): string[] {
  return details.filter((d) => d.value === 'true').map((d) => d.key);
}
