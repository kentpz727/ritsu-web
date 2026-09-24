import { useMemo, useState } from 'react';
import type { FullScore } from '../lib/db/dexie.ts';
import { formatFull } from '../lib/calc/dates.ts';
import { toGraphPoint, type GraphPoint } from '../lib/numbers.ts';
import {
  filterDetailsByConfig,
  hasSlot,
  isAccuracyEnabled,
  isRankEnabled,
  type GameConfigData,
} from '../lib/config/types.ts';
import { EditScoreDialog } from './EditScore.tsx';

/**
 * Right-hand detail panel — mirrors Desktop-1 Figma (rank badge, accuracy, breakdowns).
 * When `config` is provided, only fields the game's config still defines are shown:
 * deleted metrics/slots never render.
 */
export function ScoreDetail({ item, config, trackCounts }: { item?: FullScore; config?: GameConfigData | null; trackCounts?: { chart: number; song: number } | null }) {
  const [editing, setEditing] = useState(false);
  if (!item) return <div className="detail card">Click on a score to display here</div>;
  const s = item.score;
  const visible = filterDetailsByConfig(config, item.details);
  const showRank = isRankEnabled(config);
  const showAccuracy = isAccuracyEnabled(config);
  const showDiffName = hasSlot(config, 'difficultyNameRect');
  const showLevel = hasSlot(config, 'difficultyValRect');
  const showScore = hasSlot(config, 'scoreRect');
  const showCombo = hasSlot(config, 'comboRect');
  const showDiffRow = showDiffName || showLevel;
  const showScoreRow = showScore || showCombo;
  const showJudgments = !config || (config.judgments?.length ?? 0) > 0;
  const showMetrics = !config || (config.metrics?.length ?? 0) > 0;
  return (
    <div className="detail">
      <div className="row" style={{ marginBottom: 4 }}>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
      </div>
      {editing && <EditScoreDialog item={item} config={config} onClose={() => setEditing(false)} />}
      <div className="song">{s.songTitle}</div>
      <div className="game">{item.gameName}</div>
      <div className="hero-panel">
        {showRank && s.playRank !== '' && <div className="rank-badge">{s.playRank}</div>}
        <div>
          {showDiffRow && (
            <div>
              {showDiffName && <span className="pill">{s.difficultyName}</span>}{' '}
              {showLevel && <span>*{s.difficultyVal}</span>}
            </div>
          )}
          {showAccuracy && <div style={{ fontSize: 16, marginTop: 6 }}>{s.accuracy.toFixed(2)}% Accuracy</div>}
          {showScoreRow && (
            <div style={{ color: 'rgba(255,255,255,.49)', fontSize: 14 }}>
              {showScore ? s.totalScore.toLocaleString() : null}
              {showScore && showCombo ? ' - ' : null}
              {showCombo ? `${s.maxCombo}x Combo` : null}
            </div>
          )}
          {visible.misc.length > 0 && <div className="muted">({visible.misc.map((m) => m.label).join(', ')})</div>}
        </div>
      </div>
      {showJudgments && (
        <>
          <div className="section-label">Judgement Breakdown</div>
          <div className="stat-grid">
            {visible.judgments.map((j, i) => (
              <div className="stat" key={j.detailId ?? `${j.key}-${i}`}>
                <div className="k">{j.label}</div>
                <div className="v">{j.value}x</div>
              </div>
            ))}
            {visible.judgments.length === 0 && <span className="muted">No judgements recorded.</span>}
          </div>
        </>
      )}
      {showMetrics && (
        <>
          <div className="section-label">Metrics</div>
          <div className="stat-grid">
            {visible.metrics.map((m, i) => (
              <div className="stat" key={m.detailId ?? `${m.key}-${i}`}>
                <div className="k">{m.label}</div>
                <div className="v">{m.value}</div>
              </div>
            ))}
            {visible.metrics.length === 0 && <span className="muted">No metrics recorded.</span>}
          </div>
        </>
      )}
      <div className="meta-row">
        <span>Played<br />Imported</span>
        <span>
          Tracked {trackCounts ? `${trackCounts.song} time${trackCounts.song === 1 ? '' : 's'}` : '…'} (
          {trackCounts ? `${trackCounts.chart} time${trackCounts.chart === 1 ? '' : 's'}` : '…'} for this chart)
        </span>
        <span className="right">{formatFull(s.playTimestamp)}<br />{formatFull(s.importTimestamp)}</span>
      </div>
    </div>
  );
}

