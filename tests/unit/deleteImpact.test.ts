import { describe, expect, it } from 'vitest';
import { canConfirmDelete, configDeleteImpact } from '../../src/lib/config/deleteImpact.ts';

describe('config delete dialog copy', () => {
  it('reports a delete with no linked scores', () => {
    expect(configDeleteImpact(0, 'Game')).toBe('This deletes the config for "Game". No scores are linked to it.');
  });

  it('uses singular and plural score counts', () => {
    expect(configDeleteImpact(1, 'Game')).toContain('unlinks 1 score.');
    expect(configDeleteImpact(5, 'Game')).toContain('unlinks 5 scores.');
    expect(configDeleteImpact(2, 'Game')).toContain('unlinks 2 scores.');
  });

  it('always names the game and mentions undo', () => {
    const text = configDeleteImpact(7, 'Project Sekai');
    expect(text).toContain('"Project Sekai"');
    expect(text).toContain('Recently deleted');
  });
});

describe('typed delete confirmation', () => {
  it('requires an exact trimmed name match', () => {
    expect(canConfirmDelete('Game', 'Game')).toBe(true);
    expect(canConfirmDelete('  Game  ', 'Game')).toBe(true);
    expect(canConfirmDelete('Game ', 'Game')).toBe(true);
  });

  it('rejects partial, differently-cased, or empty input', () => {
    expect(canConfirmDelete('', 'Game')).toBe(false);
    expect(canConfirmDelete('Gam', 'Game')).toBe(false);
    expect(canConfirmDelete('game', 'Game')).toBe(false);
    expect(canConfirmDelete('Game 2', 'Game')).toBe(false);
  });
});
