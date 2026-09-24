import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db/dexie.ts';
import { initials } from './scores.tsx';

/** Object URL for a game's logo blob (null when the game has none). */
export function useGameIconUrl(configId: number | undefined): string | null {
  const icon = useLiveQuery(
    () => db.game_configs.get(configId ?? -1).then((r) => r?.displayIcon ?? null),
    [configId],
  );
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!icon) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(icon);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [icon]);
  return url;
}

/** Game logo thumbnail with initials fallback (same 73px card look). */
export function GameIcon({
  configId,
  label,
  size = 73,
  fallback,
}: {
  configId: number;
  label: string;
  size?: number;
  fallback?: ReactNode;
}) {
  const url = useGameIconUrl(configId);
  if (url) {
    return (
      <img
        src={url}
        alt={label}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 8, border: '1px solid #E6F3F4', objectFit: 'cover', flex: 'none' }}
      />
    );
  }
  return (
    <span className="thumb" aria-hidden style={size !== 73 ? { width: size, height: size } : undefined}>
      {fallback ?? initials(label)}
    </span>
  );
}

/** Downscale an uploaded image to a small PNG blob for IndexedDB storage. */
export async function fileToIconBlob(f: File, max = 256): Promise<Blob> {
  const bmp = await createImageBitmap(f);
  try {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Could not process image');
    return blob;
  } finally {
    bmp.close();
  }
}
