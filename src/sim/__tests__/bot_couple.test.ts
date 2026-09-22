/** z-polish: 봇 커플 인기 규칙 (g44 「커플 손님 인기 30」) — 커플이 해금돼 있고 응모권이 있으면 인기 열매를 사서 커플에게 쓴다 */
import { createInitialState } from '../state.ts';
import { botDay, newBotCursor, BOT_COUPLE_ID, BOT_COUPLE_POPULARITY } from '../bot.ts';
import { effectivePopularity } from '../promotions.ts';
import { POPULARITY_FRUIT, POPULARITY_FRUIT_DELTA, ticketShopDef } from '../../data/index.ts';
import { guestTypeState } from '../segments.ts';

test('커플 해금 + 응모권 5장 → 인기 열매 구매·사용, 인기 30이 되면 멈춘다', () => {
  const s = createInitialState(1);
  s.tutorial.step = 99;
  s.money = 30_000_000;
  guestTypeState(s, BOT_COUPLE_ID).unlocked = true;
  const price = ticketShopDef('ts_popularity_fruit').price;
  s.tickets = price * 10;
  const cur = newBotCursor();
  const before = effectivePopularity(s, BOT_COUPLE_ID);
  botDay(s, cur);
  expect(effectivePopularity(s, BOT_COUPLE_ID)).toBeGreaterThanOrEqual(before + POPULARITY_FRUIT_DELTA);
  expect(s.tickets).toBeLessThanOrEqual(price * 9 + 1); // 하루에 응모권 1장이 들어올 수 있다
  expect(s.inventory[POPULARITY_FRUIT] ?? 0).toBe(0);
  for (let i = 0; i < 7; i++) botDay(s, cur); // staff-luck: 서빙 판정이 rng를 쓰면서 seed 1의 만족 손님 수가 조금 달라져 하루 더 (29 → 30+)
  expect(effectivePopularity(s, BOT_COUPLE_ID)).toBeGreaterThanOrEqual(BOT_COUPLE_POPULARITY);
  expect(s.tickets).toBeGreaterThanOrEqual(price * 7); // 열매는 인기 30이 될 때까지만(3개 안팎) 산다
});

test('커플이 안 열려 있으면 응모권을 쓰지 않는다', () => {
  const s = createInitialState(1);
  s.tutorial.step = 99;
  s.tickets = 50;
  botDay(s, newBotCursor());
  expect(s.inventory[POPULARITY_FRUIT] ?? 0).toBe(0);
  expect(s.tickets).toBeGreaterThanOrEqual(50);
});
