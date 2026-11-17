import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db/dexie.ts';
import { adjustRectWithKey } from '../lib/config/rectKeyboard.ts';
import {
  FIELD_KEYS,
  MIN_SIZE,
  clamp01,
  boxesFor,
  cursorFor,
  dragRect,
  hitTest,
  listKeyOf,
  rectOfKey,
  type DragState,
} from '../lib/config/boxGeometry.ts';
import {
  PRESET_FIELDS,
  allFieldsWithCategory,
  defaultSlotRect,
  formatConfigIssues,
  parseGameConfig,
  validateGameConfigObject,
  type ConfigCategory,
  type ConfigField,
  type ConfigFieldType,
  type GameConfigData,
  type OcrRect,
} from '../lib/config/types.ts';
import { debounce } from '../lib/debounce.ts';
import { errorMessage, logError } from '../lib/errors.ts';
import { useToast } from './toast.ts';

export interface BoxEditorController {
  cfg: GameConfigData | null;
  img: HTMLImageElement | null;
  sel: string;
  rect: OcrRect;
  cursor: string;
  msg: string;
  lockOthers: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  presetIdx: number;
  addCat: ConfigCategory;
  customKey: string;
  customLabel: string;
  setSel: (key: string) => void;
  setRect: (rect: OcrRect) => void;
  setLockOthers: (on: boolean) => void;
  setPresetIdx: (idx: number) => void;
  setAddCat: (cat: ConfigCategory) => void;
  setCustomKey: (key: string) => void;
  setCustomLabel: (label: string) => void;
  onFile: (f: File) => void;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  endDrag: () => void;
  onCanvasKeyDown: (e: React.KeyboardEvent<HTMLCanvasElement>) => void;
  save: () => Promise<void>;
  updateField: (cat: ConfigCategory, idx: number, patch: Partial<ConfigField>) => void;
  deleteField: (cat: ConfigCategory, idx: number) => void;
  addField: () => void;
  clearSlot: (key: string) => void;
  restoreSlot: (key: string) => void;
  autoWeights: () => void;
  persist: (next: GameConfigData) => Promise<void>;
}

/**
 * State and side effects for the OCR box editor: config load/save, selection,
 * draft rect, pointer/keyboard interaction, and field CRUD. The page supplies
 * configId and renders the canvas/panel from this controller (P-10).
 */
