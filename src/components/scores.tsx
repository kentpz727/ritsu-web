import { useLiveQuery } from 'dexie-react-hooks';
import { db, listConfigs, type FullScore } from '../lib/db/dexie.ts';
import { timeAgo, formatPlayTime } from '../lib/calc/dates.ts';
import { GameIcon } from './gameIcon.tsx';
import { hasSlot, isAccuracyEnabled, isRankEnabled, parseGameConfig, type GameConfigData } from '../lib/config/types.ts';
import { logError } from '../lib/errors.ts';

export function useFullScores(): FullScore[] | undefined {
  return useLiveQuery(async () => {
    const [scores, details, configs] = await Promise.all([
      db.generic_scores.orderBy('playTimestamp').reverse().toArray(),
      db.score_details.toArray(),
      listConfigs(),
    ]);
    const gameById = new Map(configs.map((c) => [c.id, c.gameName]));
    const byScore = new Map<number, typeof details>();
    for (const d of details) {
      const arr = byScore.get(d.scoreId) ?? [];
      arr.push(d);
      byScore.set(d.scoreId, arr);
    }
    return scores.map((score) => ({
      score,
      details: byScore.get(score.id!) ?? [],
      gameName: gameById.get(score.configId) ?? 'Unknown',
    }));
  }, []);
}

export function useConfigMap(): Map<number, GameConfigData> | undefined {
  return useLiveQuery(async () => {
    const configs = await listConfigs();
    const map = new Map<number, GameConfigData>();
    for (const c of configs) {
      try {
        if (c.id != null) map.set(c.id, parseGameConfig(c.configData));
      } catch (e) {
        logError('config parse skipped', e, { configId: c.id, gameName: c.gameName });
      }
    }
    return map;
  }, []);
}

export function ScoreListItem({
  item,
  selected,
  onSelect,
  config,
}: {
  item: FullScore;
  selected?: boolean;
  onSelect: () => void;
  /** Game config — hides rank/accuracy/level segments the game deleted. */
  config?: GameConfigData | null;
}) {
  const s = item.score;
  const showRank = isRankEnabled(config);
  const showAccuracy = isAccuracyEnabled(config);
  const showLevel = hasSlot(config, 'difficultyValRect');
  const segments = [
    `[${s.difficultyName}]`,
    showLevel ? s.difficultyVal : null,
    showRank ? s.playRank : null,
    showAccuracy ? `${s.accuracy.toFixed(2)}%` : null,
  ].filter(Boolean);
  return (
    <button className={`score-card${selected ? ' selected' : ''}`} onClick={onSelect}>
      <GameIcon configId={item.score.configId} label={s.songTitle} />
      <span>
        <div className="t1">{s.songTitle}</div>
        <div className="t2">{item.gameName}</div>
        <div className="t2">{segments.join(' - ')}</div>
        <div className="t3">{timeAgo(s.playTimestamp)}, {formatPlayTime(s.playTimestamp)}</div>
      </span>
      <span className="more">•••</span>
    </button>
  );
}
