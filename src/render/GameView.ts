import { Application, Container, Sprite, Graphics, Texture } from 'pixi.js';
import type { GameState, PlacedObject, Guest, Staff, Season, RoleId, Pt } from '../sim/index.ts';
import { seasonOf, LOW_ENERGY, parcelPrice, footprint, roomAt } from '../sim/index.ts';
import type { Parcel } from '../sim/index.ts';
import { objectDef, cropDef } from '../data/index.ts';
import { isoTerrainTexture, isoObjectTexture, glowTexture, label, bubble, clearTextureCache, loadLabelFont } from './textures';
import { loadAssets, tex, peekTex, hasAssets, spriteName } from './assets';
import { attachCamera, type CameraBounds, type CameraOptions } from './camera';
import { ISO_W, ISO_H, cellToScreen, cellCenter, footAnchor, depth } from './iso';
import { makeCharacterNode, updateCharacterNode, staffParts, guestParts, sameAccs, CHAR_H, type CharacterNode, type Dir, type Frame } from './character';
import { guestFace } from '../sim/segments.ts';
import { guestTypeDef } from '../data/index.ts';

/** 전용 스프라이트가 있는 손님 타입 (guest_local·guest_tourist 시트) */
const GUEST_SPRITE_KEY: Record<string, string> = { local_auntie: 'local', student: 'tourist' };

export type GameViewOptions = Pick<CameraOptions, 'onTap' | 'dragCapture' | 'onDragCell' | 'onDragEnd'>;

/** 배치 모드 고스트: 손가락 아래 반투명 오브젝트. ok면 초록, 아니면 빨강. text는 비용 라벨. */
export interface GhostSpec { type: string; x: number; y: number; rot?: number; ok: boolean; text: string }

/** 아직 시트에 없는 오브젝트가 빌려 쓰는 스프라이트 */
const SPRITE_ALIAS: Record<string, string> = { bush_wild: 'tea_bush', spring: 'pond', dolhareubang_pair: 'dolhareubang' };
const GHOST_OK = 0x88ff88;
const GHOST_BAD = 0xff7777;
const GHOST_ALPHA = 0.65;
/** 미소유 필지 덮개 색(시트가 없을 때) */
const LOCKED_COLOR = 0x000000;
const LOCKED_ALPHA = 0.45;

/** HUD 두 줄(~87px) + 할망 안내(두 줄이면 ~136px) 아래에 맵 위 꼭짓점이 오도록 하는 기본 세로 오프셋 */
const WORLD_OFFSET_Y = 140;

/** 걷기 애니 8fps (125ms/프레임) */
const WALK_FRAME_MS = 125;
/** 말풍선 팝 시간 */
const BUBBLE_POP_MS = 200;
/** 코인 팝: 4프레임 × 80ms, 12px 떠오름 */
const COIN_FRAME_MS = 80;
const COIN_FRAMES = 4;
const COIN_RISE_PX = 12;
/** 자동 수확 반짝임: 4프레임 × 120ms */
const SPARKLE_FRAME_MS = 120;
const SPARKLE_FRAMES = 4;
/** 큰 바위(rock_big) 타일은 바위 타일을 어둡게 */
const BIG_ROCK_TINT = 0x8a8a9a;
/** 캐릭터 스프라이트 높이(발끝 기준 머리 위까지) */
const GUEST_H = CHAR_H;
/** 앉은 손님을 좌석 칸 중심보다 살짝 위로(의자에 앉은 느낌, 화면 px) */
const SEAT_LIFT_PX = 4;
/** 직원 역할 배지(머리 위 16px 아이콘) */
const ROLE_ICON: Record<RoleId, string> = { hall: 'look', barista: 'menu', cook: 'harvest', field: 'plant', carry: 'money', guide: 'research' };
/** 배지 아래 끝 y(발끝 기준). 캐릭터 프레임 48px 중 위 13px은 비어 있고(머리 y=16, 모자 챙 y=13) 그 위 3px 띄운다 */
const ROLE_ICON_Y = -(CHAR_H - 10);
/** 기력이 낮은 직원은 흐리게 */
const TIRED_ALPHA = 0.6;
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
  glow: Sprite | null;
  /** 마지막으로 그린 자리 "x,y" (이동 감지) */
  posKey: string;
}

interface GuestEntry {
  node: Container;
  sprite: Sprite | null;
  /** 전용 시트가 없는 타입은 파츠 캐릭터로 */
  char: CharacterNode | null;
  /** 이미 주문한 손님(불러오기 포함)은 코인 팝을 띄우지 않는다 */
  hadMenu: boolean;
}

