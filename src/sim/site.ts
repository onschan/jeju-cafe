/**
 * 자리 점수 (trim: 입지 5요소 → 하나로). "자리마다 값이 달라야 한다"만 남긴다.
 *
 * 한 칸의 자리는 전망(0~5)·그늘(0~2) 두 값으로 재고, 그 둘을 0~10 「자리 점수」 하나로 펼친다.
 * 바람·길가·주방 거리는 없앴고, 그 보정(겨울 바람·서빙 지연·매대 길가)은 자리 점수에 흡수했다.
 * 결정적: rng·Date를 쓰지 않는다. 오브젝트 배치(id·좌표·건설 중)가 바뀌면 캐시가 무효화된다.
 */
import type { GameState, PlacedObject, Guest, ObjectDef, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { inBounds, cellAt, objectAt, windShelter, SHELTER_THRESHOLD } from './grid.ts';
import { cellKey } from './path.ts';
import { seasonOf } from './clock.ts';
import { FLOOR2_VIEW } from './rooms.ts'; // y-indoor
import { layoutSig } from './layoutRev.ts';

/** 칸의 자리 값 (전망·그늘) */
export interface Site {
  view: number;    // 전망 0~5
  shade: number;   // 그늘 0~2
}
export type SiteKey = keyof Site;
export const SITE_KEYS: SiteKey[] = ['view', 'shade'];
export const SITE_LABEL: Record<SiteKey, string> = { view: '전망', shade: '그늘' };
export const SITE_ICON: Record<SiteKey, string> = { view: '👁', shade: '☂' };
export const SITE_MAX: Site = { view: 5, shade: 2 };

export const VIEW_RADIUS = 3;
export const SHADE_RADIUS = 1;
/** 바다: 맵 북쪽(y 작은 쪽) 가장자리 밖 가상 경관. 위 2줄이 바다 방향이라 y ≤ 2 칸에서 보인다. */
export const SEA_SCENERY = 6;
/** 오름: 남동 모서리 밖 가상 랜드마크 */
export const OREUM_SCENERY = 4;
export const OREUM_ANCHOR = (state: GameState): Pt => ({ x: state.grid.w, y: state.grid.h });
export const VIEW_BLOCK_PENALTY = 2;

/** 자리 값이 수치로 가는 계수.
 *  spot2: 요금은 전망만이 아니라 **자리 점수(0~10)** 1점당 +FEE_PER_SITE_POINT (상한 SITE_FEE_MAX) —
 *  잘 꾸민 자리(8점)면 +32%가 눈에 보이게 (사용자 피드백 "자리 수준이 좋을수록 요금이 더 좋아지면"). */
export const FEE_PER_SITE_POINT = 0.04;
export const SITE_FEE_MAX = 0.40;
export const SAT_PER_VIEW = 3;
export const SAT_SHADE_SUMMER = 6;
export const SAT_SHADE_WINTER = -4;
/** spot2 돌담의 쓸모: 북서쪽을 막아 주면 겨울 야외 자리 만족 +8 (사용자 피드백 "돌담 생긴 것 때문에 뭐 어쩌라는 건지 모르겠다") */
export const WIND_SHELTER_SAT = 8;
/** 바람 쐐기: 자리에서 북서쪽으로 1~3칸, |dx−dy| ≤ 1 (grid.ts windShelter와 같은 띠) */
export const WIND_WEDGE_MAX = 3;
/** 파라솔은 자기 자리에 그늘 +1 */
export const PARASOL_TYPE = 'table_parasol';
/** 만족 점수(±3·±6…)를 guests.ts의 경치 기준(손님 minScenery 0~3) 단위로 바꾸는 나눗셈 */
export const SITE_SAT_PER_SCENERY = 10;

/** 그늘을 주는 시설 (나무·지붕·파라솔 외 명시 목록) */
const SHADE_IDS = new Set(['table_parasol', 'palm', 'cedar', 'hackberry', 'deco_umbrella_stand']);

/** 전망이 되는 경관: 실외의 경관치 3 이상 경관·랜드마크·나무(연못·삼나무·수국·돌하르방…). 화분·귤나무 같은 소품은 전망이 아니다. */
export const VIEW_MIN_SCENERY = 3;
function isViewSource(d: ObjectDef): boolean {
  return !d.indoor && d.scenery >= VIEW_MIN_SCENERY && (d.category === 'scenery' || d.category === 'landmark' || d.kind === 'tree' || d.kind === 'landmark');
}
function isShade(d: ObjectDef): boolean {
  return d.kind === 'tree' || d.kind === 'building' || d.room === true || SHADE_IDS.has(d.id);
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ---------- 캐시 ----------

interface Cache { key: string; sites: Map<number, Site> }
const CACHE = new WeakMap<GameState, Cache>();

/** 오브젝트 배치 서명. 배치·제거·이동·완공이 바뀌면 달라진다. */
export function layoutKey(state: GameState): string {
  const parts: string[] = [state.main?.floor2 ? 'F2' : ''];
  for (const o of Object.values(state.objects)) parts.push(`${o.id}:${o.x},${o.y}${o.w ? `x${o.w}x${o.h}` : ''}${o.build ? 'b' : ''}`);
  return parts.join(';');
}
function cacheOf(state: GameState): Cache {
  const key = layoutSig(state); // 싼 배치 서명 (layoutRev.ts)
  const hit = CACHE.get(state);
  if (hit && hit.key === key) return hit;
  const c: Cache = { key, sites: new Map() };
  CACHE.set(state, c);
  return c;
}

/** y-indoor 실내 규칙: 온실 카페 안 전망 +2 고정, 창가석은 벽(방 가장자리)에 붙으면 +2·바다 방향(북쪽 벽) +3, 본관 2층 +1 */
const GREENHOUSE_VIEW = 2;
const WINDOW_WALL_VIEW = 2;
const WINDOW_SEA_VIEW = 3;
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
}

// ---------- 전망·그늘 ----------

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

/** 칸의 자리 값. 그 칸에 있는 오브젝트 자신은 빼고 본다(고스트·미니 카드가 같은 값을 본다). 방 안 칸은 그늘 2. */
export function siteOf(state: GameState, x: number, y: number): Site {
  if (!inBounds(state, x, y)) return { view: 0, shade: 0 };
  const c = cacheOf(state);
  const key = cellKey(state, { x, y });
  const hit = c.sites.get(key);
  if (hit) return hit;
  const cell = cellAt(state, x, y);
  const selfId = cell.objectId ?? undefined;
  const indoor = cell.roomId !== null;
  const site: Site = {
    view: viewOf(state, x, y, selfId),
    shade: indoor ? SITE_MAX.shade : shadeOf(state, x, y, selfId),
  };
  indoorAdjust(state, x, y, site); // y-indoor
  c.sites.set(key, site);
  return site;
}

// ---------- 자리 점수 ----------

/** 자리 점수 0~10: 전망이 크게, 그늘이 조금. (전망 5 + 그늘 2 = 10) */
export const VIEW_WEIGHT = 1.6;
export const SHADE_WEIGHT = 1;
export function scoreOf(site: Site): number {
  return clamp(Math.round(site.view * VIEW_WEIGHT + site.shade * SHADE_WEIGHT), 0, 10);
}
function isSeatDef(d: ObjectDef): boolean {
  return d.kind === 'seat' || d.id === 'warehouse';
}
/** 자리 점수가 성과를 가르는 종류인가 (좌석·이용료 시설). 장식·나머지는 아니다. */
export function scoredType(type: string): boolean {
  const d = objectDef(type);
  return isSeatDef(d) || (d.kind === 'facility' && d.fee !== undefined);
}
/** 좌석 적합도 0~10 */
export function seatScore(state: GameState, x: number, y: number): number {
  return scoreOf(siteOf(state, x, y));
}
/** 이 종류를 이 칸에 놓을 때의 자리 점수 0~10. 점수가 없는 종류(장식 등)는 null. */
export function siteScore(state: GameState, type: string, x: number, y: number): number | null {
  return scoredType(type) ? seatScore(state, x, y) : null;
}
/** 고스트 색 기준: 5 이상 좋음 */
export const SITE_GOOD = 5;
export function siteTone(state: GameState, type: string, x: number, y: number): 'good' | 'bad' | null {
  const sc = siteScore(state, type, x, y);
  return sc === null ? null : sc >= SITE_GOOD ? 'good' : 'bad';
}

/** `자리 7` 한 줄 (DOM·캔버스 공용 — 픽셀 폰트에 이모지가 없다) */
export function siteBadgeText(site: Site): string {
  return `자리 ${scoreOf(site)}`;
}
/** `자리 7 (전망 3 · 그늘 1)` (미니 카드) */
export function siteLineText(site: Site): string {
  return `자리 ${scoreOf(site)} (전망 ${site.view} · 그늘 ${site.shade})`;
}

// ---------- 수치 연결 ----------

/** 자리 점수 → 요금 배수 (1점당 +4%, 상한 +40%) */
export function siteFeeMult(score: number): number {
  return 1 + Math.min(SITE_FEE_MAX, FEE_PER_SITE_POINT * score);
}

export interface SiteBonus {
  feeMult: number;      // 1 + 0.04×자리 점수 (상한 +40%)
  satisfaction: number; // 경치 기준 단위 (점수 / 10, 소수점 버림). 야외 좌석만 계절 그늘 반영
  score: number;        // 자리 점수 0~10
  site: Site;
}
/** 야외 자리인가 (실내 오브젝트·본관 2층·방 안 칸은 아니다) */
export function isOutdoorSeat(state: GameState, seat: PlacedObject): boolean {
  const d = objectDef(seat.type);
  return !d.indoor && !d.room && seat.type !== 'warehouse' && cellAt(state, seat.x, seat.y).roomId === null;
}
/** 좌석·매대의 자리 보정. 계절(여름·겨울 그늘) 반영. */
export function siteBonus(state: GameState, seat: PlacedObject): SiteBonus {
  const site = siteOf(state, seat.x, seat.y);
  const d = objectDef(seat.type);
  const score = scoreOf(site);
  if (!isSeatDef(d)) {
    return { feeMult: d.fee !== undefined ? siteFeeMult(score) : 1, satisfaction: 0, score, site };
  }
  const season = seasonOf(state.clock.month);
  const outdoor = isOutdoorSeat(state, seat);
  // 파라솔 자리: 자기 파라솔 그늘 +1
  const shade = Math.min(SITE_MAX.shade, site.shade + (seat.type === PARASOL_TYPE ? 1 : 0));
  let pts = SAT_PER_VIEW * site.view;
  if (outdoor) {
    if (season === 'winter') {
      pts += SAT_SHADE_WINTER * shade;
      if (windShelter(state, seat.x, seat.y) >= SHELTER_THRESHOLD) pts += WIND_SHELTER_SAT; // spot2: 북서쪽 돌담이 겨울 바람을 막아 준다
    } else if (season === 'summer') pts += SAT_SHADE_SUMMER * shade;
  }
  return {
    feeMult: siteFeeMult(score),
    satisfaction: Math.trunc(pts / SITE_SAT_PER_SCENERY) || 0,
    score,
    site,
  };
}

/** spot2: (x, y)에 이 바람막이를 놓으면 겨울 바람이 **막히게 되는** 야외 자리들 (배치 고스트 반경 표시).
 *  자리에서 북서쪽 쐐기(1~3칸, |dx−dy| ≤ 1) 안이고, 지금은 모자라지만 이걸 더하면 SHELTER_THRESHOLD를 넘는 자리만.
 *  돌담(wind 2) 하나로는 모자라고 둘이면 막힌다 — 고스트가 그 순간을 알려 준다. */
export function windCoveredSeats(state: GameState, type: string, x: number, y: number, ignoreId?: string): PlacedObject[] {
  return windCoveredSeatsBy(state, type, [{ x, y }], ignoreId);
}
/** 돌담을 줄로 놓을 때(placeLine 미리보기)처럼 여러 칸을 한꺼번에 놓는 경우 — 칸마다 바람을 더해서 센다 */
export function windCoveredSeatsBy(state: GameState, type: string, cells: Pt[], ignoreId?: string): PlacedObject[] {
  const wind = objectDef(type).wind;
  if (wind <= 0 || cells.length === 0) return [];
  const inWedge = (seat: PlacedObject, c: Pt) => {
    const dx = seat.x - c.x, dy = seat.y - c.y;
    return dx >= 1 && dx <= WIND_WEDGE_MAX && dy >= 1 && dy <= WIND_WEDGE_MAX && Math.abs(dx - dy) <= 1;
  };
  const out: PlacedObject[] = [];
  for (const o of Object.values(state.objects)) {
    if (o.id === ignoreId || o.build) continue;
    if (!isSeatDef(objectDef(o.type)) || !isOutdoorSeat(state, o)) continue;
    const n = cells.filter((c) => inWedge(o, c)).length;
    if (n === 0) continue;
    const now = windShelter(state, o.x, o.y);
    if (now >= SHELTER_THRESHOLD || now + wind * n < SHELTER_THRESHOLD) continue; // 이미 막혔거나, 이걸 놓아도 아직 모자라다
    out.push(o);
  }
  return out;
}

// ---------- 손님 대사 ----------

export const SITE_SAY = {
  cool: '그늘이라 시원하다~',
  hot: '덥다…',
  sea: '바다가 보인다!',
  view: '경치 좋다!',
} as const;

/** 앉아 있는 손님의 자리 대사. 여름 그늘/더위 → 전망 순. 해당 없으면 null. */
export function siteSay(state: GameState, guest: Guest): string | null {
  if (!guest.seatId || guest.phase !== 'seated') return null;
  const seat = state.objects[guest.seatId];
  if (!seat) return null;
  const site = siteOf(state, seat.x, seat.y);
  const season = seasonOf(state.clock.month);
  const outdoor = isOutdoorSeat(state, seat);
  if (outdoor && season === 'summer' && site.shade >= 1) return SITE_SAY.cool;
  if (outdoor && season === 'summer' && site.shade === 0) return SITE_SAY.hot;
  if (site.view >= 2 && seaInRange(state, seat.x, seat.y)) return SITE_SAY.sea;
  if (site.view >= 3) return SITE_SAY.view;
  return null;
}
