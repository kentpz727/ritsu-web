// PaddleOCR pilot (A/B spike vs Tesseract for text boxes).
//
// Lazy-loaded via dynamic import so the SDK (ONNX Runtime, OpenCV) lands in a
// separate on-demand chunk — the main bundle stays lean until the user picks
// the Paddle engine in the Debug OCR bench. Engines are cached per lang.
// Runs main-thread for the spike (worker setup is a follow-up); first use
// downloads PP-OCRv5 models, then they cache in the browser.
import type { OcrKind } from './client.ts';
import { cleanupNumeric, longestLine } from './image.ts';

interface PaddleEngine {
  predict: (input: unknown) => Promise<
    Array<{ items?: Array<{ text?: unknown; score?: unknown }> }>
  >;
}

const engines = new Map<string, Promise<PaddleEngine>>();

async function getEngine(lang: string): Promise<PaddleEngine> {
  const cached = engines.get(lang);
  if (cached) return cached;
  const task = (async () => {
    const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
    const engine = (await PaddleOCR.create({
      lang,
      ocrVersion: 'PP-OCRv5',
      ortOptions: { backend: 'auto' },
    })) as unknown as PaddleEngine;
    return engine;
  })();
  engines.set(lang, task);
  try {
    return await task;
  } catch (e) {
    engines.delete(lang);
    throw e;
  }
}

export interface PaddleReading {
  text: string;
  /** 0-100 mean item score (Paddle scores are 0-1; scaled for Tesseract parity). */
  confidence: number;
}

export async function ocrPaddleCanvas(
  canvas: HTMLCanvasElement,
  opts: { lang?: string; kind?: OcrKind } = {},
): Promise<PaddleReading> {
  const { lang = 'ch', kind = 'number' } = opts;
  const engine = await getEngine(lang);
  const out = await engine.predict(canvas);
  const result = Array.isArray(out) ? out[0] : out;
  const items = result?.items ?? [];
  const texts = items.map((i) => String(i.text ?? '').trim()).filter(Boolean);
  const scores = items
    .map((i) => Number(i.score))
    .filter((n) => Number.isFinite(n));
  const joined = texts.join(kind === 'number' ? '' : '\n');
  const text = kind === 'number' ? cleanupNumeric(joined) : longestLine(joined);
  const confidence =
    scores.length > 0 ? (scores.reduce((s, n) => s + n, 0) / scores.length) * 100 : 0;
  return { text, confidence: text ? confidence : 0 };
}
