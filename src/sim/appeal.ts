/**
 * 카페 매력도 (fun 통합, 사용자 피드백 「경관이 뭘 위해 있는지 부족하다 — 전략 시뮬로서의 재미」).
 * 지표 3개: 인기(동네 손님 ← 시설·홍보) / 경관(관광객 ← 정원·코너·전망) / 서비스(만족·단골 ← 직원·주방·자리 점수).
 * - 경관의 목적을 sim에 명시: 자리 평균 경치(cafeScenery)가 관광객 태그 손님의 스폰 배수(sceneryTouristMult, ×0.85~×1.25)이고,
 *   손님이 사진을 찍으면(photo fx) 그날 밤 평판 +0.02/장(하루 +0.15 상한) — 입소문 → 평판 → 이름 있는 손님·단골.
 * - 경관 시설 카드에 "관광객 +n%/일": sceneryGainText.
 * 결정적: rng 안 씀.
 */
import type { GameState } from './types.ts';
import { objectDef } from '../data/index.ts';
import { sceneryScore, objectScenery, itemScenery, SCENERY_RADIUS } from './grid.ts';
import { facilityPopularitySum } from './guests.ts';
import { isSeat } from './cafe.ts';
import { filterMatches } from './effects.ts';
import { seasonOf } from './clock.ts';
import { layoutSig } from './layoutRev.ts';

/** 인기 막대가 가득 차는 시설 인기 합 (3년차 봇 175, 5년차 444) · 이보다 낮으면 병목 */
export const POPULARITY_FULL = 300;
export const POPULARITY_LOW = 40;
/** 자리 이용률이 이 이상이면 병목 */
export const SEAT_USE_HIGH = 0.9;
/** 관광객 스폰 배수 = clamp(SCENERY_MULT_BASE + SCENERY_MULT_PER × 평균 경치, MIN, MAX): 경치 3.5(1년차) ≈ ×0.99, 5 ≈ ×1.05, 8 ≈ ×1.17, 10+ = ×1.25 */
export const SCENERY_MULT_BASE = 0.85;
export const SCENERY_MULT_PER = 0.04;
export const SCENERY_MULT_MIN = 0.85;
export const SCENERY_MULT_MAX = 1.15; // 1.25면 5년차 자금이 KPI(2억)를 넘는다
/** 사진 한 장 = 그날 밤 평판 +0.02, 하루 +0.15까지 (0.05/0.5는 1년차 순이익이 밴드 위(1,086만)로 튀었다) */
export const PHOTO_REPUTATION = 0.02;
export const PHOTO_REPUTATION_DAY_CAP = 0.15;

