import { describe, expect, it } from 'vitest';
import golden from './golden.json';
import {
  calculateAccuracy,
  isMissField,
  parseDifficultySort,
  rankingValue,
  totalNotes,
  universalCombo,
} from '../../src/lib/calc/scoring.ts';
import type { ConfigField, GameConfigData } from '../../src/lib/config/types.ts';
import { dedupeKeys, filterDetailsByConfig, parseGameConfig } from '../../src/lib/config/types.ts';
import { fromLocalInputValue, monthKey, timeAgo, toLocalInputValue } from '../../src/lib/calc/dates.ts';
import { finiteOr, toGraphPoint } from '../../src/lib/numbers.ts';

const CONFIG: GameConfigData = {
  gameName: 'Golden Game',
  judgments: [
    { key: 'perfect', label: 'Perfect', weight: 1 },
    { key: 'great', label: 'Great', weight: 1 / 3 },
    { key: 'good', label: 'Good', weight: 1 / 6 },
    { key: 'bad', label: 'Bad', weight: 0 },
    { key: 'miss', label: 'Miss', weight: 0, isMiss: true },
  ],
  metrics: [{ key: 'score', label: 'Score' }],
  misc: [
    { key: 'fullCombo', label: 'Full Combo', type: 'boolean' },
    { key: 'clear', label: 'Clear', type: 'boolean' },
  ],
};

const CONFIG_JSON = JSON.stringify({
  gameName: 'Golden Game',
  configVersion: 7,
  useRankOcr: false,
  judgments: [{ key: 'perfect', label: 'Perfect', weight: 1 }, null, { label: 'NoKey' }],
  metrics: 'not-an-array',
  misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean' }],
  titleRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
});

describe('golden characterization: scoring math', () => {
  for (const c of golden.scoring.accuracy) {
    it(`calculateAccuracy: ${c.name}`, () => {
      expect(calculateAccuracy(c.counts as Record<string, number>, CONFIG)).toBe(c.expected);
    });
  }

  for (const c of golden.scoring.totalNotes) {
    it('totalNotes sums configured judgment counts', () => {
      expect(totalNotes(c.counts as Record<string, number>, CONFIG)).toBe(c.expected);
    });
  }

  for (const c of golden.scoring.parseDifficultySort) {
    it(`parseDifficultySort: ${c.input}`, () => {
      expect(parseDifficultySort(c.input)).toBe(c.expected);
    });
  }

  for (const c of golden.scoring.isMissField) {
    it(`isMissField: ${c.field.key}`, () => {
      expect(isMissField(c.field as ConfigField)).toBe(c.expected);
    });
  }

  it('universalCombo excludes miss and sums other judgments', () => {
    expect(universalCombo(CONFIG, golden.scoring.universalCombo.counts)).toBe(
      golden.scoring.universalCombo.expected,
    );
  });

  for (const mode of ['SCORE', 'ACCURACY', 'COMBO'] as const) {
    it(`rankingValue: ${mode} weights by note count`, () => {
      expect(
        rankingValue(
          golden.scoring.rankingValue.counts,
          CONFIG,
          golden.scoring.rankingValue.score,
          mode,
        ),
      ).toBe(golden.scoring.rankingValue.expected[mode]);
    });
  }
});

describe('golden characterization: config parsing', () => {
  it('parses defaults, drops invalid entries, and keeps explicit values', () => {
    expect(parseGameConfig(CONFIG_JSON)).toEqual(golden.config.parsed);
  });

  it('rejects a config without gameName', () => {
    expect(() => parseGameConfig('{"judgments":[]}')).toThrow('Config is missing gameName');
  });

  it('dedupeKeys makes all field keys unique', () => {
    const { cfg, renamed } = dedupeKeys({
      gameName: 'Dedupe',
      judgments: [
        { key: 'perfect', label: 'Perfect' },
        { key: 'perfect', label: 'Perfect 2' },
        { key: '', label: 'Empty' },
      ],
      metrics: [{ key: 'perfect', label: 'Perfect 3' }],
      misc: [{ key: '', label: 'Empty 2' }],
    });
    expect({
      judgments: (cfg.judgments ?? []).map((f) => f.key),
      metrics: (cfg.metrics ?? []).map((f) => f.key),
      misc: (cfg.misc ?? []).map((f) => f.key),
      renamed,
    }).toEqual(golden.config.dedupedKeys);
  });
});

describe('golden characterization: detail visibility', () => {
  const details = [
    { key: 'perfect', value: '100', category: 'Judgment' },
    { key: 'score', value: '1000000', category: 'Metric' },
    { key: 'unknown', value: 'x', category: 'Metric' },
    { key: 'fullCombo', value: 'true', category: 'Misc' },
    { key: 'clear', value: 'false', category: 'Misc' },
  ];

  it('with a config: keeps known keys and hides unknown keys', () => {
    expect(filterDetailsByConfig(CONFIG, details)).toEqual(golden.details.withConfig);
  });

  it('without a config: keeps all keys but still drops false misc values', () => {
    expect(filterDetailsByConfig(null, details)).toEqual(golden.details.withoutConfig);
  });
});

describe('golden characterization: numbers and dates', () => {
  it('finiteOr coerces non-finite input to the fallback', () => {
    expect(finiteOr(NaN)).toBe(0);
    expect(finiteOr(Infinity)).toBe(0);
    expect(finiteOr('12')).toBe(12);
    expect(finiteOr('abc', 7)).toBe(7);
    expect(finiteOr(undefined, 5)).toBe(5);
    expect(finiteOr(null)).toBe(0);
  });

  it('toGraphPoint drops unusable rows', () => {
    expect(toGraphPoint({ accuracy: 99, totalScore: 1000, playTimestamp: 123 })).toEqual({
      accuracy: 99,
      totalScore: 1000,
      playTimestamp: 123,
    });
    expect(toGraphPoint({ accuracy: NaN, totalScore: 1000, playTimestamp: 123 })).toBeNull();
    expect(toGraphPoint({ totalScore: 1000, playTimestamp: 123 })).toBeNull();
  });

  it('round-trips a local datetime input to the minute', () => {
    const ts = new Date(2026, 0, 2, 3, 4, 0).getTime();
    const value = toLocalInputValue(ts);
    expect(value).toBe('2026-01-02T03:04');
    expect(fromLocalInputValue(value)).toBe(ts);
    expect(monthKey(ts)).toBe('2026-01');
  });

  it('timeAgo labels a fixed clock deterministically', () => {
    const now = new Date(2026, 0, 2, 3, 4, 0).getTime();
    expect(timeAgo(now - 30_000, now)).toBe('just now');
    expect(timeAgo(now - 90_000, now)).toBe('1 min. ago');
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe('2 hrs. ago');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });
});
