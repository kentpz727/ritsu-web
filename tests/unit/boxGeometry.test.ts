import { describe, expect, it } from 'vitest';
import {
  FIELD_KEYS,
  boxesFor,
  dragRect,
  hitTest,
  listKeyOf,
  rectOfKey,
  type DragState,
} from '../../src/lib/config/boxGeometry.ts';
import type { GameConfigData, OcrRect } from '../../src/lib/config/types.ts';

const rect = (x: number, y: number, w: number, h: number): OcrRect => ({ x, y, w, h });

const cfg: GameConfigData = {
  gameName: 'Geometry',
  scoreRect: rect(0.1, 0.1, 0.2, 0.1),
  judgments: [{ key: 'perfect', label: 'Perfect', ocrRect: rect(0.3, 0.3, 0.1, 0.1) }],
  metrics: [{ key: 'score', label: 'Score', ocrRect: rect(0.4, 0.4, 0.1, 0.1) }],
  misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean' }],
};

describe('box geometry', () => {
  it('lists fixed slots, dynamic fields, then the draft last', () => {
    const boxes = boxesFor(cfg, 'scoreRect', rect(0.5, 0.5, 0.2, 0.2));
    expect(boxes.map((b) => b.key)).toEqual(['scoreRect', 'Judgment:0', 'Metric:0', 'scoreRect']);
    expect(boxes[0].color).toBe('#5df3ff');
    expect(boxes[1].color).toBe('#2683b6');
    expect(boxes.at(-1)?.color).toBe('#6eeb5e');
  });

  it('resolves fixed-slot and dynamic rects by address key', () => {
    expect(rectOfKey('scoreRect', cfg)).toEqual(rect(0.1, 0.1, 0.2, 0.1));
    expect(rectOfKey('Judgment:0', cfg)).toEqual(rect(0.3, 0.3, 0.1, 0.1));
    expect(rectOfKey('Metric:0', cfg)).toEqual(rect(0.4, 0.4, 0.1, 0.1));
    expect(rectOfKey('Misc:0', cfg)).toBeUndefined();
    expect(rectOfKey('scoreRect', null)).toBeUndefined();
  });

  it('maps categories to list keys and keeps the seven fixed slots', () => {
    expect(listKeyOf('Judgment')).toBe('judgments');
    expect(listKeyOf('Metric')).toBe('metrics');
    expect(listKeyOf('Misc')).toBe('misc');
    expect(FIELD_KEYS).toHaveLength(7);
  });

  it('prefers corners over bodies and the topmost box over lower ones', () => {
    const boxes = [
      { key: 'lower', rect: rect(0.1, 0.1, 0.2, 0.2), color: '' },
      { key: 'upper', rect: rect(0.15, 0.15, 0.2, 0.2), color: '' },
    ];
    expect(hitTest(boxes, 'lower', { x: 0.15, y: 0.15 }, 0.01)).toEqual({ key: 'upper', mode: 'nw' });
    expect(hitTest(boxes, 'lower', { x: 0.32, y: 0.32 }, 0.01)).toEqual({ key: 'upper', mode: 'move' });
    expect(hitTest(boxes, 'lower', { x: 0.9, y: 0.9 }, 0.01)).toBeNull();
    expect(hitTest(boxes, 'upper', { x: 0.12, y: 0.12 }, 0.01, true)).toBeNull();
  });

  it('moves, creates, and resizes rects inside the image', () => {
    const move: DragState = {
      mode: 'move',
      key: 'scoreRect',
      startNorm: { x: 0.2, y: 0.2 },
      startRect: rect(0.2, 0.2, 0.2, 0.1),
      grabDX: 0.02,
      grabDY: 0.02,
    };
    expect(dragRect(move, { x: 0.5, y: 0.5 })).toEqual(rect(0.48, 0.48, 0.2, 0.1));
    expect(dragRect(move, { x: 0.99, y: 0.99 })).toEqual(rect(0.8, 0.9, 0.2, 0.1));

    const create: DragState = {
      mode: 'create',
      key: 'scoreRect',
      startNorm: { x: 0.5, y: 0.5 },
      startRect: rect(0, 0, 0, 0),
      grabDX: 0,
      grabDY: 0,
    };
    expect(dragRect(create, { x: 0.2, y: 0.3 })).toEqual(rect(0.2, 0.3, 0.3, 0.2));

    const resize: DragState = { ...move, mode: 'se' };
    expect(dragRect(resize, { x: 0.9, y: 0.9 })).toEqual(rect(0.2, 0.2, 0.7, 0.7));
    expect(dragRect(resize, { x: 0.2, y: 0.2 })).toEqual(rect(0.2, 0.2, 0.005, 0.005));
  });
});
