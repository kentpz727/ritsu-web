// P-03: runtime validation and normalization for user-supplied game configs.
//
// Structural problems (wrong types, missing/empty field keys, unknown field
// types, malformed rects) reject the config with field-level paths. Values that
// are the right type but outside their documented range (rect coordinates,
// weights, thresholds) are clamped and reported as warnings, so hand-authored
// configs still load while OCR/canvas code never receives bad geometry.
import { z } from 'zod';
import type { ConfigField, GameConfigData, OcrRect } from './model.ts';

export interface ConfigIssue {
  /** Dotted path, e.g. `judgments[0].weight`; `$` means the config root. */
  path: string;
  message: string;
}

export interface ConfigValidation {
  /** Normalized config; null when a structural error was found. */
  config: GameConfigData | null;
  errors: ConfigIssue[];
  warnings: ConfigIssue[];
}

export class ConfigValidationError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    const details =
      issues.length > 0 ? issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n') : '- $: Invalid config';
    super(`Invalid game config:\n${details}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

export function formatConfigIssues(issues: ConfigIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
}

const finiteNumber = z.number().finite();
const rectSchema = z.looseObject({
  x: finiteNumber,
  y: finiteNumber,
  w: finiteNumber,
  h: finiteNumber,
});
const fieldTypeSchema = z.enum(['number', 'text', 'boolean']);

const fieldSchema = z.looseObject({
  key: z.string(),
  label: z.string().nullish(),
  type: fieldTypeSchema.nullish(),
  ocrRect: rectSchema.nullish(),
  /** ARGB int, mirrors Android targetColor for boolean fields. Android's
      signed Int serializes opaque colors as negative values, so accept both
      signed and unsigned 32-bit ranges. */
  targetColor: z.number().int().min(-0x80000000).max(0xffffffff).nullish(),
  threshold: finiteNumber.nullish(),
  weight: finiteNumber.nullish(),
  isMiss: z.boolean().nullish(),
  shortLabel: z.string().nullish(),
});

type ParsedField = z.infer<typeof fieldSchema>;

const configSchema = z.looseObject({
  gameName: z.string(),
  configVersion: z.number().int().nullish(),
  judgments: z.array(z.unknown()).nullish(),
  metrics: z.array(z.unknown()).nullish(),
  misc: z.array(z.unknown()).nullish(),
  formula: z.string().nullish(),
  titleRect: rectSchema.nullish(),
  scoreRect: rectSchema.nullish(),
  comboRect: rectSchema.nullish(),
  accuracyRect: rectSchema.nullish(),
  difficultyNameRect: rectSchema.nullish(),
  difficultyValRect: rectSchema.nullish(),
  rankRect: rectSchema.nullish(),
  useRankOcr: z.boolean().nullish(),
  useAccuracyOcr: z.boolean().nullish(),
});

type ParsedConfig = z.infer<typeof configSchema>;

const SLOT_KEYS = [
  'titleRect',
  'scoreRect',
  'comboRect',
  'accuracyRect',
  'difficultyNameRect',
  'difficultyValRect',
  'rankRect',
] as const;

function joinPath(base: string, parts: Array<string | number>): string {
  let out = base;
  for (const part of parts) {
    if (typeof part === 'number') out += `[${part}]`;
    else out = out ? `${out}.${part}` : part;
  }
  return out || '$';
}

function zodIssues(error: z.ZodError, base: string): ConfigIssue[] {
  return error.issues.map((issue) => ({
    path: joinPath(
      base,
      issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)),
    ),
    message: issue.message,
  }));
}

function clampUnit(value: number, path: string, warnings: ConfigIssue[]): number {
  const clamped = Math.min(1, Math.max(0, value));
  if (clamped !== value) {
    warnings.push({ path, message: `Clamped ${value} to ${clamped}; expected 0–1.` });
  }
  return clamped;
}

function normalizeRect(rect: OcrRect, path: string, warnings: ConfigIssue[]): OcrRect {
  const out = { ...rect };
  for (const key of ['x', 'y'] as const) {
    out[key] = clampUnit(rect[key], `${path}.${key}`, warnings);
  }
  for (const key of ['w', 'h'] as const) {
    out[key] = clampUnit(rect[key], `${path}.${key}`, warnings);
  }
  // Keep the whole rectangle inside the image. A box that starts at 0.8 with
  // width 0.5 would otherwise crop past the source and fail in drawImage.
  if (out.x + out.w > 1) {
    const fitted = Math.max(0, 1 - out.x);
    warnings.push({ path: `${path}.w`, message: `Reduced ${out.w} to ${fitted} so x + w <= 1.` });
    out.w = fitted;
  }
  if (out.y + out.h > 1) {
    const fitted = Math.max(0, 1 - out.y);
    warnings.push({ path: `${path}.h`, message: `Reduced ${out.h} to ${fitted} so y + h <= 1.` });
    out.h = fitted;
  }
  return out;
}

function normalizeField(
  raw: unknown,
  path: string,
  errors: ConfigIssue[],
  warnings: ConfigIssue[],
): ConfigField | null {
  if (raw == null) {
    // Legacy configs corrupted by the old global-index bug contain null holes.
    warnings.push({ path, message: 'Dropped a null field entry.' });
    return null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ path, message: 'Expected a field object.' });
    return null;
  }
  const parsed = fieldSchema.safeParse(raw);
  if (!parsed.success) {
    errors.push(...zodIssues(parsed.error, path));
    return null;
  }
  const field: ParsedField = parsed.data;
  const key = field.key.trim();
  if (!key) {
    errors.push({ path: `${path}.key`, message: 'Field key must not be empty.' });
    return null;
  }

  const out = { ...field, key } as unknown as ConfigField & Record<string, unknown>;
  if (field.label == null) {
    out.label = key;
    warnings.push({ path: `${path}.label`, message: 'Missing label; using the field key.' });
  } else {
    out.label = field.label;
  }
  if (field.ocrRect != null) {
    out.ocrRect = normalizeRect(field.ocrRect, `${path}.ocrRect`, warnings);
  }
  if (field.weight != null) {
    out.weight = clampUnit(field.weight, `${path}.weight`, warnings);
  }
  if (field.threshold != null) {
    out.threshold = clampUnit(field.threshold, `${path}.threshold`, warnings);
  } else {
    out.threshold = undefined;
  }
  // Optional nullable values become absent so JSON round-trips stay stable.
  out.type = field.type ?? undefined;
  out.isMiss = field.isMiss ?? undefined;
  return out;
}

function normalizeList(
  raw: unknown,
  path: 'judgments' | 'metrics' | 'misc',
  errors: ConfigIssue[],
  warnings: ConfigIssue[],
): ConfigField[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.push({ path, message: 'Expected an array of fields.' });
    return [];
  }
  const out: ConfigField[] = [];
  raw.forEach((entry, index) => {
    const field = normalizeField(entry, `${path}[${index}]`, errors, warnings);
    if (field) out.push(field);
  });
  return out;
}

/**
 * Validate/normalize a parsed config object. Never throws for malformed input:
 * structural problems are returned in `errors`, safe repairs in `warnings`.
 */
export function validateGameConfigObject(raw: unknown): ConfigValidation {
  const errors: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: null, errors: [{ path: '$', message: 'Expected a config object.' }], warnings };
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    return { config: null, errors: zodIssues(parsed.error, ''), warnings };
  }
  const data: ParsedConfig = parsed.data;

  const gameName = data.gameName.trim();
  if (!gameName) errors.push({ path: 'gameName', message: 'Config is missing gameName.' });

  let configVersion = 1;
  if (data.configVersion != null) {
    if (data.configVersion < 1) {
      warnings.push({ path: 'configVersion', message: `Clamped ${data.configVersion} to 1.` });
    } else {
      configVersion = data.configVersion;
    }
  }

  const config = {
    ...(data as Record<string, unknown>),
    gameName,
    configVersion,
    judgments: normalizeList(data.judgments, 'judgments', errors, warnings),
    metrics: normalizeList(data.metrics, 'metrics', errors, warnings),
    misc: normalizeList(data.misc, 'misc', errors, warnings),
    useRankOcr: data.useRankOcr ?? true,
    useAccuracyOcr: data.useAccuracyOcr ?? false,
  } as GameConfigData & Record<string, unknown>;

  for (const key of SLOT_KEYS) {
    const rect = data[key];
    if (rect == null) config[key] = rect;
    else config[key] = normalizeRect(rect, key, warnings);
  }

  const { cfg, renamed } = dedupeKeys(config);
  for (const entry of renamed) {
    warnings.push({
      path: '$',
      message: `Duplicate field key "${entry.from}" renamed to "${entry.to}".`,
    });
  }

  if (errors.length > 0) return { config: null, errors, warnings };
  return { config: cfg, errors, warnings };
}

/** Parse config JSON and validate it. JSON syntax errors become field-level issues. */
export function validateGameConfigJson(json: string): ConfigValidation {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return {
      config: null,
      errors: [{ path: '$', message: `Invalid JSON: ${(error as Error).message}` }],
      warnings: [],
    };
  }
  return validateGameConfigObject(raw);
}

/**
 * Enforce unique field keys across all categories: every repeat of a name is
 * renamed with an underscore plus its usage index (perfect, perfect_2, ...).
 * Runs at config validation (and thus import/save entry points); the BoxEditor
 * add flow and rename guard already enforce the same rule live.
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
