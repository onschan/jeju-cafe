import type { Texture } from 'pixi.js';
import { peekTex, spriteName } from './assets';
import { HAIR_RGB, TOP_RGB, type CharacterParts } from './character';

/** 초상 원본 크기 (48×48, UI에서 2배 96px로 픽셀 확대) */
export const PORTRAIT_SIZE = 48;
/** 초상 표시 크기: 대화창·손님 팝업·직원 창 96, 미니 카드 64, 목록 48 */
export const PORTRAIT_DISPLAY = 96;
export type PortraitExpr = 'normal' | 'happy' | 'surprised';

/** tools/assets/sprites_portraits.py HAIR_STYLES 순서 — 0..7은 걷기 몸과 같고 8..11은 초상 전용 변형 */
const HAIR_STYLE_NAMES = ['bob', 'short', 'pony', 'perm', 'updo', 'sport', 'long', 'bald', 'part', 'bangs', 'braid', 'bun'] as const;
/** 걷기 실루엣을 지키는 초상 변형: (머리색+상의) 홀수면 bob→bangs, short→part, long→braid, updo→bun */
const HAIR_VARIANT: Record<number, number> = { 0: 9, 1: 8, 6: 10, 4: 11 };
const FACE_SHAPES = ['round', 'slim', 'square'] as const;
const EYE_KINDS = ['round', 'narrow', 'droop'] as const;
/** 걷기 액세서리 → 초상 액세서리 이름 (없으면 그대로) */
const ACC_MAP: Record<string, string> = { strawhat: 'strawhat', cap: 'cap', glasses: 'glasses', backpack: 'backpack', camera: 'camera', apron: 'apron' };

/** 파츠 초상 프레임 이름 (tools/assets/sprites_portraits.py의 pt_* 시트). 없으면 걷기 몸 조합으로 대신한다. */
const PT = {
  face: (skin: number, shape: string) => `pt_face_${skin}_${shape}`,
  eyes: (kind: string, expr: PortraitExpr) => `pt_eyes_${kind}_${expr}`,
  mouth: (expr: PortraitExpr) => `pt_mouth_${expr}`,
  top: () => 'pt_top',
  topGloss: () => 'pt_top_gloss',
  hair: (style: string) => `pt_hair_${style}`,
  hairGloss: (style: string) => `pt_hair_${style}_gloss`,
  acc: (kind: string) => `pt_acc_${kind}`,
  fixed: (name: string, expr: PortraitExpr) => (expr === 'normal' ? `portrait_${name}` : `portrait_${name}_${expr}`),
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
  return peekTex(PT.face(0, 'round')) !== null;
}

/** 파츠 → 초상 격자 선택(결정적): 머리 변형·얼굴형·눈매는 머리색/상의 인덱스로 고른다 (세이브 스키마 변경 없음) */
export function portraitLook(parts: CharacterParts): { hair: string; shape: string; eyes: string } {
  const v = parts.hairColor + parts.top;
  const variant = HAIR_VARIANT[parts.hairStyle];
  const styleIdx = variant !== undefined && v % 2 === 1 ? variant : parts.hairStyle;
  return {
    hair: HAIR_STYLE_NAMES[styleIdx % HAIR_STYLE_NAMES.length]!,
    shape: FACE_SHAPES[(parts.hairColor + parts.skin) % FACE_SHAPES.length]!,
    eyes: EYE_KINDS[(parts.top + parts.hairStyle) % EYE_KINDS.length]!,
  };
}

/** 파츠로 초상을 그린다. 고정 초상(parts.portrait)이 시트에 있으면 그것을, pt_* 프레임이 있으면 파츠 합성
 *  (얼굴 → 상의 → 머리 → 눈 → 입 → 액세서리), 없으면 걷기 몸 정면 프레임의 머리·상체를 확대한다. */
export function drawPortrait(canvas: HTMLCanvasElement, parts: CharacterParts, expr: PortraitExpr = 'normal'): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  if (parts.portrait) {
    const fixed = peekTex(PT.fixed(parts.portrait, expr)) ?? peekTex(PT.fixed(parts.portrait, 'normal'));
    if (fixed) { drawFrame(ctx, fixed, null, undefined, PORTRAIT_SIZE); return true; }
  }
  if (hasPortraitParts()) {
    const look = portraitLook(parts);
    const layers: { t: Texture | null; tint?: number }[] = [
      { t: peekTex(PT.face(parts.skin, look.shape)) },
      { t: peekTex(PT.top()), tint: TOP_RGB[parts.top] },
      { t: peekTex(PT.topGloss()) },
      { t: peekTex(PT.hair(look.hair)), tint: HAIR_RGB[parts.hairColor] },
      { t: peekTex(PT.hairGloss(look.hair)) },
      { t: peekTex(PT.eyes(look.eyes, expr)) },
      { t: peekTex(PT.mouth(expr)) },
      ...parts.accs.map((k) => ({ t: peekTex(PT.acc(ACC_MAP[k] ?? k)) })),
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
