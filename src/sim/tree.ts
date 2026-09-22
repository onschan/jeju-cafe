/**
 * 슬롯형 시설 + 같은 자리 업그레이드 트리 (fun 통합, 사용자 피드백 「종류가 너무 많아 어지럽다 — 부루마블처럼 테라스 업그레이드」).
 * - 트리 5종(data/upgrade_tree.json): 자리·놀거리·매대·정원·조명. steps[0]이 짓기 타일이 놓는 기본 시설, 다음 단계는 놓인 시설 카드 「업그레이드 ▲」로
 *   같은 원점에서 종류가 바뀐다(부루마블 집→빌라→호텔). 비용 = 건설비 차액, 공사 기간은 새 단계 것. 단계마다 조건(등급·★·코너).
 * - 트리 단계는 unlocked.objects 해금과 무관하게 조건만 맞으면 올릴 수 있다(선택지 대신 업그레이드). 기존 증축 Lv1~3(upgrade.ts)은 트리에 없는 시설에만 보인다.
 * - 「거리」 보너스: 같은 트리의 2단계 이상 시설이 가로·세로로 3개 이상 이어지면(발자국 변 맞댐) 그 줄 전부 요금·이용료 +STREET_BONUS_PCT% (부루마블 같은 색 독점).
 * - 「이 자리에서 올리면 +₩n/일」: solver.evaluate(14일 롤아웃)의 자금 차이를 하루로 나눈 값 (upgradeGain).
 * 결정적: rng 안 씀.
 */
import type { GameState, PlacedObject, ApplyResult } from './types.ts';
import treeJson from '../data/upgrade_tree.json' with { type: 'json' };
import { objectDef } from '../data/index.ts';
import { canPlace, sizeOf, vacate, occupy } from './grid.ts';
import { placeCost } from './cafe.ts';
import { buildDaysOf, canStartBuild } from './build.ts';
import { dayIndex } from './effects.ts';
import { monthIndex } from './clock.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { bumpLayoutRev } from './layoutRev.ts';
import { gradeOf, gradeName } from './grade.ts';
import { completedCorners } from './corners.ts';
import { fmtNum } from './format.ts';

export type TreeId = 'seat' | 'fun' | 'shop' | 'garden' | 'light';
export interface TreeNeed { grade?: number; star?: number; corners?: number }
export interface TreeStep { type: string; need?: TreeNeed }
export interface TreeDef { id: TreeId; name: string; icon: string; purpose: string; street: string; steps: TreeStep[] }

export const TREES: TreeDef[] = (treeJson as { trees: TreeDef[] }).trees;
const TREE_BY_ID = new Map(TREES.map((t) => [t.id, t]));
const STEP_OF = new Map<string, { tree: TreeDef; index: number }>();
for (const t of TREES) t.steps.forEach((st, i) => STEP_OF.set(st.type, { tree: t, index: i }));

/** 「거리」 보너스: 같은 트리의 2단계 이상(파라솔 테이블부터 — 기본 야외 테이블 줄은 안 센다, 1년차 밴드) 시설이 한 줄로 STREET_MIN개 이상이면 요금 +STREET_BONUS_PCT% */
export const STREET_MIN = 3;
export const STREET_BONUS_PCT = 5; // 10%면 5년차 자금이 3억(KPI 2억 초과)이라 5%
export const STREET_MIN_STEP = 1;

