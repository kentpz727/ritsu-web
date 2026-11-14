import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllData,
  db,
  deleteScore,
  exportToCsv,
  fullScores,
  importFromJson,
  listConfigs,
  repairScores,
  saveFullScore,
  setGameIcon,
  updateFullScore,
  upsertConfig,
} from '../../src/lib/db/dexie.ts';

const CONFIG = JSON.stringify({
  gameName: 'DB Game',
  judgments: [{ key: 'perfect', label: 'Perfect', weight: 1 }],
});

const SCORE = {
  songTitle: 'DB Song',
  difficultyName: 'Expert',
  difficultyVal: '14',
  difficultySortValue: 14,
  totalScore: 1_000_000,
  maxCombo: 500,
  accuracy: 98.5,
  playRank: 'S',
  playTimestamp: new Date(2026, 0, 2, 3, 4, 5).getTime(),
  details: [{ key: 'perfect', value: '100', category: 'Judgment' }],
};

async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await resetDb();
});

describe('config repository', () => {
  it('inserts, upgrades, and ignores older config versions', async () => {
    const id = await upsertConfig('DB Game', CONFIG, 1);
    expect((await listConfigs()).map((c) => c.configVersion)).toEqual([1]);

    const upgraded = await upsertConfig('DB Game', '{"gameName":"DB Game","v":2}', 2);
    expect(upgraded).toBe(id);
    expect((await listConfigs())[0].configVersion).toBe(2);

    const stale = await upsertConfig('DB Game', '{"gameName":"DB Game","v":1}', 1);
    expect(stale).toBe(id);
    expect((await listConfigs())[0].configVersion).toBe(2);
  });

  it('stores and clears a game icon', async () => {
    const id = await upsertConfig('DB Game', CONFIG, 1);
    await setGameIcon(id, new Blob(['icon'], { type: 'image/png' }));
    const row = await db.game_configs.get(id);
    expect(row?.displayIcon?.size).toBe(4);

    await setGameIcon(id, null);
    expect((await db.game_configs.get(id))?.displayIcon).toBeNull();
  });
});

describe('score repository', () => {
  it('lists scores newest-first and labels unknown games', async () => {
    const configId = await upsertConfig('DB Game', CONFIG, 1);
    await saveFullScore({
      ...SCORE,
      configId,
      songTitle: 'Older',
      playTimestamp: 1_000,
    });
    await saveFullScore({
      ...SCORE,
      configId,
      songTitle: 'Newer',
      playTimestamp: 2_000,
    });
    const full = await fullScores();
    expect(full.map((f) => f.score.songTitle)).toEqual(['Newer', 'Older']);
    expect(full[0].gameName).toBe('DB Game');

    const orphanId = await db.generic_scores.add({
      ...SCORE,
      configId: 999,
      playTimestamp: 3_000,
      importTimestamp: 3_000,
    });
    const orphan = (await fullScores()).find((f) => f.score.id === orphanId);
    expect(orphan?.gameName).toBe('Unknown');
    expect(orphan?.details).toEqual([]);
  });

  it('updateFullScore replaces columns and details with numeric coercion', async () => {
    const configId = await upsertConfig('DB Game', CONFIG, 1);
    const id = await saveFullScore({ ...SCORE, configId });

    await updateFullScore(
      id,
      {
        songTitle: 'Edited',
        totalScore: Number.NaN,
        accuracy: Number.POSITIVE_INFINITY,
        playTimestamp: Number.NaN,
      },
      [{ key: 'great', value: '7', category: 'Judgment' }],
    );

    const row = await db.generic_scores.get(id);
    expect(row?.songTitle).toBe('Edited');
    expect(row?.totalScore).toBe(0);
    expect(row?.accuracy).toBe(0);
    expect(row?.playTimestamp).toBeGreaterThan(0);
    const details = await db.score_details.where('scoreId').equals(id).toArray();
    expect(details.map((d) => d.key)).toEqual(['great']);
  });

  it('updateFullScore clears details when given an empty list', async () => {
    const configId = await upsertConfig('DB Game', CONFIG, 1);
    const id = await saveFullScore({ ...SCORE, configId });
    await updateFullScore(id, { songTitle: 'No details' }, []);
    expect(await db.score_details.where('scoreId').equals(id).count()).toBe(0);
  });

  it('deleteScore removes the score and its details only', async () => {
    const configId = await upsertConfig('DB Game', CONFIG, 1);
    const id = await saveFullScore({ ...SCORE, configId });
    const otherId = await saveFullScore({ ...SCORE, configId, songTitle: 'Other' });

    await deleteScore(id);
    expect(await db.generic_scores.get(id)).toBeUndefined();
    expect(await db.score_details.where('scoreId').equals(id).count()).toBe(0);
    expect(await db.generic_scores.get(otherId)).toBeDefined();
    expect(await db.score_details.where('scoreId').equals(otherId).count()).toBe(1);
  });

  it('clearAllData removes scores and details but keeps configs', async () => {
    const configId = await upsertConfig('DB Game', CONFIG, 1);
    await saveFullScore({ ...SCORE, configId });
    await clearAllData();
    expect(await db.generic_scores.count()).toBe(0);
    expect(await db.score_details.count()).toBe(0);
    expect(await db.game_configs.count()).toBe(1);
  });

  it('repairScores fixes non-finite numerics and non-string text in place', async () => {
    const good = await db.generic_scores.add({
      ...SCORE,
      configId: 1,
      playTimestamp: 1_000,
      importTimestamp: 1_000,
    });
    const bad = await db.generic_scores.add({
      ...SCORE,
      configId: 1,
      songTitle: 42 as unknown as string,
      difficultyName: undefined as unknown as string,
      totalScore: Number.NaN,
      maxCombo: Number.POSITIVE_INFINITY,
      accuracy: 'high' as unknown as number,
      difficultySortValue: null as unknown as number,
      playTimestamp: Number.NaN,
      importTimestamp: 1_000,
    });

    const report = await repairScores();
    expect(report.checked).toBe(2);
    expect(report.fixed).toBe(1);
    expect(report.notes).toHaveLength(1);
    expect(report.notes[0]).toContain(`#${bad}`);

    const repaired = await db.generic_scores.get(bad);
    expect(repaired?.songTitle).toBe('Unknown');
    expect(repaired?.difficultyName).toBe('Unknown');
    expect(repaired?.totalScore).toBe(0);
    expect(repaired?.maxCombo).toBe(0);
    expect(repaired?.accuracy).toBe(0);
    expect(repaired?.difficultySortValue).toBe(0);
    expect(repaired?.playTimestamp).toBe(1_000);

    const untouched = await db.generic_scores.get(good);
    expect(untouched?.songTitle).toBe('DB Song');
  });
});

