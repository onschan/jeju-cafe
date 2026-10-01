/** 돈: 월말 정산(유지비·월급), 삼춘 대출, 적자는 빨간 숫자일 뿐 게임 오버 없음 */
import type { GameState } from './types.ts';
import { facilityDef } from './data.ts';
import { wagesTotal } from './staff.ts';
import { amenities } from './facility.ts';
export const LOAN_THRESHOLD = -2_000_000;
export const LOAN_AMOUNT = 3_000_000;
export const LOAN_MAX = 3;
export function upkeepTotal(s: GameState): number {
  let n = 0;
  for (const f of Object.values(s.facilities)) n += facilityDef(f.type).upkeep;
  for (const c of s.grid.cells) { if (c.floor) n += c.floor === 'path' ? 100 : 200; if (c.wn) n += facilityDef(c.wn).upkeep; if (c.ww) n += facilityDef(c.ww).upkeep; }
  return n;
}
export function monthEnd(s: GameState): void {
  const a = amenities(s);
  const upkeep = Math.round(upkeepTotal(s) * (a.has('storage') ? 0.9 : 1));  // 창고: 유지비 −10%
  const wages = Math.round(wagesTotal(s) * (a.has('locker') ? 0.9 : 1));     // 사물함: 월급 −10%
  s.money -= upkeep + wages;
  s.month.spent += upkeep + wages;
  // 달이 넘어간 직후라 clock은 이미 다음 달 — 지난달 이름은 하나 되돌린다
  const pm = s.clock.month === 1 ? 12 : s.clock.month - 1, py = s.clock.month === 1 ? s.clock.year - 1 : s.clock.year;
  s.lastMonth = { ...s.month, year: py, month: pm };
  s.month = { income: 0, spent: 0, guests: 0, happy: 0, fame0: s.fame };
  if (s.money < LOAN_THRESHOLD && s.loan.count < LOAN_MAX && s.loan.lastYear !== s.clock.year) {
    s.loan.count++; s.loan.lastYear = s.clock.year; s.loan.balance += LOAN_AMOUNT; s.money += LOAN_AMOUNT;
    s.fx.push({ kind: 'notice', text: `삼춘이 ₩${(LOAN_AMOUNT / 10_000).toFixed(0)}만을 꿔 줬어요 (${s.loan.count}/${LOAN_MAX})` });
  }
}
