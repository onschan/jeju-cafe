/**
 * 입지 시스템 (HSS2 확장 스펙 §6, 트랙 F) — "자리별로 특색이 달라야 한다".
 * 모든 칸에 입지 5요소(전망·바람·그늘·길가·주방 거리)가 있고, 좌석·매대의 실제 성과가 거기서 갈린다.
 * 결정적: rng·Date를 쓰지 않는다. 오브젝트 배치(id·좌표·건설 중)가 바뀌면 캐시가 무효화된다.
 *
 * 기존 grid.ts의 windShelter/isSheltered(북서 띠 wind 합 ≥ 3)와 sceneryScore(반경 2)는 여기의 wind·view가 흡수한다 — 통합 때 정리 예정.
 */
import type { GameState, PlacedObject, Guest, ObjectDef, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { inBounds, cellAt, objectAt, doorFrontOf } from './grid.ts';
import { reachMap, cellKey, type Reach } from './path.ts';
import { seasonOf } from './clock.ts';
import { staffInRole } from './staff.ts';
import { FLOOR2_VIEW } from './rooms.ts'; // y-indoor
import { layoutSig } from './layoutRev.ts';

/** 칸의 입지 5요소 (§6.1 표) */
export interface Site {
  view: number;    // 전망 0~5
  wind: number;    // 바람 0~3 (클수록 세다)
  shade: number;   // 그늘 0~2
  traffic: number; // 길가 0~3 (클수록 길에 가깝다)
  kitchen: number; // 주방 거리 0~4 (클수록 멀다)
}
export type SiteKey = keyof Site;
export const SITE_KEYS: SiteKey[] = ['view', 'wind', 'shade', 'traffic', 'kitchen'];
export const SITE_LABEL: Record<SiteKey, string> = { view: '전망', wind: '바람', shade: '그늘', traffic: '길가', kitchen: '주방' };
export const SITE_ICON: Record<SiteKey, string> = { view: '👁', wind: '🌬', shade: '☂', traffic: '🚶', kitchen: '🍳' };
export const SITE_MAX: Site = { view: 5, wind: 3, shade: 2, traffic: 3, kitchen: 4 };

export const VIEW_RADIUS = 3;
export const WIND_RADIUS = 3;
export const SHADE_RADIUS = 1;
export const TRAFFIC_RADIUS = 3;
/** 바다: 맵 북쪽(y 작은 쪽) 가장자리 밖 가상 경관. 위 2줄이 바다 방향이라 y ≤ 2 칸에서 보인다. */
export const SEA_SCENERY = 6;
/** 오름: 남동 모서리 밖 가상 랜드마크 */
export const OREUM_SCENERY = 4;
export const OREUM_ANCHOR = (state: GameState): Pt => ({ x: state.grid.w, y: state.grid.h });
export const VIEW_BLOCK_PENALTY = 2;
export const KITCHEN_CELLS_PER_POINT = 4;

/** §6.1 영향 계수 */
export const FEE_PER_VIEW = 0.04;
export const SAT_PER_VIEW = 3;
export const SAT_WIND_WINTER = -8;
export const SAT_WIND_SUMMER = 3;
export const SAT_SHADE_SUMMER = 6;
export const SAT_SHADE_WINTER = -4;
export const SAT_PER_TRAFFIC = -3;
export const SERVE_PER_KITCHEN = 0.15;
export const STALL_PER_TRAFFIC = 0.15;
/** 파라솔은 바람 2 이상이면 접힌다 (자기 그늘 효과 0) */
export const PARASOL_FOLD_WIND = 2;
export const PARASOL_TYPE = 'table_parasol';
/** 스펙의 만족 점수(±3·±8…)를 guests.ts의 경치 기준(손님 minScenery 0~3) 단위로 바꾸는 나눗셈 (소수점은 버린다 — 겨울 강풍·여름 그늘처럼 큰 것만 남는다) */
export const SITE_SAT_PER_SCENERY = 10;

/** 그늘을 주는 시설 (나무·지붕·파라솔 외 명시 목록) */
const SHADE_IDS = new Set(['table_parasol', 'palm', 'cedar', 'hackberry_shade', 'hackberry_millennium', 'hackberry', 'deco_umbrella_stand']);
const TRAFFIC_KINDS = new Set(['path', 'gate', 'busstop']);

/** 전망이 되는 경관: 실외의 경관치 3 이상 경관·랜드마크·나무(연못·삼나무·수국·돌하르방…). 화분·귤나무 같은 소품은 전망이 아니다(상성으로 친다). */
export const VIEW_MIN_SCENERY = 3;
function isViewSource(d: ObjectDef): boolean {
  return !d.indoor && d.scenery >= VIEW_MIN_SCENERY && (d.category === 'scenery' || d.category === 'landmark' || d.kind === 'tree' || d.kind === 'landmark');
}
function isWindBreak(d: ObjectDef): boolean {
  return d.kind !== 'seat' && (d.wind > 0 || d.kind === 'wall' || d.kind === 'building' || d.room === true);
}
function isShade(d: ObjectDef): boolean {
  return d.kind === 'tree' || d.kind === 'building' || d.room === true || SHADE_IDS.has(d.id);
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ---------- 캐시 ----------

interface Cache { key: string; sites: Map<number, Site>; kitchen: Reach | null | undefined }
const CACHE = new WeakMap<GameState, Cache>();

/** 오브젝트 배치 서명. 배치·제거·이동·완공이 바뀌면 달라진다. */
export function layoutKey(state: GameState): string {
  const parts: string[] = [state.main?.floor2 ? 'F2' : ''];
  for (const o of Object.values(state.objects)) parts.push(`${o.id}:${o.x},${o.y}${o.w ? `x${o.w}x${o.h}` : ''}${o.build ? 'b' : ''}`); // y-indoor: 본관 크기·2층도 서명에
  return parts.join(';');
}
function cacheOf(state: GameState): Cache {
  const key = layoutSig(state); // 싼 배치 서명 (layoutRev.ts) — layoutKey는 오브젝트 전체를 훑어 스텝마다 부르면 비싸다
  const hit = CACHE.get(state);
  if (hit && hit.key === key) return hit;
  const c: Cache = { key, sites: new Map(), kitchen: undefined };
  CACHE.set(state, c);
  return c;
}

/** 본관 문에서 걷기 칸으로 닿는 거리 지도 (본관이 없으면 null) */
function kitchenReach(state: GameState, c: Cache): Reach | null {
  if (c.kitchen !== undefined) return c.kitchen;
  const wh = Object.values(state.objects).find((o) => o.type === 'warehouse');
  c.kitchen = wh ? reachMap(state, doorFrontOf(wh)) : null;
  return c.kitchen;
}
/** y-indoor 실내 규칙 한 곳 (§8.2·§4.3): 온실 카페 안 전망 +2 고정, 창가석은 벽(방 가장자리)에 붙으면 +2·바다 방향(북쪽 벽) +3, 본관 2층 +1, 카운터 확장은 주방 거리 −1(서빙 −10%). */
const GREENHOUSE_VIEW = 2;
const WINDOW_WALL_VIEW = 2;
const WINDOW_SEA_VIEW = 3;
const COUNTER_EXT_KITCHEN = 1;
function indoorAdjust(state: GameState, x: number, y: number, site: Site): void {
  const cell = cellAt(state, x, y);
  const room = cell.roomId ? state.objects[cell.roomId] : null;
  if (!room) return;
  if (room.type === 'greenhouse_cafe') site.view = clamp(site.view + GREENHOUSE_VIEW, 0, SITE_MAX.view);
  const o = cell.objectId ? state.objects[cell.objectId] : null;
  if (o && o.type === 'window_seat') {
    const w = room.w ?? objectDef(room.type).w, h = room.h ?? objectDef(room.type).h;
    const onWall = x === room.x || y === room.y || x === room.x + w - 1 || y === room.y + h - 1;
    if (onWall) site.view = clamp(site.view + (y === room.y && seaInRange(state, x, y) ? WINDOW_SEA_VIEW : WINDOW_WALL_VIEW), 0, SITE_MAX.view);
  }
  if (room.type === 'warehouse' && state.main?.floor2) site.view = clamp(site.view + FLOOR2_VIEW, 0, SITE_MAX.view);
  if (Object.values(state.objects).some((c2) => c2.type === 'counter_ext' && !c2.build)) site.kitchen = clamp(site.kitchen - COUNTER_EXT_KITCHEN, 0, SITE_MAX.kitchen);
}

// ---------- 5요소 ----------

/** (x,y)→(tx,ty) 사이(양 끝 제외)에 방(건물) 칸이 있으면 true. 격자 밖 목표(바다·오름)도 선 위의 격자 안 칸만 본다. */
function blockedToward(state: GameState, x: number, y: number, tx: number, ty: number, selfId: string | undefined): boolean {
  const dx = tx - x, dy = ty - y;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i < n; i++) {
    const px = x + Math.round((dx * i) / n), py = y + Math.round((dy * i) / n);
    if (!inBounds(state, px, py)) continue;
    const roomId = cellAt(state, px, py).roomId;
    if (roomId && roomId !== selfId) return true;
  }
  return false;
}

/** 이 칸에서 바다(북쪽 가장자리 밖)가 반경 안인가 */
export function seaInRange(_state: GameState, _x: number, y: number): boolean {
  return y + 1 <= VIEW_RADIUS;
}

function viewOf(state: GameState, x: number, y: number, selfId: string | undefined): number {
  let raw = 0;
  let blocked = false;
  if (seaInRange(state, x, y)) {
    if (blockedToward(state, x, y, x, -1, selfId)) blocked = true; else raw += SEA_SCENERY;
  }
  const oreum = OREUM_ANCHOR(state);
  if (Math.max(oreum.x - x, oreum.y - y) <= VIEW_RADIUS) {
    if (blockedToward(state, x, y, oreum.x, oreum.y, selfId)) blocked = true; else raw += OREUM_SCENERY;
  }
  const seen = new Set<string>();
  for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
    const o = objectAt(state, x + dx, y + dy);
    if (!o || o.id === selfId || seen.has(o.id)) continue;
    seen.add(o.id);
    const d = objectDef(o.type);
    if (!isViewSource(d)) continue;
    if (blockedToward(state, x, y, x + dx, y + dy, selfId)) blocked = true; else raw += d.scenery;
  }
  return clamp(Math.floor(raw / 2) - (blocked ? VIEW_BLOCK_PENALTY : 0), 0, SITE_MAX.view);
}

