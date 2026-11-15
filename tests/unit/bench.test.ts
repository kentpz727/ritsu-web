import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameConfigData, OcrRect } from '../../src/lib/config/types.ts';

const canvasHarness = vi.hoisted(() => {
  const imageData = { data: new Uint8ClampedArray(16) };
  return {
    imageData,
    canvas: { getContext: () => ({ getImageData: () => imageData }) },
  };
});

vi.mock('../../src/lib/ocr/image.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/ocr/image.ts')>();
  return { ...actual, cropToCanvas: vi.fn(() => canvasHarness.canvas) };
});

vi.mock('../../src/lib/ocr/client.ts', () => ({
  ocrCanvas: vi.fn(),
  ocrText: vi.fn(),
}));

vi.mock('../../src/lib/ocr/paddle.ts', () => ({
  ocrPaddleCanvas: vi.fn(),
}));

import { ocrCanvas, ocrText } from '../../src/lib/ocr/client.ts';
import { ocrPaddleCanvas } from '../../src/lib/ocr/paddle.ts';
import { asNum, getMatchCandidates, loadImage, readConfigBoxes } from '../../src/lib/ocr/bench.ts';
import { db, saveFullScore, upsertConfig } from '../../src/lib/db/dexie.ts';

const rect: OcrRect = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
const image = {} as HTMLImageElement;

const ocrCanvasMock = vi.mocked(ocrCanvas);
const ocrTextMock = vi.mocked(ocrText);
const ocrPaddleMock = vi.mocked(ocrPaddleCanvas);

function resetCanvas(color: number): void {
  canvasHarness.imageData.data.fill(0);
  if (color >= 0) {
    for (let i = 0; i < canvasHarness.imageData.data.length; i += 4) {
      canvasHarness.imageData.data[i] = color;
    }
  }
}

beforeEach(async () => {
  ocrCanvasMock.mockReset();
  ocrTextMock.mockReset();
  ocrPaddleMock.mockReset();
  resetCanvas(0);
  await db.delete();
  await db.open();
});

describe('bench value parsing', () => {
  it('parses finite numbers and rejects empty or junk text', () => {
    expect(asNum('1234')).toBe(1234);
    expect(asNum('1,234')).toBe(1234);
    expect(asNum('98.5')).toBe(98.5);
    expect(asNum('')).toBeNull();
    expect(asNum('   ')).toBeNull();
    expect(asNum('abc')).toBeNull();
  });
});

describe('configs with no OCR boxes', () => {
  it('derives every generic field and reports no missing boxes', async () => {
    const cfg: GameConfigData = {
      gameName: 'No Boxes',
      judgments: [
        { key: 'perfect', label: 'Perfect', weight: 1 },
        { key: 'miss', label: 'Miss', weight: 0, isMiss: true },
      ],
      metrics: [{ key: 'fast', label: 'Fast', type: 'number' }],
      misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean' }],
    };
    const result = await readConfigBoxes(image, cfg, { fallbackTitle: 'shot.png' });

    expect(result.missing).toEqual([]);
    expect(result.fields).toEqual([
      { label: 'Title', box: '—', raw: '', value: 'shot.png (filename)', ok: true, auto: true },
      { label: 'Score', box: '—', raw: '', value: '0 (no box)', ok: true, auto: true },
      { label: 'Difficulty', box: '—', raw: '', value: 'Unknown (no box)', ok: true, auto: true },
      { label: 'Level', box: '—', raw: '', value: '— (no box)', ok: true, auto: true },
      { label: 'Rank', box: '—', raw: '', value: '— (no box)', ok: true, auto: true },
      { label: 'Combo', box: '—', raw: '', value: '0x (from judgments)', ok: true, auto: true },
      { label: 'Accuracy', box: '—', raw: '', value: '0.00% (weighted)', ok: true, auto: true },
    ]);
    expect(result.generic).toEqual({
      title: 'shot.png',
      totalScore: 0,
      difficultyName: 'Unknown',
      difficultyVal: '',
      difficultySortValue: 0,
      playRank: '',
      maxCombo: 0,
      accuracy: 0,
    });
    expect(ocrCanvasMock).not.toHaveBeenCalled();
    expect(ocrTextMock).not.toHaveBeenCalled();
  });
});

