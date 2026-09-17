/** 스프라이트 시트(public/assets/sheet.png + sheet.json)를 2D 캔버스에 그리는 도우미.
 *  Pixi 없이 그리는 타이틀 배경·장면 창이 쓴다. 시트 로드 실패 시 null → 호출자가 색 사각형으로 대신한다. */
import { assetUrl } from './assetUrl';

interface Frame { x: number; y: number; w: number; h: number }
export interface Sheet { image: HTMLImageElement; frames: Record<string, Frame> }

let loading: Promise<Sheet | null> | null = null;

export function loadSheet(): Promise<Sheet | null> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch(assetUrl('assets/sheet.json'));
      const json = (await res.json()) as { frames: Record<string, { frame: Frame }>; meta: { image: string } };
      const image = new Image();
      image.src = assetUrl(`assets/${json.meta.image}`);
      await image.decode();
      const frames: Record<string, Frame> = {};
      for (const [name, f] of Object.entries(json.frames)) frames[name] = f.frame;
      return { image, frames };
    } catch (e) {
      console.warn('sheetCanvas: 시트 로드 실패', e);
      return null;
    }
  })();
  return loading;
}

export function frameSize(sheet: Sheet, name: string): { w: number; h: number } | null {
  const f = sheet.frames[name];
  return f ? { w: f.w, h: f.h } : null;
}

const tintCache = new Map<string, HTMLCanvasElement>();

/** 프레임을 tint(채널 곱, Pixi tint와 같음)한 오프스크린 캔버스. 같은 (프레임, 색)은 재사용. */
function tintedFrame(sheet: Sheet, name: string, f: Frame, tint: number): HTMLCanvasElement {
  const key = `${name}:${tint}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, f.w, f.h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  tintCache.set(key, c);
  return c;
}

/** 프레임을 (x, y)에 그린다. anchor는 0~1 (기본 왼쪽 위). 없는 프레임이면 false. */
export function drawFrame(ctx: CanvasRenderingContext2D, sheet: Sheet, name: string, x: number, y: number,
  opts: { tint?: number; anchorX?: number; anchorY?: number; scale?: number } = {}): boolean {
  const f = sheet.frames[name];
  if (!f) return false;
  const scale = opts.scale ?? 1;
  const dx = Math.round(x - (opts.anchorX ?? 0) * f.w * scale);
  const dy = Math.round(y - (opts.anchorY ?? 0) * f.h * scale);
  ctx.imageSmoothingEnabled = false;
  if (opts.tint !== undefined) ctx.drawImage(tintedFrame(sheet, name, f, opts.tint), 0, 0, f.w, f.h, dx, dy, f.w * scale, f.h * scale);
  else ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, dx, dy, f.w * scale, f.h * scale);
  return true;
}