/** 북서풍: 북서쪽 쐐기(반경 3, |dx−dy| ≤ 1)에 돌담·건물·방풍림이 하나도 없으면 3, 하나당 −1 */
function windOf(state: GameState, x: number, y: number, selfId: string | undefined): number {
  let blockers = 0;
  const seen = new Set<string>();
  for (let dx = 0; dx <= WIND_RADIUS; dx++) for (let dy = 0; dy <= WIND_RADIUS; dy++) {
    if ((dx === 0 && dy === 0) || Math.abs(dx - dy) > 1) continue;
    const o = objectAt(state, x - dx, y - dy);
    if (!o || o.id === selfId || seen.has(o.id)) continue;
    seen.add(o.id);
    if (isWindBreak(objectDef(o.type))) blockers++;
  }
  return clamp(SITE_MAX.wind - blockers, 0, SITE_MAX.wind);
}

function shadeOf(state: GameState, x: number, y: number, selfId: string | undefined): number {
  let n = 0;
  const seen = new Set<string>();
  for (let dy = -SHADE_RADIUS; dy <= SHADE_RADIUS; dy++) for (let dx = -SHADE_RADIUS; dx <= SHADE_RADIUS; dx++) {
    const o = objectAt(state, x + dx, y + dy);
    if (!o || o.id === selfId || seen.has(o.id)) continue;
    seen.add(o.id);
    if (isShade(objectDef(o.type))) n++;
  }
  return clamp(n, 0, SITE_MAX.shade);
}

