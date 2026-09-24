import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveFullScore } from '../lib/db/dexie.ts';
import { parseGameConfig, type GameConfigData } from '../lib/config/types.ts';
import { useScoreForm } from './useScoreForm.ts';

const errStyle = { color: '#ff9d9d', fontSize: 11 } as const;

/** Manual score entry (lives in the Debug section): fix-up for screenshots that failed auto-import. */
export function ManualEntryForm() {
  const configs = useLiveQuery(() => db.game_configs.toArray(), []);
  const [configId, setConfigId] = useState<number | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedCfg: GameConfigData | null = useMemo(() => {
    const row = (configs ?? []).find((c) => c.id === configId);
    if (!row) return null;
    try {
      return parseGameConfig(row.configData);
    } catch {
      return null;
    }
  }, [configs, configId]);

  const f = useScoreForm(selectedCfg);

  useEffect(() => {
    f.setDyn({});
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId]);

  async function saveManual() {
    if (configId === '') return;
    const { errors: errs, collected } = f.collect();
    setErrors(errs);
    if (!collected) return;
    await saveFullScore({ configId: Number(configId), ...collected });
    f.reset();
    setErrors({});
    alert('Score saved to IndexedDB.');
  }

  return (
    <div className="card">
      <h3>Manual entry</h3>
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="input" value={configId} onChange={(e) => setConfigId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Select game config…</option>
          {(configs ?? []).map((c) => <option key={c.id} value={c.id}>{c.gameName} (v{c.configVersion})</option>)}
        </select>
      </div>
      <div className="row">
        <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>playedAt
          <input className="input" type="datetime-local" value={f.playedAt} onChange={(e) => f.setPlayedAt(e.target.value)} />
          {errors.playedAt && <div style={errStyle}>{errors.playedAt}</div>}
        </label>
        <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>songTitle
          <input className="input" value={f.form.songTitle} onChange={(e) => f.setForm({ ...f.form, songTitle: e.target.value })} />
          {errors.songTitle && <div style={errStyle}>{errors.songTitle}</div>}
        </label>
        {f.showDiffName && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>difficultyName
            <input className="input" value={f.form.difficultyName} onChange={(e) => f.setForm({ ...f.form, difficultyName: e.target.value })} />
          </label>
        )}
        {f.showLevel && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>difficultyVal (level)
            <input className="input" value={f.form.difficultyVal} onChange={(e) => f.setForm({ ...f.form, difficultyVal: e.target.value })} />
            {errors.difficultyVal && <div style={errStyle}>{errors.difficultyVal}</div>}
          </label>
        )}
        {f.showScore && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>totalScore
            <input className="input" value={f.form.totalScore} onChange={(e) => f.setForm({ ...f.form, totalScore: e.target.value })} />
            {errors.totalScore && <div style={errStyle}>{errors.totalScore}</div>}
          </label>
        )}
        {f.showCombo && !f.comboFallback && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>maxCombo
            <input className="input" value={f.form.maxCombo} onChange={(e) => f.setForm({ ...f.form, maxCombo: e.target.value })} />
            {errors.maxCombo && <div style={errStyle}>{errors.maxCombo}</div>}
          </label>
        )}
        {f.showAccuracy && !f.computedMode && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>accuracy
            <input className="input" value={f.form.accuracy} onChange={(e) => f.setForm({ ...f.form, accuracy: e.target.value })} />
            {errors.accuracy && <div style={errStyle}>{errors.accuracy}</div>}
          </label>
        )}
        {f.showRank && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>playRank
            <input className="input" value={f.form.playRank} onChange={(e) => f.setForm({ ...f.form, playRank: e.target.value })} />
            {errors.playRank && <div style={errStyle}>{errors.playRank}</div>}
          </label>
        )}
      </div>
      {selectedCfg && (selectedCfg.judgments?.length || selectedCfg.metrics?.length || selectedCfg.misc?.length) ? (
        <>
          <h4 style={{ marginBottom: 4 }}>Game metrics — {selectedCfg.gameName}</h4>
          <div className="row">
            {[...(selectedCfg.judgments ?? []).map((fld) => ({ ...fld, category: 'Judgment' })), ...(selectedCfg.metrics ?? []).map((fld) => ({ ...fld, category: 'Metric' }))].map((fld, i) => (
              <label key={`${fld.key}-${i}`} style={{ fontSize: 12, minWidth: 130, flex: 1 }}>{fld.label} ({fld.key})
                <input className="input" value={f.dyn[fld.key] ?? ''} onChange={(e) => f.setDyn({ ...f.dyn, [fld.key]: e.target.value })} placeholder={fld.type === 'number' ? '0' : 'text'} />
                {errors[`dyn:${fld.key}`] && <div style={errStyle}>{errors[`dyn:${fld.key}`]}</div>}
              </label>
            ))}
            {(selectedCfg.misc ?? []).map((fld, i) => (
              fld.type === 'boolean' ? (
                <label key={`${fld.key}-${i}`} style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={(f.dyn[fld.key] ?? '') === 'true'} onChange={(e) => f.setDyn({ ...f.dyn, [fld.key]: e.target.checked ? 'true' : 'false' })} /> {fld.label}
                </label>
              ) : (
                <label key={`${fld.key}-${i}`} style={{ fontSize: 12, minWidth: 130, flex: 1 }}>{fld.label} ({fld.key})
                  <input className="input" value={f.dyn[fld.key] ?? ''} onChange={(e) => f.setDyn({ ...f.dyn, [fld.key]: e.target.value })} />
                  {errors[`dyn:${fld.key}`] && <div style={errStyle}>{errors[`dyn:${fld.key}`]}</div>}
                </label>
              )
            ))}
          </div>
        </>
      ) : (
        selectedCfg && <p className="muted">No custom metrics defined for {selectedCfg.gameName} — add some in the BoxEditor.</p>
      )}
      {f.computedMode && (
        selectedCfg?.judgments?.length ? (
          f.computedAccuracy != null && (
              <p className="muted" style={{ marginTop: 8 }}>
                Accuracy (weighted): <strong>{f.computedAccuracy.toFixed(2)}%</strong>
              </p>
          )
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>No accuracy on screen and no judgments defined — add judgments in the BoxEditor to compute accuracy.</p>
        )
      )}
      {f.comboFallback && (
        selectedCfg?.judgments?.length ? (
          f.fallbackCombo != null && (
            <p className="muted" style={{ marginTop: 8 }}>
              Combo (hits, no combo box): <strong>{f.fallbackCombo}x</strong>
            </p>
          )
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>No combo box and no judgments defined — add judgments in the BoxEditor to derive combo.</p>
        )
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={saveManual} disabled={configId === ''}>Save score</button>
      </div>
    </div>
  );
}
