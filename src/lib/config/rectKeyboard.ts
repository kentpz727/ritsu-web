// Keyboard geometry for the BoxEditor canvas. Pointer drags and keyboard nudges
// share the same normalized 0–1 coordinate space; these helpers keep a box
// inside the image and never mutate the input rect.
import type { OcrRect } from './types.ts';

export const KEYBOARD_MIN_SIZE = 0.005;
export const KEYBOARD_STEP = 0.01;
export const KEYBOARD_LARGE_STEP = 0.05;

export interface RectKeyOptions {
  /** Ctrl/Cmd+Arrow resizes instead of moving. */
  resize?: boolean;
  /** Shift+Arrow uses the larger step. */
  large?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Clamp a rect into the unit square and give it at least the editor minimum size. */
export function fitKeyboardRect(rect: OcrRect): OcrRect {
  const w = clamp(finite(rect.w, KEYBOARD_MIN_SIZE), KEYBOARD_MIN_SIZE, 1);
  const h = clamp(finite(rect.h, KEYBOARD_MIN_SIZE), KEYBOARD_MIN_SIZE, 1);
  return {
    x: clamp(finite(rect.x), 0, 1 - w),
    y: clamp(finite(rect.y), 0, 1 - h),
    w,
    h,
  };
}

/**
 * Apply one arrow key to a box. Plain arrows move; Ctrl/Cmd arrows resize the
 * width (left/right) or height (up/down). Shift selects the larger step.
 * Returns null for keys the editor does not handle.
 */
export function adjustRectWithKey(rect: OcrRect, key: string, options: RectKeyOptions = {}): OcrRect | null {
  const step = options.large ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
  const base = fitKeyboardRect(rect);
  let { x, y, w, h } = base;

  if (!options.resize) {
    if (key === 'ArrowLeft') x -= step;
    else if (key === 'ArrowRight') x += step;
    else if (key === 'ArrowUp') y -= step;
    else if (key === 'ArrowDown') y += step;
    else return null;
    x = clamp(x, 0, 1 - w);
    y = clamp(y, 0, 1 - h);
  } else if (key === 'ArrowLeft') {
    w -= step;
  } else if (key === 'ArrowRight') {
    w += step;
  } else if (key === 'ArrowUp') {
    h -= step;
  } else if (key === 'ArrowDown') {
    h += step;
  } else {
    return null;
  }

  if (options.resize) {
    w = clamp(w, KEYBOARD_MIN_SIZE, 1 - x);
    h = clamp(h, KEYBOARD_MIN_SIZE, 1 - y);
  }

  return {
    x: round4(x),
    y: round4(y),
    w: round4(w),
    h: round4(h),
  };
}
