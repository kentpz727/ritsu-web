/** Minimal page-event surface so worker lifecycle wiring is testable without a DOM. */
export interface PageHideTarget {
  addEventListener(type: 'pagehide', listener: () => void): void;
  removeEventListener?(type: 'pagehide', listener: () => void): void;
}

/**
 * Run teardown when the page is hidden: tab close, reload, or navigation.
 * `pagehide` fires on mobile too, unlike `beforeunload`, and does not block
 * the unload. Returns a disposer for tests/HMR.
 */
export function onPageHide(target: PageHideTarget, teardown: () => void): () => void {
  const handler = () => teardown();
  target.addEventListener('pagehide', handler);
  return () => target.removeEventListener?.('pagehide', handler);
}
