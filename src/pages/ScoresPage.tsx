import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScoreListItem, useConfigMap, useFullScores } from '../components/scores.tsx';
import { ScoreDetail } from '../components/detail.tsx';
import { initials } from '../lib/format.ts';
import type { ScoreSort } from '../lib/calc/dates.ts';
import { SCORE_PAGE_SIZE, clampPage, pageCount, pageRange, pageSlice } from '../lib/pagination.ts';

export default function ScoresPage() {
  const all = useFullScores();
  const configMap = useConfigMap();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<ScoreSort>('PLAY');
  const [asc, setAsc] = useState(false);
  const [game, setGame] = useState<string>('All');
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [page, setPage] = useState(0);

  // A filter change makes the old page index meaningless.
  useEffect(() => setPage(0), [q, sort, asc, game]);

  const games = useMemo(() => ['All', ...new Set((all ?? []).map((f) => f.gameName))], [all]);
  const filtered = useMemo(() => {
    let list = (all ?? []).filter(
      (f) =>
        (game === 'All' || f.gameName === game) &&
        (q === '' ||
          f.score.songTitle.toLowerCase().includes(q.toLowerCase()) ||
          f.gameName.toLowerCase().includes(q.toLowerCase())),
    );
    list = [...list].sort((a, b) => {
      if (sort === 'SCORE') return b.score.totalScore - a.score.totalScore;
      if (sort === 'ACCURACY') return b.score.accuracy - a.score.accuracy;
      if (sort === 'IMPORT') return b.score.importTimestamp - a.score.importTimestamp;
      return b.score.playTimestamp - a.score.playTimestamp;
    });
    // Android ScoreScreen parity: every sort key runs ascending and descending.
    if (asc) list.reverse();
    return list;
  }, [all, q, sort, asc, game]);

  // P-08: render at most one page of rows; the shared snapshot holds the rest.
  const visible = useMemo(() => pageSlice(filtered, page), [filtered, page]);
  const currentPage = clampPage(page, filtered.length);
  const [rangeFrom, rangeTo] = pageRange(currentPage, filtered.length);
  const selected = visible.find((f) => f.score.id === selectedId) ?? visible[0] ?? filtered[0];

  // Android parity (getTrackCountForSong/Chart): plays of the song across all
  // difficulties, and plays of this exact chart — not a hardcoded 1.
  const trackCounts = useMemo(() => {
    if (!selected) return null;
    const s = selected.score;
    let chart = 0;
    let song = 0;
    for (const f of all ?? []) {
      if (f.score.configId !== s.configId || f.score.songTitle !== s.songTitle) continue;
      song++;
      if (f.score.difficultyName === s.difficultyName && f.score.difficultyVal === s.difficultyVal) chart++;
    }
    return { chart, song };
  }, [all, selected]);

  return (
    <div className="split">
      <section>
        <h1 className="page-title">Scores</h1>
        <div className="search-row">
          <input className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ width: 130 }} value={sort} onChange={(e) => setSort(e.target.value as ScoreSort)} aria-label="Sort">
            <option value="PLAY">Played</option>
            <option value="IMPORT">Imported</option>
            <option value="SCORE">Score</option>
            <option value="ACCURACY">Accuracy</option>
          </select>
          <button className="btn" title={asc ? 'Ascending' : 'Descending'} onClick={() => setAsc(!asc)} aria-label="Sort direction">
            {asc ? '↑' : '↓'}
          </button>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          {games.map((g) => (
            <button key={g} className="more-link" style={game === g ? { borderColor: '#5df3ff', color: '#5df3ff' } : undefined} onClick={() => setGame(g)}>
              {g}
            </button>
          ))}
        </div>
        {visible.map((f) => (
          <ScoreListItem key={f.score.id} item={f} selected={selected?.score.id === f.score.id} onSelect={() => setSelectedId(f.score.id)} config={configMap?.get(f.score.configId)} />
        ))}
        {filtered.length > SCORE_PAGE_SIZE && (
          <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
            <button className="btn" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>
              Previous
            </button>
            <span className="muted" aria-live="polite">
              Page {currentPage + 1} of {pageCount(filtered.length)} · {rangeFrom}–{rangeTo} of {filtered.length}
            </span>
            <button
              className="btn"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= pageCount(filtered.length) - 1}
            >
              Next
            </button>
          </div>
        )}
        {filtered.length === 0 && <p className="muted">No scores yet — use the camera button to import.</p>}
      </section>
      <div className="divider" />
      <section>
        {selected && (
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn" onClick={() => nav(`/chart/${selected.score.configId}/${encodeURIComponent(selected.score.songTitle)}/${encodeURIComponent(selected.score.difficultyName)}/${encodeURIComponent(selected.score.difficultyVal)}`)}>Chart details</button>
            <button className="btn" onClick={() => nav(`/game/${selected.score.configId}`)}>Game details</button>
          </div>
        )}
        <ScoreDetail item={selected} config={selected ? configMap?.get(selected.score.configId) : undefined} trackCounts={trackCounts} />
        {selected && (
          <p className="muted">Cover placeholder <kbd>{initials(selected.score.songTitle)}</kbd> — set a logo for this game in Manage Configs to replace it.</p>
        )}
      </section>
    </div>
  );
}
