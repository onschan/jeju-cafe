/**
 * 봇 KPI 밴드 (확장 스펙 §4.6). 봇 3년 × seed 3개. 밴드 밖이면 guests.ts 레버 #1(POP_SUM_PER_GUEST·FACILITY_POP_PER_GUEST·spots VISITOR_GUEST_RATE)·
 * craft.ts 레버(PRICE_PER_STAT)·ingredients.json 레버 #4(원가)부터 조정한다.
 *
 * stakes(긴장감·트레이드오프) 뒤 실측 — 시작 자금 350만 · 임대료 ₩8만/필지 · 비수기 12~2월 ×0.7 ·
 * 직원 정원 3(휴게실당 +2) · 메뉴판 3칸 · 건축가 2 · 돌발 사고 월 25%:
 *   seed 1/2/3 → 1년차 순이익 합 618만~1,064만 · 적자 달 0/3/1 · 1년차 말 자금 255만~402만 ·
 *   3년차 말 자금 2,285만~2,846만 · 3년차 월 손님 2,070~2,227 · 최저 잔고 168만~183만 · 목표 45~50 · 파산 0.
 * botfix(손님 못 가는 시설 복구) 뒤 실측: 1년차 순이익 합 648만~892만 · 1년차 말 자금 687만~773만 ·
 *   3년차 말 자금 4,896만~5,948만 · 3년차 월 손님 2,448~2,785 · 못 가는 시설 0개 · 파산 0.
 * 야외 중심 개편 뒤 실측: 1년차 순이익 합 778만~843만 · 1년차 말 자금 307만~769만 ·
 *   3년차 말 자금 4,787만~8,329만 · 3년차 월 손님 2,335~3,210 · 최저 잔고 143만~212만 · 파산 0.
 */
import { runBot, runBotAsync } from '../bot.ts';
import { GOALS } from '../../data/index.ts';
import { ENDING_YEAR, ENDING_MONTH } from '../ending.ts';

const SEEDS = [1, 2, 3];
/** 1년차(3~12월) 순이익 합 500만~1,200만 (stakes: 고정비가 늘어 하단이 내려갔다) */
export const YEAR1_TOTAL_MIN = 5_000_000;
export const YEAR1_TOTAL_MAX = 12_000_000;
/** 1년차 말 자금 ≤ 450만 (stakes: 시작 350만에서 1년을 버티면 그 언저리 — 「이번 달에 뭘 살지」가 고민이 되는 구간) */
export const YEAR1_END_MONEY_MAX = 10_000_000; // botfix: 봇이 손님 못 가는 시설을 고치고(길 잇기·이동) 애초에 못 가는 칸에 안 놓게 되면서 헛돈이 줄어 seed 1~3이 ₩687만~₩773만 — 프로젝트 밴드 「1년차 말 ≤₩1,000만」에 맞춘다
/** 3년차 말 자금 2,500만~8,500만 (프로젝트 밴드. botfix 뒤 실측 seed 1~3: 4,896만~5,948만 — 못 가는 시설이 0이 되어 같은 돈이 실제 손님으로 돌아온다) */
export const YEAR3_MONEY_MIN = 25_000_000;
export const YEAR3_MONEY_MAX = 85_000_000;
/** 최저 잔고: 파산(0 이하)은 없지만 빠듯해야 한다 — 50만~300만 (실측 164만~179만) */
export const MIN_MONEY_FLOOR = 500_000;
export const MIN_MONEY_CEIL = 3_000_000;
/** 5년차 말 ★4 (pace: 5년차 3월이 엔딩 — 여기가 한 판의 끝이다) */
export const YEAR5_STAR_MIN = 4;
/** trim(목표 60개 사슬): 5년차 말 목표 ≥ 50 · 직원 ≥ 7 · 자금 ≤ 2억 (pace 뒤 seed 1~3: 목표 57·58·53 · 직원 8 · 1억 4,828만·4,104만·1억 4,276만) */
export const YEAR5_GOALS_MIN = 50;
export const YEAR5_STAFF_MIN = 7;
export const YEAR5_MONEY_MAX = 200_000_000;
/** pace: 엔딩 최종 점수 밴드 (933점 만점, 봇 seed 1~3: 669·618·686 「제주 명소 카페」) */
export const ENDING_SCORE_MIN = 550;
export const ENDING_SCORE_MAX = 850;
/** 1년차 적자 달: stakes 목표는 3~5회지만 봇은 시설을 살 때 카드 순이익이 안 깎여(자산 구입은 월 비용이 아니다) seed에 따라 0~3회.
 *  사람은 채용·홍보·비수기가 겹치면 더 자주 본다. 회귀 방지선으로 0~5. */
const YEAR1_DEFICIT_MIN = 0;
const YEAR1_DEFICIT_MAX = 5;
/** 3년차 월 손님 평균 (스펙 2,000~2,800 목표, 하한은 1,500).
 *  야외 중심 개편 뒤 상한을 3,000 → 3,400으로 넓혔다: 겨울·비에 야외 좌석을 통째로 끄던 스위치(preferIndoor)를 없애
 *  12·1·2월과 장마철 손님이 살아났다(겨울 평균이 여름의 60% → 75%). 그만큼 연평균이 올라가는 게 이번 작업의 성과라
 *  옛 상한을 그대로 두면 「겨울을 살린 것」이 회귀로 잡힌다. 실측 seed 1~3: 2,335 · 2,652 · 3,210. */
