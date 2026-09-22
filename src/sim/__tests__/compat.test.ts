import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { placeObject, objectScenery, sceneryScore } from '../grid.ts';
import { objectStats, popularityFor, setLevels, discoverPlacement, BASE_POPULARITY, POPULARITY_CAP } from '../compat.ts';
import { objectDef, SETS } from '../../data/index.ts';
import type { SetDef } from '../types.ts';

test('데이터: 세트는 필요 시설과 레벨 3단계를 갖는다', () => {
  expect(SETS.length).toBeGreaterThan(0);
  expect(new Set(SETS.map((x) => x.id)).size).toBe(SETS.length);
  for (const st of SETS) { expect(st.requires.length).toBeGreaterThan(0); expect(st.levelMult.length).toBe(3); }
});

test('objectStats: 상성 없이 기본 인기 10·요금 100%', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(6), Y(4));
  const base = objectStats(s, t.id);
  expect(base.popularity).toBe(BASE_POPULARITY);
  expect(base.feePct).toBe(100);
  expect(base.upkeep).toBe(objectDef('table_out').upkeep);
  expect(base.corner).toEqual({ pop: 0, feePct: 0 });
  // 곁에 나무를 놓아도 콤보는 없다 (trim: 코너만 남았다)
  placeObject(s, 'tangerine_tree', X(7), Y(4));
  expect(objectStats(s, t.id).popularity).toBe(BASE_POPULARITY);
});

test('강화 아이템 인기는 상한 40에서 멈춘다', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(7), Y(4));
  s.itemBonus['table_out'] = { popularity: 50, feePct: 0 };
  expect(objectStats(s, t.id).popularity).toBe(POPULARITY_CAP);
});

const EMO = SETS.find((x) => x.id.includes('emotional'))!;

test('세트: 반경 3 안에 필요 시설이 1배·2배·3배면 레벨 1·2·3', () => {
  expect(EMO.requires).toEqual(expect.arrayContaining([{ objectId: 'tangerine_tree', count: 2 }, { objectId: 'table_out', count: 2 }, { objectId: 'stonewall', count: 1 }]));
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(6), Y(4));
  placeObject(s, 'tangerine_tree', X(7), Y(4));
  placeObject(s, 'stonewall', X(8), Y(4));
  expect(setLevels(s, t.id, [EMO])).toEqual([]); // 테이블 1, 나무 1
  placeObject(s, 'table_out', X(6), Y(5));
  placeObject(s, 'tangerine_tree', X(7), Y(5));
  expect(setLevels(s, t.id, [EMO])[0]).toMatchObject({ id: EMO.id, level: 1, mult: 1.1 });
  placeObject(s, 'table_out', X(8), Y(5)); placeObject(s, 'table_out', X(9), Y(5));
  placeObject(s, 'tangerine_tree', X(9), Y(4)); placeObject(s, 'tangerine_tree', X(9), Y(3));
  expect(setLevels(s, t.id, [EMO])[0]!.level).toBe(1); // 돌담 1개 → 아직 1
  placeObject(s, 'stonewall', X(8), Y(3));
  expect(setLevels(s, t.id, [EMO])[0]).toMatchObject({ level: 2, mult: 1.2 });
  placeObject(s, 'table_out', X(5), Y(3)); placeObject(s, 'table_out', X(5), Y(5));
  placeObject(s, 'tangerine_tree', X(5), Y(4)); placeObject(s, 'tangerine_tree', X(4), Y(4));
  placeObject(s, 'stonewall', X(4), Y(3));
  expect(setLevels(s, t.id, [EMO])[0]).toMatchObject({ level: 3, mult: 1.35 });
  // 반경 밖(4칸)의 것은 안 센다
  const s2 = bareState(1);
  const t2 = placeObject(s2, 'table_out', X(2), Y(4));
  placeObject(s2, 'table_out', X(6), Y(4)); placeObject(s2, 'tangerine_tree', X(6), Y(5)); placeObject(s2, 'tangerine_tree', X(6), Y(3)); placeObject(s2, 'stonewall', X(6), Y(6));
  expect(setLevels(s2, t2.id, [EMO])).toEqual([]);
});

