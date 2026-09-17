import { Graphics, Renderer, Texture, Text, Container } from 'pixi.js';
import type { Terrain, ObjectKind } from '../sim/index.ts';

export const TILE = 32;

const TERRAIN_COLOR: Record<Terrain, number> = { soil: 0x8a6a3a, rock: 0x555555, road: 0x9a9a9a };
const KIND_COLOR: Record<ObjectKind, number> = {
  field: 0x5c8a2e, tree: 0xe38b1e, seat: 0xd9c27a, wall: 0x3a3a3a, path: 0xc9b58a,
  building: 0x7a4a2a, deco: 0xaa66aa, busstop: 0x2a5aaa, gate: 0x6a4a2a,
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

/** 오브젝트 위에 이름을 얹는 라벨 (플레이스홀더 전용) */
export function label(text: string, size = 9): Text {
  return new Text({ text, style: { fontSize: size, fill: 0xffffff, fontFamily: 'system-ui' } });
}

export function bubble(mood: 'happy' | 'meh' | 'angry' | null): Container {
  const c = new Container();
  const g = new Graphics().roundRect(0, 0, 18, 14, 4).fill(0xffffff);
  const t = label(mood === 'happy' ? '😊' : mood === 'meh' ? '😐' : mood === 'angry' ? '😠' : '…', 10);
  t.position.set(2, 1);
  c.addChild(g, t);
  return c;
}