/** 올렛길·정낭·정류장·도로까지 체비쇼프 거리 ≤1 → 3, ≤2 → 2, ≤3 → 1 */
function trafficOf(state: GameState, x: number, y: number, selfId: string | undefined): number {
  let best = Infinity;
  for (let dy = -TRAFFIC_RADIUS; dy <= TRAFFIC_RADIUS; dy++) for (let dx = -TRAFFIC_RADIUS; dx <= TRAFFIC_RADIUS; dx++) {
    if (dx === 0 && dy === 0) continue;
    const px = x + dx, py = y + dy;
    if (!inBounds(state, px, py)) continue;
    const o = objectAt(state, px, py);
    const road = (o && o.id !== selfId && TRAFFIC_KINDS.has(objectDef(o.type).kind)) || (!o && cellAt(state, px, py).terrain === 'road');
    if (road) best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
  }
  return best === Infinity ? 0 : TRAFFIC_RADIUS + 1 - best;
}

/** 본관 문 앞에서 이 칸(걷기 칸이 아니면 4방향 이웃 중 가장 가까운 걷기 칸 = 손님이 다가가는 칸)까지 BFS 거리/4, 상한 4.
 *  길이 안 이어져 닿지 않으면 문 앞까지의 체비쇼프 거리로 어림한다 (길을 아직 안 깐 빈 마당에서도 값이 나오게). */
