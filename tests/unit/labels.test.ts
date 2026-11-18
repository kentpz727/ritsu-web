import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

const FILES = tsxFiles(SRC);

function read(relative: string): string {
  return readFileSync(join(SRC, relative), 'utf8');
}

/**
 * P-15: the app is local-only. UI copy must not imply sign-in or a shared
 * leaderboard while every row comes from this browser's IndexedDB.
 */
describe('P-15 truthful local-only labels', () => {
  it('has no UI string that calls a local list a leaderboard', () => {
    const offenders = FILES.filter((file) => /leaderboard/i.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('labels the data destination without implying an account', () => {
    const layout = read('components/Layout.tsx');
    expect(layout).not.toMatch(/aria-label="Account/);
    expect(layout).not.toMatch(/title="Account"/);
    expect(layout).toContain('title="Data and backups"');
    expect(layout).toContain('aria-label="Data and backups"');
  });

  it('states that the rankings are local wherever they are shown', () => {
    expect(read('pages/ChartDetailsPage.tsx')).toContain('Local chart rankings');
    expect(read('pages/GameDetailsPage.tsx')).toContain('Local game rankings');
    expect(read('pages/DataPage.tsx')).toContain('Local game performance');
  });
});
