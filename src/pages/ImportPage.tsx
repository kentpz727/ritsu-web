import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveFullScore } from '../lib/db/dexie.ts';
import { loadImage, readConfigBoxes, getMatchCandidates, type BenchField, type BenchGeneric } from '../lib/ocr/bench.ts';
import { parseGameConfig, type GameConfigData } from '../lib/config/types.ts';
import { subscribePastedFiles } from '../lib/pasteBus.ts';

interface Job {
  id: string;
  name: string;
  status: string;
  results: BenchField[];
  saved: boolean;
  /** Set when the core trio (title/score/accuracy) read fine but other metrics failed. */
  pending?: {
    generic: BenchGeneric;
    details: Array<{ key: string; value: string; category: string }>;
    playTimestamp: number;
    missing: string[];
  };
}

// Web replacement for NotificationService live-capture: bulk screenshot import.
// Every box the game config defines is OCR'd; the score saves automatically
// only when all required metrics read successfully, else it waits for review.
export default function ImportPage() {
  const configs = useLiveQuery(() => db.game_configs.toArray(), []);
  const [configId, setConfigId] = useState<number | ''>('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [engine, setEngine] = useState<'tesseract' | 'paddle'>('tesseract');
  const [paddleLang, setPaddleLang] = useState('ch');
  // Screenshots arriving via clipboard paste (Print Screen -> Ctrl+V).
  const [staged, setStaged] = useState<Array<{ id: number; file: File; url: string }>>([]);
  const [pasteMsg, setPasteMsg] = useState('');
  const stageId = useRef(1);
  const configRef = useRef(configId);
  configRef.current = configId;
  const runOcrRef = useRef<(files: FileList | File[]) => Promise<void>>(async () => {});
  const handleIncomingRef = useRef<(files: File[]) => void>(() => {});

  function stageFiles(files: File[]) {
    setStaged((prev) => [...prev, ...files.map((file) => ({ id: stageId.current++, file, url: URL.createObjectURL(file) }))]);
  }

  function removeStaged(id: number) {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((s) => s.id !== id);
    });
  }

  // Shared entry for pasted images: auto-run when a game is already picked,
  // otherwise stage for one-tap import once the user picks one.
  handleIncomingRef.current = (files: File[]) => {
    if (configRef.current !== '') {
      setPasteMsg(`Pasted ${files.length} screenshot(s) — importing…`);
      void runOcrRef.current(files);
    } else {
      stageFiles(files);
      setPasteMsg(`Pasted ${files.length} screenshot(s) — pick a game config, then Import pasted.`);
    }
  };

  useEffect(() => subscribePastedFiles((b) => handleIncomingRef.current(b.files)), []);
  useEffect(
    () => () => {
      setStaged((prev) => {
        for (const s of prev) URL.revokeObjectURL(s.url);
        return prev;
      });
    },
    [],
  );

  async function pasteFromClipboard() {
    try {
      const nav = navigator as Navigator & { clipboard?: { read?: () => Promise<ClipboardItem[]> } };
      if (!nav.clipboard?.read) {
        setPasteMsg('Clipboard read is not supported here — copy a screenshot, then press Ctrl+V.');
        return;
      }
      const items = await nav.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `pasted-${Date.now()}.png`, { type }));
      }
      if (files.length === 0) {
        setPasteMsg('No image in the clipboard — copy a screenshot first.');
        return;
      }
      handleIncomingRef.current(files);
    } catch {
      setPasteMsg('Clipboard is blocked — copy a screenshot, then press Ctrl+V instead.');
    }
  }

  function patchJob(id: string, patch: Partial<Job>) {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  async function runOcr(files: FileList | File[]) {
    const list = [...files];
    if (configId === '') {
      setJobs([{ id: 'none', name: '-', status: 'Pick a game config first', results: [], saved: false }]);
      return;
    }
    const row = await db.game_configs.get(Number(configId));
    if (!row) return;
    let cfg: GameConfigData;
    try {
      cfg = parseGameConfig(row.configData);
    } catch (e) {
      setJobs([{ id: 'bad', name: '-', status: `Bad config: ${(e as Error).message}`, results: [], saved: false }]);
      return;
    }
    const cid = Number(configId);
    const candidates = await getMatchCandidates(cid);
    setJobs(list.map((f, i) => ({
      id: `${f.name}-${i}`,
      name: f.name,
      status: engine === 'paddle' ? 'waiting for PaddleOCR models (first run downloads them)…' : 'queued',
      results: [],
      saved: false,
    })));

    for (let fi = 0; fi < list.length; fi++) {
      const f = list[fi];
      const id = `${f.name}-${fi}`;
      const base = f.name.replace(/\.[^.]+$/, '');
      try {
        patchJob(id, { status: 'decoding…' });
        const img = await loadImage(f);
        const bench = await readConfigBoxes(img, cfg, {
          fallbackTitle: base,
          candidates,
          engine: { type: engine, lang: paddleLang },
          onStep: (label, done, total) => patchJob(id, { status: `reading ${label}… (${done}/${total})` }),
        });
        const g = bench.generic;
        if (bench.missing.length > 0) {
          // Core trio present but something else failed: ask, don't silently drop.
          const entryOk = (label: string) => bench.fields.some((r) => r.label === label && r.ok);
          const coreComplete = entryOk('Title') && entryOk('Score') && entryOk('Accuracy');
          patchJob(id, {
            status: coreComplete
              ? `partial: ${bench.missing.join(', ')} — save anyway?`
              : `needs review: ${bench.missing.join(', ')} — fix in Debug`,
            results: bench.fields,
            saved: false,
            pending: coreComplete
              ? { generic: g, details: bench.details, playTimestamp: f.lastModified || Date.now(), missing: [...bench.missing] }
              : undefined,
          });
          continue;
        }
        await saveFullScore({
          configId: cid,
          songTitle: g.title,
          difficultyName: g.difficultyName,
          difficultyVal: g.difficultyVal,
          difficultySortValue: g.difficultySortValue,
          totalScore: g.totalScore,
          maxCombo: g.maxCombo,
          accuracy: g.accuracy,
          playRank: g.playRank,
          playTimestamp: f.lastModified || Date.now(),
          details: bench.details,
        });
        patchJob(id, { status: `saved ✓ ${g.accuracy.toFixed(2)}%`, results: bench.fields, saved: true });
      } catch (e) {
        patchJob(id, { status: `error: ${(e as Error).message}`, saved: false });
      }
    }
  }

  async function savePending(job: Job) {
    if (!job.pending || configId === '') return;
    const p = job.pending;
    await saveFullScore({
      configId: Number(configId),
      songTitle: p.generic.title,
      difficultyName: p.generic.difficultyName,
      difficultyVal: p.generic.difficultyVal,
      difficultySortValue: p.generic.difficultySortValue,
      totalScore: p.generic.totalScore,
      maxCombo: p.generic.maxCombo,
      accuracy: p.generic.accuracy,
      playRank: p.generic.playRank,
      playTimestamp: p.playTimestamp,
      details: p.details,
    });
    patchJob(job.id, { status: `saved ✓ (partial: ${p.missing.join(', ')})`, saved: true, pending: undefined });
  }

  runOcrRef.current = runOcr;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title">Import / OCR</h1>
      <p className="muted">
        Drop result screenshots: every box the game config defines is read, and the score saves
        automatically only when all required metrics come through. Anything unreadable waits for
        review — complete it in Debug.
      </p>
      <p className="muted">
        Tip: press Print Screen, then Ctrl+V anywhere in the app — the screenshot imports
        directly without saving a file.
      </p>
      <div className="card">
        <div className="row">
          <select className="input" value={configId} onChange={(e) => setConfigId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Select game config…</option>
            {(configs ?? []).map((c) => <option key={c.id} value={c.id}>{c.gameName} (v{c.configVersion})</option>)}
          </select>
          <label className="btn primary">Choose screenshots<input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && runOcr(e.target.files)} /></label>
          <button className="btn" onClick={pasteFromClipboard}>Paste from clipboard</button>
        </div>
        <h4 style={{ marginBottom: 4 }}>OCR engine</h4>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div
            className="card"
            role="button"
            tabIndex={0}
            onClick={() => setEngine('tesseract')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEngine('tesseract'); }}
            style={{
              flex: '1 1 220px', cursor: 'pointer', marginBottom: 0,
              border: `1px solid ${engine === 'tesseract' ? '#5df3ff' : 'transparent'}`,
            }}
          >
            <strong>Tesseract{engine === 'tesseract' ? '' : ''}</strong>
            <div className="mini-sub">Fast, tiny download, less accurate than paddleOCR.</div>
          </div>
          <div
            className="card"
            role="button"
            tabIndex={0}
            onClick={() => setEngine('paddle')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEngine('paddle'); }}
            style={{
              flex: '1 1 220px', cursor: 'pointer', marginBottom: 0,
              border: `1px solid ${engine === 'paddle' ? '#5df3ff' : 'transparent'}`,
            }}
          >
            <strong>PaddleOCR (pilot){engine === 'paddle' ? '' : ''}</strong>
            <div className="mini-sub">Better accuracy than Tesseract but requires to download 15mb engine.</div>
          </div>
        </div>
        {engine === 'paddle' && (
          <div className="row" style={{ marginTop: 8 }}>
            <select className="input" style={{ maxWidth: 200 }} value={paddleLang} onChange={(e) => setPaddleLang(e.target.value)} aria-label="PaddleOCR language">
              <option value="ch">ch (CN+EN)</option>
              <option value="japan">japan</option>
              <option value="en">en</option>
            </select>
            <span className="muted">Match the screenshot's script for best results.</span>
          </div>
        )}
        {pasteMsg && <p className="muted">{pasteMsg}</p>}
        {staged.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              {staged.map((s) => (
                <span key={s.id} style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={s.url} alt="pasted screenshot" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #E6F3F4' }} />
                  <button
                    className="icon-btn"
                    title="Remove"
                    onClick={() => removeStaged(s.id)}
                    style={{ position: 'absolute', top: -10, right: -10, background: '#081625', border: '1px solid #E6F3F4' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn primary"
                disabled={configId === ''}
                onClick={() => {
                  const files = staged.map((s) => s.file);
                  setStaged((prev) => {
                    for (const x of prev) URL.revokeObjectURL(x.url);
                    return [];
                  });
                  setPasteMsg('');
                  void runOcr(files);
                }}
              >
                Import pasted ({staged.length})
              </button>
            </div>
          </div>
        )}
        {jobs.map((j) => (
          <div key={j.id} style={{ marginTop: 8 }}>
            <div className="board-row">
              <span className="mini">{j.name}</span>
              <span className="mini-sub" style={{ marginLeft: 'auto' }}>{j.status}</span>
            </div>
            {!j.saved && j.pending && (
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn primary" onClick={() => savePending(j)}>Save anyway</button>
                <span className="muted">Title, score and accuracy are in — the rest stays empty.</span>
              </div>
            )}
            {j.results.length > 0 && (
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                {j.results.map((r, i) => (
                  <span
                    key={`${r.label}-${i}`}
                    className="mini-sub"
                    title={r.guessedFrom ? `raw: "${r.raw}"` : r.auto ? 'Automatic (no box / derived)' : undefined}
                    style={{ border: '1px solid #13304f', borderRadius: 6, padding: '2px 8px', opacity: r.ok ? 1 : 0.75 }}
                  >
                    {r.label}: {r.guessedFrom ? `≈${r.value}` : r.value} {r.ok ? '✓' : '✗'}{r.auto ? ' (auto)' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
