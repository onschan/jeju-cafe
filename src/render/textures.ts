import { Graphics, Renderer, Texture, Text, Container, Rectangle } from 'pixi.js';
import type { Terrain, ObjectKind } from '../sim/index.ts';
import { ISO_W, ISO_H } from './iso';

export const TILE = 32;

const TERRAIN_COLOR: Record<Terrain, number> = { soil: 0x8a6a3a, rock: 0x555555, rock_big: 0x3a3a44, road: 0x9a9a9a };
const KIND_COLOR: Record<ObjectKind, number> = {
  field: 0x5c8a2e, tree: 0xe38b1e, seat: 0xd9c27a, wall: 0x3a3a3a, path: 0xc9b58a,
  building: 0x7a4a2a, deco: 0xaa66aa, busstop: 0x2a5aaa, gate: 0x6a4a2a, landmark: 0x8a6a3a, facility: 0x4a7a8a,
};

// 텍스처는 만든 렌더러 소유라 렌더러별로 캐시한다. (Fast Refresh로 뷰가 겹칠 때 서로의 캐시를 지우지 않도록)
const caches = new WeakMap<Renderer, Map<string, Texture>>();

function cacheFor(renderer: Renderer): Map<string, Texture> {
  let c = caches.get(renderer);
  if (!c) { c = new Map(); caches.set(renderer, c); }
  return c;
}

/** 렌더러가 파괴될 때 호출해 그 렌더러가 만든 텍스처를 해제한다. */
export function clearTextureCache(renderer: Renderer) {
  const c = caches.get(renderer);
  if (!c) return;
  for (const tex of c.values()) tex.destroy(true);
  caches.delete(renderer);
}

function rectTexture(renderer: Renderer, key: string, w: number, h: number, color: number, border = 0x000000): Texture {
  const cache = cacheFor(renderer);
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Graphics().rect(0, 0, w, h).fill(color).stroke({ color: border, width: 1, alpha: 0.35 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  cache.set(key, tex);
  return tex;
}

export function terrainTexture(renderer: Renderer, t: Terrain): Texture {
  return rectTexture(renderer, `t:${t}`, TILE, TILE, TERRAIN_COLOR[t]);
}

export function objectTexture(renderer: Renderer, kind: ObjectKind, w: number, h: number): Texture {
  return rectTexture(renderer, `o:${kind}:${w}x${h}`, w * TILE - 2, h * TILE - 2, KIND_COLOR[kind], 0xffffff);
}

/** 아이소 타일 플레이스홀더: 64×32 다이아몬드 (위 꼭짓점이 (32, 0)) */
export function isoTerrainTexture(renderer: Renderer, t: Terrain): Texture {
  const cache = cacheFor(renderer);
  const key = `it:${t}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Graphics()
    .poly([ISO_W / 2, 0, ISO_W, ISO_H / 2, ISO_W / 2, ISO_H, 0, ISO_H / 2])
    .fill(TERRAIN_COLOR[t])
    .stroke({ color: 0x000000, width: 1, alpha: 0.35 });
  const tex = renderer.generateTexture(g);
  g.destroy();
  cache.set(key, tex);
  return tex;
}

/** 아이소 오브젝트 플레이스홀더: w×h 발자국 다이아몬드 + 낮은 상자. 하단 중앙이 발자국 앞 꼭짓점(시트 규칙과 동일). */
export function isoObjectTexture(renderer: Renderer, kind: ObjectKind, w: number, h: number): Texture {
  const cache = cacheFor(renderer);
  const key = `io:${kind}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lift = 12;
  const hw = ISO_W / 2, hh = ISO_H / 2;
  const width = ISO_W * Math.max(w, h);
  // 앞 꼭짓점 (fx, fy) 기준 상대 꼭짓점: 오른쪽 (w*hw, -w*hh), 뒤 ((w-h)*hw, -(w+h)*hh), 왼쪽 (-h*hw, -h*hh)
  const fx = width / 2, fy = (w + h) * hh + lift;
  const pt = (dx: number, dy: number, z = 0) => [fx + dx, fy + dy - z] as const;
  const color = KIND_COLOR[kind];
  const g = new Graphics()
    .poly([...pt(-h * hw, -h * hh, lift), ...pt(-h * hw, -h * hh), ...pt(0, 0), ...pt(0, 0, lift)]).fill({ color, alpha: 0.75 })
    .poly([...pt(0, 0, lift), ...pt(0, 0), ...pt(w * hw, -w * hh), ...pt(w * hw, -w * hh, lift)]).fill({ color, alpha: 0.55 })
    .poly([...pt(0, 0, lift), ...pt(w * hw, -w * hh, lift), ...pt((w - h) * hw, -(w + h) * hh, lift), ...pt(-h * hw, -h * hh, lift)])
    .fill(color).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
  // 도형 바운즈가 아니라 캔버스 전체를 잘라야 하단 중앙 = 앞 꼭짓점이 유지된다
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, width, fy) });
  g.destroy();
  cache.set(key, tex);
  return tex;
}

/** 밤 조명용 부드러운 원형 글로우 (동심원 알파 감쇠). additive 블렌드로 쓴다. */
export function glowTexture(renderer: Renderer, radius = 48): Texture {
  const cache = cacheFor(renderer);
  const key = `glow:${radius}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Graphics();
  const steps = 12;
  for (let i = steps; i >= 1; i--) {
    const k = i / steps;
    g.circle(radius, radius, radius * k).fill({ color: 0xffd27a, alpha: 0.09 * (1 - k) + 0.02 });
  }
  const tex = renderer.generateTexture(g);
  g.destroy();
  cache.set(key, tex);
  return tex;
}

/** 픽셀 폰트가 로드되면 이후 만드는 라벨은 Galmuri11을 쓴다 (폴백: system-ui) */
let labelFont = 'system-ui';
export async function loadLabelFont(): Promise<void> {
  try { await document.fonts.load('12px Galmuri11'); labelFont = 'Galmuri11'; } catch { /* 폴백 유지 */ }
}

/** 오브젝트 위에 이름을 얹는 라벨 (플레이스홀더 전용) */
export function label(text: string, size = 9): Text {
  return new Text({ text, style: { fontSize: size, fill: 0xffffff, fontFamily: labelFont } });
}

export function bubble(mood: 'happy' | 'meh' | 'angry' | null): Container {
  const c = new Container();
  const g = new Graphics().roundRect(0, 0, 18, 14, 4).fill(0xffffff);
  const t = label(mood === 'happy' ? ':)' : mood === 'meh' ? ':|' : mood === 'angry' ? '>:(' : '…', 10);
  t.position.set(2, 1);
  c.addChild(g, t);
  return c;
}
