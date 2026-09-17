import { Application, Container, Sprite, Graphics, Texture } from 'pixi.js';
import type { GameState, PlacedObject, Guest, Season } from '../sim/index.ts';
import { seasonOf } from '../sim/index.ts';
import { objectDef, cropDef } from '../data/index.ts';
import { TILE, terrainTexture, objectTexture, label, bubble, clearTextureCache } from './textures';
import { loadAssets, tex, hasAssets, spriteName } from './assets';
import { attachCamera } from './camera';

export interface GameViewOptions {
  onTap: (cellX: number, cellY: number) => void;
}

/** HUD 두 줄(~87px) + 할망 안내(두 줄이면 ~136px) 아래에 0행이 오도록 하는 월드 기본 오프셋 */
const WORLD_OFFSET = { x: 8, y: 140 };

type Dir = 'down' | 'up' | 'left' | 'right';
type Frame = 0 | 1 | 2;

/** 걷기 애니 8fps (125ms/프레임) */
const WALK_FRAME_MS = 125;
/** 말풍선 팝 시간 */
const BUBBLE_POP_MS = 200;
/** 코인 팝: 4프레임 × 80ms, 12px 떠오름 */
const COIN_FRAME_MS = 80;
const COIN_FRAMES = 4;
const COIN_RISE_PX = 12;
/** 캐릭터 스프라이트 높이(발끝 기준 머리 위까지) */
const GUEST_H = 48;

interface ObjEntry {
  node: Container;
  type: string;
  /** 시트 스프라이트. 플레이스홀더 노드면 null */
  sprite: Sprite | null;
  ring: Sprite | null;
}

interface GuestEntry {
  node: Container;
  sprite: Sprite | null;
  /** 이미 주문한 손님(불러오기 포함)은 코인 팝을 띄우지 않는다 */
  hadMenu: boolean;
}

interface Fx {
  sprite: Sprite;
  born: number;
  y0: number;
}

/** 오브젝트 상태별 스프라이트 변형 이름 */
function objectVariant(o: PlacedObject): string | undefined {
  if (o.type === 'field') return o.crop ? (o.crop.ready ? 'ready' : 'planted') : 'empty';
  if (o.type === 'tangerine_tree') {
    if (!o.crop) return undefined;
    if (o.crop.ready) return 'ready';
    return o.crop.daysGrown < cropDef('tangerine').growDays / 3 ? 'young' : undefined;
  }
  if (o.type === 'gate') return '0'; // 2B에서 영업 토글 연동
  return undefined;
}

function objectTex(o: PlacedObject): Texture | null {
  if (!hasAssets()) return null;
  const variant = objectVariant(o);
  return tex(spriteName.object(o.type, variant)) ?? (variant ? tex(spriteName.object(o.type)) : null);
}

function guestDir(g: Guest): Dir {
  const next = g.path[0];
  if (!next || g.phase === 'seated') return 'down';
  const dx = next.x - g.x;
  const dy = next.y - g.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy < 0) return 'up';
  return 'down';
}

/** Pixi 씬을 소유하고, render(state)로 상태를 화면에 반영한다. 상태를 바꾸지 않는다. */
export class GameView {
  app = new Application();
  world = new Container();
  private tiles = new Container();
  /** 오브젝트·손님을 한 컨테이너에 두고 바닥 y로 정렬한다 */
  private actors = new Container();
  private overlay = new Container();
  private objNodes = new Map<string, ObjEntry>();
  private guestNodes = new Map<string, GuestEntry>();
  /** 오브젝트 id → 마지막으로 그린 배지 키. 키가 같으면 다시 그리지 않는다. */
  private badgeKeys = new Map<string, string>();
  /** 손님 id → 마지막으로 만든 말풍선 키. 키가 같으면 다시 만들지 않는다. */
  private bubbleKeys = new Map<string, string>();
  private tileSprites: Sprite[] = [];
  private tilesBuilt = false;
  private lastSeason: Season | null = null;
  private detachCamera: (() => void) | null = null;
  private selection = new Graphics();
  private hostWidth = 0;
  /** 렌더 전용 애니 큐: 말풍선 팝, 코인 팝 */
  private bubblePops: { node: Container; born: number }[] = [];
  private fxQueue: Fx[] = [];

