import { describe, expect, it } from 'vitest';
import {
  ConfigValidationError,
  formatConfigIssues,
  parseGameConfig,
  validateGameConfigJson,
  validateGameConfigObject,
  type GameConfigData,
} from '../../src/lib/config/types.ts';

type Kind = 'error' | 'warning';

interface MalformedCase {
  name: string;
  raw: unknown;
  kind: Kind;
  /** Path the validator must report. */
  path: string;
  verify?: (config: GameConfigData) => void;
}

/** V-03 corpus: wrong types, bad geometry, missing/duplicate keys, null holes. */
const CASES: MalformedCase[] = [
  { name: 'root is null', raw: null, kind: 'error', path: '$' },
  { name: 'root is an array', raw: [], kind: 'error', path: '$' },
  { name: 'gameName is missing', raw: {}, kind: 'error', path: 'gameName' },
  { name: 'gameName is not a string', raw: { gameName: 42 }, kind: 'error', path: 'gameName' },
  {
    name: 'judgments is not an array',
    raw: { gameName: 'G', judgments: 'nope' },
    kind: 'error',
    path: 'judgments',
  },
  {
    name: 'a metrics entry is not an object',
    raw: { gameName: 'G', metrics: [42] },
    kind: 'error',
    path: 'metrics[0]',
  },
  {
    name: 'a null field hole is dropped',
    raw: { gameName: 'G', judgments: [null] },
    kind: 'warning',
    path: 'judgments[0]',
    verify: (config) => expect(config.judgments).toEqual([]),
  },
  {
    name: 'a field key is missing',
    raw: { gameName: 'G', judgments: [{ label: 'Perfect' }] },
    kind: 'error',
    path: 'judgments[0].key',
  },
  {
    name: 'a field key is empty',
    raw: { gameName: 'G', judgments: [{ key: '  ', label: 'Perfect' }] },
    kind: 'error',
    path: 'judgments[0].key',
  },
  {
    name: 'weight is a string',
    raw: { gameName: 'G', judgments: [{ key: 'perfect', label: 'Perfect', weight: 'high' }] },
    kind: 'error',
    path: 'judgments[0].weight',
  },
  {
    name: 'weight above 1 is clamped',
    raw: { gameName: 'G', judgments: [{ key: 'perfect', label: 'Perfect', weight: 1.5 }] },
    kind: 'warning',
    path: 'judgments[0].weight',
    verify: (config) => expect(config.judgments?.[0].weight).toBe(1),
  },
  {
    name: 'negative weight is clamped',
    raw: { gameName: 'G', judgments: [{ key: 'perfect', label: 'Perfect', weight: -0.2 }] },
    kind: 'warning',
    path: 'judgments[0].weight',
    verify: (config) => expect(config.judgments?.[0].weight).toBe(0),
  },
  {
    name: 'unknown field type',
    raw: { gameName: 'G', misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'banana' }] },
    kind: 'error',
    path: 'misc[0].type',
  },
  {
    name: 'negative rect x is clamped',
    raw: { gameName: 'G', titleRect: { x: -1, y: 0, w: 1, h: 1 } },
    kind: 'warning',
    path: 'titleRect.x',
    verify: (config) => expect(config.titleRect).toMatchObject({ x: 0 }),
  },
  {
    name: 'rect y above 1 is clamped',
    raw: { gameName: 'G', scoreRect: { x: 0, y: 2, w: 1, h: 1 } },
    kind: 'warning',
    path: 'scoreRect.y',
    verify: (config) => expect(config.scoreRect).toMatchObject({ y: 1 }),
  },
  {
    name: 'rect is missing a coordinate',
    raw: { gameName: 'G', accuracyRect: { x: 0, y: 0, h: 1 } },
    kind: 'error',
    path: 'accuracyRect.w',
  },
  {
    name: 'field rect w is negative',
    raw: {
      gameName: 'G',
      judgments: [{ key: 'perfect', label: 'Perfect', ocrRect: { x: 0, y: 0, w: -0.2, h: 1 } }],
    },
    kind: 'warning',
    path: 'judgments[0].ocrRect.w',
    verify: (config) => expect(config.judgments?.[0].ocrRect?.w).toBe(0),
  },
  {
    name: 'targetColor is a string',
    raw: {
      gameName: 'G',
      misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean', targetColor: 'red' }],
    },
    kind: 'error',
    path: 'misc[0].targetColor',
  },
  {
    name: 'threshold above 1 is clamped',
    raw: {
      gameName: 'G',
      misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean', threshold: 2 }],
    },
    kind: 'warning',
    path: 'misc[0].threshold',
    verify: (config) => expect(config.misc?.[0].threshold).toBe(1),
  },
  {
    name: 'duplicate field keys are renamed',
    raw: {
      gameName: 'G',
      judgments: [
        { key: 'perfect', label: 'Perfect' },
        { key: 'perfect', label: 'Perfect 2' },
      ],
    },
    kind: 'warning',
    path: '$',
    verify: (config) => expect(config.judgments?.map((field) => field.key)).toEqual(['perfect', 'perfect_2']),
  },
];

