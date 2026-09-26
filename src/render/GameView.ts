import { Application, Container, Sprite, Graphics, Texture, Text } from 'pixi.js';
import type { GameState, PlacedObject, Guest, Staff, Season, RoleId, Pt, RouteId, FxEvent } from '../sim/index.ts';
import { seasonOf, LOW_ENERGY, parcelPrice, canBuyParcel, parcelAt, footprint, roomAt, doorFrontOf, WALL_COLORS, dayIndex, menuOf, sizeOf, mainBuilding, MAIN_SIZE, LIGHT_RADIUS, gradeOf, objectAt, cellAt, contestBadge, seatGrade, GRADE_COLOR, mainLevel, mainSize, rivalOnParcel, rivalsState } from '../sim/index.ts';
import type { Parcel } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { isoTerrainTexture, isoObjectTexture, glowTexture, label, clearTextureCache, loadLabelFont } from './textures';
import { makeSpeechBubble, shortMenuName } from './bubble';
import { loadAssets, tex, peekTex, hasAssets, spriteName } from './assets';
import { attachCamera, type CameraBounds, type CameraOptions } from './camera';
import { ISO_W, ISO_H, cellToScreen, cellCenter, footAnchor, depth, screenToCell } from './iso';
import { makeCharacterNode, updateCharacterNode, staffParts, guestParts, namedGuestParts, sameAccs, CHAR_H, type CharacterNode, type Dir, type Frame } from './character';
import { guestFace } from '../sim/segments.ts';
import { regularFace } from '../sim/interact.ts'; // fun-guest: 단골 고정 얼굴
import { namedGuestFace } from '../sim/named.ts';
import { guestTypeDef, namedGuestDef } from '../data/index.ts';
import { Background } from './Background';
import { siteOf, siteBadgeText, siteTone, layoutKey } from '../sim/site.ts';
import { objectStats } from '../sim/compat.ts';
import { isStopped } from '../sim/effects.ts'; // ui3: 맵 위 「고장」 표시
import { unreachableIds } from '../sim/reach.ts'; // ui3: 손님이 못 가는 시설 ✕
import { entryPoints, ROUTE_IDS, ENTRY_ROUTES } from '../sim/entry.ts'; // 트랙 H 진입점 표지
import { completedCorners, pendingCorners, cornerDef } from '../sim/corners.ts'; // fun-corner 명당 팻말 · spot2 공사 중 반투명 팻말
import { isSiteOverlayOn, setSiteOverlayOn, siteOverlayKey, drawSiteOverlay, GHOST_GOOD, GHOST_WARN } from './siteOverlay';
import { parcelScenery, parcelSignLines, wallEdges, ROUTE_PREVIEW, busPose, BUS_PERIOD_MS, BUS_DROP_AT_MS, type SceneryProp } from './scenery'; // 트랙 E 제주 풍경
import { VILLAGE_ROAD_Y } from '../sim/layout.ts';

/** 주문 말풍선: 메뉴 분류별 픽셀 아이콘(icon_*) — MenuWindow의 CAT_ICON과 같은 이름 */
const MENU_BUBBLE_ICON: Record<string, string> = { drink: 'coffee', dessert: 'cake', meal: 'meal', signature: 'sparkle' };

/** 전용 스프라이트가 있는 손님 타입 (guest_local·guest_tourist 시트) */
const GUEST_SPRITE_KEY: Record<string, string> = { local_auntie: 'local', student: 'tourist' };

export interface GameViewOptions extends Pick<CameraOptions, 'onTap' | 'fastTap' | 'dragCapture' | 'onDragCell' | 'onDragEnd' | 'onLongPress' | 'onDoubleTap'> {
  /** 손님이 나갈 때 20%로 띄우는 대사 (없으면 기분 아이콘만) */
  guestSay?: (state: GameState, g: Guest) => string | null;
}

/** 배치 모드 고스트: 손가락 아래 반투명 오브젝트. ok면 초록, 아니면 빨강. text는 비용 라벨. */
export interface GhostSpec { type: string; x: number; y: number; rot?: number; ok: boolean; /** ui3: 놓을 수는 있지만 손님이 걸어 올 수 없는 자리 (주황) */ warn?: boolean; text: string; w?: number; h?: number; /** 문 앞 칸 미리보기 (w-start 본관 짓기: 파란 마름모 + 「문 앞」) */ door?: { x: number; y: number } }
/** 효과 범위 힌트 (UX §5.3): 중심 시설 발자국 + 반경(칸) 타원, 콤보가 성립하는 상대 시설 발자국 위 ◎ */
export interface RangeHint { x: number; y: number; w: number; h: number; radius: number; marks: { x: number; y: number; w: number; h: number }[]; /** fun-corner: 명당 배지 ("이걸 놓으면 꽃길 완성") */ badge?: string }
/** 배치 추천 칸 (video-patch §3.2.1): 1위 금색 · 2·3위 연금색 · 캐시가 없으면 회색. label이 있으면 칸 위에 `+42만` 한 줄, 1위엔 `1` 칩. */
export interface PlacePickMark { x: number; y: number; rank: number; label: string | null }
/** 추천 칸 색: 금 · 연금 · 회색(숫자 없는 휴리스틱) */
export const PICK_COLOR_TOP = 0xffc400;
export const PICK_COLOR_SUB = 0xffe08a;
export const PICK_COLOR_DIM = 0xb9a98f;

/** 선택 칸 색: 철거 빨강 · 라인 미리보기 파랑 (ease 두 번 탭) */
export const RECT_COLOR_REMOVE = 0xc9184a;
export const RECT_COLOR_LINE = 0x2f7fd9;
/** 콤보·경관 범위 기본 반경 2칸 (5×5) */
export const RANGE_RADIUS = 2;
/** 시설 위 인기 미니 바 최대값 (§5.4: 0~48) */
export const GAUGE_MAX = 48;

/** 말풍선 내용: 글자, 시트 아이콘(icon_*·bubble_* 프레임 이름), 기분 아이콘 중 하나 이상 */
export interface BubbleContent { text?: string; icon?: string; mood?: Guest['mood'] }
/** 기본 말풍선 시간 */
export const BUBBLE_MS = 1500;

/** 아직 시트에 없는 오브젝트가 빌려 쓰는 스프라이트 */
/** 시트 이름이 다른 오브젝트. 감귤나무는 v3에서 성장 단계가 없어 늘 열매 달린 모습으로 */
const SPRITE_ALIAS: Record<string, string> = { spring: 'pond', dolhareubang_pair: 'dolhareubang', tangerine_tree: 'tangerine_tree_ready' };
/** 캐릭터(손님·직원)는 모든 시설·건물보다 앞에 그린다 — 건물 뒤·안에 있어도 사람이 보여야 한다(카이로식). 캐릭터끼리는 x+y 순. */
const CHAR_Z = 1e4;
/** 트랙 H: 경로별 진입점 표지 스프라이트 (버스·자동차·리본) */
const ROUTE_MARKER_SPRITE: Record<RouteId, string> = { bus: 'route_bus', parking: 'route_car', olle: 'route_ribbon' };
const ROUTE_LOCKED_TINT = 0x8a8a8a;

/** 미소유 필지 풍경 노드(트랙 E): 풍경 타일(tiles)·소품(actors, 깊이 정렬)·이름 팻말(overlay)을 한데 묶는다. 사면 1초 페이드 뒤 지운다(keep 소품은 남는다). */
interface SceneryEntry { tiles: Container; props: { node: Container; keep: boolean; cells: { x: number; y: number }[] }[]; sign: Container; text: string; fadeFrom: number | null; center?: { sx: number; sy: number };
  /** 필지가 차지한 월드 좌표 상자 — 팻말이 제 필지를 벗어나지 않게 붙잡는 범위 */
  box?: { x0: number; y0: number; x1: number; y1: number } }
function destroyScenery(e: SceneryEntry, keepLandmarks: boolean) {
  e.tiles.destroy({ children: true });
  e.sign.destroy({ children: true });
  for (const p of e.props) if (!(keepLandmarks && p.keep) && !p.node.destroyed) p.node.destroy({ children: true });
}
/** fun P0 도착 연출: 들어오는 데 1.2초 · 서 있는 2초 · 나가는 1.2초 */
const ARRIVE_IN_MS = 1200;
const ARRIVE_STAY_MS = 2000;
const ARRIVE_OUT_MS = 1200;
/** 사면 풍경이 걷히는 시간 */
const SCENERY_FADE_MS = 1000;
/** 팻말 배율: 월드 배율이 이 값보다 작으면 그만큼 키워 화면 글자 크기를 지킨다(최대 ×1.8 — 더 키우면 줌아웃 때 팻말끼리 겹친다) */
const SIGN_MIN_WORLD_SCALE = 1.2;
const SIGN_MAX_SCALE = 1.8;
function signScale(worldScale: number): number {
  return Math.min(SIGN_MAX_SCALE, Math.max(1, SIGN_MIN_WORLD_SCALE / Math.max(0.01, worldScale)));
}
/** 맵 안 칸의 지형(밖이면 null) · 시설 유무 · 경로 진입점 칸인가 — 풍경 소품 자리 검사용 */
function cellTerrain(state: GameState, x: number, y: number): string | null {
  return x >= 0 && y >= 0 && x < state.grid.w && y < state.grid.h ? cellAt(state, x, y).terrain : null;
}
function objectAtCell(state: GameState, x: number, y: number): boolean {
  return objectAt(state, x, y) !== null;
}
function isEntryCell(x: number, y: number): boolean {
  return ROUTE_IDS.some((r) => ENTRY_ROUTES[r].entry.x === x && ENTRY_ROUTES[r].entry.y === y);
}
/** 마을 버스 프레임 간격(달릴 때) */
const BUS_FRAME_MS = 150;
/** 진입점 미리 보기 팻말·필지 팻말 색 (갈색 나무판 + 크림 글자) */
const SIGN_FILL = 0x6b3d1e;
const SIGN_EDGE = 0x3b1f0e;
const SIGN_TEXT = 0xfff3d6;

