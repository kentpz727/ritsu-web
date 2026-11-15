import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import golden from './golden.json';
import { db, exportToJson, fullScores, importFromJson, saveFullScore, upsertConfig } from '../../src/lib/db/dexie.ts';

const CONFIG = JSON.stringify({
  gameName: 'Golden Game',
  configVersion: 1,
  judgments: [{ key: 'perfect', label: 'Perfect', weight: 1 }],
  metrics: [],
  misc: [],
});

const SCORE = {
  songTitle: 'Golden Song',
  difficultyName: 'Expert',
  difficultyVal: '14',
  difficultySortValue: 14,
  totalScore: 1_000_000,
  maxCombo: 500,
  accuracy: 98.5,
  playRank: 'S',
  playTimestamp: 1_760_000_000_000,
  details: [{ key: 'perfect', value: '100', category: 'Judgment' }],
};

async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await resetDb();
});

describe('golden characterization: persistence and backup', () => {
  it('saveFullScore coerces non-finite numerics and writes detail rows', async () => {
    const { id } = await saveFullScore({
      ...SCORE,
      configId: 1,
      difficultySortValue: Number.NaN,
      totalScore: Number.POSITIVE_INFINITY,
      accuracy: Number.NaN,
      playTimestamp: Number.NaN,
    });
    const row = await db.generic_scores.get(id);
    expect(row).toMatchObject({
      difficultySortValue: 0,
      totalScore: 0,
      accuracy: 0,
      maxCombo: 500,
    });
    expect(row?.playTimestamp).toBeGreaterThan(0);
    expect(await db.score_details.where('scoreId').equals(id).count()).toBe(1);
  });

  it('export payload carries the game configs with the scores (P-01 fixed)', async () => {
    const configId = await upsertConfig('Golden Game', CONFIG, 1);
    await saveFullScore({ ...SCORE, configId });
    const payload = JSON.parse(await exportToJson()) as {
      schemaVersion?: number;
      scores: unknown[];
      gameConfigs?: Array<{ gameName: string; configVersion: number }>;
    };
    expect(payload.scores).toHaveLength(golden.db.exportScores);
    expect(Object.hasOwn(payload, 'gameConfigs')).toBe(golden.db.hasGameConfigs);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.gameConfigs).toHaveLength(golden.db.exportedConfigs);
    expect(payload.gameConfigs?.[0]).toMatchObject({ gameName: 'Golden Game', configVersion: 1 });
  });

  it('import into a fresh profile restores the config and every score', async () => {
    const configId = await upsertConfig('Golden Game', CONFIG, 1);
    await saveFullScore({ ...SCORE, configId });
    const json = await exportToJson();

    await resetDb();
    const report = await importFromJson(json);

    expect(report).toEqual(golden.db.importIntoFresh);
    expect(await db.generic_scores.count()).toBe(1);
    expect(await db.game_configs.count()).toBe(1);
    const full = await fullScores();
    expect(full[0].score.songTitle).toBe('Golden Song');
    expect(full[0].gameName).toBe('Golden Game');
    expect(full[0].details).toHaveLength(1);
  });

  it('P-09: re-importing the same payload is idempotent', async () => {
    const configId = await upsertConfig('Golden Game', CONFIG, 1);
    await saveFullScore({ ...SCORE, configId });
    const json = await exportToJson();

    expect(await importFromJson(json)).toMatchObject({ imported: 0, duplicates: 1 });
    expect(await importFromJson(json)).toMatchObject({ imported: 0, duplicates: 1 });
    expect(await db.generic_scores.count()).toBe(golden.db.duplicateImportTotal);
  });

  it('imports the legacy flat shape when the config exists', async () => {
    await upsertConfig('Golden Game', CONFIG, 1);
    const legacy = JSON.stringify({
      scores: [
        {
          gameName: 'Golden Game',
          songTitle: 'Legacy Song',
          difficultyName: 'Hard',
          difficultyVal: '10',
          difficultySortValue: 10,
          totalScore: 123,
          maxCombo: 50,
          accuracy: 99,
          playRank: 'S',
          playTimestamp: 1_760_000_000_000,
          importTimestamp: 1_760_000_000_001,
          details: [{ key: 'perfect', value: '10', category: 'Judgment' }],
        },
      ],
    });
    const report = await importFromJson(legacy);
    expect(report).toEqual({ imported: 1, skipped: 0, skippedGames: [], duplicates: 0, configsImported: 0 });
    const full = await fullScores();
    expect(full[0].score.songTitle).toBe('Legacy Song');
    expect(full[0].details).toHaveLength(1);
  });
});