export function treeDef(id: TreeId): TreeDef {
  const t = TREE_BY_ID.get(id);
  if (!t) throw new Error(`unknown tree: ${id}`);
  return t;
}
/** 이 종류가 어느 트리의 몇 번째 단계인가 (트리에 없으면 null) */
export function treeOf(type: string): { tree: TreeDef; index: number } | null {
  return STEP_OF.get(type) ?? null;
}
/** 트리의 기본 시설(짓기 타일이 놓는 것) */
export function treeBase(id: TreeId): string {
  return treeDef(id).steps[0]!.type;
}
/** 다음 단계 (최고 단계면 null) */
export function nextStep(type: string): TreeStep | null {
  const t = treeOf(type);
  if (!t) return null;
  return t.tree.steps[t.index + 1] ?? null;
}
/** 단계 조건 문구 (카드 「★2면 열려요」) — 다 맞으면 '' */
export function stepNeedText(state: GameState, step: TreeStep): string {
  const n = step.need ?? {};
  const parts: string[] = [];
  if (n.grade && gradeOf(state) < n.grade) parts.push(`등급 「${gradeName(n.grade)}」`);
  if (n.star && state.star < n.star) parts.push(`★${n.star}`);
  if (n.corners && completedCorners(state).length < n.corners) parts.push(`코너 ${n.corners}개`);
  return parts.length ? `${parts.join(' · ')}면 열려요` : '';
}
export function stepNeedMet(state: GameState, step: TreeStep): boolean {
  return stepNeedText(state, step) === '';
}
/** 업그레이드 비용 = 새 단계 건설비 − 지금 건설비 (0 아래로는 안 간다) */
export function treeUpgradeCost(state: GameState, obj: PlacedObject): number {
  const next = nextStep(obj.type);
  if (!next) return 0;
  return Math.max(0, placeCost(state, next.type) - placeCost(state, obj.type));
}
/** 새 단계 발자국이 같은 원점에 들어가나 (커지는 단계: 오른쪽·아래로 늘어난 칸이 비어 있고 내 땅·지형) */
function fitsAt(state: GameState, obj: PlacedObject, type: string): ApplyResult {
  const c = canPlace(state, type, obj.x, obj.y, obj.id);
  if (!c.ok) {
    const def = objectDef(type);
    if (def.w > (obj.w ?? objectDef(obj.type).w) || def.h > (obj.h ?? objectDef(obj.type).h)) return { ok: false, reason: `${def.w}×${def.h}칸이라 옆 칸이 비어 있어야 해요` };
    return c;
  }
  return { ok: true };
}
/** 업그레이드할 수 있나 */
export function canTreeUpgrade(state: GameState, objId: string): ApplyResult & { next?: TreeStep } {
  const obj = state.objects[objId];
  if (!obj) return { ok: false, reason: '없는 오브젝트' };
  const next = nextStep(obj.type);
  if (!next) return { ok: false, reason: treeOf(obj.type) ? '최고 단계예요' : '업그레이드 트리에 없어요' };
  if (obj.build) return { ok: false, reason: '공사 중이에요', next };
  const need = stepNeedText(state, next);
  if (need) return { ok: false, reason: need, next };
  const fit = fitsAt(state, obj, next.type);
  if (!fit.ok) return { ok: false, reason: fit.reason, next };
  const cost = treeUpgradeCost(state, obj);
  if (state.money < cost) return { ok: false, reason: '돈이 모자라요', next };
  const b = canStartBuild(state, next.type);
  if (!b.ok) return { ok: false, reason: b.reason, next };
  return { ok: true, next };
}
/** 업그레이드: 같은 원점에서 종류를 바꾼다 (id·이름·방향 유지, 증축 Lv·이용 횟수는 새로). 호출 전 canTreeUpgrade. */
export function treeUpgrade(state: GameState, objId: string): PlacedObject {
  const obj = state.objects[objId]!;
  const next = nextStep(obj.type)!;
  const cost = treeUpgradeCost(state, obj);
  const from = objectDef(obj.type).name;
  vacate(state, obj);
  obj.type = next.type;
  delete obj.w; delete obj.h; delete obj.level; delete obj.uses;
  obj.placedMonth = monthIndex(state.clock);
  obj.wearMonth = monthIndex(state.clock);
  occupy(state, obj);
  state.money -= cost;
  const days = buildDaysOf(next.type);
  if (days > 0) obj.build = { doneDay: dayIndex(state.clock) + days, days };
  else delete obj.build;
  bumpLayoutRev(state);
  const to = objectDef(next.type).name;
  pushNotice(state, `${from} → ${to}${days > 0 ? ` 공사 시작 (${days}일)` : ' 완성!'}${cost > 0 ? ` · ₩${fmtNum(cost)}` : ''}`);
  pushFx(state, { kind: 'complete', x: obj.x, y: obj.y, tick: state.tick });
  return obj;
}