function kitchenOf(state: GameState, x: number, y: number, reach: Reach | null): number {
  if (!reach) return SITE_MAX.kitchen;
  let d = reach.dist.get(cellKey(state, { x, y }));
  if (d === undefined) {
    let best = Infinity;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (!inBounds(state, nx, ny)) continue;
      const nd = reach.dist.get(cellKey(state, { x: nx, y: ny }));
      if (nd !== undefined) best = Math.min(best, nd);
    }
    d = best;
  }
  if (d === Infinity) d = Math.max(Math.abs(x - reach.from.x), Math.abs(y - reach.from.y));
  return clamp(Math.floor(d / KITCHEN_CELLS_PER_POINT), 0, SITE_MAX.kitchen);
}

/** 칸의 입지 5요소. 그 칸에 있는 오브젝트 자신은 빼고 본다(고스트·미니 카드가 같은 값을 본다). 방 안 칸은 바람 0·그늘 2. */
export function siteOf(state: GameState, x: number, y: number): Site {
  if (!inBounds(state, x, y)) return { view: 0, wind: SITE_MAX.wind, shade: 0, traffic: 0, kitchen: SITE_MAX.kitchen };
  const c = cacheOf(state);
  const key = cellKey(state, { x, y });
  const hit = c.sites.get(key);
  if (hit) return hit;
  const cell = cellAt(state, x, y);
  const selfId = cell.objectId ?? undefined;
  const indoor = cell.roomId !== null;
  const site: Site = {
    view: viewOf(state, x, y, selfId),
    wind: indoor ? 0 : windOf(state, x, y, selfId),
    shade: indoor ? SITE_MAX.shade : shadeOf(state, x, y, selfId),
    traffic: trafficOf(state, x, y, selfId),
    kitchen: kitchenOf(state, x, y, kitchenReach(state, c)),
  };
  indoorAdjust(state, x, y, site); // y-indoor
  c.sites.set(key, site);
  return site;
}

// ---------- 종류별 가중치·점수 ----------

export type SiteWeights = Partial<Record<SiteKey, number>>;
export const SEAT_WEIGHTS: SiteWeights = { view: 1, shade: 1, wind: -1, traffic: -1, kitchen: -1 };
export const STALL_WEIGHTS: SiteWeights = { traffic: 1 };

function isSeatDef(d: ObjectDef): boolean {
  return d.kind === 'seat' || d.id === 'warehouse';
}
/** 시설 종류별 입지 가중치: 좌석 = 전망+그늘−바람−길가−주방, 매대(이용료 시설) = 길가, 장식·나머지 = 없음(null) */
export function kindWeights(type: string): SiteWeights | null {
  const d = objectDef(type);
  if (isSeatDef(d)) return SEAT_WEIGHTS;
  if (d.kind === 'facility' && d.fee !== undefined) return STALL_WEIGHTS;
  return null;
}

/** 가중치로 0~10 점수 (가능한 최소~최대를 0~10으로 펼친다) */
export function scoreWith(site: Site, w: SiteWeights): number {
  let raw = 0, lo = 0, hi = 0;
  for (const k of SITE_KEYS) {
    const wk = w[k] ?? 0;
    raw += wk * site[k];
    if (wk > 0) hi += wk * SITE_MAX[k]; else lo += wk * SITE_MAX[k];
  }
  return hi === lo ? 5 : clamp(Math.round(((raw - lo) / (hi - lo)) * 10), 0, 10);
}
/** 좌석 적합도 0~10 */
export function seatScore(state: GameState, x: number, y: number): number {
  return scoreWith(siteOf(state, x, y), SEAT_WEIGHTS);
}
/** 이 종류를 이 칸에 놓을 때의 적합도 0~10. 가중치가 없는 종류(장식 등)는 null. */
export function siteScore(state: GameState, type: string, x: number, y: number): number | null {
  const w = kindWeights(type);
  return w ? scoreWith(siteOf(state, x, y), w) : null;
}
/** 고스트 색 기준: 5 이상 좋음 */
export const SITE_GOOD = 5;
export function siteTone(state: GameState, type: string, x: number, y: number): 'good' | 'bad' | null {
  const sc = siteScore(state, type, x, y);
  return sc === null ? null : sc >= SITE_GOOD ? 'good' : 'bad';
}

