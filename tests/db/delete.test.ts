import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  UNLINKED_CONFIG_ID,
  countScoresForConfig,
  db,
  fullScores,
  importFromJson,
  listConfigs,
  listDeletedConfigs,
  restoreConfig,
  saveFullScore,
  softDeleteConfig,
  upsertConfig,
} from '../../src/lib/db/dexie.ts';

function configData(gameName: string, marker = 1): string {
  return JSON.stringify({ gameName, marker });
}

let clock = 1_760_000_000_000;

function scoreFor(configId: number, title: string) {
  clock += 1_000;
  return {
    configId,
    songTitle: title,
    difficultyName: 'Expert',
    difficultyVal: '14',
    difficultySortValue: 14,
    totalScore: 1_000_000,
    maxCombo: 500,
    accuracy: 99,
    playRank: 'S',
    playTimestamp: clock,
    details: [{ key: 'perfect', value: '500', category: 'Judgment' }],
  };
}

async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

async function seedTwoGames(): Promise<{ a: number; b: number }> {
  const a = await upsertConfig('Game A', configData('Game A'), 1);
  const b = await upsertConfig('Game B', configData('Game B'), 1);
  for (let i = 0; i < 5; i++) await saveFullScore(scoreFor(a, `A Song ${i}`));
  for (let i = 0; i < 2; i++) await saveFullScore(scoreFor(b, `B Song ${i}`));
  return { a, b };
}

beforeEach(async () => {
  await resetDb();
});

describe('P-02 delete impact', () => {
  it('counts only the scores linked to the selected config', async () => {
    const { a, b } = await seedTwoGames();
    expect(await countScoresForConfig(a)).toBe(5);
    expect(await countScoresForConfig(b)).toBe(2);
    expect(await countScoresForConfig(999)).toBe(0);
    expect(await countScoresForConfig(UNLINKED_CONFIG_ID)).toBe(0);
  });
});

describe('P-02 confirmed delete', () => {
  it('unlinks every score to the sentinel and hides the config', async () => {
    const { a, b } = await seedTwoGames();

    const aScoreIds = (await db.generic_scores.where('configId').equals(a).primaryKeys()) as number[];
    expect(await softDeleteConfig(a)).toBe(5);

    expect(await countScoresForConfig(UNLINKED_CONFIG_ID)).toBe(5);
    expect(await countScoresForConfig(a)).toBe(0);
    expect(await countScoresForConfig(b)).toBe(2);

    expect((await listConfigs()).map((c) => c.gameName)).toEqual(['Game B']);
    const deleted = await listDeletedConfigs();
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ id: a, gameName: 'Game A' });
    expect(deleted[0].deletedAt).toBeGreaterThan(0);
    expect(deleted[0].deletedScoreIds).toHaveLength(5);
    expect([...(deleted[0].deletedScoreIds ?? [])].sort()).toEqual([...aScoreIds].sort());

    // Unlinked rows stay visible as "Unknown" until the delete is undone.
    const full = await fullScores();
    expect(full).toHaveLength(7);
    expect(full.filter((f) => f.gameName === 'Unknown')).toHaveLength(5);
    expect(full.filter((f) => f.score.songTitle.startsWith('B '))).toHaveLength(2);
  });

  it('is idempotent for an already-deleted or unknown config', async () => {
    const { a } = await seedTwoGames();
    expect(await softDeleteConfig(a)).toBe(5);
    expect(await softDeleteConfig(a)).toBe(0);
    expect(await softDeleteConfig(999)).toBe(0);
    expect(await countScoresForConfig(UNLINKED_CONFIG_ID)).toBe(5);
  });
});

describe('P-02 undo', () => {
  it('restores the config and relinks every score without touching other games', async () => {
    const { a, b } = await seedTwoGames();
    await softDeleteConfig(a);

    expect(await restoreConfig(a)).toBe(5);

    expect(await countScoresForConfig(UNLINKED_CONFIG_ID)).toBe(0);
    expect(await countScoresForConfig(a)).toBe(5);
    expect(await countScoresForConfig(b)).toBe(2);

    expect((await listConfigs()).map((c) => c.gameName).sort()).toEqual(['Game A', 'Game B']);
    expect(await listDeletedConfigs()).toEqual([]);
    const restored = (await listConfigs()).find((c) => c.id === a);
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.deletedScoreIds).toEqual([]);

    const full = await fullScores();
    expect(full.filter((f) => f.gameName === 'Game A')).toHaveLength(5);
    expect(full.filter((f) => f.gameName === 'Unknown')).toHaveLength(0);
  });

  it('is a no-op for an active or unknown config', async () => {
    const { a } = await seedTwoGames();
    expect(await restoreConfig(a)).toBe(0);
    expect(await restoreConfig(999)).toBe(0);
    expect(await countScoresForConfig(a)).toBe(5);
  });

  it('survives a reload because the soft-delete state is stored in IndexedDB', async () => {
    const { a } = await seedTwoGames();
    await softDeleteConfig(a);

    db.close();
    await db.open();

    expect((await listConfigs()).map((c) => c.gameName)).toEqual(['Game B']);
    expect(await countScoresForConfig(UNLINKED_CONFIG_ID)).toBe(5);
    expect(await restoreConfig(a)).toBe(5);
    expect(await countScoresForConfig(a)).toBe(5);
  });
});

describe('P-02 recovery by re-adding the config', () => {
  it('reactivates a deleted config and relinks its scores', async () => {
    const a = await upsertConfig('Game A', configData('Game A'), 1);
    for (let i = 0; i < 3; i++) await saveFullScore(scoreFor(a, `A Song ${i}`));
    await softDeleteConfig(a);

    const reactivated = await upsertConfig('Game A', configData('Game A', 2), 2);

    expect(reactivated).toBe(a);
    expect(await countScoresForConfig(UNLINKED_CONFIG_ID)).toBe(0);
    expect(await countScoresForConfig(a)).toBe(3);
    expect(await listDeletedConfigs()).toEqual([]);
    const row = (await listConfigs())[0];
    expect(row.configVersion).toBe(2);
    expect(JSON.parse(row.configData).marker).toBe(2);
    expect(row.deletedAt).toBeNull();
    expect(row.deletedScoreIds).toEqual([]);
  });
});

describe('P-02 interaction with legacy import', () => {
  it('skips scores for a soft-deleted config instead of linking them to the hidden row', async () => {
    const a = await upsertConfig('Game A', configData('Game A'), 1);
    await saveFullScore(scoreFor(a, 'Hidden Song'));
    await softDeleteConfig(a);

    const legacy = JSON.stringify({
      exportTimestamp: Date.now(),
      scores: [
        {
          gameName: 'Game A',
          genericScore: { songTitle: 'Imported While Deleted' },
          details: [],
        },
      ],
    });
    const report = await importFromJson(legacy);

    expect(report).toEqual({
      imported: 0,
      skipped: 1,
      skippedGames: ['Game A'],
      duplicates: 0,
      configsImported: 0,
    });
    expect(await db.generic_scores.count()).toBe(1);
    expect(await countScoresForConfig(UNLINKED_CONFIG_ID)).toBe(1);
    expect(await countScoresForConfig(a)).toBe(0);
  });
});
