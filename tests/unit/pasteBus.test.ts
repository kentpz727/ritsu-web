import { beforeEach, describe, expect, it, vi } from 'vitest';

type PasteBus = typeof import('../../src/lib/pasteBus.ts');

function file(name: string): File {
  return { name, type: 'image/png' } as unknown as File;
}

function clipboard(files: File[] | null, items: unknown[] | null): DataTransfer {
  return {
    files: files ?? [],
    items: items ?? [],
  } as unknown as DataTransfer;
}

let bus: PasteBus;

beforeEach(async () => {
  vi.resetModules();
  bus = await import('../../src/lib/pasteBus.ts');
});

describe('clipboard extraction', () => {
  it('returns nothing for a missing clipboard', () => {
    expect(bus.filesFromClipboard(null)).toEqual([]);
  });

  it('keeps image files and drops non-images', () => {
    const image = file('a.png');
    const text = { name: 'a.txt', type: 'text/plain' } as unknown as File;
    expect(bus.filesFromClipboard(clipboard([image, text], null))).toEqual([image]);
  });

  it('falls back to clipboard items when no image files are present', () => {
    const image = file('b.png');
    const items = [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/jpeg', getAsFile: () => image },
      { kind: 'file', type: 'image/png', getAsFile: () => null },
      { kind: 'file', type: 'text/plain', getAsFile: () => file('c.txt') },
    ];
    expect(bus.filesFromClipboard(clipboard(null, items))).toEqual([image]);
  });
});

describe('paste bus delivery', () => {
  it('ignores empty batches', () => {
    const listener = vi.fn();
    bus.subscribePastedFiles(listener);
    bus.publishPastedFiles([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('delivers to current subscribers with increasing ids', () => {
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribePastedFiles(first);
    bus.subscribePastedFiles(second);

    const batch = [file('a.png')];
    bus.publishPastedFiles(batch);
    bus.publishPastedFiles([file('b.png')]);

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(first.mock.calls[0][0]).toEqual({ id: 1, files: batch });
    expect(first.mock.calls[1][0].id).toBe(2);
  });

  it('holds the latest batch until the first subscriber arrives', () => {
    bus.publishPastedFiles([file('sticky.png')]);
    const listener = vi.fn();
    bus.subscribePastedFiles(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].files).toHaveLength(1);

    const later = vi.fn();
    bus.subscribePastedFiles(later);
    expect(later).not.toHaveBeenCalled();
  });

  it('stops delivery after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = bus.subscribePastedFiles(listener);
    unsubscribe();
    bus.publishPastedFiles([file('a.png')]);
    expect(listener).not.toHaveBeenCalled();
  });
});
