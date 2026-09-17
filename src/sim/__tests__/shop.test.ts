import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, monthIndex } from '../clock.ts';
import { placeObject } from '../grid.ts';
import { objectStats } from '../compat.ts';
import { sceneryScore } from '../grid.ts';
import { grantItem, itemEffect, ITEM_SCENERY_CAP } from '../items.ts';
import { rollPrize, hasFreeDraw, canDrawTicket, SEED_PACK, DRAW_MONEY_PER_YEAR, UNIFORM_PIECES_PER_SET, MONTHLY_FREE_TICKETS } from '../shop.ts';
import { START_BUILDERS, MAX_BUILDERS } from '../build.ts';
import { addMileage, checkCodexMileage, monthlyMileage, CODEX_PER_MILEAGE } from '../mileage.ts';
import { discoverCombos } from '../compat.ts';
import { MILEAGE_SHOP, TICKET_SHOP, UNIFORMS, DRAW_PRIZES, ITEMS, itemDef, objectDef, COMBOS, POPULARITY_FRUIT, POPULARITY_FRUIT_DELTA } from '../../data/index.ts';
import type { ComboDef } from '../types.ts';

test('데이터: 마일리지 상점 14 · 응모권 상점 7(추첨 제외) · 유니폼 5 · 인형뽑기 8칸 합 100% · 강화 아이템 20 + 특수 12', () => {
  expect(MILEAGE_SHOP).toHaveLength(14);
  expect(TICKET_SHOP).toHaveLength(7);
  expect(UNIFORMS).toHaveLength(5);
  expect(DRAW_PRIZES).toHaveLength(8);
  expect(DRAW_PRIZES.reduce((n, p) => n + p.pct, 0)).toBe(100);
  expect(DRAW_PRIZES.map((p) => p.kind)).toEqual(['money', 'research', 'ingredient_box', 'mileage', 'item', 'seed', 'uniform_piece', 'miss']);
  for (const m of MILEAGE_SHOP) if (m.itemId) expect(itemDef(m.itemId).id).toBe(m.itemId);
  for (const t of TICKET_SHOP) if (t.itemId) expect(itemDef(t.itemId).id).toBe(t.itemId);
  // v2 20종은 잘 맞는 시설이 있고, 특수 12종 중 씨앗 3종만 효과가 있다
  expect(ITEMS.filter((i) => i.fitIds.length > 0).length).toBeGreaterThanOrEqual(20);
  expect(ITEMS.filter((i) => ['pony_doll', 'deer_bell', 'pickaxe', 'worker_hire'].includes(i.id)).every((i) => i.value === 0)).toBe(true);
  expect(itemDef('tangerine_seed')).toMatchObject({ stat: 'popularity', value: 5 });
  expect(itemDef('hallabong_seed')).toMatchObject({ stat: 'feePct', value: 5 });
  expect(itemDef('scenery_seed')).toMatchObject({ stat: 'scenery', value: 3 });
});

test('강화 아이템: 잘 맞는 시설이면 ×2, 아니면 못 쓴다 (v1 분류가 없는 v2 아이템)', () => {
  const salt = itemDef('jeju_salt'); // bestFacilities: noodle_shop·bomal_kalguksu·haenyeo_mulhoe
  expect(itemEffect(salt, objectDef('noodle_shop'))).toBe(salt.value * 2);
  expect(itemEffect(salt, objectDef('table_out'))).toBe(0);
});

test('마일리지 상점: 일꾼 삼춘은 순서대로(3→4→5) 동시 건설 +1, 마일리지 부족·순서 위반 거부', () => {
  const s = createInitialState(1);
  expect(s.builders).toBe(START_BUILDERS);
  expect(apply(s, { type: 'buyMileage', id: 'ms_worker_3' }).ok).toBe(false); // 마일리지 0
  s.mileage = 300;
  expect(apply(s, { type: 'buyMileage', id: 'ms_worker_4' }).ok).toBe(false); // 3번째 먼저
  expect(apply(s, { type: 'buyMileage', id: 'ms_worker_3' }).ok).toBe(true);
  expect(s.builders).toBe(3);
  expect(s.mileage).toBe(297);
  expect(apply(s, { type: 'buyMileage', id: 'ms_worker_3' }).ok).toBe(false); // 이미
  expect(apply(s, { type: 'buyMileage', id: 'ms_worker_4' }).ok).toBe(true);
  expect(apply(s, { type: 'buyMileage', id: 'ms_worker_5' }).ok).toBe(true);
  expect(s.builders).toBe(MAX_BUILDERS);
  expect(apply(s, { type: 'buyMileage', id: 'ms_nope' }).ok).toBe(false);
});

