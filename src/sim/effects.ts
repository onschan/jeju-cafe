import type { GameState, ActiveEffect, EventFilter, Clock } from './types.ts';
import { guestTypeDef, canonicalGuestId } from '../data/index.ts';
import { monthIndex, DAYS_PER_MONTH } from './clock.ts';

/** 절대 일 인덱스 (1년 1월 1일 = 0) — 기간형 이벤트 효과의 만료 기준 */
export function dayIndex(c: Clock): number {
  return monthIndex(c) * DAYS_PER_MONTH + (c.day - 1);
}

/** 이벤트 필터가 이 손님 타입에 해당하나 */
export function filterMatches(filter: EventFilter | undefined, typeId: string): boolean {
  if (!filter || filter === 'all') return true;
  const id = canonicalGuestId(typeId);
  if (typeof filter === 'object') return canonicalGuestId(filter.guestId) === id;
  const def = guestTypeDef(id);
  const t = def.tags;
  switch (filter) {
    case 'group': return t.group;
    case 'female': case 'male': return t.gender === filter;
    case 'youth': case 'adult': case 'senior': return t.age === filter;
    case 'local': return t.age === 'senior';                      // 삼춘 손님
    case 'tourist': return t.age === 'youth' || t.age === 'adult'; // 육지 손님
    case 'family': return def.chain === 'c05_family' || t.group;
  }
}

export function addEffect(state: GameState, e: { kind: ActiveEffect['kind']; mult: number; filter?: EventFilter; days: number; source: string }): void {
  state.effects.push({ kind: e.kind, mult: e.mult, filter: e.filter, untilDay: dayIndex(state.clock) + e.days, source: e.source });
}

/** 만료된 효과 제거 (매일) */
export function pruneEffects(state: GameState): void {
  const today = dayIndex(state.clock);
  state.effects = state.effects.filter((e) => e.untilDay > today);
}

function active(state: GameState): ActiveEffect[] {
  const today = dayIndex(state.clock);
  return state.effects.filter((e) => e.untilDay > today);
}

/** 활성 효과 배수의 곱. typeId를 주면 손님 필터가 있는 것 중 맞는 것만(타입 가중치용), 안 주면 필터 없는(전체) 것만(하루 손님 수용). */
export function effectMult(state: GameState, kind: ActiveEffect['kind'], typeId?: string): number {
  let m = 1;
  for (const e of active(state)) {
    if (e.kind !== kind) continue;
    const global = !e.filter || e.filter === 'all';
    if (typeId === undefined ? !global : global || !filterMatches(e.filter, typeId)) continue;
    m *= e.mult;
  }
  return m;
}

/** 오늘 손님이 0인가 (정전·결빙 등) */
export function noGuestsToday(state: GameState): boolean {
  return active(state).some((e) => e.kind === 'noGuests');
}
