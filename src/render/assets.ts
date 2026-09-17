import { Assets, Texture, TextureStyle, type Spritesheet } from 'pixi.js';
import { assetUrl } from '../ui/assetUrl';

let sheet: Spritesheet | null = null;
const missing = new Set<string>();

/** 시트를 로드한다. 실패해도 게임은 플레이스홀더로 계속 돈다. */
export async function loadAssets(): Promise<boolean> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  try {
    sheet = await Assets.load<Spritesheet>(assetUrl('assets/sheet.json'));
    return true;
  } catch (e) {
    console.warn('assets: sheet 로드 실패, 플레이스홀더 사용', e);
    return false;
  }
}

/** 이름으로 텍스처. 없으면 null (호출자가 플레이스홀더 결정). 개발 중 누락 이름을 한 번만 경고. */
export function tex(name: string): Texture | null {
  const t = sheet?.textures[name] ?? null;
  if (!t && import.meta.env.DEV && !missing.has(name)) { missing.add(name); console.warn('assets: 없는 스프라이트', name); }
  return t;
}

/** 이름으로 텍스처. 없으면 경고 없이 null (폴백 체인의 앞 단계용). */
export function peekTex(name: string): Texture | null {
  return sheet?.textures[name] ?? null;
}

export function hasAssets(): boolean { return sheet !== null; }

/** 계절·상태별 이름 규칙을 한곳에 */
export const spriteName = {
  tile: (terrain: string, season: string) => `tile_${terrain}_${season}`,
  object: (type: string, variant?: string) => (variant ? `obj_${type}_${variant}` : `obj_${type}`),
  isoTile: (terrain: string, season: string) => `iso_tile_${terrain}_${season}`,
  isoObject: (type: string, variant?: string) => (variant ? `iso_obj_${type}_${variant}` : `iso_obj_${type}`),
  guest: (type: string, dir: 'down' | 'up' | 'left' | 'right', frame: 0 | 1 | 2) => `guest_${type}_${dir}_${frame}`,
  bubble: (mood: string) => `bubble_${mood}`,
  /** 파츠 캐릭터(tools/assets/sprites_chars.py) */
  body: (skin: number, dir: string, frame: number) => `body_${skin}_${dir}_${frame}`,
  top: (dir: string, frame: number) => `top_${dir}_${frame}`,
  hair: (style: number, dir: string) => `hair_${style}_${dir}`,
  acc: (kind: string, dir: string) => `acc_${kind}_${dir}`,
  icon: (id: string) => `icon_${id}`,
};