describe('configs with OCR boxes', () => {
  const cfg: GameConfigData = {
    gameName: 'Bench',
    titleRect: rect,
    scoreRect: rect,
    comboRect: rect,
    accuracyRect: rect,
    difficultyNameRect: rect,
    difficultyValRect: rect,
    rankRect: rect,
    judgments: [
      { key: 'perfect', label: 'Perfect', type: 'number', weight: 1, ocrRect: rect },
      { key: 'miss', label: 'Miss', type: 'number', weight: 0, isMiss: true },
    ],
    metrics: [{ key: 'fast', label: 'Fast', type: 'number', ocrRect: rect }],
    misc: [
      {
        key: 'fullCombo',
        label: 'Full Combo',
        type: 'boolean',
        ocrRect: rect,
        targetColor: 0xffff0000,
        threshold: 0.1,
      },
    ],
  };

  it('reads, cleans, snaps, and derives every field', async () => {
    ocrTextMock
      .mockResolvedValueOnce('SONG TITLE')
      .mockResolvedValueOnce('Expert')
      .mockResolvedValueOnce('Master 14+')
      .mockResolvedValueOnce('5');
    ocrCanvasMock
      .mockResolvedValueOnce('0012345')
      .mockResolvedValueOnce('010')
      .mockResolvedValueOnce('42')
      .mockResolvedValueOnce('0500')
      .mockResolvedValueOnce('98.5');
    resetCanvas(255);

    const result = await readConfigBoxes(image, cfg, {
      candidates: {
        titles: ['Song Title'],
        difficulties: ['EXPERT'],
        ranks: ['S', 'A'],
      },
      onStep: () => {},
    });

    expect(result.missing).toEqual([]);
    const byLabel = (label: string) => result.fields.find((f) => f.label === label);
    expect(byLabel('Title')).toMatchObject({ value: 'Song Title', raw: 'SONG TITLE', guessedFrom: 'SONG TITLE' });
    expect(byLabel('Score')).toMatchObject({ value: '12345', raw: '0012345', ok: true });
    expect(byLabel('Difficulty')).toMatchObject({ value: 'EXPERT', guessedFrom: 'Expert' });
    expect(byLabel('Level')).toMatchObject({ value: '14' });
    expect(byLabel('Level')).not.toHaveProperty('guessedFrom');
    expect(byLabel('Rank')).toMatchObject({ value: 'S', guessedFrom: '5' });
    expect(byLabel('Perfect')).toMatchObject({ value: '10', ok: true });
    expect(byLabel('Fast')).toMatchObject({ value: '42', ok: true });
    expect(byLabel('Full Combo')).toMatchObject({ value: 'Detected', ok: true });

    expect(result.details).toEqual([
      { key: 'perfect', value: '10', category: 'Judgment' },
      { key: 'fast', value: '42', category: 'Metric' },
      { key: 'fullCombo', value: 'true', category: 'Misc' },
    ]);
    expect(result.numVals).toEqual({ perfect: 10 });
    expect(result.generic).toEqual({
      title: 'Song Title',
      totalScore: 12345,
      difficultyName: 'EXPERT',
      difficultyVal: '14',
      difficultySortValue: 14.5,
      playRank: 'S',
      maxCombo: 500,
      accuracy: 98.5,
    });
  });

  it('reports unreadable required boxes and falls back safely', async () => {
    ocrTextMock.mockResolvedValue('');
    ocrCanvasMock.mockResolvedValue('');

    const result = await readConfigBoxes(image, cfg);

    expect(result.missing).toEqual([
      'Title',
      'Score',
      'Difficulty',
      'Level',
      'Rank',
      'Perfect',
      'Fast',
      'Combo',
      'Accuracy',
    ]);
    expect(result.generic.title).toBe('Untitled');
    expect(result.generic.totalScore).toBe(0);
    expect(result.generic.difficultyName).toBe('Unknown');
    expect(result.generic.difficultyVal).toBe('');
    expect(result.generic.playRank).toBe('');
    expect(result.generic.maxCombo).toBe(0);
    expect(result.generic.accuracy).toBe(0);
  });

  it('uses the weighted fallbacks when combo/accuracy boxes are absent', async () => {
    const fallbackCfg: GameConfigData = {
      gameName: 'Fallbacks',
      judgments: [
        { key: 'perfect', label: 'Perfect', type: 'number', weight: 1, ocrRect: rect },
        { key: 'good', label: 'Good', type: 'number', weight: 0.5, ocrRect: rect },
        { key: 'miss', label: 'Miss', type: 'number', weight: 0, isMiss: true, ocrRect: rect },
      ],
      titleRect: rect,
    };
    ocrTextMock.mockResolvedValueOnce('Title');
    ocrCanvasMock.mockResolvedValueOnce('10').mockResolvedValueOnce('2').mockResolvedValueOnce('0');

    const result = await readConfigBoxes(image, fallbackCfg);
    expect(result.generic.maxCombo).toBe(12);
    expect(result.generic.accuracy).toBe(((10 + 2 * 0.5) / 12) * 100);
    expect(result.fields.find((f) => f.label === 'Combo')?.value).toBe('12x (from judgments)');
    expect(result.fields.find((f) => f.label === 'Accuracy')?.value).toBe('91.67% (weighted)');
  });

  it('marks boolean fields with no target color as skipped', async () => {
    const boolCfg: GameConfigData = {
      gameName: 'Booleans',
      misc: [
        {
          key: 'fullCombo',
          label: 'Full Combo',
          type: 'boolean',
          ocrRect: rect,
          targetColor: 0xffff0000,
        },
        { key: 'clear', label: 'Clear', type: 'boolean', ocrRect: rect },
      ],
    };
    const result = await readConfigBoxes(image, boolCfg);
    expect(result.details).toEqual([{ key: 'fullCombo', value: 'false', category: 'Misc' }]);
    expect(result.fields.find((f) => f.label === 'Full Combo')?.value).toBe('Not detected');
    expect(result.fields.find((f) => f.label === 'Clear')?.value).toBe('no target color — skipped');
  });

  it('routes boxes through Paddle when the engine is selected', async () => {
    const paddleCfg: GameConfigData = {
      gameName: 'Paddle',
      titleRect: rect,
      scoreRect: rect,
      judgments: [{ key: 'perfect', label: 'Perfect', type: 'number', ocrRect: rect }],
    };
    ocrPaddleMock.mockImplementation(async (_canvas, opts) => ({
      text: opts?.kind === 'text' ? 'Paddle Title' : '0042',
      confidence: 90,
    }));

    const result = await readConfigBoxes(image, paddleCfg, {
      engine: { type: 'paddle', lang: 'ch' },
    });

    expect(ocrCanvasMock).not.toHaveBeenCalled();
    expect(ocrTextMock).not.toHaveBeenCalled();
    expect(ocrPaddleMock).toHaveBeenCalledTimes(3);
    expect(result.generic.title).toBe('Paddle Title');
    expect(result.generic.totalScore).toBe(42);
    expect(result.generic.maxCombo).toBe(42);
  });
});