describe('P-03 config schema validation', () => {
  it('flags all 20 malformed configs with field-level issues and no uncaught exception', () => {
    expect(CASES).toHaveLength(20);
    let flagged = 0;

    for (const testCase of CASES) {
      let result: ReturnType<typeof validateGameConfigObject> | undefined;
      expect(() => {
        result = validateGameConfigObject(testCase.raw);
      }, testCase.name).not.toThrow();
      expect(result, testCase.name).toBeDefined();

      const issues = [...result!.errors, ...result!.warnings];
      expect(issues.length, `${testCase.name}: expected at least one issue`).toBeGreaterThan(0);
      expect(
        issues.some((issue) => issue.path === testCase.path),
        `${testCase.name}: wanted path ${testCase.path}, got ${JSON.stringify(issues)}`,
      ).toBe(true);

      if (testCase.kind === 'error') {
        expect(result!.config, `${testCase.name}: config must be rejected`).toBeNull();
        expect(
          result!.errors.some((issue) => issue.path === testCase.path),
          testCase.name,
        ).toBe(true);
      } else {
        expect(result!.errors, `${testCase.name}: warnings only`).toEqual([]);
        expect(result!.config, `${testCase.name}: config must be accepted`).not.toBeNull();
        expect(
          result!.warnings.some((issue) => issue.path === testCase.path),
          testCase.name,
        ).toBe(true);
        testCase.verify?.(result!.config!);
      }
      flagged++;
    }

    expect(flagged).toBe(20);
  });

  it('accepts a valid config, trims the name, and preserves unknown properties', () => {
    const result = validateGameConfigObject({
      gameName: '  Fine Game  ',
      customProperty: { keep: true },
      judgments: [{ key: 'perfect', label: 'Perfect' }],
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.config).toMatchObject({
      gameName: 'Fine Game',
      configVersion: 1,
      useRankOcr: true,
      useAccuracyOcr: false,
      customProperty: { keep: true },
      metrics: [],
      misc: [],
    });
  });

  it('falls back to the key when a label is missing, with a warning', () => {
    const result = validateGameConfigObject({ gameName: 'G', judgments: [{ key: 'perfect' }] });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].path).toBe('judgments[0].label');
    expect(result.warnings[0].message).toContain('using the field key');
    expect(result.config?.judgments?.[0]).toMatchObject({ key: 'perfect', label: 'perfect' });
  });

  it('reports JSON syntax errors as field-level issues instead of throwing', () => {
    const result = validateGameConfigJson('{');

    expect(result.config).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('$');
    expect(result.errors[0].message).toContain('Invalid JSON');
  });

  it('parseGameConfig throws ConfigValidationError with every structural issue', () => {
    const invalid = validateGameConfigJson(
      JSON.stringify({
        gameName: 'G',
        judgments: [{ key: 'perfect', label: 'Perfect', weight: 'high' }],
        misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'banana' }],
      }),
    );
    expect(invalid.errors.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['judgments[0].weight', 'misc[0].type']),
    );

    expect(() =>
      parseGameConfig(
        JSON.stringify({
          gameName: 'G',
          judgments: [{ key: 'perfect', label: 'Perfect', weight: 'high' }],
        }),
      ),
    ).toThrow(ConfigValidationError);

    try {
      parseGameConfig('{"gameName":"G","judgments":[{"key":"perfect","label":"Perfect","weight":"high"}]}');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const issues = (error as ConfigValidationError).issues;
      expect(formatConfigIssues(issues)).toContain('judgments[0].weight');
    }
  });

  it('parseGameConfig clamps geometry and weights inside the image', () => {
    const result = validateGameConfigJson(
      JSON.stringify({
        gameName: 'G',
        titleRect: { x: -1, y: 0, w: 2, h: 1 },
        scoreRect: { x: 0.8, y: 0.9, w: 0.5, h: 0.5 },
        judgments: [{ key: 'perfect', label: 'Perfect', weight: 5, ocrRect: { x: 0.5, y: 0.5, w: 0.75, h: 0.1 } }],
      }),
    );
    const config = result.config!;

    expect(result.errors).toEqual([]);
    expect(config.titleRect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(config.scoreRect!.x).toBe(0.8);
    expect(config.scoreRect!.y).toBe(0.9);
    expect(config.scoreRect!.w).toBeCloseTo(0.2, 10);
    expect(config.scoreRect!.h).toBeCloseTo(0.1, 10);
    expect(config.judgments?.[0].weight).toBe(1);
    expect(config.judgments?.[0].ocrRect).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.1 });
    expect(result.warnings.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'titleRect.x',
        'titleRect.w',
        'scoreRect.w',
        'scoreRect.h',
        'judgments[0].weight',
        'judgments[0].ocrRect.w',
      ]),
    );
  });

  it('accepts signed Android ARGB target colors so opaque colors keep working', () => {
    const result = validateGameConfigObject({
      gameName: 'G',
      misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean', targetColor: -65536 }],
    });

    expect(result.errors).toEqual([]);
    expect(result.config?.misc?.[0].targetColor).toBe(-65536);
  });
});
