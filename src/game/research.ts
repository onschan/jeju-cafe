/** 연구: 손님이 쓸 때마다 쌓인다. 시설·메뉴·손님층을 연구로 연다. 시설은 연구로 Lv도 올린다. */
import type { GameState, ApplyResult } from './types.ts';
import { FACILITIES, MENUS, GUEST_TYPES, facilityDef } from './data.ts';
export const LEVEL_MAX = 3;
export const LEVEL_COST = [0, 200, 450];
export interface Unlockable { kind: 'facility' | 'menu' | 'guest'; id: string; name: string; cost: number; done: boolean }
export function unlockables(s: GameState): Unlockable[] {
  return [
    ...FACILITIES.filter((d) => d.unlock > 0).map((d) => ({ kind: 'facility' as const, id: d.id, name: d.name, cost: d.unlock, done: s.unlocked.facilities.includes(d.id) })),
    ...MENUS.filter((d) => d.unlock > 0).map((d) => ({ kind: 'menu' as const, id: d.id, name: d.name, cost: d.unlock, done: s.unlocked.menus.includes(d.id) })),
    ...GUEST_TYPES.filter((d) => d.unlock > 0).map((d) => ({ kind: 'guest' as const, id: d.id, name: d.name, cost: d.unlock, done: s.unlocked.guests.includes(d.id) })),
  ].sort((a, b) => a.cost - b.cost);
}
export function canUnlock(s: GameState, id: string): ApplyResult {
  const u = unlockables(s).find((x) => x.id === id);
  if (!u) return { ok: false, reason: '연구할 게 아니에요' };
  if (u.done) return { ok: false, reason: '이미 열렸어요' };
  if (s.research < u.cost) return { ok: false, reason: `연구 ${u.cost} 필요` };
  return { ok: true };
}
export function unlock(s: GameState, id: string): void {
  const u = unlockables(s).find((x) => x.id === id)!;
  s.research -= u.cost;
  if (u.kind === 'facility') s.unlocked.facilities.push(id);
  else if (u.kind === 'menu') { s.unlocked.menus.push(id); if (s.menu.length < 5) s.menu.push(id); }
  else s.unlocked.guests.push(id);
  s.fx.push({ kind: 'unlock', text: `${u.name} 신발매!` });
}
export function canLevelUp(s: GameState, fid: string): ApplyResult {
  const f = s.facilities[fid];
  if (!f) return { ok: false, reason: '없어진 시설이에요' };
  const d = facilityDef(f.type);
  if (d.tab === 'env') return { ok: false, reason: '환경은 단계가 없어요' };
  if (f.level >= LEVEL_MAX) return { ok: false, reason: '최고 단계예요' };
  const cost = LEVEL_COST[f.level]!;
  if (s.research < cost) return { ok: false, reason: `연구 ${cost} 필요` };
  return { ok: true };
}
export function levelUp(s: GameState, fid: string): void { const f = s.facilities[fid]!; s.research -= LEVEL_COST[f.level]!; f.level++; s.layoutRev++; }