const GHOST_OK = 0x88ff88;
const GHOST_BAD = 0xff7777;
const GHOST_ALPHA = 0.65;
/** 미소유 필지 덮개 색(시트가 없을 때) */
const LOCKED_COLOR = 0x000000;
const LOCKED_ALPHA = 0.45;
/** fun-rank: 필지 구매 연출 — 덮개 안개가 1초 동안 걷힌다 */
/** fun-rank: 등급별 본관 외벽 tint (플레이어가 외벽 색을 고르지 않았을 때(0) — 등급이 오르면 벽이 산뜻해진다: 회벽 → 크림 → 연노랑 → 연분홍 → 연보라) */
const GRADE_WALL_TINT = [0xffffff, 0xe6e0d4, 0xfff4dc, 0xfff8c8, 0xffe0e8, 0xe8d8ff];
/** fun-rank: 본관 뒤 모서리(두 벽이 만나는 꼭대기) 높이 = 기단 10 + 벽 높이(sprites_iso_rooms.py warehouse/MAIN_WALL_H) */
/** 본관 벽 높이(기단 10 + 벽) — 증축 Lv별 (sprites_iso_rooms.py MAIN_WALL_H {2: 28, 3: 34, 4: 40} + 기단 10) */
const MAIN_WALL_TOPS: Record<number, number> = { 1: 40, 2: 42, 3: 46, 4: 50, 5: 52 };
const mainWallTop = (state: GameState) => MAIN_WALL_TOPS[mainLevel(state)] ?? 38;

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
/** 튜토리얼 스포트라이트 어둠 (ui/tutorialHighlight.ts SPOT_ALPHA와 같은 값 — render/는 ui/를 import하지 않는다) */
const SPOT_ALPHA = 0.22; // fun-start: 0.55는 너무 어두워 게임 요소를 못 알아봤다
/** 스포트라이트 구멍 반경(체비쇼프): 타깃 칸 주변 이 반경 안은 아예 안 어둡고, 맨 바깥 고리는 반만 어둡다(부드러운 가장자리) */
const SPOT_HOLE_RADIUS = 3;
/** 숫자 팝업(+N): 700ms 동안 16px 떠오르며 사라진다 */
/** 상성 UP이 차례로 튀어오르는 간격 */
const UP_STAGGER_MS = 110;
const POP_MS = 700;
const POP_RISE_PX = 16;
/** 동시에 떠 있는 숫자 팝업 상한 (결제 「+₩」 스로틀) */
const MONEY_POP_MAX = 8;
/** 직원 인사 말풍선: 손님이 2칸 안에 오면 20%로 1.2초 */
const GREET_RADIUS = 2;
const GREET_CHANCE = 0.2;
const GREET_MS = 1200;
/** fun-guest 반응 말풍선·아이콘 */
const REACT_BUBBLE_MS = 2500;
const REACT_ICON_PX = 12;
const REACT_ICON_DX = 22;
const REACT_ICON: Record<NonNullable<Extract<FxEvent, { kind: 'react' }>['icon']>, string> = { heart: 'icon_heart', sweat: 'icon_mood_meh', wave: 'icon_wave', question: 'bubble_question', thumb: 'icon_thumb' };
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
const ROLE_ICON: Record<RoleId, string> = { hall: 'look', barista: 'menu', cook: 'harvest', clean: 'remove' };
/** 배지 아래 끝 y(발끝 기준). 캐릭터 프레임 48px 중 위 13px은 비어 있고(머리 y=16, 모자 챙 y=13) 그 위 3px 띄운다 */
const ROLE_ICON_Y = -(CHAR_H - 10);
/** 기력이 낮은 직원은 흐리게 */
const TIRED_ALPHA = 0.6;
/** 건설 중인 시설: 반투명 + 망치 라벨 */
const BUILDING_ALPHA = 0.5;
/** ui3: 손님이 못 가는 시설 — 살짝 어둡게 (빨간 ✕와 함께) */
const UNREACHABLE_ALPHA = 0.66;
/** 방(본관 등) 문 앞 칸 표식: 손님 출입구라 올렛길을 이어야 한다 */
const DOOR_MARK_COLOR = 0xffd166;
/** 글로우 라벨을 다는 칸 수 상한 (칸이 많으면 앞 몇 개만) */
const HIGHLIGHT_LABEL_MAX = 3;
/** 밤 오버레이 색·최대 알파 (fix-indoor: 0.55 → 0.38, 남색 유지. DOM NightOverlay는 없앴다 — 둘이 겹쳐 너무 어두웠다) */
const NIGHT_COLOR = 0x0b1a3a;
const NIGHT_MAX_ALPHA = 0.38;
/** 밤에 빛나는 오브젝트: 조명 시설(sim/lighting LIGHT_RADIUS) + 정류장. 건물은 발자국 전체에 따뜻한 빛을 깐다(syncRoomLights). */
const GLOW_EXTRA_TYPES = new Set(['busstop']);
function glowScale(type: string, w: number, h: number): number {
  const r = LIGHT_RADIUS[type];
  if (r !== undefined) return 1 + r * 1.2; // 반경 1 → 2.2 (예전 1의 2배), 반경 2 → 3.4
  return w === 1 && h === 1 ? 1.4 : 1.8;
}
/** 글로우 밝기 배수 (fix-indoor: 1.4배) */
const GLOW_BRIGHT = 1.4;
/** 실내 빛 오버레이 색·알파 (add 블렌드) */
const ROOM_LIGHT_COLOR = 0xffc46a;
const ROOM_LIGHT_ALPHA = 0.28;
/** 맵 경계 위쪽 여유(키 큰 오브젝트와 지평선 배경 띠가 보이도록) */
/** 산 땅 둘레로 카메라가 더 갈 수 있는 칸 수 */
const BOUNDS_OWNED_MARGIN = 2;
const BOUNDS_TOP_PAD = 260;

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
  kind: 'coin' | 'sparkle' | 'flash';
}
/** fun-corner: 카메라 플래시 3프레임 */
const FLASH_FRAME_MS = 90;
const FLASH_FRAMES = 3;
const CORNER_SAY_MS = 1800;

/** 오브젝트 상태별 스프라이트 변형 이름. 본관은 증축 Lv(state.main.level)에 따라 lv2·lv3 (zero-base). */
function objectVariant(o: Pick<PlacedObject, 'type'>, level = 1): string | undefined {
  if (o.type === 'warehouse') return level >= 2 ? `lv${Math.min(5, level)}` : undefined;
  if (o.type === 'gate') return '0'; // 2B에서 영업 토글 연동
  return undefined;
}

