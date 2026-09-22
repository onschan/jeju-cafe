/** 되돌리기 1회 (UX 참고 §5.3): 직전 배치·철거·이동을 같은 게임 날 안에서만 역연산으로 되돌린다.
 *  액션 로그 재생이 아니라 역연산 — 배치 → 철거(환불 100%), 철거 → 같은 자리에 재배치(환불 회수), 이동 → 원위치.
 *  스냅샷은 state.undo 하나뿐(직전 1회). 날이 바뀌면 canUndo가 거부한다. */
import type { GameState, PlacedObject, ApplyResult, UndoEntry } from './types.ts';
import { dayIndex } from './effects.ts';
import { canPlace, occupy, removeObject, relocateObject } from './grid.ts';
import { discoverPlacement } from './compat.ts';

/** 배치 직후: 되돌리면 철거하고 낸 돈을 그대로 돌려준다 */
export function rememberPlace(state: GameState, obj: PlacedObject, paid: number): void {
  state.undo = { kind: 'place', day: dayIndex(state.clock), objectId: obj.id, paid };
}

/** 라인 배치 직후(ease 두 번 탭): 되돌리면 그 줄 전체를 철거하고 낸 돈을 돌려준다 */
export function rememberPlaceMany(state: GameState, objects: PlacedObject[], paid: number): void {
  state.undo = { kind: 'placeMany', day: dayIndex(state.clock), objectIds: objects.map((o) => o.id), paid };
}

/** 철거 직후(여러 개 가능): 되돌리면 같은 자리에 같은 개체를 다시 놓고 환불·비용을 되돌린다 */
export function rememberRemove(state: GameState, objects: PlacedObject[], moneyDelta: number): void {
  state.undo = { kind: 'remove', day: dayIndex(state.clock), objects: objects.map((o) => ({ ...o })), moneyDelta };
}

/** 이동 직후: 되돌리면 원래 칸으로 */
export function rememberMove(state: GameState, obj: PlacedObject, fromX: number, fromY: number): void {
  state.undo = { kind: 'move', day: dayIndex(state.clock), objectId: obj.id, fromX, fromY };
}

export function canUndo(state: GameState): ApplyResult {
  const u = state.undo;
  if (!u) return { ok: false, reason: '되돌릴 게 없어요' };
  if (u.day !== dayIndex(state.clock)) return { ok: false, reason: '날이 바뀌어 못 되돌려요' };
  switch (u.kind) {
    case 'place': {
      const o = state.objects[u.objectId];
      if (!o) return { ok: false, reason: '이미 없어진 시설이에요' };
      if (state.guests.some((g) => g.seatId === o.id)) return { ok: false, reason: '손님이 앉아 있어요' };
      return { ok: true };
    }
    case 'placeMany': {
      const objs = u.objectIds.map((id) => state.objects[id]);
      if (objs.some((o) => !o)) return { ok: false, reason: '이미 없어진 시설이에요' };
      if (objs.some((o) => state.guests.some((g) => g.seatId === o!.id))) return { ok: false, reason: '손님이 앉아 있어요' };
      return { ok: true };
    }
    case 'remove': {
      if (state.money < u.moneyDelta) return { ok: false, reason: '돈이 모자라요' };
      for (const o of u.objects) if (!canPlace(state, o.type, o.x, o.y).ok) return { ok: false, reason: '자리에 다른 게 있어요' };
      return { ok: true };
    }
    case 'move': {
      const o = state.objects[u.objectId];
      if (!o) return { ok: false, reason: '이미 없어진 시설이에요' };
      if (state.guests.some((g) => g.seatId === o.id)) return { ok: false, reason: '손님이 앉아 있어요' };
      return canPlace(state, o.type, u.fromX, u.fromY, o.id);
    }
  }
}

/** 호출 전 canUndo. 되돌린 뒤 스냅샷은 비운다(되돌리기의 되돌리기는 없다). */
export function undoLast(state: GameState): UndoEntry['kind'] {
  const u = state.undo!;
  switch (u.kind) {
    case 'place':
      removeObject(state, u.objectId);
      state.money += u.paid;
      break;
    case 'placeMany':
      for (const id of u.objectIds) removeObject(state, id);
      state.money += u.paid;
      break;
    case 'remove':
      for (const o of u.objects) { const copy = { ...o }; state.objects[copy.id] = copy; occupy(state, copy); }
      state.money -= u.moneyDelta;
      break;
    case 'move': {
      relocateObject(state, state.objects[u.objectId]!, u.fromX, u.fromY);
      break;
    }
  }
  state.undo = null;
  discoverPlacement(state);
  return u.kind;
}
