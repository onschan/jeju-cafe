import { Application, Container, Sprite, Graphics, Texture } from 'pixi.js';
import type { GameState, PlacedObject, Guest, Season } from '../sim/index.ts';
import { seasonOf } from '../sim/index.ts';
import { objectDef, cropDef } from '../data/index.ts';
import { isoTerrainTexture, isoObjectTexture, glowTexture, label, bubble, clearTextureCache, loadLabelFont } from './textures';
import { loadAssets, tex, peekTex, hasAssets, spriteName } from './assets';
import { attachCamera, type CameraBounds } from './camera';
import { ISO_W, ISO_H, cellToScreen, cellCenter, footAnchor, depth } from './iso';

export interface GameViewOptions {
  onTap: (cellX: number, cellY: number) => void;
}

/** HUD 두 줄(~87px) + 할망 안내(두 줄이면 ~136px) 아래에 맵 위 꼭짓점이 오도록 하는 기본 세로 오프셋 */
const WORLD_OFFSET_Y = 140;

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
/** 좌석 슬롯별 오프셋(테이블 중심 기준, 화면 px) */
const SEAT_SLOT_OFFSET: ReadonlyArray<readonly [number, number]> = [[-14, -2], [14, 4], [0, -10], [0, 8]];
/** 밤 오버레이 색·최대 알파 */
const NIGHT_COLOR = 0x0b1a3a;
const NIGHT_MAX_ALPHA = 0.55;
/** 밤에 빛나는 오브젝트 */
const GLOW_TYPES = new Set(['lantern_path', 'stone_lantern', 'warehouse', 'busstop']);
/** 맵 경계 위쪽 여유(키 큰 오브젝트가 보이도록) */
const BOUNDS_TOP_PAD = 96;

interface ObjEntry {
  node: Container;
  type: string;
  /** 시트 스프라이트. 플레이스홀더 노드면 null */
  sprite: Sprite | null;
  ring: Sprite | null;
  glow: Sprite | null;
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

/** 아이소 스프라이트(변형 → 기본) → 탑다운 스프라이트(변형 → 기본) 순으로 찾는다. 다 없으면 null. */
function objectTex(o: PlacedObject): { texture: Texture; iso: boolean } | null {
  if (!hasAssets()) return null;
  const variant = objectVariant(o);
  const iso = peekTex(spriteName.isoObject(o.type, variant)) ?? (variant ? peekTex(spriteName.isoObject(o.type)) : null);
  if (iso) return { texture: iso, iso: true };
  const flat = tex(spriteName.object(o.type, variant)) ?? (variant ? tex(spriteName.object(o.type)) : null);
  return flat ? { texture: flat, iso: false } : null;
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

/** 시각(6~24, 없으면 정오)에 따른 밤 오버레이 알파: 17시까지 0, 22시에 최대, 24시까지 유지, 새벽 6시에 0. */
export function nightAlpha(hour: number): number {
  if (hour >= 22) return NIGHT_MAX_ALPHA;
  if (hour > 17) return NIGHT_MAX_ALPHA * ((hour - 17) / 5);
  if (hour < 6) return NIGHT_MAX_ALPHA * (1 - hour / 6);
  return 0;
}

/** Pixi 씬을 소유하고, render(state)로 상태를 화면에 반영한다. 상태를 바꾸지 않는다. */
export class GameView {
  app = new Application();
  world = new Container();
  private tiles = new Container();
  /** 오브젝트·손님을 한 컨테이너에 두고 아이소 깊이(x+y)로 정렬한다 */
  private actors = new Container();
  private overlay = new Container();
  /** 카메라 영향을 받지 않는 화면 고정 레이어(밤 오버레이) */
  private ui = new Container();
  private night = new Graphics();
  /** 밤 오버레이 위에 그리는 additive 글로우. 매 프레임 world와 같은 변환을 따른다. */
  private lights = new Container();
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
  private bounds: CameraBounds | null = null;
  private nightAlpha = 0;
  /** 렌더 전용 애니 큐: 말풍선 팝, 코인 팝 */
  private bubblePops: { node: Container; born: number }[] = [];
  private fxQueue: Fx[] = [];

  async init(parent: HTMLElement, opts: GameViewOptions) {
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    await Promise.all([loadAssets(), loadLabelFont()]);
    parent.appendChild(this.app.canvas);
    this.actors.sortableChildren = true;
    this.world.addChild(this.tiles, this.actors, this.overlay);
    this.overlay.addChild(this.selection);
    this.night.eventMode = 'none';
    this.ui.eventMode = 'none';
    this.ui.addChild(this.night, this.lights);
    this.app.stage.addChild(this.world, this.ui);
    this.detachCamera = attachCamera(this.app.stage, {
      world: this.world,
      canvas: this.app.canvas,
      ticker: this.app.ticker,
      viewport: () => ({ width: this.app.screen.width, height: this.app.screen.height }),
      bounds: () => this.bounds,
      onTap: opts.onTap,
    });
    this.hostWidth = parent.clientWidth;
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
    for (const { node, glow } of this.objNodes.values()) { node.destroy({ children: true }); glow?.destroy(); }
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
    const { sx, sy } = cellToScreen(cell.x, cell.y);
    this.selection
      .poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2])
      .stroke({ color: 0xffff00, width: 2 });
  }

