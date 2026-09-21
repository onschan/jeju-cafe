/** 길·담 두 번 탭 배치 (ease, 카이로식 "Start floor where? → 끝 어디?"): 탭 1 시작 칸 → 탭 2 끝 칸 → 두 칸 사이 직선/ㄱ자 미리보기 → ✓ 확정.
 *  드래그는 항상 카메라 이동이라 손대는 대로 길이 깔리지 않는다. 이미 길·담·시설이 있는 칸은 건너뛰고 비용에서 뺀다.
 *  확정 전엔 돈이 안 나가고, 확정 뒤 되돌리기 1회로 그 줄 전체를 되돌린다(undo.ts placeMany). */
import type { GameState, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { canPlace, objectAt } from './grid.ts';
import { placeCost } from './cafe.ts';

/** 두 번 탭 라인 배치를 쓰는 종류 (kind). 나머지 시설은 고스트 탭 배치. */
export const LINE_KINDS: ReadonlySet<string> = new Set(['path', 'wall']);
export function isLineType(type: string): boolean {
  return LINE_KINDS.has(objectDef(type).kind);
}

/** ㄱ자 꺾는 순서: 'xy' = 먼저 x(가로), 그다음 y(세로). ↻ 방향 버튼으로 바꾼다. */
export type LineOrder = 'xy' | 'yx';

/** 시작 칸에서 끝 칸까지 직선 또는 ㄱ자(먼저 한 축, 그다음 다른 축)로 지나는 칸. 시작·끝 칸 포함, 같은 칸이면 1칸. */
export function lineCells(from: Pt, to: Pt, order: LineOrder = 'xy'): Pt[] {
  const out: Pt[] = [];
  const step = (a: number, b: number) => (a < b ? 1 : -1);
  let x = from.x, y = from.y;
  out.push({ x, y });
  const goX = () => { while (x !== to.x) { x += step(x, to.x); out.push({ x, y }); } };
  const goY = () => { while (y !== to.y) { y += step(y, to.y); out.push({ x, y }); } };
  if (order === 'xy') { goX(); goY(); } else { goY(); goX(); }
  return out;
}

export interface LinePlan {
  /** 실제로 놓을 칸 (놓을 수 있는 칸만) */
  cells: Pt[];
  /** 이미 같은 종류가 있어 건너뛴 칸 */
  skipped: Pt[];
  /** 다른 시설·남의 땅·마을 길이라 못 놓는 칸 */
  blocked: Pt[];
  /** ok:false면 확정 못 하는 이유, ok:true면 막힌 칸이 있을 때 그 첫 이유(없으면 null) */
  reason: string | null;
  /** 놓을 칸 × 칸당 비용 */
  cost: number;
  ok: boolean;
}

/** 라인 배치 계획: 놓을 수 있는 칸·건너뛴 칸·비용. 놓을 칸이 하나도 없거나 돈이 모자라면 ok:false. */
export function planLine(state: GameState, type: string, from: Pt, to: Pt, order: LineOrder = 'xy'): LinePlan {
  const per = placeCost(state, type);
  const cells: Pt[] = [], skipped: Pt[] = [], blocked: Pt[] = [];
  let reason: string | null = null;
  const seen = new Set<string>();
  for (const p of lineCells(from, to, order)) {
    const k = `${p.x},${p.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const o = objectAt(state, p.x, p.y);
    if (o && o.type === type) { skipped.push(p); continue; }
    const c = canPlace(state, type, p.x, p.y);
    if (c.ok) cells.push(p);
    else { blocked.push(p); if (o) skipped.push(p); reason ??= c.reason ?? '여기엔 못 놓아요'; }
  }
  const cost = cells.length * per;
  if (cells.length === 0) return { cells, skipped, blocked, reason: reason ?? '이미 다 놓여 있어요', cost, ok: false };
  if (state.money < cost) return { cells, skipped, blocked, reason: '돈이 모자라요', cost, ok: false };
  return { cells, skipped, blocked, reason, cost, ok: true };
}
