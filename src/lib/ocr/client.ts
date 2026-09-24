// Tesseract.js worker client. Runs OCR off the UI thread via Tesseract's own worker.
// Mirrors Android's engine split: numbers read with eng only (ML Kit Latin),
// text reads with eng+jpn+chi_sim in parallel plus the CJK/longest heuristic.
// Non-eng models load lazily on first text box and degrade to eng-only offline.
import { createWorker } from 'tesseract.js';
import { cleanupNumeric, longestLine, preprocess, hasCJK } from './image.ts';
export { hasCJK };

export type OcrLang = 'eng' | 'jpn' | 'chi_sim';
export type OcrKind = 'number' | 'text';

const workerCache = new Map<OcrLang, Awaited<ReturnType<typeof createWorker>>>();

async function getWorker(lang: OcrLang) {
  const cached = workerCache.get(lang);
  if (cached) return cached;
  const worker = await createWorker(lang);
  workerCache.set(lang, worker);
  return worker;
}

export interface OcrProgress {
  file: string;
  field: string;
  status: string;
  progress: number;
}

async function recognize(
  canvas: HTMLCanvasElement,
  lang: OcrLang,
  kind: OcrKind,
  whitelist?: string,
  psm?: string,
): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker(lang);
  await worker.setParameters({
    tessedit_pageseg_mode: (psm ?? (kind === 'number' ? '7' : '6')) as unknown as never,
    ...(kind === 'number'
      ? { tessedit_char_whitelist: whitelist ?? '0123456789,.%' }
      : {}),
  });
  const { data } = await worker.recognize(preprocess(canvas));
  const text = kind === 'number' ? cleanupNumeric(data.text) : longestLine(data.text);
  return { text, confidence: text ? (data.confidence ?? 0) : 0 };
}

export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  opts: { lang?: OcrLang; kind?: OcrKind; whitelist?: string; psm?: string; onProgress?: (p: number) => void } = {},
): Promise<string> {
  const { lang = 'eng', kind = 'number', onProgress } = opts;
  const { text } = await recognize(canvas, lang, kind, opts.whitelist, opts.psm);
  onProgress?.(1);
  return text;
}

/**
 * Text-path parity with Android extractBestText: eng + jpn + chi_sim recognized
 * in parallel, then the most confident read wins — so a correct English title is
 * returned as-is instead of losing to CJK-looking model noise ("translation").
 * CJK content still wins whenever it reads confidently; longest text breaks ties.
 * jpn/chi_sim failing (e.g. offline, model not yet downloaded) degrades to eng-only.
 */
export async function ocrText(canvas: HTMLCanvasElement): Promise<string> {
  const [en, ja, zh] = await Promise.all([
    recognize(canvas, 'eng', 'text'),
    recognize(canvas, 'jpn', 'text').catch(() => ({ text: '', confidence: 0 })),
    recognize(canvas, 'chi_sim', 'text').catch(() => ({ text: '', confidence: 0 })),
  ]);
  const cands = [
    { text: en.text, conf: en.confidence, cjk: false },
    { text: ja.text, conf: ja.confidence, cjk: hasCJK(ja.text) },
    { text: zh.text, conf: zh.confidence, cjk: hasCJK(zh.text) },
  ].filter((c) => c.text !== '');
  if (cands.length === 0) return '';
  cands.sort((a, b) => b.conf - a.conf || Number(b.cjk) - Number(a.cjk) || b.text.length - a.text.length);
  return cands[0].text;
}

export async function terminateOcr(): Promise<void> {
  for (const w of workerCache.values()) await w.terminate();
  workerCache.clear();
}
