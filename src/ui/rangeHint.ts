/** 효과 범위 힌트 계산 (UX §5.3): 시설 종류·자리가 주어지면 반경 2 안에서 콤보가 성립할 상대 시설 발자국을 고른다.
 *  sim의 콤보 판정(compat.ts)과 같은 규칙(체비쇼프 거리·bIds 접두 일치)을 UI에서 가볍게 다시 계산한다 — 성립 "가능성" 표시용. */
import type { GameState, PlacedObject } from '../sim/index.ts';
import { objectDef, COMBOS } from '../data/index.ts';
import type { RangeHint } from '../render/GameView';
import { cornerIfPlaced, cornersWithPiece } from '../sim/corners.ts'; // fun-corner: 고스트 배지

export const HINT_RADIUS = 2;

function typeMatches(type: string, pattern: string): boolean {
  return pattern.endsWith('*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern;
}
function cheb(ax: number, ay: number, aw: number, ah: number, b: PlacedObject, bw: number, bh: number): number {
  const dx = Math.max(0, ax - (b.x + bw - 1), b.x - (ax + aw - 1));
  const dy = Math.max(0, ay - (b.y + bh - 1), b.y - (ay + ah - 1));
  return Math.max(dx, dy);
}

/** 이 종류를 (x, y)에 두면 콤보 상대가 되는 시설들 */
export function comboPartners(s: GameState, type: string, x: number, y: number, ignoreId?: string): PlacedObject[] {
  const def = objectDef(type);
  const out: PlacedObject[] = [];
  for (const o of Object.values(s.objects)) {
    if (o.id === ignoreId || o.build) continue;
    const od = objectDef(o.type);
    let hit = false;
    for (const c of COMBOS) {
      if (c.strength === 'down' || c.strength === 'none') continue;
      const r = c.radius || HINT_RADIUS;
      if (cheb(x, y, def.w, def.h, o, od.w, od.h) > r) continue;
      if ((c.a === type && c.bIds.some((p) => typeMatches(o.type, p))) || (c.a === o.type && c.bIds.some((p) => typeMatches(type, p)))) { hit = true; break; }
    }
    if (hit) out.push(o);
  }
  return out;
}

export function rangeHintFor(s: GameState, type: string, x: number, y: number, ignoreId?: string): RangeHint {
  const def = objectDef(type);
  return { x, y, w: def.w, h: def.h, radius: HINT_RADIUS, marks: comboPartners(s, type, x, y, ignoreId).map((o) => { const d = objectDef(o.type); return { x: o.x, y: o.y, w: d.w, h: d.h }; }), badge: cornerBadge(s, type, x, y, ignoreId) };
}

/** fun-corner: 고스트가 코너 조각이면 배지 — 여기 놓으면 완성되는 코너가 있으면 "이걸 놓으면 꽃길 완성", 아니면 코너 이름만("꽃길 조각") */
export function cornerBadge(s: GameState, type: string, x: number, y: number, ignoreId?: string): string | undefined {
  const done = cornerIfPlaced(s, type, x, y, ignoreId);
  if (done) return `이걸 놓으면 ${done.name} 완성`;
  const c = cornersWithPiece(type)[0];
  return c ? `${c.name} 조각` : undefined;
}
