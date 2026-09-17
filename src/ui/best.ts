/** 최고 점수 (UI 전용, localStorage). 연 점수 = 그 해 월 매출 합(자리표시자), 월 신기록 = 월 매출 최고.
 *  sim은 연 누적을 갖고 있지 않아 월말 카드가 뜰 때마다 UI 루프에서 더한다. */

const BEST_KEY = 'jeju-cafe:best';
const YEAR_ACC_KEY = 'jeju-cafe:yearAcc';

export interface Best { yearScore: number; monthIncome: number; at: { year: number } | null }
interface YearAcc { playerId: string; year: number; sum: number }

function read<T>(key: string): T | null {
  try { const j = localStorage.getItem(key); return j ? (JSON.parse(j) as T) : null; } catch { return null; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* noop */ }
}

export function getBest(): Best {
  return read<Best>(BEST_KEY) ?? { yearScore: 0, monthIncome: 0, at: null };
}

export interface MonthCardLike { income: number; month: number; year: number }

/** 월말 카드가 새로 떴을 때 호출. 월 신기록이면 true (첫 달은 제외). 12월이면 연 점수를 갱신한다. */
export function recordMonthCard(playerId: string, card: MonthCardLike): { monthRecord: boolean; yearRecord: boolean } {
  const best = getBest();
  let monthRecord = false;
  let yearRecord = false;
  if (card.income > best.monthIncome) {
    monthRecord = best.monthIncome > 0;
    best.monthIncome = card.income;
  }
  let acc = read<YearAcc>(YEAR_ACC_KEY);
  if (!acc || acc.playerId !== playerId || acc.year !== card.year) acc = { playerId, year: card.year, sum: 0 };
  acc.sum += card.income;
  if (card.month === 12) {
    if (acc.sum > best.yearScore) { best.yearScore = acc.sum; best.at = { year: card.year }; yearRecord = true; }
    acc = { playerId, year: card.year + 1, sum: 0 };
  }
  write(YEAR_ACC_KEY, acc);
  write(BEST_KEY, best);
  return { monthRecord, yearRecord };
}
