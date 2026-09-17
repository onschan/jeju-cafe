import { runBot } from '../bot.ts';

const SEEDS = [1, 2, 3];
const YEAR1_TOTAL_MIN = 30_000_000;
const YEAR1_TOTAL_MAX = 150_000_000;

describe.each(SEEDS)('봇 1년차 밸런스 (seed %i)', (seed) => {
  const rows = runBot(1, seed);
  const year1 = rows.filter((r) => r.year === 1);

  test('1년차 10달(3월~12월) 모두 순이익 > 0', () => {
    expect(year1.map((r) => r.month)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const r of year1) expect(r.net, `${r.year}년 ${r.month}월 net`).toBeGreaterThan(0);
  });

  test('1년차 순이익 합계는 3,000만~1억 5,000만', () => {
    const total = year1.reduce((s, r) => s + r.net, 0);
    expect(total).toBeGreaterThanOrEqual(YEAR1_TOTAL_MIN);
    expect(total).toBeLessThanOrEqual(YEAR1_TOTAL_MAX);
  });

  test('돈이 음수가 되지 않는다', () => {
    for (const r of year1) expect(r.minMoney, `${r.year}년 ${r.month}월 minMoney`).toBeGreaterThanOrEqual(0);
  });

  test('봇은 직원을 뽑고 9월에 밭 일꾼까지 둔다', () => {
    expect(year1[1]!.staff).toBe(2);
    expect(year1.find((r) => r.month === 9)!.staff).toBe(3);
  });
});

// 봇 1년 두 번(각 2~3초, 좌석마다 상성·세트 계산 포함) — 기본 5초로는 빠듯하다
test('같은 seed면 같은 결과 (결정적)', () => {
  expect(runBot(1, 1)).toEqual(runBot(1, 1));
}, 20_000);
