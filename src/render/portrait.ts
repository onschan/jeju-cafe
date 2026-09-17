import type { Texture } from 'pixi.js';
import { peekTex, spriteName } from './assets';
import { HAIR_RGB, TOP_RGB, type CharacterParts } from './character';

/** 초상 캔버스 크기 (64×64, 픽셀 확대) */
export const PORTRAIT_SIZE = 64;
/** 파츠 초상 프레임 이름 (아트 브랜치의 pt_* 시트). 없으면 걷기 몸 조합으로 대신한다. */
const PT = {
  face: (skin: number) => `pt_face_${skin}`,
  hair: (style: number) => `pt_hair_${style}`,
  top: () => 'pt_top',
  acc: (kind: string) => `pt_acc_${kind}`,
};
/** 걷기 프레임(32×48)에서 초상으로 오려 내는 영역: 머리·상체 (위 13px은 비어 있다) */
const BODY_CROP = { x: 0, y: 10, w: 32, h: 32 };

type Img = CanvasImageSource;

function sourceOf(t: Texture): Img | null {
  const res = (t.source as { resource?: unknown }).resource;
  if (!res) return null;
  if (typeof HTMLImageElement !== 'undefined' && res instanceof HTMLImageElement) return res;
  if (typeof ImageBitmap !== 'undefined' && res instanceof ImageBitmap) return res;
  if (typeof HTMLCanvasElement !== 'undefined' && res instanceof HTMLCanvasElement) return res;
  return null;
}

/** 시트 프레임 하나를 (tint 곱해) 캔버스에 그린다. 프레임 안 crop 영역만 dst 크기로 확대. */
function drawFrame(ctx: CanvasRenderingContext2D, t: Texture, crop: { x: number; y: number; w: number; h: number } | null, tint: number | undefined, dst: number): void {
  const img = sourceOf(t);
  if (!img) return;
  const f = t.frame;
  const sx = f.x + (crop?.x ?? 0);
  const sy = f.y + (crop?.y ?? 0);
  const sw = crop?.w ?? f.width;
  const sh = crop?.h ?? f.height;
  if (tint === undefined || tint === 0xffffff) {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dst, dst);
    return;
  }
  // tint: 파츠를 오프스크린에 그리고 multiply로 색을 곱한 뒤 알파를 파츠로 되돌린다
  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const oc = off.getContext('2d')!;
  oc.imageSmoothingEnabled = false;
  oc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  oc.globalCompositeOperation = 'multiply';
  oc.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
  oc.fillRect(0, 0, sw, sh);
  oc.globalCompositeOperation = 'destination-in';
  oc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.drawImage(off, 0, 0, sw, sh, 0, 0, dst, dst);
}

/** 파츠 초상이 시트에 있나 */
export function hasPortraitParts(): boolean {
  return peekTex(PT.face(0)) !== null;
}

/** 파츠로 초상을 그린다. pt_* 프레임이 있으면 그것을(얼굴 → 상의 → 머리 → 액세서리), 없으면 걷기 몸 정면 프레임의 머리·상체를 확대한다. */
export function drawPortrait(canvas: HTMLCanvasElement, parts: CharacterParts): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  if (hasPortraitParts()) {
    const layers: { t: Texture | null; tint?: number }[] = [
      { t: peekTex(PT.face(parts.skin)) },
      { t: peekTex(PT.top()), tint: TOP_RGB[parts.top] },
      { t: peekTex(PT.hair(parts.hairStyle)), tint: HAIR_RGB[parts.hairColor] },
      ...parts.accs.map((k) => ({ t: peekTex(PT.acc(k)) })),
    ];
    for (const l of layers) if (l.t) drawFrame(ctx, l.t, null, l.tint, PORTRAIT_SIZE);
    return true;
  }
  const body = peekTex(spriteName.body(parts.skin, 'down', 1));
  if (!body) return false;
  drawFrame(ctx, body, BODY_CROP, undefined, PORTRAIT_SIZE);
  const top = peekTex(spriteName.top('down', 1));
  if (top) drawFrame(ctx, top, BODY_CROP, TOP_RGB[parts.top], PORTRAIT_SIZE);
  const hair = peekTex(spriteName.hair(parts.hairStyle, 'down'));
  if (hair) drawFrame(ctx, hair, BODY_CROP, HAIR_RGB[parts.hairColor], PORTRAIT_SIZE);
  for (const k of parts.accs) {
    const acc = peekTex(spriteName.acc(k, 'down'));
    if (acc) drawFrame(ctx, acc, BODY_CROP, undefined, PORTRAIT_SIZE);
  }
  return true;
}