test('마일리지 상점: 곡괭이·응모권·씨앗·묶음팩·강화 아이템·스카우트권', () => {
  const s = createInitialState(1);
  s.mileage = 100;
  expect(apply(s, { type: 'buyMileage', id: 'ms_pickaxe' }).ok).toBe(true);
  expect(s.inventory['pickaxe']).toBe(1);
  expect(apply(s, { type: 'buyMileage', id: 'ms_ticket' }).ok).toBe(true);
  expect(s.tickets).toBe(1);
  expect(apply(s, { type: 'buyMileage', id: 'ms_tangerine_seed' }).ok).toBe(true);
  expect(apply(s, { type: 'buyMileage', id: 'ms_seed_pack' }).ok).toBe(true);
  expect(s.inventory['tangerine_seed']).toBe(1 + SEED_PACK.tangerine_seed);
  expect(s.inventory['hallabong_seed']).toBe(SEED_PACK.hallabong_seed);
  expect(apply(s, { type: 'buyMileage', id: 'ms_jeju_salt' }).ok).toBe(true);
  expect(s.inventory['jeju_salt']).toBe(1);
  expect(apply(s, { type: 'buyMileage', id: 'ms_scout' }).ok).toBe(true);
  expect(s.freeRecruits).toBe(1);
  expect(s.mileage).toBe(100 - 2 - 1 - 1 - 4 - 1 - 2);
  // 스카우트권: 다음 공고비 무료
  const money = s.money;
  expect(apply(s, { type: 'postJob', tier: 'flyer' }).ok).toBe(true);
  expect(s.money).toBe(money);
  expect(s.freeRecruits).toBe(0);
});

test('씨앗: 감귤 씨앗 인기 +5, 한라봉 씨앗 요금 +5%, 경관 씨앗은 경관물 경관 +3(상한 30)이 경치 점수에 반영', () => {
  const s = createInitialState(1);
  const t = placeObject(s, 'table_out', X(6), Y(4));
  const tree = placeObject(s, 'tangerine_tree', X(6), Y(2));
  grantItem(s, 'tangerine_seed', 1);
  grantItem(s, 'hallabong_seed', 1);
  grantItem(s, 'scenery_seed', 12);
  const { popularity, feePct } = objectStats(s, t.id); // 감귤나무 상성이 이미 붙어 있을 수 있어 차이로 본다
  expect(apply(s, { type: 'useItem', itemId: 'tangerine_seed', objectType: 'table_out' }).ok).toBe(true);
  expect(apply(s, { type: 'useItem', itemId: 'hallabong_seed', objectType: 'table_out' }).ok).toBe(true);
  expect(objectStats(s, t.id).popularity).toBe(popularity + 5);
  expect(objectStats(s, t.id).feePct).toBe(feePct + 5);
  expect(apply(s, { type: 'useItem', itemId: 'scenery_seed', objectType: 'table_out' }).ok).toBe(false); // 경관물이 아니다
  const before = sceneryScore(s, X(6), Y(4));
  const treeScenery = objectStats(s, tree.id).scenery;
  expect(apply(s, { type: 'useItem', itemId: 'scenery_seed', objectType: 'tangerine_tree' }).ok).toBe(true);
  expect(objectStats(s, tree.id).scenery).toBe(treeScenery + 3);
  expect(sceneryScore(s, X(6), Y(4))).toBe(before + 3);
  for (let i = 0; i < 11; i++) apply(s, { type: 'useItem', itemId: 'scenery_seed', objectType: 'tangerine_tree' });
  expect(s.itemBonus['tangerine_tree']!.scenery).toBe(ITEM_SCENERY_CAP);
});

test('응모권 상점: 유니폼은 사면 바로 입고 중복 구매 거부, 경관 씨앗·인기 열매, setUniform', () => {
  const s = createInitialState(1);
  s.tickets = 20;
  expect(apply(s, { type: 'buyTicket', id: 'ts_uniform_1' }).ok).toBe(true);
  expect(s.uniforms).toEqual(['uf_hawaiian']);
  expect(s.uniform).toBe('uf_hawaiian');
  expect(s.tickets).toBe(17);
  expect(apply(s, { type: 'buyTicket', id: 'ts_uniform_1' }).ok).toBe(false);
  expect(apply(s, { type: 'buyTicket', id: 'ts_uniform_5' }).ok).toBe(false); // 25장
  expect(apply(s, { type: 'buyTicket', id: 'ts_scenery_seed' }).ok).toBe(true);
  expect(s.inventory['scenery_seed']).toBe(1);
  expect(apply(s, { type: 'buyTicket', id: 'ts_popularity_fruit' }).ok).toBe(true);
  expect(apply(s, { type: 'buyTicket', id: 'ts_draw' }).ok).toBe(false); // 추첨은 drawTicket
  expect(apply(s, { type: 'setUniform', id: 'uf_galot' }).ok).toBe(false);
  expect(apply(s, { type: 'setUniform', id: null }).ok).toBe(true);
  expect(s.uniform).toBeNull();
  expect(apply(s, { type: 'setUniform', id: 'uf_hawaiian' }).ok).toBe(true);
  // 인기 열매: 손님 1종 인기 +10
  const pop = s.segmentPopularity['student']!;
  expect(apply(s, { type: 'useGuestItem', itemId: POPULARITY_FRUIT, guestId: 'couple' }).ok).toBe(false); // 잠긴 손님
  expect(apply(s, { type: 'useGuestItem', itemId: POPULARITY_FRUIT, guestId: 'student' }).ok).toBe(true);
  expect(s.segmentPopularity['student']).toBe(pop + POPULARITY_FRUIT_DELTA);
  expect(s.inventory[POPULARITY_FRUIT]).toBe(0);
});

