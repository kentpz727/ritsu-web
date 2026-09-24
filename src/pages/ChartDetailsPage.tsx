import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFullScores } from '../components/scores.tsx';
import { MetricGraph } from '../components/detail.tsx';
import { timeAgo } from '../lib/calc/dates.ts';

export default function ChartDetailsPage() {
  const { configId, song, diff, val } = useParams();
  const all = useFullScores() ?? [];
  const songTitle = decodeURIComponent(song ?? '');
  const diffName = decodeURIComponent(diff ?? '');
  const diffVal = decodeURIComponent(val ?? '');
  const rows = useMemo(
    () =>
      all.filter(
        (f) =>
          String(f.score.configId) === String(configId) &&
          f.score.songTitle === songTitle &&
          f.score.difficultyName === diffName &&
          f.score.difficultyVal === diffVal,
      ),
    [all, configId, songTitle, diffName, diffVal],
  );
  const others = useMemo(
    () => all.filter((f) => String(f.score.configId) === String(configId) && f.score.songTitle === songTitle && !rows.includes(f)),
    [all, configId, songTitle, rows],
  );
  // Android ChartDetailsScreen parity: leaderboard sorts by metric desc (default Score).
  const [sortMode, setSortMode] = useState<'SCORE' | 'ACCURACY' | 'MAX_COMBO'>('SCORE');
  const sortedRows = useMemo(() => {
    const key = sortMode === 'SCORE' ? 'totalScore' : sortMode === 'ACCURACY' ? 'accuracy' : 'maxCombo';
    return [...rows].sort((a, b) => b.score[key] - a.score[key]);
  }, [rows, sortMode]);

  return (
    <div style={{ maxWidth: 640 }}>
      <Link to="/">✕</Link>
      <h1 className="page-title">Chart Details</h1>
      <h2>{songTitle} [{diffName}]</h2>
      <p className="muted">{rows[0]?.gameName ?? ''}</p>
      <h3>Graphs</h3>
      <MetricGraph
        series={[{ name: `${songTitle} [${diffName} ${diffVal}]`, scores: rows.map((r) => r.score) }]}
        label="Accuracy over time"
        fixedMetric="accuracy"
      />
      <MetricGraph
        series={[{ name: `${songTitle} [${diffName} ${diffVal}]`, scores: rows.map((r) => r.score) }]}
        label="Score over time"
        fixedMetric="score"
      />
      <h3>Chart Leaderboard</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        {(['SCORE', 'ACCURACY', 'MAX_COMBO'] as const).map((m) => (
          <button
            key={m}
            className="more-link"
            style={sortMode === m ? { borderColor: '#5df3ff', color: '#5df3ff' } : undefined}
            onClick={() => setSortMode(m)}
          >
            {m === 'SCORE' ? 'Score' : m === 'ACCURACY' ? 'Accuracy' : 'Combo'}
          </button>
        ))}
      </div>
      {sortedRows.map((r, i) => (
        <div className="board-row" key={r.score.id}>
          <strong>#{i + 1}</strong>
          <span className="mini">
            {r.score.playRank} - {r.score.totalScore.toLocaleString()} · {r.score.accuracy.toFixed(2)}% · {r.score.maxCombo}x
          </span>
          <span className="mini-sub" style={{ marginLeft: 'auto' }}>{timeAgo(r.score.playTimestamp)}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="muted">No records for this chart yet.</p>}
      <h3>Other Difficulties</h3>
      {others.length === 0 && <p className="muted">No other difficulty records found.</p>}
      {others.map((r) => (
        <div key={r.score.id}><Link to={`/chart/${r.score.configId}/${encodeURIComponent(r.score.songTitle)}/${encodeURIComponent(r.score.difficultyName)}/${encodeURIComponent(r.score.difficultyVal)}`}>
          [{r.score.difficultyName}] - {r.score.difficultyVal}*
        </Link></div>
      ))}
    </div>
  );
}
