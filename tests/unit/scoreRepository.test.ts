import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { db, readScoreSnapshot, type ScoreRow } from '../../src/lib/db/dexie.ts';
import { getScoreSnapshot, resetScoreCache, subscribeScoreCache } from '../../src/lib/db/scoreCache.ts';

const N = 10_000;

function scoreAt(i: number): ScoreRow {
  return {
    id: i + 1,
    configId: 1,
    songTitle: `Song ${i % 500}`,
    difficultyName: ['Easy', 'Normal', 'Hard', 'Expert'][i % 4],
    difficultyVal: String((i % 15) + 1),
    difficultySortValue: (i % 15) + 1,
    totalScore: 900_000 + (i % 100_000),
    maxCombo: 500 + (i % 500),
    accuracy: 80 + (i % 2000) / 100,
    playRank: ['S', 'A', 'B', 'C'][i % 4],
    playTimestamp: 1_760_000_000_000 - i * 60_000,
    importTimestamp: 1_760_000_000_000 - i * 60_000,
  };
}

async function resetDb(): Promise<void> {
  resetScoreCache();
  await db.delete();
  await db.open();
  await db.game_configs.add({
    id: 1,
    gameName: 'Bench Game',
    configData: JSON.stringify({ gameName: 'Bench Game', configVersion: 1 }),
    configVersion: 1,
  });
}

async function seed(count: number): Promise<void> {
  await db.generic_scores.bulkAdd(Array.from({ length: count }, (_, i) => scoreAt(i)));
  await db.score_details.bulkAdd(
    Array.from({ length: count }, (_, i) => ({
      scoreId: i + 1,
      key: 'perfect',
      value: String(900 + (i % 100)),
      category: 'Judgment',
    })),
  );
}

function countReads(): { stop: () => number } {
  let reads = 0;
  const names = ['getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'get'] as const;
  const patches: Array<() => void> = [];
  for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
    const originals = names.map((name) => proto[name]);
    for (const name of names) {
      const original = proto[name];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (proto as any)[name] = function (...args: unknown[]) {
        reads++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any).apply(this, args);
      };
    }
    patches.push(() => {
      names.forEach((name, index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (proto as any)[name] = originals[index];
      });
    });
  }
  return {
    stop: () => {
      for (const restore of patches) restore();
      return reads;
    },
  };
}

describe('P-08 score snapshot', () => {
  beforeEach(resetDb);

  it('loads 10,000 scores once and joins details + game names', async () => {
    await seed(N);
    const counter = countReads();
    const start = performance.now();
    const snapshot = await readScoreSnapshot();
    const ms = performance.now() - start;
    const reads = counter.stop();
    console.log(
      `P-08 readScoreSnapshot(): ${snapshot.scores.length} scores in ${ms.toFixed(1)} ms, ${reads} IDB reads`,
    );

    expect(snapshot.scores).toHaveLength(N);
    expect(reads).toBe(3); // one read per table, inside one transaction
    expect(snapshot.scores[0].details).toHaveLength(1);
    expect(snapshot.scores[0].gameName).toBe('Bench Game');
    expect(snapshot.configs).toHaveLength(1);
  }, 120_000);

  it('serves two subscribers from one shared live load and refreshes on writes', async () => {
    await seed(2);
    const seen: Array<number | undefined> = [];
    const unsubscribeA = subscribeScoreCache(() => seen.push(getScoreSnapshot()?.scores.length));
    const unsubscribeB = subscribeScoreCache(() => seen.push(getScoreSnapshot()?.scores.length));

    await vi.waitFor(() => expect(getScoreSnapshot()?.scores).toHaveLength(2));
    await db.generic_scores.add(scoreAt(2));
    await vi.waitFor(() => expect(getScoreSnapshot()?.scores).toHaveLength(3));

    unsubscribeA();
    unsubscribeB();
    resetScoreCache();
    expect(seen).toContain(3);
  }, 30_000);

  it('keeps scores whose config no longer resolves tied to the Unknown fallback', async () => {
    await seed(1);
    await db.generic_scores.add({ ...scoreAt(1), id: 2, configId: 999 });
    const snapshot = await readScoreSnapshot();
    const unlinked = snapshot.scores.find((row) => row.score.id === 2);
    expect(unlinked?.gameName).toBe('Unknown');
    expect(unlinked?.details).toEqual([]);
  }, 30_000);
});
