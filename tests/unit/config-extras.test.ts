import { describe, expect, it } from 'vitest';
import type { GameConfigData } from '../../src/lib/config/types.ts';
import {
  allFieldsWithCategory,
  defaultSlotRect,
  dedupeKeys,
  fieldEntries,
  hasSlot,
  isAccuracyEnabled,
  isRankEnabled,
  parseGameConfig,
} from '../../src/lib/config/types.ts';

const cfg: GameConfigData = {
  gameName: 'Config Extras',
  judgments: [
    { key: 'perfect', label: 'Perfect' },
    { key: 'miss', label: 'Miss', isMiss: true },
  ],
  metrics: [{ key: 'score', label: 'Score' }],
  misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean' }],
};

describe('config field enumeration', () => {
  it('tags every field with its category and drops invalid entries', () => {
    const sparse = {
      gameName: 'Sparse',
      judgments: [cfg.judgments![0], null, { label: 'No key' }],
      metrics: cfg.metrics,
      misc: cfg.misc,
    } as unknown as GameConfigData;
    expect(allFieldsWithCategory(sparse)).toEqual([
      { field: cfg.judgments![0], category: 'Judgment' },
      { field: cfg.metrics![0], category: 'Metric' },
      { field: cfg.misc![0], category: 'Misc' },
    ]);
  });

  it('fieldEntries uses true array indices and skips holes', () => {
    const sparse = {
      gameName: 'Sparse',
      judgments: [cfg.judgments![0], null, cfg.judgments![1]],
      metrics: [],
    } as unknown as GameConfigData;
    expect(fieldEntries(sparse).map((e) => e.key)).toEqual(['Judgment:0', 'Judgment:2']);
    expect(fieldEntries(null)).toEqual([]);
    expect(fieldEntries(undefined)).toEqual([]);
  });

  it('defaultSlotRect returns a fresh copy each time', () => {
    const a = defaultSlotRect();
    const b = defaultSlotRect();
    expect(a).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.08 });
    a.x = 0.9;
    expect(b.x).toBe(0.1);
  });

  it('hasSlot treats an unknown config as fully enabled', () => {
    expect(hasSlot(null, 'titleRect')).toBe(true);
    expect(hasSlot(cfg, 'titleRect')).toBe(false);
    expect(hasSlot({ ...cfg, titleRect: { x: 0, y: 0, w: 1, h: 1 } }, 'titleRect')).toBe(true);
    expect(hasSlot({ ...cfg, titleRect: null }, 'titleRect')).toBe(false);
  });

  it('rank and accuracy visibility follow flags, rects, and judgments', () => {
    expect(isRankEnabled(null)).toBe(true);
    expect(isRankEnabled(cfg)).toBe(false);
    expect(isRankEnabled({ ...cfg, useRankOcr: true })).toBe(true);
    expect(isRankEnabled({ ...cfg, rankRect: { x: 0, y: 0, w: 1, h: 1 } })).toBe(true);

    expect(isAccuracyEnabled(null)).toBe(true);
    expect(isAccuracyEnabled({ gameName: 'Empty' })).toBe(false);
    expect(isAccuracyEnabled({ ...cfg, useAccuracyOcr: true })).toBe(true);
    expect(
      isAccuracyEnabled({
        gameName: 'Rect',
        accuracyRect: { x: 0, y: 0, w: 1, h: 1 },
      }),
    ).toBe(true);
    expect(isAccuracyEnabled(cfg)).toBe(true);
  });
});

describe('config parsing edge cases', () => {
  it('rejects non-object JSON and missing names', () => {
    expect(() => parseGameConfig('[]')).toThrow('Config is missing gameName');
    expect(() => parseGameConfig('{}')).toThrow('Config is missing gameName');
    expect(() => parseGameConfig('{"gameName":42}')).toThrow('Config is missing gameName');
  });

  it('preserves unknown top-level properties and defaults version flags', () => {
    const parsed = parseGameConfig('{"gameName":"G","formula":"score * 2"}');
    expect(parsed.formula).toBe('score * 2');
    expect(parsed.configVersion).toBe(1);
    expect(parsed.useRankOcr).toBe(true);
    expect(parsed.useAccuracyOcr).toBe(false);
    expect(parsed.judgments).toEqual([]);
  });

  it('dedupeKeys leaves an already-unique config untouched', () => {
    const result = dedupeKeys(cfg);
    expect(result.renamed).toEqual([]);
    expect(result.cfg.judgments?.map((f) => f.key)).toEqual(['perfect', 'miss']);
  });
});
