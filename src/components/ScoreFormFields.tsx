import type { GameConfigData } from '../lib/config/types.ts';
import type { ScoreFormController } from './useScoreForm.ts';

const errStyle = { color: '#ff9d9d', fontSize: 11 } as const;

/**
 * Fields shared by manual entry and score editing — one markup/validation
 * surface for both write paths (P-10). Validation itself lives in useScoreForm.
 */
export function ScoreFormFields({
  f,
  errors,
  config,
  showNoMetricsHint = false,
  showFallbackHints = false,
}: {
  f: ScoreFormController;
  errors: Record<string, string>;
  config: GameConfigData | null;
  /** Manual entry explains an empty metric list; the edit dialog stays quiet. */
  showNoMetricsHint?: boolean;
  /** Manual entry explains computed accuracy/combo; the edit dialog omitted these hints. */
  showFallbackHints?: boolean;
}) {
  const hasMetrics =
    !!config &&
    ((config.judgments?.length ?? 0) > 0 ||
      (config.metrics?.length ?? 0) > 0 ||
      (config.misc?.length ?? 0) > 0);
  const hasJudgments = (config?.judgments?.length ?? 0) > 0;

  return (
    <>
      <div className="row">
        <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
          playedAt
          <input
            className="input"
            type="datetime-local"
            value={f.playedAt}
            onChange={(e) => f.setPlayedAt(e.target.value)}
          />
          {errors.playedAt && <div style={errStyle}>{errors.playedAt}</div>}
        </label>
        <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
          songTitle
          <input
            className="input"
            value={f.form.songTitle}
            onChange={(e) => f.setForm({ ...f.form, songTitle: e.target.value })}
          />
          {errors.songTitle && <div style={errStyle}>{errors.songTitle}</div>}
        </label>
        {f.showDiffName && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
            difficultyName
            <input
              className="input"
              value={f.form.difficultyName}
              onChange={(e) => f.setForm({ ...f.form, difficultyName: e.target.value })}
            />
          </label>
        )}
        {f.showLevel && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
            difficultyVal (level)
            <input
              className="input"
              value={f.form.difficultyVal}
              onChange={(e) => f.setForm({ ...f.form, difficultyVal: e.target.value })}
            />
            {errors.difficultyVal && <div style={errStyle}>{errors.difficultyVal}</div>}
          </label>
        )}
        {f.showScore && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
            totalScore
            <input
              className="input"
              value={f.form.totalScore}
              onChange={(e) => f.setForm({ ...f.form, totalScore: e.target.value })}
            />
            {errors.totalScore && <div style={errStyle}>{errors.totalScore}</div>}
          </label>
        )}
        {f.showCombo && !f.comboFallback && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
            maxCombo
            <input
              className="input"
              value={f.form.maxCombo}
              onChange={(e) => f.setForm({ ...f.form, maxCombo: e.target.value })}
            />
            {errors.maxCombo && <div style={errStyle}>{errors.maxCombo}</div>}
          </label>
        )}
        {f.showAccuracy && !f.computedMode && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
            accuracy
            <input
              className="input"
              value={f.form.accuracy}
              onChange={(e) => f.setForm({ ...f.form, accuracy: e.target.value })}
            />
            {errors.accuracy && <div style={errStyle}>{errors.accuracy}</div>}
          </label>
        )}
        {f.showRank && (
          <label style={{ fontSize: 12, minWidth: 150, flex: 1 }}>
            playRank
            <input
              className="input"
              value={f.form.playRank}
              onChange={(e) => f.setForm({ ...f.form, playRank: e.target.value })}
            />
            {errors.playRank && <div style={errStyle}>{errors.playRank}</div>}
          </label>
        )}
      </div>

      {config && hasMetrics ? (
        <>
          <h3 style={{ marginBottom: 4 }}>Game metrics — {config.gameName}</h3>
          <div className="row">
            {[...(config.judgments ?? []), ...(config.metrics ?? [])].map((fld, i) => (
              <label key={`${fld.key}-${i}`} style={{ fontSize: 12, minWidth: 130, flex: 1 }}>
                {fld.label} ({fld.key})
                <input
                  className="input"
                  value={f.dyn[fld.key] ?? ''}
                  onChange={(e) => f.setDyn({ ...f.dyn, [fld.key]: e.target.value })}
                  placeholder={fld.type === 'number' ? '0' : 'text'}
                />
                {errors[`dyn:${fld.key}`] && <div style={errStyle}>{errors[`dyn:${fld.key}`]}</div>}
              </label>
            ))}
            {(config.misc ?? []).map((fld, i) =>
              fld.type === 'boolean' ? (
                <label key={`${fld.key}-${i}`} style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={(f.dyn[fld.key] ?? '') === 'true'}
                    onChange={(e) =>
                      f.setDyn({ ...f.dyn, [fld.key]: e.target.checked ? 'true' : 'false' })
                    }
                  />{' '}
                  {fld.label}
                  {(f.dyn[fld.key] ?? '') === '' ? ' —' : ''}
                </label>
              ) : (
                <label key={`${fld.key}-${i}`} style={{ fontSize: 12, minWidth: 130, flex: 1 }}>
                  {fld.label} ({fld.key})
                  <input
                    className="input"
                    value={f.dyn[fld.key] ?? ''}
                    onChange={(e) => f.setDyn({ ...f.dyn, [fld.key]: e.target.value })}
                  />
                  {errors[`dyn:${fld.key}`] && <div style={errStyle}>{errors[`dyn:${fld.key}`]}</div>}
                </label>
              ),
            )}
          </div>
        </>
      ) : showNoMetricsHint && config ? (
        <p className="muted">No custom metrics defined for {config.gameName} — add some in the BoxEditor.</p>
      ) : null}

      {f.computedMode && hasJudgments && f.computedAccuracy != null && (
        <p className="muted" style={{ marginTop: 8 }}>
          Accuracy (weighted): <strong>{f.computedAccuracy.toFixed(2)}%</strong>
        </p>
      )}
      {showFallbackHints && f.computedMode && !hasJudgments && (
        <p className="muted" style={{ marginTop: 8 }}>
          No accuracy on screen and no judgments defined — add judgments in the BoxEditor to compute accuracy.
        </p>
      )}
      {f.comboFallback && hasJudgments && f.fallbackCombo != null && (
        <p className="muted" style={{ marginTop: 8 }}>
          Combo (hits, no combo box): <strong>{f.fallbackCombo}x</strong>
        </p>
      )}
      {showFallbackHints && f.comboFallback && !hasJudgments && (
        <p className="muted" style={{ marginTop: 8 }}>
          No combo box and no judgments defined — add judgments in the BoxEditor to derive combo.
        </p>
      )}
    </>
  );
}
