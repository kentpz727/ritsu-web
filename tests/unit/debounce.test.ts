import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/lib/debounce.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('P-14 debounce', () => {
  it('coalesces a burst of edits into one call with the latest value', () => {
    const save = vi.fn();
    const queue = debounce(save, 300);

    for (let i = 0; i < 10; i++) queue(`Full Combo ${i}`);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith('Full Combo 9');
  });

  it('flush writes the pending edit immediately', () => {
    const save = vi.fn();
    const queue = debounce(save, 300);
    queue('draft');

    queue.flush();
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith('draft');

    vi.advanceTimersByTime(300);
    expect(save).toHaveBeenCalledOnce();
  });

  it('cancel drops the pending edit', () => {
    const save = vi.fn();
    const queue = debounce(save, 300);
    queue('draft');

    queue.cancel();
    vi.advanceTimersByTime(300);
    expect(save).not.toHaveBeenCalled();
  });
});
