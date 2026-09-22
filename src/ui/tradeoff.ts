/** 배치 고스트 트레이드오프 두 줄 (fun 통합, 사용자 피드백 「얻는 것/잃는 것이 같은 화면에서 비교되게」):
 *  얻는 것 — "+좌석 2 · +경관 1 · 관광객 +3%/일 · 테라스 거리 3칸" / 잃는 것 — "−경관 1(자리 2곳) · 유지비 ₩1만/월 · 날씨 탓 −".
 *  sim 순수 함수만 쓴다(sceneryScore·objectScenery·streetIfPlaced·sceneryGainText). */
import type { GameState } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { objectScenery, seasonOf, isSeat, streetIfPlaced, treeOf, sceneryMultOf, cafeScenery, STREET_MIN, STREET_BONUS_PCT } from '../sim/index.ts';
import { itemScenery } from '../sim/grid.ts';
import { wonText } from '../data/labels.ts';

const RADIUS = 2;

export interface Tradeoff { gain: string; loss: string }

export function tradeoffOf(s: GameState, type: string, x: number, y: number): Tradeoff {
  const def = objectDef(type);
  const gains: string[] = [];
  const losses: string[] = [];
  const seats = Object.values(s.objects).filter((o) => !o.build && isSeat(s, o));
  const near = seats.filter((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= RADIUS && !(o.x === x && o.y === y)).length;
  if (def.kind === 'seat') gains.push(`+좌석 ${def.seats ?? 2}`);
  else if ((def.popularity ?? 0) > 0 && def.kind === 'facility') gains.push(`+인기 ${def.popularity}`);
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
  if (def.kind === 'seat' && !def.indoor) losses.push('비 오는 날 빈다');
  if (def.indoor) losses.push('실내는 값이 세다');
  if (def.noise > 0 && sc >= 0) losses.push(`소음 ${def.noise}`);
  return { gain: gains.join(' · '), loss: losses.join(' · ') };
}
