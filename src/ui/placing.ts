/** 배치 편의 순수 로직 (UX §5.3) — App.tsx가 쓰고 테스트가 직접 검증한다. */
import { canPlace, placeCost, footprint, PROTECTED_TYPES, canDisturb, type GameState } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';

/** 일괄 철거에서 빼는 종류 (§5.3): 본관·정낭·정류장·진입점 시설 */
export const NO_DEMOLISH_KINDS = new Set(['busstop', 'gate', 'building']);

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface BuildGhost { x: number; y: number; rot: number }

/** 사각형 안 셀 목록 */
export function rectCells(r: Rect): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = Math.min(r.x0, r.x1); x <= Math.max(r.x0, r.x1); x++) for (let y = Math.min(r.y0, r.y1); y <= Math.max(r.y0, r.y1); y++) out.push({ x, y });
  return out;
}

/** 사각형에 발자국이 걸치는 철거 가능한 시설 id (본관·정낭·정류장·진입점·덤불 제외, 손님이 앉았거나 지나가는 시설도 제외 — 하나 때문에 일괄 철거가 통째로 막히지 않게) */
export function demolishTargets(s: GameState, r: Rect): string[] {
  const cells = new Set(rectCells(r).map((c) => `${c.x},${c.y}`));
  const ids: string[] = [];
  for (const o of Object.values(s.objects)) {
    const d = objectDef(o.type);
    if (PROTECTED_TYPES.has(o.type) || NO_DEMOLISH_KINDS.has(d.kind) || o.type === 'bush_wild') continue;
    if (!footprint(o.type, o.x, o.y).some((p) => cells.has(`${p.x},${p.y}`))) continue;
    if (!canDisturb(s, o).ok) continue;
    ids.push(o.id);
  }
  return ids;
}

/** 연속 배치: 한 개를 놓은 뒤 다음 고스트. 돈이 모자라면 종료(reason), 옆 칸이 비어 있으면 그리로, 아니면 제자리(빨간 고스트로 남아 끌어서 옮긴다). */
export function nextGhostAfterPlace(s: GameState, type: string, ghost: BuildGhost): { done: true; reason: string } | { done: false; ghost: BuildGhost } {
  if (s.money < placeCost(s, type)) return { done: true, reason: '돈이 모자라 배치를 마쳤어요' };
  const d = objectDef(type);
  const candidates = [{ x: ghost.x + d.w, y: ghost.y }, { x: ghost.x, y: ghost.y + d.h }, { x: ghost.x - d.w, y: ghost.y }, { x: ghost.x, y: ghost.y - d.h }];
  for (const c of candidates) {
    if (c.x < 0 || c.y < 0 || c.x >= s.grid.w || c.y >= s.grid.h) continue;
    if (canPlace(s, type, c.x, c.y).ok) return { done: false, ghost: { ...ghost, ...c } };
  }
  return { done: false, ghost };
}
