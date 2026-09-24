import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFullScores } from '../components/scores.tsx';
import { MetricGraph } from '../components/detail.tsx';

export default function GameDetailsPage() {
  const { configId } = useParams();
  const all = useFullScores() ?? [];
  const rows = useMemo(() => all.filter((f) => String(f.score.configId) === String(configId)), [all, configId]);
  const name = rows[0]?.gameName ?? `Game ${configId}`;
  // Android GameDetailsScreen parity (default Score mode): one best record per
  // chart, sorted by score desc — not raw plays sorted by accuracy.
  const chartBest = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.score.songTitle} [${r.score.difficultyName} ${r.score.difficultyVal}]`;
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return [...m.entries()]
      .map(([chart, rs]) => ({
        chart,
        best: rs.reduce((a, b) => (b.score.totalScore > a.score.totalScore ? b : a)),
        plays: rs.length,
      }))
      .sort((a, b) => b.best.score.totalScore - a.best.score.totalScore)
      .slice(0, 20);
  }, [rows]);
  // Same song with different difficulties must not share a line: one connected
  // series per chart (top 10 by plays).
  const chartSplit = useMemo(() => {
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.score.songTitle} [${r.score.difficultyName} ${r.score.difficultyVal}]`;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }
    const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    return {
      series: ranked.slice(0, 10).map(([chart, rs]) => ({ name: chart, scores: rs.map((x) => x.score) })),
      hiddenCount: Math.max(0, ranked.length - 10),
    };
  }, [rows]);
  return (
    <div style={{ maxWidth: 720 }}>
      <Link to="/">✕</Link>
      <h1 className="page-title">Game Details</h1>
      <h2>{name}</h2>
      <p className="muted">{rows.length} plays · {new Set(rows.map((r) => r.score.songTitle)).size} charts</p>
      <h3>Graphs</h3>
      <MetricGraph series={chartSplit.series} label="Performance over time" />
      {chartSplit.hiddenCount > 0 && (
        <p className="muted">+{chartSplit.hiddenCount} more charts — top 10 by plays shown.</p>
      )}
      <h3>Game Leaderboard</h3>
      {chartBest.map((c, i) => (
        <div className="board-row" key={c.chart}>
          <strong>#{i + 1}</strong>
          <span>
            <div className="mini">{c.chart}</div>
            <div className="mini-sub">
              {c.best.score.playRank} - {c.best.score.totalScore.toLocaleString()} · {c.best.score.accuracy.toFixed(2)}% · {c.plays} play{c.plays === 1 ? '' : 's'}
            </div>
          </span>
        </div>
      ))}
      {chartBest.length === 0 && <p className="muted">No plays recorded yet.</p>}
    </div>
  );
}
