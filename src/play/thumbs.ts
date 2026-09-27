/** 카탈로그·카드용 작은 그림: 시트(sheet.png)에서 프레임을 잘라 데이터 URL로. 한 번 자르면 캐시. */
import { useEffect, useState } from 'react';
import { assetUrl } from './assetUrl';

interface Frame { frame: { x: number; y: number; w: number; h: number } }
let frames: Record<string, Frame> | null = null;
let img: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;
const cache = new Map<string, string>();
const waiters = new Set<() => void>();

function ensure(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const j = await fetch(assetUrl('assets/sheet.json')).then((r) => r.json()) as { frames: Record<string, Frame> };
    frames = j.frames;
    img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = assetUrl('assets/sheet.png'); });
    for (const w of waiters) w();
  })();
  return loading;
}
export function thumbUrl(sprite: string, size = 56): string | null {
  const key = `${sprite}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!frames || !img) { void ensure(); return null; }
  const f = frames[sprite]?.frame;
  if (!f) return null;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const k = Math.min(size / f.w, size / f.h, 2);
  const w = Math.round(f.w * k), h = Math.round(f.h * k);
  ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round((size - w) / 2), Math.round(size - h), w, h);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
/** React: 시트가 준비되면 다시 그린다 */
export function useThumb(sprite: string, size = 56): string | null {
  const [, bump] = useState(0);
  useEffect(() => { if (frames) return; const w = () => bump((n) => n + 1); waiters.add(w); void ensure(); return () => { waiters.delete(w); }; }, []);
  return thumbUrl(sprite, size);
}
