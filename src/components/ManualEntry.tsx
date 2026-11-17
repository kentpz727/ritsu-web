import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listConfigs, saveFullScore } from '../lib/db/dexie.ts';
import { parseGameConfig, type GameConfigData } from '../lib/config/types.ts';
import { errorMessage, logError } from '../lib/errors.ts';
import { ScoreFormFields } from './ScoreFormFields.tsx';
import { useToast } from './toast.ts';
import { useScoreForm } from './useScoreForm.ts';

const errStyle = { color: '#ff9d9d', fontSize: 11 } as const;

/** Manual score entry (lives in the Debug section): fix-up for screenshots that failed auto-import. */
export function ManualEntryForm() {
  const configs = useLiveQuery(() => listConfigs(), []);
  const toast = useToast();
  const [configId, setConfigId] = useState<number | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selected = useMemo((): { config: GameConfigData | null; error: string | null } => {
    const row = (configs ?? []).find((c) => c.id === configId);
    if (!row) return { config: null, error: null };
    try {
      return { config: parseGameConfig(row.configData), error: null };
    } catch (e) {
      logError('manual config parse', e, { configId });
      return { config: null, error: errorMessage(e) };
    }
  }, [configs, configId]);
  const selectedCfg = selected.config;

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
    try {
      const saved = await saveFullScore({ configId: Number(configId), ...collected });
      f.reset();
      setErrors({});
      toast(
        saved.duplicate ? 'This play is already in the library — duplicate skipped.' : 'Score saved to IndexedDB.',
        saved.duplicate ? 'info' : 'success',
      );
    } catch (e) {
      logError('manual save', e, { configId });
      toast(`Could not save score: ${errorMessage(e)}`, 'error');
    }
  }

  return (
    <div className="card">
      <h2>Manual entry</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <select
          className="input"
          value={configId}
          onChange={(e) => setConfigId(e.target.value === '' ? '' : Number(e.target.value))}
          aria-label="Game config"
        >
          <option value="">Select game config…</option>
          {(configs ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.gameName} (v{c.configVersion})
            </option>
          ))}
        </select>
      </div>
      {selected.error && <p style={errStyle}>Could not read this game config: {selected.error}</p>}
      <ScoreFormFields
        f={f}
        errors={errors}
        config={selectedCfg}
        showNoMetricsHint
        showFallbackHints
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={saveManual} disabled={configId === ''}>
          Save score
        </button>
      </div>
    </div>
  );
}
