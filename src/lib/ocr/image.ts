// OCR helpers — web port of Android OCRManager.
// ML Kit (Latin/Japanese/Chinese) -> Tesseract.js (eng/jpn/chi_sim) + canvas pipeline.

import type { OcrRect } from '../config/types.ts';

/** ARGB int (Android) -> [r,g,b] */
export function argbToRgb(argb: number): [number, number, number] {
  return [(argb >> 16) & 0xff, (argb >> 8) & 0xff, argb & 0xff];
}

/** Script ranges shared by hasCJK and the title majority filter. */
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
const CJK_LETTER = /[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;

export function isLatinLetter(ch: string): boolean {
  return LATIN_LETTER.test(ch);
}

export function isCJKLetter(ch: string): boolean {
  return CJK_LETTER.test(ch);
}

/** True when the string contains CJK-script letters (port of Android hasCJK). */
export function hasCJK(s: string): boolean {
  for (const ch of s) {
    if (isCJKLetter(ch)) return true;
  }
  return false;
}

/**
 * Keep only the majority script's letters. When a title mixes English with
 * Chinese/Japanese, the side with fewer letters is dropped ("helloあ" -> "hello").
 * Script-neutral characters (digits, spaces) are always kept; ties keep everything.
 */
export function majorityScriptOnly(text: string): string {
  let latin = 0;
  let cjk = 0;
  for (const ch of text) {
    if (isLatinLetter(ch)) latin++;
    else if (isCJKLetter(ch)) cjk++;
  }
  if (latin === 0 || cjk === 0 || latin === cjk) return text;
  const keepLatin = latin > cjk;
  let out = '';
  for (const ch of text) {
    if (isLatinLetter(ch)) {
      if (keepLatin) out += ch;
    } else if (isCJKLetter(ch)) {
      if (!keepLatin) out += ch;
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Titles carry no symbols: keep letters (any script), numbers, and spaces,
 * then drop minority-script letters ("Heaven's Rave" -> "Heavens Rave").
 */
export function normalizeTitle(raw: string): string {
  const noSymbols = raw.replace(/[^\p{L}\p{N} ]+/gu, '');
  return majorityScriptOnly(noSymbols.replace(/\s+/g, ' ').trim());
}

/** Port of OCRManager.detectColor: Euclidean RGB distance gate, >10% pixels. */
export function matchColor(img: ImageData, target: [number, number, number], threshold: number): boolean {
  let hits = 0;
  const total = img.data.length / 4;
  for (let i = 0; i < img.data.length; i += 4) {
    const d =
      Math.sqrt(
        (img.data[i] - target[0]) ** 2 + (img.data[i + 1] - target[1]) ** 2 + (img.data[i + 2] - target[2]) ** 2,
      ) / 441.67;
    if (d < threshold) hits++;
  }
  return hits / total > 0.1;
}

export function cropToCanvas(
  img: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  rect: OcrRect,
  /** Padding as a fraction of box size per side. Small padding mirrors Android's
      edge tolerance (symbols count when their center is inside the rect); use 0
      for exact crops such as color detection. */
  pad = 0,
): HTMLCanvasElement {
  const srcW = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const srcH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const px = Math.max(0, Math.floor(srcW * (rect.x - pad * rect.w)));
  const py = Math.max(0, Math.floor(srcH * (rect.y - pad * rect.h)));
  const pw = Math.min(srcW - px, Math.ceil(srcW * rect.w * (1 + pad * 2)));
  const ph = Math.min(srcH - py, Math.ceil(srcH * rect.h * (1 + pad * 2)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, pw);
  canvas.height = Math.max(1, ph);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, px, py, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Grayscale + upscale + contrast stretch. Deliberately no hard binarization:
 * Android feeds raw pixels to ML Kit, and a fixed threshold destroys
 * anti-aliased, thin, or low-contrast game text. Contrast stretch boosts weak
 * text while leaving Tesseract's own adaptive thresholding something to work with.
 */
export function preprocess(canvas: HTMLCanvasElement, scale?: number): HTMLCanvasElement {
  // Small boxes get more upscale so x-height lands in Tesseract's comfort zone.
  const s = scale ?? Math.min(4, Math.max(2, 90 / Math.max(canvas.height, 1)));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * s));
  out.height = Math.max(1, Math.round(canvas.height * s));
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const g = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const range = hi - lo || 1;
  for (let i = 0; i < img.data.length; i += 4) {
    const g = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    const v = Math.round(((g - lo) / range) * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Port of OCRManager numeric cleanup: O->0, keep digits/dot only. */
export function cleanupNumeric(raw: string): string {
  return raw.replace(/O/gi, '0').replace(/[^0-9.]/g, '');
}

export function longestLine(raw: string): string {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

/** Score: digits only, leading zeros dropped ("007" -> "7", "0" stays "0"). */
export function normalizeScore(raw: string): string {
  return stripLeadingZeros(raw.replace(/[^0-9]/g, ''));
}

/**
 * Drop insignificant leading zeros ("007" -> "7", ".5" -> "0.5", "" -> "0").
 * Mirrors Android's numeric trim (trimStart('0'), empty -> "0", ".x" -> "0.x").
 */
export function stripLeadingZeros(num: string): string {
  const t = num.replace(/^0+/, '');
  if (t === '') return '0';
  if (t.startsWith('.')) return `0${t}`;
  return t;
}

/**
 * Level: integers only. "Lv."/"Lvl." prefixes are deleted ("Lv.29" -> "29",
 * "lvl.29" -> "29"), then the leading integer is kept ("Master 14+" -> "14",
 * "4.23" -> "4"). Leading-dot fragments like ".29" can never surface.
 */
export function normalizeLevel(raw: string): string {
  const unprefixed = raw.replace(/^\s*lvl?\.?\s*:?\s*/i, '');
  const m = /[0-9]+/.exec(unprefixed);
  if (!m) return '';
  return stripLeadingZeros(m[0]);
}

/** Rank: alphabetical letters only, uppercased ("S+" -> "S", "ss" -> "SS", "5" -> ""). */
export function normalizeRank(raw: string): string {
  return raw.replace(/[^A-Za-z]/g, '').toUpperCase();
}