  render(state: GameState) {
    const season = seasonOf(state.clock.month);
    if (!this.tilesBuilt) {
      this.buildTiles(state, season);
      this.fitCamera(state);
    } else if (season !== this.lastSeason) {
      this.retintTiles(state, season);
    }
    const now = performance.now();
    // 시계에 hour가 있는 브랜치(2B-1)와 없는 브랜치 모두에서 동작하도록 정오를 기본값으로
    this.nightAlpha = nightAlpha((state.clock as { hour?: number }).hour ?? 12);
    this.syncObjects(state, now);
    this.syncGuests(state, now);
    this.tickFx(now);
    this.drawNight();
  }

  /** 첫 렌더: 폰에서 ×2 근처 줌, 맵을 가로 가운데·HUD 아래에 놓는다. */
  private fitCamera(state: GameState) {
    const width = this.app.screen.width || this.hostWidth;
    const s = Math.min(3, Math.max(1.5, width / 480));
    this.world.scale.set(s);
    const centerX = ((state.grid.w - state.grid.h) * ISO_W) / 4; // 맵 바운딩 박스 가로 중심(월드)
    this.world.position.set(width / 2 - centerX * s, WORLD_OFFSET_Y);
  }

  private tileTexture(state: GameState, i: number, season: Season): Texture {
    const cell = state.grid.cells[i]!;
    return (hasAssets() ? tex(spriteName.isoTile(cell.terrain, season)) : null) ?? isoTerrainTexture(this.app.renderer, cell.terrain);
  }

  private buildTiles(state: GameState, season: Season) {
    this.tiles.removeChildren().forEach((c) => c.destroy());
    this.tileSprites = [];
    for (let y = 0; y < state.grid.h; y++) {
      for (let x = 0; x < state.grid.w; x++) {
        const sp = new Sprite(this.tileTexture(state, y * state.grid.w + x, season));
        sp.anchor.set(0.5, 0); // 위 꼭짓점 기준
        const { sx, sy } = cellToScreen(x, y);
        sp.position.set(sx, sy);
        this.tiles.addChild(sp);
        this.tileSprites.push(sp);
      }
    }
    const { w, h } = state.grid;
    this.bounds = { x: -h * (ISO_W / 2), y: -BOUNDS_TOP_PAD, w: (w + h) * (ISO_W / 2), h: (w + h) * (ISO_H / 2) + BOUNDS_TOP_PAD };
    this.tilesBuilt = true;
    this.lastSeason = season;
  }

