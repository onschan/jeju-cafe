import type { GameState, ApplyResult, SpotDef } from './types.ts';
import { SPOTS, spotDef } from '../data/index.ts';
import { unlockCondMet } from './segments.ts';
import { pushNotice } from './staff.ts';
import { josa } from './josa.ts';

export const SPOT_MAX_LEVEL = 5;
/** 매력도 40당 하루 손님 +1 */
export const APPEAL_PER_GUEST = 40;
/** Lv2 손님 해금, Lv3 투어 버스, Lv4 부탁·다음 관광지 */
export const SPOT_GUEST_LEVEL = 2;
export const SPOT_BUS_LEVEL = 3;
export const SPOT_QUEST_LEVEL = 4;
/** 투어 버스: 매주 일요일(7·14·21·28일) 11시에 4~6명 */
export const BUS_HOUR = 11;
export const BUS_MIN = 4;
export const BUS_MAX = 6;

export function spotLevel(state: GameState, id: string): number {
  return state.spots[id] ?? 0;
}

/** 투자할 수 있는 관광지인가: 시작 / 랭크 / 앞 관광지 Lv4 */
export function spotUnlocked(state: GameState, id: string): boolean {
  return unlockCondMet(state, spotDef(id).unlock);
}

/** 다음 레벨 (없으면 null = 최대) */
export function nextSpotLevel(state: GameState, id: string): { level: number; cost: number; appeal: number } | null {
  const def = spotDef(id);
  const lv = spotLevel(state, id);
  return def.levels.find((l) => l.level === lv + 1) ?? null;
}

export function spotAppealOf(def: SpotDef, level: number): number {
  return def.levels.find((l) => l.level === level)?.appeal ?? 0;
}

/** 투자한 관광지 매력도 합 */
export function spotAppeal(state: GameState): number {
  let sum = 0;
  for (const def of SPOTS) sum += spotAppealOf(def, spotLevel(state, def.id));
  return sum;
}

/** 매력도가 더해 주는 하루 손님 수 */
export function spotGuestBonus(state: GameState): number {
  return Math.floor(spotAppeal(state) / APPEAL_PER_GUEST);
}

export function canInvestSpot(state: GameState, id: string): ApplyResult {
  let def: SpotDef;
  try { def = spotDef(id); } catch { return { ok: false, reason: '없는 관광지예요' }; }
  if (!spotUnlocked(state, id)) return { ok: false, reason: '아직 투자할 수 없어요' };
  const next = nextSpotLevel(state, id);
  if (!next) return { ok: false, reason: `${josa(def.name, '은/는')} 최고 레벨이에요` };
  if (state.money < next.cost) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

/** 다음 레벨로 투자. 호출 전 canInvestSpot. 해금·부탁 제안은 호출자(actions)가 이어서 한다. */
export function investSpot(state: GameState, id: string): number {
  const next = nextSpotLevel(state, id)!;
  state.money -= next.cost;
  state.spots[id] = next.level;
  pushNotice(state, `${spotDef(id).name} Lv${next.level} 투자 완료`);
  return next.level;
}

/** 투어 버스가 오는 관광지들 (Lv3 이상, Lv2 손님 있음) */
export function busSpots(state: GameState): SpotDef[] {
  return SPOTS.filter((d) => spotLevel(state, d.id) >= SPOT_BUS_LEVEL && d.lv2GuestId);
}

export function isBusDay(day: number): boolean {
  return day % 7 === 0;
}
