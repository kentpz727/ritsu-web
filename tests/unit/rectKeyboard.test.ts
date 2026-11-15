import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_LARGE_STEP,
  KEYBOARD_MIN_SIZE,
  adjustRectWithKey,
  fitKeyboardRect,
} from '../../src/lib/config/rectKeyboard.ts';

const base = { x: 0.2, y: 0.3, w: 0.25, h: 0.1 };

describe('P-05 keyboard box movement', () => {
  it('moves the box with the arrow keys and does not mutate the input', () => {
    expect(adjustRectWithKey(base, 'ArrowLeft')).toEqual({ ...base, x: 0.19 });
    expect(adjustRectWithKey(base, 'ArrowRight')).toEqual({ ...base, x: 0.21 });
    expect(adjustRectWithKey(base, 'ArrowUp')).toEqual({ ...base, y: 0.29 });
    expect(adjustRectWithKey(base, 'ArrowDown')).toEqual({ ...base, y: 0.31 });
    expect(base).toEqual({ x: 0.2, y: 0.3, w: 0.25, h: 0.1 });
  });

  it('uses a larger step while Shift is held', () => {
    expect(adjustRectWithKey(base, 'ArrowRight', { large: true })).toEqual({
      ...base,
      x: base.x + KEYBOARD_LARGE_STEP,
    });
  });

  it('stops at the image edges and preserves the box size', () => {
    expect(adjustRectWithKey({ x: 0, y: 0, w: 0.25, h: 0.1 }, 'ArrowLeft')).toMatchObject({ x: 0 });
    expect(adjustRectWithKey({ x: 0, y: 0, w: 0.25, h: 0.1 }, 'ArrowUp')).toMatchObject({ y: 0 });
    expect(adjustRectWithKey({ x: 0.7, y: 0.85, w: 0.3, h: 0.15 }, 'ArrowRight')).toMatchObject({
      x: 0.7,
      y: 0.85,
      w: 0.3,
      h: 0.15,
    });
    expect(adjustRectWithKey({ x: 0.7, y: 0.85, w: 0.3, h: 0.15 }, 'ArrowDown')).toMatchObject({
      x: 0.7,
      y: 0.85,
      w: 0.3,
      h: 0.15,
    });
  });

  it('ignores keys the editor does not handle', () => {
    expect(adjustRectWithKey(base, 'Enter')).toBeNull();
    expect(adjustRectWithKey(base, 'a')).toBeNull();
    expect(adjustRectWithKey(base, 'ArrowRight', { resize: true })).not.toBeNull();
  });
});

describe('P-05 keyboard box resizing', () => {
  it('changes width with Ctrl/Cmd+Left/Right and height with Ctrl/Cmd+Up/Down', () => {
    expect(adjustRectWithKey(base, 'ArrowRight', { resize: true })).toEqual({ ...base, w: 0.26 });
    expect(adjustRectWithKey(base, 'ArrowLeft', { resize: true })).toEqual({ ...base, w: 0.24 });
    expect(adjustRectWithKey(base, 'ArrowDown', { resize: true })).toEqual({ ...base, h: 0.11 });
    expect(adjustRectWithKey(base, 'ArrowUp', { resize: true })).toEqual({ ...base, h: 0.09 });
  });

  it('respects the minimum size when shrinking', () => {
    const tiny = { x: 0.1, y: 0.1, w: KEYBOARD_MIN_SIZE, h: KEYBOARD_MIN_SIZE };
    expect(adjustRectWithKey(tiny, 'ArrowLeft', { resize: true })).toMatchObject({ w: KEYBOARD_MIN_SIZE });
    expect(adjustRectWithKey(tiny, 'ArrowUp', { resize: true })).toMatchObject({ h: KEYBOARD_MIN_SIZE });
  });

  it('does not grow past the image edge', () => {
    const right = { x: 0.95, y: 0.9, w: 0.04, h: 0.08 };
    expect(adjustRectWithKey(right, 'ArrowRight', { resize: true, large: true })).toMatchObject({ w: 0.05 });
    expect(adjustRectWithKey(right, 'ArrowDown', { resize: true, large: true })).toMatchObject({ h: 0.1 });
  });
});

describe('P-05 keyboard rect normalization', () => {
  it('fits invalid or non-finite rectangles into the unit square', () => {
    expect(fitKeyboardRect({ x: -1, y: 2, w: 0, h: Number.NaN })).toEqual({
      x: 0,
      y: 1 - KEYBOARD_MIN_SIZE,
      w: KEYBOARD_MIN_SIZE,
      h: KEYBOARD_MIN_SIZE,
    });
    expect(fitKeyboardRect({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 })).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    });
  });
});
