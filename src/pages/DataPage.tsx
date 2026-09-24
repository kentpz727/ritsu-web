import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFullScores, useConfigMap } from '../components/scores.tsx';
import { GameIcon } from '../components/gameIcon.tsx';
import { BarChart, MetricGraph } from '../components/detail.tsx';
import { monthKey, monthLabel } from '../lib/calc/dates.ts';
import { hasSlot, isAccuracyEnabled, isRankEnabled } from '../lib/config/types.ts';
import { rankingValue } from '../lib/calc/scoring.ts';
import { clearAllData, downloadFile, exportToCsv, exportToJson, importFromJson } from '../lib/db/dexie.ts';

type PeriodMode = 'day' | 'week' | 'month' | 'year' | 'range';

function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoWeekOf(d: Date): { year: number; week: number } {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (date.getDay() + 6) % 7; // Monday-first
  date.setDate(date.getDate() - day + 3); // Thursday of this week
  const first = new Date(date.getFullYear(), 0, 4);
  const fday = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - fday + 3);
  return { year: date.getFullYear(), week: 1 + Math.round((date.getTime() - first.getTime()) / 6048e5) };
}

function toWeekInputValue(d: Date): string {
  const { year, week } = isoWeekOf(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function mondayOfWeekInput(s: string): Date | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(s);
  if (!m) return null;
  const jan4 = new Date(Number(m[1]), 0, 4);
  const day = (jan4.getDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - day + (Number(m[2]) - 1) * 7);
  return monday;
}

function startOfWeekMonday(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - day);
  return monday;
}

