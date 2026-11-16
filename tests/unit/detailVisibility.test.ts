import { describe, expect, it } from 'vitest';
import type { GameConfigData } from '../../src/lib/config/types.ts';
import { filterDetailsByConfig } from '../../src/lib/config/types.ts';

const CONFIG: GameConfigData = {
  gameName: 'Boolean Game',
  misc: [
    { key: 'fullCombo', label: 'Full Combo', type: 'boolean' },
    { key: 'cleared', label: 'Cleared', type: 'boolean' },
    { key: 'allPerfect', label: 'All Perfect', type: 'boolean' },
    { key: 'mode', label: 'Mode', type: 'text' },
  ],
};

const DETAILS = [
  { key: 'fullCombo', value: 'true', category: 'Misc' },
  { key: 'cleared', value: 'false', category: 'Misc' },
  { key: 'mode', value: 'Hard', category: 'Misc' },
  { key: 'removedField', value: 'x', category: 'Misc' },
];

describe('P-13 boolean misc details', () => {
  it('renders true as Yes, false as No, and a missing boolean as a dash', () => {
    const visible = filterDetailsByConfig(CONFIG, DETAILS);
    expect(visible.misc.map((m) => [m.key, m.display])).toEqual([
      ['fullCombo', 'Yes'],
      ['cleared', 'No'],
      ['mode', 'Hard'],
      ['allPerfect', '—'],
    ]);
  });

  it('keeps explicit false values instead of filtering them out', () => {
    const visible = filterDetailsByConfig(CONFIG, DETAILS);
    expect(visible.misc.find((m) => m.key === 'cleared')?.value).toBe('false');
  });

  it('leaves raw misc values alone when no config is loaded', () => {
    const visible = filterDetailsByConfig(null, DETAILS);
    expect(visible.misc.map((m) => [m.key, m.display])).toEqual([
      ['fullCombo', 'true'],
      ['cleared', 'false'],
      ['mode', 'Hard'],
      ['removedField', 'x'],
    ]);
  });
});
