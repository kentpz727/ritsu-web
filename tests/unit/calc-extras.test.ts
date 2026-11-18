import { describe, expect, it } from 'vitest';
import { isMissField, totalNotes } from '../../src/lib/calc/scoring.ts';
import type { ConfigField, GameConfigData } from '../../src/lib/config/types.ts';
import {
  formatFull,
  formatPlayTime,
  fromLocalInputValue,
  monthKey,
  monthLabel,
  timeAgo,
} from '../../src/lib/calc/dates.ts';

const ts = new Date(2026, 0, 2, 3, 4, 0).getTime();

describe('scoring helpers not exercised by the golden config', () => {
  it('totalNotes ignores counts that are not configured', () => {
    const cfg: GameConfigData = {
      gameName: 'G',
      judgments: [
        { key: 'perfect', label: 'Perfect' },
        { key: 'miss', label: 'Miss' },
      ],
    };
    expect(totalNotes({ perfect: 2, miss: 1, extra: 99 }, cfg)).toBe(3);
  });

  it('isMissField falls back to key or label text', () => {
    expect(isMissField({ key: 'x', label: 'MISSED' } as ConfigField)).toBe(true);
    expect(isMissField({ key: 'missed', label: 'Other' } as ConfigField)).toBe(true);
    expect(isMissField({ key: 'x', label: 'Other' } as ConfigField)).toBe(false);
  });
});

describe('date formatting', () => {
  it('falls back to a locale date after 30 days', () => {
    const old = new Date(2026, 0, 2, 3, 4, 0).getTime() - 31 * 86_400_000;
    expect(timeAgo(old, ts)).toBe(new Date(old).toLocaleDateString());
  });

  it('treats future timestamps as just now', () => {
    expect(timeAgo(ts + 60_000, ts)).toBe('just now');
  });

  it('formats play time and full date with locale rules', () => {
    expect(formatPlayTime(ts)).toBe(new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    expect(formatFull(ts)).toBe(
      new Date(ts).toLocaleString([], {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
    expect(monthLabel(ts)).toBe(new Date(ts).toLocaleDateString([], { month: 'long', year: 'numeric' }));
    expect(monthKey(ts)).toBe('2026-01');
  });

  it('rejects blank or invalid datetime-local values', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('not-a-date')).toBeNull();
  });
});