export default function DataPage() {
  const all = useFullScores() ?? [];
  const configMap = useConfigMap();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [month, setMonth] = useState(monthKey(Date.now()));
  const [dayStr, setDayStr] = useState(() => toDateInputValue(Date.now()));
  const [weekStr, setWeekStr] = useState(() => toWeekInputValue(new Date()));
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [fromStr, setFromStr] = useState(() => toDateInputValue(Date.now() - 29 * 864e5));
  const [toStr, setToStr] = useState(() => toDateInputValue(Date.now()));
  const [msg, setMsg] = useState('');

  // Scores + graph buckets for the selected granularity. Every branch uses the
  // user's local calendar days, so the graph always matches what the picker shows.
  const period = useMemo(() => {
    if (mode === 'day') {
      const p = parseDateInput(dayStr) ?? new Date();
      const start = new Date(p.getFullYear(), p.getMonth(), p.getDate()).getTime();
      const list = all.filter((f) => f.score.playTimestamp >= start && f.score.playTimestamp < start + 864e5);
      const values = new Array<number>(8).fill(0);
      for (const f of list) values[Math.min(7, Math.floor(new Date(f.score.playTimestamp).getHours() / 3))]++;
      return {
        list,
        labels: ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'],
        values,
        caption: 'Hours (3h blocks)',
        summary: `on ${new Date(start).toLocaleDateString([], { month: 'long', day: 'numeric' })}`,
      };
    }
    if (mode === 'week') {
      const mon = mondayOfWeekInput(weekStr) ?? startOfWeekMonday(new Date());
      const start = mon.getTime();
      const list = all.filter((f) => f.score.playTimestamp >= start && f.score.playTimestamp < start + 7 * 864e5);
      const values = new Array<number>(7).fill(0);
      const labels: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start + i * 864e5);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      }
      for (const f of list) {
        values[Math.min(6, Math.max(0, Math.floor((f.score.playTimestamp - start) / 864e5)))]++;
      }
      const end = new Date(start + 6 * 864e5);
      return {
        list, labels, values, caption: 'Days',
        summary: `this week (${labels[0]}–${end.getMonth() + 1}/${end.getDate()})`,
      };
    }
    if (mode === 'year') {
      const list = all.filter((f) => new Date(f.score.playTimestamp).getFullYear() === year);
      const values = new Array<number>(12).fill(0);
      const labels: string[] = [];
      for (let i = 0; i < 12; i++) labels.push(new Date(year, i, 1).toLocaleDateString([], { month: 'short' }));
      for (const f of list) values[new Date(f.score.playTimestamp).getMonth()]++;
      return { list, labels, values, caption: 'Months', summary: `in ${year}` };
    }
    if (mode === 'range') {
      const a = parseDateInput(fromStr) ?? new Date();
      const b = parseDateInput(toStr) ?? new Date();
      const dayA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
      const dayB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
      const sa = Math.min(dayA, dayB);
      const sb = Math.max(dayA, dayB);
      // Clamp absurd spans to a year; long spans bucket weekly so bars stay readable.
      let spanDays = Math.round((sb - sa) / 864e5) + 1;
      let clamped = false;
      if (spanDays > 370) {
        spanDays = 370;
        clamped = true;
      }
      const end = sa + spanDays * 864e5;
      const list = all.filter((f) => f.score.playTimestamp >= sa && f.score.playTimestamp < end);
      let labels: string[];
      let values: number[];
      let caption: string;
      if (spanDays <= 62) {
        labels = [];
        values = new Array<number>(spanDays).fill(0);
        for (let i = 0; i < spanDays; i++) {
          const d = new Date(sa + i * 864e5);
          labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        }
        for (const f of list) {
          values[Math.min(spanDays - 1, Math.max(0, Math.floor((f.score.playTimestamp - sa) / 864e5)))]++;
        }
        caption = 'Days';
      } else {
        const n = Math.ceil(spanDays / 7);
        labels = [];
        values = new Array<number>(n).fill(0);
        for (let i = 0; i < n; i++) {
          const d = new Date(sa + i * 7 * 864e5);
          labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        }
        for (const f of list) {
          values[Math.min(n - 1, Math.max(0, Math.floor((f.score.playTimestamp - sa) / (7 * 864e5))))]++;
        }
        caption = 'Weeks';
      }
      return { list, labels, values, caption, summary: `in selected range${clamped ? ' (clamped to 1 year)' : ''}` };
    }
    // month: quarter-month buckets over the month's actual day count.
    const [y, m] = month.split('-').map(Number);
    const mon = Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
    const dys = new Date(Number.isFinite(y) ? y : new Date().getFullYear(), mon, 0).getDate();
    const size = Math.ceil(dys / 4);
    const labels: string[] = [];
    for (let i = 0; i < 4; i++) {
      labels.push(`${mon}/${i * size + 1}-${mon}/${Math.min((i + 1) * size, dys)}`);
    }
    const list = all.filter((f) => monthKey(f.score.playTimestamp) === month);
    // True zeros: brand-new users see an empty graph, not placeholder bars.
    const values = [0, 0, 0, 0];
    for (const f of list) {
      const d = new Date(f.score.playTimestamp).getDate();
      const day = Math.min(Math.max(d, 1), dys);
      values[Math.min(3, Math.floor((day - 1) / size))]++;
    }
    return { list, labels, values, caption: 'Weeks', summary: 'this month' };
  }, [all, mode, dayStr, weekStr, month, year, fromStr, toStr]);
  const months = useMemo(() => [...new Set(all.map((f) => monthKey(f.score.playTimestamp)))].sort().reverse(), [all]);
  const years = useMemo(() => {
    const set = new Set(all.map((f) => new Date(f.score.playTimestamp).getFullYear()));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [all]);

  const games = useMemo(() => {
    const m = new Map<string, { plays: number; configId: number }>();
    for (const f of period.list) {
      const e = m.get(f.gameName) ?? { plays: 0, configId: f.score.configId };
      e.plays++;
      m.set(f.gameName, e);
    }
    return [...m.entries()].sort((a, b) => b[1].plays - a[1].plays);
  }, [period]);

  const charts = useMemo(() => {
    const m = new Map<string, { plays: number; game: string }>();
    for (const f of period.list) {
      const k = `${f.score.songTitle} [${f.score.difficultyName} ${f.score.difficultyVal}]`;
      const e = m.get(k) ?? { plays: 0, game: f.gameName };
      e.plays++;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].plays - a[1].plays).slice(0, 8);
  }, [period]);

  // Android DataScreen parity (default Accuracy mode): rank value weights the
  // metric by note count, so a full-length chart outranks a short one.
  const topScores = useMemo(() => {
    const scored = period.list.map((f) => {
      const cfg = configMap?.get(f.score.configId) ?? { gameName: f.gameName };
      const counts: Record<string, number> = {};
      for (const d of f.details) {
        const n = Number(d.value);
        if (Number.isFinite(n)) counts[d.key] = (counts[d.key] ?? 0) + n;
      }
      return { f, v: rankingValue(counts, cfg, f.score, 'ACCURACY') };
    });
    return scored.sort((a, b) => b.v - a.v).slice(0, 5).map((s) => s.f);
  }, [period, configMap]);

  // Same split-series treatment as game details: one connected line per game.
  const gameSeries = useMemo(() => {
    const m = new Map<string, typeof period.list>();
    for (const f of period.list) {
      const arr = m.get(f.gameName) ?? [];
      arr.push(f);
      m.set(f.gameName, arr);
    }
    return [...m.entries()].map(([name, rs]) => ({ name, scores: rs.map((r) => r.score) }));
  }, [period]);

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const r = await importFromJson(text);
      setMsg(
        `Imported ${r.imported} scores from ${file.name}` +
          (r.skippedGames.length > 0 ? ` (skipped unknown games: ${r.skippedGames.join(', ')}) — import their configs first.` : ''),
      );
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div>
      <h1 className="page-title">Data</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="input" style={{ maxWidth: 130 }} value={mode} onChange={(e) => setMode(e.target.value as PeriodMode)} aria-label="Granularity">
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="range">Range</option>
        </select>
        {mode === 'day' && (
          <input className="input" style={{ maxWidth: 200 }} type="date" value={dayStr} onChange={(e) => setDayStr(e.target.value)} aria-label="Day" />
        )}
        {mode === 'week' && (
          <input className="input" style={{ maxWidth: 200 }} type="week" value={weekStr} onChange={(e) => setWeekStr(e.target.value)} aria-label="Week" />
        )}
        {mode === 'month' && (
          <select className="input" style={{ maxWidth: 264 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {[monthKey(Date.now()), ...months.filter((m) => m !== monthKey(Date.now()))].map((m) => (
              <option key={m} value={m}>{monthLabel(new Date(`${m}-02T12:00:00`).getTime())}</option>
            ))}
          </select>
        )}
        {mode === 'year' && (
          <select className="input" style={{ maxWidth: 130 }} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {mode === 'range' && (
          <>
            <input className="input" style={{ maxWidth: 170 }} type="date" value={fromStr} onChange={(e) => setFromStr(e.target.value)} aria-label="From" />
            <span className="muted">→</span>
            <input className="input" style={{ maxWidth: 170 }} type="date" value={toStr} onChange={(e) => setToStr(e.target.value)} aria-label="To" />
          </>
        )}
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 1px 1fr' }}>
        <section>
          <h3>Top Games</h3>
          {games.map(([g, info], i) => (
            <div className="board-row" key={g}>
              <GameIcon configId={info.configId} label={g} size={60} fallback={i + 1} />
              <span><div className="mini">{i + 1}. {g}</div><div className="mini-sub">{info.plays} plays</div></span>
            </div>
          ))}
          {games.length === 0 && <p className="muted">No plays this month.</p>}
          <h3 style={{ marginTop: 24 }}>Top Scores <span className="muted">— Accuracy</span></h3>
          {topScores.map((f) => {
            const cfg = configMap?.get(f.score.configId);
            const showRank = isRankEnabled(cfg);
            const showAccuracy = isAccuracyEnabled(cfg);
            const showLevel = hasSlot(cfg, 'difficultyValRect');
            const sub = [
              showLevel ? f.score.difficultyVal : null,
              showAccuracy ? `${f.score.accuracy.toFixed(2)}% Accuracy` : null,
              showRank ? `${f.score.playRank} Rank` : null,
            ].filter(Boolean).join(', ');
            return (
              <div className="board-row" key={f.score.id}>
                <span className="thumb">{(f.score.songTitle[0] ?? '?').toUpperCase()}</span>
                <span>
                  <div className="mini">{f.score.songTitle} [{f.score.difficultyName}]</div>
                  <div className="mini-sub">{f.gameName}</div>
                  {sub && <div className="mini-sub">{sub}</div>}
                </span>
              </div>
            );
          })}
          <h3 style={{ marginTop: 24 }}>Top Charts</h3>
          {charts.map(([k, v]) => (
            <div className="board-row" key={k}>
              <span><div className="mini">{k}</div><div className="mini-sub">{v.plays} plays · {v.game}</div></span>
            </div>
          ))}
        </section>
        <div className="divider" />
        <section>
          <h3>Activity Graph</h3>
          <BarChart values={period.values} labels={period.labels} caption={period.caption} />
          {period.list.length > 0 ? (
            <p className="green">+{period.list.length} plays {period.summary}. Set {topScores.length} top scores {period.summary}.</p>
          ) : (
            <p className="muted">No activity yet — import scores to fill this graph.</p>
          )}
          <h3 style={{ marginTop: 24 }}>Game Leaderboard</h3>
          <MetricGraph series={gameSeries} label="Performance over time" />
          <div className="card">
            <h3>Export / Import</h3>
            <p className="muted">Download JSON for backup, CSV for spreadsheets.</p>
            <div className="row">
              <button className="btn" onClick={async () => downloadFile(`ritsu-${Date.now()}.json`, await exportToJson())}>Export JSON</button>
              <button className="btn" onClick={async () => downloadFile(`ritsu-${Date.now()}.csv`, await exportToCsv(), 'text/csv')}>Export CSV</button>
              <label className="btn">Import JSON<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && onImportFile(e.target.files[0])} /></label>
              <button className="btn" onClick={async () => { if (confirm('Delete all scores?')) { await clearAllData(); setMsg('All scores deleted.'); } }}>Delete all</button>
              <Link className="btn" to="/configs">Manage configs</Link>
            </div>
            {msg && <p className="muted">{msg}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