describe('match candidates', () => {
  it('returns distinct known titles, difficulties, and ranks plus generic ranks', async () => {
    const configId = await upsertConfig('Bench', '{"gameName":"Bench"}', 1);
    const base = {
      difficultyName: 'Expert',
      difficultyVal: '14',
      difficultySortValue: 14,
      totalScore: 1,
      maxCombo: 1,
      accuracy: 1,
      playTimestamp: 1,
      details: [],
    };
    await saveFullScore({ ...base, configId, songTitle: 'Song A', playRank: 'S' });
    await saveFullScore({
      ...base,
      configId,
      songTitle: 'Song A',
      difficultyName: 'Expert',
      playRank: 'S',
      playTimestamp: 2,
    });
    await saveFullScore({
      ...base,
      configId,
      songTitle: 'Song B',
      difficultyName: 'Hard',
      playRank: 'A',
      playTimestamp: 3,
    });

    const candidates = await getMatchCandidates(configId);
    expect(candidates.titles).toEqual(['Song A', 'Song B']);
    expect(candidates.difficulties).toEqual(['Expert', 'Hard']);
    expect(candidates.ranks.slice(0, 2)).toEqual(['S', 'A']);
    expect(candidates.ranks).toContain('SSS+');
  });
});

describe('image loading', () => {
  it('resolves after load and revokes the object URL', async () => {
    const create = vi.fn(() => 'blob:image');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal('Image', FakeImage);

    const img = await loadImage({} as File);
    expect(img).toBeInstanceOf(FakeImage);
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:image');

    vi.unstubAllGlobals();
  });

  it('rejects when the image fails to load and revokes the object URL', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:bad', revokeObjectURL: revoke });
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;
      set src(_value: string) {
        this.onerror?.(new Error('decode failed'));
      }
    }
    vi.stubGlobal('Image', FailingImage);

    await expect(loadImage({} as File)).rejects.toThrow('decode failed');
    expect(revoke).toHaveBeenCalledWith('blob:bad');
    vi.unstubAllGlobals();
  });
});
