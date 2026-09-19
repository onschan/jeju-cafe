import { Application, Container, Sprite, Graphics, Texture, Text } from 'pixi.js';
import type { GameState, PlacedObject, Guest, Staff, Season, RoleId, Pt } from '../sim/index.ts';
import { seasonOf, LOW_ENERGY, parcelPrice, footprint, roomAt, doorFrontOf, WALL_COLORS, dayIndex, menuOf, sizeOf, MAIN_SIZE } from '../sim/index.ts';
import type { Parcel } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { isoTerrainTexture, isoObjectTexture, glowTexture, label, clearTextureCache, loadLabelFont } from './textures';
import { makeSpeechBubble } from './bubble';
import { loadAssets, tex, peekTex, hasAssets, spriteName } from './assets';
import { attachCamera, type CameraBounds, type CameraOptions } from './camera';
import { ISO_W, ISO_H, cellToScreen, cellCenter, footAnchor, depth, screenToCell } from './iso';
import { makeCharacterNode, updateCharacterNode, staffParts, guestParts, namedGuestParts, sameAccs, CHAR_H, type CharacterNode, type Dir, type Frame } from './character';
import { guestFace } from '../sim/segments.ts';
import { namedGuestFace } from '../sim/popup.ts';
import { guestTypeDef, namedGuestDef } from '../data/index.ts';
import { Background } from './Background';
import { siteOf, siteBadgeTextPlain, siteTone, layoutKey } from '../sim/site.ts';
import { isSiteOverlayOn, setSiteOverlayOn, siteOverlayKey, drawSiteOverlay, GHOST_GOOD, GHOST_WARN } from './siteOverlay';

/** 전용 스프라이트가 있는 손님 타입 (guest_local·guest_tourist 시트) */
const GUEST_SPRITE_KEY: Record<string, string> = { local_auntie: 'local', student: 'tourist' };

export interface GameViewOptions extends Pick<CameraOptions, 'onTap' | 'dragCapture' | 'onDragCell' | 'onDragEnd' | 'onLongPress'> {
  /** 손님이 나갈 때 20%로 띄우는 대사 (없으면 기분 아이콘만) */
  guestSay?: (state: GameState, g: Guest) => string | null;
}

/** 배치 모드 고스트: 손가락 아래 반투명 오브젝트. ok면 초록, 아니면 빨강. text는 비용 라벨. */
export interface GhostSpec { type: string; x: number; y: number; rot?: number; ok: boolean; text: string; w?: number; h?: number }

/** 말풍선 내용: 글자, 시트 아이콘(icon_*·bubble_* 프레임 이름), 기분 아이콘 중 하나 이상 */
export interface BubbleContent { text?: string; icon?: string; mood?: Guest['mood'] }
/** 기본 말풍선 시간 */
export const BUBBLE_MS = 1500;

/** 아직 시트에 없는 오브젝트가 빌려 쓰는 스프라이트 */
/** 시트 이름이 다른 오브젝트. 감귤나무는 v3에서 성장 단계가 없어 늘 열매 달린 모습으로 */
const SPRITE_ALIAS: Record<string, string> = { bush_wild: 'tea_bush', spring: 'pond', dolhareubang_pair: 'dolhareubang', hackberry: 'hackberry_shade', tangerine_tree: 'tangerine_tree_ready' };
/** 캐릭터(손님·직원)는 모든 시설·건물보다 앞에 그린다 — 건물 뒤·안에 있어도 사람이 보여야 한다(카이로식). 캐릭터끼리는 x+y 순. */
const CHAR_Z = 1e4;

/** 미소유 필지 노드: 덮개 타일(tiles)과 가격 라벨(overlay)을 같이 지운다 */
function destroyLocked(node?: Container) {
  if (!node) return;
  (node as Container & { parcelLabel?: Container }).parcelLabel?.destroy({ children: true });
  node.destroy({ children: true });
}

const GHOST_OK = 0x88ff88;
const GHOST_BAD = 0xff7777;
const GHOST_ALPHA = 0.65;
/** 미소유 필지 덮개 색(시트가 없을 때) */
const LOCKED_COLOR = 0x000000;
const LOCKED_ALPHA = 0.45;

/** 상단 바(28px) + 목표 줄(24px) 아래에 맵 위 꼭짓점이 오도록 하는 기본 세로 오프셋 */
const WORLD_OFFSET_Y = 76;

