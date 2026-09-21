/**
 * 밤 조명 (fix-indoor): 가로등·정원등·초롱·석등이 밤(18시~)에 주변 칸을 밝힌다. 실내 칸은 늘 밝다.
 * - 가로등 불빛(반경 2) 안 야외 좌석: 저녁 손님 만족 +2 (스펙 점수, /10 = 경치 단위 0.2)
 * - 조명 없는 야외 좌석: 밤 만족 −2 ("어두워요") — 가로등을 둘 이유
 * 결정적: rng·Date를 쓰지 않는다. 조명 목록은 배치 서명 캐시.
 */
import type { GameState, PlacedObject, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import type { ObjectDef } from './types.ts';
import { layoutCached } from './layoutRev.ts';
import { cellAt, inBounds } from './grid.ts';

/** 밤 시작 시각 — 조명 효과·야외 어둠 페널티 */
export const NIGHT_HOUR = 18;
/** 조명 시설과 밝히는 반경(체비쇼프) */
export const LIGHT_RADIUS: Record<string, number> = { streetlight: 2, garden_lamp: 1, lantern_path: 1, stone_lantern: 1, deco_gate_lantern: 1 };
/** 가로등 불빛 안 야외 좌석 저녁 만족 (스펙 점수) */
export const STREETLIGHT_SAT = 2;
/** 조명 없는 야외 좌석 밤 만족 (스펙 점수) */
export const DARK_SAT = -2;
export const DARK_TEXT = '어두워요';

/** 좌석 정의인가 (kind seat 또는 seats 지정) */
function isSeatDef(d: ObjectDef): boolean {
  return d.kind === 'seat' || (d.seats ?? 0) > 0;
}

export function isNight(state: GameState): boolean {
  return state.clock.hour >= NIGHT_HOUR;
}
export function isLightType(type: string): boolean {
  return type in LIGHT_RADIUS;
}

const LIGHTS_CACHE = new WeakMap<GameState, { key: string; value: PlacedObject[] }>();
/** 완공된 조명 시설 */
export function lights(state: GameState): PlacedObject[] {
  return layoutCached(state, LIGHTS_CACHE, () => Object.values(state.objects).filter((o) => isLightType(o.type) && !o.build));
}

/** 칸의 조명: lit = 어떤 조명 반경 안(실내 포함), streetlight = 가로등 반경 안 */
export function lightAt(state: GameState, x: number, y: number): { lit: boolean; streetlight: boolean } {
  if (inBounds(state, x, y) && cellAt(state, x, y).roomId !== null) return { lit: true, streetlight: false };
  let lit = false, streetlight = false;
  for (const l of lights(state)) {
    if (Math.max(Math.abs(l.x - x), Math.abs(l.y - y)) > LIGHT_RADIUS[l.type]!) continue;
    lit = true;
    if (l.type === 'streetlight') streetlight = true;
  }
  return { lit, streetlight };
}
/** 조명 시설이 밝히는 칸들 (렌더·안내용) */
export function litCellsOf(light: Pt & { type: string }): Pt[] {
  const r = LIGHT_RADIUS[light.type] ?? 0;
  const out: Pt[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.push({ x: light.x + dx, y: light.y + dy });
  return out;
}

/** 야외 좌석의 밤 만족(스펙 점수): 가로등 +2 · 다른 조명 0 · 조명 없음 −2. 낮·실내·좌석 아님은 0. */
export function nightSeatPoints(state: GameState, seat: PlacedObject): number {
  if (!isNight(state) || !isSeatDef(objectDef(seat.type)) || cellAt(state, seat.x, seat.y).roomId !== null) return 0;
  const l = lightAt(state, seat.x, seat.y);
  return l.streetlight ? STREETLIGHT_SAT : l.lit ? 0 : DARK_SAT;
}
/** 만족 훅 (guests.ts extraSatisfaction): 경치 단위 = 스펙 점수 / 10 */
export function nightSatisfaction(state: GameState, seat: PlacedObject): number {
  return nightSeatPoints(state, seat) / 10;
}

/** 좌석 카드 줄: 밤이 아니어도 자리의 조명 상태를 알려 준다. 좌석이 아니거나 실내면 null. */
export function nightSeatLine(state: GameState, seat: PlacedObject): { text: string; bad: boolean } | null {
  if (!isSeatDef(objectDef(seat.type)) || cellAt(state, seat.x, seat.y).roomId !== null) return null;
  const l = lightAt(state, seat.x, seat.y);
  if (l.streetlight) return { text: `밤 불빛: 가로등 (저녁 만족 +${STREETLIGHT_SAT})`, bad: false };
  if (l.lit) return { text: '밤 불빛: 은은해요 (어둡지 않아요)', bad: false };
  return { text: `밤엔 ${DARK_TEXT} (만족 ${DARK_SAT}) — 가로등·정원등을 두세요`, bad: true };
}