export function useBoxEditor(configId: string | undefined): BoxEditorController {
  const toast = useToast();
  const [cfg, setCfg] = useState<GameConfigData | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [sel, setSel] = useState<string>('scoreRect');
  const [rect, setRect] = useState<OcrRect>({ x: 0.1, y: 0.1, w: 0.3, h: 0.08 });
  const [cursor, setCursor] = useState('crosshair');
  const [msg, setMsg] = useState('');
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

  // P-14: text edits update local state immediately but persist once the user
  // pauses, so renaming a label no longer issues a read/write per keystroke.
  const pendingCfg = useRef<GameConfigData | null>(null);

  const writeConfig = useCallback(
    async (next: GameConfigData): Promise<void> => {
      // P-03: never write an invalid config; clamp/normalize safe values first.
      const validated = validateGameConfigObject(next);
      if (!validated.config || validated.errors.length > 0) {
        setMsg(`Not saved:\n${formatConfigIssues(validated.errors)}`);
        return;
      }
      try {
        const row = await db.game_configs.get(Number(configId));
        if (!row) return;
        await db.game_configs.update(row.id!, { configData: JSON.stringify(validated.config) });
        // A newer draft may have arrived while this write was in flight.
        if (pendingCfg.current == null) setCfg(validated.config);
        setMsg(validated.warnings.length > 0 ? `Saved with fixes:\n${formatConfigIssues(validated.warnings)}` : '');
      } catch (e) {
        logError('config save', e, { configId });
        toast(`Could not save config: ${errorMessage(e)}`, 'error');
      }
    },
    [configId, toast],
  );

  const saveDraft = useMemo(
    () =>
      debounce((next: GameConfigData) => {
        pendingCfg.current = null;
        void writeConfig(next);
      }, 300),
    [writeConfig],
  );

  // Closing the editor must not drop a debounced edit.
  useEffect(() => () => {
    pendingCfg.current = null;
    saveDraft.flush();
  }, [saveDraft]);

  useEffect(() => {
    db.game_configs.get(Number(configId)).then((row) => {
      if (!row) return;
      try {
        setCfg(parseGameConfig(row.configData));
        setMsg('');
      } catch (e) {
        setCfg(null);
        setMsg(`Config rejected:\n${errorMessage(e)}`);
        logError('config load', e, { configId });
      }
    });
  }, [configId]);

  // Load the selected field's current rect into the draft (unless mid-drag).
  useEffect(() => {
    if (dragRef.current) return;
    const current = rectOfKey(sel, cfg);
    if (current) setRect({ ...current });
  }, [sel, cfg]);

  function onFile(f: File) {
    const url = URL.createObjectURL(f);
    const el = new Image();
    // P-12: the decoded image keeps its pixels after the blob URL is released,
    // so revoke on both outcomes instead of holding the file for the tab lifetime.
    el.onload = () => {
      URL.revokeObjectURL(url);
      setImg(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Could not decode that image. Try another screenshot.', 'error');
    };
    el.src = url;
  }

  // P-14: at most one paint per frame. The pending frame reads the latest state
  // ref instead of being cancelled on each render, so a fast drag paints every
  // frame rather than starving until the pointer pauses.
  const paintRef = useRef({ img, cfg, sel, rect, lockOthers });
  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    paintRef.current = { img, cfg, sel, rect, lockOthers };
    if (!img || frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const latest = paintRef.current;
      const image = latest.img;
      const canvas = canvasRef.current;
      if (!canvas || !image) return;
      // Resizing clears the bitmap; only do it when the image size changed.
      if (canvas.width !== image.naturalWidth) canvas.width = image.naturalWidth;
      if (canvas.height !== image.naturalHeight) canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      const lineW = Math.max(2, image.naturalWidth * 0.003);
      for (const { rect: r, color, key } of boxesFor(latest.cfg, latest.sel, latest.rect)) {
        const px = r.x * image.naturalWidth;
        const py = r.y * image.naturalHeight;
        const pw = r.w * image.naturalWidth;
        const ph = r.h * image.naturalHeight;
        // Locked-out boxes (lock toggle on, not the selected field) render dimmed.
        ctx.globalAlpha = latest.lockOthers && key !== latest.sel ? 0.3 : 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = key === latest.sel ? lineW * 1.5 : lineW;
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = color;
        ctx.font = '16px Poppins';
        ctx.fillText(key === latest.sel ? `${key} (draft)` : key, px + 4, py - 4);
        if (key === latest.sel) {
          // Resize handles on the selected box.
          const s = Math.max(6, image.naturalWidth * 0.008);
          ctx.fillStyle = color;
          for (const [hx, hy] of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]]) {
            ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
          }
        }
        ctx.globalAlpha = 1;
      }
    });
  }, [img, rect, cfg, sel, lockOthers]);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    },
    [],
  );

  function toNorm(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!img) return;
    const canvas = canvasRef.current!;
    const norm = toNorm(e);
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const handleTol = (12 * scaleX) / canvas.width; // ~12 screen px in normalized units
    const all = boxesFor(cfg, sel, rect);
    if (lockOthers) {
      // Locked: clicks on other fields' saved boxes are completely ignored —
      // no select, no drag, no overwrite. Empty canvas still draws as usual.
      const other = hitTest(all, sel, norm, handleTol, false);
      if (other && other.key !== sel) return;
    }
    canvas.setPointerCapture(e.pointerId);
    const hit = hitTest(all, sel, norm, handleTol, lockOthers);
    if (hit) {
      if (hit.key !== sel) {
        setSel(hit.key);
        const current = rectOfKey(hit.key, cfg);
        const base = current ?? rect;
        dragRef.current = {
          mode: hit.mode,
          key: hit.key,
          startNorm: norm,
          startRect: { ...base },
          grabDX: norm.x - base.x,
          grabDY: norm.y - base.y,
        };
        if (current) setRect({ ...current });
      } else {
        dragRef.current = {
          mode: hit.mode,
          key: hit.key,
          startNorm: norm,
          startRect: { ...rect },
          grabDX: norm.x - rect.x,
          grabDY: norm.y - rect.y,
        };
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
      const hit = hitTest(boxesFor(cfg, sel, rect), sel, norm, (12 * scaleX) / canvas.width, lockOthers);
      setCursor(cursorFor(hit?.mode ?? null));
      return;
    }
    setRect(dragRect(drag, norm));
    setCursor(cursorFor(drag.mode, true));
  }

  function endDrag() {
    dragRef.current = null;
    setCursor('crosshair');
  }

  /** Immediate write for discrete actions (toggles, add/delete, Save rect). */
  async function persist(next: GameConfigData) {
    saveDraft.cancel();
    pendingCfg.current = null;
    await writeConfig(next);
  }

  async function save() {
    if (!cfg) return;
    let next: GameConfigData = { ...cfg };
    if (FIELD_KEYS.includes(sel)) {
      next = { ...next, [sel]: { ...rect } };
    } else {
      const [cat, idx] = sel.split(':');
      const listKey = listKeyOf(cat);
      const list = [...(next[listKey] ?? [])];
      const target = list[Number(idx)];
      if (!target) {
        toast('That field no longer exists — it may have been deleted. Reselect a field and try again.', 'error');
        setSel('scoreRect');
        return;
      }
      list[Number(idx)] = { ...target, ocrRect: { ...rect } };
      next = { ...next, [listKey]: list };
    }
    await persist(next);
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
        toast(`Key "${clean}" is already used. Keys must be unique.`, 'error');
        return;
      }
      patch = { ...patch, key: clean };
    }
    const lk = listKeyOf(cat);
    const list = [...(cfg[lk] ?? [])];
    list[idx] = { ...list[idx], ...patch };
    const next = { ...cfg, [lk]: list };
    // Keep the controlled input responsive now; persist after the typing pause.
    setCfg(next);
    pendingCfg.current = next;
    saveDraft(next);
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
      toast('Give the new field a key.', 'error');
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

  /** P-05: keyboard move/resize on the focused canvas keeps the same draft flow as pointer drags. */
  function onCanvasKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!img) return;
    const next = adjustRectWithKey(rect, e.key, {
      resize: e.ctrlKey || e.metaKey,
      large: e.shiftKey,
    });
    if (!next) return;
    e.preventDefault();
    setRect(next);
  }

  // Port of EditorViewModel.autoSetWeights: linearly descending 1.0 → 0.0
  // across judgment order (2dp), so the top grade counts fully.
  function autoWeights() {
    if (!cfg || (cfg.judgments?.length ?? 0) < 2) return;
    const n = cfg.judgments!.length;
    const list = cfg.judgments!.map((f, i) => ({ ...f, weight: Math.floor((1 - i / (n - 1)) * 100) / 100 }));
    void persist({ ...cfg, judgments: list });
  }

  return {
    cfg,
    img,
    sel,
    rect,
    cursor,
    msg,
    lockOthers,
    canvasRef,
    presetIdx,
    addCat,
    customKey,
    customLabel,
    setSel,
    setRect,
    setLockOthers,
    setPresetIdx,
    setAddCat,
    setCustomKey,
    setCustomLabel,
    onFile,
    onPointerDown,
    onPointerMove,
    endDrag,
    onCanvasKeyDown,
    save,
    updateField,
    deleteField,
    addField,
    clearSlot,
    restoreSlot,
    autoWeights,
    persist,
  };
}
