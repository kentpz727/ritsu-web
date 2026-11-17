import { useState } from 'react';
import { updateFullScore, type FullScore } from '../lib/db/dexie.ts';
import type { GameConfigData } from '../lib/config/types.ts';
import { errorMessage, logError } from '../lib/errors.ts';
import { ScoreFormFields } from './ScoreFormFields.tsx';
import { useToast } from './toast.ts';
import { useScoreForm } from './useScoreForm.ts';

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
  const toast = useToast();
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
    } catch (e) {
      logError('score update', e, { scoreId: item.score.id });
      toast(`Could not save changes: ${errorMessage(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.52)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: 640,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg)',
          marginBottom: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Edit score — {item.score.songTitle}</h2>
        <p className="muted">Change anything; invalid values block saving and are flagged below.</p>
        {!config && (
          <p className="muted">
            Game config missing — generic fields stay editable, saved metrics are preserved untouched.
          </p>
        )}
        <ScoreFormFields f={f} errors={errors} config={config ?? null} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={save} disabled={saving}>
            Save changes
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
