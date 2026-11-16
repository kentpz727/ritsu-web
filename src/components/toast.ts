import { createContext, useContext } from 'react';

export type ToastKind = 'info' | 'success' | 'error';
export type PushToast = (message: string, kind?: ToastKind) => void;

/** No-op default keeps components usable outside a provider (unit tests). */
export const ToastContext = createContext<PushToast>(() => {});

export function useToast(): PushToast {
  return useContext(ToastContext);
}