// ---------- 거리 보너스 ----------

/** 두 발자국이 변을 맞대고 가로(dx) 또는 세로(dy)로 이어졌나 */
function adjacentAlong(a: PlacedObject, b: PlacedObject, axis: 'x' | 'y'): boolean {
  const sa = sizeOf(a), sb = sizeOf(b);
  if (axis === 'x') {
    const touch = a.x + sa.w === b.x || b.x + sb.w === a.x;
    const overlap = a.y < b.y + sb.h && b.y < a.y + sa.h;
    return touch && overlap;
  }
  const touch = a.y + sa.h === b.y || b.y + sb.h === a.y;
  const overlap = a.x < b.x + sb.w && b.x < a.x + sa.w;
  return touch && overlap;
}
/** 이 시설이 속한 「거리」(같은 트리, 가로 또는 세로로 변을 맞대고 이어진 줄)의 길이 — 자기 포함. 트리에 없으면 0. */
export function streetLength(state: GameState, obj: PlacedObject): number {
  const t = treeOf(obj.type);
  if (!t || obj.build || t.index < STREET_MIN_STEP) return 0;
  const same = Object.values(state.objects).filter((o) => o.id !== obj.id && !o.build && treeOf(o.type)?.tree.id === t.tree.id && (treeOf(o.type)?.index ?? 0) >= STREET_MIN_STEP);
  let best = 1;
  for (const axis of ['x', 'y'] as const) {
    const line = new Set<string>([obj.id]);
    const queue: PlacedObject[] = [obj];
    for (let i = 0; i < queue.length; i++) for (const o of same) if (!line.has(o.id) && adjacentAlong(queue[i]!, o, axis)) { line.add(o.id); queue.push(o); }
    best = Math.max(best, line.size);
  }
  return best;
}
/** 거리 보너스 배수 (3개 이상 이어지면 ×1.10) — 좌석 요금·시설 이용료 훅 */
export function streetFeeMult(state: GameState, obj: PlacedObject): number {
  return streetLength(state, obj) >= STREET_MIN ? 1 + STREET_BONUS_PCT / 100 : 1;
}
/** 거리 문구 (카드): "테라스 거리 3칸 · 요금 +5%" / "하나 더 이으면 거리 보너스" */
export function streetText(state: GameState, obj: PlacedObject): string {
  const t = treeOf(obj.type);
  if (!t) return '';
  if (t.index < STREET_MIN_STEP) return `올리고 ${STREET_MIN}개 이으면 ${t.tree.street} (+${STREET_BONUS_PCT}%)`;
  const n = streetLength(state, obj);
  if (n >= STREET_MIN) return `${t.tree.street} ${n}칸 · 요금 +${STREET_BONUS_PCT}%`;
  return `${STREET_MIN - n}개 더 이으면 ${t.tree.street} (+${STREET_BONUS_PCT}%)`;
}
/** (x, y)에 이 종류를 놓으면 거리가 몇 칸이 되나 (고스트 문구용) */
export function streetIfPlaced(state: GameState, type: string, x: number, y: number): number {
  if (!treeOf(type)) return 0;
  const ghost: PlacedObject = { id: '__ghost', type, x, y, placedMonth: 0 };
  return streetLength({ ...state, objects: { ...state.objects, __ghost: ghost } } as GameState, ghost);
}

// ---------- 짓기 타일 (6개, 중요도 순) ----------