/** 아이소 스프라이트(회전 _r{n} → 변형 → 기본) → 탑다운 스프라이트(변형 → 기본) 순으로 찾는다. 다 없으면 null. */
function objectTex(o: Pick<PlacedObject, 'type' | 'rot'>, level = 1): { texture: Texture; iso: boolean } | null {
  if (!hasAssets()) return null;
  const name = SPRITE_ALIAS[o.type] ?? o.type;
  const variant = objectVariant(o, level);
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
  /** uifix: 맵 팻말(미소유 필지 이름·진입점 미리 보기)만 담는 레이어.
   *  상단 2줄·하단 바가 차지한 화면 밖으로는 나가지 않게 화면 좌표로 잘라 낸다 — 팻말이 UI 위로 떠다니지 않게. */
  private signs = new Container();
  private signMask = new Graphics();
  private signMaskRect = '';
  /** 맵이 쓸 수 있는 화면 띠 (상단 셸·하단 셸 높이). App이 넣어 준다. */
  private mapInsets = { top: 0, bottom: 0 };
  /** 카메라 영향을 받지 않는 화면 고정 레이어(밤 오버레이) */
  private ui = new Container();
  private night = new Graphics();
  /** 밤 오버레이 위에 그리는 additive 글로우. 매 프레임 world와 같은 변환을 따른다. */
  private lights = new Container();
  /** 건물 발자국 전체를 밤에도 밝히는 따뜻한 빛 (add 블렌드). 배치가 바뀔 때만 다시 그린다 */
  private roomLight = new Graphics();
  private roomLightKey = '';
  private objNodes = new Map<string, ObjEntry>();
  private guestNodes = new Map<string, GuestEntry>();
  private staffNodes = new Map<string, StaffEntry>();
  /** 오브젝트 id → 마지막으로 그린 배지 키. 키가 같으면 다시 그리지 않는다. */
  private badgeKeys = new Map<string, string>();
  private tileSprites: Sprite[] = [];
  private tilesBuilt = false;
  /** 미소유 필지 덮개 + 가격 라벨. 키는 필지 id, 라벨 문구가 바뀌면(신구간 할인) 다시 만든다. */
  private lockedNodes = new Map<string, SceneryEntry>();
  /** 사서 걷히는 중인 풍경(1초 페이드) */
  private fadingScenery: SceneryEntry[] = [];
  /** 필지 경계 돌담선(내 땅 범위·미소유 경계). 소유·배치가 바뀔 때만 다시 만든다. */
  private wallNodes: Container[] = [];
  private wallKey = '';
  /** 잠긴 경로 진입점 위 미리 보기 팻말 */
  private entryLabels = new Map<RouteId, Container>();
  /** 마을 버스(장식 애니): 서쪽에서 들어와 정류장에 5초 서고 동쪽으로 나간다 */
  private bus: Sprite | null = null;
  private busStop: { x: number; y: number } | null = null;
  private busStopKey = '';
  private busDropCycle = -1;
  /** 트랙 H: 진입점 표지 (경로 id → 노드·상태 키). 배치·해금이 바뀔 때만 다시 만든다. */
  private entryMarkers = new Map<RouteId, { node: Container; key: string }>();
  private entryKey = '';
  /** fun-corner: 완성 명당 팻말(명당 id → 노드). 배치가 바뀔 때만 다시 만든다. */
  private cornerSigns = new Map<string, Container>();
  private cornerKey = '';
  private rangeBadge: Container | null = null;
  private ghost: Container | null = null;
  private ghostKey = '';
  /** 마지막 render의 본관 Lv (고스트 크기·텍스처용) */
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
  /** 글로우 칸 위 작은 말풍선 라벨 (fix-indoor: 빛나는 칸엔 반드시 왜 빛나는지 적는다) */
  private highlightLabels = new Container();
  private highlightKey = '';
  /** 배치 추천 칸 (video-patch §3.2.1): 금·연금 마름모 + 칸 위 예상 이득 라벨 + 1위 `1` 칩 */
  private picks = new Graphics();
  private pickLabels = new Container();
  private pickKey = '';
  /** 튜토리얼 스포트라이트(w-free): 맵 전체 반투명 검정 + 타깃 칸 구멍. 오브젝트·손님(actors) 위, 글로우·말풍선 아래 */
  private spot = new Graphics();
  private spotKey = '';
  /** 효과 범위 타원(타일 위·오브젝트 아래) + ◎ 마크(오버레이) */
  private rangeGfx = new Graphics();
  private rangeMarks = new Graphics();
  private rangeKey = '';
  /** 일괄 철거 드래그 사각형 (§5.3) */
  private rectGfx = new Graphics();
  /** 러시 타임(rush-battle §2): 앉힐 수 있는 자리 초록 · 못 앉히는 자리 회색 · 주문이 밀린 자리 빨강(깜빡임) */
  private rushGfx = new Graphics();
  /** 주문이 밀린 자리(빨강)만 따로 — render 루프에서 알파가 깜빡인다 */
  private rushUrgentGfx = new Graphics();
  private rushKey = '';
  private rushUrgent = false;
  /** 시설 위 인기 미니 바·◎ 콤보 마크 (§5.4, 설정 토글). 1초에 한 번만 다시 계산한다 */
  private gaugeGfx = new Graphics();
  private gaugesOn = false;
  private gaugeAt = 0;
  private gaugeKey = '';
  /** ui3: 맵 위 표시 최소화 (문제 표시만) */
  private mapMinimal = false;
  /** ui3: 손님이 못 가는 시설 id (진입점 BFS — sim/reach.ts가 배치 서명으로 캐시한다) */
  private unreachIds: Set<string> = new Set();
  private hostWidth = 0;
  private bounds: CameraBounds | null = null;
  private nightAlpha = 0;
  /** 렌더 전용 애니 큐: 말풍선 팝, 코인 팝, 반짝임 */
  private bubblePops: { node: Container; born: number }[] = [];
  private fxQueue: Fx[] = [];
  /** fun P0 경로 도착 연출: 렌터카·셔틀·배가 가장자리에서 들어와 서고(손님이 내림) 되돌아 나간다 */
  private arrivals: { sprite: Sprite; born: number; from: { sx: number; sy: number }; to: { sx: number; sy: number }; flipX: boolean }[] = [];
  /** 마지막 렌더 때의 state.tick. 그 뒤 스텝에서 생긴 fx(tick ≥ 이 값)만 연출한다. −1 = 아직 첫 렌더 전 */
  private fxSeenTick = -1;
  /** 숫자 팝업(+N) 큐 */
  private pops: { node: Container; born: number; y0: number }[] = [];
  /** fun-guest: 멈춘 상태(speed 0)에서는 tick이 안 올라 같은 반응 fx가 매 프레임 다시 걸린다 — 한 번 띄운 항목은 건너뛴다 */
  private seenReacts = new WeakSet<object>();
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
    this.world.addChild(this.background.node, this.tiles, this.siteLayer, this.actors, this.overlay, this.signs);
    this.siteLayer.addChild(this.siteGfx);
    this.siteLayer.addChild(this.rangeGfx, this.rectGfx);
    this.overlay.addChild(this.selection);
    // 러시 자리 표시는 오브젝트 **위**에 — 테이블 스프라이트가 칸을 덮어 버리면 초록·빨강이 안 보인다
    this.rushGfx.eventMode = 'none';
    this.rushUrgentGfx.eventMode = 'none';
    this.overlay.addChild(this.rushGfx, this.rushUrgentGfx);
    this.spot.eventMode = 'none';
    this.overlay.addChild(this.spot);
    this.overlay.addChild(this.picks);
    this.overlay.addChild(this.highlight);
    this.highlightLabels.zIndex = 1e6 - 3;
    this.overlay.addChild(this.highlightLabels);
    this.pickLabels.zIndex = 1e6 - 3;
    this.overlay.addChild(this.pickLabels);
    this.rangeMarks.zIndex = 1e6 - 1;
    this.gaugeGfx.zIndex = 1e6 - 2;
    this.overlay.addChild(this.rangeMarks, this.gaugeGfx);
    this.night.eventMode = 'none';
    this.ui.eventMode = 'none';
    this.roomLight.blendMode = 'add';
    this.lights.addChild(this.roomLight);
    this.signMask.eventMode = 'none';
    this.signs.mask = this.signMask;
    this.ui.addChild(this.night, this.lights, this.signMask);
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
    for (const e of this.lockedNodes.values()) destroyScenery(e, false); // overlay에 있는 팻말·actors의 소품까지 같이 지운다
    this.lockedNodes.clear();
    for (const e of this.fadingScenery) destroyScenery(e, false);
    this.fadingScenery = [];
    for (const n of this.wallNodes) n.destroy({ children: true });
    this.wallNodes = [];
    this.wallKey = '';
    for (const e of this.entryMarkers.values()) e.node.destroy({ children: true });
    this.entryMarkers.clear();
    for (const n of this.cornerSigns.values()) n.destroy({ children: true }); // fun-corner 팻말
    this.cornerSigns.clear();
    this.cornerKey = '';
    for (const l of this.entryLabels.values()) l.destroy({ children: true });
    this.entryLabels.clear();
    this.entryKey = '';
    this.bus?.destroy({ children: true });
    this.bus = null;
    for (const a of this.arrivals) if (!a.sprite.destroyed) a.sprite.destroy();
    this.arrivals = [];
    this.busStop = null;
    this.busStopKey = '';
    this.busDropCycle = -1;
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
    this.setPlacementPicks([]);
  }

  /** 배치 고스트를 놓거나(null이면) 치운다. 같은 내용이면 다시 만들지 않는다. */
  setGhost(g: GhostSpec | null) {
    const key = g ? `${g.type}:${g.x},${g.y}:${g.rot ?? ''}:${g.ok}:${g.warn ? 'w' : ''}:${g.text}:${g.door ? `${g.door.x},${g.door.y}` : ''}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost?.destroy({ children: true });
    this.ghost = null;
    this.ghostSpec = g;
    this.ghostSiteKey = '';
    if (!g) return;
    const def = objectDef(g.type);
    const gw = g.w ?? (g.type === 'warehouse' ? MAIN_SIZE.w : def.w), gh = g.h ?? (g.type === 'warehouse' ? MAIN_SIZE.h : def.h);
    const c = new Container();
    const { sx, sy } = footAnchor(g.x, g.y, gw, gh);
    c.position.set(sx, sy);
    c.alpha = GHOST_ALPHA;
    // 발자국 다이아몬드(초록/빨강)
    const fp = new Graphics();
    for (const p of footprint(g.type, g.x, g.y, gw, gh)) {
      const t = cellToScreen(p.x, p.y);
      fp.poly([t.sx - sx, t.sy - sy, t.sx - sx + ISO_W / 2, t.sy - sy + ISO_H / 2, t.sx - sx, t.sy - sy + ISO_H, t.sx - sx - ISO_W / 2, t.sy - sy + ISO_H / 2])
        .fill({ color: !g.ok ? GHOST_BAD : g.warn ? GHOST_WARN : GHOST_OK, alpha: 0.5 }); // ui3: 놓을 수는 있지만 손님이 못 오는 자리는 주황
    }
    c.addChild(fp);
    if (g.door) { // 문 앞 칸 미리보기 — 손님이 드나드는 칸 (w-start 본관 고스트)
      const d = cellToScreen(g.door.x, g.door.y);
      const dg = new Graphics()
        .poly([d.sx - sx, d.sy - sy, d.sx - sx + ISO_W / 2, d.sy - sy + ISO_H / 2, d.sx - sx, d.sy - sy + ISO_H, d.sx - sx - ISO_W / 2, d.sy - sy + ISO_H / 2])
        .fill({ color: 0x5ad1ff, alpha: 0.35 }).stroke({ color: 0x2aa7e0, width: 2 });
      const dl = label('문 앞', 9);
      dl.anchor.set(0.5, 0.5);
      dl.position.set(d.sx - sx, d.sy - sy + ISO_H / 2);
      dg.label = 'ghostDoor';
      c.addChild(dg, dl);
    }
    const t = objectTex({ type: g.type, rot: g.rot });
    const sp = new Sprite(t?.texture ?? isoObjectTexture(this.app.renderer, def.kind, gw, gh));
    sp.anchor.set(0.5, 1);
    if (t && !t.iso) sp.position.y = -gh * (ISO_H / 2);
    sp.tint = !g.ok ? GHOST_BAD : g.warn ? GHOST_WARN : GHOST_OK;
    sp.label = 'ghostSprite';
    c.addChild(sp);
    // 고스트 위 이름·값 팻말은 안 띄운다 — 같은 내용이 하단 배치 줄에 있고, 맵에서는 입지 점수·추천 칸
    // 팻말과 겹쳐 네 겹으로 쌓여 아무것도 안 읽혔다. (g.text는 하단 줄이 쓴다)
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

  /** 튜토리얼 하이라이트 칸 (노란 반투명 마름모, x-goals tutorialHighlight.ts). text가 있으면 칸 위에 작은 말풍선 라벨(앞 HIGHLIGHT_LABEL_MAX칸)을 단다 —
   *  빛나는 칸엔 반드시 이유가 적혀 있어야 한다(fix-indoor). 빈 배열이면 글로우·라벨 모두 지운다. 같은 내용이면 다시 그리지 않는다. */
  setHighlightCells(cells: { x: number; y: number }[], text?: string) {
    if (!this.highlight || this.highlight.destroyed || this.highlightLabels.destroyed) return; // 뷰가 파괴된 뒤(HMR·화면 전환) 늦게 온 호출
    const key = `${text ?? ''}#${cells.map((c) => `${c.x},${c.y}`).join('|')}`;
    if (key === this.highlightKey) return;
    this.highlightKey = key;
    this.highlight.clear();
    this.highlightLabels.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const cell of cells) {
      const { sx, sy } = cellToScreen(cell.x, cell.y);
      this.highlight
        .poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2])
        .fill({ color: 0xffd54a, alpha: 0.45 })
        .stroke({ color: 0xffb300, width: 3 });
    }
    if (!text) return;
    // 가까운 칸(체비쇼프 ≤2)은 한 묶음으로 보고 라벨 하나만 — 말풍선이 겹치지 않게 (본관 3×2 발자국도 하나)
    const labeled: { x: number; y: number }[] = [];
    for (const cell of cells) {
      if (labeled.length >= HIGHLIGHT_LABEL_MAX) break;
      if (labeled.some((l) => Math.max(Math.abs(l.x - cell.x), Math.abs(l.y - cell.y)) <= 2)) continue;
      labeled.push(cell);
      const { sx, sy } = cellToScreen(cell.x, cell.y);
      this.highlightLabels.addChild(this.speechLabel(text, sx, sy - 6));
    }
  }

  /** 배치 추천 칸 (video-patch §3.2.1): 1위 금색·2·3위 연금색 테두리 2px, label이 있으면 칸 위에 `+42만` 한 줄, 1위엔 작은 `1` 칩.
   *  label이 전부 null이면(캐시 미스) 숫자 없이 회색 칸만 — 절대 빈 화면을 남기지 않는다. 같은 내용이면 다시 그리지 않는다. */
  setPlacementPicks(picks: PlacePickMark[]) {
    if (!this.picks || this.picks.destroyed || this.pickLabels.destroyed) return;
    const key = picks.map((p) => `${p.x},${p.y},${p.rank},${p.label ?? ''}`).join('|');
    if (key === this.pickKey) return;
    this.pickKey = key;
    this.picks.clear();
    this.pickLabels.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const p of picks) {
      const { sx, sy } = cellToScreen(p.x, p.y);
      const color = p.label === null ? PICK_COLOR_DIM : p.rank === 1 ? PICK_COLOR_TOP : PICK_COLOR_SUB;
      this.picks
        .poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2])
        .fill({ color, alpha: p.rank === 1 ? 0.42 : 0.28 })
        .stroke({ color, width: 2, alpha: 0.95 });
      if (p.label) this.pickLabels.addChild(this.pickLabel(p.label, p.rank === 1, sx, sy - 4));
    }
  }

  /** 추천 칸 위 예상 이득 칩 (1위는 금 바탕에 `1` 칩을 붙인다) */
  private pickLabel(text: string, top: boolean, sx: number, sy: number): Container {
    const c = new Container();
    const l = label(text, 11);
    l.style.fill = 0x3b2a1a;
    const w = Math.ceil(l.width) + 10, h = Math.ceil(l.height) + 5;
    const rank = top ? label('1', 10) : null;
    const rw = rank ? Math.ceil(rank.width) + 8 : 0;
    const bg = new Graphics()
      .roundRect(-w / 2, -h - 4, w, h, 4).fill({ color: top ? 0xffe9a8 : 0xfff8e6, alpha: 0.96 }).stroke({ color: top ? 0xd08a00 : 0x6b3d1e, width: 2 });
    l.position.set(-w / 2 + 5, -h - 2);
    c.addChild(bg, l);
    if (rank) {
      rank.style.fill = 0x3b2a1a;
      const chip = new Graphics().roundRect(-w / 2 - rw - 3, -h - 4, rw, h, 4).fill({ color: PICK_COLOR_TOP }).stroke({ color: 0xd08a00, width: 2 });
      rank.position.set(-w / 2 - rw - 3 + 4, -h - 2);
      c.addChild(chip, rank);
    }
    c.position.set(sx, sy);
    return c;
  }

  /** 칸 위 작은 말풍선(흰 바탕·갈색 테두리·아래 꼬리). (sx, sy)는 꼬리 끝. */
  private speechLabel(text: string, sx: number, sy: number): Container {
    const c = new Container();
    const l = label(text, 11);
    l.style.fill = 0x3b2a1a;
    const w = Math.ceil(l.width) + 10, h = Math.ceil(l.height) + 6;
    const bg = new Graphics()
      .roundRect(-w / 2, -h - 6, w, h, 4).fill({ color: 0xfff8e6, alpha: 0.95 }).stroke({ color: 0x6b3d1e, width: 2 })
      .poly([-4, -6, 4, -6, 0, 0]).fill({ color: 0xfff8e6 }).stroke({ color: 0x6b3d1e, width: 2 });
    l.position.set(-w / 2 + 5, -h - 3);
    c.addChild(bg, l);
    c.position.set(sx, sy);
    return c;
  }

  /** 튜토리얼 스포트라이트(w-free tutorialHighlight.ts): 맵(월드 좌표) 전체를 반투명 검정으로 덮고 타깃 칸(여러 개면 전부)만 구멍을 낸다. null이면 걷는다.
   *  overlay 레이어라 타일·오브젝트·캐릭터 위, 칸 글로우·말풍선(나중에 addChild) 아래. 같은 칸 목록이면 다시 그리지 않는다. */
  setSpotlightCells(cells: { x: number; y: number }[] | null) {
    if (!this.spot || this.spot.destroyed) return;
    const key = cells ? cells.map((c) => `${c.x},${c.y}`).join('|') : '';
    if (key === this.spotKey) return;
    this.spotKey = key;
    this.spot.clear();
    if (!cells) return;
    const R = 1e5; // 월드 좌표 전체 (카메라가 어디를 보든 덮인다)
    this.spot.rect(-R, -R, 2 * R, 2 * R).fill({ color: 0x000000, alpha: SPOT_ALPHA });
    // 타깃 칸 주변 반경 SPOT_HOLE_RADIUS 안은 구멍(안 어둡게), 맨 바깥 고리는 반만 어둡게 — 구멍이 부드럽게 넓어진다
    const ring: { x: number; y: number }[] = [];
    const seen = new Set<string>();
    for (const cell of cells) {
      for (let dy = -SPOT_HOLE_RADIUS; dy <= SPOT_HOLE_RADIUS; dy++) for (let dx = -SPOT_HOLE_RADIUS; dx <= SPOT_HOLE_RADIUS; dx++) {
        const x = cell.x + dx, y = cell.y + dy, k = `${x},${y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const { sx, sy } = cellToScreen(x, y);
        this.spot.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).cut();
        if (Math.max(Math.abs(dx), Math.abs(dy)) === SPOT_HOLE_RADIUS && !cells.some((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < SPOT_HOLE_RADIUS)) ring.push({ x, y });
      }
    }
    for (const { x, y } of ring) {
      const { sx, sy } = cellToScreen(x, y);
      this.spot.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color: 0x000000, alpha: SPOT_ALPHA / 2 });
    }
  }

  /** 효과 범위 힌트(§5.3): 고스트·이동·카드 열림 중 반경 radius 타원 + 성립 상대 위 ◎. null이면 지운다. 같은 내용이면 다시 그리지 않는다. */
  setRangeHint(h: RangeHint | null) {
    const key = h ? `${h.x},${h.y},${h.w},${h.h},${h.radius}|${h.marks.map((m) => `${m.x},${m.y}`).join(';')}|${h.badge ?? ''}` : '';
    if (key === this.rangeKey) return;
    this.rangeKey = key;
    if (this.rangeGfx.destroyed || this.rangeMarks.destroyed) return;
    this.rangeGfx.clear();
    this.rangeMarks.clear();
    this.rangeBadge?.destroy({ children: true });
    this.rangeBadge = null;
    if (!h) return;
    const c = cellCenter(h.x + (h.w - 1) / 2, h.y + (h.h - 1) / 2);
    const r = h.radius + Math.max(h.w, h.h) / 2;
    if (h.badge) { // fun-corner: 고스트 위 갈색 배지 "이걸 놓으면 꽃길 완성"
      const badge = new Container();
      const l = label(h.badge, 10);
      l.anchor.set(0.5, 1);
      const bg = new Graphics().roundRect(-l.width / 2 - 5, -l.height - 3, l.width + 10, l.height + 4, 3).fill({ color: 0x6b3d1e, alpha: 0.92 }).stroke({ color: 0xf6e7c6, width: 1 });
      badge.addChild(bg, l);
      badge.position.set(c.sx, c.sy - r * (ISO_H / 2) * Math.SQRT2 - 64); // 고스트 이름·입지 배지(전망·바람) 두 줄 위로
      badge.zIndex = 1e6 - 1;
      this.overlay.addChild(badge);
      this.rangeBadge = badge;
    }
    // 셀 공간의 원 → 아이소 타원 (rx = R·32·√2, ry = R·16·√2)
    this.rangeGfx.ellipse(c.sx, c.sy, r * (ISO_W / 2) * Math.SQRT2, r * (ISO_H / 2) * Math.SQRT2).fill({ color: 0x5ad1ff, alpha: 0.18 }).stroke({ color: 0x2aa7e0, width: 2, alpha: 0.9 });
    for (const m of h.marks) {
      const mc = cellCenter(m.x + (m.w - 1) / 2, m.y + (m.h - 1) / 2);
      const y = mc.sy - 44;
      this.rangeMarks.circle(mc.sx, y, 9).fill({ color: 0xfff3b0, alpha: 0.95 }).stroke({ color: 0xd08a00, width: 2 });
      this.rangeMarks.circle(mc.sx, y, 4).stroke({ color: 0xd08a00, width: 2 });
    }
  }

  /** 선택 칸 마름모: 일괄 철거(빨강, 기본) · 길·담 두 번 탭 미리보기(파랑, ease). 빈 배열이면 지운다. strong 칸(시작 칸)은 더 진하게 */
  setRectCells(cells: { x: number; y: number }[], color = RECT_COLOR_REMOVE, strong?: { x: number; y: number } | null) {
    if (this.rectGfx.destroyed) return;
    this.rectGfx.clear();
    for (const cell of cells) {
      const { sx, sy } = cellToScreen(cell.x, cell.y);
      const isStrong = !!strong && strong.x === cell.x && strong.y === cell.y;
      this.rectGfx.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color, alpha: isStrong ? 0.6 : 0.35 }).stroke({ color, width: isStrong ? 3 : 2 });
    }
  }

  /** 러시 타임 자리 표시 (rush-battle §2 조작): `fit` 금색 = 맨 앞 손님한테 잘 맞는 자리(+8점) ·
   *  `ok` 초록 = 앉힐 수는 있다 · `no` 회색 = 못 앉힌다 · `urgent` 빨강 = 주문이 밀렸다.
   *  빨간 칸·금색 칸은 render 루프에서 깜빡인다. 빈 배열이면 지운다. 같은 내용이면 다시 그리지 않는다. */
  setRushMarks(marks: { x: number; y: number; w: number; h: number; kind: 'ok' | 'no' | 'urgent' | 'fit' }[]) {
    if (this.rushGfx.destroyed || this.rushUrgentGfx.destroyed) return;
    const key = marks.map((m) => `${m.x},${m.y},${m.w},${m.h},${m.kind}`).join('|');
    if (key === this.rushKey) return;
    this.rushKey = key;
    this.rushGfx.clear();
    this.rushUrgentGfx.clear();
    this.rushUrgent = false;
    for (const m of marks) {
      const urgent = m.kind === 'urgent';
      const g = urgent || m.kind === 'fit' ? this.rushUrgentGfx : this.rushGfx; // 금색도 깜빡여서 눈에 먼저 들어오게
      const color = m.kind === 'fit' ? 0xf2b134 : m.kind === 'ok' ? 0x4c9a2a : urgent ? 0xc9184a : 0x8b8378;
      const alpha = m.kind === 'no' ? 0.2 : m.kind === 'fit' ? 0.55 : 0.4;
      for (let dy = 0; dy < Math.max(1, m.h); dy++) for (let dx = 0; dx < Math.max(1, m.w); dx++) {
        const { sx, sy } = cellToScreen(m.x + dx, m.y + dy);
        g.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2])
          .fill({ color, alpha })
          .stroke({ color, width: m.kind === 'no' ? 2 : m.kind === 'fit' ? 4 : 3 });
      }
      if (urgent || m.kind === 'fit') this.rushUrgent = true;
    }
    if (!this.rushUrgent) this.rushUrgentGfx.alpha = 1;
  }

  /** 러시 fx: 칸 위로 떠오르는 짧은 문구(`+12`·「콤보!」). 점수·콤보처럼 손맛을 알리는 데만 쓴다. */
  popText(cellX: number, cellY: number, text: string, color = 0xffe066) {
    if (this.overlay.destroyed) return;
    const now = performance.now();
    const c = new Container();
    const l = label(text, 13);
    l.anchor.set(0.5, 1);
    l.style.fill = color;
    const bg = new Graphics().roundRect(-l.width / 2 - 4, -l.height - 2, l.width + 8, l.height + 4, 4).fill({ color: 0x000000, alpha: 0.55 });
    c.addChild(bg, l);
    const { sx, sy } = cellCenter(cellX, cellY);
    c.position.set(sx, sy - 30);
    c.zIndex = 1e6;
    this.overlay.addChild(c);
    this.pops.push({ node: c, born: now, y0: sy - 30 });
  }

  /** 시설 위 인기 미니 바(6px)·◎ 콤보 마크 켜기/끄기 (§5.4 설정 토글) */
  setGauges(on: boolean) {
    this.gaugesOn = on;
    if (!on && !this.gaugeGfx.destroyed) { this.gaugeGfx.clear(); this.gaugeKey = ''; }
  }

  /** ui3 「맵 위 표시 최소화」: 인기 바·Lv 배지를 숨기고 문제 표시(공사·고장·낡음)만 남긴다 */
  setMapMinimal(on: boolean) {
    if (this.mapMinimal === on) return;
    this.mapMinimal = on;
    if (!this.gaugeGfx.destroyed) { this.gaugeGfx.clear(); this.gaugeKey = ''; }
    for (const entry of this.objNodes.values()) entry.node.getChildByLabel('lv')?.destroy({ children: true });
  }

  /** 셀 → 브라우저 클라이언트 좌표 (발자국 앞 꼭짓점). 고스트 밑 ✓↻ DOM 버튼 위치용 */
  cellToClient(x: number, y: number, w = 1, h = 1): { left: number; top: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const { sx, sy } = footAnchor(x, y, w, h);
    return { left: rect.left + this.world.x + sx * this.world.scale.x, top: rect.top + this.world.y + sy * this.world.scale.y };
  }

  /** 카메라를 셀 중심에 맞춘다 (🏠 본관으로, §5.6: 줌 1.5) */
  focusCell(x: number, y: number, w = 1, h = 1, scale = 1.5) {
    const width = this.app.screen.width || this.hostWidth;
    const height = this.app.screen.height;
    const c = cellCenter(x + (w - 1) / 2, y + (h - 1) / 2);
    this.world.scale.set(scale);
    this.world.position.set(width / 2 - c.sx * scale, height / 2 - c.sy * scale);
  }

  /** ui3 정보 밀도: 시설 하나에는 상시 표시를 하나만.
   *  우선순위는 손님이 못 감(빨간 ✕) > 공사(머리 위 ⏳ 배지) > 고장 > 낡음 > 인기 바.
   *  「맵 위 표시 최소화」면 인기 바를 빼고 문제 표시만 남긴다. */
  private syncGauges(state: GameState, now: number) {
    if (this.gaugeGfx.destroyed) return;
    if (now - this.gaugeAt < 1000) return;
    this.gaugeAt = now;
    const ids = Object.keys(state.objects);
    const key = `${state.tick >> 6}:${ids.length}:${layoutKey(state)}:${this.gaugesOn ? 'g' : ''}${this.mapMinimal ? 'm' : ''}:u${this.unreachIds.size}`;
    if (key === this.gaugeKey) return;
    this.gaugeKey = key;
    this.gaugeGfx.clear();
    for (const o of Object.values(state.objects)) {
      const def = objectDef(o.type);
      const blocked = this.unreachIds.has(o.id);
      if (blocked) {
        // 손님이 못 가는 시설: 머리 위 빨간 원 + 흰 ✕ (다른 표시는 전부 접는다)
        const size = sizeOf(o);
        const fa = footAnchor(o.x, o.y, size.w, size.h);
        const gc = this.footCenter(o, size.w, size.h);
        const cy = fa.sy - Math.min(48, this.objNodes.get(o.id)?.sprite?.height ?? 40) - 12;
        this.gaugeGfx.circle(gc.sx, cy, 9).fill({ color: 0xd63a52 }).stroke({ color: 0xffffff, width: 2 });
        this.gaugeGfx.moveTo(gc.sx - 4, cy - 4).lineTo(gc.sx + 4, cy + 4).moveTo(gc.sx + 4, cy - 4).lineTo(gc.sx - 4, cy + 4).stroke({ color: 0xffffff, width: 2 });
        continue;
      }
      if (o.build || (def.kind !== 'seat' && def.kind !== 'facility')) continue; // 공사 배지가 다음 — 게이지를 겹치지 않는다
      const st = objectStats(state, o.id);
      const broken = isStopped(state, o);
      const worn = !broken && st.wear > 0;
      if (!broken && !worn && (this.mapMinimal || !this.gaugesOn)) continue;
      const gc = this.footCenter(o, def.w, def.h);
      // 스프라이트 위 (발자국 앞 꼭짓점 − 스프라이트 높이)
      const fa = footAnchor(o.x, o.y, def.w, def.h);
      const y = fa.sy - Math.min(48, this.objNodes.get(o.id)?.sprite?.height ?? 40) - 10; // 키 큰 스프라이트(파라솔)는 중간 높이에
      const W = 24;
      this.gaugeGfx.roundRect(gc.sx - W / 2 - 2, y - 2, W + 4, 10, 2).fill({ color: 0x3b1f0e, alpha: 0.85 }).stroke({ color: 0xf6e7c6, width: 1, alpha: 0.9 });
      if (broken) {
        // 고장: 빨간 칸 + 흰 ✕
        this.gaugeGfx.rect(gc.sx - W / 2, y, W, 6).fill({ color: 0xff5a7a });
        this.gaugeGfx.moveTo(gc.sx - 4, y + 1).lineTo(gc.sx + 4, y + 5).moveTo(gc.sx + 4, y + 1).lineTo(gc.sx - 4, y + 5).stroke({ color: 0xffffff, width: 2 });
      } else if (worn) {
        // 낡음: 주황 칸 + 빗금 두 줄
        this.gaugeGfx.rect(gc.sx - W / 2, y, W, 6).fill({ color: 0xffa23a });
        this.gaugeGfx.moveTo(gc.sx - 6, y + 6).lineTo(gc.sx - 1, y).moveTo(gc.sx + 1, y + 6).lineTo(gc.sx + 6, y).stroke({ color: 0x5a3a06, width: 2 });
      } else {
        const pct = Math.max(0, Math.min(1, st.popularity / GAUGE_MAX));
        this.gaugeGfx.rect(gc.sx - W / 2, y, Math.max(1, W * pct), 6).fill({ color: pct >= 0.66 ? 0x6fd43a : pct >= 0.33 ? 0xffc85c : 0xff5a7a });
      }
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
    if (!this.tilesBuilt) {
      this.buildTiles(state, season);
      this.fitCamera(state);
    } else if (season !== this.lastSeason) {
      this.retintTiles(state, season);
    }
    this.syncTerrain(state, season);
    this.background.sync(state);
    const now = performance.now();
    this.background.tick(now);
    if (this.ownedKey !== state.parcels.filter((p) => p.owned).map((p) => p.id).join(',')) this.updateBounds(state); // 땅을 사면 카메라 범위가 그만큼 열린다
    this.syncLocked(state, now);
    this.syncWalls(state);
    this.syncBus(state, now);
    // 시계에 hour가 있는 브랜치(2B-1)와 없는 브랜치 모두에서 동작하도록 정오를 기본값으로
    this.nightAlpha = nightAlpha((state.clock as { hour?: number }).hour ?? 12);
    this.syncObjects(state, now);
    this.syncEntryMarkers(state);
    this.syncCornerSigns(state);
    this.syncGuests(state, now);
    this.syncStaff(state, now);
    this.syncFx(state, now);
    this.tickFx(now);
    this.drawNight();
    this.syncSiteOverlay(state);
    this.syncGhostSite(state);
    this.syncGauges(state, now);
    // 러시: 주문이 밀린 자리(빨강)는 0.6초 주기로 숨을 쉰다 — 「지금 저기를 눌러라」가 한눈에
    if (this.rushUrgent && !this.rushUrgentGfx.destroyed) this.rushUrgentGfx.alpha = 0.55 + 0.45 * Math.abs(Math.sin((now / 600) * Math.PI));
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
    // 본관 자체를 놓을 땐 주방 거리가 없다 (w-start) → 「주방 —」
    const badgeText = siteBadgeText(siteOf(state, g.x, g.y));
    const l = label(badgeText, 10);
    l.anchor.set(0.5, 1);
    const top = cost ? cost.y - cost.height - 3 : -(sp?.height ?? 24) - 4;
    l.position.set(0, top);
    const bg = new Graphics().roundRect(-l.width / 2 - 3, top - l.height - 1, l.width + 6, l.height + 2, 3).fill({ color: 0x000000, alpha: 0.6 });
    badge.addChild(bg, l);
    c.addChild(badge);
  }

  /** 첫 렌더: 폰에서 ×2 근처 줌, 카페 본관(없으면 시작 필지)을 화면 가운데 조금 위에 놓는다 — 시작하자마자 가게가 보이게. */
  private fitCamera(state: GameState) {
    const width = this.app.screen.width || this.hostWidth;
    const height = this.app.screen.height || 640;
    const s = Math.min(3, Math.max(2.2, width / 360)); // [코어만] 폰에서 카페가 콩알만 하게 보이던 것 — 기본 줌을 올린다
    this.world.scale.set(s);
    // [코어만] 본관 한가운데가 아니라 **카페 전체(본관 + 손님이 쓰는 시설)의 한가운데**에 맞춘다 —
    // 본관만 보면 그 아래 깔린 테이블이 화면 왼쪽 밖으로 잘려 나갔다.
    const main = mainBuilding(state);
    if (main) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const grow = (ox: number, oy: number, w: number, h: number) => {
        x0 = Math.min(x0, ox); y0 = Math.min(y0, oy);
        x1 = Math.max(x1, ox + w - 1); y1 = Math.max(y1, oy + h - 1);
      };
      const ms = sizeOf(main);
      grow(main.x, main.y, ms.w, ms.h);
      for (const o of Object.values(state.objects)) {
        if (o.id === main.id || o.type === 'stonewall' || o.type === 'busstop') continue;
        if (!parcelAt(state, o.x, o.y)?.owned) continue; // 내 땅 위의 것만 — 남의 필지 나무·샘까지 세면 빈 들판을 비춘다
        const sz = sizeOf(o);
        grow(o.x, o.y, sz.w, sz.h);
      }
      const c = cellCenter((x0 + x1) / 2, (y0 + y1) / 2);
      this.world.position.set(width / 2 - c.sx * s, height * 0.46 - c.sy * s);
      return;
    }
    const home = state.parcels.find((p) => p.no === 1) ?? { x: 0, y: 0, w: state.grid.w, h: state.grid.h };
    const centerX = ((home.x + home.w / 2) - (home.y + home.h / 2)) * (ISO_W / 2); // 필지 바운딩 박스 가로 중심(월드)
    const top = cellToScreen(home.x, home.y).sy;
    this.world.position.set(width / 2 - centerX * s, WORLD_OFFSET_Y - top * s);
  }

  /** 미소유 필지(트랙 E): 어두운 덮개 대신 제주 풍경(필지 특징에 맞는 밭 타일 + 소품) + 이름 팻말. 사면 1초에 걷히고 랜드마크만 남는다. */
  private syncLocked(state: GameState, now: number) {
    const alive = new Set<string>();
    for (const p of state.parcels) {
      if (p.owned) continue;
      alive.add(p.id);
      const sc = parcelScenery(p.id);
      // [코어만] 팻말은 「지금 살 수 있는 땅」에만 — 다섯 개가 한꺼번에 떠서 제 카페를 가렸다. 풍경 타일은 그대로 둔다.
      // zero-base: 경쟁 카페가 서 있는 땅은 그 카페 이름·동네 순위를 팻말로 (미개봉 땅이 「누구 땅인지」 읽히게)
      const buyable = canBuyParcel(state, p.id).ok;
      const rival = rivalOnParcel(state, p.id);
      const rank = rival ? rivalsState(state).cafes[rival.id]?.rank ?? null : null;
      const [l1, l2] = rival ? [`${rival.name}${rank ? ` · 동네 ${rank}위` : ''}`, buyable ? parcelSignLines(p.name, parcelPrice(state, p), sc?.feature ?? '')[1] : '']
        : buyable ? parcelSignLines(p.name, parcelPrice(state, p), sc?.feature ?? '') : ['', ''];
      const zoomOut = true; // [코어만] 팻말은 늘 한 줄·작게 — 두 줄짜리가 제 카페 본관을 덮었다
      const text = `${l1}|${l2}|${zoomOut ? 'z' : ''}`; // 미소유 필지엔 시설을 못 놓으니 배치 서명은 키에 안 넣는다(매 프레임 재생성 방지)
      const cur = this.lockedNodes.get(p.id);
      if (cur?.text === text) continue;
      if (cur && cur.text.split('|').slice(0, 2).join('|') === `${l1}|${l2}`) {
        // 줌 모드만 바뀜: 팻말만 갈아 끼운다 (풍경 타일·소품은 그대로)
        const pos = cur.sign.position.clone();
        cur.sign.destroy({ children: true });
        cur.sign = this.parcelSign(l1 ? (zoomOut ? [l1] : [l1, l2]) : [], zoomOut);
        cur.sign.position.copyFrom(pos);
        this.signs.addChild(cur.sign);
        cur.text = text;
        continue;
      }
      if (cur) destroyScenery(cur, false);
      this.lockedNodes.set(p.id, this.makeSceneryNode(state, p, l1 ? (zoomOut ? [l1] : [l1, l2]) : [], text, zoomOut));
    }
    for (const [id, entry] of this.lockedNodes) {
      if (alive.has(id)) continue;
      // 샀다: 페이드 시작 (팻말은 바로 치운다)
      entry.sign.destroy({ children: true });
      entry.fadeFrom = now;
      this.fadingScenery.push(entry);
      this.lockedNodes.delete(id);
    }
    if (this.fadingScenery.length) {
      this.fadingScenery = this.fadingScenery.filter((e) => {
        const k = (now - (e.fadeFrom ?? now)) / SCENERY_FADE_MS;
        if (k >= 1) {
          destroyScenery(e, true);
          // fun-rank: 풍경이 다 걷히면 필지 가운데 반짝(랜드마크 등장)
          if (e.center) for (const [dx, dy] of [[0, 0], [-1.5, -0.5], [1.5, -0.5], [0, 1]] as const) this.spawnSparkleAt(e.center.sx + dx * 20, e.center.sy + dy * 14, now);
          return false;
        }
        e.tiles.alpha = 1 - k;
        for (const p of e.props) if (!p.keep) p.node.alpha = 1 - k;
        return true;
      });
    }
    // 남은 랜드마크: 그 칸에 시설이 놓이면 사라진다
    for (const e of this.fadingScenery) this.hideCoveredLandmarks(state, e);
    for (const e of this.lockedNodes.values()) this.hideCoveredLandmarks(state, e);
    this.syncSignMask();
    // 팻말은 줌아웃해도 읽히게 화면 크기를 유지한다(월드 배율 1.4 아래에서 키움)
    const k = signScale(this.world.scale.x);
    for (const e of this.lockedNodes.values()) e.sign.scale.set(k);
    for (const l of this.entryLabels.values()) l.scale.set(k);
    for (const e of this.lockedNodes.values()) this.keepSignOnParcel(e);
  }

  /** 팻말을 **제 필지 안 · 보이는 맵 띠 안**에 붙잡아 둔다.
   *  필지가 화면 밖으로 밀리면 팻말도 같이 나간다 — 화면 가장자리에 걸쳐 떠 있는 것처럼 보이지 않게. */
  private keepSignOnParcel(e: SceneryEntry) {
    const box = e.box;
    if (!box || e.sign.destroyed) return;
    const sc = this.world.scale.x;
    const w = this.app.screen.width || this.hostWidth;
    const h = this.app.screen.height;
    if (!w || !h || sc <= 0) return;
    // 보이는 맵 띠를 월드 좌표로
    const pad = 6 / sc;
    const visL = (0 - this.world.x) / sc + pad;
    const visR = (w - this.world.x) / sc - pad;
    const visT = (this.mapInsets.top - this.world.y) / sc + pad;
    const visB = (h - this.mapInsets.bottom - this.world.y) / sc - pad;
    const halfW = e.sign.width / 2;
    const tall = e.sign.height;
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? v : Math.min(hi, Math.max(lo, v)));
    e.sign.position.set(
      clamp(e.center!.sx, Math.max(box.x0, visL + halfW), Math.min(box.x1, visR - halfW)),
      clamp(e.center!.sy - 2, Math.max(box.y0, visT + tall), Math.min(box.y1, visB)),
    );
  }

  /** 상단 2줄·하단 바가 가리지 않는 맵 띠를 App이 알려 준다 (팻말 잘라내기용). */
  setMapInsets(top: number, bottom: number) {
    this.mapInsets = { top, bottom };
    this.syncSignMask();
  }

  /** 팻말 레이어를 맵 띠(화면 좌표)로 자른다. 크기가 그대로면 다시 그리지 않는다. */
  private syncSignMask() {
    const w = this.app.screen.width || this.hostWidth;
    const h = this.app.screen.height;
    if (!w || !h) return;
    const top = this.mapInsets.top;
    const height = Math.max(0, h - top - this.mapInsets.bottom);
    const key = `${w}:${top}:${height}`;
    if (this.signMaskRect === key) return;
    this.signMaskRect = key;
    this.signMask.clear().rect(0, top, w, height).fill(0xffffff);
  }

  private hideCoveredLandmarks(state: GameState, e: SceneryEntry) {
    for (const p of e.props) {
      if (!p.keep || p.node.destroyed) continue;
      p.node.visible = !p.cells.some((c) => objectAtCell(state, c.x, c.y));
    }
  }
  /** 팻말(갈색 나무판 + 크림 글자, 1~2줄). 원점은 판 아래 중앙. */
  private signNode(lines: string[], size = 10): Container {
    const c = new Container();
    const texts = lines.map((t, i) => { const l = label(t, i === 0 ? size + 1 : size); l.anchor.set(0.5, 0); l.tint = SIGN_TEXT; return l; });
    const w = Math.max(...texts.map((t) => t.width)) + 12;
    const h = texts.reduce((a, t) => a + t.height, 0) + 8;
    // uifix: 땅에 박힌 말뚝과 그림자를 또렷하게 — 팻말이 화면에 떠 있는 UI가 아니라 맵에 꽂힌 것으로 읽히게
    const bg = new Graphics().ellipse(0, 11, 9, 3).fill({ color: 0x000000, alpha: 0.22 })
      .rect(-2, -2, 4, 13).fill(SIGN_EDGE)
      .roundRect(-w / 2, -h, w, h, 3).fill({ color: SIGN_FILL }).stroke({ color: SIGN_EDGE, width: 2 });
    c.addChild(bg);
    let y = -h + 4;
    for (const t of texts) { t.position.set(0, y); y += t.height; c.addChild(t); }
    return c;
  }

  /** 필지 이름 팻말 — 줌아웃이면 작은 글자 한 줄 */
  private parcelSign(lines: string[], small: boolean): Container {
    const sign = this.signNode(lines, small ? 8 : 10);
    sign.label = 'parcel-label';
    return sign;
  }
  private makeSceneryNode(state: GameState, p: Parcel, lines: string[], text: string, small = false): SceneryEntry {
    const sc = parcelScenery(p.id);
    const tiles = new Container();
    const fillTex = sc && hasAssets() ? peekTex(`iso_tile_field_${sc.fill}`) : null;
    const g = fillTex ? null : new Graphics();
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        if (cellTerrain(state, x, y) === 'road') continue; // 마을 길은 그대로 보인다
        const { sx, sy } = cellToScreen(x, y);
        if (fillTex) {
          const sp = new Sprite(fillTex);
          sp.anchor.set(0.5, 0);
          sp.position.set(sx, sy);
          tiles.addChild(sp);
        } else {
          g!.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color: LOCKED_COLOR, alpha: LOCKED_ALPHA });
        }
      }
    }
    if (g) tiles.addChild(g);
    this.tiles.addChild(tiles);
    // 소품: 길·진입점·시작부터 놓인 시설과 겹치는 것은 뺀다. actors에 두어 손님·시설과 깊이 정렬.
    const props: SceneryEntry['props'] = [];
    // zero-base: 경쟁 카페 건물(별관 스프라이트 4×3)을 필지 가운데 위쪽에 — 그 칸과 겹치는 풍경 소품은 뺀다
    const rival = rivalOnParcel(state, p.id);
    const rivalProp: SceneryProp | null = rival ? { type: 'annex_cafe', x: Math.floor((p.w - 4) / 2), y: 2, w: 4, h: 3 } : null;
    const taken = new Set<string>();
    for (const pr of [...(rivalProp ? [rivalProp] : []), ...(sc?.props ?? [])]) {
      const w = pr.w ?? 1, h = pr.h ?? 1;
      const cells: { x: number; y: number }[] = [];
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push({ x: p.x + pr.x + dx, y: p.y + pr.y + dy });
      if (cells.some((c) => c.x >= p.x + p.w || c.y >= p.y + p.h || cellTerrain(state, c.x, c.y) !== 'soil' || objectAtCell(state, c.x, c.y) || isEntryCell(c.x, c.y) || taken.has(`${c.x},${c.y}`))) continue;
      for (const c of cells) taken.add(`${c.x},${c.y}`);
      const node = this.sceneryPropNode(pr, p.x + pr.x, p.y + pr.y, w, h);
      if (!node) continue;
      this.actors.addChild(node);
      props.push({ node, keep: !!pr.keep, cells });
    }
    // 이름 팻말: 필지 가운데, signs 레이어(시설·캐릭터 위 · 화면 밖은 잘린다)
    const center = cellCenter(p.x + (p.w - 1) / 2, p.y + (p.h - 1) / 2);
    const sign = this.parcelSign(lines, small);
    sign.position.set(center.sx, center.sy - 2);
    this.signs.addChild(sign);
    // 필지 네 꼭짓점의 월드 좌표 → 팻말이 돌아다녀도 되는 상자
    const cs = [cellCenter(p.x, p.y), cellCenter(p.x + p.w - 1, p.y), cellCenter(p.x, p.y + p.h - 1), cellCenter(p.x + p.w - 1, p.y + p.h - 1)];
    const box = { x0: Math.min(...cs.map((v) => v.sx)), x1: Math.max(...cs.map((v) => v.sx)), y0: Math.min(...cs.map((v) => v.sy)), y1: Math.max(...cs.map((v) => v.sy)) };
    return { tiles, props, sign, text, fadeFrom: null, center, box };
  }

  private sceneryPropNode(pr: SceneryProp, x: number, y: number, w: number, h: number): Container | null {
    const t = hasAssets() ? peekTex(spriteName.isoObject(SPRITE_ALIAS[pr.type] ?? pr.type)) : null;
    if (!t) return null;
    const c = new Container();
    c.label = `scenery-${pr.type}`;
    const { sx, sy } = footAnchor(x, y, w, h);
    c.position.set(sx, sy);
    c.zIndex = depth(x, y, w, h) + 1e-3;
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);
    c.addChild(sp);
    return c;
  }

  /** 필지 경계 낮은 돌담선(장식, 통행 무관): 내 땅 범위와 미소유 필지 경계가 보인다. 소유·길이 바뀔 때만 다시 만든다. */
  private syncWalls(state: GameState) {
    const key = `${state.parcels.map((p) => (p.owned ? 1 : 0)).join('')}|${layoutKey(state)}|${hasAssets() ? 1 : 0}`;
    if (key === this.wallKey) return;
    this.wallKey = key;
    for (const n of this.wallNodes) n.destroy({ children: true });
    this.wallNodes = [];
    const ne = hasAssets() ? peekTex(spriteName.isoObject('wall_ne')) : null;
    const nw = hasAssets() ? peekTex(spriteName.isoObject('wall_nw')) : null;
    if (!ne || !nw) return;
    const edges = wallEdges(state.grid.w, state.grid.h, state.parcels, (x, y) => cellTerrain(state, x, y) === 'road');
    for (const e of edges) {
      const sp = new Sprite(e.axis === 'ne' ? ne : nw);
      sp.anchor.set(0.5, 1);
      const { sx, sy } = footAnchor(e.x, e.y, 1, 1);
      sp.position.set(sx, sy);
      sp.zIndex = e.x + e.y - 0.5; // 뒤 칸 내용 뒤, 이 칸 내용 앞
      sp.label = 'wall';
      this.actors.addChild(sp);
      this.wallNodes.push(sp);
    }
  }

  /** 마을 버스 애니(렌더 전용): 마을 길을 따라 서쪽 링에서 들어와 정류장에 5초 서고(손님 내리는 반짝임) 동쪽으로 나간다. */
  private syncBus(state: GameState, now: number) {
    const lk = layoutKey(state);
    if (lk !== this.busStopKey) {
      this.busStopKey = lk;
      const stop = Object.values(state.objects).find((o) => o.type === 'busstop');
      this.busStop = stop ? { x: stop.x, y: stop.y } : null;
    }
    if (!this.busStop) { if (this.bus) this.bus.visible = false; return; }
    if (!this.bus) {
      const t = hasAssets() ? peekTex(spriteName.isoObject('bus_0')) : null;
      if (!t) return;
      this.bus = new Sprite(t);
      this.bus.anchor.set(0.5, 1);
      this.bus.label = 'bus';
      this.actors.addChild(this.bus);
    }
    const y = VILLAGE_ROAD_Y;
    const pose = busPose(now, this.busStop.x - 1, state.grid.w); // 2칸 버스의 앞이 정류장 칸에 닿게
    this.bus.visible = pose.visible;
    if (!pose.visible) return;
    const { sx, sy } = footAnchor(pose.x, y, 2, 1);
    this.bus.position.set(sx, sy);
    this.bus.zIndex = depth(pose.x, y, 2, 1) + 0.4;
    const frame = pose.moving ? Math.floor(now / BUS_FRAME_MS) % 2 : 0;
    const t = peekTex(spriteName.isoObject(`bus_${frame}`));
    if (t && this.bus.texture !== t) this.bus.texture = t;
    const cycle = Math.floor(now / BUS_PERIOD_MS);
    if (!pose.moving && cycle !== this.busDropCycle && now % BUS_PERIOD_MS >= BUS_DROP_AT_MS) {
      this.busDropCycle = cycle;
      this.spawnSparkle(this.busStop.x, this.busStop.y, now);
    }
  }

  private tileTexture(state: GameState, i: number, season: Season): Texture {
    const cell = state.grid.cells[i]!;
    return (hasAssets() ? tex(spriteName.isoTile(cell.terrain, season)) : null) ?? isoTerrainTexture(this.app.renderer, cell.terrain);
  }

  /** 지형·계절이 바뀌면 타일 텍스처를 갱신한다 */
  private syncTile(state: GameState, i: number, season: Season) {
    const sp = this.tileSprites[i];
    if (!sp) return;
    sp.texture = this.tileTexture(state, i, season);
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
    this.updateBounds(state);
    this.tilesBuilt = true;
    this.lastSeason = season;
  }

  /** 카메라가 갈 수 있는 범위 = **산 땅**(+마을 길 한 줄)에 여유 한 칸.
   *  격자는 3×3 필지(30×24)인데 시작 땅은 그중 한 칸이다. 격자 전체를 경계로 두니 화면이 빈 흙에 잠겨
   *  「맵이 너무 넓고 쓸데없다」가 됐다. 산 땅만 보이게 조이면 마당이 꽉 차 보이고, 땅을 사면 그만큼 열린다
   *  (영상: 화면 가장자리 노란 화살표 — 밖에 더 있다). */
  private ownedKey = '';
  private updateBounds(state: GameState) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y < state.grid.h; y++) for (let x = 0; x < state.grid.w; x++) {
      if (!parcelAt(state, x, y)?.owned) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = state.grid.w - 1; y1 = state.grid.h - 1; }
    const m = BOUNDS_OWNED_MARGIN;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(state.grid.w - 1, x1 + m); y1 = Math.min(state.grid.h - 1, y1 + m);
    // 아이소 화면 좌표의 바운딩 박스: 네 모서리 칸을 화면으로 옮겨 감싼다
    const corners = [cellToScreen(x0, y0), cellToScreen(x1 + 1, y0), cellToScreen(x0, y1 + 1), cellToScreen(x1 + 1, y1 + 1)];
    const sx0 = Math.min(...corners.map((c) => c.sx)), sx1 = Math.max(...corners.map((c) => c.sx));
    const sy0 = Math.min(...corners.map((c) => c.sy)), sy1 = Math.max(...corners.map((c) => c.sy));
    this.bounds = { x: sx0, y: sy0 - BOUNDS_TOP_PAD, w: sx1 - sx0, h: sy1 - sy0 + BOUNDS_TOP_PAD };
    this.ownedKey = state.parcels.filter((p) => p.owned).map((p) => p.id).join(',');
  }

  /** 계절이 바뀌면 타일 텍스처만 교체한다 */
  private retintTiles(state: GameState, season: Season) {
    for (let i = 0; i < this.tileSprites.length; i++) this.syncTile(state, i, season);
    this.lastSeason = season;
  }

  /** 지형이 바뀐 칸만 갱신 (마지막으로 그린 지형을 기억 — 옛 세이브 로드 등) */
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
    const { w, h } = sizeOf(o);
    const c = new Container();
    const { sx, sy } = footAnchor(o.x, o.y, w, h);
    c.position.set(sx, sy);
    c.zIndex = this.depthOf(state, o.x, o.y, w, h);
    if (def.room) c.addChild(this.doorMarker(o, { sx, sy }));
    let glow: Sprite | null = null;
    if (o.type in LIGHT_RADIUS || GLOW_EXTRA_TYPES.has(o.type)) {
      glow = new Sprite(glowTexture(this.app.renderer));
      glow.anchor.set(0.5, 0.5);
      glow.blendMode = 'add';
      const gc = this.footCenter(o, w, h);
      glow.position.set(gc.sx, gc.sy - 10);
      glow.scale.set(glowScale(o.type, w, h));
      glow.alpha = 0;
      this.lights.addChild(glow);
    }
    const t = objectTex(o);
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

  /** 건설 중: 반투명 + 머리 위 망치 아이콘과 "N일" 배지 (오버레이 레이어 — 본관 같은 큰 이웃 뒤에 숨지 않게). 남은 날이 바뀔 때만 다시 그린다.
   *  seatfix: 공사 중이 아니어도 예약(pending)이 걸려 있으면 같은 자리에 시계 아이콘 + "예약" 배지를 띄운다. */
  private syncBuilding(entry: ObjEntry, o: PlacedObject, state: GameState) {
    const left = o.build ? Math.max(0, o.build.doneDay - dayIndex(state.clock)) : 0;
    // 상시 표시는 하나만 (ui3 우선순위): 손님이 못 감 ✕ > 공사 「N일」 > 예약 「예약」
    const blocked = this.unreachIds.has(o.id); // ui3: 손님이 못 가는 시설은 살짝 어둡게, 머리 위 배지는 ✕에 양보한다
    const mark = o.build ? `b${left}` : o.pending ? `p${o.pending.kind}` : ''; // seatfix: 예약도 같은 자리에 배지를 낸다
    const key = mark ? `${mark}:${o.x},${o.y}${blocked ? ':x' : ''}` : blocked ? 'x' : '';
    if (entry.buildKey === key) return;
    entry.buildKey = key;
    entry.badge?.destroy({ children: true });
    entry.badge = null;
    entry.node.alpha = o.build ? BUILDING_ALPHA : blocked ? UNREACHABLE_ALPHA : 1;
    if (!mark || blocked) return;
    const size = sizeOf(o);
    const gc = this.footCenter(o, size.w, size.h);
    const top = gc.sy - (entry.sprite?.height ?? 40) * 0.6 - 4; // 스프라이트 위쪽 언저리
    const c = new Container();
    const l = label(o.build ? `${left}일` : '예약', 10);
    l.anchor.set(0, 0.5);
    const iconTex = hasAssets() ? tex(spriteName.icon(o.build ? 'build' : 'clock')) : null;
    const iconW = iconTex ? 16 : 0;
    const w = iconW + l.width + 12;
    c.addChild(new Graphics().roundRect(-w / 2, -18, w, 18, 4).fill({ color: o.build ? 0x6b3d1e : 0xb8862a, alpha: 0.9 }));
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

  /** 증축 Lv 배지 (트랙 A): Lv2·3이면 스프라이트 오른쪽 위에 작은 "Lv2" 라벨. Lv가 바뀔 때만 다시 그린다.
   *  ui3: 공사 중이거나 「맵 위 표시 최소화」면 안 붙인다 — 한 시설 위에는 표시 하나만. */
  /** 자리 등급 배지 (A~D, seatGrade.ts). 짓기·이동 고스트가 떠 있는 동안만 — 마당을 다시 짤 때 「어느 자리가 D인가」가 한눈에 보여야 한다.
   *  평소엔 숨긴다 (열일곱 자리마다 글자가 붙어 있으면 손님이 안 보인다). */
  private syncGradeBadge(entry: ObjEntry, o: PlacedObject, state: GameState) {
    const g = this.ghostSpec && !o.build && !this.mapMinimal ? seatGrade(state, o) : null;
    const key = g ? g.grade : '';
    const prev = entry.node.getChildByLabel('grade');
    if ((prev?.label ?? '') === 'grade' && (prev as Container & { gradeKey?: string }).gradeKey === key) return;
    prev?.destroy({ children: true });
    if (!g) return;
    const c = new Container() as Container & { gradeKey?: string };
    c.label = 'grade';
    c.gradeKey = key;
    const l = label(g.grade, 11);
    l.anchor.set(0.5, 0.5);
    c.addChild(new Graphics().roundRect(-9, -9, 18, 18, 3).fill({ color: GRADE_COLOR[g.grade], alpha: 0.95 }).stroke({ color: 0xfff6e0, width: 1 }), l);
    const h = entry.sprite?.height ?? 40;
    c.position.set(-14, -h + 6);
    entry.node.addChild(c);
  }

  private syncLevelBadge(entry: ObjEntry, o: PlacedObject) {
    const lv = o.level ?? 1;
    const key = lv >= 2 && !o.build && !this.mapMinimal && !this.unreachIds.has(o.id) ? `lv${lv}` : '';
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

  /** 본관 인테리어: 외벽 색 tint + 간판 문구 라벨. fun-rank: 등급 간판 오버레이(뒤 모서리 꼭대기) + 등급별 외벽 tint(외벽 색을 안 골랐을 때) */
  private decorateCafe(entry: ObjEntry, state: GameState) {
    const grade = gradeOf(state);
    const wallColor = state.cosmetics?.wallColor ?? 0;
    if (entry.sprite) entry.sprite.tint = wallColor === 0 ? GRADE_WALL_TINT[grade] ?? 0xffffff : WALL_COLORS[wallColor] ?? 0xffffff;
    entry.node.getChildByLabel('gradesign')?.destroy({ children: true });
    const signTex = peekTex(spriteName.isoObject('warehouse', `sign_g${grade}`));
    if (signTex) {
      const { w, h } = mainSize(state);
      const gs = new Sprite(signTex);
      gs.label = 'gradesign';
      gs.anchor.set(0.5, 1);
      // 노드 원점 = 발자국 앞 꼭짓점. 뒤 꼭짓점은 x=(h−w)·32, y=−(w+h)·16, 그 위로 벽 높이(+2층 띠)만큼
      gs.position.set((h - w) * (ISO_W / 2), -(w + h) * (ISO_H / 2) - mainWallTop(state) + 2);
      entry.node.addChild(gs);
    }
    // 대회 입상 배지: 등급 간판 위 금별 리본 (contest.ts badge — 1위 6개월·입상 3개월, 지나면 사라진다)
    entry.node.getChildByLabel('contestbadge')?.destroy({ children: true });
    const badge = contestBadge(state);
    if (badge) {
      const size = mainSize(state);
      const c = new Container();
      c.label = 'contestbadge';
      const l = label(`★ ${badge}`, 9);
      l.anchor.set(0.5, 1);
      l.position.set(0, -(size.w + size.h) * (ISO_H / 2) - mainWallTop(state) - 16);
      const bg = new Graphics().roundRect(l.x - l.width / 2 - 4, l.y - l.height - 1, l.width + 8, l.height + 2, 3).fill({ color: 0xd4a13c, alpha: 0.95 });
      c.addChild(bg, l);
      entry.node.addChild(c);
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

  /** 트랙 H: 맵 가장자리 진입점 표지 5종. 잠긴 경로는 회색, 열렸지만 길이 안 이어졌으면 반투명. 배치·해금·계약이 바뀔 때만 다시 계산한다(길 연결 BFS). */
  private syncEntryMarkers(state: GameState) {
    const key = `${layoutKey(state)}|${ROUTE_IDS.map((r) => { const st = state.routes?.[r]; return st ? `${st.unlocked ? 1 : 0}${st.contract ? 1 : 0}` : '00'; }).join('')}`;
    if (key === this.entryKey) return;
    this.entryKey = key;
    for (const e of entryPoints(state)) {
      const k = `${e.unlocked}:${e.active}`;
      const cur = this.entryMarkers.get(e.route);
      if (cur?.key === k) continue;
      cur?.node.destroy({ children: true });
      const c = new Container();
      c.label = `entry-${e.route}`;
      const { sx, sy } = footAnchor(e.pos.x, e.pos.y, 1, 1);
      c.position.set(sx, sy);
      c.zIndex = this.depthOf(state, e.pos.x, e.pos.y);
      const t = hasAssets() ? peekTex(spriteName.isoObject(ROUTE_MARKER_SPRITE[e.route])) : null;
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5, 1);
        if (!e.unlocked) { sp.tint = ROUTE_LOCKED_TINT; sp.alpha = 0.75; } else if (!e.active) sp.alpha = 0.7;
        c.addChild(sp);
      } else {
        c.addChild(new Graphics().roundRect(-6, -ISO_H, 12, 12, 2).fill({ color: e.unlocked ? 0xf5f1e8 : ROUTE_LOCKED_TINT, alpha: e.active ? 1 : 0.7 }));
      }
      this.actors.addChild(c);
      this.entryMarkers.set(e.route, { node: c, key: k });
      // 잠긴 경로: 표지 위 미리 보기 팻말("주차장 자리 — 좌석 6개면 열려요"). 열리면 치운다.
      this.entryLabels.get(e.route)?.destroy({ children: true });
      this.entryLabels.delete(e.route);
      const preview = ROUTE_PREVIEW[e.route];
      if (!e.unlocked && preview) {
        const sign = this.signNode(preview, 9);
        sign.label = `entry-label-${e.route}`;
        sign.alpha = 0.85;
        sign.position.set(sx, sy - ISO_H - 26);
        this.signs.addChild(sign);
        this.entryLabels.set(e.route, sign);
      }
    }
  }

  private syncObjects(state: GameState, now: number) {
    this.unreachIds = unreachableIds(state); // ui3: 배치 서명 캐시라 배치가 바뀔 때만 다시 센다
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
    const glowAlpha = Math.min(1, (this.nightAlpha / NIGHT_MAX_ALPHA) * 0.66 * GLOW_BRIGHT); // 밤이 깊을수록 밝게, 최대 ≈0.92
    this.syncRoomLights(state, glowAlpha);
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
      this.syncGradeBadge(entry, o, state); // 자리 등급 A~D (고스트가 떠 있을 때만)
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
        const key = `${objectVariant(o, mainLevel(state)) ?? ''}:${o.rot ?? ''}${isCafe ? `:${state.cosmetics?.wallColor ?? 0}:${state.cosmetics?.sign ?? ''}:g${gradeOf(state)}:${contestBadge(state) ?? ''}` : ''}`; // fun-rank: 등급이 바뀌면 간판·외벽 갱신 · 대회 배지가 붙거나 떨어지면 다시
        if (this.badgeKeys.get(o.id) === key) continue;
        this.badgeKeys.set(o.id, key);
        const t = objectTex(o, mainLevel(state));
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
    const parts = named ? namedGuestParts(namedGuestFace(named), named.face.seed, named.regionId) : guestParts(g.faceSeed !== undefined ? regularFace(g.faceSeed) : guestFace(g.type), def.tags, def.wants); // fun-guest 훅: 단골은 seed 얼굴
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
      // 첫 주문(판매) 순간에 코인 팝 + 「+₩4,500」 숫자 + 주문 메뉴 말풍선 (game-feel: 돈이 들어오는 게 보이게 — 카이로 G9)
      if (!entry.hadMenu && g.menuId !== null) {
        entry.hadMenu = true;
        this.spawnCoin(node.x, node.y - GUEST_H - 4, now);
        if (g.paid > 0) this.spawnMoneyPop(node.x, node.y - GUEST_H - 10, g.paid, now);
        let name = '', icon = 'coffee';
        try { const def = menuOf(state, g.menuId); name = shortMenuName(def.name); icon = MENU_BUBBLE_ICON[def.category] ?? 'coffee'; } catch { /* 모르는 메뉴 id */ }
        this.showBubble(g.id, { icon: spriteName.icon(icon), text: name || undefined });
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
  /** 상성 UP (upfx.ts): 시설을 놓아 값이 오른 자리마다 `+8%`. order 차례로 UP_STAGGER_MS씩 늦게 튀어올라
   *  「한 번 놓고 우르르 칭찬받는」 박자가 된다 (video-flow §1-2 2:00). */
  spawnUp(cellX: number, cellY: number, text: string, order: number, now: number) {
    const c = new Container();
    const l = label(`${text} UP`, 11);
    l.anchor.set(0.5, 1);
    l.style.fill = 0xfff176;
    const bg = new Graphics().roundRect(-l.width / 2 - 4, -l.height - 2, l.width + 8, l.height + 4, 4).fill({ color: 0xc62828, alpha: 0.85 });
    c.addChild(bg, l);
    const { sx, sy } = cellCenter(cellX, cellY);
    c.position.set(sx, sy - 28);
    c.zIndex = 1e6;
    c.visible = false;
    this.overlay.addChild(c);
    this.pops.push({ node: c, born: now + order * UP_STAGGER_MS, y0: sy - 28 });
  }
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

  /** fun P0: 경로 도착 — 렌터카(동쪽 마을 길에서 주차장 앞)가 들어와 서고, 「렌터카 손님 3명!」 문구. 올레꾼은 걸어오니 문구만. */
  private spawnArrival(state: GameState, e: Extract<FxEvent, { kind: 'arrive' }>, now: number) {
    const name = e.route === 'parking' ? '렌터카' : '올레꾼';
    const text = e.route === 'olle' ? `올레꾼 ${e.n}명이 걸어와요` : `${name} 손님 ${e.n}명!`;
    const c = new Container();
    const l = label(text, 11);
    l.anchor.set(0.5, 1);
    l.style.fill = 0xfff2c8;
    const bg = new Graphics().roundRect(-l.width / 2 - 4, -l.height - 2, l.width + 8, l.height + 4, 3).fill({ color: 0x5a3a1a, alpha: 0.85 });
    c.addChild(bg, l);
    const { sx, sy } = cellCenter(e.x, e.y);
    c.position.set(sx, sy - 30);
    c.zIndex = 1e6;
    this.overlay.addChild(c);
    this.pops.push({ node: c, born: now, y0: sy - 30 });
    if (e.route === 'olle' || !hasAssets()) return;
    const sprite = 'route_car';
    const t = peekTex(spriteName.isoObject(sprite));
    if (!t) return;
    const entry = ENTRY_ROUTES[e.route].entry;
    const from = footAnchor(entry.x, entry.y, 1, 1);
    // 서는 자리: 시설 앞 칸 옆(도착 칸에서 진입점 쪽으로 한 칸) — 손님 위에 겹치지 않게
    const stop = { x: e.x + Math.sign(entry.x - e.x), y: e.y + Math.sign(entry.y - e.y) };
    const to = footAnchor(stop.x, stop.y, 1, 1);
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);
    sp.label = `arrive-${e.route}`;
    sp.position.set(from.sx, from.sy);
    sp.zIndex = depth(stop.x, stop.y, 1, 1) + 0.5;
    sp.scale.x = entry.x > e.x ? -1 : 1; // 동쪽에서 오면 왼쪽을 본다
    this.actors.addChild(sp);
    this.arrivals.push({ sprite: sp, born: now, from, to, flipX: entry.x > e.x });
    this.spawnSparkle(e.x, e.y, now);
  }
  private tickArrivals(now: number) {
    if (!this.arrivals.length) return;
    this.arrivals = this.arrivals.filter((a) => {
      if (a.sprite.destroyed) return false;
      const age = now - a.born;
      if (age >= ARRIVE_IN_MS + ARRIVE_STAY_MS + ARRIVE_OUT_MS) { a.sprite.destroy(); return false; }
      let k: number;
      if (age < ARRIVE_IN_MS) k = age / ARRIVE_IN_MS; // 들어옴
      else if (age < ARRIVE_IN_MS + ARRIVE_STAY_MS) k = 1; // 정차
      else { k = 1 - (age - ARRIVE_IN_MS - ARRIVE_STAY_MS) / ARRIVE_OUT_MS; a.sprite.scale.x = a.flipX ? 1 : -1; } // 되돌아 나감
      const ease = k < 1 ? 1 - (1 - k) * (1 - k) : 1;
      a.sprite.position.set(a.from.sx + (a.to.sx - a.from.sx) * ease, a.from.sy + (a.to.sy - a.from.sy) * ease);
      a.sprite.alpha = age > ARRIVE_IN_MS + ARRIVE_STAY_MS + ARRIVE_OUT_MS - 300 ? Math.max(0, (ARRIVE_IN_MS + ARRIVE_STAY_MS + ARRIVE_OUT_MS - age) / 300) : 1;
      return true;
    });
  }

  /** 「+₩n」 숫자 팝업 (결제). 화면 좌표. 한꺼번에 많이 뜨면(MONEY_POP_MAX 초과) 건너뛴다 — 코인은 그대로 뜬다 */
  private spawnMoneyPop(x: number, y0: number, amount: number, now: number) {
    if (this.pops.length >= MONEY_POP_MAX) return;
    const c = new Container();
    const l = label(`+₩${amount.toLocaleString('en-US')}`, 11);
    l.anchor.set(0.5, 1);
    l.style.fill = 0xffe066;
    const bg = new Graphics().roundRect(-l.width / 2 - 3, -l.height - 1, l.width + 6, l.height + 2, 3).fill({ color: 0x000000, alpha: 0.5 });
    c.addChild(bg, l);
    c.position.set(x, y0);
    c.zIndex = 1e6;
    this.overlay.addChild(c);
    this.pops.push({ node: c, born: now, y0 });
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
    const { sx, sy } = cellCenter(cellX, cellY);
    this.spawnSparkleAt(sx, sy, now);
  }
  /** 월드 좌표에 반짝 (fun-rank: 필지 안개 걷힘 뒤 랜드마크 등장) */
  private spawnSparkleAt(sx: number, sy: number, now: number) {
    const t = tex('fx_sparkle_0');
    if (!t) return;
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 0.5);
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
      else if (e.kind === 'up') this.spawnUp(e.x, e.y, e.text, e.order, now); // 상성 UP: 차례로 튀어오른다
      else if (e.kind === 'photo') this.spawnSparkle(e.x, e.y, now);
      else if (e.kind === 'react') this.spawnReaction(e, now);
      else if (e.kind === 'corner' || e.kind === 'flash') this.spawnCornerFx(e, now);
      else if (e.kind === 'applause') { // fun-rank: 등급 승급 — 마당 손님 전원 머리 위 하트 말풍선 + 반짝
        for (const g of state.guests) { this.spawnSparkle(Math.round(g.x), Math.round(g.y), now); this.showBubble(g.id, { mood: 'happy' }, 1500); }
      }
      else if (e.kind === 'parcel') { /* 덮개 페이드는 syncLocked(owned 전환)에서 시작한다 */ }
      else if (e.kind === 'arrive') this.spawnArrival(state, e, now);
    }
  }

  /** fun-corner 연출 하나: 명당 완성(팻말 자리 반짝 3개) · 손님 사진(카메라 플래시 + "사진 찍자!" 말풍선) */
  private spawnCornerFx(e: Extract<FxEvent, { kind: 'corner' | 'flash' }>, now: number) {
    if (e.kind === 'corner') {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]] as const) this.spawnSparkle(e.x + dx, e.y + dy, now);
      return;
    }
    const t = tex('fx_flash_0');
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 0.5);
      const { sx, sy } = cellCenter(e.x, e.y);
      sp.position.set(sx, sy - 20);
      sp.zIndex = 1e6;
      this.overlay.addChild(sp);
      this.fxQueue.push({ sprite: sp, born: now, y0: sy - 20, kind: 'flash' });
    }
    this.showBubble(e.guestId, { text: e.text }, CORNER_SAY_MS);
  }

  /** fun-corner: 완성 명당마다 닻 칸 위에 갈색 팻말 스프라이트 + 명당 이름 라벨. 배치 서명이 바뀔 때만 다시 만든다. */
  private syncCornerSigns(state: GameState) {
    const key = layoutKey(state);
    if (key === this.cornerKey) return;
    this.cornerKey = key;
    // spot2: 마지막 조각이 공사 중이면 팻말을 반투명으로 미리 세운다 — "내가 방금 뭘 했는지"가 그 자리에서 보이게
    const soon = pendingCorners(state);
    const done = [...completedCorners(state), ...soon];
    const pending = new Set(soon.map((c) => c.id));
    const keep = new Set(done.map((c) => c.id));
    for (const [id, node] of this.cornerSigns) if (!keep.has(id)) { node.destroy({ children: true }); this.cornerSigns.delete(id); }
    for (const c of done) {
      const anchor = state.objects[c.anchorId];
      if (!anchor) continue;
      const { w, h } = sizeOf(anchor);
      const { sx, sy } = cellCenter(anchor.x + (w - 1) / 2, anchor.y + (h - 1) / 2);
      let node = this.cornerSigns.get(c.id);
      if (!node) {
        node = new Container();
        node.label = `corner-${c.id}`;
        const t = tex('fx_corner_sign');
        const l = label(cornerDef(c.id).name, 10);
        l.anchor.set(0.5, 0.5);
        if (t) {
          const sp = new Sprite(t);
          sp.anchor.set(0.5, 1);
          sp.scale.set(Math.max(1, (l.width + 12) / t.width));
          node.addChild(sp);
          l.position.set(0, -t.height * sp.scale.y + 8 * sp.scale.y);
        } else {
          const bg = new Graphics().roundRect(-l.width / 2 - 4, -l.height - 2, l.width + 8, l.height + 4, 3).fill({ color: 0x6b3d1e, alpha: 0.9 });
          node.addChild(bg);
          l.position.set(0, -l.height / 2 - 1);
        }
        node.addChild(l);
        this.overlay.addChild(node);
        this.cornerSigns.set(c.id, node);
      }
      node.position.set(sx, sy - ISO_H / 2);
      node.alpha = pending.has(c.id) ? 0.45 : 1; // 공사 중이면 반투명
      node.zIndex = 1e6 - 3;
    }
  }

  /** fun-guest (트랙 G): 손님 반응 — 말풍선(인사·추천·요청·고마워요 대사) + 머리 위로 떠오르는 아이콘(하트·땀·손 흔들기·?). 같은 fx는 한 번만. */
  private spawnReaction(e: Extract<FxEvent, { kind: 'react' }>, now: number) {
    if (this.seenReacts.has(e)) return;
    this.seenReacts.add(e);
    const target = this.guestNodes.get(e.guestId)?.node;
    if (!target) return;
    this.showBubble(e.guestId, { text: e.text }, REACT_BUBBLE_MS);
    const name = e.icon ? REACT_ICON[e.icon] : null;
    const t = name ? tex(name) : null;
    if (!t) return;
    const c = new Container();
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);
    sp.width = REACT_ICON_PX; sp.height = REACT_ICON_PX;
    c.addChild(sp);
    // 말풍선(머리 위, 왼쪽 1/3에 꼬리)과 겹치지 않게 오른쪽 어깨 위에서 떠오른다
    c.position.set(target.x + REACT_ICON_DX, target.y - GUEST_H + 6);
    c.zIndex = 1e6 + 1;
    this.overlay.addChild(c);
    this.pops.push({ node: c, born: now, y0: target.y - GUEST_H + 6 });
  }

  /** 건물(공사 중 제외) 발자국 전체에 따뜻한 빛 다이아몬드 — 창이 밤에도 밝다. 배치 서명이 바뀔 때만 다시 그린다. */
  private syncRoomLights(state: GameState, glowAlpha: number) {
    if (this.roomLight.destroyed) return;
    this.roomLight.alpha = glowAlpha;
    this.roomLight.visible = glowAlpha > 0;
    if (glowAlpha <= 0) return;
    const key = layoutKey(state);
    if (key === this.roomLightKey) return;
    this.roomLightKey = key;
    this.roomLight.clear();
    for (const o of Object.values(state.objects)) {
      if (!objectDef(o.type).room || o.build) continue;
      // 발자국 전체를 다이아몬드 하나로 (칸마다 그리면 add 블렌드가 겹쳐 격자 무늬가 생긴다)
      const { w, h } = sizeOf(o);
      const t = cellToScreen(o.x, o.y), r = cellToScreen(o.x + w - 1, o.y), b = cellToScreen(o.x + w - 1, o.y + h - 1), l = cellToScreen(o.x, o.y + h - 1);
      this.roomLight.poly([t.sx, t.sy - 4, r.sx + ISO_W / 2 + 4, r.sy + ISO_H / 2, b.sx, b.sy + ISO_H + 4, l.sx - ISO_W / 2 - 4, l.sy + ISO_H / 2]).fill({ color: ROOM_LIGHT_COLOR, alpha: ROOM_LIGHT_ALPHA });
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
    this.tickArrivals(now); // fun P0 도착 연출
    if (this.pops.length) {
      this.pops = this.pops.filter((p) => {
        const k = (now - p.born) / POP_MS;
        if (k < 0) { p.node.visible = false; return true; } // 상성 UP: 제 차례가 올 때까지 숨긴다
        p.node.visible = true;
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
        if (fx.kind === 'flash') {
          const total = FLASH_FRAME_MS * FLASH_FRAMES;
          if (age >= total) { fx.sprite.destroy(); return false; }
          const t = tex(`fx_flash_${Math.floor(age / FLASH_FRAME_MS)}`);
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