/** 자리(좌석) 평균 경치 — 자리가 없으면 0 */
export function cafeScenery(state: GameState): number {
  const seats = Object.values(state.objects).filter((o) => !o.build && isSeat(state, o));
  if (seats.length === 0) return 0;
  return seats.reduce((a, o) => a + sceneryScore(state, o.x, o.y), 0) / seats.length;
}
export function sceneryMultOf(scenery: number): number {
  return Math.max(SCENERY_MULT_MIN, Math.min(SCENERY_MULT_MAX, SCENERY_MULT_BASE + SCENERY_MULT_PER * scenery));
}
/** guests.ts typeWeight 훅: 관광객 태그 손님만 경관 배수 */
export function sceneryTouristMult(state: GameState, typeId: string): number {
  if (!filterMatches('tourist', typeId)) return 1;
  return sceneryMultOf(cafeSceneryCached(state));
}
/** 관광객 배수를 %로 ("관광객 +12%/일") */
export function touristPctText(scenery: number): string {
  const pct = Math.round((sceneryMultOf(scenery) - 1) * 100);
  return `관광객 ${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%/일`;
}
/** 이 경관 시설을 (x, y)에 놓으면 반경 2 안 자리들의 경치가 올라 관광객이 몇 % 더 오나 (카드 즉시 수치). 자리가 없으면 시설 경치만. */
export function sceneryGainText(state: GameState, type: string, x: number, y: number): string {
  const def = objectDef(type);
  const gain = objectScenery(def, seasonOf(state.clock.month), itemScenery(state, type)) - def.noise;
  if (gain === 0) return '';
  const seats = Object.values(state.objects).filter((o) => !o.build && isSeat(state, o));
  const near = seats.filter((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= SCENERY_RADIUS).length;
  if (seats.length === 0 || near === 0) return `경관 ${gain > 0 ? '+' : ''}${gain} · 자리 옆이면 관광객이 는다`;
  const before = cafeScenery(state);
  const after = before + (gain * near) / seats.length;
  const pct = Math.round((sceneryMultOf(after) - sceneryMultOf(before)) * 100);
  return `경관 ${gain > 0 ? '+' : ''}${gain} · 관광객 ${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%/일`;
}

/** 프레임 안 반복 호출용 캐시 (배치 서명·달이 바뀌면 다시 센다) */
const CACHE = new WeakMap<GameState, { key: string; value: number }>();
function cafeSceneryCached(state: GameState): number {
  const key = `${layoutSig(state)}|${state.clock.month}`;
  const c = CACHE.get(state);
  if (c && c.key === key) return c.value;
  const value = cafeScenery(state);
  CACHE.set(state, { key, value });
  return value;
}

/** 사진 fx 훅 (guests.ts): 오늘 사진 수를 센다 */
export function notePhoto(state: GameState): void {
  state.dayPhotos = (state.dayPhotos ?? 0) + 1;
}
/** 밤 평판 훅 (reputation.ts nightlyReputation): 오늘 사진 × 0.02 (상한 0.15), 세고 나면 0 */
export function photoReputationDelta(state: GameState): number {
  const n = state.dayPhotos ?? 0;
  state.dayPhotos = 0;
  return Math.min(PHOTO_REPUTATION_DAY_CAP, n * PHOTO_REPUTATION);
}

// ---------- 매력도 패널 ----------

export interface AppealRow { key: 'popularity' | 'scenery' | 'service'; label: string; value: number; max: number; unit: string; howTo: [string, string]; bottleneck: string }
export interface Appeal { rows: AppealRow[]; scenery: number; seatUse: number; satisfaction: number }
/** 경영 현황 첫 화면 「카페 매력도」: 인기·경관·서비스 3개 + 올리는 법 2줄 + 지금 병목 한 줄 (문구 규칙 §6, ≤22자) */
export function appealOf(state: GameState, seatUse: number): Appeal {
  const scenery = cafeScenery(state);
  const d = state.dayStats;
  const satisfaction = d.total > 0 ? d.satisfied / d.total : state.stats.satisfiedTotal > 0 && state.totalGuests > 0 ? state.stats.satisfiedTotal / state.totalGuests : 0;
  const staffN = state.staff.length;
  const pop = Math.round(facilityPopularitySum(state)); // 시설 인기 합 (state.popularity는 동네↔관광객 축이라 다른 값)
  const rows: AppealRow[] = [
    {
      key: 'popularity', label: '인기', value: pop, max: POPULARITY_FULL, unit: '', howTo: ['시설을 놓으면 인기가 쌓인다', '전단·홍보로 동네에 알린다'],
      bottleneck: pop < POPULARITY_LOW ? '인기가 낮아 손님이 적다' : seatUse >= SEAT_USE_HIGH ? '자리가 모자라 손님이 돌아간다' : '',
    },
    {
      key: 'scenery', label: '경관', value: Math.round(scenery * 10) / 10, max: 15, unit: '', howTo: ['자리 옆에 정원·코너를 둔다', '전망 좋은 땅(오름·바다)을 산다'],
      bottleneck: scenery < 4 ? `경관 ${Math.round(scenery)} — 관광객이 안 온다` : '',
    },
    {
      key: 'service', label: '서비스', value: Math.round(satisfaction * 100), max: 100, unit: '%', howTo: ['홀·바리스타를 뽑고 연수한다', '주방을 넓히면 조리가 빠르다'],
      bottleneck: staffN === 0 ? '직원이 없어 서빙이 느리다' : satisfaction < 0.6 ? '만족이 낮다 — 불만 1위를 본다' : '',
    },
  ];
  return { rows, scenery, seatUse, satisfaction };
}
