import { afterEach, describe, expect, it, vi } from 'vitest';

interface FakeWorker {
  setParameters: ReturnType<typeof vi.fn>;
  recognize: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}

const harness = vi.hoisted(() => ({ workers: [] as FakeWorker[] }));

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => {
    const worker = {
      setParameters: vi.fn(async () => undefined),
      recognize: vi.fn(async () => ({ data: { text: '42', confidence: 90 } })),
      terminate: vi.fn(async () => undefined),
    };
    harness.workers.push(worker);
    return worker;
  }),
}));

vi.mock('../../src/lib/ocr/image.ts', () => ({
  preprocess: (canvas: unknown) => canvas,
  cleanupNumeric: (text: string) => text,
  longestLine: (text: string) => text,
  hasCJK: () => false,
}));

import { ocrCanvas, terminateOcr } from '../../src/lib/ocr/client.ts';
import { onPageHide } from '../../src/lib/ocr/lifecycle.ts';

afterEach(async () => {
  await terminateOcr();
  vi.unstubAllGlobals();
});

describe('P-12 OCR worker lifecycle', () => {
  it('reuses one worker per language and terminateOcr releases the cache', async () => {
    const canvas = {} as HTMLCanvasElement;
    await ocrCanvas(canvas);
    await ocrCanvas(canvas);
    expect(harness.workers).toHaveLength(1);

    await terminateOcr();
    expect(harness.workers[0].terminate).toHaveBeenCalledOnce();

    await ocrCanvas(canvas);
    expect(harness.workers).toHaveLength(2);
  });

  it('terminates cached workers when the page is hidden', async () => {
    const listeners: Array<() => void> = [];
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => undefined,
    });

    await ocrCanvas({} as HTMLCanvasElement);
    expect(listeners).toHaveLength(1);

    const worker = harness.workers.at(-1)!;
    listeners[0]();
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalled());
  });
});

describe('onPageHide', () => {
  it('runs teardown on pagehide and detaches when disposed', () => {
    const handlers: Array<() => void> = [];
    const target = {
      addEventListener: (_type: 'pagehide', listener: () => void) => handlers.push(listener),
      removeEventListener: (_type: 'pagehide', listener: () => void) => {
        const index = handlers.indexOf(listener);
        if (index >= 0) handlers.splice(index, 1);
      },
    };
    const teardown = vi.fn();

    const dispose = onPageHide(target, teardown);
    handlers.forEach((handler) => handler());
    expect(teardown).toHaveBeenCalledOnce();

    dispose();
    expect(handlers).toHaveLength(0);
  });
});
