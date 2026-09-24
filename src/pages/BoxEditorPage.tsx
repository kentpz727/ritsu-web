import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/db/dexie.ts';
import { isMissField } from '../lib/calc/scoring.ts';
import {
  GENERIC_SLOTS,
  PRESET_FIELDS,
  allFieldsWithCategory,
  defaultSlotRect,
  fieldEntries,
  parseGameConfig,
  type ConfigCategory,
  type ConfigField,
  type ConfigFieldType,
  type GameConfigData,
  type OcrRect,
} from '../lib/config/types.ts';

// Web port of BoxEditorScreen + EditorViewModel: normalized rect math + live canvas overlay.
// Boxes can be dragged with pointer (mouse/touch): move by body, resize by corners,
// or drag on empty canvas to draw a new box for the selected field.
const FIELD_KEYS = ['titleRect', 'scoreRect', 'comboRect', 'accuracyRect', 'difficultyNameRect', 'difficultyValRect', 'rankRect'];

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'create';

interface DragState {
  mode: DragMode;
  key: string;
  startNorm: { x: number; y: number };
  startRect: OcrRect;
  grabDX: number;
  grabDY: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const MIN_SIZE = 0.005;

export default function BoxEditorPage() {
  const { configId } = useParams();
  const [cfg, setCfg] = useState<GameConfigData | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [sel, setSel] = useState<string>('scoreRect');
  const [rect, setRect] = useState<OcrRect>({ x: 0.1, y: 0.1, w: 0.3, h: 0.08 });
  const [cursor, setCursor] = useState('crosshair');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // Add-field form state.
  const [presetIdx, setPresetIdx] = useState<number>(0);
  const [addCat, setAddCat] = useState<ConfigCategory>('Judgment');
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  // Lock toggle: when on, saved boxes of other fields are not clickable —
  // clicks/drags on them are ignored, so the selected field can't be disturbed.
  const [lockOthers, setLockOthers] = useState(() => localStorage.getItem('ritsu-lock-others') === '1');

  useEffect(() => {
    db.game_configs.get(Number(configId)).then((row) => {
      if (row) {
        try { setCfg(parseGameConfig(row.configData)); } catch { setCfg(null); }
      }
    });
  }, [configId]);

  function rectOfKey(key: string, source: GameConfigData | null): OcrRect | null | undefined {
    if (!source) return undefined;
    if (FIELD_KEYS.includes(key)) return (source as unknown as Record<string, OcrRect | null>)[key];
    const [cat, idx] = key.split(':');
    const listKey = cat === 'Judgment' ? 'judgments' : cat === 'Metric' ? 'metrics' : 'misc';
    return source[listKey]?.[Number(idx)]?.ocrRect;
  }

  // Load the selected field's current rect into the draft (unless mid-drag).
  useEffect(() => {
    if (dragRef.current) return;
    const current = rectOfKey(sel, cfg);
    if (current) setRect({ ...current });
  }, [sel, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  function onFile(f: File) {
    const url = URL.createObjectURL(f);
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = url;
  }

  /** All boxes for drawing + hit-testing, draft last (topmost). */
  function boxes(): Array<{ key: string; rect: OcrRect; color: string }> {
    const out: Array<{ key: string; rect: OcrRect; color: string }> = [];
    if (cfg) {
      for (const k of FIELD_KEYS) {
        const r = (cfg as unknown as Record<string, OcrRect | null>)[k];
        if (r) out.push({ key: k, rect: r, color: k === sel ? '#5df3ff' : '#e6f3f4' });
      }
      fieldEntries(cfg).forEach(({ key, field }) => {
        if (field.ocrRect) out.push({ key, rect: field.ocrRect, color: '#2683b6' });
      });
    }
    out.push({ key: sel, rect, color: '#6eeb5e' });
    return out;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const lineW = Math.max(2, img.naturalWidth * 0.003);
    for (const { rect: r, color, key } of boxes()) {
      const px = r.x * img.naturalWidth;
      const py = r.y * img.naturalHeight;
      const pw = r.w * img.naturalWidth;
      const ph = r.h * img.naturalHeight;
      // Locked-out boxes (lock toggle on, not the selected field) render dimmed.
      ctx.globalAlpha = lockOthers && key !== sel ? 0.3 : 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = key === sel ? lineW * 1.5 : lineW;
      ctx.strokeRect(px, py, pw, ph);
      ctx.fillStyle = color;
      ctx.font = '16px Poppins';
      ctx.fillText(key === sel ? `${key} (draft)` : key, px + 4, py - 4);
      if (key === sel) {
        // Resize handles on the selected box.
        const s = Math.max(6, img.naturalWidth * 0.008);
        ctx.fillStyle = color;
        for (const [hx, hy] of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]]) {
          ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    }
  }); // redraw every render: cheap and always reflects drag state

  function toNorm(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  }

  function hitTest(
    norm: { x: number; y: number },
    handleTol: number,
    onlySelected = false,
  ): { key: string; mode: Exclude<DragMode, 'create'> } | null {
    const all = boxes();
    const list = onlySelected ? all.filter((b) => b.key === sel) : all;
    // Corners first (topmost box wins).
    for (let i = list.length - 1; i >= 0; i--) {
      const { key, rect: r } = list[i];
      const corners: Array<[number, number, Exclude<DragMode, 'create'>]> = [
        [r.x, r.y, 'nw'], [r.x + r.w, r.y, 'ne'], [r.x, r.y + r.h, 'sw'], [r.x + r.w, r.y + r.h, 'se'],
      ];
      for (const [cx, cy, mode] of corners) {
        if (Math.abs(norm.x - cx) <= handleTol && Math.abs(norm.y - cy) <= handleTol) return { key, mode };
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const { key, rect: r } = list[i];
      if (norm.x >= r.x && norm.x <= r.x + r.w && norm.y >= r.y && norm.y <= r.y + r.h) return { key, mode: 'move' };
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!img) return;
    const canvas = canvasRef.current!;
    const norm = toNorm(e);
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const handleTol = (12 * scaleX) / canvas.width; // ~12 screen px in normalized units
    if (lockOthers) {
      // Locked: clicks on other fields' saved boxes are completely ignored —
      // no select, no drag, no overwrite. Empty canvas still draws as usual.
      const other = hitTest(norm, handleTol, false);
      if (other && other.key !== sel) return;
    }
    canvas.setPointerCapture(e.pointerId);
    const hit = hitTest(norm, handleTol, lockOthers);
    if (hit) {
      if (hit.key !== sel) {
        setSel(hit.key);
        const current = rectOfKey(hit.key, cfg);
        const base = current ?? rect;
        dragRef.current = { mode: hit.mode, key: hit.key, startNorm: norm, startRect: { ...base }, grabDX: norm.x - base.x, grabDY: norm.y - base.y };
        if (current) setRect({ ...current });
      } else {
        dragRef.current = { mode: hit.mode, key: hit.key, startNorm: norm, startRect: { ...rect }, grabDX: norm.x - rect.x, grabDY: norm.y - rect.y };
      }
    } else {
      // Drag on empty canvas draws a new box for the selected field.
      dragRef.current = { mode: 'create', key: sel, startNorm: norm, startRect: { ...rect }, grabDX: 0, grabDY: 0 };
      setRect({ x: norm.x, y: norm.y, w: MIN_SIZE, h: MIN_SIZE });
    }
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!img) return;
    const drag = dragRef.current;
    const norm = toNorm(e);
    if (!drag) {
      // Hover cursor feedback (locked boxes never show an interactive cursor).
      const canvas = canvasRef.current!;
      const scaleX = canvas.width / canvas.getBoundingClientRect().width;
      const hit = hitTest(norm, (12 * scaleX) / canvas.width, lockOthers);
      setCursor(!hit ? 'crosshair' : hit.mode === 'move' ? 'move' : hit.mode === 'nw' || hit.mode === 'se' ? 'nwse-resize' : 'nesw-resize');
      return;
    }
    const { mode, startNorm, startRect } = drag;
    let next: OcrRect;
    if (mode === 'move') {
      const w = Math.max(startRect.w, MIN_SIZE);
      const h = Math.max(startRect.h, MIN_SIZE);
      next = { w, h, x: clamp01(norm.x - drag.grabDX), y: clamp01(norm.y - drag.grabDY) };
      next.x = Math.min(next.x, 1 - w);
      next.y = Math.min(next.y, 1 - h);
    } else if (mode === 'create') {
      const x = Math.min(startNorm.x, norm.x);
      const y = Math.min(startNorm.y, norm.y);
      next = { x, y, w: Math.max(Math.abs(norm.x - startNorm.x), MIN_SIZE), h: Math.max(Math.abs(norm.y - startNorm.y), MIN_SIZE) };
      if (x + next.w > 1) next.w = 1 - x;
      if (y + next.h > 1) next.h = 1 - y;
    } else {
      next = { ...startRect };
      if (mode === 'nw' || mode === 'sw') {
        const right = startRect.x + startRect.w;
        next.x = Math.min(norm.x, right - MIN_SIZE);
        next.w = right - next.x;
      }
      if (mode === 'ne' || mode === 'se') {
        next.w = Math.max(norm.x - startRect.x, MIN_SIZE);
      }
      if (mode === 'nw' || mode === 'ne') {
        const bottom = startRect.y + startRect.h;
        next.y = Math.min(norm.y, bottom - MIN_SIZE);
        next.h = bottom - next.y;
      }
      if (mode === 'sw' || mode === 'se') {
        next.h = Math.max(norm.y - startRect.y, MIN_SIZE);
      }
      next.x = clamp01(next.x);
      next.y = clamp01(next.y);
      if (next.x + next.w > 1) next.w = 1 - next.x;
      if (next.y + next.h > 1) next.h = 1 - next.y;
    }
    setRect(next);
    setCursor(mode === 'move' ? 'grabbing' : mode === 'create' ? 'crosshair' : mode === 'nw' || mode === 'se' ? 'nwse-resize' : 'nesw-resize');
  }

  function endDrag() {
    dragRef.current = null;
    setCursor('crosshair');
  }

  async function persist(next: GameConfigData) {
    const row = await db.game_configs.get(Number(configId));
    if (!row) return;
    await db.game_configs.update(row.id!, { configData: JSON.stringify(next) });
    setCfg(next);
  }

  async function save() {
    if (!cfg) return;
    let next: GameConfigData = { ...cfg };
    if (FIELD_KEYS.includes(sel)) {
      next = { ...next, [sel]: { ...rect } };
    } else {
      const [cat, idx] = sel.split(':');
      const listKey = cat === 'Judgment' ? 'judgments' : cat === 'Metric' ? 'metrics' : 'misc';
      const list = [...(next[listKey] ?? [])];
      const target = list[Number(idx)];
      if (!target) {
        alert('That field no longer exists — it may have been deleted. Reselect a field and try again.');
        setSel('scoreRect');
        return;
      }
      list[Number(idx)] = { ...target, ocrRect: { ...rect } };
      next = { ...next, [listKey]: list };
    }
    await persist(next);
  }

  function listKeyOf(cat: string): 'judgments' | 'metrics' | 'misc' {
    return cat === 'Judgment' ? 'judgments' : cat === 'Metric' ? 'metrics' : 'misc';
  }

  function allKeys(source: GameConfigData): Set<string> {
    return new Set(allFieldsWithCategory(source).map(({ field }) => field.key));
  }

  function uniqueKey(source: GameConfigData, base: string): string {
    const taken = allKeys(source);
    let key = base || 'field';
    let n = 2;
    while (taken.has(key)) key = `${base}_${n++}`;
    return key;
  }

  function updateField(cat: ConfigCategory, idx: number, patch: Partial<ConfigField>) {
    if (!cfg) return;
    // Guard key renames against duplicates (stored details are keyed by key).
    if (patch.key !== undefined) {
      const current = (cfg[listKeyOf(cat)] ?? [])[idx];
      if (!current) return;
      const clean = patch.key.trim() || current.key;
      const taken = allKeys(cfg);
      taken.delete(current.key);
      if (taken.has(clean)) {
        alert(`Key "${clean}" is already used. Keys must be unique.`);
        return;
      }
      patch = { ...patch, key: clean };
    }
    const lk = listKeyOf(cat);
    const list = [...(cfg[lk] ?? [])];
    list[idx] = { ...list[idx], ...patch };
    void persist({ ...cfg, [lk]: list });
  }

  function deleteField(cat: ConfigCategory, idx: number) {
    if (!cfg) return;
    const target = (cfg[listKeyOf(cat)] ?? [])[idx];
    if (!target) return;
    if (!confirm(`Delete ${cat} field "${target.label}"? Saved scores keep their values, but this metric will no longer display for ${cfg.gameName}.`)) return;
    const lk = listKeyOf(cat);
    const list = (cfg[lk] ?? []).filter((_, i) => i !== idx);
    if (sel === `${cat}:${idx}`) setSel('scoreRect');
    else {
      const [sc, si] = sel.split(':');
      if (sc === cat && Number(si) > idx) setSel(`${cat}:${Number(si) - 1}`);
    }
    void persist({ ...cfg, [lk]: list });
  }

  function addField() {
    if (!cfg) return;
    const preset = PRESET_FIELDS[presetIdx];
    const cat: ConfigCategory = preset ? preset.category : addCat;
    const base: ConfigField = preset
      ? { ...preset.field }
      : {
          key: customKey.trim(),
          label: customLabel.trim() || customKey.trim(),
          type: 'number' as ConfigFieldType,
          // New judgments count as full hits unless the user lowers the weight.
          ...(addCat === 'Judgment' ? { weight: 1.0 } : {}),
        };
    if (!base.key) {
      alert('Give the new field a key.');
      return;
    }
    const lk = listKeyOf(cat);
    const list = [...(cfg[lk] ?? []), { ...base, key: uniqueKey(cfg, base.key) }];
    setCustomKey('');
    setCustomLabel('');
    void persist({ ...cfg, [lk]: list });
  }

  function clearSlot(key: string) {
    if (!cfg) return;
    if (!confirm(`Remove "${key}" from ${cfg.gameName}? It will no longer display or OCR for this game.`)) return;
    if (sel === key) setSel('scoreRect');
    void persist({ ...cfg, [key]: null });
  }

  function restoreSlot(key: string) {
    if (!cfg) return;
    const next = { ...cfg, [key]: defaultSlotRect() };
    setSel(key);
    setRect(defaultSlotRect());
    void persist(next);
  }

  // Port of EditorViewModel.autoSetWeights: linearly descending 1.0 → 0.0
  // across judgment order (2dp), so the top grade counts fully.
  function autoWeights() {
    if (!cfg || (cfg.judgments?.length ?? 0) < 2) return;
    const n = cfg.judgments!.length;
    const list = cfg.judgments!.map((f, i) => ({ ...f, weight: Math.floor((1 - i / (n - 1)) * 100) / 100 }));
    void persist({ ...cfg, judgments: list });
  }

  return (
    <div>
      <h1 className="page-title">BoxEditor {cfg ? `— ${cfg.gameName}` : ''}</h1>
      <p className="muted">
        Drag a box to move it, drag its corners to resize, or drag on empty canvas to draw a new box for the selected field.
        Coordinates stay normalized <kbd>x y w h</kbd> (0–1), independent of image size. Press <kbd>Save rect</kbd> to persist.
        Turn on the lock to make other fields' saved boxes unclickable while you work on the selected one.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="btn">Upload screenshot<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
        <select className="input" style={{ maxWidth: 280 }} value={sel} onChange={(e) => setSel(e.target.value)}>
          {FIELD_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          {cfg && fieldEntries(cfg).map(({ key, field, category }) => (
            <option key={key} value={key}>{category} · {field.key} ({field.label})</option>
          ))}
        </select>
        <button className="btn primary" onClick={save} disabled={!cfg}>Save rect</button>
        <label style={{ fontSize: 12 }} title="Other fields' saved boxes become unclickable (dimmed); only the selected field can be grabbed">
          <input
            type="checkbox"
            checked={lockOthers}
            onChange={(e) => {
              setLockOthers(e.target.checked);
              localStorage.setItem('ritsu-lock-others', e.target.checked ? '1' : '0');
            }}
          /> Lock other boxes
        </label>
      </div>
      <div className="row">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k} style={{ fontSize: 12 }}>{k}
            <input className="input" type="number" step={0.01} min={0} max={1} value={Number(rect[k].toFixed(4))} onChange={(e) => setRect({ ...rect, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {img ? (
          <canvas
            ref={canvasRef}
            className="editor-canvas"
            style={{ cursor, touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ) : (
          <p className="muted">Upload a result screenshot to overlay OCR boxes.</p>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Generic slots</h3>
        <p className="muted">Title, score, combo, accuracy, difficulty, level, rank. Clearing one removes it for this game — it will no longer display or OCR. Re-select a cleared slot and draw/save a box to restore it.</p>
        {GENERIC_SLOTS.map(({ key, label }) => {
          const isSet = cfg ? (cfg as unknown as Record<string, OcrRect | null>)[key] != null : false;
          return (
            <div className="board-row" key={key}>
              <span className="mini">{label} <span className="mini-sub">({key})</span></span>
              <span className="mini-sub" style={{ marginLeft: 'auto' }}>{isSet ? 'Set' : 'Cleared'}</span>
              <button className="btn" onClick={() => setSel(key)}>Select</button>
              {isSet ? (
                <button className="btn" onClick={() => clearSlot(key)}>Delete</button>
              ) : (
                <button className="btn" onClick={() => restoreSlot(key)}>Restore</button>
              )}
            </div>
          );
        })}
        <div className="row" style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={cfg?.useRankOcr ?? true} onChange={(e) => cfg && void persist({ ...cfg, useRankOcr: e.target.checked })} /> OCR score rank
          </label>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={cfg?.useAccuracyOcr ?? false} onChange={(e) => cfg && void persist({ ...cfg, useAccuracyOcr: e.target.checked })} /> OCR accuracy (else computed)
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Weighted accuracy & combo</h3>
        <p className="muted">
          Accuracy is <kbd>Σ(value × weight) ÷ Σ(value) × 100</kbd> over all judgments, so Perfect
          counts fully while lower grades contribute only their weight — tune each weight below
          (miss stays in the total at weight 0). An OCR'd accuracy (accuracy box set) always wins
          over this. When the game has no combo box, combo falls back to hits. Tick which judgment
          counts as the miss below.
        </p>
      </div>

      {(['Judgment', 'Metric', 'Misc'] as const).map((cat) => (
        <div className="card" key={cat}>
          <h3>{cat}s {cat === 'Judgment' && <span className="muted">— weight 1 is a full hit</span>}</h3>
          {cat === 'Judgment' && (cfg?.judgments?.length ?? 0) >= 2 && (
            <div className="row" style={{ marginBottom: 8 }}>
              <button
                className="more-link"
                title="Descending weights 1.0 → 0.0 across judgment order"
                onClick={() => { if (confirm('Overwrite all judgment weights with descending 1.0 → 0.0?')) autoWeights(); }}
              >
                Auto weights
              </button>
            </div>
          )}
          {(cfg?.[listKeyOf(cat)] ?? []).map((f, i) => (
            <div className="board-row" key={`${f.key}-${i}`} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, flex: '1 1 120px' }}>Label
                <input className="input" value={f.label} onChange={(e) => updateField(cat, i, { label: e.target.value })} />
              </label>
              <label style={{ fontSize: 11, flex: '1 1 110px' }}>Key
                <input className="input" value={f.key} onChange={(e) => updateField(cat, i, { key: e.target.value })} />
              </label>
              <label style={{ fontSize: 11 }}>Type
                <select className="input" value={f.type ?? 'number'} onChange={(e) => updateField(cat, i, { type: e.target.value as ConfigFieldType })}>
                  <option value="number">number</option>
                  <option value="text">text</option>
                  <option value="boolean">boolean</option>
                </select>
              </label>
              {cat === 'Judgment' && (
                <label style={{ fontSize: 11, maxWidth: 90 }}>Weight
                  <input className="input" type="number" step={0.01} min={0} max={1} value={f.weight ?? 0} onChange={(e) => updateField(cat, i, { weight: Number(e.target.value) })} />
                </label>
              )}
              {cat === 'Judgment' && (
                <label style={{ fontSize: 11 }} title="Counts as a miss: excluded from hits in accuracy and combo fallback">
                  <input type="checkbox" checked={isMissField(f)} onChange={(e) => updateField(cat, i, { isMiss: e.target.checked })} /> Miss
                </label>
              )}
              <button className="btn" onClick={() => setSel(`${cat}:${i}`)}>Box</button>
              <button className="btn" onClick={() => deleteField(cat, i)}>Delete</button>
            </div>
          ))}
          {(cfg?.[listKeyOf(cat)] ?? []).length === 0 && <p className="muted">No {cat.toLowerCase()} fields — this section will not display for {cfg?.gameName}.</p>}
        </div>
      ))}

      <div className="card">
        <h3>Add metric</h3>
        <p className="muted">Pick a generic preset or define a game-specific one. Keys must be unique per game.</p>
        <div className="row">
          <label style={{ fontSize: 12, flex: '2 1 220px' }}>Preset
            <select className="input" value={presetIdx} onChange={(e) => setPresetIdx(Number(e.target.value))}>
              {PRESET_FIELDS.map((p, i) => (
                <option key={`${p.field.key}-${i}`} value={i}>{p.category} · {p.field.label} ({p.field.key})</option>
              ))}
              <option value={-1}>Custom…</option>
            </select>
          </label>
          {presetIdx === -1 && (
            <>
              <label style={{ fontSize: 12, flex: '1 1 140px' }}>Category
                <select className="input" value={addCat} onChange={(e) => setAddCat(e.target.value as ConfigCategory)}>
                  <option>Judgment</option>
                  <option>Metric</option>
                  <option>Misc</option>
                </select>
              </label>
              <label style={{ fontSize: 12, flex: '1 1 120px' }}>Key
                <input className="input" value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="mania_keys" />
              </label>
              <label style={{ fontSize: 12, flex: '1 1 140px' }}>Label
                <input className="input" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Keys" />
              </label>
            </>
          )}
          <button className="btn primary" onClick={addField} disabled={!cfg} style={{ alignSelf: 'flex-end' }}>Add</button>
        </div>
      </div>
    </div>
  );
}
