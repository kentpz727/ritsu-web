import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type PushToast, type ToastKind } from './toast.ts';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const TOAST_MS = 6000;
const MAX_TOASTS = 4;

/** App-wide transient messages. Renders a live region above the bottom nav. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const push = useCallback<PushToast>((message, kind = 'info') => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, message, kind }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((list) => list.filter((t) => t.id !== id));
    }, TOAST_MS);
    timers.current.add(timer);
  }, []);

  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{t.message}</span>
            <button className="btn" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