interface StaffEntry {
  node: Container;
  body: CharacterNode;
  /** 마지막으로 그린 역할 배지 키 */
  roleKey: string;
}

interface Fx {
  sprite: Sprite;
  born: number;
  y0: number;
  kind: 'coin' | 'sparkle';
}

/** 오브젝트 상태별 스프라이트 변형 이름 */
function objectVariant(o: Pick<PlacedObject, 'type' | 'crop'>): string | undefined {
  if (o.type === 'field') return o.crop ? (o.crop.ready ? 'ready' : 'planted') : 'empty';
  if (o.type === 'tangerine_tree') {
    if (!o.crop) return undefined;
    if (o.crop.ready) return 'ready';
    return o.crop.daysGrown < cropDef('tangerine').growDays / 3 ? 'young' : undefined;
  }
  if (o.type === 'gate') return '0'; // 2B에서 영업 토글 연동
  return undefined;
}

/** 아이소 스프라이트(회전 _r{n} → 변형 → 기본) → 탑다운 스프라이트(변형 → 기본) 순으로 찾는다. 다 없으면 null. */
function objectTex(o: Pick<PlacedObject, 'type' | 'crop' | 'rot'>): { texture: Texture; iso: boolean } | null {
  if (!hasAssets()) return null;
  const name = SPRITE_ALIAS[o.type] ?? o.type;
  const variant = objectVariant(o);
  const rotated = o.rot !== undefined ? peekTex(spriteName.isoObject(name, `r${o.rot}`)) : null;
  const iso = rotated ?? peekTex(spriteName.isoObject(name, variant)) ?? (variant ? peekTex(spriteName.isoObject(name)) : null);
  if (iso) return { texture: iso, iso: true };
  const flat = tex(spriteName.object(name, variant)) ?? (variant ? tex(spriteName.object(name)) : null);
  return flat ? { texture: flat, iso: false } : null;
}

/** 현재 위치에서 다음 경로 칸으로 향하는 방향. 경로가 없으면 정면. */
function walkDir(x: number, y: number, next: Pt | undefined): Dir {
  if (!next) return 'down';
  const dx = next.x - x;
  const dy = next.y - y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy < 0) return 'up';
  return 'down';
}