test('세트 배수는 대상 태그 손님에게만 인기를 곱한다', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(6), Y(4));
  placeObject(s, 'table_out', X(6), Y(5));
  placeObject(s, 'tangerine_tree', X(7), Y(4)); placeObject(s, 'tangerine_tree', X(7), Y(5));
  placeObject(s, 'stonewall', X(8), Y(4));
  const youthSet: SetDef = { ...EMO, target: 'youth' };
  const st = objectStats(s, t.id, [youthSet]);
  expect(st.sets).toEqual([{ id: EMO.id, name: EMO.name, level: 1, target: 'youth', mult: 1.1 }]);
  expect(st.popularity).toBe(BASE_POPULARITY); // 전체 대상이 아니라 기본 인기는 그대로
  expect(popularityFor(s, t.id, 'student', [youthSet])).toBe(Math.round(BASE_POPULARITY * 1.1));
  expect(popularityFor(s, t.id, 'local_auntie', [youthSet])).toBe(BASE_POPULARITY);
  const allSet: SetDef = { ...EMO, target: 'all' };
  expect(objectStats(s, t.id, [allSet]).popularity).toBe(Math.round(BASE_POPULARITY * 1.1));
  // 세트 완성은 도감에 오르고 알림
  discoverPlacement(s, [youthSet]);
  expect(s.codex.sets).toEqual([EMO.id]);
  expect(s.notices.some((n) => n.includes(EMO.name))).toBe(true);
});

test('계절 경치: 유채는 봄에 +12, 상한 30', () => {
  const canola = { ...objectDef('stonewall'), id: 'canola', scenery: 2 };
  expect(objectScenery(canola, 'spring')).toBe(14);
  expect(objectScenery(canola, 'summer')).toBe(2);
  const own = { ...canola, seasonScenery: { summer: 40 } };
  expect(objectScenery(own, 'summer')).toBe(30);
  expect(objectScenery(own, 'spring')).toBe(2); // 정의에 seasonScenery가 있으면 표는 안 본다
  // objectStats.scenery는 자기 경치 + 계절 (돌담은 계절 없음)
  const s = bareState(1);
  const w = placeObject(s, 'stonewall', X(6), Y(4));
  expect(objectStats(s, w.id).scenery).toBe(objectDef('stonewall').scenery);
  // 주변 경치 점수도 같은 헬퍼를 쓴다 (돌담 +1)
  expect(sceneryScore(s, X(7), Y(4))).toBe(1);
});

// ---------- 손님·경제 연결 ----------
import { spawnGuests, updateGuests, popularityBonus, POP_PER_SCENERY } from '../guests.ts';
import { setSlot } from '../menu.ts';
import { upkeep, UPKEEP_RATE, DATA_UPKEEP_RATE } from '../economy.ts';
import { PREP_MS } from '../guests.ts';

test('좌석 요금 배수: 기본 100%면 메뉴 가격 그대로 받는다', () => {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5)); // 정낭 (4,6) 위
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 5;
  expect(spawnGuests(s, 1)).toBe(1);
  const m0 = s.money;
  updateGuests(s, 30_000);
  expect(s.guests[0]!.phase).toBe('seated');
  expect(s.money).toBe(m0 + 4000);
});

test('만족: 인기 보너스는 기본 10에서 3마다 경치 1점', () => {
  expect(popularityBonus(BASE_POPULARITY)).toBe(0);
  expect(popularityBonus(BASE_POPULARITY + POP_PER_SCENERY)).toBe(1);
  expect(popularityBonus(BASE_POPULARITY - POP_PER_SCENERY)).toBe(-1);
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5));
  placeObject(s, 'tangerine_tree', X(5), Y(5));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 5;
  s.segmentPopularity = { local: 0, tourist: 99 };
  s.itemBonus['table_out'] = { popularity: POP_PER_SCENERY, feePct: 0 }; // 인기 +3 → 경치 보너스 +1
  spawnGuests(s, 1);
  s.guests[0]!.type = 'student';
  updateGuests(s, 30_000);
  updateGuests(s, PREP_MS);
  expect(s.guests[0]!.mood).toBe('happy');
});

test('유지비는 objectStats.upkeep을 쓴다 (economy.upkeepOf: 1.5% 데이터 → 2.5%/월)', () => {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5));
  const m0 = s.money;
  upkeep(s);
  expect(m0 - s.money).toBe(Math.round(objectStats(s, Object.values(s.objects).find((o) => o.type === 'table_out')!.id).upkeep * (UPKEEP_RATE / DATA_UPKEEP_RATE)));
});
