import { bareState, clearStubPath } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { isMenuAvailable, consumeIngredients, purchaseCost } from '../menu.ts';
import { ingredientCost, upkeep, upkeepOf, closeMonth, incomeTaxOf, salaryOf, annualRaise, ANNUAL_RAISE_PCT, totalCosts, emptyMonthCosts } from '../economy.ts';
import { WEAR_START_MONTHS } from '../cleanliness.ts';
import { LOAN_MAX } from '../failure.ts';
import { typeWeight } from '../guests.ts';
import { unlockGuestType } from '../segments.ts';
import { GUEST_TYPES } from '../../data/index.ts';
import { monthlyHarvest } from '../orchard.ts';
import { objectAt } from '../grid.ts';
import { stockOf } from '../warehouse.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';

test('bought 재료 메뉴는 창고 없이도 available, 팔면 재료비가 빠진다', () => {
  const s = bareState(1);
  expect(isMenuAvailable(s, 'americano')).toBe(true);
  expect(ingredientCost(s, 'latte')).toBe(2100);
  const m0 = s.money;
  consumeIngredients(s, 'latte');
  expect(s.money).toBe(m0 - 2100);
  expect(s.monthCosts.ingredients).toBe(2100);
});

test('창고 재료를 먼저 쓴다: 창고에 있으면 재료비 0·절감액 기록, 비면 원가로 자동 구매', () => {
  const s = bareState(1);
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(true); // 창고는 안 본다 (직원 조건만)
  expect(ingredientCost(s, 'carrot_juice')).toBe(500);   // 정가 (창고 무시)
  expect(purchaseCost(s, 'carrot_juice')).toBe(500);     // 창고 없음 → 다 산다
  s.storage['carrot'] = 1;
  expect(ingredientCost(s, 'carrot_juice')).toBe(500);
  expect(purchaseCost(s, 'carrot_juice')).toBe(0);
  const m0 = s.money;
  expect(consumeIngredients(s, 'carrot_juice')).toBe(0);
  expect(s.money).toBe(m0);
  expect(stockOf(s, 'carrot')).toBe(0);
  expect(s.storage['carrot']).toBeUndefined(); // 0이 되면 키를 지운다
  expect(s.monthCosts.ingredients).toBe(0);
  expect(s.monthHarvest.ingredientSaved).toBe(500);
  // 창고가 비면 자동 구매: 돈·이달 재료비가 빠지고 절감액은 그대로
  expect(consumeIngredients(s, 'carrot_juice')).toBe(500);
  expect(s.money).toBe(m0 - 500);
  expect(s.monthCosts.ingredients).toBe(500);
  expect(s.monthHarvest.ingredientSaved).toBe(500);
});

test('일부만 창고에 있으면 모자란 만큼만 산다 (당근케이크: 당근 2·밀가루·달걀)', () => {
  const s = bareState(1);
  s.storage['carrot'] = 1;
  expect(ingredientCost(s, 'carrot_cake')).toBe(500 * 2 + 800 + 700); // 정가 2500
  expect(purchaseCost(s, 'carrot_cake')).toBe(500 + 800 + 700);       // 창고 당근 1 → 2000
  const m0 = s.money;
  expect(consumeIngredients(s, 'carrot_cake')).toBe(2000);
  expect(s.money).toBe(m0 - 2000);
  expect(s.storage['carrot']).toBeUndefined();
  expect(s.monthCosts.ingredients).toBe(2000);
  expect(s.monthHarvest.ingredientSaved).toBe(500);
});

