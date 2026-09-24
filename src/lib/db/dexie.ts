// Dexie.js port of Android Room `ScoreDatabase`.
// Tables + indexes intentionally mirror Room so Android JSON/CSV exports stay importable.
import Dexie, { type Table } from 'dexie';
import { finiteOr } from '../numbers.ts';

export interface GameConfigRow {
  id?: number;
  gameName: string;
  configData: string; // raw GameConfigData JSON (same as Room)
  configVersion: number;
  displayIconName?: string | null;
  /** Game logo image (downscaled PNG blob). Unindexed: no migration needed. */
  displayIcon?: Blob | null;
}

export interface ScoreRow {
  id?: number;
  configId: number;
  songTitle: string;
  difficultyName: string;
  difficultyVal: string;
  difficultySortValue: number;
  totalScore: number;
  maxCombo: number;
  accuracy: number;
  playRank: string;
  playTimestamp: number;
  importTimestamp: number;
}

export interface ScoreDetailRow {
  detailId?: number;
  scoreId: number;
  key: string;
  value: string;
  category: string;
}

export interface FullScore {
  score: ScoreRow;
  details: ScoreDetailRow[];
  gameName: string;
}

export class RitsuDB extends Dexie {
  game_configs!: Table<GameConfigRow, number>;
  generic_scores!: Table<ScoreRow, number>;
  score_details!: Table<ScoreDetailRow, number>;

  constructor() {
    super('RitsuDatabase');
    this.version(1).stores({
      game_configs: '++id, &gameName',
      generic_scores: '++id, configId, songTitle, playTimestamp, importTimestamp, [configId+songTitle+difficultyName+difficultyVal]',
      score_details: '++detailId, scoreId, key',
    });
  }
}

export const db = new RitsuDB();

// ---- repositories (port of ScoreRepository / ConfigManager / DataManager) ----

export async function listConfigs(): Promise<GameConfigRow[]> {
  return db.game_configs.toArray();
}

export async function upsertConfig(gameName: string, configData: string, version: number): Promise<number> {
  const existing = await db.game_configs.where('gameName').equals(gameName).first();
  if (!existing) return db.game_configs.add({ gameName, configData, configVersion: version });
  if (version > existing.configVersion) {
    await db.game_configs.update(existing.id!, { configData, configVersion: version });
  }
  return existing.id!;
}

export async function saveFullScore(
  input: Omit<ScoreRow, 'id' | 'importTimestamp'> & { details: Array<Omit<ScoreDetailRow, 'detailId' | 'scoreId'>> },
): Promise<number> {
  return db.transaction('rw', db.generic_scores, db.score_details, async () => {
    // Coerce numerics: a single NaN row used to poison whole graph polylines.
    const id = await db.generic_scores.add({
      ...input,
      difficultySortValue: finiteOr(input.difficultySortValue),
      totalScore: finiteOr(input.totalScore),
      maxCombo: finiteOr(input.maxCombo),
      accuracy: finiteOr(input.accuracy),
      playTimestamp: finiteOr(input.playTimestamp, Date.now()),
      importTimestamp: Date.now(),
    });
    if (input.details.length > 0) {
      await db.score_details.bulkAdd(input.details.map((d) => ({ ...d, scoreId: id })));
    }
    return id;
  });
}

export async function fullScores(): Promise<FullScore[]> {
  const [scores, details, configs] = await Promise.all([
    db.generic_scores.orderBy('playTimestamp').reverse().toArray(),
    db.score_details.toArray(),
    db.game_configs.toArray(),
  ]);
  const gameById = new Map(configs.map((c) => [c.id, c.gameName]));
  const detailsByScore = new Map<number, ScoreDetailRow[]>();
  for (const d of details) {
    const arr = detailsByScore.get(d.scoreId) ?? [];
    arr.push(d);
    detailsByScore.set(d.scoreId, arr);
  }
  return scores.map((score) => ({
    score,
    details: detailsByScore.get(score.id!) ?? [],
    gameName: gameById.get(score.configId) ?? 'Unknown',
  }));
}