/** Minimal SVG stand-in for LineGraph / MultiLineGraph. */
export function LineChart({ points, label }: { points: number[]; label: string }) {
  // Drop non-finite values: one NaN token invalidates a whole polyline.
  const clean = points.filter((p) => Number.isFinite(p));
  const w = 600;
  const h = 140;
  const max = Math.max(...clean, 1);
  const min = Math.min(...clean, 0);
  const path = clean
    .map((p, i) => `${(i / Math.max(clean.length - 1, 1)) * w},${h - ((p - min) / Math.max(max - min, 1)) * (h - 20) - 10}`)
    .join(' ');
  return (
    <div style={{ marginBottom: 16 }}>
      <svg className="line-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke="rgba(255,255,255,.2)" />
        ))}
        {clean.length > 1 && <polyline points={path} fill="none" stroke="#fff" strokeWidth={2} />}
        {clean.map((p, i) => (
          <circle
            key={i}
            cx={(i / Math.max(clean.length - 1, 1)) * w}
            cy={h - ((p - min) / Math.max(max - min, 1)) * (h - 20) - 10}
            r={3}
            fill="#5df3ff"
          />
        ))}
      </svg>
      <div className="muted" style={{ textAlign: 'center' }}>{label}</div>
    </div>
  );
}

export function BarChart({ values, labels, caption = 'Weeks' }: { values: number[]; labels: string[]; caption?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="bar-chart">
        {values.map((v, i) => (
          <div key={i}>
            <div className="bar" style={{ height: `${(v / max) * 110}px` }} />
            <div className="bar-x">{labels[i]}</div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ textAlign: 'center' }}>{caption}</div>
    </div>
  );
}

/**
 * Connected performance graph with switchable Y metric (accuracy | score).
 * One connected line per series (e.g. per chart or per game), time-ordered,
 * with axis labels, a toggleable legend, and best/avg/latest stats.
 */
export interface MetricSeries {
  name: string;
  scores: Array<{ accuracy: number; totalScore: number; playTimestamp: number }>;
}

const SERIES_COLORS = [
  '#5df3ff', '#6eeb5e', '#ffb86b', '#ff9d9d', '#c792ea', '#fff176',
  '#80cbc4', '#f48fb1', '#a5d6a7', '#90caf9', '#ffcc80', '#ce93d8',
];

export function MetricGraph({
  series,
  label,
  fixedMetric,
}: {
  series: MetricSeries[];
  label: string;
  /** Lock to one metric (separate graphs); omit for the Accuracy/Score toggle. */
  fixedMetric?: 'accuracy' | 'score';
}) {
  const [metric, setMetric] = useState<'accuracy' | 'score'>('accuracy');
  const active = fixedMetric ?? metric;
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const prepared = useMemo(
    () =>
      series.map((s, i) => ({
        name: s.name,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        dashed: false,
        synthetic: false,
        // Corrupt rows never reach the SVG: one NaN token kills a whole polyline.
        points: s.scores
          .map((p) => toGraphPoint(p))
          .filter((p): p is GraphPoint => p !== null)
          .sort((a, b) => a.playTimestamp - b.playTimestamp),
      })),
    [series],
  );
  // "All plays" trend line (dashed): guarantees a visible improvement line once
  // two total plays exist, even when every chart has a single dot. Toggleable.
  const withAll = useMemo(() => {
    if (prepared.length <= 1) return prepared;
    const pts = prepared
      .flatMap((s) => s.points)
      .sort((a, b) => a.playTimestamp - b.playTimestamp);
    if (pts.length < 2) return prepared;
    return [...prepared, { name: 'All plays', color: '#8fa3b8', dashed: true, synthetic: true, points: pts }];
  }, [prepared]);
  const visible = withAll.filter((s) => !hidden[s.name]);
  const real = visible.filter((s) => !s.synthetic);
  const synth = visible.filter((s) => s.synthetic);
  const fmt = (v: number) => (active === 'accuracy' ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString());
  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const W = 600;
  const H = 180;
  const PL = 58;
  const PB = 24;
  const PT = 12;
  const PR = 12;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  // Every dot gets its own slot in chronological order, so plays sharing a
  // timestamp sit next to each other instead of stacking: improvement stays visible.
  // Y rescales to the visible lines.
  const order = real
    .flatMap((s, si) => s.points.map((p, pi) => ({ si, pi, ts: p.playTimestamp })))
    .sort((a, b) => a.ts - b.ts || a.si - b.si || a.pi - b.pi);
  const slotOf = new Map<string, number>();
  order.forEach((d, k) => slotOf.set(`${d.si}:${d.pi}`, k));
  const nDots = order.length;
  const vals = visible.flatMap((s) => s.points.map((p) => (active === 'accuracy' ? p.accuracy : p.totalScore)));
  const max = vals.length > 0 ? Math.max(...vals) : 1;
  const min = vals.length > 0 ? Math.min(...vals) : 0;
  const span = max - min || 1;
  const x = (si: number, pi: number) => PL + (nDots > 1 ? (slotOf.get(`${si}:${pi}`) ?? 0) / (nDots - 1) * iw : iw / 2);
  // X position for trend-line vertices: chronological rank among real dots.
  const realTs = order.map((d) => d.ts);
  const rankX = (ts: number) => {
    let lo = 0;
    let hi = realTs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (realTs[mid] < ts) lo = mid + 1;
      else hi = mid;
    }
    return PL + (nDots > 1 ? (Math.min(lo, nDots - 1) / (nDots - 1)) * iw : iw / 2);
  };
  const y = (v: number) => PT + (1 - (v - min) / span) * ih;
  const flat = real
    .flatMap((s) => s.points.map((p) => ({ ts: p.playTimestamp, v: active === 'accuracy' ? p.accuracy : p.totalScore })))
    .sort((a, b) => a.ts - b.ts);
  const best = flat.length > 0 ? Math.max(...flat.map((p) => p.v)) : 0;
  const avg = flat.length > 0 ? flat.reduce((s, p) => s + p.v, 0) / flat.length : 0;
  const latest = flat.length > 0 ? flat[flat.length - 1].v : 0;
  const ticks = [0, 1, 2, 3].map((t) => min + (span * t) / 3);

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        {fixedMetric == null && (
          <>
            <button
              className="more-link"
              style={metric === 'accuracy' ? { borderColor: '#5df3ff', color: '#5df3ff' } : undefined}
              onClick={() => setMetric('accuracy')}
            >
              Accuracy
            </button>
            <button
              className="more-link"
              style={metric === 'score' ? { borderColor: '#5df3ff', color: '#5df3ff' } : undefined}
              onClick={() => setMetric('score')}
            >
              Score
            </button>
          </>
        )}
        <span className="muted" style={{ marginLeft: 'auto' }}>{label}</span>
      </div>
      {withAll.length > 1 && (
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          {withAll.map((s) => (
            <button
              key={s.name}
              className="more-link"
              title={s.name}
              style={{
                opacity: hidden[s.name] ? 0.4 : 1,
                borderColor: hidden[s.name] ? undefined : s.color,
                maxWidth: 220,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setHidden((h) => ({ ...h, [s.name]: !h[s.name] }))}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: s.color, marginRight: 6 }} />
              {s.name}
            </button>
          ))}
        </div>
      )}
      {vals.length === 0 ? (
        <p className="muted">No plays recorded yet.</p>
      ) : (
        <>
          <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} (${active})`}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.2)" />
                <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,.65)">{fmt(t)}</text>
              </g>
            ))}
            {real.map((s, si) => {
              const v = (p: { accuracy: number; totalScore: number }) =>
                active === 'accuracy' ? p.accuracy : p.totalScore;
              const path = s.points.map((p, pi) => `${x(si, pi)},${y(v(p))}`).join(' ');
              return (
                <g key={s.name}>
                  {s.points.length > 1 && <polyline points={path} fill="none" stroke={s.color} strokeWidth={2} />}
                  {s.points.map((p, pi) => (
                    <circle key={pi} cx={x(si, pi)} cy={y(v(p))} r={4.5} fill={s.color} stroke="#081625" strokeWidth={1}>
                      <title>{`${s.name} · ${fmtDate(p.playTimestamp)}: ${fmt(v(p))}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
            {synth.map((s) => {
              const v = (p: { accuracy: number; totalScore: number }) =>
                active === 'accuracy' ? p.accuracy : p.totalScore;
              const path = s.points.map((p) => `${rankX(p.playTimestamp)},${y(v(p))}`).join(' ');
              return (
                <g key={s.name}>
                  {s.points.length > 1 && (
                    <polyline points={path} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="6 4" />
                  )}
                </g>
              );
            })}
            <text x={PL} y={H - 6} fontSize={11} fill="rgba(255,255,255,.65)">{fmtDate(order[0].ts)}</text>
            {nDots > 1 && (
              <text x={W - PR} y={H - 6} textAnchor="end" fontSize={11} fill="rgba(255,255,255,.65)">
                {fmtDate(order[nDots - 1].ts)}
              </text>
            )}
          </svg>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="mini-sub">Best {fmt(best)}</span>
            <span className="mini-sub">Avg {fmt(avg)}</span>
            <span className="mini-sub">Latest {fmt(latest)}</span>
          </div>
          {flat.length === 1 && (
            <p className="muted">One played so far.</p>
          )}
        </>
      )}
    </div>
  );
}

