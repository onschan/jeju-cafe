import type { GameState, PlacedObject, ApplyResult } from './types.ts';
import { objectDef } from '../data/index.ts';
import { dayIndex } from './effects.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { roomAt } from './grid.ts';
import { isDoorReachable } from './path.ts';

export const DOOR_PATH_HINT = '문 앞까지 올렛길을 이어 주세요';

/** 완공된 것이 방이거나 실내 오브젝트인데 그 방 문 앞이 정류장과 안 이어졌으면 true (손님이 못 들어온다) */
export function needsDoorPath(state: GameState, obj: PlacedObject): boolean {
  const def = objectDef(obj.type);
  const room = def.room ? obj : def.indoor ? roomAt(state, obj.x, obj.y) : null;
  return !!room && !isDoorReachable(state, room);
}

/** 시작 일꾼 삼춘 수 = 동시에 지을 수 있는 시설 수 (마일리지 상점에서 3·4·5번째를 고용한다) */
export const START_BUILDERS = 2;
export const MAX_BUILDERS = 5;

/** 이 종류를 지으면 걸리는 날 (0 = 즉시 완공: 밭·길·돌담·기본 오브젝트) */
export function buildDaysOf(type: string): number {
  return objectDef(type).buildDays ?? 0;
}

export function isUnderConstruction(obj: PlacedObject): boolean {
  return obj.build !== undefined;
}

/** 짓는 중인 오브젝트들 (놓은 순서) */
export function constructions(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => o.build !== undefined);
}

/** 일꾼이 남아 있나: 동시 건설 수 < 일꾼 수. 즉시 완공되는 종류는 일꾼이 필요 없다. */
export function canStartBuild(state: GameState, type: string): ApplyResult {
  if (buildDaysOf(type) <= 0) return { ok: true };
  if (constructions(state).length >= state.builders) return { ok: false, reason: `일꾼 삼춘이 모두 바빠요 (동시 건설 ${state.builders})` };
  return { ok: true };
}

/** 놓은 직후: 건설 기간이 있으면 build 표식을 붙인다. 호출 전 canStartBuild. */
export function startBuild(state: GameState, obj: PlacedObject): void {
  const days = buildDaysOf(obj.type);
  if (days <= 0) return;
  obj.build = { doneDay: dayIndex(state.clock) + days, days };
}

/** 남은 날 (완공이면 0) */
export function buildDaysLeft(state: GameState, obj: PlacedObject): number {
  return obj.build ? Math.max(0, obj.build.doneDay - dayIndex(state.clock)) : 0;
}

/** 매일: 기한이 된 건설을 완공 처리 (알림 + 반짝임 + 장면). 완공된 id 목록. */
export function advanceConstruction(state: GameState): string[] {
  const today = dayIndex(state.clock);
  const done: string[] = [];
  for (const o of constructions(state)) {
    if (o.build!.doneDay > today) continue;
    delete o.build;
    const name = objectDef(o.type).name;
    done.push(o.id);
    const hint = needsDoorPath(state, o) ? ` — ${DOOR_PATH_HINT}` : '';
    pushNotice(state, `${name} 완공!${hint}`);
    pushFx(state, { kind: 'complete', x: o.x, y: o.y, tick: state.tick });
    pushFx(state, { kind: 'scene', title: '완공', text: hint ? `${name} 완공! ${DOOR_PATH_HINT}` : `${name} 완공! 손님을 맞을 준비가 됐어요`, tick: state.tick });
  }
  return done;
}
