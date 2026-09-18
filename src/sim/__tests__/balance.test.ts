/**
 * 봇 KPI 밴드 (확장 스펙 §4.6). 봇 3년 × seed 3개. 밴드 밖이면 guests.ts 레버 #1(POP_SUM_PER_GUEST·FACILITY_POP_PER_GUEST·SPOT_APPEAL_PER_GUEST)·
 * ingredients.json 레버 #4(원가)부터 조정한다. 5년차 ★4·10년차 목표 105는 트랙 B의 목표 108개가 들어온 뒤에 켜진다.
 */
import { runBot } from '../bot.ts';
import { GOALS } from '../../data/index.ts';

const SEEDS = [1, 2, 3];
/** 1년차(3~12월) 순이익 합 300만~800만 */
export const YEAR1_TOTAL_MIN = 3_000_000;
export const YEAR1_TOTAL_MAX = 8_000_000;
/** 1년차 말 자금 ≤ 1,200만 (시작 500만의 2.4배 이하) */
export const YEAR1_END_MONEY_MAX = 12_000_000;
/** 3년차 말 자금 2,500만~5,000만 */
export const YEAR3_MONEY_MIN = 25_000_000;
export const YEAR3_MONEY_MAX = 50_000_000;
/** 5년차 말 ★4, 10년차 말 목표 105 (목표 108개 체인 전제) */
export const YEAR5_STAR_MIN = 4;
export const YEAR10_GOALS_MIN = 105;
/** 1년차 적자 달: 스펙 1~2회 목표, 채용·비수기 달이 겹치면 4회까지 (seed 1) */
const YEAR1_DEFICIT_MIN = 1;
const YEAR1_DEFICIT_MAX = 4;
/** 3년차 월 손님 평균 (스펙 2,000~2,800 목표, 하한은 1,500) */
const YEAR3_GUESTS_MIN = 1_500;
const YEAR3_GUESTS_MAX = 3_000;
const YEAR1_STAFF = 3;
const YEAR3_STAFF = 5;

describe.each(SEEDS)('봇 3년 KPI 밴드 §4.6 (seed %i)', (seed) => {
  const rows = runBot(3, seed).filter((r) => r.year <= 3);
  const year1 = rows.filter((r) => r.year === 1);
  const year3 = rows.filter((r) => r.year === 3);
  const y1Last = year1.at(-1)!;
  const y3Last = year3.at(-1)!;

  test('1년차: 10달(3~12월), 순이익 합 300만~800만, 적자 달 1~4회, 말 자금 ≤ 1,200만, 직원 3', () => {
    expect(year1.map((r) => r.month)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const total = year1.reduce((s, r) => s + r.net, 0);
    expect(total).toBeGreaterThanOrEqual(YEAR1_TOTAL_MIN);
    expect(total).toBeLessThanOrEqual(YEAR1_TOTAL_MAX);
    const deficit = year1.filter((r) => r.net < 0).length;
    expect(deficit).toBeGreaterThanOrEqual(YEAR1_DEFICIT_MIN);
    expect(deficit).toBeLessThanOrEqual(YEAR1_DEFICIT_MAX);
    expect(y1Last.money).toBeLessThanOrEqual(YEAR1_END_MONEY_MAX);
    expect(y1Last.staff).toBe(YEAR1_STAFF);
  });

  test('봇은 첫 달에 홀, 둘째 달에 바리스타를 뽑고, 3년 안에 목표 40개를 달성한다', () => {
    expect(year1[0]!.staff).toBe(1);
    expect(year1[1]!.staff).toBe(2);
    expect(y3Last.goals).toBeGreaterThanOrEqual(40);
  });

  test('3년차 말: 자금 2,500만~5,000만, 직원 5, 월 손님 1,500~3,000, 레시피·마일리지, 파산 없음(대출 없이)', () => {
    expect(year3).toHaveLength(12);
    expect(y3Last.money).toBeGreaterThanOrEqual(YEAR3_MONEY_MIN);
    expect(y3Last.money).toBeLessThanOrEqual(YEAR3_MONEY_MAX);
    expect(y3Last.staff).toBe(YEAR3_STAFF);
    const guests = year3.reduce((s, r) => s + r.guests, 0) / year3.length;
    expect(guests).toBeGreaterThanOrEqual(YEAR3_GUESTS_MIN);
    expect(guests).toBeLessThanOrEqual(YEAR3_GUESTS_MAX);
    expect(y3Last.customMenus).toBeGreaterThanOrEqual(1);
    expect(y3Last.mileage).toBeGreaterThan(0);
    for (const r of rows) expect(r.minMoney, `${r.year}년 ${r.month}월 minMoney`).toBeGreaterThan(400_000); // 삼춘 대출 문턱 위
  });
});

// 봇 1년 두 번(각 3~4초) — 기본 5초로는 빠듯하다
test('같은 seed면 같은 결과 (결정적)', () => {
  expect(runBot(1, 1)).toEqual(runBot(1, 1));
}, 30_000);

// 트랙 B의 목표 108개가 들어오면 켜진다 (§4.6 5년차 ★4 · 10년차 목표 105)
describe.skipIf(GOALS.length < 108)('봇 장기 KPI (목표 108 체인)', () => {
  test('5년차 말 ★4 이상', () => {
    const last = runBot(5, 1).filter((r) => r.year <= 5).at(-1)!;
    expect(last.star).toBeGreaterThanOrEqual(YEAR5_STAR_MIN);
  }, 120_000);
  test('10년차 말 목표 105개 이상', () => {
    const last = runBot(10, 1).filter((r) => r.year <= 10).at(-1)!;
    expect(last.goals).toBeGreaterThanOrEqual(YEAR10_GOALS_MIN);
  }, 300_000);
});
