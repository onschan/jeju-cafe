import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { placeObject, objectScenery, sceneryScore } from '../grid.ts';
import { activeCombos, objectStats, segmentBonus, popularityFor, setLevels, discoverCombos, BASE_POPULARITY, POPULARITY_CAP } from '../compat.ts';
import { apply } from '../actions.ts';
import { objectDef, COMBOS, SETS, COMBO_META, comboDef } from '../../data/index.ts';
import type { ComboDef, SetDef } from '../types.ts';

const VIEW = COMBOS.find((c) => c.a === 'table_out' && c.bIds.includes('tangerine_tree'))!;

test('데이터: 귤밭 뷰 콤보는 표에서 ↑·비히든·전체 또는 청년(관광객) 대상으로 읽힌다', () => {
  expect(VIEW).toBeDefined();
  expect(VIEW.strength).toBe('up');
  expect(VIEW.hidden).toBe(false);
  expect(['all', 'youth']).toContain(VIEW.target);
  expect(VIEW.name).toBe('귤밭 뷰');
  expect(comboDef(VIEW.id)).toBe(VIEW);
  // 모든 콤보 id는 유일하고 radius·bCount가 양수
  expect(new Set(COMBOS.map((c) => c.id)).size).toBe(COMBOS.length);
  for (const c of COMBOS) { expect(c.bCount).toBeGreaterThan(0); expect(c.radius).toBeGreaterThan(0); expect(c.bIds.length).toBeGreaterThan(0); }
  for (const st of SETS) { expect(st.requires.length).toBeGreaterThan(0); expect(st.levelMult.length).toBe(3); }
});

test('상성 거리: 체비쇼프 2칸이면 발동, 3칸이면 아니다', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(6), Y(4));
  expect(activeCombos(s, t.id)).toEqual([]);
  const tree = placeObject(s, 'tangerine_tree', X(8), Y(2)); // dx 2, dy 2
  expect(activeCombos(s, t.id).map((c) => c.id)).toEqual([VIEW.id]);
  expect(activeCombos(s, t.id)[0]!.side).toBe('a');
  // 3칸 떨어진 나무는 안 센다
  const s2 = bareState(1);
  const t2 = placeObject(s2, 'table_out', X(6), Y(4));
  placeObject(s2, 'tangerine_tree', X(9), Y(4));
  expect(activeCombos(s2, t2.id)).toEqual([]);
  void tree;
});

/** 테스트용 콤보: 3×2 폐창고 근처의 테이블. 발자국 어느 칸이든 2칸 안이면 발동 */
const BIG: ComboDef = { id: 'cb_test_big', name: '창고 옆', a: 'table_out', bIds: ['warehouse'], bCount: 1, target: 'all', strength: 'upup', applyTo: 'both', hidden: false, radius: 2, effectText: '테스트' };

test('상성 거리: 여러 칸 오브젝트는 가장 가까운 발자국 칸으로 잰다', () => {
  const s = bareState(1); // 폐창고 (3,1) 3×2 → x 3..5, y 1..2
  const near = placeObject(s, 'table_out', X(7), Y(4)); // (5,2)에서 dx 2, dy 2
  const far = placeObject(s, 'table_out', X(8), Y(4));  // dx 3
  expect(activeCombos(s, near.id, [BIG]).map((c) => c.id)).toEqual(['cb_test_big']);
  expect(activeCombos(s, far.id, [BIG])).toEqual([]);
  // B 쪽(창고)도 applyTo both라 발동 목록에 오른다
  const wh = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  expect(activeCombos(s, wh.id, [BIG])[0]?.side).toBe('b');
});

test('bCount: 필요 개수만큼 B가 있어야 발동', () => {
  const two: ComboDef = { ...BIG, id: 'cb_two', bIds: ['tangerine_tree'], bCount: 2, applyTo: 'a' };
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(6), Y(4));
  placeObject(s, 'tangerine_tree', X(7), Y(4));
  expect(activeCombos(s, t.id, [two])).toEqual([]);
  placeObject(s, 'tangerine_tree', X(5), Y(4));
  expect(activeCombos(s, t.id, [two]).length).toBe(1);
});

test('objectStats: 기본 인기 10·요금 100%에 ↑ 콤보가 +3/+5%를 더한다', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(6), Y(4));
  const base = objectStats(s, t.id);
  expect(base.popularity).toBe(BASE_POPULARITY);
  expect(base.feePct).toBe(100);
  expect(base.upkeep).toBe(objectDef('table_out').upkeep);
  placeObject(s, 'tangerine_tree', X(7), Y(4));
  const st = objectStats(s, t.id);
  expect(st.popularity).toBe(BASE_POPULARITY + COMBO_META.up.pop);
  expect(st.feePct).toBe(100 + COMBO_META.up.feePct);
  expect(st.combos.map((c) => c.name)).toEqual(['귤밭 뷰']);
});

test('↑↑·↓ 콤보 값과 인기 상한 40', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(7), Y(4));
  expect(objectStats(s, t.id, [BIG]).popularity).toBe(BASE_POPULARITY + COMBO_META.upup.pop);
  expect(objectStats(s, t.id, [BIG]).feePct).toBe(100 + COMBO_META.upup.feePct);
  const down: ComboDef = { ...BIG, id: 'cb_down', strength: 'down' };
  expect(objectStats(s, t.id, [down]).popularity).toBe(BASE_POPULARITY + COMBO_META.down.pop);
  expect(objectStats(s, t.id, [down]).feePct).toBe(100 + COMBO_META.down.feePct);
  s.itemBonus['table_out'] = { popularity: 30, feePct: 0 };
  expect(objectStats(s, t.id, [BIG]).popularity).toBe(POPULARITY_CAP);
});

