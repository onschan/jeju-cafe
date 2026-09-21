/** 증축 Lv1~3 (스펙 §3.2.2, HSS2 탕 S/L/XL의 일반화). 기능 시설(쉼·편의·먹거리·즐길거리·농원·랜드마크·방)만, 경관 장식·길·담은 없다.
 *  크기는 그대로. 비용 Lv2 = 건설비 × 0.8, Lv3 = × 1.5. 공사 기간은 티어별(1/3/7일)이고 공사 중엔 이용 불가(build 표식 재사용). */
import type { GameState, PlacedObject, ObjectDef, ApplyResult } from './types.ts';
import { bumpLayoutRev } from './layoutRev.ts';
import { objectDef } from '../data/index.ts';
import { placeCost } from './cafe.ts';
import { monthIndex } from './clock.ts';
import { dayIndex } from './effects.ts';
import { canStartBuild, buildDaysOf } from './build.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';

export const MAX_OBJECT_LEVEL = 3;
/** 인덱스 = Lv (0은 안 쓴다) */
export const LEVEL_COST_MULT = [0, 1, 0.8, 1.5];
export const LEVEL_POPULARITY = [0, 0, 4, 8];
export const LEVEL_SCENERY = [0, 0, 2, 4];
export const LEVEL_FEE_PCT = [0, 0, 10, 20];      // 요금형 시설 이용료 +%
export const LEVEL_MENU_PCT = [0, 0, 5, 10];      // 좌석형: 메뉴 매출 +% (feePct 가산)
export const LEVEL_UPKEEP_MULT = [1, 1, 1.25, 1.5];
export const LEVEL_COMBO_MULT = [1, 1, 1.25, 1.5];
export const LEVEL_SEATS = [0, 0, 1, 2];
export const LEVEL_YIELD_MULT = [1, 1, 1.5, 2];   // 농원: 감귤 6 → 9 → 12
/** 조건: Lv2 = 누적 이용 100회 또는 그 시설 인기 30 이상. Lv3 = 누적 이용 500회 그리고 ★ ≥ 티어별(소 2·중 3·대 4) */
export const UPGRADE_USES = [0, 0, 100, 500];
export const UPGRADE_POP_ALT = 30;
export const STAR_BY_TIER: Record<Tier, number> = { small: 2, medium: 3, large: 4 };
export type Tier = 'small' | 'medium' | 'large';

const NO_UPGRADE_TYPES = new Set(['busstop', 'warehouse', 'gate', 'spring']);

export function levelOf(obj: PlacedObject): number {
  return obj.level ?? 1;
}

/** 티어: 건설 기간(1/3/7일)으로, 없으면 발자국 넓이로 */
export function tierOf(def: ObjectDef): Tier {
  const d = def.buildDays ?? 0;
  if (d >= 7) return 'large';
  if (d >= 3) return 'medium';
  if (d >= 1) return 'small';
  const area = def.w * def.h;
  return area >= 4 ? 'large' : area >= 2 ? 'medium' : 'small';
}

/** 증축할 수 있는 종류: 좌석·시설·방·랜드마크·농원(수확 있는 장식). 경관 장식·길·담·정낭·본관은 없다. */
export function isUpgradable(def: ObjectDef): boolean {
  if (NO_UPGRADE_TYPES.has(def.id)) return false;
  if (def.kind === 'seat' || def.kind === 'facility' || def.kind === 'building' || def.kind === 'landmark' || def.kind === 'tree') return true;
  return def.kind === 'deco' && (def.yield !== undefined || def.category === 'farm');
}

/** 다음 Lv 비용 (현재 건설비 기준 × 0.8 / × 1.5). 최고 Lv면 0. */
export function upgradeCost(state: GameState, obj: PlacedObject): number {
  const next = levelOf(obj) + 1;
  if (next > MAX_OBJECT_LEVEL) return 0;
  return Math.round(placeCost(state, obj.type) * LEVEL_COST_MULT[next]!);
}

/** 이 시설의 이용 횟수 (좌석 주문·시설 방문) */
export function usesOf(obj: PlacedObject): number {
  return obj.uses ?? 0;
}
/** 좌석 주문·시설 방문마다 (guests.ts 훅) */
export function recordUse(obj: PlacedObject): void {
  obj.uses = usesOf(obj) + 1;
}

