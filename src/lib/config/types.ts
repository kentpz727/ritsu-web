// Port of Android `data/GameConfigData.kt` — JSON config system.
// All coordinates are normalized 0.0–1.0 so configs are resolution-independent.

export interface OcrRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ConfigFieldType = 'number' | 'text' | 'boolean';
export type ConfigCategory = 'Judgment' | 'Metric' | 'Misc';

export interface ConfigField {
  key: string;
  label: string;
  type?: ConfigFieldType;
  ocrRect?: OcrRect | null;
  /** ARGB int, mirrors Android targetColor for boolean fields */
  targetColor?: number | null;
  /** 0.0–1.0 color-match threshold */
  threshold?: number;
  /** Weight for accuracy calc (e.g. Perfect = 1.0) */
  weight?: number | null;
  /** Marks the miss judgment: excluded from hits in universal accuracy/combo.
      When unset, falls back to key/label containing "miss". */
  isMiss?: boolean;
  shortLabel?: string | null;
}

export interface GameConfigData {
  gameName: string;
  configVersion?: number;
  judgments?: ConfigField[];
  metrics?: ConfigField[];
  misc?: ConfigField[];
  formula?: string | null;
  titleRect?: OcrRect | null;
  scoreRect?: OcrRect | null;
  comboRect?: OcrRect | null;
  accuracyRect?: OcrRect | null;
  difficultyNameRect?: OcrRect | null;
  difficultyValRect?: OcrRect | null;
  rankRect?: OcrRect | null;
  useRankOcr?: boolean;
  useAccuracyOcr?: boolean;
}

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
  const raw = JSON.parse(json) as GameConfigData;
  if (!raw.gameName || typeof raw.gameName !== 'string') throw new Error('Config is missing gameName');
  // Drop null/invalid field entries (heals configs corrupted by the old
  // global-index bug, which persisted sparse arrays as nulls).
  const cleanList = (l: unknown): ConfigField[] =>
    Array.isArray(l) ? l.filter((f): f is ConfigField => !!f && typeof (f as ConfigField).key === 'string') : [];
  const { judgments, metrics, misc, ...rest } = raw;
  return {
    configVersion: 1,
    useRankOcr: true,
    useAccuracyOcr: false,
    ...rest,
    judgments: cleanList(judgments),
    metrics: cleanList(metrics),
    misc: cleanList(misc),
  };
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

/**
 * Enforce unique field keys across all categories: every repeat of a name is
 * renamed with an underscore plus its usage index (perfect, perfect_2, ...).
 * Runs at config write-entry points (import, draft save); the BoxEditor add
 * flow and rename guard already enforce the same rule live.
 */
export function dedupeKeys(cfg: GameConfigData): { cfg: GameConfigData; renamed: Array<{ from: string; to: string }> } {
  const taken = new Set<string>();
  const renamed: Array<{ from: string; to: string }> = [];
  const fix = (f: ConfigField): ConfigField => {
    if (!f || typeof f.key !== 'string') return f;
    if (f.key !== '' && !taken.has(f.key)) {
      taken.add(f.key);
      return f;
    }
    const base = (f.key === '' ? 'field' : f.key).replace(/_\d+$/, '') || 'field';
    let key = base;
    let n = 2;
    while (taken.has(key)) key = `${base}_${n++}`;
    taken.add(key);
    if (key !== f.key) renamed.push({ from: f.key === '' ? '(empty)' : f.key, to: key });
    return key === f.key ? f : { ...f, key };
  };
  return {
    cfg: {
      ...cfg,
      judgments: (cfg.judgments ?? []).map(fix),
      metrics: (cfg.metrics ?? []).map(fix),
      misc: (cfg.misc ?? []).map(fix),
    },
    renamed,
  };
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
  detailId?: number;
}

export interface VisibleDetails {
  judgments: VisibleDetail[];
  metrics: VisibleDetail[];
  misc: VisibleDetail[];
}

/**
 * Partition stored score_details into visible sections, dropping keys the game's
 * config no longer defines (deleted metrics never render).
 */
export function filterDetailsByConfig(
  cfg: GameConfigData | null | undefined,
  details: Array<{ key: string; value: string; category: string; detailId?: number }>,
): VisibleDetails {
  const out: VisibleDetails = { judgments: [], metrics: [], misc: [] };
  const byKey = new Map<string, { label: string; category: ConfigCategory }>();
  if (cfg) {
    for (const f of cfg.judgments ?? []) byKey.set(f.key, { label: f.label, category: 'Judgment' });
    for (const f of cfg.metrics ?? []) byKey.set(f.key, { label: f.label, category: 'Metric' });
    for (const f of cfg.misc ?? []) byKey.set(f.key, { label: f.label, category: 'Misc' });
  }
  for (const d of details) {
    if (cfg) {
      const known = byKey.get(d.key);
      if (!known) continue; // deleted / unknown for this game: hide
      const bucket = known.category === 'Judgment' ? out.judgments : known.category === 'Metric' ? out.metrics : out.misc;
      bucket.push({ key: d.key, value: d.value, label: known.label, detailId: d.detailId });
    } else {
      const bucket = d.category === 'Judgment' ? out.judgments : d.category === 'Metric' ? out.metrics : out.misc;
      bucket.push({ key: d.key, value: d.value, label: d.key, detailId: d.detailId });
    }
  }
  out.misc = out.misc.filter((m) => m.value.toLowerCase() === 'true');
  return out;
}
