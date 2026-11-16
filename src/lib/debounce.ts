/** Debounced function with explicit flush/cancel for lifecycle boundaries. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run a pending call now instead of waiting for the timer. */
  flush(): void;
  /** Drop a pending call. */
  cancel(): void;
}

/**
 * Coalesce rapid calls (editor keystrokes) into one write after `delayMs` of
 * quiet. Not a gameplay timer: persistence only, no frame or scoring logic.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const run = (): void => {
    timer = null;
    const args = pending;
    pending = null;
    if (args) fn(...args);
  };

  const debounced = ((...args: A) => {
    pending = args;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  }) as Debounced<A>;

  debounced.flush = () => {
    if (timer == null) return;
    clearTimeout(timer);
    run();
  };

  debounced.cancel = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return debounced;
}