function guestDir(g: Guest): Dir {
  return g.phase === 'seated' ? 'down' : walkDir(g.x, g.y, g.path[0]);
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
  private staffNodes = new Map<string, StaffEntry>();
  /** 오브젝트 id → 마지막으로 그린 배지 키. 키가 같으면 다시 그리지 않는다. */
  private badgeKeys = new Map<string, string>();
  /** 손님 id → 마지막으로 만든 말풍선 키. 키가 같으면 다시 만들지 않는다. */
  private bubbleKeys = new Map<string, string>();
  private tileSprites: Sprite[] = [];
  private tilesBuilt = false;
  /** 미소유 필지 덮개 + 가격 라벨. 키는 필지 id, 라벨 문구가 바뀌면(신구간 할인) 다시 만든다. */
  private lockedNodes = new Map<string, { node: Container; text: string }>();
  private ghost: Container | null = null;
  private ghostKey = '';
  private lastSeason: Season | null = null;
  private detachCamera: (() => void) | null = null;
  private selection = new Graphics();
  private hostWidth = 0;
  private bounds: CameraBounds | null = null;
  private nightAlpha = 0;
  /** 렌더 전용 애니 큐: 말풍선 팝, 코인 팝, 반짝임 */
  private bubblePops: { node: Container; born: number }[] = [];
  private fxQueue: Fx[] = [];
  /** 마지막 렌더 때의 state.tick. 그 뒤 스텝에서 생긴 fx(tick ≥ 이 값)만 연출한다. −1 = 아직 첫 렌더 전 */
  private fxSeenTick = -1;

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
      ...opts,
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
    for (const { node } of this.staffNodes.values()) node.destroy({ children: true });
    for (const fx of this.fxQueue) fx.sprite.destroy();
    this.objNodes.clear();
    this.guestNodes.clear();
    this.staffNodes.clear();
    this.badgeKeys.clear();
    this.bubbleKeys.clear();
    this.bubblePops = [];
    this.fxQueue = [];
    this.fxSeenTick = -1;
    this.tiles.removeChildren().forEach((c) => c.destroy());
    this.tileSprites = [];
    this.terrainKeys = [];
    this.lockedNodes.clear();
    this.tilesBuilt = false;
    this.lastSeason = null;
    this.selection.clear();
    this.setGhost(null);
  }

  /** 배치 고스트를 놓거나(null이면) 치운다. 같은 내용이면 다시 만들지 않는다. */
  setGhost(g: GhostSpec | null) {
    const key = g ? `${g.type}:${g.x},${g.y}:${g.rot ?? ''}:${g.ok}:${g.text}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost?.destroy({ children: true });
    this.ghost = null;
    if (!g) return;
    const def = objectDef(g.type);
    const c = new Container();
    const { sx, sy } = footAnchor(g.x, g.y, def.w, def.h);
    c.position.set(sx, sy);
    c.alpha = GHOST_ALPHA;
    // 발자국 다이아몬드(초록/빨강)
    const fp = new Graphics();
    for (const p of footprint(g.type, g.x, g.y)) {
      const t = cellToScreen(p.x, p.y);
      fp.poly([t.sx - sx, t.sy - sy, t.sx - sx + ISO_W / 2, t.sy - sy + ISO_H / 2, t.sx - sx, t.sy - sy + ISO_H, t.sx - sx - ISO_W / 2, t.sy - sy + ISO_H / 2])
        .fill({ color: g.ok ? GHOST_OK : GHOST_BAD, alpha: 0.5 });
    }
    c.addChild(fp);
    const t = objectTex({ type: g.type, crop: null, rot: g.rot });
    const sp = new Sprite(t?.texture ?? isoObjectTexture(this.app.renderer, def.kind, def.w, def.h));
    sp.anchor.set(0.5, 1);
    if (t && !t.iso) sp.position.y = -def.h * (ISO_H / 2);
    sp.tint = g.ok ? GHOST_OK : GHOST_BAD;
    c.addChild(sp);
    const l = label(g.text, 10);
    l.anchor.set(0.5, 1);
    l.position.set(0, -sp.height - 4);
    const bg = new Graphics().roundRect(l.x - l.width / 2 - 3, l.y - l.height - 1, l.width + 6, l.height + 2, 3).fill({ color: 0x000000, alpha: 0.6 });
    c.addChild(bg, l);
    c.zIndex = 1e6;
    this.overlay.addChild(c);
    this.ghost = c;
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
    this.syncTerrain(state, season);
    this.syncLocked(state);
    const now = performance.now();
    // 시계에 hour가 있는 브랜치(2B-1)와 없는 브랜치 모두에서 동작하도록 정오를 기본값으로
    this.nightAlpha = nightAlpha((state.clock as { hour?: number }).hour ?? 12);
    this.syncObjects(state, now);
    this.syncGuests(state, now);
    this.syncStaff(state, now);
    this.syncFx(state, now);
    this.tickFx(now);
    this.drawNight();
  }

  /** 첫 렌더: 폰에서 ×2 근처 줌, 시작 필지(1번, 정중앙)를 가로 가운데·HUD 아래에 놓는다. */
  private fitCamera(state: GameState) {
    const width = this.app.screen.width || this.hostWidth;
    const s = Math.min(3, Math.max(1.5, width / 480));
    this.world.scale.set(s);
    const home = state.parcels.find((p) => p.no === 1) ?? { x: 0, y: 0, w: state.grid.w, h: state.grid.h };
    const centerX = ((home.x + home.w / 2) - (home.y + home.h / 2)) * (ISO_W / 2); // 필지 바운딩 박스 가로 중심(월드)
    const top = cellToScreen(home.x, home.y).sy;
    this.world.position.set(width / 2 - centerX * s, WORLD_OFFSET_Y - top * s);
  }

  /** 미소유 필지: 어두운 덮개 타일 + 가운데 가격 라벨. 사면 걷힌다. */
  private syncLocked(state: GameState) {
    const alive = new Set<string>();
    for (const p of state.parcels) {
      if (p.owned) continue;
      alive.add(p.id);
      const text = `₩${parcelPrice(state, p).toLocaleString()} · 탭해서 구매`;
      const cur = this.lockedNodes.get(p.id);
      if (cur?.text === text) continue;
      cur?.node.destroy({ children: true });
      this.lockedNodes.set(p.id, { node: this.makeLockedNode(p, text), text });
    }
    for (const [id, entry] of this.lockedNodes) {
      if (alive.has(id)) continue;
      entry.node.destroy({ children: true });
      this.lockedNodes.delete(id);
    }
  }

  private makeLockedNode(p: Parcel, text: string): Container {
    const c = new Container();
    const lockedTex = hasAssets() ? peekTex('iso_tile_locked') : null;
    const g = lockedTex ? null : new Graphics();
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        const { sx, sy } = cellToScreen(x, y);
        if (lockedTex) {
          const sp = new Sprite(lockedTex);
          sp.anchor.set(0.5, 0);
          sp.position.set(sx, sy);
          c.addChild(sp);
        } else {
          g!.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color: LOCKED_COLOR, alpha: LOCKED_ALPHA });
        }
      }
    }
    if (g) c.addChild(g);
    const center = cellCenter(p.x + (p.w - 1) / 2, p.y + (p.h - 1) / 2);
    const name = label(p.name, 11);
    const price = label(text, 10);
    name.anchor.set(0.5, 1);
    price.anchor.set(0.5, 0);
    name.position.set(center.sx, center.sy - 1);
    price.position.set(center.sx, center.sy + 1);
    const w = Math.max(name.width, price.width) + 12;
    const bg = new Graphics().roundRect(center.sx - w / 2, center.sy - name.height - 4, w, name.height + price.height + 8, 4).fill({ color: 0x000000, alpha: 0.6 });
    c.addChild(bg, name, price);
    // 타일 컨테이너 위·오브젝트 아래: tiles 컨테이너 안에서 일반 타일 뒤에 추가된다
    this.tiles.addChild(c);
    return c;
  }

  private tileTexture(state: GameState, i: number, season: Season): Texture {
    const cell = state.grid.cells[i]!;
    // 큰 바위는 전용 타일이 없으면 바위 타일을 빌려 어둡게(tint) 그린다
    const name = cell.terrain === 'rock_big' && hasAssets() && !peekTex(spriteName.isoTile('rock_big', season)) ? 'rock' : cell.terrain;
    return (hasAssets() ? tex(spriteName.isoTile(name, season)) : null) ?? isoTerrainTexture(this.app.renderer, cell.terrain);
  }

  /** 지형이 바뀌면(바위 치우기) 타일 텍스처를 갱신한다 */
  private syncTile(state: GameState, i: number, season: Season) {
    const sp = this.tileSprites[i];
    if (!sp) return;
    sp.texture = this.tileTexture(state, i, season);
    sp.tint = state.grid.cells[i]!.terrain === 'rock_big' ? BIG_ROCK_TINT : 0xffffff;
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
        if (state.grid.cells[y * state.grid.w + x]!.terrain === 'rock_big') sp.tint = BIG_ROCK_TINT;
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
    for (let i = 0; i < this.tileSprites.length; i++) this.syncTile(state, i, season);
    this.lastSeason = season;
  }

  /** 바위 치우기로 지형이 바뀐 칸만 갱신 (마지막으로 그린 지형을 기억) */
  private terrainKeys: string[] = [];
  private syncTerrain(state: GameState, season: Season) {
    const cells = state.grid.cells;
    if (this.terrainKeys.length !== cells.length) this.terrainKeys = cells.map((c) => c.terrain);
    for (let i = 0; i < cells.length; i++) {
      if (this.terrainKeys[i] === cells[i]!.terrain) continue;
      this.terrainKeys[i] = cells[i]!.terrain;
      this.syncTile(state, i, season);
    }
  }

  /** 오브젝트 노드. 원점은 발자국 앞(아래) 꼭짓점이고, 스프라이트 하단 중앙을 여기에 맞춘다. */
  /** 정렬 깊이. 방 안(실내 가구·손님)은 방보다 앞에 그려 지붕 없는 상자 안이 보이게 한다. */
  private depthOf(state: GameState, x: number, y: number, w = 1, h = 1): number {
    const room = roomAt(state, Math.round(x), Math.round(y));
    if (room) { const rd = objectDef(room.type); return depth(room.x, room.y, rd.w, rd.h) + 0.2 + (x + y) * 1e-3; }
    return depth(x, y, w, h);
  }

  private makeObjectNode(state: GameState, o: PlacedObject): ObjEntry {
    const def = objectDef(o.type);
    const c = new Container();
    const { sx, sy } = footAnchor(o.x, o.y, def.w, def.h);
    c.position.set(sx, sy);
    c.zIndex = this.depthOf(state, o.x, o.y, def.w, def.h);
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
      return { node: c, type: o.type, sprite: sp, glow, posKey: `${o.x},${o.y}` };
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
    return { node: c, type: o.type, sprite: null, glow, posKey: `${o.x},${o.y}` };
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
    const glowAlpha = Math.min(1, this.nightAlpha * 1.2);
    for (const o of Object.values(state.objects)) {
      let entry = this.objNodes.get(o.id);
      if (!entry) {
        entry = this.makeObjectNode(state, o);
        this.actors.addChild(entry.node);
        this.objNodes.set(o.id, entry);
      }
      if (entry.glow) { entry.glow.alpha = glowAlpha; entry.glow.visible = glowAlpha > 0; }
      // 자리가 바뀌었으면(이동) 노드 위치·깊이 갱신
      const def = objectDef(o.type);
      const posKey = `${o.x},${o.y}`;
      if (entry.posKey !== posKey) {
        entry.posKey = posKey;
        const { sx, sy } = footAnchor(o.x, o.y, def.w, def.h);
        entry.node.position.set(sx, sy);
        entry.node.zIndex = this.depthOf(state, o.x, o.y, def.w, def.h);
        if (entry.glow) { const gc = this.footCenter(o, def.w, def.h); entry.glow.position.set(gc.sx, gc.sy - 10); }
      }
      if (entry.sprite) {
        // 시트 모드: 변형(심음·어린 나무)이 바뀔 때만 텍스처를 갱신. 수확은 자동이라 링 대신 반짝임(syncFx).
        const key = `${objectVariant(o) ?? ''}:${o.rot ?? ''}`;
        if (this.badgeKeys.get(o.id) === key) continue;
        this.badgeKeys.set(o.id, key);
        const t = objectTex(o);
        if (t) entry.sprite.texture = t.texture;
        continue;
      }
      // 플레이스홀더: 심음=초록 점. 키가 바뀔 때만 다시 그린다.
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

  /** 손님 노드. 원점은 발끝(셀 다이아몬드 중심). 전용 시트가 있는 타입은 그것을, 나머지는 태그로 조합한 파츠 캐릭터. */
  private makeGuestNode(g: Guest): GuestEntry {
    const c = new Container();
    const key = GUEST_SPRITE_KEY[g.type];
    const t = key && hasAssets() ? tex(spriteName.guest(key, 'down', 1)) : null;
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 1);
      c.addChild(sp);
      return { node: c, sprite: sp, char: null, hadMenu: g.menuId !== null };
    }
    const def = guestTypeDef(g.type);
    const ch = makeCharacterNode(guestParts(guestFace(g.type), def.tags, def.wants), guestDir(g), 1);
    c.addChild(ch);
    return { node: c, sprite: null, char: ch, hadMenu: g.menuId !== null };
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
      const seat = g.phase === 'seated' && g.seatId ? state.objects[g.seatId] : undefined;
      if (seat) {
        // sim이 좌석 칸 안의 자리 위치(seatSlotPos)를 x·y에 넣어 두므로 그대로 쓰고, 살짝 올려 의자에 앉은 느낌만 준다
        const def = objectDef(seat.type);
        const { sx, sy } = cellCenter(g.x, g.y);
        node.position.set(sx, sy - SEAT_LIFT_PX);
        node.zIndex = this.depthOf(state, seat.x, seat.y, def.w, def.h) + 0.1;
      } else {
        // 같은 날 스폰된 손님이 겹쳐 걷지 않도록 id 기반 작은 오프셋
        const jitter = (parseInt(g.id.slice(1), 10) % 3) * 4 - 4;
        const { sx, sy } = cellCenter(g.x, g.y);
        node.position.set(sx + jitter, sy);
        // 같은 칸의 바닥 오브젝트(올렛길·정류장)보다 앞에, 방 안이면 방보다 앞에 그린다
        node.zIndex = roomAt(state, Math.round(g.x), Math.round(g.y)) ? this.depthOf(state, g.x, g.y) + 0.5 : g.x + g.y + 0.5;
      }
      const walking = g.phase !== 'seated' && g.path.length > 0;
      if (entry.sprite) {
        const t = tex(spriteName.guest(GUEST_SPRITE_KEY[g.type] ?? g.type, guestDir(g), walking ? walkFrame : 1));
        if (t && entry.sprite.texture !== t) entry.sprite.texture = t;
      } else if (entry.char) {
        updateCharacterNode(entry.char, guestDir(g), walking ? walkFrame : 1);
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

  /** 직원 노드. 원점은 발끝. 파츠 캐릭터 + 머리 위 역할 배지. */
  private makeStaffNode(st: Staff): StaffEntry {
    const node = new Container();
    const body = makeCharacterNode(staffParts(st.face, st.role), walkDir(st.x, st.y, st.path[0]), 1);
    node.addChild(body);
    return { node, body, roleKey: '' };
  }

  private syncStaff(state: GameState, now: number) {
    const alive = new Set(state.staff.map((s) => s.id));
    for (const [id, entry] of this.staffNodes) {
      if (!alive.has(id)) {
        entry.node.destroy({ children: true });
        this.staffNodes.delete(id);
      }
    }
    const walkFrame = (Math.floor(now / WALK_FRAME_MS) % 3) as Frame;
    for (const st of state.staff) {
      let entry = this.staffNodes.get(st.id);
      if (!entry) { entry = this.makeStaffNode(st); this.actors.addChild(entry.node); this.staffNodes.set(st.id, entry); }
      // 역할이 바뀌면 액세서리가 달라지므로 캐릭터를 다시 만든다
      const parts = staffParts(st.face, st.role);
      if (!sameAccs(entry.body, parts.accs)) {
        entry.body.destroy({ children: true });
        entry.body = makeCharacterNode(parts);
        entry.node.addChildAt(entry.body, 0);
      }
      const { node } = entry;
      const { sx, sy } = cellCenter(st.x, st.y);
      node.position.set(sx, sy);
      node.zIndex = roomAt(state, Math.round(st.x), Math.round(st.y)) ? this.depthOf(state, st.x, st.y) + 0.5 : st.x + st.y + 0.5;
      const walking = st.path.length > 0;
      updateCharacterNode(entry.body, walkDir(st.x, st.y, st.path[0]), walking ? walkFrame : 1);
      node.alpha = st.energy < LOW_ENERGY ? TIRED_ALPHA : 1;
      // 역할 배지: 역할이 바뀔 때만 다시 만든다
      const roleKey = st.role ?? '';
      if (entry.roleKey === roleKey) continue;
      entry.roleKey = roleKey;
      node.getChildByLabel('role')?.destroy({ children: true });
      const iconTex = st.role && hasAssets() ? tex(spriteName.icon(ROLE_ICON[st.role])) : null;
      if (iconTex) {
        const icon = new Sprite(iconTex);
        icon.label = 'role';
        icon.anchor.set(0.5, 1);
        icon.position.set(0, ROLE_ICON_Y);
        node.addChild(icon);
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
    this.fxQueue.push({ sprite: sp, born: now, y0, kind: 'coin' });
  }

  /** 자동 수확 반짝임: 칸 중심에 fx_sparkle 4프레임 */
  private spawnSparkle(cellX: number, cellY: number, now: number) {
    const t = tex('fx_sparkle_0');
    if (!t) return;
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 0.5);
    const { sx, sy } = cellCenter(cellX, cellY);
    sp.position.set(sx, sy - 12);
    this.overlay.addChild(sp);
    this.fxQueue.push({ sprite: sp, born: now, y0: sy - 12, kind: 'sparkle' });
  }

  /** sim이 남긴 연출 큐(state.fx)에서 새 항목만 골라 연출을 띄운다. 불러오기 직후엔 밀린 것을 건너뛴다.
   *  스텝 k에서 생긴 fx는 tick=k이고 스텝 뒤 state.tick=k+1이므로, 지난 렌더의 state.tick 이상인 항목이 새것이다. */
  private syncFx(state: GameState, now: number) {
    const fx = state.fx ?? [];
    const since = this.fxSeenTick;
    this.fxSeenTick = state.tick;
    if (since < 0) return;
    for (const e of fx) {
      if (e.tick < since) continue;
      if (e.kind === 'harvest') this.spawnSparkle(e.x, e.y, now);
    }
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
      this.fxQueue = this.fxQueue.filter((fx) => {
        const age = now - fx.born;
        if (fx.kind === 'sparkle') {
          const total = SPARKLE_FRAME_MS * SPARKLE_FRAMES;
          if (age >= total) { fx.sprite.destroy(); return false; }
          const t = tex(`fx_sparkle_${Math.floor(age / SPARKLE_FRAME_MS)}`);
          if (t) fx.sprite.texture = t;
          return true;
        }
        const total = COIN_FRAME_MS * COIN_FRAMES;
        if (age >= total) { fx.sprite.destroy(); return false; }
        const t = tex(`fx_coin_${Math.floor(age / COIN_FRAME_MS)}`);
        if (t) fx.sprite.texture = t;
        fx.sprite.y = fx.y0 - COIN_RISE_PX * (age / total);
        return true;
      });
    }
  }
}
