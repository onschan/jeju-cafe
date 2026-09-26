/** 평가: 매년 12월 말 「제주 카페 랭킹」 — 점수 = 명성 + 시설 인기 합. 경쟁 카페는 해마다 자란다. */
import type { GameState, Evaluation } from './types.ts';
import { RIVALS } from './data.ts';
import { popularitySum } from './facility.ts';
export const PRIZES = [3_000_000, 1_500_000, 800_000, 0, 0, 0];
export function myScore(s: GameState): number { return s.fame + popularitySum(s); }
export function rivalScore(id: string, year: number): number { const r = RIVALS.find((x) => x.id === id)!; return r.base + r.growth * (year - 1); }
export function evaluate(s: GameState): Evaluation {
  const rows = [{ id: 'me', name: '우리 카페', score: myScore(s), me: true }, ...RIVALS.map((r) => ({ id: r.id, name: r.name, score: rivalScore(r.id, s.clock.year), me: false }))];
  rows.sort((a, b) => b.score - a.score || (a.me ? -1 : 1));
  const rank = rows.findIndex((r) => r.me) + 1;
  const prize = PRIZES[rank - 1] ?? 0;
  s.money += prize;
  const ev: Evaluation = { year: s.clock.year, rank, score: myScore(s), rows, prize };
  s.evaluations.push(ev);
  s.fx.push({ kind: 'notice', text: `${s.clock.year}년 제주 카페 랭킹 ${rank}위${prize ? ` · 상금 ₩${(prize / 10_000).toFixed(0)}만` : ''}` });
  return ev;
}