  /** 계절이 바뀌면 타일 텍스처만 교체한다 */
  private retintTiles(state: GameState, season: Season) {
    for (let i = 0; i < this.tileSprites.length; i++) this.tileSprites[i]!.texture = this.tileTexture(state, i, season);
    this.lastSeason = season;
  }

  /** 오브젝트 노드. 원점은 발자국 앞(아래) 꼭짓점이고, 스프라이트 하단 중앙을 여기에 맞춘다. */
  private makeObjectNode(o: PlacedObject): ObjEntry {
    const def = objectDef(o.type);
    const c = new Container();
    const { sx, sy } = footAnchor(o.x, o.y, def.w, def.h);
    c.position.set(sx, sy);
    c.zIndex = depth(o.x, o.y, def.w, def.h);
    let glow: Sprite | null = null;
    if (GLOW_TYPES.has(o.type)) {
      glow = new Sprite(glowTexture(this.app.renderer));
      glow.anchor.set(0.5, 0.5);
      glow.blendMode = 'add';
      const gc = this.footCenter(o, def.w, def.h);
      glow.position.set(gc.sx, gc.sy - 10);
      glow.scale.set(def.w === 1 && def.h === 1 ? 1 : 1.8);
      glow.alpha = 0;
      this.lights.addChild(glow);
    }
    const t = objectTex(o);
    if (t) {
      const sp = new Sprite(t.texture);
      // 탑다운 스프라이트 폴백은 발자국 중심 쪽으로 올려 대충 맞춘다
      sp.anchor.set(0.5, 1);
      if (!t.iso) sp.position.y = -def.h * (ISO_H / 2);
      c.addChild(sp);
      return { node: c, type: o.type, sprite: sp, ring: null, glow };
    }
    const sp = new Sprite(isoObjectTexture(this.app.renderer, def.kind, def.w, def.h));
    sp.anchor.set(0.5, 1);
    c.addChild(sp);
    if (!hasAssets()) {
      const l = label(def.name);
      l.anchor.set(0.5, 1);
      l.position.set(0, -sp.height + 2);
      c.addChild(l);
    }
    const badge = new Graphics();
    badge.label = 'badge';
    c.addChild(badge);
    return { node: c, type: o.type, sprite: null, ring: null, glow };
  }

  /** w×h 발자국 다이아몬드의 중심(월드 좌표). 노드 원점(앞 꼭짓점)과는 다르다. */
  private footCenter(o: PlacedObject, w: number, h: number): { sx: number; sy: number } {
    return cellCenter(o.x + (w - 1) / 2, o.y + (h - 1) / 2);
  }

