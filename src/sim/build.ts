import type { GameState, PlacedObject, ApplyResult } from './types.ts';
import { objectDef } from '../data/index.ts';
import { dayIndex } from './effects.ts';
import { bumpLayoutRev } from './layoutRev.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { isDoorReachable } from './path.ts';
import { discoverPlacement } from './compat.ts';
import { josa } from './josa.ts';

export const DOOR_PATH_HINT = '문 앞까지 올렛길을 이어 주세요';

/** 완공된 것이 방인데 문 앞이 정류장과 안 이어졌으면 true (직원·손님 동선이 끊긴다) */
export function needsDoorPath(state: GameState, obj: PlacedObject): boolean {
  return objectDef(obj.type).room === true && !isDoorReachable(state, obj);
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

/** 마일리지 상점 아이템 (ease: 곡괭이 대신): 빠른 건축 망치 = 가지고 있으면 공사 −1일(최소 1일, 안 줄어든다) · 곰 삼춘의 망치 = 다음 공사 1건 즉시 완공(1개 소모) */
export const FAST_HAMMER_ITEM = 'fast_hammer';
export const INSTANT_HAMMER_ITEM = 'hammer_bearing';
/** 이 종류를 실제로 짓는 데 걸리는 날 (아이템 반영, 소모 없음) */
export function effectiveBuildDays(state: GameState, type: string): number {
  const base = buildDaysOf(type);
  if (base <= 0) return 0;
  if ((state.inventory[INSTANT_HAMMER_ITEM] ?? 0) > 0) return 0;
  return (state.inventory[FAST_HAMMER_ITEM] ?? 0) > 0 ? Math.max(1, base - 1) : base;
}

/** 놓은 직후: 건설 기간이 있으면 build 표식을 붙인다. 호출 전 canStartBuild. 곰 삼춘의 망치가 있으면 하나 쓰고 바로 완공. */
export function startBuild(state: GameState, obj: PlacedObject): void {
  const base = buildDaysOf(obj.type);
  if (base <= 0) return;
  if ((state.inventory[INSTANT_HAMMER_ITEM] ?? 0) > 0) {
    state.inventory[INSTANT_HAMMER_ITEM]! -= 1;
    pushNotice(state, `곰 삼춘의 망치! ${josa(objectDef(obj.type).name, '이/가')} 바로 완공됐어요`);
    return;
  }
  const days = effectiveBuildDays(state, obj.type);
  obj.build = { doneDay: dayIndex(state.clock) + days, days };
  bumpLayoutRev(state);
}

/** 남은 날 (완공이면 0) */
export function buildDaysLeft(state: GameState, obj: PlacedObject): number {
  return obj.build ? Math.max(0, obj.build.doneDay - dayIndex(state.clock)) : 0;
}

/** 매일: 기한이 된 건설을 완공 처리 (알림 + 반짝임 + 장면). 완공된 id 목록. */
export function advanceConstruction(state: GameState): string[] {
  const today = dayIndex(state.clock);
  const done: string[] = [];
  const names = new Map<string, number>(); // 같은 날 완공은 장면 창 하나로 (실내 테이블 ×3 · 큰 화분)
  let anyHint = false;
  for (const o of constructions(state)) {
    if (o.build!.doneDay > today) continue;
    delete o.build;
    bumpLayoutRev(state);
    const name = objectDef(o.type).name;
    done.push(o.id);
    const hint = needsDoorPath(state, o) ? ` — ${DOOR_PATH_HINT}` : '';
    if (hint) anyHint = true;
    pushNotice(state, `${name} 완공!${hint}`);
    pushFx(state, { kind: 'complete', x: o.x, y: o.y, tick: state.tick });
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  if (names.size > 0) {
    const list = [...names].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(' · ');
    pushFx(state, { kind: 'scene', title: '완공', text: anyHint ? `${list} 완공! ${DOOR_PATH_HINT}` : `${list} 완공! 손님을 맞을 준비가 됐어요`, tick: state.tick });
  }
  if (done.length > 0) discoverPlacement(state); // 명당은 완공된 시설만 센다
  return done;
}
