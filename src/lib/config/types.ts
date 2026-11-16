// Port of Android `data/GameConfigData.kt` — JSON config system.
// Data shapes live in model.ts; validation lives in schema.ts. Keeping both out
// of this module's own definitions prevents a types ↔ schema import cycle (P-11).

import {
  ConfigValidationError,
  dedupeKeys,
  formatConfigIssues,
  validateGameConfigJson,
  validateGameConfigObject,
  type ConfigIssue,
  type ConfigValidation,
} from './schema.ts';
import type { ConfigCategory, ConfigField, ConfigFieldType, GameConfigData, OcrRect } from './model.ts';

export { ConfigValidationError, dedupeKeys, formatConfigIssues, validateGameConfigJson, validateGameConfigObject };
export type { ConfigIssue, ConfigValidation };
export type { ConfigCategory, ConfigField, ConfigFieldType, GameConfigData, OcrRect };

export function allFieldsWithCategory(cfg: GameConfigData): Array<{ field: ConfigField; category: ConfigCategory }> {
  const out = [
    ...(cfg.judgments ?? []).map((field) => ({ field, category: 'Judgment' as const })),
    ...(cfg.metrics ?? []).map((field) => ({ field, category: 'Metric' as const })),
    ...(cfg.misc ?? []).map((field) => ({ field, category: 'Misc' as const })),
  ];
  // Null-safe: configs corrupted by the old global-index bug may contain null holes.
  return out.filter(({ field }) => !!field && typeof field.key === 'string');
}

/**
 * Field entries with stable per-category address keys (`"Metric:0"`).
 * Unlike allFieldsWithCategory (concatenated order), the index here is the
 * true array index, matching rectOfKey/save/update/delete lookups.
 * Null/invalid entries are skipped.
 */
export function fieldEntries(
  cfg: GameConfigData | null | undefined,
): Array<{ key: string; field: ConfigField; category: ConfigCategory }> {
  if (!cfg) return [];
  const out: Array<{ key: string; field: ConfigField; category: ConfigCategory }> = [];
  (['Judgment', 'Metric', 'Misc'] as const).forEach((category) => {
    const list = category === 'Judgment' ? cfg.judgments : category === 'Metric' ? cfg.metrics : cfg.misc;
    (list ?? []).forEach((field, i) => {
      if (field && typeof field.key === 'string') out.push({ key: `${category}:${i}`, field, category });
    });
  });
  return out;
}

export function parseGameConfig(json: string): GameConfigData {
  const { config, errors } = validateGameConfigJson(json);
  if (!config || errors.length > 0) throw new ConfigValidationError(errors);
  return config;
}

// ---- Dynamic field management + visibility ----

/** Generic field presets offered in the BoxEditor. Games keep only what they need. */
export const PRESET_FIELDS: Array<{ category: ConfigCategory; field: ConfigField }> = [
  { category: 'Judgment', field: { key: 'perfect', label: 'Perfect', type: 'number', weight: 1.0, shortLabel: 'PF' } },
  { category: 'Judgment', field: { key: 'great', label: 'Great', type: 'number', weight: 1 / 3, shortLabel: 'GR' } },
  { category: 'Judgment', field: { key: 'good', label: 'Good', type: 'number', weight: 1 / 6, shortLabel: 'GD' } },
  { category: 'Judgment', field: { key: 'bad', label: 'Bad', type: 'number', weight: 0, shortLabel: 'BD' } },
  { category: 'Judgment', field: { key: 'miss', label: 'Miss', type: 'number', weight: 0, shortLabel: 'MISS', isMiss: true } },
  { category: 'Metric', field: { key: 'fast', label: 'Fast', type: 'number' } },
  { category: 'Metric', field: { key: 'slow', label: 'Slow', type: 'number' } },
  { category: 'Metric', field: { key: 'maxCombo', label: 'Max Combo', type: 'number' } },
  { category: 'Misc', field: { key: 'fullCombo', label: 'Full Combo', type: 'boolean', threshold: 0.1 } },
  { category: 'Misc', field: { key: 'clear', label: 'Clear', type: 'boolean', threshold: 0.1 } },
  { category: 'Misc', field: { key: 'note', label: 'Note', type: 'text' } },
];