test('농원 월 수확: 지난달에 놓은 감귤나무가 1일에 창고를 채우고, 수확·절감액이 월말 카드에 남는다', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'tangerine_tree', x: X(4), y: Y(5) });
  const tree = objectAt(s, X(4), Y(5))!;
  expect(monthlyHarvest(s)).toBe(0); // 놓은 달엔 안 나온다
  expect(s.storage['tangerine']).toBeUndefined();
  s.clock.month += 1;
  expect(monthlyHarvest(s)).toBe(6);
  expect(stockOf(s, 'tangerine')).toBe(6);
  expect(s.monthHarvest.harvested).toEqual({ tangerine: 6 });
  expect(s.notices.at(-1)).toBe('농원 수확: 감귤 6');
  expect(s.fx.some((f) => f.kind === 'harvest' && f.x === tree.x && f.y === tree.y)).toBe(true);
  // 감귤주스를 팔면 창고에서 쓰고 700원 절감
  const m0 = s.money;
  expect(consumeIngredients(s, 'tangerine_juice')).toBe(0);
  expect(s.money).toBe(m0);
  expect(stockOf(s, 'tangerine')).toBe(5);
  expect(s.monthHarvest.ingredientSaved).toBe(900);
  closeMonth(s, s.clock.month, s.clock.year);
  expect(s.lastMonthCard).toMatchObject({ harvested: { tangerine: 6 }, ingredientSaved: 900, topMenu: null });
  expect(s.monthHarvest).toEqual({ harvested: {}, ingredientSaved: 0 });
});

test('오브젝트 유지비가 이달 비용에서 빠진다', () => {
  const s = clearStubPath(bareState(1));
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(5) }); // 데이터 upkeep 750 (1.5%) → 2.5%면 1,250
  const m0 = s.money;
  upkeep(s);
  expect(s.money).toBe(m0 - 1250);
  expect(s.monthCosts.upkeep).toBe(1250);
});

test('월말 카드에 수입·재료비·월급·광고·유지비·순이익이 있고 monthCosts가 리셋된다', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(5) });
  apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' });
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  const c = s.lastMonthCard!;
  expect(c.income).toBeGreaterThan(0);
  expect(c.costs.ingredients).toBeGreaterThan(0);
  expect(c.costs.upkeep).toBeGreaterThan(0);
  expect(c.net).toBe(c.income - totalCosts(c.costs));
  expect(s.monthCosts).toEqual(emptyMonthCosts());
});

test('공고비·퇴직금은 카드의 recruit에 잡히고 순이익에서 빠진다', () => {
  const s = bareState(1);
  apply(s, { type: 'postJob', tier: 'flyer' }); // 50만 (§3.6.6)
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  const severance = s.staff[0]!.salary;
  apply(s, { type: 'fire', staffId: s.staff[0]!.id });
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  const c = s.lastMonthCard!;
  expect(c.costs.recruit).toBe(500_000 + severance);
  expect(c.net).toBe(c.income - totalCosts({ ...c.costs, recruit: 500_000 + severance }));
  expect(s.monthCosts.recruit).toBe(0);
});

// ---------- 확장 §4.2: 세금·급여 인상·투어 버스·카드 줄 ----------

test('소득세: 매년 3월 1일 전년 순이익 × 10% (적자면 0), 2월 카드 "세금" 줄에 남는다', () => {
  expect(incomeTaxOf(12_345_678)).toBe(1_234_568);
  expect(incomeTaxOf(-1)).toBe(0);
  const s = bareState(1);
  s.loan.count = LOAN_MAX;
  s.clock.year = 2; s.clock.month = 2; s.clock.day = 30; s.clock.hour = 23;
  s.lastYearNet = 5_000_000; // 1년차 순이익
  s.money = 10_000_000;
  const before = s.money;
  tick(s, DAY_MS);
  expect(s.clock.month).toBe(3);
  const c = s.lastMonthCard!;
  expect(c.month).toBe(2);
  expect(c.costs.tax).toBe(500_000);
  expect(c.net).toBe(c.income - totalCosts({ ...c.costs, tax: 500_000 }));
  expect(before - s.money).toBeGreaterThanOrEqual(500_000);
  expect(s.notices.some((n) => n.includes('소득세'))).toBe(true);
  // 1년차 3월(2년차 전)엔 세금이 없다
  const t = bareState(1);
  t.lastYearNet = 5_000_000;
  t.clock.month = 2; t.clock.day = 30; t.clock.hour = 23;
  tick(t, DAY_MS);
  expect(t.lastMonthCard!.costs.tax).toBe(0);
});

