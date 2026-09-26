/** 투자: 내 땅 밖(동네)에 돈 쓰기. 각 1회. */
import type { GameState, ApplyResult } from './types.ts';
import { INVESTS } from './data.ts';
export function canInvest(s: GameState, id: string): ApplyResult {
  const d = INVESTS.find((i) => i.id === id);
  if (!d) return { ok: false, reason: '없는 투자예요' };
  if (s.invested.includes(id)) return { ok: false, reason: '이미 했어요' };
  if (s.money < d.cost) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
export function invest(s: GameState, id: string): void {
  const d = INVESTS.find((i) => i.id === id)!;
  s.money -= d.cost; s.month.spent += d.cost;
  s.invested.push(id);
  if (d.fame) s.fame += d.fame;
  s.fx.push({ kind: 'notice', text: `${d.name} 완료 — ${d.desc}` });
}