describe('CSV export', () => {
  it('writes the Android-compatible header and quoted rows', async () => {
    const configId = await upsertConfig('DB Game', CONFIG, 1);
    await saveFullScore({
      ...SCORE,
      configId,
      songTitle: 'Song "Quoted"',
      details: [
        { key: 'perfect', value: '100', category: 'Judgment' },
        { key: 'great', value: '5', category: 'Judgment' },
      ],
    });

    const csv = await exportToCsv();
    const [header, row] = csv.split('\n');
    expect(header).toBe('Game,Date,Song,Difficulty,Level,Score,Combo,Accuracy,Rank,Details');
    expect(row).toContain('"DB Game"');
    expect(row).toContain('"2026-01-02 03:04:05"');
    expect(row).toContain('"Song ""Quoted"""');
    expect(row).toContain('"98.5%"');
    expect(row).toContain('"perfect: 100; great: 5"');
  });

  it('emits only the header when there are no scores', async () => {
    expect(await exportToCsv()).toBe('Game,Date,Song,Difficulty,Level,Score,Combo,Accuracy,Rank,Details');
  });
});

describe('JSON import edge cases', () => {
  it('rejects malformed JSON and payloads without a scores array', async () => {
    await expect(importFromJson('{')).rejects.toThrow();
    await expect(importFromJson('{"scores":null}')).rejects.toThrow('Invalid Ritsu JSON export');
    await expect(importFromJson('{"scores":"nope"}')).rejects.toThrow('Invalid Ritsu JSON export');
  });

  it('counts distinct missing games and skips the rest', async () => {
    const json = JSON.stringify({
      scores: [
        { gameName: 'Missing A', genericScore: { songTitle: 'One' } },
        { gameName: 'Missing A', genericScore: { songTitle: 'Two' } },
        { gameName: 'Missing B', genericScore: { songTitle: 'Three' } },
        { genericScore: { songTitle: 'No game' } },
      ],
    });
    const report = await importFromJson(json);
    expect(report).toEqual({
      imported: 0,
      skipped: 2,
      skippedGames: ['Missing A', 'Missing B'],
    });
  });

  it('defaults missing generic fields on import', async () => {
    await upsertConfig('DB Game', CONFIG, 1);
    const report = await importFromJson(JSON.stringify({ scores: [{ gameName: 'DB Game', genericScore: {} }] }));
    expect(report.imported).toBe(1);
    const [full] = await fullScores();
    expect(full.score.songTitle).toBe('Unknown');
    expect(full.score.difficultyName).toBe('Unknown');
    expect(full.score.playTimestamp).toBeGreaterThan(0);
  });
});