test('연 순이익 누적: 12월 카드를 닫으면 lastYearNet으로 옮기고 yearNet은 0부터', () => {
  const s = bareState(1);
  s.monthIncome = 700_000;
  closeMonth(s, 11, 1);
  expect(s.yearNet).toBe(700_000);
  s.monthIncome = 300_000;
  closeMonth(s, 12, 1);
  expect(s.lastYearNet).toBe(1_000_000);
  expect(s.yearNet).toBe(0);
});

test('급여 공식 §3.6.3: 기본급 × (1 + 0.15 × (Lv − 1)) × (1 + 인상%) + 스탯 합 × 1,000 — 표 3행', () => {
  const stats = { stamina: 0, strength: 0, skill: 0, smile: 0 };
  for (const [base, lv, want] of [[400_000, 1, 400_000], [400_000, 3, 520_000], [400_000, 5, 640_000], [400_000, 7, 760_000], [400_000, 10, 940_000], [1_000_000, 3, 1_300_000], [1_000_000, 10, 2_350_000], [2_200_000, 5, 3_520_000], [2_200_000, 10, 5_170_000]] as const) {
    expect(salaryOf({ stats, level: lv, baseSalary: base }), `${base}/Lv${lv}`).toBe(want);
  }
  expect(salaryOf({ stats: { stamina: 20, strength: 20, skill: 20, smile: 20 }, level: 1 })).toBe(400_000 + 80 * 1000); // 기본급 없으면 40만
  expect(salaryOf({ stats, level: 1, baseSalary: 400_000 }, 12)).toBe(448_000); // 12% 인상
});

test('급여 인상: 2년차부터 매년 3월 1일 전 직원 월급 +12% 누적', () => {
  const s = bareState(1);
  s.loan.count = LOAN_MAX;
  s.money = 50_000_000;
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 10, strength: 10, skill: 10, smile: 10 }, skill: 'coffee_master', level: 1, salary: 500_000, poolId: '', statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 }, extraSkills: [], maxLevel: 10, baseSalary: 0, exp: 0, trainingCount: 0, training: null, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  s.clock.year = 2; s.clock.month = 2; s.clock.day = 30; s.clock.hour = 23;
  tick(s, DAY_MS);
  expect(s.salaryRaisePct).toBe(ANNUAL_RAISE_PCT);
  expect(s.staff[0]!.salary).toBe(560_000);
  expect(s.lastMonthCard!.costs.salary).toBe(560_000); // 인상된 월급이 그달 월급으로 나간다
  annualRaise(s);
  expect(s.salaryRaisePct).toBe(24);
  expect(s.staff[0]!.salary).toBe(627_200);
});

test('유지비: 노후(트랙 A wearOf, 24개월 경과)면 +50%', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(5) });
  const o = objectAt(s, X(4), Y(5))!;
  expect(upkeepOf(s, o)).toBe(1250);
  o.wearMonth = o.placedMonth - WEAR_START_MONTHS;
  expect(upkeepOf(s, o)).toBe(1875);
});

test('월말 카드: 대기 이탈 수·대출 줄', () => {
  const s = bareState(1);
  s.monthGuestsLeft = 7;
  s.monthLoan = 3_000_000;
  s.loan.balance = 3_000_000;
  closeMonth(s, 3, 1);
  expect(s.lastMonthCard).toMatchObject({ guestsLeft: 7, loanTaken: 3_000_000, loanBalance: 3_000_000, deficitStreak: 0 });
  expect(s.monthGuestsLeft).toBe(0);
  expect(s.monthLoan).toBe(0);
});
