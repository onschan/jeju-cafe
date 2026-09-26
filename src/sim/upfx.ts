/**
 * 「상성 UP」 묶음 연출 (video-flow §1-2 2:00 · §2-1 C).
 *
 * 영상에서 제일 기분 좋은 순간 — 시설 하나를 놓으면 그 둘레 방 7~8개 위에 「상성 UP」 배너가
 * **한꺼번에** 튀어오른다. 하나 놓고 하나 칭찬받는 게 아니라, 한 번 놓고 우르르 칭찬받는다.
 * 우리는 요금 배수(fee.ts)가 이미 자리마다 다르게 계산되니, 놓기 전후를 재서 오른 자리마다 `+8%`를 띄운다.
 *
 * 결정적: rng·Date를 쓰지 않는다. 연출 이벤트(fx)만 남기고 상태는 안 바꾼다.
 */
import type { GameState } from './types.ts';
import { objectDef } from '../data/index.ts';
import { seatFeeQuote } from './fee.ts';
import { pushFx } from './fx.ts';

/** 놓기 전에 자리마다 요금 배수를 적어 둔다 */
export function snapshotSeatMults(state: GameState): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of Object.values(state.objects)) {
    if (objectDef(o.type).kind !== 'seat') continue;
    try { out.set(o.id, seatFeeQuote(state, o).mult); } catch { /* 메뉴가 없으면 값이 없다 */ }
  }
  return out;
}
/** 놓은 뒤: 배수가 오른 자리마다 `+n%` 를 띄운다. 띄운 수를 돌려준다. */
export function pushUpFx(state: GameState, before: Map<string, number>): number {
  let n = 0;
  for (const o of Object.values(state.objects)) {
    if (objectDef(o.type).kind !== 'seat') continue;
    const was = before.get(o.id);
    if (was === undefined) continue; // 방금 놓은 자리 자신은 배치 바가 이미 말한다
    let now: number;
    try { now = seatFeeQuote(state, o).mult; } catch { continue; }
    const pct = Math.round((now - was) * 100);
    if (pct <= 0) continue;
    pushFx(state, { kind: 'up', x: o.x, y: o.y, text: `+${pct}%`, order: n, tick: state.tick });
    n++;
  }
  return n;
}