export type BuildTileId = 'seat' | 'service' | 'charm' | 'inflow' | 'building' | 'all';
export interface BuildTile { id: BuildTileId; name: string; icon: string; purpose: string; base: string | null }
/** 짓기 창 첫 화면 6타일: ① 자리 ② 서비스 ③ 매력 ④ 유입 ⑤ 실내·건물 ⑥ 전체 목록. base = 타일을 누르면 바로 놓는 기본 시설 (없으면 하위 목록) */
export const BUILD_TILES: BuildTile[] = [
  { id: 'seat', name: '자리', icon: 'chair', purpose: '손님이 앉아야 돈이 된다', base: 'table_out' },
  { id: 'service', name: '서비스', icon: 'kitchen', purpose: '서빙이 빨라지고 만족이 오른다', base: null },
  { id: 'charm', name: '매력', icon: 'plant', purpose: '경관이 오르면 관광객이 온다', base: 'flower_bed' },
  { id: 'inflow', name: '유입', icon: 'car', purpose: '손님이 들어오는 문', base: 'parking_lot' },
  { id: 'building', name: '실내·건물', icon: 'home', purpose: '비 오는 날도 자리가 있다', base: null },
  { id: 'all', name: '전체 목록', icon: 'book', purpose: '150여 종을 탭별로', base: null },
];
/** 타일별 하위 목록에 넣을 종류 (기본 시설·트리 단계·서비스 시설·유입 시설) — 전체 목록은 탭이 맡는다 */
export const TILE_TYPES: Record<Exclude<BuildTileId, 'all' | 'building'>, string[]> = {
  seat: ['table_out', 'table_parasol', 'terrace_seat', 'oreum_bench', 'table_big', 'rest_pavilion'],
  service: ['omegi_stall', 'tart_bakery', 'brunch_house', 'fine_dining', 'restroom', 'staff_room', 'kitchen_ext', 'cleaning_room', 'storage', 'wifi_zone'],
  charm: ['flower_bed', 'camellia', 'palm', 'pond', 'deco_wood_bench', 'hammock', 'cauldron_footbath', 'open_air_footbath', 'stonewall', 'signboard', 'cherry_tree'],
  inflow: ['parking_lot', 'path', 'gate', 'garden_lamp', 'streetlight', 'deco_string_lights', 'lighthouse', 'olle_sign', 'shuttle_stop', 'pier'],
};

// ---------- 병목 (타일 배지) ----------

export interface TileBadge { tile: BuildTileId; text: string }
/** 지금 병목: 좌석 이용률 ≥ 90% → 자리 「자리가 모자라요」, 경관 낮음 → 매력 「관광객이 안 와요」, 직원 없음 → 서비스 「서빙이 느려요」, 경로 하나 → 유입 「정류장에서만 와요」 */
export function tileBadges(state: GameState, seatUse: number, scenery: number, staffN: number, routesN: number): TileBadge[] {
  const out: TileBadge[] = [];
  if (seatUse >= SEAT_USE_BOTTLENECK) out.push({ tile: 'seat', text: '자리가 모자라요' });
  if (scenery < SCENERY_BOTTLENECK) out.push({ tile: 'charm', text: '관광객이 안 와요' });
  if (staffN === 0) out.push({ tile: 'service', text: '서빙이 느려요' });
  if (routesN <= 1) out.push({ tile: 'inflow', text: '정류장에서만 와요' });
  return out;
}
export const SEAT_USE_BOTTLENECK = 0.9;
export const SCENERY_BOTTLENECK = 4;

/** 좌석 이용률(최근 하루, 0~1): 자리에 앉은 손님 + 대기 ÷ 좌석 수. 자리가 없으면 0. */
export function seatUseRate(state: GameState, totalSeats: number): number {
  if (totalSeats <= 0) return 0;
  const seated = state.guests.filter((g) => g.phase !== 'walking' && g.phase !== 'leaving').length;
  return Math.min(1, (seated + state.waiting.length) / totalSeats);
}
