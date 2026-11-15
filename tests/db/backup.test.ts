import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  exportToJson,
  fullScores,
  importFromJson,
  listConfigs,
  saveFullScore,
  upsertConfig,
} from '../../src/lib/db/dexie.ts';
import { parseGameConfig } from '../../src/lib/config/types.ts';

const CONFIG_A = {
  gameName: 'Game A',
  configVersion: 3,
  judgments: [
    { key: 'perfect', label: 'Perfect', weight: 1 },
    { key: 'miss', label: 'Miss', weight: 0, isMiss: true },
  ],
  metrics: [{ key: 'fast', label: 'Fast' }],
};
const CONFIG_B = {
  gameName: 'Game B',
  configVersion: 2,
  judgments: [{ key: 'great', label: 'Great', weight: 0.5 }],
  misc: [{ key: 'fullCombo', label: 'Full Combo', type: 'boolean' }],
};

function scoreFor(configIndex: number, i: number) {
  const game = configIndex === 0 ? 'Game A' : 'Game B';
  return {
    configId: configIndex + 1,
    songTitle: `${game} Song ${i}`,
    difficultyName: i % 2 === 0 ? 'Expert' : 'Hard',
    difficultyVal: String(10 + i),
    difficultySortValue: 10 + i + (i % 2 === 0 ? 0.5 : 0),
    totalScore: 900_000 + i,
    maxCombo: 100 + i,
    accuracy: 95 + i / 10,
    playRank: i % 2 === 0 ? 'S' : 'A',
    playTimestamp: 1_760_000_000_000 + i * 1_000,
    details: [
      { key: 'perfect', value: String(100 + i), category: 'Judgment' },
      { key: 'fast', value: String(i), category: 'Metric' },
    ],
  };
}

async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await resetDb();
});

