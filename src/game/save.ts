import type { GameState } from './types.ts';
import { SAVE_VERSION } from './state.ts';
import { FACILITIES, MENUS, GUEST_TYPES } from './data.ts';
export function serialize(s: GameState): string { return JSON.stringify(s); }
export function deserialize(json: string): GameState {
  const o = JSON.parse(json) as GameState;
  if (!o || typeof o !== 'object' || o.version !== SAVE_VERSION) throw new Error(`save version mismatch: ${o?.version} (expected ${SAVE_VERSION})`);
  // 같은 버전 안에서 데이터에 추가된 「처음부터 열린」 것들을 채운다 (울타리처럼 뒤에 붙인 카탈로그)
  o.cafeName ??= '우리 카페';
  o.hints ??= [];
  o.hiring ??= null;
  o.tutorial ??= -1;
  o.orders ??= []; o.orderSeq ??= 0;
  for (const q of o.orders) q.total ||= q.ms || 1;
  for (const f of Object.values(o.facilities)) { f.dirty ??= 0; f.dishes ??= 0; }
  for (const g of o.guests) { g.served ??= true; g.waitMs ??= 0; }
  // 옛 세이브: 능력 하나(서비스 1~5) → 능력 4가지 + 담당 + 실적
  for (const st of [...o.staff, ...o.candidates]) {
    const v = st as unknown as { service: number; speed?: number; clean?: number; charm?: number; duty?: string; served?: number; happy?: number; month?: { served: number; happy: number }; until?: number; from?: string };
    if (v.speed === undefined) { v.service = Math.min(10, v.service * 2); v.speed = Math.max(1, Math.round(v.service / 2)); v.clean = v.speed; v.charm = v.speed; }
    v.duty ??= 'service'; v.served ??= 0; v.happy ??= 0; v.month ??= { served: 0, happy: 0 };
  }
  for (const c of o.candidates) { const v = c as unknown as { until: number; from?: string }; v.from ??= 'flyer'; if (v.until > 40) v.until = 20; }
  // 옛 세이브(서비스 1~5 하나뿐)의 직원 → 능력 4가지 (손놀림 값이 없으면 옛 것)
  for (const st of [...o.staff, ...o.candidates]) { const v = st as { service: number; speed?: number; clean?: number; charm?: number }; if (v.speed === undefined) { v.service = Math.min(10, v.service * 2); v.speed = v.service; v.clean = v.service; v.charm = v.service; } }
  // 벽이 칸을 먹던 옛 방식 → 변 벽. 옛 벽 시설은 치우고 값을 돌려준다.
  for (const f of Object.values(o.facilities)) { const d = FACILITIES.find((x) => x.id === f.type); if (d?.sub === 'wall') { delete o.facilities[f.id]; o.money += d.cost; for (const c of o.grid.cells) if (c.objectId === f.id) c.objectId = null; o.layoutRev++; } }
  o.todayIncome ??= 0; o.lastDay ??= null;
  o.month.happy ??= 0; o.month.fame0 ??= o.fame;
  if (o.lastMonth) { o.lastMonth.happy ??= 0; o.lastMonth.fame0 ??= o.fame; o.lastMonth.year ??= o.clock.year; o.lastMonth.month ??= Math.max(1, o.clock.month - 1); }
  for (const d of FACILITIES) if (d.unlock === 0 && !o.unlocked.facilities.includes(d.id)) o.unlocked.facilities.push(d.id);
  for (const d of MENUS) if (d.unlock === 0 && !o.unlocked.menus.includes(d.id)) o.unlocked.menus.push(d.id);
  for (const d of GUEST_TYPES) if (d.unlock === 0 && !o.unlocked.guests.includes(d.id)) o.unlocked.guests.push(d.id);
  return o;
}