/** 걷기 애니 8fps (125ms/프레임) */
const WALK_FRAME_MS = 125;
/** 말풍선 팝 시간 */
const BUBBLE_POP_MS = 200;
/** 손님이 나갈 때 기분 아이콘 대신 대사를 띄울 확률 (렌더 측 난수) */
const LEAVE_SAY_CHANCE = 0.2;
/** 직원 "!"(일 시작) 최소 간격 · "zzz"(기력 낮음) 간격 */
const STAFF_BANG_COOLDOWN_MS = 8000;
const STAFF_ZZZ_INTERVAL_MS = 6000;
/** 말풍선 꼬리 끝 위치(발끝 기준): 머리 위 */
const BUBBLE_Y = -(CHAR_H - 2);
/** 코인 팝: 4프레임 × 80ms, 12px 떠오름 */
const COIN_FRAME_MS = 80;
const COIN_FRAMES = 4;
const COIN_RISE_PX = 12;
/** 자동 수확 반짝임: 4프레임 × 120ms */
const SPARKLE_FRAME_MS = 120;
const SPARKLE_FRAMES = 4;
/** 큰 바위(rock_big) 타일은 바위 타일을 어둡게 */
const BIG_ROCK_TINT = 0x8a8a9a;
/** 숫자 팝업(+N): 700ms 동안 16px 떠오르며 사라진다 */
const POP_MS = 700;
const POP_RISE_PX = 16;
/** 직원 인사 말풍선: 손님이 2칸 안에 오면 20%로 1.2초 */
const GREET_RADIUS = 2;
const GREET_CHANCE = 0.2;
const GREET_MS = 1200;
const GREET_TEXT = '어서옵서예!';
/** 앉은 손님 손의 컵(8×8): 몸 오른쪽, 허리 높이 */
const CUP_OFFSET = { x: 7, y: -14 };
/** 부탁을 들고 온 손님 머리 위 "!" — 살짝 위아래로 흔들린다 */
const ALERT_Y = -(CHAR_H - 6);
const ALERT_BOB_PX = 2;
const ALERT_BOB_MS = 600;
/** 캐릭터 스프라이트 높이(발끝 기준 머리 위까지) */
const GUEST_H = CHAR_H;
/** 앉은 손님을 좌석 칸 중심보다 살짝 위로(의자에 앉은 느낌, 화면 px) */
const SEAT_LIFT_PX = 4;
/** 직원 역할 배지(머리 위 16px 아이콘) */
const ROLE_ICON: Record<RoleId, string> = { hall: 'look', barista: 'menu', cook: 'harvest', carry: 'money', guide: 'research', clean: 'remove', garden: 'plant', promo: 'tourist' }; // clean·garden·promo: x-staff
/** 배지 아래 끝 y(발끝 기준). 캐릭터 프레임 48px 중 위 13px은 비어 있고(머리 y=16, 모자 챙 y=13) 그 위 3px 띄운다 */
const ROLE_ICON_Y = -(CHAR_H - 10);
/** 기력이 낮은 직원은 흐리게 */
const TIRED_ALPHA = 0.6;
/** 건설 중인 시설: 반투명 + 망치 라벨 */
const BUILDING_ALPHA = 0.5;
/** 방(본관 등) 문 앞 칸 표식: 손님 출입구라 올렛길을 이어야 한다 */
const DOOR_MARK_COLOR = 0xffd166;
/** 밤 오버레이 색·최대 알파 */
const NIGHT_COLOR = 0x0b1a3a;
const NIGHT_MAX_ALPHA = 0.55;
/** 밤에 빛나는 오브젝트 */
const GLOW_TYPES = new Set(['lantern_path', 'stone_lantern', 'warehouse', 'busstop']);
/** 맵 경계 위쪽 여유(키 큰 오브젝트와 지평선 배경 띠가 보이도록) */
const BOUNDS_TOP_PAD = 180;

interface ObjEntry {
  node: Container;
  type: string;
  /** 시트 스프라이트. 플레이스홀더 노드면 null */
  sprite: Sprite | null;
  glow: Sprite | null;
  /** 마지막으로 그린 자리 "x,y" (이동 감지) */
  posKey: string;
  /** 마지막으로 그린 건설 상태 ("" = 완공) */
  buildKey?: string;
  /** 건설 배지 (오버레이 레이어) */
  badge?: Container | null;
}

interface GuestEntry {
  node: Container;
  sprite: Sprite | null;
  /** 전용 시트가 없는 타입은 파츠 캐릭터로 */
  char: CharacterNode | null;
  /** 이미 주문한 손님(불러오기 포함)은 코인 팝을 띄우지 않는다 */
  hadMenu: boolean;
  /** 마지막으로 그린 손 컵·"!" 상태 키 */
  accKey: string;
  alert: Sprite | null;
  /** 지난 프레임의 phase (나갈 때 기분 말풍선 감지) */
  phase: Guest['phase'];
}

interface StaffEntry {
  node: Container;
  body: CharacterNode;
  /** 마지막으로 그린 역할 배지 키 */
  roleKey: string;
  /** 지난 프레임에 걷고 있었나 ("!" 감지) */
  walking: boolean;
  lastBang: number;
  lastZzz: number;
}

interface SpeechEntry {
  node: Container;
  until: number;
  /** 따라다닐 캐릭터 노드 */
  target: Container;
}

interface Fx {
  sprite: Sprite;
  born: number;
  y0: number;
  kind: 'coin' | 'sparkle';
}

/** 오브젝트 상태별 스프라이트 변형 이름. 본관은 증축 Lv(state.main.level)에 따라 lv2·lv3·lv4 (y-indoor §8.1 — SPRITE_ALIAS가 아니라 level로 고른다). */
function objectVariant(o: Pick<PlacedObject, 'type'>, mainLevel = 1): string | undefined {
  if (o.type === 'warehouse') return mainLevel >= 2 ? `lv${Math.min(4, mainLevel)}` : undefined;
  if (o.type === 'gate') return '0'; // 2B에서 영업 토글 연동
  return undefined;
}

