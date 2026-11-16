import { describe, expect, it } from 'vitest';
import { initials } from '../../src/lib/format.ts';

describe('initials', () => {
  it('uses the first letter of the first two words, uppercased', () => {
    expect(initials('P16 Song')).toBe('PS');
    expect(initials('chrono trigger')).toBe('CT');
  });

  it('collapses repeated whitespace and ignores words beyond the second', () => {
    expect(initials('chrono   trigger')).toBe('CT');
    expect(initials('a b c')).toBe('AB');
  });

  it('keeps the legacy leading-whitespace quirk', () => {
    // split(/\s+/) yields an empty first element, matching the pre-P-11 helper.
    expect(initials('  spaced   out  ')).toBe('S');
  });

  it('handles a single word and empty input', () => {
    expect(initials('Ritsu')).toBe('R');
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });
});
