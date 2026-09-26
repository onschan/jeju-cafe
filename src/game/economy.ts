/** 돈: 월말 정산(유지비·월급), 삼춘 대출, 적자는 빨간 숫자일 뿐 게임 오버 없음 */
import type { GameState } from './types.ts';
import { facilityDef } from './data.ts';
import { wagesTotal } from './staff.ts';
export const LOAN_THRESHOLD = -2_000_000;
export const LOAN_AMOUNT = 3_000_000;
export const LOAN_MAX = 3;
export function upkeepTotal(s: GameState): number {
  let n = 0;
  for (const f of Object.values(s.facilities)) n += facilityDef(f.type).upkeep;
  for (const c of s.grid.cells) if (c.floor) n += c.floor === 'path' ? 100 : 200;
  return n;
}
export function monthEnd(s: GameState): void {
  const upkeep = upkeepTotal(s);
  const wages = wagesTotal(s);
  s.money -= upkeep + wages;
  s.month.spent += upkeep + wages;
  s.lastMonth = { ...s.month };
  s.month = { income: 0, spent: 0, guests: 0 };
  if (s.money < LOAN_THRESHOLD && s.loan.count < LOAN_MAX && s.loan.lastYear !== s.clock.year) {
    s.loan.count++; s.loan.lastYear = s.clock.year; s.loan.balance += LOAN_AMOUNT; s.money += LOAN_AMOUNT;
    s.fx.push({ kind: 'notice', text: `삼춘이 ₩${(LOAN_AMOUNT / 10_000).toFixed(0)}만을 꿔 줬어요 (${s.loan.count}/${LOAN_MAX})` });
  }
}