/** Generic OCR slots (fixed rects) with user-facing labels. Clearing one removes it for that game. */
export const GENERIC_SLOTS: Array<{ key: 'titleRect' | 'scoreRect' | 'comboRect' | 'accuracyRect' | 'difficultyNameRect' | 'difficultyValRect' | 'rankRect'; label: string }> = [
  { key: 'titleRect', label: 'Title' },
  { key: 'scoreRect', label: 'Score' },
  { key: 'comboRect', label: 'Combo' },
  { key: 'accuracyRect', label: 'Accuracy' },
  { key: 'difficultyNameRect', label: 'Difficulty name' },
  { key: 'difficultyValRect', label: 'Level' },
  { key: 'rankRect', label: 'Score rank' },
];

const DEFAULT_SLOT_RECT: OcrRect = { x: 0.1, y: 0.1, w: 0.3, h: 0.08 };

export function defaultSlotRect(): OcrRect {
  return { ...DEFAULT_SLOT_RECT };
}

export function hasSlot(cfg: GameConfigData | null | undefined, key: string): boolean {
  if (!cfg) return true; // unknown config: show everything (legacy fallback)
  return (cfg as unknown as Record<string, OcrRect | null>)[key] != null;
}

export function isRankEnabled(cfg: GameConfigData | null | undefined): boolean {
  if (!cfg) return true;
  return cfg.useRankOcr === true || cfg.rankRect != null;
}

export function isAccuracyEnabled(cfg: GameConfigData | null | undefined): boolean {
  if (!cfg) return true;
  return cfg.useAccuracyOcr === true || cfg.accuracyRect != null || (cfg.judgments?.length ?? 0) > 0;
}

export interface VisibleDetail {
  key: string;
  value: string;
  label: string;
  /** Ready-to-render value: boolean misc is Yes/No, an unrecorded boolean is '—'. */
  display: string;
  detailId?: number;
}

export interface VisibleDetails {
  judgments: VisibleDetail[];
  metrics: VisibleDetail[];
  misc: VisibleDetail[];
}

/**
 * Display text for a stored Misc value. Booleans are explicit ("Yes"/"No"),
 * and a boolean with no stored row is "—" so it cannot be confused with false.
 */
export function miscDisplay(value: string | null | undefined, isBoolean: boolean): string {
  if (!isBoolean) return value ?? '';
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'true') return 'Yes';
  if (v === 'false') return 'No';
  return '—';
}

/**
 * Partition stored score_details into visible sections, dropping keys the game's
 * config no longer defines (deleted metrics never render). Explicit `false`
 * misc values are kept and rendered as "No"; unrecorded booleans get a row
 * with "—" so they are distinct from false.
 */
export function filterDetailsByConfig(
  cfg: GameConfigData | null | undefined,
  details: Array<{ key: string; value: string; category: string; detailId?: number }>,
): VisibleDetails {
  const out: VisibleDetails = { judgments: [], metrics: [], misc: [] };
  const byKey = new Map<string, { label: string; category: ConfigCategory; boolean: boolean }>();
  if (cfg) {
    for (const f of cfg.judgments ?? []) byKey.set(f.key, { label: f.label, category: 'Judgment', boolean: false });
    for (const f of cfg.metrics ?? []) byKey.set(f.key, { label: f.label, category: 'Metric', boolean: false });
    for (const f of cfg.misc ?? []) {
      byKey.set(f.key, { label: f.label, category: 'Misc', boolean: f.type === 'boolean' });
    }
  }
  for (const d of details) {
    if (cfg) {
      const known = byKey.get(d.key);
      if (!known) continue; // deleted / unknown for this game: hide
      const bucket = known.category === 'Judgment' ? out.judgments : known.category === 'Metric' ? out.metrics : out.misc;
      bucket.push({
        key: d.key,
        value: d.value,
        label: known.label,
        display: known.boolean ? miscDisplay(d.value, true) : d.value,
        detailId: d.detailId,
      });
    } else {
      const bucket = d.category === 'Judgment' ? out.judgments : d.category === 'Metric' ? out.metrics : out.misc;
      bucket.push({ key: d.key, value: d.value, label: d.key, display: d.value, detailId: d.detailId });
    }
  }
  if (cfg) {
    for (const f of cfg.misc ?? []) {
      if (f.type === 'boolean' && !out.misc.some((m) => m.key === f.key)) {
        out.misc.push({ key: f.key, value: '', label: f.label, display: miscDisplay('', true) });
      }
    }
  }
  return out;
}
