import { useParams } from 'react-router-dom';
import { BoxCanvas } from '../components/BoxCanvas.tsx';
import { FieldPanel } from '../components/FieldPanel.tsx';
import { FileButton } from '../components/FileButton.tsx';
import { useBoxEditor } from '../components/useBoxEditor.ts';
import { FIELD_KEYS } from '../lib/config/boxGeometry.ts';
import { fieldEntries } from '../lib/config/types.ts';

// Web port of BoxEditorScreen + EditorViewModel: normalized rect math + live canvas overlay.
// State lives in useBoxEditor; the canvas and field list are presentational (P-10).
export default function BoxEditorPage() {
  const { configId } = useParams();
  const ed = useBoxEditor(configId);
  const { cfg, rect, sel } = ed;

  return (
    <div>
      <h1 className="page-title">BoxEditor {cfg ? `— ${cfg.gameName}` : ''}</h1>
      <p className="muted">
        Drag a box to move it, drag its corners to resize, or drag on empty canvas to draw a new box for the selected field.
        Coordinates stay normalized <kbd>x y w h</kbd> (0–1), independent of image size. Press <kbd>Save rect</kbd> to persist.
        Turn on the lock to make other fields' saved boxes unclickable while you work on the selected one.
      </p>
      <p className="muted" id="editor-keyboard-help">
        Keyboard: Tab to the canvas, then use the arrow keys to move the selected box. Hold Ctrl (or Cmd) with an arrow to
        resize it, and Shift for larger steps. Without a pointer, type the x / y / w / h values above and press{' '}
        <kbd>Save rect</kbd> to create or update the box.
      </p>
      <p className="muted" id="editor-selected-status" aria-live="polite">
        Selected box: <strong>{sel}</strong> — x {rect.x.toFixed(3)}, y {rect.y.toFixed(3)}, w {rect.w.toFixed(3)}, h{' '}
        {rect.h.toFixed(3)}
      </p>
      {ed.msg && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{ed.msg}</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        <FileButton accept="image/*" onChange={(e) => e.target.files?.[0] && ed.onFile(e.target.files[0])}>
          Upload screenshot
        </FileButton>
        <select
          className="input"
          style={{ maxWidth: 280 }}
          value={sel}
          onChange={(e) => ed.setSel(e.target.value)}
          aria-label="Box field"
        >
          {FIELD_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          {cfg &&
            fieldEntries(cfg).map(({ key, field, category }) => (
              <option key={key} value={key}>
                {category} · {field.key} ({field.label})
              </option>
            ))}
        </select>
        <button className="btn primary" onClick={ed.save} disabled={!cfg}>
          Save rect
        </button>
        <label
          style={{ fontSize: 12 }}
          title="Other fields' saved boxes become unclickable (dimmed); only the selected field can be grabbed"
        >
          <input
            type="checkbox"
            checked={ed.lockOthers}
            onChange={(e) => {
              ed.setLockOthers(e.target.checked);
              localStorage.setItem('ritsu-lock-others', e.target.checked ? '1' : '0');
            }}
          />{' '}
          Lock other boxes
        </label>
      </div>
      <div className="row">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k} style={{ fontSize: 12 }}>
            {k}
            <input
              className="input"
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={Number(rect[k].toFixed(4))}
              onChange={(e) => ed.setRect({ ...rect, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <BoxCanvas
        img={ed.img}
        sel={sel}
        rect={rect}
        cursor={ed.cursor}
        canvasRef={ed.canvasRef}
        onKeyDown={ed.onCanvasKeyDown}
        onPointerDown={ed.onPointerDown}
        onPointerMove={ed.onPointerMove}
        onEndDrag={ed.endDrag}
      />
      <FieldPanel ed={ed} />
    </div>
  );
}