/** `👁3 🌬1 ☂0 🚶2 🍳1` 한 줄 (DOM용) */
export function siteBadgeText(site: Site): string {
  return SITE_KEYS.map((k) => `${SITE_ICON[k]}${site[k]}`).join(' ');
}
/** `전망3 바람1 그늘0 길가2 주방1` — 캔버스 픽셀 폰트(Galmuri)에는 이모지가 없어 고스트 배지는 이걸 쓴다 */
export function siteBadgeTextPlain(site: Site): string {
  return SITE_KEYS.map((k) => `${SITE_LABEL[k]}${site[k]}`).join(' ');
}
/** `전망 3 · 바람 1 · 그늘 0 · 길가 2 · 주방 1` (미니 카드) */
export function siteLineText(site: Site): string {
  return SITE_KEYS.map((k) => `${SITE_LABEL[k]} ${site[k]}`).join(' · ');
}

// ---------- 수치 연결 (§6.3) ----------

export interface SiteBonus {
  feeMult: number;      // 좌석: 1 + 0.04×전망. 매대: 1 + 0.15×길가
  satisfaction: number; // 경치 기준 단위 (스펙 점수 / 10, 소수점 버림). 야외 좌석만 바람·그늘 반영
  serveMult: number;    // 서빙(조리 대기) 시간 배수: 1 + 0.15×주방 (홀 직원 있으면 절반)
  site: Site;
}
/** 야외 자리인가 (실내 오브젝트·본관 2층·방 안 칸은 아니다) */
export function isOutdoorSeat(state: GameState, seat: PlacedObject): boolean {
  const d = objectDef(seat.type);
  return !d.indoor && !d.room && seat.type !== 'warehouse' && cellAt(state, seat.x, seat.y).roomId === null;
}
/** 좌석·매대의 입지 보정. 계절(겨울 바람·여름 그늘) 반영. */
export function siteBonus(state: GameState, seat: PlacedObject): SiteBonus {
  const site = siteOf(state, seat.x, seat.y);
  const d = objectDef(seat.type);
  if (!isSeatDef(d)) {
    const feeMult = d.fee !== undefined ? 1 + STALL_PER_TRAFFIC * site.traffic : 1;
    return { feeMult, satisfaction: 0, serveMult: 1, site };
  }
  const season = seasonOf(state.clock.month);
  const outdoor = isOutdoorSeat(state, seat);
  // 파라솔 자리: 자기 파라솔 그늘 +1 (바람 2 이상이면 접혀서 0)
  const shade = Math.min(SITE_MAX.shade, site.shade + (seat.type === PARASOL_TYPE && site.wind < PARASOL_FOLD_WIND ? 1 : 0));
  let pts = SAT_PER_VIEW * site.view + SAT_PER_TRAFFIC * site.traffic;
  if (outdoor) {
    if (season === 'winter') pts += SAT_WIND_WINTER * site.wind + SAT_SHADE_WINTER * shade;
    else if (season === 'summer') pts += SAT_WIND_SUMMER * site.wind + SAT_SHADE_SUMMER * shade;
  }
  const hall = staffInRole(state, 'hall').length > 0 ? 0.5 : 1;
  return {
    feeMult: 1 + FEE_PER_VIEW * site.view,
    satisfaction: Math.trunc(pts / SITE_SAT_PER_SCENERY) || 0,
    serveMult: 1 + SERVE_PER_KITCHEN * site.kitchen * hall,
    site,
  };
}

// ---------- 손님 대사 (§6.2, 6줄) ----------

export const SITE_SAY = {
  cold: '춥다…',
  windy: '바람이 세네…',
  cool: '그늘이라 시원하다~',
  hot: '덥다…',
  sea: '바다가 보인다!',
  view: '경치 좋다!',
} as const;

/** 앉아 있는 손님의 자리 입지 대사. 겨울 바람 → 여름 그늘/더위 → 전망 순. 해당 없으면 null. */
export function siteSay(state: GameState, guest: Guest): string | null {
  if (!guest.seatId || guest.phase !== 'seated') return null;
  const seat = state.objects[guest.seatId];
  if (!seat) return null;
  const site = siteOf(state, seat.x, seat.y);
  const season = seasonOf(state.clock.month);
  const outdoor = isOutdoorSeat(state, seat);
  if (outdoor && season === 'winter' && site.wind >= 3) return SITE_SAY.cold;
  if (outdoor && season === 'winter' && site.wind >= 2) return SITE_SAY.windy;
  if (outdoor && season === 'summer' && site.shade >= 1) return SITE_SAY.cool;
  if (outdoor && season === 'summer' && site.shade === 0 && site.wind === 0) return SITE_SAY.hot;
  if (site.view >= 2 && seaInRange(state, seat.x, seat.y)) return SITE_SAY.sea;
  if (site.view >= 3) return SITE_SAY.view;
  return null;
}
