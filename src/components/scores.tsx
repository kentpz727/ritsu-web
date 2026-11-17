import { useScoreSnapshot } from '../lib/db/scoreCache.ts';
import type { FullScore } from '../lib/db/dexie.ts';
import { timeAgo, formatPlayTime } from '../lib/calc/dates.ts';
import { GameIcon } from './gameIcon.tsx';
import { hasSlot, isAccuracyEnabled, isRankEnabled, type GameConfigData } from '../lib/config/types.ts';

export function useFullScores(): FullScore[] | undefined {
  return useScoreSnapshot()?.scores;
}

export function useConfigMap(): Map<number, GameConfigData> | undefined {
  return useScoreSnapshot()?.configMap;
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
