import type { KeyboardEventHandler, PointerEventHandler, RefObject } from 'react';
import type { OcrRect } from '../lib/config/types.ts';

interface BoxCanvasProps {
  img: HTMLImageElement | null;
  sel: string;
  rect: OcrRect;
  cursor: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onKeyDown: KeyboardEventHandler<HTMLCanvasElement>;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onEndDrag: () => void;
}

/** The screenshot overlay canvas plus its keyboard/pointer wiring (P-10). */
export function BoxCanvas({
  img,
  sel,
  rect,
  cursor,
  canvasRef,
  onKeyDown,
  onPointerDown,
  onPointerMove,
  onEndDrag,
}: BoxCanvasProps) {
  return (
    <div style={{ marginTop: 12 }}>
      {img ? (
        <canvas
          ref={canvasRef}
          className="editor-canvas"
          style={{ cursor, touchAction: 'none' }}
          tabIndex={0}
          role="application"
          aria-label={`OCR box editor canvas. Selected box ${sel}, x ${rect.x.toFixed(3)}, y ${rect.y.toFixed(3)}, width ${rect.w.toFixed(3)}, height ${rect.h.toFixed(3)}.`}
          aria-describedby="editor-keyboard-help editor-selected-status"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Control+ArrowUp Control+ArrowDown Control+ArrowLeft Control+ArrowRight"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onEndDrag}
          onPointerCancel={onEndDrag}
        />
      ) : (
        <p className="muted">Upload a result screenshot to overlay OCR boxes.</p>
      )}
    </div>
  );
}