export async function deleteScore(id: number): Promise<void> {
  await db.transaction('rw', db.generic_scores, db.score_details, async () => {
    await db.score_details.where('scoreId').equals(id).delete();
    await db.generic_scores.delete(id);
  });
}

/** Replace a score's columns + details (edit flow). Empty details omit those rows. */
export async function updateFullScore(
  id: number,
  patch: Partial<Omit<ScoreRow, 'id' | 'configId' | 'importTimestamp'>>,
  details: Array<Omit<ScoreDetailRow, 'detailId' | 'scoreId'>>,
): Promise<void> {
  const numericKeys = ['difficultySortValue', 'totalScore', 'maxCombo', 'accuracy', 'playTimestamp'] as const;
  const clean: Record<string, unknown> = { ...patch };
  for (const k of numericKeys) {
    if (k in clean) clean[k] = finiteOr(clean[k], k === 'playTimestamp' ? Date.now() : 0);
  }
  await db.transaction('rw', db.generic_scores, db.score_details, async () => {
    await db.generic_scores.update(id, clean);
    await db.score_details.where('scoreId').equals(id).delete();
    if (details.length > 0) {
      await db.score_details.bulkAdd(details.map((d) => ({ ...d, scoreId: id })));
    }
  });
}

/** Scan stored scores for non-finite numerics / non-string text and fix them in place. */
export async function repairScores(): Promise<{ checked: number; fixed: number; notes: string[] }> {
  const scores = await db.generic_scores.toArray();
  let fixed = 0;
  const notes: string[] = [];
  for (const s of scores) {
    const patch: Record<string, unknown> = {};
    const problems: string[] = [];
    const fixNum = (key: 'totalScore' | 'maxCombo' | 'accuracy' | 'difficultySortValue' | 'playTimestamp' | 'importTimestamp', fallback: number) => {
      const v = (s as unknown as Record<string, unknown>)[key];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        patch[key] = fallback;
        problems.push(key);
      }
    };
    fixNum('totalScore', 0);
    fixNum('maxCombo', 0);
    fixNum('accuracy', 0);
    fixNum('difficultySortValue', 0);
    fixNum(
      'playTimestamp',
      typeof s.importTimestamp === 'number' && Number.isFinite(s.importTimestamp) ? s.importTimestamp : Date.now(),
    );
    fixNum('importTimestamp', Date.now());
    const fixText = (key: 'songTitle' | 'difficultyName' | 'difficultyVal' | 'playRank', fallback: string) => {
      if (typeof s[key] !== 'string') {
        patch[key] = fallback;
        problems.push(key);
      }
    };
    fixText('songTitle', 'Unknown');
    fixText('difficultyName', 'Unknown');
    fixText('difficultyVal', '');
    fixText('playRank', '');
    if (problems.length > 0 && s.id != null) {
      await db.generic_scores.update(s.id, patch);
      fixed++;
      if (notes.length < 5) notes.push(`#${s.id} (${s.songTitle ?? '?' }): fixed ${problems.join(', ')}`);
    }
  }
  return { checked: scores.length, fixed, notes };
}

/** Store (or clear with null) a game's logo image. */
export async function setGameIcon(configId: number, icon: Blob | null): Promise<void> {
  await db.game_configs.update(configId, { displayIcon: icon });
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.generic_scores, db.score_details, async () => {
    await db.score_details.clear();
    await db.generic_scores.clear();
  });
}

// ---- JSON / CSV export-import (byte-compatible with Android DataManager) ----

/** Android ExportData shape (nested). Legacy web exports used a flat shape — import accepts both. */
export interface ExportPayload {
  exportTimestamp: number;
  scores: Array<{
    genericScore: {
      songTitle: string;
      difficultyName: string;
      difficultyVal: string;
      difficultySortValue: number;
      totalScore: number;
      maxCombo: number;
      accuracy: number;
      playRank: string;
      playTimestamp: number;
      importTimestamp: number;
    };
    details: Array<{ key: string; value: string; category: string }>;
    gameName: string;
  }>;
}

