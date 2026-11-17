// Normalized-rect geometry for the OCR box editor. Pure functions only, so the
// canvas interaction can be reasoned about and tested without React (P-10).
import { fieldEntries, type GameConfigData, type OcrRect } from './types.ts';

/** Fixed OCR slots a config may define (in toolbar order). */
export const FIELD_KEYS = [
  'titleRect',
  'scoreRect',
  'comboRect',
  'accuracyRect',
  'difficultyNameRect',
  'difficultyValRect',
  'rankRect',
];

export type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'create';

export interface DragState {
  mode: DragMode;
  key: string;
  startNorm: NormPoint;
  startRect: OcrRect;
  grabDX: number;
  grabDY: number;
}

export interface NormPoint {
  x: number;
  y: number;
}

export interface BoxSpec {
  key: string;
  rect: OcrRect;
  color: string;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const MIN_SIZE = 0.005;

/** Every box the editor draws and hit-tests: saved config boxes plus the draft. */
export function boxesFor(cfg: GameConfigData | null, sel: string, rect: OcrRect): BoxSpec[] {
  const out: BoxSpec[] = [];
  if (cfg) {
    for (const k of FIELD_KEYS) {
      const r = (cfg as unknown as Record<string, OcrRect | null>)[k];
      if (r) out.push({ key: k, rect: r, color: k === sel ? '#5df3ff' : '#e6f3f4' });
    }
    fieldEntries(cfg).forEach(({ key, field }) => {
      if (field.ocrRect) out.push({ key, rect: field.ocrRect, color: '#2683b6' });
    });
  }
  out.push({ key: sel, rect, color: '#6eeb5e' });
  return out;
}

/** Current saved rect for a fixed slot or a `"Category:index"` address key. */
export function rectOfKey(key: string, source: GameConfigData | null): OcrRect | null | undefined {
  if (!source) return undefined;
  if (FIELD_KEYS.includes(key)) return (source as unknown as Record<string, OcrRect | null>)[key];
  const [cat, idx] = key.split(':');
  return source[listKeyOf(cat)]?.[Number(idx)]?.ocrRect;
}

export function listKeyOf(cat: string): 'judgments' | 'metrics' | 'misc' {
  return cat === 'Judgment' ? 'judgments' : cat === 'Metric' ? 'metrics' : 'misc';
}

/**
 * Hit-test saved boxes and the draft. Corners win over bodies, and the list is
 * scanned topmost-first. `onlySelected` restricts the search to the active box.
 */
export function hitTest(
  boxes: BoxSpec[],
  sel: string,
  norm: NormPoint,
  handleTol: number,
  onlySelected = false,
): { key: string; mode: Exclude<DragMode, 'create'> } | null {
  const list = onlySelected ? boxes.filter((b) => b.key === sel) : boxes;
  // Corners first (topmost box wins).
  for (let i = list.length - 1; i >= 0; i--) {
    const { key, rect: r } = list[i];
    const corners: Array<[number, number, Exclude<DragMode, 'create'>]> = [
      [r.x, r.y, 'nw'],
      [r.x + r.w, r.y, 'ne'],
      [r.x, r.y + r.h, 'sw'],
      [r.x + r.w, r.y + r.h, 'se'],
    ];
    for (const [cx, cy, mode] of corners) {
      if (Math.abs(norm.x - cx) <= handleTol && Math.abs(norm.y - cy) <= handleTol) return { key, mode };
    }
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const { key, rect: r } = list[i];
    if (norm.x >= r.x && norm.x <= r.x + r.w && norm.y >= r.y && norm.y <= r.y + r.h) {
      return { key, mode: 'move' };
    }
  }
  return null;
}

/** Apply one pointer position to a drag, clamped to the image and to MIN_SIZE. */
export function dragRect(drag: DragState, norm: NormPoint): OcrRect {
  const { mode, startNorm, startRect } = drag;
  let next: OcrRect;
  if (mode === 'move') {
    const w = Math.max(startRect.w, MIN_SIZE);
    const h = Math.max(startRect.h, MIN_SIZE);
    next = { w, h, x: clamp01(norm.x - drag.grabDX), y: clamp01(norm.y - drag.grabDY) };
    next.x = Math.min(next.x, 1 - w);
    next.y = Math.min(next.y, 1 - h);
  } else if (mode === 'create') {
    const x = Math.min(startNorm.x, norm.x);
    const y = Math.min(startNorm.y, norm.y);
    next = {
      x,
      y,
      w: Math.max(Math.abs(norm.x - startNorm.x), MIN_SIZE),
      h: Math.max(Math.abs(norm.y - startNorm.y), MIN_SIZE),
    };
    if (x + next.w > 1) next.w = 1 - x;
    if (y + next.h > 1) next.h = 1 - y;
  } else {
    next = { ...startRect };
    if (mode === 'nw' || mode === 'sw') {
      const right = startRect.x + startRect.w;
      next.x = Math.min(norm.x, right - MIN_SIZE);
      next.w = right - next.x;
    }
    if (mode === 'ne' || mode === 'se') {
      next.w = Math.max(norm.x - startRect.x, MIN_SIZE);
    }
    if (mode === 'nw' || mode === 'ne') {
      const bottom = startRect.y + startRect.h;
      next.y = Math.min(norm.y, bottom - MIN_SIZE);
      next.h = bottom - next.y;
    }
    if (mode === 'sw' || mode === 'se') {
      next.h = Math.max(norm.y - startRect.y, MIN_SIZE);
    }
    next.x = clamp01(next.x);
    next.y = clamp01(next.y);
    if (next.x + next.w > 1) next.w = 1 - next.x;
    if (next.y + next.h > 1) next.h = 1 - next.y;
  }
  return next;
}

/** CSS cursor for a hovered or actively dragged box. */
export function cursorFor(mode: DragMode | null, dragging = false): string {
  if (!mode || mode === 'create') return 'crosshair';
  if (mode === 'move') return dragging ? 'grabbing' : 'move';
  return mode === 'nw' || mode === 'se' ? 'nwse-resize' : 'nesw-resize';
}
