// System clipboard plumbing: Print Screen (or any copied image) + Ctrl+V
// anywhere in the app publishes the image files; the Import page consumes them.
// Paste targets inside text inputs are never hijacked (checked by the listener).

export interface PastedBatch {
  id: number;
  files: File[];
}

/** Extract image files from a paste clipboardData (files first, items fallback). */
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const found: File[] = [];
  const files = (data.files ? Array.prototype.slice.call(data.files) : []) as File[];
  for (const f of files) {
    if (f.type.startsWith('image/')) found.push(f);
  }
  if (found.length > 0) return found;
  const items = (data.items ? Array.prototype.slice.call(data.items) : []) as DataTransferItem[];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) found.push(f);
    }
  }
  return found;
}

let nextId = 1;
type Listener = (b: PastedBatch) => void;
const listeners = new Set<Listener>();
// Sticky: the Import page often mounts AFTER the paste (we navigate to it),
// so the latest batch waits for the first subscriber instead of being lost.
let pending: PastedBatch | null = null;

export function publishPastedFiles(files: File[]): void {
  if (files.length === 0) return;
  const batch: PastedBatch = { id: nextId++, files };
  if (listeners.size === 0) {
    pending = batch;
    return;
  }
  listeners.forEach((fn) => fn(batch));
}

export function subscribePastedFiles(fn: Listener): () => void {
  listeners.add(fn);
  if (pending) {
    const batch = pending;
    pending = null;
    fn(batch);
  }
  return () => {
    listeners.delete(fn);
  };
}