  private syncObjects(state: GameState, now: number) {
    for (const [id, entry] of this.objNodes) {
      const o = state.objects[id];
      // 없어졌거나, 불러오기·리셋 뒤 id가 재사용돼 타입이 달라진 노드는 버린다
      if (!o || o.type !== entry.type) {
        entry.node.destroy({ children: true });
        entry.glow?.destroy();
        this.objNodes.delete(id);
        this.badgeKeys.delete(id);
      }
    }
    const blinkOn = Math.floor(now / 300) % 2 === 0;
    const ringAlpha = 0.5 + 0.5 * Math.sin(now / 200);
    const glowAlpha = Math.min(1, this.nightAlpha * 1.2);
    for (const o of Object.values(state.objects)) {
      let entry = this.objNodes.get(o.id);
      if (!entry) {
        entry = this.makeObjectNode(o);
        this.actors.addChild(entry.node);
        this.objNodes.set(o.id, entry);
      }
      if (entry.ring) entry.ring.alpha = ringAlpha;
      if (entry.glow) { entry.glow.alpha = glowAlpha; entry.glow.visible = glowAlpha > 0; }
      if (entry.sprite) {
        // 시트 모드: 변형·수확 가능 여부가 바뀔 때만 텍스처와 링을 갱신
        const ready = o.crop?.ready === true;
        const key = `${objectVariant(o) ?? ''}:${ready}`;
        if (this.badgeKeys.get(o.id) === key) continue;
        this.badgeKeys.set(o.id, key);
        const t = objectTex(o);
        if (t) entry.sprite.texture = t.texture;
        const ringTex = ready ? tex('fx_ready_ring') : null;
        if (ringTex && !entry.ring) {
          const def = objectDef(o.type);
          const ring = new Sprite(ringTex);
          // 32×32 링을 발자국 다이아몬드 중심에 2:1로 눕힌다
          ring.anchor.set(0.5, 0.5);
          ring.scale.set(2 * def.w, 1 * def.h);
          const gc = this.footCenter(o, def.w, def.h);
          ring.position.set(gc.sx - entry.node.x, gc.sy - entry.node.y);
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
        const def = objectDef(o.type);
        const gc = this.footCenter(o, def.w, def.h);
        const cx = gc.sx - entry.node.x, cy = gc.sy - entry.node.y;
        if (o.crop.ready) {
          if (blinkOn) badge.poly([cx, cy - ISO_H / 2, cx + ISO_W / 2, cy, cx, cy + ISO_H / 2, cx - ISO_W / 2, cy]).stroke({ color: 0xffe066, width: 2 });
        } else {
          badge.circle(cx + 12, cy, 3).fill(0x66ff66);
        }
      }
    }
  }

  /** 손님 노드. 원점은 발끝(셀 다이아몬드 중심). */
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
    /** 좌석 id → 이 프레임에서 앉은 손님 수(슬롯 번호 배정용) */
    const seatSlots = new Map<string, number>();
    for (const g of state.guests) {
      let entry = this.guestNodes.get(g.id);
      if (!entry) { entry = this.makeGuestNode(g); this.actors.addChild(entry.node); this.guestNodes.set(g.id, entry); }
      const { node } = entry;
      const seat = g.phase === 'seated' && g.seatId ? state.objects[g.seatId] : undefined;
      if (seat) {
        // 앉은 손님은 (sim이 이웃 칸에 두더라도) 좌석 칸 위에, 슬롯별로 조금 흩어서 그린다
        const slot = seatSlots.get(seat.id) ?? 0;
        seatSlots.set(seat.id, slot + 1);
        const def = objectDef(seat.type);
        const gc = this.footCenter(seat, def.w, def.h);
        const [ox, oy] = SEAT_SLOT_OFFSET[slot % SEAT_SLOT_OFFSET.length]!;
        node.position.set(gc.sx + ox, gc.sy + oy);
        node.zIndex = depth(seat.x, seat.y, def.w, def.h) + 0.1;
      } else {
        // 같은 날 스폰된 손님이 겹쳐 걷지 않도록 id 기반 작은 오프셋
        const jitter = (parseInt(g.id.slice(1), 10) % 3) * 4 - 4;
        const { sx, sy } = cellCenter(g.x, g.y);
        node.position.set(sx + jitter, sy);
        // 같은 칸의 바닥 오브젝트(올렛길·정류장)보다 앞에 그린다
        node.zIndex = g.x + g.y + 0.5;
      }
      if (entry.sprite) {
        const walking = g.phase !== 'seated' && g.path.length > 0;
        const t = tex(spriteName.guest(g.type, guestDir(g), walking ? walkFrame : 1));
        if (t && entry.sprite.texture !== t) entry.sprite.texture = t;
      }
      // 첫 주문(판매) 순간에 코인 팝
      if (!entry.hadMenu && g.menuId !== null) {
        entry.hadMenu = true;
        this.spawnCoin(node.x, node.y - GUEST_H - 4, now);
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

  /** 밤 오버레이(화면 전체)와 글로우 레이어 변환 갱신 */
  private drawNight() {
    const { width, height } = this.app.screen;
    this.night.clear();
    if (this.nightAlpha > 0) this.night.rect(0, 0, width, height).fill({ color: NIGHT_COLOR, alpha: this.nightAlpha });
    this.lights.visible = this.nightAlpha > 0;
    this.lights.position.copyFrom(this.world.position);
    this.lights.scale.copyFrom(this.world.scale);
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