  async init(parent: HTMLElement, opts: GameViewOptions) {
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    await loadAssets();
    parent.appendChild(this.app.canvas);
    this.actors.sortableChildren = true;
    this.world.addChild(this.tiles, this.actors, this.overlay);
    this.overlay.addChild(this.selection);
    this.app.stage.addChild(this.world);
    this.detachCamera = attachCamera(this.app.stage, { world: this.world, canvas: this.app.canvas, onTap: opts.onTap });
    this.hostWidth = parent.clientWidth;
    this.world.position.set(WORLD_OFFSET.x, WORLD_OFFSET.y);
  }

  destroy() {
    this.detachCamera?.();
    this.detachCamera = null;
    // init()이 끝나기 전에 언마운트되면 renderer가 없어 destroy가 던진다
    const renderer = this.app.renderer;
    if (!renderer) return;
    this.app.destroy(true, { children: true });
    clearTextureCache(renderer);
  }

  /** 저장 불러오기·새 게임처럼 상태가 통째로 바뀔 때 노드 캐시를 비운다. */
  reset() {
    for (const { node } of this.objNodes.values()) node.destroy({ children: true });
    for (const { node } of this.guestNodes.values()) node.destroy({ children: true });
    for (const fx of this.fxQueue) fx.sprite.destroy();
    this.objNodes.clear();
    this.guestNodes.clear();
    this.badgeKeys.clear();
    this.bubbleKeys.clear();
    this.bubblePops = [];
    this.fxQueue = [];
    this.tiles.removeChildren().forEach((c) => c.destroy());
    this.tileSprites = [];
    this.tilesBuilt = false;
    this.lastSeason = null;
    this.selection.clear();
  }

  setSelection(cell: { x: number; y: number } | null) {
    this.selection.clear();
    if (!cell) return;
    this.selection.rect(cell.x * TILE, cell.y * TILE, TILE, TILE).stroke({ color: 0xffff00, width: 2 });
  }

  render(state: GameState) {
    const season = seasonOf(state.clock.month);
    if (!this.tilesBuilt) {
      this.buildTiles(state, season);
      this.world.scale.set(Math.min(2, Math.max(1, Math.floor(this.hostWidth / (state.grid.w * TILE)))));
    } else if (season !== this.lastSeason) {
      this.retintTiles(state, season);
    }
    const now = performance.now();
    this.syncObjects(state, now);
    this.syncGuests(state, now);
    this.tickFx(now);
  }

  private tileTexture(state: GameState, i: number, season: Season): Texture {
    const cell = state.grid.cells[i]!;
    return (hasAssets() ? tex(spriteName.tile(cell.terrain, season)) : null) ?? terrainTexture(this.app.renderer, cell.terrain);
  }

  private buildTiles(state: GameState, season: Season) {
    this.tiles.removeChildren().forEach((c) => c.destroy());
    this.tileSprites = [];
    for (let y = 0; y < state.grid.h; y++) {
      for (let x = 0; x < state.grid.w; x++) {
        const sp = new Sprite(this.tileTexture(state, y * state.grid.w + x, season));
        sp.position.set(x * TILE, y * TILE);
        this.tiles.addChild(sp);
        this.tileSprites.push(sp);
      }
    }
    this.tilesBuilt = true;
    this.lastSeason = season;
  }

  /** 계절이 바뀌면 타일 텍스처만 교체한다 */
  private retintTiles(state: GameState, season: Season) {
    for (let i = 0; i < this.tileSprites.length; i++) this.tileSprites[i]!.texture = this.tileTexture(state, i, season);
    this.lastSeason = season;
  }