const YEAR3_GUESTS_MIN = 1_500;
const YEAR3_GUESTS_MAX = 3_400;
const YEAR1_STAFF = 3;
/** 3년차 말 직원: 정원 3 + 휴게실(목표 g26 보상)에 달려 있어 seed마다 3~6 */
const YEAR3_STAFF_MIN = 3;
/** 3년차 말 목표 (stakes 뒤 seed 1~3: 50·45·47) */
const YEAR3_GOALS_MIN = 40;

describe.each(SEEDS)('봇 3년 KPI 밴드 §4.6 (seed %i)', (seed) => {
  const rows = runBot(3, seed).filter((r) => r.year <= 3);
  const year1 = rows.filter((r) => r.year === 1);
  const year3 = rows.filter((r) => r.year === 3);
  const y1Last = year1.at(-1)!;
  const y3Last = year3.at(-1)!;

  test('1년차: 10달(3~12월), 순이익 합 500만~1,200만, 적자 달 0~5회, 말 자금 ≤ 1,000만, 직원 3', () => {
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
    expect(y3Last.goals).toBeGreaterThanOrEqual(YEAR3_GOALS_MIN);
  });

  test('3년차 말: 자금 2,500만~8,500만, 직원 3 이상, 월 손님 1,500~3,000, 레시피·마일리지, 파산 없음(대출 없이)', () => {
    expect(year3).toHaveLength(12);
    expect(y3Last.money).toBeGreaterThanOrEqual(YEAR3_MONEY_MIN);
    expect(y3Last.money).toBeLessThanOrEqual(YEAR3_MONEY_MAX);
    expect(y3Last.staff).toBeGreaterThanOrEqual(YEAR3_STAFF_MIN);
    const guests = year3.reduce((s, r) => s + r.guests, 0) / year3.length;
    expect(guests).toBeGreaterThanOrEqual(YEAR3_GUESTS_MIN);
    expect(guests).toBeLessThanOrEqual(YEAR3_GUESTS_MAX);
    expect(y3Last.customMenus).toBeGreaterThanOrEqual(1);
    expect(y3Last.tickets).toBeGreaterThan(0);
    for (const r of rows) expect(r.minMoney, `${r.year}년 ${r.month}월 minMoney`).toBeGreaterThan(400_000); // 삼춘 대출 문턱 위
    // botfix: 손님이 못 가는 시설은 0~2개로 유지되고, 손님이 0인 달이 없다
    for (const r of rows) expect(r.unreachable, `${r.year}년 ${r.month}월 못 가는 시설`).toBeLessThanOrEqual(2);
    for (const r of rows) expect(r.guests, `${r.year}년 ${r.month}월 손님`).toBeGreaterThan(0);
    // stakes: 빠듯해야 한다 — 3년 내내 한 번도 300만 아래로 안 내려가면 고민이 없는 게임이다
    const min = Math.min(...rows.map((r) => r.minMoney));
    expect(min).toBeGreaterThanOrEqual(MIN_MONEY_FLOOR);
    expect(min).toBeLessThanOrEqual(MIN_MONEY_CEIL);
  });
});

// 봇 1년 두 번(각 3~4초) — 기본 5초로는 빠듯하다
test('같은 seed면 같은 결과 (결정적)', () => {
  expect(runBot(1, 1)).toEqual(runBot(1, 1));
}, 30_000);

// trim: 목표 60개 사슬 기준 (§4.6 5년차 ★4 · 자금 2억 이하). pace: 5년차 3월이 엔딩이라 이 표가 곧 「한 판」의 끝 상태다.
describe.skipIf(GOALS.length < 60)('봇 한 판 KPI (엔딩 = 5년차 3월)', () => {
  test('엔딩이 5년차 3월에 뜨고, 5년차 말 ★4 이상 · 목표 50개 이상 · 직원 7명 이상 · 자금 2억 이하 (등급·본관 Lv3/4·2층·명소 Lv3·직원 정원이 2~5년차 사다리)', async () => {
    const rows = (await runBotAsync(5, 1)).filter((r) => r.year <= 5);
    const last = rows.at(-1)!;
    expect(last.star).toBeGreaterThanOrEqual(YEAR5_STAR_MIN);
    expect(last.goals).toBeGreaterThanOrEqual(YEAR5_GOALS_MIN);
    expect(last.staff).toBeGreaterThanOrEqual(YEAR5_STAFF_MIN);
    expect(last.money).toBeLessThanOrEqual(YEAR5_MONEY_MAX);
    // 엔딩: ENDING_YEAR년 ENDING_MONTH월 1일 아침에 뜬다 — 그때 닫히는 월말 카드는 「그 앞 달」 것이라 행의 month는 ENDING_MONTH − 1
    const first = rows.find((r) => r.ending);
    expect(first, '엔딩이 한 판 안에 뜨지 않았다').toBeTruthy();
    expect([first!.year, first!.month]).toEqual([ENDING_YEAR, ENDING_MONTH - 1]);
    expect(first!.ending!.total).toBeGreaterThanOrEqual(ENDING_SCORE_MIN);
    expect(first!.ending!.total).toBeLessThanOrEqual(ENDING_SCORE_MAX);
  }, 180_000);
});
