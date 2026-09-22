import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { dayIndex } from '../effects.ts';
import { objectAt } from '../grid.ts';
import { buildDaysOf, effectiveBuildDays, constructions, buildDaysLeft, canStartBuild, START_BUILDERS, FAST_HAMMER_ITEM, INSTANT_HAMMER_ITEM } from '../build.ts';
import { seatsOf } from '../cafe.ts';
import { freeSeats } from '../guests.ts';
import { FACILITIES, objectDef, BUILD_DAYS_BY_TIER } from '../../data/index.ts';

/** 건설 기간이 있는 야외 좌석 v2 시설 (테라스 좌석 등). v3에선 목표 보상으로 열리므로 테스트에서 직접 해금한다 */
const BUILT = FACILITIES.find((f) => (f.buildDays ?? 0) > 0 && f.kind === 'seat' && !f.indoor)!;

test('데이터: v2 시설은 소/중/대 → 1/3/7일, 기본 오브젝트(당근밭·길·야외 테이블)는 즉시', () => {
  expect(BUILD_DAYS_BY_TIER).toEqual({ small: 1, medium: 3, large: 7 });
  expect(FACILITIES.every((f) => (f.buildDays ?? 0) >= 1)).toBe(true);
  expect(new Set(FACILITIES.map((f) => f.buildDays))).toEqual(new Set([1, 3, 7]));
  for (const t of ['carrot_field', 'path', 'table_out', 'tangerine_tree', 'stonewall']) expect(buildDaysOf(t)).toBe(0);
  expect(FACILITIES.every((f) => f.category !== undefined)).toBe(true);
});

test('건설: 놓으면 build 표식(남은 날), 좌석은 앉을 수 없고, 날이 지나면 완공 알림·반짝임·장면', () => {
  const s = bareState(1);
  s.money = 100_000_000;
  s.unlocked.objects.push(BUILT.id);
  const days = buildDaysOf(BUILT.id);
  expect(days).toBeGreaterThan(0);
  expect(apply(s, { type: 'place', objectType: BUILT.id, x: X(6), y: Y(4) }).ok).toBe(true);
  const o = objectAt(s, X(6), Y(4))!;
  expect(o.build).toEqual({ doneDay: dayIndex(s.clock) + days, days });
  expect(buildDaysLeft(s, o)).toBe(days);
  expect(seatsOf(s, o)).toBe(0);
  expect(freeSeats(s).map((x) => x.id)).not.toContain(o.id);
  expect(constructions(s)).toHaveLength(1);
  for (let d = 0; d < days - 1; d++) tick(s, DAY_MS);
  tick(s, DAY_MS / 2);
  expect(o.build).toBeDefined();
  tick(s, DAY_MS);
  expect(o.build).toBeUndefined();
  expect(seatsOf(s, o)).toBe(objectDef(BUILT.id).seats);
  expect(s.notices).toContain(`${BUILT.name} 완공!`);
  expect(s.fx.some((f) => f.kind === 'complete' && f.x === o.x && f.y === o.y)).toBe(true);
  expect(s.fx.some((f) => f.kind === 'scene' && f.text.includes(`${BUILT.name} 완공!`))).toBe(true);
});

test('동시 건설은 일꾼 수(기본 2)까지, 목표 보상으로 늘어난다. 즉시 완공 종류는 일꾼이 필요 없다.', () => {
  const s = bareState(1);
  s.money = 100_000_000;
  s.unlocked.objects.push(BUILT.id);
  expect(s.builders).toBe(START_BUILDERS);
  expect(apply(s, { type: 'place', objectType: BUILT.id, x: X(6), y: Y(4) }).ok).toBe(true);
  expect(apply(s, { type: 'place', objectType: BUILT.id, x: X(7), y: Y(4) }).ok).toBe(true);
  const r = apply(s, { type: 'place', objectType: BUILT.id, x: X(8), y: Y(4) });
  expect(r.ok).toBe(false);
  expect(r.reason).toContain('일꾼');
  expect(canStartBuild(s, 'table_out').ok).toBe(true);
  expect(apply(s, { type: 'place', objectType: 'table_out', x: X(8), y: Y(4) }).ok).toBe(true);
  s.builders += 1; // trim: 일꾼은 목표 보상(builder)으로만 는다
  expect(apply(s, { type: 'place', objectType: BUILT.id, x: X(9), y: Y(4) }).ok).toBe(true);
  expect(constructions(s)).toHaveLength(3);
});

test('ease 망치 아이템: 빠른 건축 망치는 공사 −1일(최소 1일, 안 줄어듦), 곰 삼춘의 망치는 다음 공사 1건 즉시 완공(1개 소모)', () => {
  const s = bareState(1);
  s.money = 100_000_000;
  s.unlocked.objects.push(BUILT.id);
  const base = buildDaysOf(BUILT.id);
  expect(effectiveBuildDays(s, BUILT.id)).toBe(base);
  expect(effectiveBuildDays(s, 'path')).toBe(0);
  s.inventory[FAST_HAMMER_ITEM] = 1;
  expect(effectiveBuildDays(s, BUILT.id)).toBe(Math.max(1, base - 1));
  expect(apply(s, { type: 'place', objectType: BUILT.id, x: X(6), y: Y(4) }).ok).toBe(true);
  const o = objectAt(s, X(6), Y(4))!;
  expect(o.build).toEqual({ doneDay: dayIndex(s.clock) + Math.max(1, base - 1), days: Math.max(1, base - 1) });
  expect(s.inventory[FAST_HAMMER_ITEM]).toBe(1);
  s.inventory[INSTANT_HAMMER_ITEM] = 1;
  expect(effectiveBuildDays(s, BUILT.id)).toBe(0);
  expect(apply(s, { type: 'place', objectType: BUILT.id, x: X(1), y: Y(4) }).ok).toBe(true);
  const o2 = objectAt(s, X(1), Y(4))!;
  expect(o2.build).toBeUndefined();
  expect(s.inventory[INSTANT_HAMMER_ITEM]).toBe(0);
  expect(s.notices.at(-1)).toContain('곰 삼춘의 망치');
  expect(effectiveBuildDays(s, BUILT.id)).toBe(Math.max(1, base - 1));
});
