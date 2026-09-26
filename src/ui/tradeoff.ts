/** 배치 고스트 트레이드오프 두 줄 (fun 통합, 사용자 피드백 「얻는 것/잃는 것이 같은 화면에서 비교되게」):
 *  얻는 것 — "+좌석 2 · +경관 1 · 관광객 +3%/일 · 테라스 거리 3칸" / 잃는 것 — "−경관 1(자리 2곳) · 유지비 ₩1만/월 · 날씨 탓 −".
 *  sim 순수 함수만 쓴다(sceneryScore·objectScenery·streetIfPlaced·sceneryGainText). */
import type { GameState } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { objectScenery, seasonOf, isSeat, streetIfPlaced, treeOf, sceneryMultOf, cafeScenery, STREET_MIN, STREET_BONUS_PCT } from '../sim/index.ts';
import { itemScenery } from '../sim/grid.ts';
import { constructions, buildDaysLeft, salaryDue, rentOf, upkeepOf, parcelAt } from '../sim/index.ts';
import { fmtNum } from '../sim/format.ts';
import { wonText } from '../data/labels.ts';
import { feeQuoteIfPlaced } from '../sim/fee.ts'; // spot2: 여기에 놓으면 얼마를 받나

const RADIUS = 2;

export interface Tradeoff { gain: string; loss: string; cost?: string }

/** stakes: 기회비용 한 줄 — 「이걸 사면 뭘 못 하는가」. 돈이 빠듯하면 급여, 건축가가 차면 다음 공사까지 남은 날.
 *  네 자원(돈·땅·건축가·직원 정원) 중 이 배치로 가장 먼저 막히는 것 하나만 말한다. */
export const OPPORTUNITY_SHARE = 0.4;
export function opportunityCost(s: GameState, type: string): string | null {
  const price = objectDef(type).cost;
  const busy = constructions(s).length;
  if (busy >= s.builders) {
    const days = Math.min(...constructions(s).map((o) => buildDaysLeft(s, o)));
    return `일꾼 ${busy}/${s.builders} — 다음 공사는 ${Math.max(1, days)}일 뒤`;
  }
  const fixed = s.staff.reduce((n, st) => n + salaryDue(st), 0) + monthlyFixedCost(s);
  const left = s.money - price;
  if (left < 0) return null; // 「돈이 모자라요」는 아래 줄이 따로 말한다
  if (left < fixed) return '이걸 사면 이번 달 월급이 빠듯해요';
  if (left < fixed * 2) return `사고 나면 한 달 고정비만 남아요`;
  if (price > s.money * OPPORTUNITY_SHARE) return `사고 나면 ${manWon(left)} 남아요`;
  if (busy === s.builders - 1) return `일꾼이 한 명 남아요 (${busy + 1}/${s.builders})`;
  return null;
}
/** 만 단위로 줄인 금액 (한 줄 ≤ 22자) */
function manWon(n: number): string {
  return n >= 10_000 ? `₩${fmtNum(Math.round(n / 10_000))}만` : `₩${fmtNum(n)}`;
}
/** 월급 말고 매달 그냥 나가는 돈 (임대료 + 유지비) */
function monthlyFixedCost(s: GameState): number {
  return rentOf(s) + Object.values(s.objects).reduce((n, o) => n + (parcelAt(s, o.x, o.y)?.owned ? upkeepOf(s, o) : 0), 0);
}

export function tradeoffOf(s: GameState, type: string, x: number, y: number): Tradeoff {
  const def = objectDef(type);
  const gains: string[] = [];
  const losses: string[] = [];
  const seats = Object.values(s.objects).filter((o) => !o.build && isSeat(s, o));
  const near = seats.filter((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= RADIUS && !(o.x === x && o.y === y)).length;
  if (def.kind === 'seat') gains.push(`+좌석 ${def.seats ?? 2}`);
  // spot2: 자리·요금 시설이면 이 칸에서 실제로 받게 될 값을 ₩로 먼저 보여 준다 (사용자 피드백 "잘 꾸밀수록 요금이 좋아지는 게 보이게")
  const q = feeQuoteIfPlaced(s, type, x, y);
  if (q && q.base > 0) {
    const up = Math.round((q.mult - 1) * 100);
    gains.unshift(up > 0 ? `${wonText(q.price)} (기본 ${wonText(q.base)} +${up}%)` : `${wonText(q.price)}`);
  }
  else if ((def.popularity ?? 0) > 0 && def.kind === 'facility') gains.push(`+입소문 ${def.popularity}`);
  if (def.fee) gains.push(`요금 ${wonText(def.fee)}`);
  const sc = objectScenery(def, seasonOf(s.clock.month), itemScenery(s, type)) - def.noise;
  if (sc > 0) {
    gains.push(`+경관 ${sc}${near > 0 ? `(자리 ${near}곳)` : ''}`);
    if (seats.length > 0 && near > 0) {
      const before = cafeScenery(s);
      const pct = Math.round((sceneryMultOf(before + (sc * near) / seats.length) - sceneryMultOf(before)) * 100);
      if (pct > 0) gains.push(`관광객 +${pct}%/일`);
    }
  } else if (sc < 0) losses.push(`−경관 ${-sc}${near > 0 ? `(자리 ${near}곳)` : ''}`);
  const street = streetIfPlaced(s, type, x, y);
  const t = treeOf(type);
  if (t && street >= STREET_MIN) gains.push(`${t.tree.street} ${street}칸 +${STREET_BONUS_PCT}%`);
  else if (t && t.index > 0 && street === STREET_MIN - 1) gains.push(`하나 더면 ${t.tree.street}`);
  if (def.upkeep > 0) losses.push(`유지비 ${wonText(def.upkeep)}/월`);
  if (def.noise > 0 && sc >= 0) losses.push(`소음 ${def.noise}`);
  const cost = opportunityCost(s, type); // stakes: 기회비용 한 줄
  return { gain: gains.join(' · '), loss: losses.join(' · '), ...(cost ? { cost } : {}) };
}
