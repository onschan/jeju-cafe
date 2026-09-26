/** 목표: 짧은 사다리 하나. 한 줄로 보여 주고, 이루면 다음으로. */
import type { GameState } from './types.ts';
import { usables, popularitySum } from './facility.ts';
import { facilityDef } from './data.ts';
export interface Objective { id: string; text: string; reward: number; check: (s: GameState) => boolean }
export const OBJECTIVES: Objective[] = [
  { id: 'seat3', text: '자리 3개 놓기', reward: 200_000, check: (s) => usables(s).filter((f) => facilityDef(f.type).tab === 'seat').length >= 3 },
  { id: 'guest10', text: '손님 10명 받기', reward: 300_000, check: (s) => s.stats.guests >= 10 },
  { id: 'env3', text: '나무·꽃·바위 3개 심기', reward: 200_000, check: (s) => Object.values(s.facilities).filter((f) => facilityDef(f.type).tab === 'env').length >= 3 },
  { id: 'synergy2', text: '상성 짝 2개 만들기', reward: 300_000, check: (s) => synergyCount(s) >= 2 },
  { id: 'pop40', text: '시설 인기 합 40', reward: 400_000, check: (s) => popularitySum(s) >= 40 },
  { id: 'staff1', text: '직원 1명 뽑기', reward: 300_000, check: (s) => s.staff.length >= 1 },
  { id: 'shop1', text: '가게 1개 열기', reward: 400_000, check: (s) => usables(s).some((f) => facilityDef(f.type).tab === 'shop') },
  { id: 'unlock1', text: '연구로 1개 열기', reward: 300_000, check: (s) => s.unlocked.facilities.length + s.unlocked.menus.length + s.unlocked.guests.length > startUnlocked() },
  { id: 'fame50', text: '명성 50', reward: 500_000, check: (s) => s.fame >= 50 },
  { id: 'guests300', text: '손님 300명 받기', reward: 500_000, check: (s) => s.stats.guests >= 300 },
  { id: 'parcel1', text: '땅 하나 사기', reward: 800_000, check: (s) => s.parcels.filter((p) => p.owned).length >= 2 },
  { id: 'pop150', text: '시설 인기 합 150', reward: 1_000_000, check: (s) => popularitySum(s) >= 150 },
  { id: 'invest1', text: '동네에 투자 1건', reward: 800_000, check: (s) => s.invested.length >= 1 },
  { id: 'fame200', text: '명성 200', reward: 1_500_000, check: (s) => s.fame >= 200 },
  { id: 'rank1', text: '제주 카페 랭킹 1위', reward: 5_000_000, check: (s) => s.evaluations.some((e) => e.rank === 1) },
];
import { synergyPairs } from './facility.ts';
function synergyCount(s: GameState): number { let n = 0; for (const f of Object.values(s.facilities)) n += synergyPairs(s, f).length; return Math.floor(n / 2); }
let START_UNLOCKED = -1;
function startUnlocked(): number { return START_UNLOCKED; }
export function noteStartUnlocked(s: GameState): void { START_UNLOCKED = s.unlocked.facilities.length + s.unlocked.menus.length + s.unlocked.guests.length; }
export function currentObjective(s: GameState): Objective | null { return OBJECTIVES.find((o) => !s.objectivesDone.includes(o.id)) ?? null; }
export function checkObjectives(s: GameState): void {
  const o = currentObjective(s);
  if (!o || !o.check(s)) return;
  s.objectivesDone.push(o.id);
  s.money += o.reward;
  s.fx.push({ kind: 'notice', text: `목표 달성 — ${o.text} · ₩${(o.reward / 10_000).toFixed(0)}만` });
}