export async function exportToJson(): Promise<string> {
  const full = await fullScores();
  const payload: ExportPayload = {
    exportTimestamp: Date.now(),
    scores: full.map((f) => ({
      genericScore: {
        songTitle: f.score.songTitle,
        difficultyName: f.score.difficultyName,
        difficultyVal: f.score.difficultyVal,
        difficultySortValue: f.score.difficultySortValue,
        totalScore: f.score.totalScore,
        maxCombo: f.score.maxCombo,
        accuracy: f.score.accuracy,
        playRank: f.score.playRank,
        playTimestamp: f.score.playTimestamp,
        importTimestamp: f.score.importTimestamp,
      },
      details: f.details.map((d) => ({ key: d.key, value: d.value, category: d.category })),
      gameName: f.gameName,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportReport {
  imported: number;
  skipped: number;
  skippedGames: string[];
}

/** Android parity: scores whose game has no local config are SKIPPED (never stub-created). */
export async function importFromJson(json: string): Promise<ImportReport> {
  const raw = JSON.parse(json) as Partial<ExportPayload> & {
    timestamp?: number;
    scores?: Array<Record<string, unknown>>;
  };
  const list = Array.isArray(raw.scores) ? raw.scores : null;
  if (!list) throw new Error('Invalid Ritsu JSON export');
  const configs = await db.game_configs.toArray();
  const idByGame = new Map(configs.map((c) => [c.gameName, c.id!]));
  let imported = 0;
  const skippedGames = new Set<string>();
  for (const s of list) {
    // Android nested shape, or legacy flat web shape.
    const nested = s as unknown as ExportPayload['scores'][number];
    const flat = s as unknown as ScoreRow & { details?: ScoreDetailRow[]; gameName?: string };
    const gameName = (nested.gameName ?? flat.gameName ?? '') as string;
    const g = (nested.genericScore ?? flat) as ExportPayload['scores'][number]['genericScore'];
    const configId = idByGame.get(gameName);
    if (configId == null) {
      if (gameName) skippedGames.add(gameName);
      continue;
    }
    const details = (nested.details ?? flat.details ?? []) as Array<{ key: string; value: string; category: string }>;
    await saveFullScore({
      configId,
      songTitle: String(g.songTitle ?? 'Unknown'),
      difficultyName: String(g.difficultyName ?? 'Unknown'),
      difficultyVal: String(g.difficultyVal ?? ''),
      difficultySortValue: Number(g.difficultySortValue) || 0,
      totalScore: Number(g.totalScore) || 0,
      maxCombo: Number(g.maxCombo) || 0,
      accuracy: Number(g.accuracy) || 0,
      playRank: String(g.playRank ?? ''),
      playTimestamp: Number(g.playTimestamp) || Date.now(),
      details: details.map((d) => ({ key: String(d.key), value: String(d.value), category: String(d.category) })),
    });
    imported++;
  }
  return { imported, skipped: skippedGames.size, skippedGames: [...skippedGames] };
}

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

/** Android CsvData parity: local `yyyy-MM-dd HH:mm:ss`, `Accuracy%`, `key: value; …`, all cells quoted. */
function csvDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function exportToCsv(): Promise<string> {
  const full = await fullScores();
  const header = 'Game,Date,Song,Difficulty,Level,Score,Combo,Accuracy,Rank,Details';
  const lines = full.map((f) =>
    [
      f.gameName,
      csvDate(f.score.playTimestamp),
      f.score.songTitle,
      f.score.difficultyName,
      f.score.difficultyVal,
      f.score.totalScore,
      f.score.maxCombo,
      `${f.score.accuracy}%`,
      f.score.playRank,
      f.details.map((d) => `${d.key}: ${d.value}`).join('; '),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export function downloadFile(name: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
