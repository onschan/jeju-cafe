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

// ---------- 캔버스에 시트 프레임 직접 그리기 (타이틀 데모 풍경) ----------
export interface SheetFrames { frames: Record<string, Frame>; img: HTMLImageElement }
/** 시트가 준비되면 돌려준다 */
export async function loadSheet(): Promise<SheetFrames | null> {
  await ensure();
  return frames && img ? { frames, img } : null;
}
/** 프레임 한 장을 캔버스에 (anchor 0~1, tint는 곱셈) */
export function drawFrame(ctx: CanvasRenderingContext2D, sheet: SheetFrames, name: string, x: number, y: number, opts: { anchorX?: number; anchorY?: number; tint?: number } = {}): void {
  const f = sheet.frames[name]?.frame;
  if (!f) return;
  const dx = Math.round(x - f.w * (opts.anchorX ?? 0));
  const dy = Math.round(y - f.h * (opts.anchorY ?? 0));
  if (opts.tint === undefined) { ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h); return; }
  const off = document.createElement('canvas'); off.width = f.w; off.height = f.h;
  const oc = off.getContext('2d')!; oc.imageSmoothingEnabled = false;
  oc.drawImage(sheet.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  oc.globalCompositeOperation = 'multiply';
  oc.fillStyle = `#${opts.tint.toString(16).padStart(6, '0')}`;
  oc.fillRect(0, 0, f.w, f.h);
  oc.globalCompositeOperation = 'destination-in';
  oc.drawImage(sheet.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  ctx.drawImage(off, dx, dy);
}
