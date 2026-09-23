/** 효과 범위 힌트 계산 (UX §5.3): 시설 종류·자리가 주어지면 반경 안에서 같은 명당의 다른 조각이 될 시설 발자국을 고른다.
 *  sim의 명당 판정(corners.ts)과 같은 규칙(체비쇼프 거리)을 UI에서 가볍게 다시 계산한다 — 성립 "가능성" 표시용. */
import type { GameState, PlacedObject } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import type { RangeHint } from '../render/GameView';
import { cornerIfPlaced, cornersWithPiece } from '../sim/corners.ts';

export const HINT_RADIUS = 2;

function cheb(ax: number, ay: number, aw: number, ah: number, b: PlacedObject, bw: number, bh: number): number {
  const dx = Math.max(0, ax - (b.x + bw - 1), b.x - (ax + aw - 1));
  const dy = Math.max(0, ay - (b.y + bh - 1), b.y - (ay + ah - 1));
  return Math.max(dx, dy);
}

/** 이 종류를 (x, y)에 두면 같은 명당의 조각이 되는 시설들 */
export function cornerPartners(s: GameState, type: string, x: number, y: number, ignoreId?: string): PlacedObject[] {
  const def = objectDef(type);
  const defs = cornersWithPiece(type);
  if (defs.length === 0) return [];
  const out: PlacedObject[] = [];
  for (const o of Object.values(s.objects)) {
    if (o.id === ignoreId || o.build) continue;
    const od = objectDef(o.type);
    const d = cheb(x, y, def.w, def.h, o, od.w, od.h);
    if (defs.some((c) => d <= (c.radius || HINT_RADIUS) && c.pieces.some((p) => p.type === o.type && p.type !== type))) out.push(o);
  }
  return out;
}

export function rangeHintFor(s: GameState, type: string, x: number, y: number, ignoreId?: string): RangeHint {
  const def = objectDef(type);
  return { x, y, w: def.w, h: def.h, radius: HINT_RADIUS, marks: cornerPartners(s, type, x, y, ignoreId).map((o) => { const d = objectDef(o.type); return { x: o.x, y: o.y, w: d.w, h: d.h }; }), badge: cornerBadge(s, type, x, y, ignoreId) };
}

/** 고스트가 명당 조각이면 배지 — 여기 놓으면 완성되는 명당이 있으면 "이걸 놓으면 꽃길 완성", 아니면 명당 이름만("꽃길 조각") */
export function cornerBadge(s: GameState, type: string, x: number, y: number, ignoreId?: string): string | undefined {
  const done = cornerIfPlaced(s, type, x, y, ignoreId);
  if (done) return `이걸 놓으면 ${done.name} 완성`;
  const c = cornersWithPiece(type)[0];
  return c ? `${c.name} 조각` : undefined;
}
