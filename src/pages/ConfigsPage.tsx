import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listConfigs, listDeletedConfigs, setGameIcon, softDeleteConfig, restoreConfig, countScoresForConfig, upsertConfig, type GameConfigRow } from '../lib/db/dexie.ts';
import { dedupeKeys, parseGameConfig } from '../lib/config/types.ts';
import { canConfirmDelete, configDeleteImpact } from '../lib/config/deleteImpact.ts';
import { GameIcon, fileToIconBlob } from '../components/gameIcon.tsx';

export default function ConfigsPage() {
  const configs = useLiveQuery(() => listConfigs(), []);
  const deletedConfigs = useLiveQuery(() => listDeletedConfigs(), []);
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState('{\n  "gameName": "New Game",\n  "configVersion": 1,\n  "judgments": []\n}');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVersion, setNewVersion] = useState('1');
  const [addErr, setAddErr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GameConfigRow | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteCount, setDeleteCount] = useState<number | null>(null);
  const [lastDeleted, setLastDeleted] = useState<{ id: number; name: string; count: number } | null>(null);

  async function askDelete(c: GameConfigRow) {
    if (c.id == null) return;
    setDeleteTarget(c);
    setDeleteInput('');
    setDeleteCount(null);
    setDeleteCount(await countScoresForConfig(c.id));
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    const count = await softDeleteConfig(deleteTarget.id);
    setLastDeleted({ id: deleteTarget.id, name: deleteTarget.gameName, count });
    setMsg(`Deleted ${deleteTarget.gameName}; ${count} score${count === 1 ? '' : 's'} unlinked.`);
    setDeleteTarget(null);
    setDeleteInput('');
  }

  async function undoDelete(id: number, name: string) {
    const count = await restoreConfig(id);
    setLastDeleted(null);
    setMsg(`Restored ${name} and ${count} score link${count === 1 ? '' : 's'}.`);
  }

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
      {lastDeleted && (
        <p className="muted">
          Deleted {lastDeleted.name}; {lastDeleted.count} score{lastDeleted.count === 1 ? '' : 's'} unlinked.{' '}
          <button className="btn" onClick={() => undoDelete(lastDeleted.id, lastDeleted.name)}>Undo</button>
        </p>
      )}
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
            <button className="btn" onClick={() => askDelete(c)}>Delete</button>
          </div>
        </div>
      ))}
      {(deletedConfigs ?? []).length > 0 && (
        <div className="card">
          <h3>Recently deleted</h3>
          <p className="muted">Deleted configs stay here until restored. Their scores are unlinked while deleted.</p>
          {(deletedConfigs ?? []).map((c) => (
            <div className="row" key={c.id} style={{ marginBottom: 8 }}>
              <strong>{c.gameName}</strong>
              <span className="muted">
                {c.deletedScoreIds?.length ?? 0} score{(c.deletedScoreIds?.length ?? 0) === 1 ? '' : 's'}
                {c.deletedAt ? ` · deleted ${new Date(c.deletedAt).toLocaleString()}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => c.id != null && undoDelete(c.id, c.gameName)}>Restore</button>
            </div>
          ))}
        </div>
      )}
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
      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.52)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-label="Delete config"
            style={{ maxWidth: 440, width: '100%', background: 'var(--bg)', marginBottom: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Delete {deleteTarget.gameName}?</h3>
            <p className="muted">
              {deleteCount == null ? 'Counting linked scores…' : configDeleteImpact(deleteCount, deleteTarget.gameName)}
            </p>
            <label style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>Type the game name to confirm
              <input
                className="input"
                value={deleteInput}
                autoFocus
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canConfirmDelete(deleteInput, deleteTarget.gameName)) confirmDelete(); }}
              />
            </label>
            <div className="row">
              <button
                className="btn"
                style={{ color: '#ff9d9d' }}
                disabled={deleteCount == null || !canConfirmDelete(deleteInput, deleteTarget.gameName)}
                onClick={confirmDelete}
              >
                Delete config
              </button>
              <button className="btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
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
