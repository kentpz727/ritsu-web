import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, exportToJson, importFromJson, saveFullScore, upsertConfig } from '../../src/lib/db/dexie.ts';

const CONFIG = {
  gameName: 'Dedupe Game',
  configVersion: 1,
  judgments: [{ key: 'perfect', label: 'Perfect', weight: 1 }],
  metrics: [{ key: 'score', label: 'Score' }],
};

function scoreFor(i: number) {
  return {
    configId: 1,
    songTitle: `Song ${i}`,
    difficultyName: i % 2 === 0 ? 'Expert' : 'Hard',
    difficultyVal: String(10 + i),
    difficultySortValue: 10 + i,
    totalScore: 900_000 + i,
    maxCombo: 100 + i,
    accuracy: 95 + i / 10,
    playRank: 'S',
    playTimestamp: 1_760_000_000_000 + i * 1_000,
    details: [{ key: 'perfect', value: String(100 + i), category: 'Judgment' }],
  };
}

async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await resetDb();
});

describe('P-09 duplicate score detection', () => {
  it('saves an identical play once and reports the duplicate', async () => {
    const first = await saveFullScore(scoreFor(0));
    const second = await saveFullScore(scoreFor(0));

    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(await db.generic_scores.count()).toBe(1);
    expect(await db.score_details.count()).toBe(1);
  });

  it('keeps two plays of the same song recorded at different times', async () => {
    const first = await saveFullScore(scoreFor(0));
    const second = await saveFullScore({ ...scoreFor(0), playTimestamp: scoreFor(0).playTimestamp + 60_000 });

    expect(second.duplicate).toBe(false);
    expect(second.id).not.toBe(first.id);
    expect(await db.generic_scores.count()).toBe(2);
  });

  it('scopes the key to the game config', async () => {
    const first = await saveFullScore({ ...scoreFor(0), configId: 1 });
    const second = await saveFullScore({ ...scoreFor(0), configId: 2 });

    expect(second.duplicate).toBe(false);
    expect(await db.generic_scores.count()).toBe(2);
    expect(first.id).not.toBe(second.id);
  });

  it('re-importing the same 10-score backup twice leaves 10 rows and reports duplicates=10', async () => {
    await upsertConfig(CONFIG.gameName, JSON.stringify(CONFIG), 1);
    for (let i = 0; i < 10; i++) await saveFullScore(scoreFor(i));
    const exported = await exportToJson();

    await resetDb();
    const first = await importFromJson(exported);
    expect(first).toMatchObject({ imported: 10, duplicates: 0, skipped: 0 });
    expect(await db.generic_scores.count()).toBe(10);

    const second = await importFromJson(exported);
    expect(second).toMatchObject({ imported: 0, duplicates: 10, skipped: 0, configsImported: 1 });
    expect(await db.generic_scores.count()).toBe(10);
    expect(await db.score_details.count()).toBe(10);
  });
});