test('대상 손님층 콤보는 그 태그의 손님층 인기에 ±3', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(7), Y(4));
  const senior: ComboDef = { ...BIG, id: 'cb_senior', target: 'senior', strength: 'up' };
  const bonus = segmentBonus(s, t.id, [senior]);
  expect(bonus['local_auntie']).toBe(COMBO_META.segmentPopularity); // 삼춘 = 시니어
  expect(bonus['student'] ?? 0).toBe(0);
  expect(popularityFor(s, t.id, 'local_auntie', [senior], [])).toBe(BASE_POPULARITY + COMBO_META.up.pop + COMBO_META.segmentPopularity);
  expect(popularityFor(s, t.id, 'student', [senior], [])).toBe(BASE_POPULARITY + COMBO_META.up.pop);
  const downGroup: ComboDef = { ...senior, id: 'cb_dg', target: 'group', strength: 'down' };
  const dg = segmentBonus(s, t.id, [downGroup]);
  expect(dg['rentcar_family']).toBe(-COMBO_META.segmentPopularity); // 단체 타입만
  expect(dg['local_auntie']).toBeUndefined();
});

test('히든 상성은 처음 발동할 때 한 번만 도감에 오르고 알림이 난다', () => {
  const s = bareState(1);
  const hidden: ComboDef = { ...BIG, id: 'cb_hidden', name: '비밀 창고', hidden: true };
  placeObject(s, 'table_out', X(7), Y(4));
  const n0 = s.notices.length;
  discoverCombos(s, [hidden], []);
  expect(s.codex.combos).toEqual(['cb_hidden']);
  expect(s.notices.length).toBe(n0 + 1);
  expect(s.notices[n0]).toContain('비밀 창고');
  placeObject(s, 'table_out', X(6), Y(3));
  discoverCombos(s, [hidden], []);
  expect(s.codex.combos).toEqual(['cb_hidden']);
  expect(s.notices.length).toBe(n0 + 1);
  // 보통 상성도 처음 발동하면 메시지 줄 한 줄 (game-feel: 선택의 결과가 보이게) + 첫 상성은 장면 창
  const s2 = bareState(1);
  placeObject(s2, 'table_out', X(7), Y(4));
  discoverCombos(s2, [BIG], []);
  expect(s2.codex.combos).toEqual(['cb_test_big']);
  expect(s2.notices.length).toBe(1);
  expect(s2.notices[0]).toContain('상성 발견');
  expect(s2.fx.some((f) => f.kind === 'scene' && f.title === '첫 상성')).toBe(true);
  const n2 = s2.notices.length;
  discoverCombos(s2, [BIG], []); // 두 번째 판정에선 조용
  expect(s2.notices.length).toBe(n2);
});

test('place 액션이 상성 발견을 돌린다', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: X(6), y: Y(4) });
  expect(s.codex.combos).toEqual([]);
  apply(s, { type: 'place', objectType: 'tangerine_tree', x: X(7), y: Y(4) });
  expect(s.codex.combos).toEqual([VIEW.id]);
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
  const st = objectStats(s, t.id, [], [youthSet]);
  expect(st.sets).toEqual([{ id: EMO.id, name: EMO.name, level: 1, target: 'youth', mult: 1.1 }]);
  expect(st.popularity).toBe(BASE_POPULARITY); // 전체 대상이 아니라 기본 인기는 그대로
  expect(popularityFor(s, t.id, 'student', [], [youthSet])).toBe(Math.round(BASE_POPULARITY * 1.1));
  expect(popularityFor(s, t.id, 'local_auntie', [], [youthSet])).toBe(BASE_POPULARITY);
  const allSet: SetDef = { ...EMO, target: 'all' };
  expect(objectStats(s, t.id, [], [allSet]).popularity).toBe(Math.round(BASE_POPULARITY * 1.1));
  // 세트 완성은 도감에 오르고 알림
  discoverCombos(s, [], [youthSet]);
  expect(s.codex.sets).toEqual([EMO.id]);
  expect(s.notices.at(-1)).toContain(EMO.name);
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

test('좌석 요금 배수: 귤밭 뷰(+5%)가 메뉴 가격에 곱해진다', () => {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5)); // 정낭 (4,6) 위
  placeObject(s, 'tangerine_tree', X(5), Y(5));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 5;
  expect(spawnGuests(s, 1)).toBe(1);
  const m0 = s.money;
  updateGuests(s, 30_000);
  expect(s.guests[0]!.phase).toBe('seated');
  expect(s.money).toBe(m0 + Math.round(4000 * (100 + COMBO_META.up.feePct) / 100)); // 4200
});

test('만족: 인기 보너스는 기본 10에서 3마다 경치 1점', () => {
  expect(popularityBonus(BASE_POPULARITY)).toBe(0);
  expect(popularityBonus(BASE_POPULARITY + POP_PER_SCENERY)).toBe(1);
  expect(popularityBonus(BASE_POPULARITY - POP_PER_SCENERY)).toBe(-1);
  // 경치 2가 필요한 관광객: 나무(경치 1) 하나론 meh, 인기 보너스(+3 → +1)로 happy
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5));
  placeObject(s, 'tangerine_tree', X(5), Y(5));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 5;
  s.segmentPopularity = { local: 0, tourist: 99 };
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
