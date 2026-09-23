/** 효과 범위 힌트 계산 (UX §5.3): 시설 종류·자리가 주어지면 반경 안에서 같은 명당의 다른 조각이 될 시설 발자국을 고른다.
 *  sim의 명당 판정(corners.ts)과 같은 규칙(체비쇼프 거리)을 UI에서 가볍게 다시 계산한다 — 성립 "가능성" 표시용.
 *  spot2: 조각은 시설 id가 아니라 종류(pieceMatches)다. 자리를 명당 옆에 놓으려 할 땐 "꽃길 옆이라 요금 +5%"를 미리 보여 주고,
 *  바람을 막는 시설(돌담)은 북서쪽에서 가려 주는 자리 칸을 표시한다. */
import type { GameState, PlacedObject } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import type { RangeHint } from '../render/GameView';
import { cornerIfPlaced, cornersWithPiece, pieceMatches, cornerDef, completedCorners, cornerEffectOf, isCornerTarget, CORNER_CAP } from '../sim/corners.ts';
import { WIND_WEDGE_MAX, windCoveredSeats, WIND_SHELTER_SAT } from '../sim/site.ts';

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
    if (defs.some((c) => d <= (c.radius || HINT_RADIUS) && c.pieces.some((p) => pieceMatches(p.type, o.type) && !pieceMatches(p.type, type)))) out.push(o);
  }
  return out;
}

/** 이 자리를 감싸는 완성 명당들 (자리·요금 시설을 놓을 때 "꽃길 옆이라 요금 +5%") */
function cornersAround(s: GameState, type: string, x: number, y: number): { names: string; feePct: number } | null {
  if (!isCornerTarget(objectDef(type))) return null;
  const def = objectDef(type);
  const hit = completedCorners(s).filter((c) => {
    const anchor = s.objects[c.anchorId];
    if (!anchor) return false;
    const ad = objectDef(anchor.type);
    return cheb(x, y, def.w, def.h, anchor, anchor.w ?? ad.w, anchor.h ?? ad.h) <= cornerDef(c.id).radius;
  });
  if (hit.length === 0) return null;
  const feePct = Math.min(CORNER_CAP.feePct, hit.reduce((n, c) => n + cornerEffectOf(c).feePct, 0));
  return { names: hit.map((c) => cornerDef(c.id).name).join('·'), feePct };
}

/** 발자국 → 표시용 사각형 */
function footOf(o: PlacedObject) {
  const d = objectDef(o.type);
  return { x: o.x, y: o.y, w: o.w ?? d.w, h: o.h ?? d.h };
}

export function rangeHintFor(s: GameState, type: string, x: number, y: number, ignoreId?: string): RangeHint {
  const def = objectDef(type);
  // 바람막이(돌담): 북서쪽 쐐기 3칸 안에서 가려 주는 야외 자리를 같이 표시한다 — "돌담을 왜 놓나"가 보이게
  const windSeats = windCoveredSeats(s, type, x, y, ignoreId);
  const partners = cornerPartners(s, type, x, y, ignoreId);
  const seen = new Set(partners.map((o) => o.id));
  const marks = [...partners, ...windSeats.filter((o) => !seen.has(o.id))].map(footOf);
  const corner = cornerBadge(s, type, x, y, ignoreId);
  // 3초 규칙: 한 번에 한 줄만 — 명당 완성 예고가 1순위, 그다음이 바람막이
  const badge = corner?.startsWith('이걸 놓으면') ? corner
    : windSeats.length > 0 ? `자리 ${windSeats.length}곳 겨울 바람을 막아요 (만족 +${WIND_SHELTER_SAT})`
    : def.wind > 0 && !corner ? '자리 북서쪽에 두면 바람을 막아요'
    : corner;
  return { x, y, w: def.w, h: def.h, radius: windSeats.length > 0 ? WIND_WEDGE_MAX : HINT_RADIUS, marks, badge };
}

/** 고스트가 명당과 얽히면 배지 한 줄.
 *  ① 여기 놓으면 완성되는 명당이 있으면 "이걸 놓으면 꽃길 완성 · 자리 3곳이 좋아져요"
 *  ② 자리·요금 시설을 이미 완성된 명당 옆에 놓으려 하면 "꽃길 옆이라 요금 +5%"
 *  ③ 그냥 조각이면 명당 이름만("꽃길 조각") */
export function cornerBadge(s: GameState, type: string, x: number, y: number, ignoreId?: string): string | undefined {
  const done = cornerIfPlaced(s, type, x, y, ignoreId);
  if (done) {
    const seats = seatsAround(s, done.radius, type, x, y, ignoreId);
    return seats > 0 ? `이걸 놓으면 ${done.name} 완성 · 자리 ${seats}곳이 좋아져요` : `이걸 놓으면 ${done.name} 완성`;
  }
  const near = cornersAround(s, type, x, y);
  if (near) return `${near.names} 옆이라 요금 +${near.feePct}%`;
  const c = cornersWithPiece(type)[0];
  return c ? `${c.name} 조각` : undefined;
}

/** 고스트 자리 반경 안의 자리·요금 시설 수 (명당을 완성하면 좋아지는 자리) */
function seatsAround(s: GameState, radius: number, type: string, x: number, y: number, ignoreId?: string): number {
  const def = objectDef(type);
  let n = 0;
  for (const o of Object.values(s.objects)) {
    if (o.id === ignoreId || o.build) continue;
    const od = objectDef(o.type);
    if (!isCornerTarget(od)) continue;
    if (cheb(x, y, def.w, def.h, o, o.w ?? od.w, o.h ?? od.h) <= radius) n++;
  }
  return n;
}


