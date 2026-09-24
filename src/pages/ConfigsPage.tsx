import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setGameIcon, upsertConfig } from '../lib/db/dexie.ts';
import { dedupeKeys, parseGameConfig } from '../lib/config/types.ts';
import { GameIcon, fileToIconBlob } from '../components/gameIcon.tsx';

export default function ConfigsPage() {
  const configs = useLiveQuery(() => db.game_configs.toArray(), []);
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState('{\n  "gameName": "New Game",\n  "configVersion": 1,\n  "judgments": []\n}');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVersion, setNewVersion] = useState('1');
  const [addErr, setAddErr] = useState('');

  async function submitAdd() {
    const clean = newName.trim();
    if (!clean) {
      setAddErr('Give the game a name.');
      return;
    }
    if ((configs ?? []).some((c) => c.gameName.toLowerCase() === clean.toLowerCase())) {
      setAddErr(`A config for "${clean}" already exists.`);
      return;
    }
    const ver = Number.parseInt(newVersion, 10);
    if (!Number.isFinite(ver) || ver < 1) {
      setAddErr('Version must be a positive whole number.');
      return;
    }
    const blank = {
      gameName: clean,
      configVersion: ver,
      judgments: [],
      metrics: [],
      misc: [],
      useRankOcr: true,
      useAccuracyOcr: false,
    };
    await upsertConfig(clean, JSON.stringify(blank), ver);
    setNewName('');
    setNewVersion('1');
    setAddErr('');
    setShowAdd(false);
    setMsg(`Created blank config for ${clean} — open BoxEditor to add its metrics.`);
  }

  async function importJson(text: string) {
    try {
      const cfg = parseGameConfig(text);
      const { cfg: clean, renamed } = dedupeKeys(cfg);
      await upsertConfig(clean.gameName, JSON.stringify(clean), clean.configVersion ?? 1);
      setMsg(
        `Imported ${clean.gameName}` +
          (renamed.length > 0 ? ` (duplicate keys renamed: ${renamed.map((r) => `${r.from} → ${r.to}`).join(', ')})` : ''),
      );
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title">Manage Configs</h1>
      <p className="muted">Configs declare a game's metrics and screenshot boxes. Re-importing a newer version updates in place; existing logos are kept.</p>
      {(configs ?? []).map((c) => (
        <div className="card" key={c.id}>
          <div className="row">
            {c.id != null && <GameIcon configId={c.id} label={c.gameName} size={60} />}
            <strong>{c.gameName}</strong>
            <span className="muted">v{c.configVersion}</span>
            <span style={{ flex: 1 }} />
            <Link className="btn" to={`/editor/${c.id}`}>BoxEditor</Link>
            <label className="btn">Logo<input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f || c.id == null) return;
                try {
                  await setGameIcon(c.id, await fileToIconBlob(f));
                  setMsg(`Logo set for ${c.gameName}.`);
                } catch (err) {
                  setMsg(`Logo failed: ${(err as Error).message}`);
                }
              }}
            /></label>
            {c.displayIcon && (
              <button className="btn" onClick={async () => { if (c.id != null) { await setGameIcon(c.id, null); setMsg(`Logo removed for ${c.gameName}.`); } }}>
                Remove logo
              </button>
            )}
            <button className="btn" onClick={() => {
              const blob = new Blob([c.configData], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${c.gameName}.json`;
              a.click();
            }}>Export</button>
            <button className="btn" onClick={() => c.id && db.game_configs.delete(c.id)}>Delete</button>
          </div>
        </div>
      ))}
      <div className="card">
        <h3>New / Import</h3>
        <div className="row">
          <button className="btn primary" onClick={() => { setAddErr(''); setShowAdd(true); }}>Add config</button>
          <label className="btn">Import file<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0]?.text().then(importJson)} /></label>
          <button className="btn" onClick={() => importJson(draft)}>Save draft</button>
        </div>
        <textarea className="input" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ marginTop: 12, fontFamily: 'monospace' }} />
        {msg && <p className="muted">{msg}</p>}
      </div>
      {showAdd && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.52)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowAdd(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 440, width: '100%', background: 'var(--bg)', marginBottom: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Add game config</h3>
            <p className="muted">Start blank, then shape its metrics, boxes, and logo in the BoxEditor.</p>
            <label style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>Game name
              <input
                className="input"
                value={newName}
                autoFocus
                placeholder="e.g. Project Sekai"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
              />
            </label>
            <label style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>Version
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
              />
            </label>
            {addErr && <p style={{ color: '#ff9d9d', fontSize: 12 }}>{addErr}</p>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={submitAdd}>Create</button>
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
