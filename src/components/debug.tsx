import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { clearAllData, db, deleteScore, downloadFile, repairScores } from '../lib/db/dexie.ts';
import { loadImage, readConfigBoxes, getMatchCandidates, type BenchResult } from '../lib/ocr/bench.ts';
import { parseGameConfig } from '../lib/config/types.ts';

/** OCR test bench: image + config in, per-value output out. Engine toggle A/Bs Tesseract vs PaddleOCR. */
export function OcrBench() {
  const configs = useLiveQuery(() => db.game_configs.toArray(), []);
  const [configId, setConfigId] = useState<number | ''>('');
  const [engine, setEngine] = useState<'tesseract' | 'paddle'>('tesseract');
  const [paddleLang, setPaddleLang] = useState('ch');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  async function onFile(f: File) {
    if (configId === '') {
      setStatus('Pick a game config first.');
      return;
    }
    const row = await db.game_configs.get(Number(configId));
    if (!row) return;
    try {
      const cfg = parseGameConfig(row.configData);
      const img = await loadImage(f);
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      // Fresh preview URL (loadImage revokes its own copy after decode).
      setImgUrl(URL.createObjectURL(f));
      setResult(null);
      setStatus(engine === 'paddle' ? 'loading PaddleOCR models (first run downloads them)…' : 'reading…');
      const candidates = await getMatchCandidates(Number(configId));
      const r = await readConfigBoxes(img, cfg, {
        fallbackTitle: f.name.replace(/\.[^.]+$/, ''),
        candidates,
        engine: { type: engine, lang: paddleLang },
        onStep: (label, done, total) => setStatus(`reading ${label}… (${done}/${total})`),
      });
      setResult(r);
      setStatus(
        r.missing.length > 0
          ? `missing: ${r.missing.join(', ')} — adjust boxes in BoxEditor or fix in manual entry`
          : `all ${r.fields.length} boxes read ✓ — this screenshot would auto-save`,
      );
    } catch (e) {
      setStatus(`error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="card">
      <h3>OCR test bench</h3>
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="input" style={{ maxWidth: 280 }} value={configId} onChange={(e) => setConfigId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Select game config…</option>
          {(configs ?? []).map((c) => <option key={c.id} value={c.id}>{c.gameName} (v{c.configVersion})</option>)}
        </select>
        <label className="btn primary">Choose image<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button
          className="more-link"
          style={engine === 'tesseract' ? { borderColor: '#5df3ff', color: '#5df3ff' } : undefined}
          onClick={() => setEngine('tesseract')}
        >
          Tesseract
        </button>
        <button
          className="more-link"
          style={engine === 'paddle' ? { borderColor: '#5df3ff', color: '#5df3ff' } : undefined}
          onClick={() => setEngine('paddle')}
        >
          PaddleOCR (pilot)
        </button>
        {engine === 'paddle' && (
          <select className="input" style={{ maxWidth: 150 }} value={paddleLang} onChange={(e) => setPaddleLang(e.target.value)} aria-label="PaddleOCR language">
            <option value="ch">ch (CN+EN)</option>
            <option value="japan">japan</option>
            <option value="en">en</option>
          </select>
        )}
      </div>
        {imgUrl && <img src={imgUrl} alt="bench input" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 12 }} />}
        {status && <p className="muted">{status}</p>}
      {result && (
        <table className="data">
          <thead>
            <tr><th>Value</th><th>Box (x,y,w,h)</th><th>Raw OCR</th><th>Result</th><th /></tr>
          </thead>
          <tbody>
            {result.fields.map((fl, i) => (
              <tr key={`${fl.label}-${i}`}>
                <td>{fl.label}{fl.auto ? ' (auto)' : ''}</td>
                <td><kbd>{fl.box}</kbd></td>
                <td>{fl.raw === '' ? <span className="muted">—</span> : <kbd>{fl.raw}</kbd>}</td>
                <td>
                  {fl.guessedFrom ? `≈${fl.value} ` : fl.value}
                  {fl.guessedFrom && <span className="muted">from "{fl.guessedFrom}"</span>}
                </td>
                <td>{fl.ok ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Database inspector: raw access to everything stored on the device. */
export function DbViewer() {
  const configs = useLiveQuery(() => db.game_configs.toArray(), []);
  const scores = useLiveQuery(() => db.generic_scores.orderBy('playTimestamp').reverse().toArray(), []);
  const details = useLiveQuery(() => db.score_details.toArray(), []);
  const [tab, setTab] = useState<'configs' | 'scores' | 'details'>('configs');
  const [msg, setMsg] = useState('');

  const gameOf = (configId: number) => configs?.find((c) => c.id === configId)?.gameName ?? `#${configId}`;
  const shownScores = (scores ?? []).slice(0, 100);
  const shownDetails = (details ?? []).slice(0, 200);

  return (
    <div className="card">
      <h3>Database</h3>
      <p className="muted">
        User database, stored in this browser: game_configs ({configs?.length ?? 0}) ·
        generic_scores ({scores?.length ?? 0}) · score_details ({details?.length ?? 0}).
      </p>
      <div className="row" style={{ marginBottom: 8 }}>
        {(['configs', 'scores', 'details'] as const).map((t) => (
          <button
            key={t}
            className="more-link"
            style={tab === t ? { borderColor: '#5df3ff', color: '#5df3ff' } : undefined}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          className="btn"
          title="Fix non-numeric scores (NaN/blank numbers break graphs)"
          onClick={async () => {
            const r = await repairScores();
            setMsg(
              `Checked ${r.checked} scores, fixed ${r.fixed}.` +
                (r.notes.length > 0 ? ` ${r.notes.join('; ')}${r.fixed > r.notes.length ? '…' : ''}` : ''),
            );
          }}
        >
          Scan & repair
        </button>
        {tab === 'configs' && (
          <>
            <button className="btn" onClick={() => downloadFile(`ritsu-configs-${Date.now()}.json`, JSON.stringify(configs ?? [], null, 2))}>Export</button>
            <button className="btn" onClick={async () => { if (confirm('Delete ALL game configs? Scores will lose their game names.')) { await db.game_configs.clear(); setMsg('Configs cleared.'); } }}>Clear</button>
          </>
        )}
        {tab === 'scores' && (
          <>
            <button className="btn" onClick={() => downloadFile(`ritsu-scores-${Date.now()}.json`, JSON.stringify(scores ?? [], null, 2))}>Export</button>
            <button className="btn" onClick={async () => { if (confirm('Delete ALL scores and details?')) { await clearAllData(); setMsg('Scores cleared.'); } }}>Clear</button>
          </>
        )}
        {tab === 'details' && (
          <>
            <button className="btn" onClick={() => downloadFile(`ritsu-details-${Date.now()}.json`, JSON.stringify(details ?? [], null, 2))}>Export</button>
            <button className="btn" onClick={async () => { if (confirm('Delete ALL score details? Scores will keep only generic columns.')) { await db.score_details.clear(); setMsg('Details cleared.'); } }}>Clear</button>
          </>
        )}
      </div>
      {msg && <p className="muted">{msg}</p>}
      {tab === 'configs' && (
        <table className="data">
          <thead><tr><th>ID</th><th>Game</th><th>Ver</th><th>Config JSON</th><th /></tr></thead>
          <tbody>
            {(configs ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.gameName}</td>
                <td>{c.configVersion}</td>
                <td><span className="mini-sub">{c.configData.slice(0, 80)}{c.configData.length > 80 ? '…' : ''}</span></td>
                <td><button className="more-link" onClick={() => c.id != null && db.game_configs.delete(c.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === 'scores' && (
        <>
          <table className="data">
            <thead><tr><th>ID</th><th>Game</th><th>Song</th><th>Diff</th><th>Score</th><th>Acc</th><th>Rank</th><th>Played</th><th /></tr></thead>
            <tbody>
              {shownScores.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{gameOf(s.configId)}</td>
                  <td>{s.songTitle}</td>
                  <td>{s.difficultyName} {s.difficultyVal}</td>
                  <td>{s.totalScore.toLocaleString()}</td>
                  <td>{s.accuracy.toFixed(2)}%</td>
                  <td>{s.playRank}</td>
                  <td>{new Date(s.playTimestamp).toLocaleString()}</td>
                  <td><button className="more-link" onClick={() => s.id != null && deleteScore(s.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(scores?.length ?? 0) > 100 && <p className="muted">Showing first 100 of {scores?.length}.</p>}
        </>
      )}
      {tab === 'details' && (
        <>
          <table className="data">
            <thead><tr><th>ID</th><th>Score</th><th>Key</th><th>Value</th><th>Category</th><th /></tr></thead>
            <tbody>
              {shownDetails.map((d) => (
                <tr key={d.detailId}>
                  <td>{d.detailId}</td>
                  <td>{d.scoreId}</td>
                  <td><kbd>{d.key}</kbd></td>
                  <td>{d.value}</td>
                  <td>{d.category}</td>
                  <td><button className="more-link" onClick={() => d.detailId != null && db.score_details.delete(d.detailId)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(details?.length ?? 0) > 200 && <p className="muted">Showing first 200 of {details?.length}.</p>}
        </>
      )}
    </div>
  );
}
