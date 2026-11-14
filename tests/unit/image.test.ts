import { describe, expect, it } from 'vitest';
import {
  argbToRgb,
  cleanupNumeric,
  hasCJK,
  isCJKLetter,
  isLatinLetter,
  longestLine,
  majorityScriptOnly,
  matchColor,
  normalizeLevel,
  normalizeRank,
  normalizeScore,
  normalizeTitle,
  stripLeadingZeros,
} from '../../src/lib/ocr/image.ts';

describe('OCR image helpers: colors and scripts', () => {
  it('converts an Android ARGB int to RGB', () => {
    expect(argbToRgb(0xff112233)).toEqual([0x11, 0x22, 0x33]);
    expect(argbToRgb(0xff000000)).toEqual([0, 0, 0]);
    expect(argbToRgb(0xffffffff)).toEqual([255, 255, 255]);
  });

  it('recognizes Latin and CJK letters', () => {
    expect(isLatinLetter('A')).toBe(true);
    expect(isLatinLetter('é')).toBe(true);
    expect(isLatinLetter('あ')).toBe(false);
    expect(isLatinLetter('1')).toBe(false);
    expect(isCJKLetter('あ')).toBe(true);
    expect(isCJKLetter('漢')).toBe(true);
    expect(isCJKLetter('A')).toBe(false);
  });

  it('detects CJK content', () => {
    expect(hasCJK('hello あ')).toBe(true);
    expect(hasCJK('漢字')).toBe(true);
    expect(hasCJK('hello world')).toBe(false);
    expect(hasCJK('')).toBe(false);
  });

  it('keeps only the majority script', () => {
    expect(majorityScriptOnly('helloあ')).toBe('hello');
    expect(majorityScriptOnly('あhello')).toBe('hello');
    expect(majorityScriptOnly('hello世界')).toBe('hello');
    expect(majorityScriptOnly('あいうabc')).toBe('あいうabc');
    expect(majorityScriptOnly('世界')).toBe('世界');
    expect(majorityScriptOnly('abc 123 あ')).toBe('abc 123');
    expect(majorityScriptOnly('')).toBe('');
  });

  it('normalizes titles: symbols removed, whitespace collapsed, majority script kept', () => {
    expect(normalizeTitle("Heaven's Rave")).toBe('Heavens Rave');
    expect(normalizeTitle('  A   B  ')).toBe('A B');
    expect(normalizeTitle('Song 123!')).toBe('Song 123');
    expect(normalizeTitle('helloあ')).toBe('hello');
    expect(normalizeTitle('!!!')).toBe('');
  });

  it('detects a target color above the hit-share gate', () => {
    const solidRed = { data: new Uint8ClampedArray(16) } as ImageData;
    for (let i = 0; i < solidRed.data.length; i += 4) solidRed.data[i] = 255;
    expect(matchColor(solidRed, [255, 0, 0], 0.1)).toBe(true);

    const oneOfFour = { data: new Uint8ClampedArray(16) } as ImageData;
    oneOfFour.data[0] = 255;
    expect(matchColor(oneOfFour, [255, 0, 0], 0.1)).toBe(true);

    const noRed = { data: new Uint8ClampedArray(16) } as ImageData;
    expect(matchColor(noRed, [255, 0, 0], 0.1)).toBe(false);

    const twoOfTwenty = { data: new Uint8ClampedArray(80) } as ImageData;
    twoOfTwenty.data[0] = 255;
    twoOfTwenty.data[4] = 255;
    expect(matchColor(twoOfTwenty, [255, 0, 0], 0.1)).toBe(false);
  });
});

describe('OCR image helpers: numeric cleanup', () => {
  it('cleans numeric reads', () => {
    expect(cleanupNumeric('1O2.3%')).toBe('102.3');
    expect(cleanupNumeric('abc')).toBe('');
    expect(cleanupNumeric('O0O')).toBe('000');
  });

  it('picks the longest non-empty line', () => {
    expect(longestLine('a\nlongest\n bb ')).toBe('longest');
    expect(longestLine('')).toBe('');
    expect(longestLine('\n\n')).toBe('');
  });

  it('normalizes scores to digits without insignificant leading zeros', () => {
    expect(normalizeScore('007')).toBe('7');
    expect(normalizeScore('0')).toBe('0');
    expect(normalizeScore('1,234')).toBe('1234');
    expect(normalizeScore('abc')).toBe('0');
    expect(normalizeScore('000')).toBe('0');
  });

  it('strips leading zeros and repairs leading dots', () => {
    expect(stripLeadingZeros('007')).toBe('7');
    expect(stripLeadingZeros('.5')).toBe('0.5');
    expect(stripLeadingZeros('')).toBe('0');
    expect(stripLeadingZeros('0.5')).toBe('0.5');
  });

  it('normalizes levels to the leading integer', () => {
    expect(normalizeLevel('Lv.29')).toBe('29');
    expect(normalizeLevel('lvl.29')).toBe('29');
    expect(normalizeLevel('Master 14+')).toBe('14');
    expect(normalizeLevel('4.23')).toBe('4');
    expect(normalizeLevel('.29')).toBe('29');
    expect(normalizeLevel('abc')).toBe('');
    expect(normalizeLevel('007')).toBe('7');
    expect(normalizeLevel('Lv: 03')).toBe('3');
  });

  it('normalizes ranks to uppercase letters', () => {
    expect(normalizeRank('S+')).toBe('S');
    expect(normalizeRank('ss')).toBe('SS');
    expect(normalizeRank('5')).toBe('');
    expect(normalizeRank('A-1')).toBe('A');
  });
});
