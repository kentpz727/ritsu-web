import { isMissField } from '../lib/calc/scoring.ts';
import { listKeyOf } from '../lib/config/boxGeometry.ts';
import {
  GENERIC_SLOTS,
  PRESET_FIELDS,
  type ConfigCategory,
  type ConfigFieldType,
  type OcrRect,
} from '../lib/config/types.ts';
import type { BoxEditorController } from './useBoxEditor.ts';

/** Slots, per-category field CRUD, weighting, and add-metric form (P-10). */
export function FieldPanel({ ed }: { ed: BoxEditorController }) {
  const { cfg } = ed;
  return (
    <>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Generic slots</h2>
        <p className="muted">
          Title, score, combo, accuracy, difficulty, level, rank. Clearing one removes it for this
          game — it will no longer display or OCR. Re-select a cleared slot and draw/save a box to
          restore it.
        </p>
        {GENERIC_SLOTS.map(({ key, label }) => {
          const isSet = cfg ? (cfg as unknown as Record<string, OcrRect | null>)[key] != null : false;
          return (
            <div className="board-row" key={key}>
              <span className="mini">
                {label} <span className="mini-sub">({key})</span>
              </span>
              <span className="mini-sub" style={{ marginLeft: 'auto' }}>
                {isSet ? 'Set' : 'Cleared'}
              </span>
              <button className="btn" onClick={() => ed.setSel(key)}>
                Select
              </button>
              {isSet ? (
                <button className="btn" onClick={() => ed.clearSlot(key)}>
                  Delete
                </button>
              ) : (
                <button className="btn" onClick={() => ed.restoreSlot(key)}>
                  Restore
                </button>
              )}
            </div>
          );
        })}
        <div className="row" style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={cfg?.useRankOcr ?? true}
              onChange={(e) => cfg && void ed.persist({ ...cfg, useRankOcr: e.target.checked })}
            />{' '}
            OCR score rank
          </label>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={cfg?.useAccuracyOcr ?? false}
              onChange={(e) => cfg && void ed.persist({ ...cfg, useAccuracyOcr: e.target.checked })}
            />{' '}
            OCR accuracy (else computed)
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Weighted accuracy &amp; combo</h2>
        <p className="muted">
          Accuracy is <kbd>Σ(value × weight) ÷ Σ(value) × 100</kbd> over all judgments, so Perfect
          counts fully while lower grades contribute only their weight — tune each weight below
          (miss stays in the total at weight 0). An OCR&apos;d accuracy (accuracy box set) always
          wins over this. When the game has no combo box, combo falls back to hits. Tick which
          judgment counts as the miss below.
        </p>
      </div>

      {(['Judgment', 'Metric', 'Misc'] as const).map((cat) => (
        <div className="card" key={cat}>
          <h2>
            {cat}s {cat === 'Judgment' && <span className="muted">— weight 1 is a full hit</span>}
          </h2>
          {cat === 'Judgment' && (cfg?.judgments?.length ?? 0) >= 2 && (
            <div className="row" style={{ marginBottom: 8 }}>
              <button
                className="more-link"
                title="Descending weights 1.0 → 0.0 across judgment order"
                onClick={() => {
                  if (confirm('Overwrite all judgment weights with descending 1.0 → 0.0?')) ed.autoWeights();
                }}
              >
                Auto weights
              </button>
            </div>
          )}
          {(cfg?.[listKeyOf(cat)] ?? []).map((f, i) => (
            <div
              className="board-row"
              key={`${f.key}-${i}`}
              style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
            >
              <label style={{ fontSize: 11, flex: '1 1 120px' }}>
                Label
                <input
                  className="input"
                  value={f.label}
                  onChange={(e) => ed.updateField(cat, i, { label: e.target.value })}
                />
              </label>
              <label style={{ fontSize: 11, flex: '1 1 110px' }}>
                Key
                <input
                  className="input"
                  value={f.key}
                  onChange={(e) => ed.updateField(cat, i, { key: e.target.value })}
                />
              </label>
              <label style={{ fontSize: 11 }}>
                Type
                <select
                  className="input"
                  value={f.type ?? 'number'}
                  onChange={(e) => ed.updateField(cat, i, { type: e.target.value as ConfigFieldType })}
                >
                  <option value="number">number</option>
                  <option value="text">text</option>
                  <option value="boolean">boolean</option>
                </select>
              </label>
              {cat === 'Judgment' && (
                <label style={{ fontSize: 11, maxWidth: 90 }}>
                  Weight
                  <input
                    className="input"
                    type="number"
                    step={0.01}
                    min={0}
                    max={1}
                    value={f.weight ?? 0}
                    onChange={(e) => ed.updateField(cat, i, { weight: Number(e.target.value) })}
                  />
                </label>
              )}
              {cat === 'Judgment' && (
                <label
                  style={{ fontSize: 11 }}
                  title="Counts as a miss: excluded from hits in accuracy and combo fallback"
                >
                  <input
                    type="checkbox"
                    checked={isMissField(f)}
                    onChange={(e) => ed.updateField(cat, i, { isMiss: e.target.checked })}
                  />{' '}
                  Miss
                </label>
              )}
              <button className="btn" onClick={() => ed.setSel(`${cat}:${i}`)}>
                Box
              </button>
              <button className="btn" onClick={() => ed.deleteField(cat, i)}>
                Delete
              </button>
            </div>
          ))}
          {(cfg?.[listKeyOf(cat)] ?? []).length === 0 && (
            <p className="muted">
              No {cat.toLowerCase()} fields — this section will not display for {cfg?.gameName}.
            </p>
          )}
        </div>
      ))}

      <div className="card">
        <h2>Add metric</h2>
        <p className="muted">Pick a generic preset or define a game-specific one. Keys must be unique per game.</p>
        <div className="row">
          <label style={{ fontSize: 12, flex: '2 1 220px' }}>
            Preset
            <select className="input" value={ed.presetIdx} onChange={(e) => ed.setPresetIdx(Number(e.target.value))}>
              {PRESET_FIELDS.map((p, i) => (
                <option key={`${p.field.key}-${i}`} value={i}>
                  {p.category} · {p.field.label} ({p.field.key})
                </option>
              ))}
              <option value={-1}>Custom…</option>
            </select>
          </label>
          {ed.presetIdx === -1 && (
            <>
              <label style={{ fontSize: 12, flex: '1 1 140px' }}>
                Category
                <select
                  className="input"
                  value={ed.addCat}
                  onChange={(e) => ed.setAddCat(e.target.value as ConfigCategory)}
                >
                  <option>Judgment</option>
                  <option>Metric</option>
                  <option>Misc</option>
                </select>
              </label>
              <label style={{ fontSize: 12, flex: '1 1 120px' }}>
                Key
                <input
                  className="input"
                  value={ed.customKey}
                  onChange={(e) => ed.setCustomKey(e.target.value)}
                  placeholder="mania_keys"
                />
              </label>
              <label style={{ fontSize: 12, flex: '1 1 140px' }}>
                Label
                <input
                  className="input"
                  value={ed.customLabel}
                  onChange={(e) => ed.setCustomLabel(e.target.value)}
                  placeholder="Keys"
                />
              </label>
            </>
          )}
          <button className="btn primary" onClick={ed.addField} disabled={!cfg} style={{ alignSelf: 'flex-end' }}>
            Add
          </button>
        </div>
      </div>
    </>
  );
}
