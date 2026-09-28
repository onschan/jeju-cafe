import type { GameState } from './types.ts';
import { SAVE_VERSION } from './state.ts';
import { FACILITIES, MENUS, GUEST_TYPES } from './data.ts';
export function serialize(s: GameState): string { return JSON.stringify(s); }
export function deserialize(json: string): GameState {
  const o = JSON.parse(json) as GameState;
  if (!o || typeof o !== 'object' || o.version !== SAVE_VERSION) throw new Error(`save version mismatch: ${o?.version} (expected ${SAVE_VERSION})`);
  // 같은 버전 안에서 데이터에 추가된 「처음부터 열린」 것들을 채운다 (울타리처럼 뒤에 붙인 카탈로그)
  o.cafeName ??= '우리 카페';
  o.todayIncome ??= 0; o.lastDay ??= null;
  o.month.happy ??= 0; o.month.fame0 ??= o.fame;
  if (o.lastMonth) { o.lastMonth.happy ??= 0; o.lastMonth.fame0 ??= o.fame; o.lastMonth.year ??= o.clock.year; o.lastMonth.month ??= Math.max(1, o.clock.month - 1); }
  for (const d of FACILITIES) if (d.unlock === 0 && !o.unlocked.facilities.includes(d.id)) o.unlocked.facilities.push(d.id);
  for (const d of MENUS) if (d.unlock === 0 && !o.unlocked.menus.includes(d.id)) o.unlocked.menus.push(d.id);
  for (const d of GUEST_TYPES) if (d.unlock === 0 && !o.unlocked.guests.includes(d.id)) o.unlocked.guests.push(d.id);
  return o;
}