test('인형뽑기: 첫 달 무료 1회, 그 뒤 응모권 1장, 결과는 lastDraw에 (dismissDraw로 닫는다)', () => {
  const s = createInitialState(3);
  expect(hasFreeDraw(s)).toBe(true);
  expect(apply(s, { type: 'drawTicket' }).ok).toBe(true);
  expect(s.tickets).toBe(0);
  expect(s.lastDraw).not.toBeNull();
  expect(s.lastDraw!.free).toBe(true);
  expect(hasFreeDraw(s)).toBe(false);
  expect(canDrawTicket(s).ok).toBe(false);
  s.tickets = 2;
  expect(apply(s, { type: 'drawTicket' }).ok).toBe(true);
  expect(s.tickets).toBe(1);
  expect(s.lastDraw!.free).toBe(false);
  expect(apply(s, { type: 'dismissDraw' }).ok).toBe(true);
  expect(s.lastDraw).toBeNull();
  expect(s.actionLog.some((l) => l.action.type === 'dismissDraw')).toBe(false); // 클라이언트 전용
});

test('인형뽑기 분포: 1000회 뽑으면 칸별 비율이 표와 ±3%p 안', () => {
  const s = createInitialState(7);
  const n = 1000;
  const count: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const p = rollPrize(s); count[p.kind] = (count[p.kind] ?? 0) + 1; }
  for (const p of DRAW_PRIZES) expect(Math.abs((count[p.kind] ?? 0) / n * 100 - p.pct), p.kind).toBeLessThanOrEqual(3);
});

test('인형뽑기 상품 적용: 돈은 5만×년차, 마일리지 +1, 유니폼 조각 5개 → 유니폼', () => {
  const s = createInitialState(1);
  s.tickets = 500;
  const seen = new Set<string>();
  for (let i = 0; i < 300 && seen.size < 8; i++) {
    const money = s.money, mileage = s.mileage, pieces = s.uniformPieces, uniforms = s.uniforms.length;
    apply(s, { type: 'drawTicket' });
    const r = s.lastDraw!;
    seen.add(r.kind);
    if (r.kind === 'money') expect(s.money - money).toBe(DRAW_MONEY_PER_YEAR * s.clock.year);
    if (r.kind === 'mileage') expect(s.mileage - mileage).toBe(1);
    if (r.kind === 'uniform_piece') expect(pieces + 1 === UNIFORM_PIECES_PER_SET ? s.uniforms.length === uniforms + 1 && s.uniformPieces === 0 : s.uniformPieces === pieces + 1).toBe(true);
    if (r.kind === 'miss') expect(s.money).toBe(money);
  }
  expect(seen.size).toBe(8);
});

test('매월 1일: 응모권 +1과 무료 추첨 리셋', () => {
  const s = createInitialState(1);
  s.freeDrawMonth = -1;
  const tickets = s.tickets;
  for (let d = 0; d < 31; d++) tick(s, DAY_MS);
  expect(s.clock.month).toBe(4);
  expect(s.tickets).toBe(tickets + MONTHLY_FREE_TICKETS);
  expect(s.freeDrawMonth).toBe(monthIndex(s.clock));
});

test('마일리지: 월말 손님 300명마다 +1 (closeMonth 전에 준다)', () => {
  const s = createInitialState(1);
  s.monthGuests = 299;
  expect(monthlyMileage(s)).toBe(0);
  s.monthGuests = 650;
  expect(monthlyMileage(s)).toBe(2);
  expect(s.mileage).toBe(2);
  expect(s.notices.at(-1)).toBe('이달 손님 650명 — 마일리지 +2');
});

test('마일리지: 첫 상성 발견 +1, 도감 10개마다 +1 (한 단계는 한 번만)', () => {
  const s = createInitialState(1);
  const combo = COMBOS.find((c) => c.a === 'table_out' && !c.hidden) ?? ({ id: 'cb_t', name: 't', a: 'table_out', bIds: ['tangerine_tree'], bCount: 1, target: 'all', strength: 'up', applyTo: 'a', hidden: false, radius: 2, effectText: '' } satisfies ComboDef);
  placeObject(s, 'table_out', X(6), Y(4));
  placeObject(s, combo.bIds[0]!.replace('*', ''), X(7), Y(4));
  discoverCombos(s, [combo], []);
  expect(s.codex.combos).toEqual([combo.id]);
  expect(s.mileage).toBe(1);
  discoverCombos(s, [combo], []);
  expect(s.mileage).toBe(1);
  for (let i = 0; i < CODEX_PER_MILEAGE * 2; i++) s.codex.recipes.push(`r${i}`);
  checkCodexMileage(s);
  expect(s.mileage).toBe(1 + 2);
  checkCodexMileage(s);
  expect(s.mileage).toBe(3);
  addMileage(s, 0);
  expect(s.mileage).toBe(3);
});
