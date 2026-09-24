import { useState } from 'react';
import { updateFullScore, type FullScore } from '../lib/db/dexie.ts';
import type { GameConfigData } from '../lib/config/types.ts';
import { useScoreForm } from './useScoreForm.ts';

const errStyle = { color: '#ff9d9d', fontSize: 11 } as const;

/** Edit a saved score. Nothing persists unless every changed detail validates. */
export function EditScoreDialog({
  item,
  config,
  onClose,
}: {
  item: FullScore;
  config?: GameConfigData | null;
  onClose: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const f = useScoreForm(config ?? null, {
    songTitle: item.score.songTitle,
    difficultyName: item.score.difficultyName,
    difficultyVal: item.score.difficultyVal,
    totalScore: String(item.score.totalScore),
    maxCombo: String(item.score.maxCombo),
    accuracy: String(item.score.accuracy),
    playRank: item.score.playRank,
    playedAt: item.score.playTimestamp,
    dyn: Object.fromEntries(item.details.map((d) => [d.key, d.value])),
  });

  async function save() {
    const { errors: errs, collected } = f.collect();
    setErrors(errs);
    if (!collected || item.score.id == null) return;
    setSaving(true);
    try {
      const { details: _ignored, ...patch } = collected;
      // Without its game config the metric fields can't render — preserve them as-is.
      const details = config
        ? collected.details
        : item.details.map((d) => ({ key: d.key, value: d.value, category: d.category }));
      await updateFullScore(item.score.id, patch, details);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.52)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg)', marginBottom: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Edit score — {item.score.songTitle}</h3>
        <p className="muted">Change anything; invalid values block saving and are flagged below.</p>
        {!config && (
          <p className="muted">Game config missing — generic fields stay editable, saved metrics are preserved untouched.</p>
        )}
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
        {config && (config.judgments?.length || config.metrics?.length || config.misc?.length) ? (
          <>
            <h4 style={{ marginBottom: 4 }}>Game metrics — {config.gameName}</h4>
            <div className="row">
              {[...(config.judgments ?? []).map((fld) => ({ ...fld })), ...(config.metrics ?? []).map((fld) => ({ ...fld }))].map((fld, i) => (
                <label key={`${fld.key}-${i}`} style={{ fontSize: 12, minWidth: 130, flex: 1 }}>{fld.label} ({fld.key})
                  <input className="input" value={f.dyn[fld.key] ?? ''} onChange={(e) => f.setDyn({ ...f.dyn, [fld.key]: e.target.value })} placeholder={fld.type === 'number' ? '0' : 'text'} />
                  {errors[`dyn:${fld.key}`] && <div style={errStyle}>{errors[`dyn:${fld.key}`]}</div>}
                </label>
              ))}
              {(config.misc ?? []).map((fld, i) => (
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
        ) : null}
        {f.computedMode && config?.judgments?.length && f.computedAccuracy != null && (
            <p className="muted" style={{ marginTop: 8 }}>
              Accuracy (weighted): <strong>{f.computedAccuracy.toFixed(2)}%</strong>
            </p>
        )}
        {f.comboFallback && config?.judgments?.length && f.fallbackCombo != null && (
          <p className="muted" style={{ marginTop: 8 }}>
            Combo (hits, no combo box): <strong>{f.fallbackCombo}x</strong>
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={save} disabled={saving}>Save changes</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