  /** 오브젝트 노드. 원점은 footprint 바닥선(왼쪽 아래)이고, 스프라이트는 바닥 정렬한다. */
  private makeObjectNode(o: PlacedObject): ObjEntry {
    const def = objectDef(o.type);
    const c = new Container();
    const bottom = (o.y + def.h) * TILE;
    c.position.set(o.x * TILE, bottom);
    c.zIndex = bottom;
    const t = objectTex(o);
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0, 1);
      c.addChild(sp);
      return { node: c, type: o.type, sprite: sp, ring: null };
    }
    const top = -def.h * TILE;
    const sp = new Sprite(objectTexture(this.app.renderer, def.kind, def.w, def.h));
    sp.position.set(1, top + 1);
    c.addChild(sp);
    if (!hasAssets()) {
      const l = label(def.name);
      l.position.set(3, top + 2);
      c.addChild(l);
    }
    const badge = new Graphics();
    badge.label = 'badge';
    badge.position.set(0, top);
    c.addChild(badge);
    return { node: c, type: o.type, sprite: null, ring: null };
  }

  private syncObjects(state: GameState, now: number) {
    for (const [id, entry] of this.objNodes) {
      const o = state.objects[id];
      // 없어졌거나, 불러오기·리셋 뒤 id가 재사용돼 타입이 달라진 노드는 버린다
      if (!o || o.type !== entry.type) {
        entry.node.destroy({ children: true });
        this.objNodes.delete(id);
        this.badgeKeys.delete(id);
      }
    }
    const blinkOn = Math.floor(now / 300) % 2 === 0;
    const ringAlpha = 0.5 + 0.5 * Math.sin(now / 200);
    for (const o of Object.values(state.objects)) {
      let entry = this.objNodes.get(o.id);
      if (!entry) {
        entry = this.makeObjectNode(o);
        this.actors.addChild(entry.node);
        this.objNodes.set(o.id, entry);
      }
      if (entry.ring) entry.ring.alpha = ringAlpha;
      if (entry.sprite) {
        // 시트 모드: 변형·수확 가능 여부가 바뀔 때만 텍스처와 링을 갱신
        const ready = o.crop?.ready === true;
        const key = `${objectVariant(o) ?? ''}:${ready}`;
        if (this.badgeKeys.get(o.id) === key) continue;
        this.badgeKeys.set(o.id, key);
        const t = objectTex(o);
        if (t) entry.sprite.texture = t;
        const ringTex = ready ? tex('fx_ready_ring') : null;
        if (ringTex && !entry.ring) {
          const ring = new Sprite(ringTex);
          ring.anchor.set(0, 1);
          ring.alpha = ringAlpha;
          entry.node.addChild(ring);
          entry.ring = ring;
        } else if (!ringTex && entry.ring) {
          entry.ring.destroy();
          entry.ring = null;
        }
        continue;
      }
      // 플레이스홀더: 심음=초록 점, 수확 가능=노란 테두리 깜빡임. 키가 바뀔 때만 다시 그린다.
      const key = o.crop ? `${o.crop.cropId}:${o.crop.ready}:${o.crop.ready ? blinkOn : ''}` : '';
      if (this.badgeKeys.get(o.id) === key) continue;
      this.badgeKeys.set(o.id, key);
      const badge = entry.node.getChildByLabel('badge') as Graphics;
      badge.clear();
      if (o.crop) {
        if (o.crop.ready) {
          if (blinkOn) badge.rect(0, 0, TILE, TILE).stroke({ color: 0xffe066, width: 2 });
        } else {
          badge.circle(TILE - 6, TILE - 6, 3).fill(0x66ff66);
        }
      }
    }
  }

  /** 손님 노드. 원점은 발끝(셀 가운데 아래). */
  private makeGuestNode(g: Guest): GuestEntry {
    const c = new Container();
    const t = hasAssets() ? tex(spriteName.guest(g.type, 'down', 1)) : null;
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 1);
      c.addChild(sp);
      return { node: c, sprite: sp, hadMenu: g.menuId !== null };
    }
    const body = new Graphics().roundRect(-8, -36, 16, 24, 4).fill(g.type === 'local' ? 0x4a90d9 : 0xe07a5f);
    c.addChild(body);
    return { node: c, sprite: null, hadMenu: g.menuId !== null };
  }

  private syncGuests(state: GameState, now: number) {
    const alive = new Set(state.guests.map((g) => g.id));
    for (const [id, entry] of this.guestNodes) {
      if (!alive.has(id)) {
        entry.node.destroy({ children: true });
        this.guestNodes.delete(id);
        this.bubbleKeys.delete(id);
      }
    }
    const walkFrame = (Math.floor(now / WALK_FRAME_MS) % 3) as Frame;
    for (const g of state.guests) {
      let entry = this.guestNodes.get(g.id);
      if (!entry) { entry = this.makeGuestNode(g); this.actors.addChild(entry.node); this.guestNodes.set(g.id, entry); }
      const { node } = entry;
      // 같은 날 스폰된 손님이 겹쳐 걷지 않도록 id 기반 작은 오프셋
      const jitter = (parseInt(g.id.slice(1), 10) % 3) * 4 - 4;
      const footY = (g.y + 1) * TILE;
      node.position.set((g.x + 0.5) * TILE + jitter, footY);
      // 같은 행의 바닥 오브젝트(올렛길·정류장)보다 앞에 그린다
      node.zIndex = footY + 0.5;
      if (entry.sprite) {
        const walking = g.phase !== 'seated' && g.path.length > 0;
        const t = tex(spriteName.guest(g.type, guestDir(g), walking ? walkFrame : 1));
        if (t && entry.sprite.texture !== t) entry.sprite.texture = t;
      }
      // 첫 주문(판매) 순간에 코인 팝
      if (!entry.hadMenu && g.menuId !== null) {
        entry.hadMenu = true;
        this.spawnCoin(node.x, footY - GUEST_H - 4, now);
      }
      // 말풍선은 앉아 있는 동안 기분이 바뀔 때만 다시 만든다
      const key = g.phase === 'seated' ? String(g.mood) : '';
      if (this.bubbleKeys.get(g.id) === key) continue;
      this.bubbleKeys.set(g.id, key);
      node.getChildByLabel('bubble')?.destroy({ children: true });
      if (key) {
        const b = this.makeBubble(g.mood);
        b.label = 'bubble';
        node.addChild(b);
        b.scale.set(0.6);
        this.bubblePops.push({ node: b, born: now });
      }
    }
  }

  private makeBubble(mood: Guest['mood']): Container {
    const t = hasAssets() ? tex(spriteName.bubble(mood ?? 'wait')) : null;
    if (t) {
      const sp = new Sprite(t);
      // 꼬리(왼쪽 아래)가 머리 오른쪽 위에 닿도록
      sp.anchor.set(0.2, 1);
      sp.position.set(6, -GUEST_H + 2);
      return sp;
    }
    const b = bubble(mood);
    b.position.set(-2, -GUEST_H - 12);
    return b;
  }

  private spawnCoin(x: number, y0: number, now: number) {
    const t = tex('fx_coin_0');
    if (!t) return;
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);
    sp.position.set(x, y0);
    this.overlay.addChild(sp);
    this.fxQueue.push({ sprite: sp, born: now, y0 });
  }

  /** 렌더 전용 애니 진행: 말풍선 팝 스케일, 코인 프레임·상승 */
  private tickFx(now: number) {
    if (this.bubblePops.length) {
      this.bubblePops = this.bubblePops.filter(({ node, born }) => {
        if (node.destroyed) return false;
        const k = Math.min(1, (now - born) / BUBBLE_POP_MS);
        node.scale.set(0.6 + 0.4 * k);
        return k < 1;
      });
    }
    if (this.fxQueue.length) {
      const total = COIN_FRAME_MS * COIN_FRAMES;
      this.fxQueue = this.fxQueue.filter((fx) => {
        const age = now - fx.born;
        if (age >= total) { fx.sprite.destroy(); return false; }
        const t = tex(`fx_coin_${Math.floor(age / COIN_FRAME_MS)}`);
        if (t) fx.sprite.texture = t;
        fx.sprite.y = fx.y0 - COIN_RISE_PX * (age / total);
        return true;
      });
    }
  }
}
