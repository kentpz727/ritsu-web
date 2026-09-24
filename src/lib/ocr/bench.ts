import { argbToRgb, cropToCanvas, matchColor, normalizeLevel, normalizeRank, normalizeScore, normalizeTitle } from './image.ts';
import { ocrCanvas, ocrText } from './client.ts';
import { bestMatch, bestMatchBy, GENERIC_RANKS } from './fuzzy.ts';
import { db } from '../db/dexie.ts';
import { calculateAccuracy, parseDifficultySort, universalCombo } from '../calc/scoring.ts';
import type { GameConfigData, OcrRect } from '../config/types.ts';

export interface BenchField {
  label: string;
  /** Box coords as "x,y,w,h" or "—" when the config defines no box. */
  box: string;
  /** Parsed/display value ('' never surfaces — unreadable reads show '—'). */
  value: string;
  raw: string;
  ok: boolean;
  /** Derived without OCR (filename fallback, hits math, skipped boolean). */
  auto?: boolean;
  /** Raw text this value was guessed from (fuzzy match snapped it). */
  guessedFrom?: string;
}

export interface BenchGeneric {
  title: string;
  totalScore: number;
  difficultyName: string;
  difficultyVal: string;
  difficultySortValue: number;
  playRank: string;
  maxCombo: number;
  accuracy: number;
}

export interface BenchResult {
  fields: BenchField[];
  /** Labels of required boxes that failed to read. Empty = screenshot is valid. */
  missing: string[];
  details: Array<{ key: string; value: string; category: string }>;
  numVals: Record<string, number>;
  generic: BenchGeneric;
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = rej;
    img.src = url;
  });
}

async function readBox(
  img: HTMLImageElement,
  rect: OcrRect,
  kind: 'number' | 'text',
  engine: OcrEngineSpec,
): Promise<string> {
  // Slight padding: user boxes sit tight on glyphs and hard crops slice edge
  // pixels (Android tolerates this via symbol-center containment).
  const canvas = cropToCanvas(img, rect, 0.05);
  if (engine.type === 'paddle') {
    const { ocrPaddleCanvas } = await import('./paddle.ts');
    return (await ocrPaddleCanvas(canvas, { lang: engine.lang, kind })).text;
  }
  return ocrCanvas(canvas, { lang: 'eng', kind });
}

/** Text boxes read with the full eng+jpn+chi_sim heuristic (Android parity). */
async function readTextBox(img: HTMLImageElement, rect: OcrRect, engine: OcrEngineSpec): Promise<string> {
  const canvas = cropToCanvas(img, rect, 0.05);
  if (engine.type === 'paddle') {
    const { ocrPaddleCanvas } = await import('./paddle.ts');
    return (await ocrPaddleCanvas(canvas, { lang: engine.lang, kind: 'text' })).text;
  }
  return ocrText(canvas);
}

function detectBoolean(img: HTMLImageElement, rect: OcrRect, targetColor: number | null, threshold: number): boolean | null {
  if (targetColor == null) return null;
  const canvas = cropToCanvas(img, rect);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return matchColor(data, argbToRgb(targetColor), threshold);
}