/** 아이소 스프라이트(회전 _r{n} → 변형 → 기본) → 탑다운 스프라이트(변형 → 기본) 순으로 찾는다. 다 없으면 null. */
function objectTex(o: Pick<PlacedObject, 'type' | 'rot'>, mainLevel = 1): { texture: Texture; iso: boolean } | null {
  if (!hasAssets()) return null;
  const name = SPRITE_ALIAS[o.type] ?? o.type;
  const variant = objectVariant(o, mainLevel);
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
  /** 맵 밖 배경(하늘·지평선 띠·잔디). 타일 아래. */
  private background = new Background();
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
  private tileSprites: Sprite[] = [];
  private tilesBuilt = false;
  /** 미소유 필지 덮개 + 가격 라벨. 키는 필지 id, 라벨 문구가 바뀌면(신구간 할인) 다시 만든다. */
  private lockedNodes = new Map<string, { node: Container; text: string }>();
  private ghost: Container | null = null;
  private ghostKey = '';
  /** 마지막 render의 본관 Lv (고스트 크기·텍스처용) */
  private lastMainLevel = 1;
  /** 입지(트랙 F): 고스트 배지·색 갱신용 스펙과 마지막 키 */
  private ghostSpec: GhostSpec | null = null;
  private ghostSiteKey = '';
  /** 「입지 보기」 오버레이 레이어 (타일 위·오브젝트 아래) */
  private siteLayer = new Container();
  private siteGfx = new Graphics();
  private siteKey = '';
  private lastSeason: Season | null = null;
  private detachCamera: (() => void) | null = null;
  private selection = new Graphics();
  private highlight = new Graphics(); // 튜토리얼 칸 글로우 (x-goals)
  private hostWidth = 0;
  private bounds: CameraBounds | null = null;
  private nightAlpha = 0;
  /** 렌더 전용 애니 큐: 말풍선 팝, 코인 팝, 반짝임 */
  private bubblePops: { node: Container; born: number }[] = [];
  private fxQueue: Fx[] = [];
  /** 마지막 렌더 때의 state.tick. 그 뒤 스텝에서 생긴 fx(tick ≥ 이 값)만 연출한다. −1 = 아직 첫 렌더 전 */
  private fxSeenTick = -1;
  /** 숫자 팝업(+N) 큐 */
  private pops: { node: Container; born: number; y0: number }[] = [];
  /** 말풍선: 캐릭터(손님·직원) id → 오버레이 레이어의 말풍선. 캐릭터 노드를 따라다니고 캐릭터보다 위에 그려진다. */
  private speech = new Map<string, SpeechEntry>();
  /** 인사 판정을 끝낸 손님 id (손님당 한 번) */
  private greeted = new Set<string>();
  private guestSay: GameViewOptions['guestSay'];

  async init(parent: HTMLElement, opts: GameViewOptions) {
    this.guestSay = opts.guestSay;
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    await Promise.all([loadAssets(), loadLabelFont()]);
    parent.appendChild(this.app.canvas);
    this.actors.sortableChildren = true;
    this.world.addChild(this.background.node, this.tiles, this.siteLayer, this.actors, this.overlay);
    this.siteLayer.addChild(this.siteGfx);
    this.overlay.addChild(this.selection);
    this.overlay.addChild(this.highlight);
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
    for (const { node, glow, badge } of this.objNodes.values()) { node.destroy({ children: true }); glow?.destroy(); badge?.destroy({ children: true }); }
    for (const { node } of this.guestNodes.values()) node.destroy({ children: true });
    for (const { node } of this.staffNodes.values()) node.destroy({ children: true });
    for (const fx of this.fxQueue) fx.sprite.destroy();
    this.objNodes.clear();
    this.guestNodes.clear();
    this.staffNodes.clear();
    this.badgeKeys.clear();
    this.bubblePops = [];
    this.fxQueue = [];
    this.fxSeenTick = -1;
    for (const p of this.pops) p.node.destroy({ children: true });
    this.pops = [];
    for (const sp of this.speech.values()) sp.node.destroy({ children: true });
    this.speech.clear();
    this.greeted.clear();
    for (const e of this.lockedNodes.values()) destroyLocked(e.node); // overlay에 있는 가격 라벨까지 같이 지운다
    this.lockedNodes.clear();
    this.tiles.removeChildren().forEach((c) => c.destroy());
    this.tileSprites = [];
    this.terrainKeys = [];
    this.tilesBuilt = false;
    this.lastSeason = null;
    this.background.reset();
    this.selection.clear();
    this.siteGfx.clear();
    this.siteKey = '';
    this.setGhost(null);
  }

  /** 배치 고스트를 놓거나(null이면) 치운다. 같은 내용이면 다시 만들지 않는다. */
  setGhost(g: GhostSpec | null) {
    const key = g ? `${g.type}:${g.x},${g.y}:${g.rot ?? ''}:${g.ok}:${g.text}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost?.destroy({ children: true });
    this.ghost = null;
    this.ghostSpec = g;
    this.ghostSiteKey = '';
    if (!g) return;
    const def = objectDef(g.type);
    // 본관 옮기기 고스트는 현재 Lv 크기 (y-indoor §4.1)
    const mainLv = this.lastMainLevel;
    const gw = g.w ?? (g.type === 'warehouse' ? MAIN_SIZE[mainLv]!.w : def.w), gh = g.h ?? (g.type === 'warehouse' ? MAIN_SIZE[mainLv]!.h : def.h);
    const c = new Container();
    const { sx, sy } = footAnchor(g.x, g.y, gw, gh);
    c.position.set(sx, sy);
    c.alpha = GHOST_ALPHA;
    // 발자국 다이아몬드(초록/빨강)
    const fp = new Graphics();
    for (const p of footprint(g.type, g.x, g.y, gw, gh)) {
      const t = cellToScreen(p.x, p.y);
      fp.poly([t.sx - sx, t.sy - sy, t.sx - sx + ISO_W / 2, t.sy - sy + ISO_H / 2, t.sx - sx, t.sy - sy + ISO_H, t.sx - sx - ISO_W / 2, t.sy - sy + ISO_H / 2])
        .fill({ color: g.ok ? GHOST_OK : GHOST_BAD, alpha: 0.5 });
    }
    c.addChild(fp);
    const t = objectTex({ type: g.type, rot: g.rot }, mainLv);
    const sp = new Sprite(t?.texture ?? isoObjectTexture(this.app.renderer, def.kind, gw, gh));
    sp.anchor.set(0.5, 1);
    if (t && !t.iso) sp.position.y = -gh * (ISO_H / 2);
    sp.tint = g.ok ? GHOST_OK : GHOST_BAD;
    sp.label = 'ghostSprite';
    c.addChild(sp);
    const l = label(g.text, 10);
    l.label = 'ghostCost';
    l.anchor.set(0.5, 1);
    l.position.set(0, -sp.height - 4);
    const bg = new Graphics().roundRect(l.x - l.width / 2 - 3, l.y - l.height - 1, l.width + 6, l.height + 2, 3).fill({ color: 0x000000, alpha: 0.6 });
    c.addChild(bg, l);
    c.zIndex = 1e6;
    this.overlay.addChild(c);
    this.ghost = c;
  }

  /** 브라우저 클라이언트 좌표 → 셀 (하단 시트의 카드에서 맵으로 끌어 놓을 때) */
  cellAtClient(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const gx = clientX - rect.left;
    const gy = clientY - rect.top;
    return screenToCell((gx - this.world.x) / this.world.scale.x, (gy - this.world.y) / this.world.scale.y);
  }

  /** 손님·직원 머리 위에 말풍선을 ms 동안 띄운다. 같은 캐릭터의 이전 말풍선은 바꿔 끼운다. 모르는 id면 무시. */
  showBubble(entityId: string, content: BubbleContent, ms = BUBBLE_MS): void {
    const target = this.guestNodes.get(entityId)?.node ?? this.staffNodes.get(entityId)?.node;
    if (!target) return;
    const icon = content.icon ? (hasAssets() ? tex(content.icon) : null)
      : content.mood !== undefined ? (hasAssets() ? tex(spriteName.bubble(content.mood ?? 'wait')) : null)
      : null;
    const MOOD_TEXT: Record<string, string> = { happy: ':)', meh: ':|', angry: '>:(' };
    const text = content.text ?? (!icon && content.mood !== undefined ? (MOOD_TEXT[content.mood ?? ''] ?? '…') : undefined);
    if (!icon && !text) return;
    this.speech.get(entityId)?.node.destroy({ children: true });
    const node = makeSpeechBubble({ text, icon, iconSize: content.icon ? 16 : 20 });
    node.position.set(target.x, target.y + BUBBLE_Y);
    node.zIndex = 1e6;
    node.scale.set(0.6);
    this.overlay.addChild(node);
    this.speech.set(entityId, { node, until: performance.now() + ms, target });
    this.bubblePops.push({ node, born: performance.now() });
  }

  /** 튜토리얼 하이라이트 칸 (노란 반투명 마름모, x-goals tutorialHighlight.ts) */
  setHighlightCells(cells: { x: number; y: number }[]) {
    if (!this.highlight || this.highlight.destroyed) return; // 뷰가 파괴된 뒤(HMR·화면 전환) 늦게 온 호출
    this.highlight.clear();
    for (const cell of cells) {
      const { sx, sy } = cellToScreen(cell.x, cell.y);
      this.highlight
        .poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2])
        .fill({ color: 0xffd54a, alpha: 0.45 })
        .stroke({ color: 0xffb300, width: 3 });
    }
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
    this.lastMainLevel = state.main?.level ?? 1;
    if (!this.tilesBuilt) {
      this.buildTiles(state, season);
      this.fitCamera(state);
    } else if (season !== this.lastSeason) {
      this.retintTiles(state, season);
    }
    this.syncTerrain(state, season);
    this.background.sync(state);
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
    this.syncSiteOverlay(state);
    this.syncGhostSite(state);
  }

  // ---------- 입지 (트랙 F, 스펙 §6.2) ----------

  /** 「입지 보기」 오버레이 켜기/끄기. 모드는 모듈 전역이라 창을 닫아도 유지된다. */
  setSiteOverlay(on: boolean) {
    setSiteOverlayOn(on);
  }
  isSiteOverlay(): boolean {
    return isSiteOverlayOn();
  }

  /** 오버레이가 켜져 있으면 배치·필지가 바뀔 때만 다시 그린다 */
  private syncSiteOverlay(state: GameState) {
    if (!isSiteOverlayOn()) {
      if (this.siteKey) { this.siteGfx.clear(); this.siteKey = ''; }
      return;
    }
    const key = siteOverlayKey(state);
    if (key === this.siteKey) return;
    this.siteKey = key;
    drawSiteOverlay(this.siteGfx, state);
  }

  /** 고스트 위 입지 배지(`👁3 🌬1 ☂0 🚶2 🍳1`)와 고스트 색(좋은 자리 초록·나쁜 자리 주황). 놓을 수 없는 자리(빨강)는 색을 바꾸지 않는다. */
  private syncGhostSite(state: GameState) {
    const g = this.ghostSpec;
    const c = this.ghost;
    if (!g || !c) return;
    const key = `${g.type}:${g.x},${g.y}:${g.ok}:${layoutKey(state)}`;
    if (key === this.ghostSiteKey) return;
    this.ghostSiteKey = key;
    c.getChildByLabel('siteBadge')?.destroy({ children: true });
    if (g.x < 0 || g.y < 0 || g.x >= state.grid.w || g.y >= state.grid.h) return;
    const tone = siteTone(state, g.type, g.x, g.y);
    const color = !g.ok ? GHOST_BAD : tone === 'bad' ? GHOST_WARN : GHOST_GOOD;
    const sp = c.getChildByLabel('ghostSprite') as Sprite | null;
    if (sp) sp.tint = color;
    const cost = c.getChildByLabel('ghostCost') as Text | null;
    const badge = new Container();
    badge.label = 'siteBadge';
    const l = label(siteBadgeTextPlain(siteOf(state, g.x, g.y)), 10);
    l.anchor.set(0.5, 1);
    const top = cost ? cost.y - cost.height - 3 : -(sp?.height ?? 24) - 4;
    l.position.set(0, top);
    const bg = new Graphics().roundRect(-l.width / 2 - 3, top - l.height - 1, l.width + 6, l.height + 2, 3).fill({ color: 0x000000, alpha: 0.6 });
    badge.addChild(bg, l);
    c.addChild(badge);
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
      destroyLocked(cur?.node);
      this.lockedNodes.set(p.id, { node: this.makeLockedNode(p, text), text });
    }
    for (const [id, entry] of this.lockedNodes) {
      if (alive.has(id)) continue;
      destroyLocked(entry.node);
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
    // 어두운 덮개 타일은 tiles 안(오브젝트 아래), 가격 라벨은 overlay(오브젝트·캐릭터 위) — 바위·시설에 가려지지 않게
    this.tiles.addChild(c);
    const lbl = new Container();
    lbl.label = 'parcel-label';
    lbl.addChild(bg, name, price);
    this.overlay.addChild(lbl);
    (c as Container & { parcelLabel?: Container }).parcelLabel = lbl;
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
    if (room) { const rd = sizeOf(room); return depth(room.x, room.y, rd.w, rd.h) + 0.2 + (x + y) * 1e-3; }
    return depth(x, y, w, h);
  }

  /** 문 앞 칸 다이아몬드 + '문' 라벨 (방 노드의 자식 — 노드 원점 기준). 문 앞에 뭔가 놓이면 그 오브젝트가 위에 그려져 가려진다. */
  private doorMarker(o: PlacedObject, origin: { sx: number; sy: number }): Container {
    const c = new Container();
    c.label = 'door';
    const f = doorFrontOf(o);
    const t = cellToScreen(f.x, f.y);
    const x = t.sx - origin.sx, y = t.sy - origin.sy;
    c.addChild(new Graphics()
      .poly([x, y + 2, x + ISO_W / 2 - 3, y + ISO_H / 2, x, y + ISO_H - 2, x - ISO_W / 2 + 3, y + ISO_H / 2])
      .fill({ color: DOOR_MARK_COLOR, alpha: 0.22 })
      .stroke({ color: DOOR_MARK_COLOR, width: 1.5, alpha: 0.9 }));
    const l = label('문', 9);
    l.anchor.set(0.5, 0.5);
    l.position.set(x, y + ISO_H / 2);
    c.addChild(l);
    return c;
  }

  private makeObjectNode(state: GameState, o: PlacedObject): ObjEntry {
    const def = objectDef(o.type);
    const { w, h } = sizeOf(o); // y-indoor: 본관 증축 크기
    const c = new Container();
    const { sx, sy } = footAnchor(o.x, o.y, w, h);
    c.position.set(sx, sy);
    c.zIndex = this.depthOf(state, o.x, o.y, w, h);
    if (def.room) c.addChild(this.doorMarker(o, { sx, sy }));
    let glow: Sprite | null = null;
    if (GLOW_TYPES.has(o.type)) {
      glow = new Sprite(glowTexture(this.app.renderer));
      glow.anchor.set(0.5, 0.5);
      glow.blendMode = 'add';
      const gc = this.footCenter(o, w, h);
      glow.position.set(gc.sx, gc.sy - 10);
      glow.scale.set(w === 1 && h === 1 ? 1 : 1.8);
      glow.alpha = 0;
      this.lights.addChild(glow);
    }
    const t = objectTex(o, state.main?.level ?? 1);
    if (t) {
      const sp = new Sprite(t.texture);
      // 탑다운 스프라이트 폴백은 발자국 중심 쪽으로 올려 대충 맞춘다
      sp.anchor.set(0.5, 1);
      if (!t.iso) sp.position.y = -h * (ISO_H / 2);
      c.addChild(sp);
      return { node: c, type: o.type, sprite: sp, glow, posKey: `${o.x},${o.y}:${w}x${h}` };
    }
    const sp = new Sprite(isoObjectTexture(this.app.renderer, def.kind, w, h));
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
    return { node: c, type: o.type, sprite: null, glow, posKey: `${o.x},${o.y}:${w}x${h}` };
  }

  /** 건설 중: 반투명 + 머리 위 망치 아이콘과 "N일" 배지 (오버레이 레이어 — 본관 같은 큰 이웃 뒤에 숨지 않게). 남은 날이 바뀔 때만 다시 그린다. */
  private syncBuilding(entry: ObjEntry, o: PlacedObject, state: GameState) {
    const left = o.build ? Math.max(0, o.build.doneDay - dayIndex(state.clock)) : 0;
    const key = o.build ? `b${left}:${o.x},${o.y}` : '';
    if (entry.buildKey === key) return;
    entry.buildKey = key;
    entry.badge?.destroy({ children: true });
    entry.badge = null;
    entry.node.alpha = o.build ? BUILDING_ALPHA : 1;
    if (!o.build) return;
    const size = sizeOf(o);
    const gc = this.footCenter(o, size.w, size.h);
    const top = gc.sy - (entry.sprite?.height ?? 40) * 0.6 - 4; // 스프라이트 위쪽 언저리
    const c = new Container();
    const l = label(`${left}일`, 10);
    l.anchor.set(0, 0.5);
    const iconTex = hasAssets() ? tex(spriteName.icon('build')) : null;
    const iconW = iconTex ? 16 : 0;
    const w = iconW + l.width + 12;
    c.addChild(new Graphics().roundRect(-w / 2, -18, w, 18, 4).fill({ color: 0x6b3d1e, alpha: 0.9 }));
    if (iconTex) {
      const icon = new Sprite(iconTex);
      icon.anchor.set(0, 0.5);
      icon.width = 14; icon.height = 14;
      icon.position.set(-w / 2 + 4, -9);
      c.addChild(icon);
    }
    l.position.set(-w / 2 + 4 + iconW + 2, -9);
    c.addChild(l);
    c.position.set(gc.sx, top);
    c.zIndex = 1e5;
    this.overlay.addChild(c);
    entry.badge = c;
  }

  /** 증축 Lv 배지 (트랙 A): Lv2·3이면 스프라이트 오른쪽 위에 작은 "Lv2" 라벨. Lv가 바뀔 때만 다시 그린다. */
  private syncLevelBadge(entry: ObjEntry, o: PlacedObject) {
    const lv = o.level ?? 1;
    const key = lv >= 2 ? `lv${lv}` : '';
    const prev = entry.node.getChildByLabel('lv');
    if ((prev?.label ?? '') === 'lv' && (prev as Container & { lvKey?: string }).lvKey === key) return;
    prev?.destroy({ children: true });
    if (!key) return;
    const c = new Container() as Container & { lvKey?: string };
    c.label = 'lv';
    c.lvKey = key;
    const l = label(`Lv${lv}`, 9);
    l.anchor.set(0.5, 0.5);
    const w = l.width + 6;
    c.addChild(new Graphics().roundRect(-w / 2, -7, w, 14, 3).fill({ color: lv >= 3 ? 0xb8862a : 0x6b3d1e, alpha: 0.9 }), l);
    const h = entry.sprite?.height ?? 40;
    c.position.set(14, -h + 6);
    entry.node.addChild(c);
  }

  /** 본관 인테리어: 외벽 색 tint + 간판 문구 라벨 */
  private decorateCafe(entry: ObjEntry, state: GameState) {
    if (entry.sprite) entry.sprite.tint = WALL_COLORS[state.cosmetics?.wallColor ?? 0] ?? 0xffffff;
    // y-indoor §8.2: 2층은 본관 벽 위에 2층 창문 띠 오버레이 (같은 발자국 스프라이트라 하단 중앙 앵커가 맞는다)
    entry.node.getChildByLabel('floor2')?.destroy({ children: true });
    const lv = state.main?.level ?? 1;
    const band = state.main?.floor2 && lv >= 3 ? peekTex(spriteName.isoObject('warehouse', `floor2_lv${Math.min(4, lv)}`)) : null;
    if (band) {
      const f2 = new Sprite(band);
      f2.label = 'floor2';
      f2.anchor.set(0.5, 1);
      f2.tint = entry.sprite?.tint ?? 0xffffff;
      entry.node.addChild(f2);
    }
    entry.node.getChildByLabel('sign')?.destroy({ children: true });
    const text = state.cosmetics?.sign;
    if (!text) return;
    const c = new Container();
    c.label = 'sign';
    const l = label(text, 10);
    l.anchor.set(0.5, 1);
    const h = entry.sprite?.height ?? 40;
    l.position.set(0, -h - 2);
    const bg = new Graphics().roundRect(l.x - l.width / 2 - 4, l.y - l.height - 1, l.width + 8, l.height + 2, 3).fill({ color: 0x6b3d1e, alpha: 0.85 });
    c.addChild(bg, l);
    entry.node.addChild(c);
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
        entry.badge?.destroy({ children: true });
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
      this.syncBuilding(entry, o, state);
      this.syncLevelBadge(entry, o);
      // 자리·크기가 바뀌었으면(이동·본관 증축) 노드 위치·깊이 갱신
      const { w, h } = sizeOf(o);
      const posKey = `${o.x},${o.y}:${w}x${h}`;
      if (entry.posKey !== posKey) {
        entry.posKey = posKey;
        const { sx, sy } = footAnchor(o.x, o.y, w, h);
        entry.node.position.set(sx, sy);
        entry.node.zIndex = this.depthOf(state, o.x, o.y, w, h);
        if (entry.glow) { const gc = this.footCenter(o, w, h); entry.glow.position.set(gc.sx, gc.sy - 10); }
      }
      if (entry.sprite) {
        // 시트 모드: 변형(심음·어린 나무·증축)이 바뀔 때만 텍스처를 갱신. 수확은 자동이라 링 대신 반짝임(syncFx).
        const isCafe = o.type === 'warehouse';
        const mainLv = state.main?.level ?? 1;
        const key = `${objectVariant(o, mainLv) ?? ''}:${o.rot ?? ''}${isCafe ? `:${state.cosmetics?.wallColor ?? 0}:${state.cosmetics?.sign ?? ''}:${state.main?.floor2 ? 'F2' : ''}` : ''}`;
        if (this.badgeKeys.get(o.id) === key) continue;
        this.badgeKeys.set(o.id, key);
        const t = objectTex(o, mainLv);
        if (t) entry.sprite.texture = t.texture;
        if (isCafe) this.decorateCafe(entry, state);
        continue;
      }
      // 플레이스홀더: v3에서 작물 표식은 없다 (농원은 월 수확 반짝임 syncFx). 키가 바뀔 때만 다시 그린다.
      const key = '';
      if (this.badgeKeys.get(o.id) === key) continue;
      this.badgeKeys.set(o.id, key);
      (entry.node.getChildByLabel('badge') as Graphics).clear();
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
      return { node: c, sprite: sp, char: null, hadMenu: g.menuId !== null, accKey: '', alert: null, phase: g.phase };
    }
    const def = guestTypeDef(g.type);
    const named = g.namedId ? namedGuestDef(g.namedId) : null;
    const parts = named ? namedGuestParts(namedGuestFace(named), named.face.seed, named.regionId) : guestParts(guestFace(g.type), def.tags, def.wants);
    const ch = makeCharacterNode(parts, guestDir(g), 1);
    c.addChild(ch);
    return { node: c, sprite: null, char: ch, hadMenu: g.menuId !== null, accKey: '', alert: null, phase: g.phase };
  }

  private syncGuests(state: GameState, now: number) {
    const alive = new Set(state.guests.map((g) => g.id));
    for (const [id, entry] of this.guestNodes) {
      if (!alive.has(id)) {
        entry.node.destroy({ children: true });
        this.guestNodes.delete(id);
        this.dropSpeech(id);
        this.greeted.delete(id); // 손님 id는 재사용되지 않으므로 안 지우면 세션 내내 쌓인다
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
        node.zIndex = CHAR_Z + g.x + g.y;
      } else {
        // 같은 날 스폰된 손님이 겹쳐 걷지 않도록 id 기반 작은 오프셋
        const jitter = (parseInt(g.id.slice(1), 10) % 3) * 4 - 4;
        const { sx, sy } = cellCenter(g.x, g.y);
        node.position.set(sx + jitter, sy);
        // 같은 칸의 바닥 오브젝트(올렛길·정류장)보다 앞에, 방 안이면 방보다 앞에 그린다
        node.zIndex = CHAR_Z + g.x + g.y;
      }
      const walking = g.phase !== 'seated' && g.path.length > 0;
      if (g.phase === 'walking' && !this.greeted.has(g.id)) this.maybeGreet(state, g, now);
      if (entry.sprite) {
        const t = tex(spriteName.guest(GUEST_SPRITE_KEY[g.type] ?? g.type, guestDir(g), walking ? walkFrame : 1));
        if (t && entry.sprite.texture !== t) entry.sprite.texture = t;
      } else if (entry.char) {
        updateCharacterNode(entry.char, guestDir(g), walking ? walkFrame : 1);
      }
      // 첫 주문(판매) 순간에 코인 팝 + 주문 메뉴 말풍선
      if (!entry.hadMenu && g.menuId !== null) {
        entry.hadMenu = true;
        this.spawnCoin(node.x, node.y - GUEST_H - 4, now);
        let name = '';
        try { name = menuOf(state, g.menuId).name; } catch { /* 모르는 메뉴 id */ }
        this.showBubble(g.id, { icon: spriteName.icon('menu'), text: name || undefined });
      }
      // 나갈 때 기분 아이콘, 가끔(20%) 대사
      if (entry.phase !== g.phase) {
        entry.phase = g.phase;
        if (g.phase === 'leaving') {
          const line = Math.random() < LEAVE_SAY_CHANCE ? this.guestSay?.(state, g) ?? null : null;
          if (line) this.showBubble(g.id, { text: line });
          else this.showBubble(g.id, { mood: g.mood });
        }
      }
      this.syncGuestAccessories(state, g, entry, now);
    }
  }

  private dropSpeech(id: string) {
    const sp = this.speech.get(id);
    if (!sp) return;
    if (!sp.node.destroyed) sp.node.destroy({ children: true });
    this.speech.delete(id);
  }

  /** 직원 노드. 원점은 발끝. 파츠 캐릭터 + 머리 위 역할 배지. */
  private makeStaffNode(st: Staff, uniform: string | null): StaffEntry {
    const node = new Container();
    const body = makeCharacterNode(staffParts(st.face, st.role, uniform), walkDir(st.x, st.y, st.path[0]), 1);
    node.addChild(body);
    return { node, body, roleKey: '', walking: st.path.length > 0, lastBang: 0, lastZzz: 0 };
  }

  private syncStaff(state: GameState, now: number) {
    const alive = new Set(state.staff.map((s) => s.id));
    for (const [id, entry] of this.staffNodes) {
      if (!alive.has(id)) {
        entry.node.destroy({ children: true });
        this.staffNodes.delete(id);
        this.dropSpeech(id);
      }
    }
    const walkFrame = (Math.floor(now / WALK_FRAME_MS) % 3) as Frame;
    for (const st of state.staff) {
      let entry = this.staffNodes.get(st.id);
      if (!entry) { entry = this.makeStaffNode(st, state.uniform ?? null); this.actors.addChild(entry.node); this.staffNodes.set(st.id, entry); }
      // 역할·유니폼이 바뀌면 액세서리·상의 색이 달라지므로 캐릭터를 다시 만든다
      const parts = staffParts(st.face, st.role, state.uniform ?? null);
      if (!sameAccs(entry.body, parts.accs) || entry.body.__parts?.top !== parts.top) {
        entry.body.destroy({ children: true });
        entry.body = makeCharacterNode(parts);
        entry.node.addChildAt(entry.body, 0);
      }
      const { node } = entry;
      const { sx, sy } = cellCenter(st.x, st.y);
      node.position.set(sx, sy);
      node.zIndex = CHAR_Z + st.x + st.y;
      const walking = st.path.length > 0;
      updateCharacterNode(entry.body, walkDir(st.x, st.y, st.path[0]), walking ? walkFrame : 1);
      const tired = st.energy < LOW_ENERGY;
      node.alpha = tired ? TIRED_ALPHA : 1;
      // 일하러 나설 때 "!" (8초에 한 번), 기력이 낮으면 "zzz" (6초마다)
      if (walking && !entry.walking && st.role && !tired && now - entry.lastBang >= STAFF_BANG_COOLDOWN_MS) {
        entry.lastBang = now;
        this.showBubble(st.id, { icon: 'fx_alert' }, 900);
      }
      entry.walking = walking;
      if (tired && now - entry.lastZzz >= STAFF_ZZZ_INTERVAL_MS) {
        entry.lastZzz = now;
        this.showBubble(st.id, { text: 'zzz' }, 1200);
      }
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

  /** 앉아서 주문한 손님은 손에 컵, 부탁(offered)을 들고 온 타입은 머리 위 "!" */
  private syncGuestAccessories(state: GameState, g: Guest, entry: GuestEntry, now: number) {
    const cup = g.phase === 'seated' && g.menuId !== null;
    const questId = guestTypeDef(g.type).questId;
    const alert = questId !== null && state.board.quests[questId]?.status === 'offered';
    if (entry.alert) entry.alert.y = ALERT_Y - ALERT_BOB_PX * (0.5 + 0.5 * Math.sin(now / ALERT_BOB_MS * Math.PI * 2));
    const key = `${cup}:${alert}`;
    if (entry.accKey === key) return;
    entry.accKey = key;
    entry.node.getChildByLabel('cup')?.destroy();
    entry.alert?.destroy();
    entry.alert = null;
    const cupTex = cup ? tex('fx_cup') : null;
    if (cupTex) {
      const sp = new Sprite(cupTex);
      sp.label = 'cup';
      sp.anchor.set(0.5, 1);
      sp.position.set(CUP_OFFSET.x, CUP_OFFSET.y);
      entry.node.addChild(sp);
    }
    const alertTex = alert ? tex('fx_alert') : null;
    if (alertTex) {
      const sp = new Sprite(alertTex);
      sp.label = 'alert';
      sp.anchor.set(0.5, 1);
      sp.position.set(0, ALERT_Y);
      entry.node.addChild(sp);
      entry.alert = sp;
    }
  }

  /** 홀 직원이 2칸 안에 있으면(손님당 한 번 판정) 20%로 "어서옵서예!" — 렌더 전용, sim 상태는 안 건드린다 */
  private maybeGreet(state: GameState, g: Guest, now: number) {
    const near = state.staff.filter((st) => st.role === 'hall' && Math.max(Math.abs(st.x - g.x), Math.abs(st.y - g.y)) <= GREET_RADIUS);
    if (near.length === 0) return;
    this.greeted.add(g.id);
    if (Math.random() >= GREET_CHANCE) return;
    void now;
    this.showBubble(near[0]!.id, { text: GREET_TEXT }, GREET_MS);
  }

  /** +N 숫자 팝업 (시설 인기 상승) */
  private spawnPop(cellX: number, cellY: number, n: number, now: number) {
    const c = new Container();
    const l = label(`+${n}`, 11);
    l.anchor.set(0.5, 1);
    l.style.fill = 0xffe066;
    const bg = new Graphics().roundRect(-l.width / 2 - 3, -l.height - 1, l.width + 6, l.height + 2, 3).fill({ color: 0x000000, alpha: 0.5 });
    c.addChild(bg, l);
    const { sx, sy } = cellCenter(cellX, cellY);
    c.position.set(sx, sy - 24);
    c.zIndex = 1e6;
    this.overlay.addChild(c);
    this.pops.push({ node: c, born: now, y0: sy - 24 });
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
      if (e.kind === 'harvest' || e.kind === 'complete') this.spawnSparkle(e.x, e.y, now);
      else if (e.kind === 'pop') this.spawnPop(e.x, e.y, e.n, now);
      else if (e.kind === 'photo') this.spawnSparkle(e.x, e.y, now);
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

  /** 렌더 전용 애니 진행: 말풍선 팝 스케일, 코인 프레임·상승, 숫자 팝업, 인사 말풍선 */
  private tickFx(now: number) {
    if (this.pops.length) {
      this.pops = this.pops.filter((p) => {
        const k = (now - p.born) / POP_MS;
        if (k >= 1) { p.node.destroy({ children: true }); return false; }
        p.node.y = p.y0 - POP_RISE_PX * k;
        p.node.alpha = 1 - k * k;
        return true;
      });
    }
    for (const [id, sp] of this.speech) {
      if (sp.node.destroyed || sp.target.destroyed) { this.speech.delete(id); continue; }
      if (now >= sp.until) { sp.node.destroy({ children: true }); this.speech.delete(id); continue; }
      sp.node.position.set(sp.target.x, sp.target.y + BUBBLE_Y);
    }
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
