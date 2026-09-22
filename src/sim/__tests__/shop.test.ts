import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, monthIndex } from '../clock.ts';
import { placeObject } from '../grid.ts';
import { objectStats } from '../compat.ts';
import { sceneryScore } from '../grid.ts';
import { grantItem, itemEffect, ITEM_SCENERY_CAP } from '../items.ts';
import { rollPrize, hasFreeDraw, canDrawTicket, DRAW_MONEY_PER_YEAR, UNIFORM_PIECES_PER_SET, MONTHLY_FREE_TICKETS, MID_MONTH_TICKET_DAY } from '../shop.ts';
import { addTickets, checkCodexTickets, monthlyTickets, CODEX_PER_TICKET } from '../mileage.ts';
import { UNIFORMS, DRAW_PRIZES, ITEMS, itemDef, objectDef, POPULARITY_FRUIT, POPULARITY_FRUIT_DELTA } from '../../data/index.ts';

test('데이터: 유니폼 5 · 인형뽑기 8칸 합 100% · 강화 아이템 20 + 특수 (trim: 마일리지·응모권 상점 삭제)', () => {
  expect(UNIFORMS).toHaveLength(5);
  expect(DRAW_PRIZES).toHaveLength(8);
  expect(DRAW_PRIZES.reduce((n, p) => n + p.pct, 0)).toBe(100);
  expect(DRAW_PRIZES.map((p) => p.kind)).toEqual(['money', 'research', 'ingredient_box', 'ticket', 'item', 'seed', 'uniform_piece', 'miss']);
  // v2 20종은 잘 맞는 시설이 있고, 특수 12종 중 씨앗 3종만 효과가 있다
  expect(ITEMS.filter((i) => i.fitIds.length > 0).length).toBeGreaterThanOrEqual(20);
  expect(ITEMS.filter((i) => ['pony_doll', 'deer_bell', 'fast_hammer', 'worker_hire'].includes(i.id)).every((i) => i.value === 0)).toBe(true);
  expect(itemDef('tangerine_seed')).toMatchObject({ stat: 'popularity', value: 5 });
  expect(itemDef('hallabong_seed')).toMatchObject({ stat: 'feePct', value: 5 });
  expect(itemDef('scenery_seed')).toMatchObject({ stat: 'scenery', value: 3 });
});

test('강화 아이템: 잘 맞는 시설이면 ×2, 아니면 못 쓴다 (v1 분류가 없는 v2 아이템)', () => {
  const salt = itemDef('jeju_salt'); // bestFacilities: noodle_shop·bomal_kalguksu·haenyeo_mulhoe
  expect(itemEffect(salt, objectDef('noodle_shop'))).toBe(salt.value * 2);
  expect(itemEffect(salt, objectDef('table_out'))).toBe(0);
});

test('씨앗: 감귤 씨앗 인기 +5, 한라봉 씨앗 요금 +5%, 경관 씨앗은 경관물 경관 +3(상한 30)이 경치 점수에 반영', () => {
  const s = bareState(1);
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

test('인형뽑기: 첫 달 무료 1회, 그 뒤 응모권 1장, 결과는 lastDraw에 (dismissDraw로 닫는다)', () => {
  const s = bareState(3);
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

test('인형뽑기 분포: 3000회 뽑으면 칸별 비율이 표와 ±3%p 안', () => {
  const s = bareState(7);
  const n = 3000;
  const count: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const p = rollPrize(s); count[p.kind] = (count[p.kind] ?? 0) + 1; }
  for (const p of DRAW_PRIZES) expect(Math.abs((count[p.kind] ?? 0) / n * 100 - p.pct), p.kind).toBeLessThanOrEqual(3);
});

test('인형뽑기 상품 적용: 돈은 5만×년차, 유니폼 조각 5개 → 유니폼', () => {
  const s = bareState(1);
  s.tickets = 500;
  const seen = new Set<string>();
  for (let i = 0; i < 300 && seen.size < 8; i++) {
    const money = s.money, pieces = s.uniformPieces, uniforms = s.uniforms.length;
    apply(s, { type: 'drawTicket' });
    const r = s.lastDraw!;
    seen.add(r.kind);
    if (r.kind === 'money') expect(s.money - money).toBe(DRAW_MONEY_PER_YEAR * s.clock.year);
    if (r.kind === 'uniform_piece') expect(pieces + 1 === UNIFORM_PIECES_PER_SET ? s.uniforms.length === uniforms + 1 && s.uniformPieces === 0 : s.uniformPieces === pieces + 1).toBe(true);
    if (r.kind === 'miss') expect(s.money).toBe(money);
  }
  expect(seen.size).toBe(8);
});

test('매월 1일 무료 추첨 리셋, 보름(15일)에 응모권 +1 (game-feel: 달 가운데 보상)', () => {
  const s = bareState(1);
  s.freeDrawMonth = -1;
  const tickets = s.tickets;
  for (let d = 0; d < 13; d++) tick(s, DAY_MS); // 3월 14일
  expect(s.tickets).toBe(tickets);
  tick(s, DAY_MS); // 3월 15일 아침
  expect(s.clock.day).toBe(MID_MONTH_TICKET_DAY);
  expect(s.tickets).toBe(tickets + MONTHLY_FREE_TICKETS);
  for (let d = 0; d < 17; d++) tick(s, DAY_MS);
  expect(s.clock.month).toBe(4);
  expect(s.tickets).toBe(tickets + MONTHLY_FREE_TICKETS + 1); // 1일엔 응모권 없음 — +1은 4월에 열리는 육지 삼춘 해금 보상(game-feel P1 GUEST_UNLOCK_REWARDS)
  expect(s.alerts.some((a) => a.type === 'reward' && a.source === 'unlock')).toBe(true);
  expect(s.freeDrawMonth).toBe(monthIndex(s.clock));
});

test('응모권: 월말 손님 600명마다 +1 (closeMonth 전에 준다)', () => {
  const s = bareState(1);
  s.monthGuests = 599;
  expect(monthlyTickets(s)).toBe(0);
  s.monthGuests = 1300;
  expect(monthlyTickets(s)).toBe(2);
  expect(s.tickets).toBe(2);
  expect(s.notices.at(-1)).toBe('이달 손님 1300명 — 응모권 +2');
});

test('응모권: 도감 10개마다 +1 (한 단계는 한 번만)', () => {
  const s = bareState(1);
  for (let i = 0; i < CODEX_PER_TICKET * 2; i++) s.codex.recipes.push(`r${i}`);
  checkCodexTickets(s);
  expect(s.tickets).toBe(2);
  checkCodexTickets(s);
  expect(s.tickets).toBe(2);
  addTickets(s, 0);
  expect(s.tickets).toBe(2);
});