describe('P-01 backup/restore round trip', () => {
  it('restores 2 configs and 10 scores into an empty profile with identical field values', async () => {
    const a = await upsertConfig('Game A', JSON.stringify(CONFIG_A), 3);
    const b = await upsertConfig('Game B', JSON.stringify(CONFIG_B), 2);
    for (let i = 0; i < 10; i++) {
      await saveFullScore({ ...scoreFor(i < 5 ? 0 : 1, i), configId: i < 5 ? a : b });
    }

    const exported = JSON.parse(await exportToJson()) as {
      schemaVersion: number;
      gameConfigs: Array<{ gameName: string; configData: string; configVersion: number }>;
      scores: unknown[];
    };
    expect(exported.schemaVersion).toBe(2);
    expect(exported.gameConfigs).toHaveLength(2);
    expect(exported.scores).toHaveLength(10);

    const before = await fullScores();
    await resetDb();
    const report = await importFromJson(JSON.stringify(exported));

    expect(report).toEqual({
      imported: 10,
      skipped: 0,
      skippedGames: [],
      duplicates: 0,
      configsImported: 2,
    });
    expect(await db.game_configs.count()).toBe(2);
    expect(await db.generic_scores.count()).toBe(10);
    expect(await db.score_details.count()).toBe(20);

    const after = await fullScores();
    expect(after).toHaveLength(10);
    for (const original of before) {
      const restored = after.find((f) => f.score.songTitle === original.score.songTitle);
      expect(restored, original.score.songTitle).toBeDefined();
      expect(restored!.gameName).toBe(original.gameName);
      expect(restored!.score).toMatchObject({
        songTitle: original.score.songTitle,
        difficultyName: original.score.difficultyName,
        difficultyVal: original.score.difficultyVal,
        difficultySortValue: original.score.difficultySortValue,
        totalScore: original.score.totalScore,
        maxCombo: original.score.maxCombo,
        accuracy: original.score.accuracy,
        playRank: original.score.playRank,
        playTimestamp: original.score.playTimestamp,
      });
      expect(restored!.details.map((d) => [d.key, d.value, d.category])).toEqual(
        original.details.map((d) => [d.key, d.value, d.category]),
      );
    }

    const configs = await listConfigs();
    const configA = configs.find((c) => c.gameName === 'Game A');
    const configB = configs.find((c) => c.gameName === 'Game B');
    expect(configA?.configVersion).toBe(3);
    expect(configB?.configVersion).toBe(2);
    expect(parseGameConfig(configA!.configData)).toMatchObject(CONFIG_A);
    expect(parseGameConfig(configB!.configData)).toMatchObject(CONFIG_B);
  });

  it('keeps a newer local config while still importing its scores', async () => {
    await upsertConfig('Game A', JSON.stringify({ gameName: 'Game A', marker: 'local' }), 5);
    const payload = {
      schemaVersion: 2,
      exportTimestamp: 1,
      gameConfigs: [
        {
          gameName: 'Game A',
          configData: JSON.stringify({ gameName: 'Game A', marker: 'backup' }),
          configVersion: 1,
        },
      ],
      scores: [
        {
          gameName: 'Game A',
          genericScore: {
            songTitle: 'Imported Song',
            difficultyName: 'Expert',
            difficultyVal: '14',
            difficultySortValue: 14,
            totalScore: 1_000_000,
            maxCombo: 500,
            accuracy: 99,
            playRank: 'S',
            playTimestamp: 1_760_000_000_000,
            importTimestamp: 1_760_000_000_001,
          },
          details: [],
        },
      ],
    };

    const report = await importFromJson(JSON.stringify(payload));

    expect(report).toEqual({ imported: 1, skipped: 0, skippedGames: [], duplicates: 0, configsImported: 1 });
    const configs = await listConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].configVersion).toBe(5);
    expect((parseGameConfig(configs[0].configData) as unknown as { marker?: string }).marker).toBe('local');
    expect(await db.generic_scores.count()).toBe(1);
  });

  it('accepts the Android nested shape and reports games that still lack a config', async () => {
    await upsertConfig('Game A', JSON.stringify(CONFIG_A), 3);
    const payload = {
      exportTimestamp: 1_760_000_000_000,
      scores: [
        {
          gameName: 'Game A',
          genericScore: {
            songTitle: 'Nested Song',
            difficultyName: 'Expert',
            difficultyVal: '14',
            difficultySortValue: 14,
            totalScore: 1_000_000,
            maxCombo: 500,
            accuracy: 99,
            playRank: 'S',
            playTimestamp: 1_760_000_000_000,
            importTimestamp: 1_760_000_000_001,
          },
          details: [{ key: 'perfect', value: '500', category: 'Judgment' }],
        },
        {
          gameName: 'Missing Game',
          genericScore: { songTitle: 'Orphan' },
          details: [],
        },
      ],
    };

    const report = await importFromJson(JSON.stringify(payload));
    expect(report).toEqual({
      imported: 1,
      skipped: 1,
      skippedGames: ['Missing Game'],
      duplicates: 0,
      configsImported: 0,
    });
    const full = await fullScores();
    expect(full).toHaveLength(1);
    expect(full[0].score.songTitle).toBe('Nested Song');
    expect(full[0].details).toHaveLength(1);
  });

  it('ignores malformed gameConfigs entries instead of failing the whole restore', async () => {
    const payload = {
      schemaVersion: 2,
      exportTimestamp: 1,
      gameConfigs: [
        { gameName: 'Good', configData: JSON.stringify({ gameName: 'Good' }), configVersion: 1 },
        { gameName: '', configData: '{}', configVersion: 1 },
        { gameName: 'No Data', configVersion: 1 },
        null,
      ],
      scores: [],
    };
    const report = await importFromJson(JSON.stringify(payload));
    expect(report).toEqual({ imported: 0, skipped: 0, skippedGames: [], duplicates: 0, configsImported: 1 });
    expect((await listConfigs()).map((c) => c.gameName)).toEqual(['Good']);
  });
});