export function asNum(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function boxStr(rect: OcrRect | null | undefined): string {
  if (!rect) return '—';
  return `${rect.x.toFixed(2)},${rect.y.toFixed(2)},${rect.w.toFixed(2)},${rect.h.toFixed(2)}`;
}

export interface BenchOptions {
  onStep?: (label: string, done: number, total: number) => void;
  fallbackTitle?: string;
  /** Known values for fuzzy snapping; titles/difficulties default to none. */
  candidates?: MatchCandidates;
  /** OCR engine: Tesseract (default production path) or PaddleOCR pilot. */
  engine?: OcrEngineSpec;
}

/** Which engine reads the boxes — and, for Paddle, which language model. */
export interface OcrEngineSpec {
  type: 'tesseract' | 'paddle';
  lang: string;
}

export interface MatchCandidates {
  titles: string[];
  difficulties: string[];
  ranks: string[];
}

/** Distinct known values for a game: library titles/difficulties/ranks (+ generic ranks). */
export async function getMatchCandidates(configId: number): Promise<MatchCandidates> {
  const scores = await db.generic_scores.where('configId').equals(configId).toArray();
  const uniq = (xs: Array<string | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];
  return {
    titles: uniq(scores.map((s) => s.songTitle)),
    difficulties: uniq(scores.map((s) => s.difficultyName)),
    ranks: [...new Set([...uniq(scores.map((s) => s.playRank)), ...GENERIC_RANKS])],
  };
}

/** Minimum similarity for a fuzzy guess to replace the raw read. */
const MATCH_THRESHOLD = 0.6;

/**
 * Read every box a game config defines from a screenshot.
 * Shared by bulk Import (auto-save when `missing` is empty) and the Debug OCR bench.
 */
export async function readConfigBoxes(
  img: HTMLImageElement,
  cfg: GameConfigData,
  opts: BenchOptions = {},
): Promise<BenchResult> {
  const fields: BenchField[] = [];
  const missing: string[] = [];
  const details: Array<{ key: string; value: string; category: string }> = [];
  const numVals: Record<string, number> = {};
  let done = 0;
  const candidates = opts.candidates ?? { titles: [], difficulties: [], ranks: [...GENERIC_RANKS] };
  const engine: OcrEngineSpec = opts.engine ?? { type: 'tesseract', lang: 'eng' };

  const readable =
    (cfg.titleRect ? 1 : 0) + (cfg.scoreRect ? 1 : 0) + (cfg.comboRect ? 1 : 0) +
    (cfg.accuracyRect ? 1 : 0) + (cfg.difficultyNameRect ? 1 : 0) +
    (cfg.difficultyValRect ? 1 : 0) + (cfg.rankRect ? 1 : 0) +
    [...(cfg.judgments ?? []), ...(cfg.metrics ?? []), ...(cfg.misc ?? [])].filter((x) => x.ocrRect).length;

  const step = (label: string) => {
    done++;
    opts.onStep?.(label, done, Math.max(readable, 1));
  };

  // OCR one required box; null when unreadable (recorded in missing).
  // Number outputs display parsed (leading zeros dropped: "007" reads as 7).
  async function ocrField(
    rect: OcrRect,
    kind: 'number' | 'text',
    label: string,
    validate?: (v: string) => boolean,
  ): Promise<string | null> {
    const raw = kind === 'number'
      ? (await readBox(img, rect, kind, engine)).trim()
      : (await readTextBox(img, rect, engine)).trim();
    const ok = raw !== '' && (!validate || validate(raw));
    const display = raw === '' ? '—' : kind === 'number' && ok ? String(asNum(raw)) : raw;
    fields.push({ label, box: boxStr(rect), raw, value: display, ok });
    if (!ok) missing.push(label);
    step(label);
    return ok ? raw : null;
  }

  // Generic slots.
  const titleRaw = cfg.titleRect ? await ocrField(cfg.titleRect, 'text', 'Title') : null;
  const baseTitle = opts.fallbackTitle ?? 'Untitled';
  if (!cfg.titleRect) fields.push({ label: 'Title', box: '—', raw: '', value: `${baseTitle} (filename)`, ok: true, auto: true });
  // Titles carry no symbols and keep only the majority script; near-misses snap
  // to the known library title (compared normalized, original returned).
  let title = baseTitle;
  if (cfg.titleRect && titleRaw != null) {
    const normRaw = normalizeTitle(titleRaw);
    const guess = normRaw ? bestMatchBy(normRaw, candidates.titles, MATCH_THRESHOLD, normalizeTitle) : null;
    const finalTitle = normalizeTitle(guess ? guess.value : titleRaw);
    const entry = fields.find((r) => r.label === 'Title');
    if (!finalTitle) {
      if (entry) {
        entry.ok = false;
        entry.value = '—';
      }
      missing.push('Title');
    } else {
      title = finalTitle;
      if (entry) {
        entry.value = finalTitle;
        if (finalTitle !== titleRaw) entry.guessedFrom = titleRaw;
      }
    }
  }

  const scoreRaw = cfg.scoreRect
    ? await ocrField(cfg.scoreRect, 'number', 'Score', (v) => asNum(v) != null)
    : null;
  if (!cfg.scoreRect) fields.push({ label: 'Score', box: '—', raw: '', value: '0 (no box)', ok: true, auto: true });
  // Scores ignore a leading zero: "0123" reads as 123.
  const scoreDigits = scoreRaw != null ? normalizeScore(scoreRaw) : '0';
  const scoreEntry = fields.find((r) => r.label === 'Score');
  if (scoreEntry && scoreRaw != null) scoreEntry.value = scoreDigits;
  const totalScore = Number(scoreDigits) || 0;

  const diffNameRaw = cfg.difficultyNameRect ? await ocrField(cfg.difficultyNameRect, 'text', 'Difficulty') : null;
  if (!cfg.difficultyNameRect) fields.push({ label: 'Difficulty', box: '—', raw: '', value: 'Unknown (no box)', ok: true, auto: true });
  let difficultyName = diffNameRaw ?? 'Unknown';
  if (cfg.difficultyNameRect && diffNameRaw != null) {
    const guess = bestMatch(diffNameRaw, candidates.difficulties, MATCH_THRESHOLD);
    if (guess && guess.value !== diffNameRaw) {
      difficultyName = guess.value;
      const entry = fields.find((r) => r.label === 'Difficulty');
      if (entry) {
        entry.value = guess.value;
        entry.guessedFrom = diffNameRaw;
      }
    }
  }

  const diffValRaw = cfg.difficultyValRect ? await ocrField(cfg.difficultyValRect, 'text', 'Level') : null;
  if (!cfg.difficultyValRect) fields.push({ label: 'Level', box: '—', raw: '', value: '— (no box)', ok: true, auto: true });
  // Level is numbers only: letters/symbols are deleted ("Master 14+" -> "14").
  let difficultyVal = diffValRaw != null ? normalizeLevel(diffValRaw) : '';
  if (cfg.difficultyValRect && diffValRaw != null && difficultyVal === '') {
    const entry = fields.find((r) => r.label === 'Level');
    if (entry) {
      entry.ok = false;
      entry.value = '—';
    }
    missing.push('Level');
  }
  const levelEntry = fields.find((r) => r.label === 'Level');
  if (levelEntry && diffValRaw != null && difficultyVal !== '') levelEntry.value = difficultyVal;

  const rankRaw = cfg.rankRect ? await ocrField(cfg.rankRect, 'text', 'Rank') : null;
  if (!cfg.rankRect) fields.push({ label: 'Rank', box: '—', raw: '', value: '— (no box)', ok: true, auto: true });
  // Ranks allow alphabetical letters only; near-misses snap to known ranks ("5" -> "S").
  let playRank = '';
  if (cfg.rankRect && rankRaw != null) {
    const guess = bestMatch(rankRaw, candidates.ranks, MATCH_THRESHOLD);
    const entry = fields.find((r) => r.label === 'Rank');
    if (guess) {
      playRank = guess.value;
      if (entry && guess.value !== rankRaw) {
        entry.value = guess.value;
        entry.guessedFrom = rankRaw;
      }
    } else {
      playRank = normalizeRank(rankRaw);
      if (entry && playRank) entry.value = playRank;
      if (!playRank) {
        if (entry) {
          entry.ok = false;
          entry.value = '—';
        }
        missing.push('Rank');
      }
    }
  }

  // Game fields with boxes.
  const fieldGroups = [
    { list: cfg.judgments ?? [], category: 'Judgment' },
    { list: cfg.metrics ?? [], category: 'Metric' },
    { list: cfg.misc ?? [], category: 'Misc' },
  ] as const;
  for (const { list, category } of fieldGroups) {
    for (const fld of list) {
      if (!fld.ocrRect) continue;
      if (fld.type === 'boolean') {
        const hit = detectBoolean(img, fld.ocrRect, fld.targetColor ?? null, fld.threshold ?? 0.1);
        if (hit == null) {
          fields.push({ label: fld.label, box: boxStr(fld.ocrRect), raw: '', value: 'no target color — skipped', ok: true, auto: true });
        } else {
          details.push({ key: fld.key, value: hit ? 'true' : 'false', category });
          fields.push({ label: fld.label, box: boxStr(fld.ocrRect), raw: '', value: hit ? 'Detected' : 'Not detected', ok: true });
        }
        step(fld.label);
      } else {
        const kind = fld.type === 'text' ? 'text' : 'number';
        const raw = await ocrField(
          fld.ocrRect, kind, fld.label,
          kind === 'number' ? (v) => asNum(v) != null : undefined,
        );
        if (raw != null) {
          const value = kind === 'number' ? String(asNum(raw)) : raw;
          details.push({ key: fld.key, value, category });
          if (category === 'Judgment') numVals[fld.key] = asNum(raw) ?? 0;
        }
      }
    }
  }

  // Combo: box wins, else hits fallback.
  let maxCombo: number;
  if (cfg.comboRect) {
    const raw = await ocrField(cfg.comboRect, 'number', 'Combo', (v) => asNum(v) != null);
    maxCombo = raw != null ? (asNum(raw) ?? 0) : 0;
  } else {
    maxCombo = universalCombo(cfg, numVals);
    fields.push({ label: 'Combo', box: '—', raw: '', value: `${maxCombo}x (from judgments)`, ok: true, auto: true });
  }

  // Accuracy: box wins, else weighted by judgment weights.
  let accuracy: number;
  if (cfg.accuracyRect) {
    const raw = await ocrField(cfg.accuracyRect, 'number', 'Accuracy', (v) => asNum(v) != null);
    accuracy = raw != null ? (asNum(raw) ?? 0) : 0;
  } else {
    accuracy = calculateAccuracy(numVals, cfg);
    fields.push({ label: 'Accuracy', box: '—', raw: '', value: `${accuracy.toFixed(2)}% (weighted)`, ok: true, auto: true });
  }

  return {
    fields, missing, details, numVals,
    generic: {
      title,
      totalScore,
      difficultyName,
      difficultyVal,
      // Sort from the RAW text so a '+' level keeps Android's 0.5 bonus.
      difficultySortValue: parseDifficultySort(diffValRaw ?? ''),
      playRank,
      maxCombo,
      accuracy,
    },
  };
}