/** 다음 Lv 조건 문구 (카드용) */
export function upgradeConditionText(obj: PlacedObject, def: ObjectDef): string {
  const next = levelOf(obj) + 1;
  if (next === 2) return `이용 ${UPGRADE_USES[2]}회 또는 인기 ${UPGRADE_POP_ALT}`;
  if (next === 3) return `이용 ${UPGRADE_USES[3]}회 · ★${STAR_BY_TIER[tierOf(def)]}`;
  return '최고 단계';
}

/** 증축할 수 있나 (인기는 호출자가 objectStats로 넘긴다 — compat ↔ upgrade 순환 import 회피) */
export function canUpgrade(state: GameState, objId: string, popularity: number): ApplyResult {
  const obj = state.objects[objId];
  if (!obj) return { ok: false, reason: '없는 오브젝트' };
  const def = objectDef(obj.type);
  if (!isUpgradable(def)) return { ok: false, reason: '증축할 수 없는 거예요' };
  const next = levelOf(obj) + 1;
  if (next > MAX_OBJECT_LEVEL) return { ok: false, reason: '이미 최고 단계예요' };
  if (obj.build) return { ok: false, reason: '공사 중이에요' };
  const uses = usesOf(obj);
  if (next === 2 && uses < UPGRADE_USES[2]! && popularity < UPGRADE_POP_ALT) return { ok: false, reason: `이용 ${UPGRADE_USES[2]}회 또는 인기 ${UPGRADE_POP_ALT}이 필요해요 (지금 ${uses}회 · ${popularity})` };
  if (next === 3) {
    if (uses < UPGRADE_USES[3]!) return { ok: false, reason: `이용 ${UPGRADE_USES[3]}회가 필요해요 (지금 ${uses}회)` };
    const star = STAR_BY_TIER[tierOf(def)];
    if (state.star < star) return { ok: false, reason: `★${star}부터 할 수 있어요` };
  }
  const cost = upgradeCost(state, obj);
  if (state.money < cost) return { ok: false, reason: '돈이 모자라요' };
  const b = canStartBuild(state, obj.type);
  if (!b.ok) return b;
  return { ok: true };
}

/** 증축: 돈 차감 → Lv+1 → 노후 0(기준 달 갱신) → 공사(티어별 기간, 공사 중 이용 불가). 호출 전 canUpgrade. */
export function upgrade(state: GameState, objId: string): void {
  const obj = state.objects[objId]!;
  const def = objectDef(obj.type);
  state.money -= upgradeCost(state, obj);
  obj.level = Math.min(MAX_OBJECT_LEVEL, levelOf(obj) + 1) as 1 | 2 | 3;
  obj.wearMonth = monthIndex(state.clock);
  const days = buildDaysOf(obj.type);
  if (days > 0) { obj.build = { doneDay: dayIndex(state.clock) + days, days }; bumpLayoutRev(state); }
  pushNotice(state, `${def.name} 증축 Lv${obj.level}${days > 0 ? ` 공사 시작 (${days}일)` : ' 완료!'}`);
  pushFx(state, { kind: 'complete', x: obj.x, y: obj.y, tick: state.tick });
}

/** 좌석형 정원 가산 (+1/+2석) — cafe.ts seatsOf가 더한다 */
export function seatBonusOf(obj: PlacedObject): number {
  return LEVEL_SEATS[levelOf(obj)] ?? 0;
}

/** 요금형 시설 이용료 (Lv +10%/+20%) — guests.ts useFacility 훅 */
export function facilityFee(_state: GameState, obj: PlacedObject): number {
  const fee = objectDef(obj.type).fee ?? 0;
  return Math.round(fee * (1 + (LEVEL_FEE_PCT[levelOf(obj)] ?? 0) / 100));
}

/** 농원 월 수확 배수 (감귤 6 → 9 → 12) — orchard.ts 훅 */
export function yieldMultOf(obj: PlacedObject): number {
  return LEVEL_YIELD_MULT[levelOf(obj)] ?? 1;
}
