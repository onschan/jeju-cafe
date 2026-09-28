import type { Texture } from 'pixi.js';
import { peekTex, spriteName } from './assets';
import { HAIR_RGB, TOP_RGB, type CharacterParts } from './character';

/** 파츠 초상(48×48 원본, UI에서 2배로 픽셀 확대). 옛 portrait.ts 그대로 — pt_* 프레임을 얼굴→상의→머리→눈→입→액세서리 순으로 겹친다. */
export const PORTRAIT_SIZE = 48;
export type PortraitExpr = 'normal' | 'happy' | 'surprised';
const HAIR_STYLE_NAMES = ['bob', 'short', 'pony', 'perm', 'updo', 'sport', 'long', 'bald', 'part', 'bangs', 'braid', 'bun'] as const;
const HAIR_VARIANT: Record<number, number> = { 0: 9, 1: 8, 6: 10, 4: 11 };
const FACE_SHAPES = ['round', 'slim', 'square'] as const;
const EYE_KINDS = ['round', 'narrow', 'droop'] as const;
const BODY_CROP = { x: 0, y: 10, w: 32, h: 32 };

function sourceOf(t: Texture): CanvasImageSource | null {
  const res = (t.source as { resource?: unknown }).resource;
  if (!res) return null;
  if (typeof HTMLImageElement !== 'undefined' && res instanceof HTMLImageElement) return res;
  if (typeof ImageBitmap !== 'undefined' && res instanceof ImageBitmap) return res;
  if (typeof HTMLCanvasElement !== 'undefined' && res instanceof HTMLCanvasElement) return res;
  return null;
}
function drawFrame(ctx: CanvasRenderingContext2D, t: Texture, crop: { x: number; y: number; w: number; h: number } | null, tint: number | undefined, dst: number): void {
  const img = sourceOf(t);
  if (!img) return;
  const f = t.frame;
  const sx = f.x + (crop?.x ?? 0), sy = f.y + (crop?.y ?? 0), sw = crop?.w ?? f.width, sh = crop?.h ?? f.height;
  if (tint === undefined || tint === 0xffffff) { ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dst, dst); return; }
  const off = document.createElement('canvas'); off.width = sw; off.height = sh;
  const oc = off.getContext('2d')!; oc.imageSmoothingEnabled = false;
  oc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  oc.globalCompositeOperation = 'multiply'; oc.fillStyle = `#${tint.toString(16).padStart(6, '0')}`; oc.fillRect(0, 0, sw, sh);
  oc.globalCompositeOperation = 'destination-in'; oc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.drawImage(off, 0, 0, sw, sh, 0, 0, dst, dst);
}
export function hasPortraitParts(): boolean { return peekTex('pt_face_0_round') !== null; }
export function portraitLook(parts: CharacterParts): { hair: string; shape: string; eyes: string } {
  const v = parts.hairColor + parts.top;
  const variant = HAIR_VARIANT[parts.hairStyle];
  const styleIdx = variant !== undefined && v % 2 === 1 ? variant : parts.hairStyle;
  return { hair: HAIR_STYLE_NAMES[styleIdx % HAIR_STYLE_NAMES.length]!, shape: FACE_SHAPES[(parts.hairColor + parts.skin) % FACE_SHAPES.length]!, eyes: EYE_KINDS[(parts.top + parts.hairStyle) % EYE_KINDS.length]! };
}
/** 파츠로 초상을 그린다. pt_* 프레임이 있으면 파츠 합성, 없으면 걷기 몸 정면 프레임의 머리·상체를 확대. 시트가 없으면 false. */
export function drawPortrait(canvas: HTMLCanvasElement, parts: CharacterParts, expr: PortraitExpr = 'normal'): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  canvas.width = PORTRAIT_SIZE; canvas.height = PORTRAIT_SIZE;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  if (hasPortraitParts()) {
    const look = portraitLook(parts);
    const layers: { t: Texture | null; tint?: number }[] = [
      { t: peekTex(`pt_face_${parts.skin}_${look.shape}`) },
      { t: peekTex('pt_top'), tint: TOP_RGB[parts.top] },
      { t: peekTex('pt_top_gloss') },
      { t: peekTex(`pt_hair_${look.hair}`), tint: HAIR_RGB[parts.hairColor] },
      { t: peekTex(`pt_hair_${look.hair}_gloss`) },
      { t: peekTex(`pt_eyes_${look.eyes}_${expr}`) },
      { t: peekTex(`pt_mouth_${expr}`) },
      ...parts.accs.map((k) => ({ t: peekTex(`pt_acc_${k}`) })),
    ];
    for (const l of layers) if (l.t) drawFrame(ctx, l.t, null, l.tint, PORTRAIT_SIZE);
    return true;
  }
  const body = peekTex(spriteName.body(parts.skin, 'down', 1));
  if (!body) return false;
  drawFrame(ctx, body, BODY_CROP, undefined, PORTRAIT_SIZE);
  const top = peekTex(spriteName.top('down', 1)); if (top) drawFrame(ctx, top, BODY_CROP, TOP_RGB[parts.top], PORTRAIT_SIZE);
  const hair = peekTex(spriteName.hair(parts.hairStyle, 'down')); if (hair) drawFrame(ctx, hair, BODY_CROP, HAIR_RGB[parts.hairColor], PORTRAIT_SIZE);
  for (const k of parts.accs) { const acc = peekTex(spriteName.acc(k, 'down')); if (acc) drawFrame(ctx, acc, BODY_CROP, undefined, PORTRAIT_SIZE); }
  return true;
}
