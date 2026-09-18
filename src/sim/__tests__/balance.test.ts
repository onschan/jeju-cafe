import { runBot } from '../bot.ts';

const SEEDS = [1, 2, 3];
const YEAR1_TOTAL_MIN = 10_000_000;
const YEAR1_TOTAL_MAX = 60_000_000;
/** 3년차 말 자금 목표 범위 (v3 A4: 2,000만~1억) */
const YEAR3_MONEY_MIN = 20_000_000;
const YEAR3_MONEY_MAX = 100_000_000;

describe.each(SEEDS)('봇 1년차 밸런스 (seed %i)', (seed) => {
  const rows = runBot(1, seed);
  const year1 = rows.filter((r) => r.year === 1);

  test('1년차 10달(3월~12월) 모두 순이익 > 0', () => {
    expect(year1.map((r) => r.month)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const r of year1) expect(r.net, `${r.year}년 ${r.month}월 net`).toBeGreaterThan(0);
  });

  test('1년차 순이익 합계는 1,000만~6,000만', () => {
    const total = year1.reduce((s, r) => s + r.net, 0);
    expect(total).toBeGreaterThanOrEqual(YEAR1_TOTAL_MIN);
    expect(total).toBeLessThanOrEqual(YEAR1_TOTAL_MAX);
  });

  test('돈이 음수가 되지 않는다', () => {
    for (const r of year1) expect(r.minMoney, `${r.year}년 ${r.month}월 minMoney`).toBeGreaterThanOrEqual(0);
  });

  test('봇은 첫 달에 홀, 둘째 달에 바리스타를 뽑고, 1년차 안에 목표 20개를 달성한다 (§7.3)', () => {
    expect(year1[0]!.staff).toBe(1);
    expect(year1[1]!.staff).toBe(2);
    expect(year1[year1.length - 1]!.goals).toBeGreaterThanOrEqual(20);
  });
});

// 봇 1년 두 번(각 2~3초, 좌석마다 상성·세트 계산 포함) — 기본 5초로는 빠듯하다
test('같은 seed면 같은 결과 (결정적)', () => {
  expect(runBot(1, 1)).toEqual(runBot(1, 1));
}, 20_000);

// 3년: 연구 개발이 열리면 레시피를 개발하고, 요리사까지 3명을 두고도 매달 흑자. 3년차 말 자금 2,000만~1억, 파산 없음 (A4)
test('봇 3년: 레시피 개발·직원 3명·매달 흑자·목표 20개 이상·자금 2,000만~1억', () => {
  const rows = runBot(3, 2);
  const last = rows.filter((r) => r.year <= 3).at(-1)!;
  expect(last.customMenus).toBeGreaterThanOrEqual(1);
  const year2 = rows.filter((r) => r.year === 2);
  expect(year2.length).toBe(12);
  for (const r of year2) { expect(r.staff, `2년 ${r.month}월 staff`).toBe(3); expect(r.net, `2년 ${r.month}월 net`).toBeGreaterThan(0); }
  for (const r of rows) expect(r.minMoney, `${r.year}년 ${r.month}월 minMoney`).toBeGreaterThanOrEqual(0);
  expect(last.goals).toBeGreaterThanOrEqual(20);
  expect(last.money).toBeGreaterThanOrEqual(YEAR3_MONEY_MIN);
  expect(last.money).toBeLessThanOrEqual(YEAR3_MONEY_MAX);
  expect(last.mileage).toBeGreaterThan(0); // 월 손님 300명당 1
}, 60_000);
