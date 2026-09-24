/** 예약 작업 (seatfix): 손님이 앉아 있거나 지나가는 시설도 이동·철거·증축을 눌러 둘 수 있다.
 *  눌러 두면 PlacedObject.pending에 예약이 남고, 그 시설에서 손님이 다 떠난 즉시(tick.ts runPending) 자동으로 실행된다.
 *  급하면 「지금 바로」(vacate) — 앉은 손님은 다른 빈 자리로 옮기고, 빈 자리가 없으면 만족 −5로 돌아간다.
 *  actions.ts의 canDisturb는 "지금 당장 되나"만 판정하고, 막혔을 때 예약할지 지금 할지는 UI가 고른다. */
import type { GameState, PlacedObject, PendingWork, Guest } from './types.ts';
import { objectDef } from '../data/index.ts';
import { footprintOf, canPlace, removeObject, relocateObject } from './grid.ts';
import { dayIndex } from './effects.ts';
import { bumpLayoutRev } from './layoutRev.ts';
import { discoverPlacement } from './compat.ts';
import { rememberRemove, rememberMove } from './undo.ts';
import { canUpgrade, upgrade } from './upgrade.ts';
import { canTreeUpgrade, treeUpgrade } from './tree.ts'; // fun 업그레이드 트리 (같은 자리 다음 단계)
import { objectStats } from './compat.ts';
import { pushNotice } from './staff.ts';
import { addSatisfaction } from './segments.ts';
import { freeSeats, seatSlotPos, firstFreeSlot } from './guests.ts';
import { busStopPos, findPath, walkableNeighborsOf } from './path.ts';
import { seatsOf } from './cafe.ts';
import { josa } from './josa.ts';

/** 「지금 바로」에서 앉을 자리를 못 찾은 손님이 돌아갈 때 깎이는 만족 */
export const VACATE_SATISFACTION = 5;

export const WORK_NAME: Record<PendingWork['kind'], string> = { move: '옮기기', remove: '철거', upgrade: '증축', treeUpgrade: '업그레이드' };

/** 이 시설에 매여 있는 손님들 — 그 자리에 앉았거나 자리로 오는 중인 손님 */
export function seatedGuests(state: GameState, obj: PlacedObject): Guest[] {
  return state.guests.filter((g) => g.seatId === obj.id);
}

/** 지금 손님 때문에 못 건드리나 (보호 시설 여부는 보지 않는다). 막혔으면 그 이유, 아니면 null.
 *  canDisturb(actions.ts)·예약 실행·「지금 바로」가 모두 이 판정을 쓴다. */
export function guestBlock(state: GameState, obj: PlacedObject): string | null {
  if (state.guests.some((g) => g.seatId === obj.id)) return '손님이 앉아 있어요';
  const cells = new Set(footprintOf(obj).map((p) => `${p.x},${p.y}`));
  for (const g of state.guests) {
    if (cells.has(`${Math.round(g.x)},${Math.round(g.y)}`)) return '손님이 지나가는 중이에요';
    if (g.approachCell && cells.has(`${g.approachCell.x},${g.approachCell.y}`)) return '손님이 지나가는 중이에요';
    if (g.path.some((p) => cells.has(`${p.x},${p.y}`))) return '손님이 지나가는 중이에요';
  }
  return null;
}

/** 예약을 건다 (같은 시설의 이전 예약은 덮어쓴다) */
export function setPending(state: GameState, obj: PlacedObject, work: Omit<PendingWork, 'at'>): void {
  obj.pending = { ...work, at: dayIndex(state.clock) };
}

export function clearPending(obj: PlacedObject): void {
  delete obj.pending;
}

/** 예약 한 건을 지금 실행한다 (손님이 없을 때만 부른다). 조건이 어긋나 못 하면 예약을 지우고 이유를 알린다. */
function execPending(state: GameState, obj: PlacedObject): void {
  const work = obj.pending!;
  const def = objectDef(obj.type);
  clearPending(obj);
  const give = (reason: string) => pushNotice(state, `${josa(obj.name ?? def.name, '은/는')} ${reason} 예약을 못 했어요`);
  if (work.kind === 'remove') {
    if (def.removeCost) {
      if (state.money < def.removeCost) return give('돈이 모자라');
      state.money -= def.removeCost;
    } else state.money += def.cost;
    rememberRemove(state, [obj], def.removeCost ? -def.removeCost : def.cost);
    removeObject(state, obj.id);
    pushNotice(state, `${josa(obj.name ?? def.name, '을/를')} 예약대로 치웠어요`);
  } else if (work.kind === 'move') {
    const to = work.to;
    if (!to) return;
    const p = canPlace(state, obj.type, to.x, to.y, obj.id);
    if (!p.ok) return give(`${p.reason ?? '자리가 막혀'}`);
    rememberMove(state, obj, obj.x, obj.y);
    relocateObject(state, obj, to.x, to.y);
    pushNotice(state, `${josa(obj.name ?? def.name, '을/를')} 예약대로 옮겼어요`);
  } else if (work.kind === 'upgrade') {
    const c = canUpgrade(state, obj.id, objectStats(state, obj.id).popularity); // 돈·이용 횟수·★ 조건을 다시 본다
    if (!c.ok) return give(`${c.reason ?? '조건이 안 맞아'}`);
    upgrade(state, obj.id);
    pushNotice(state, `${josa(obj.name ?? def.name, '을/를')} 예약대로 증축했어요`);
  } else {
    const c = canTreeUpgrade(state, obj.id); // 돈·조건을 다시 본다
    if (!c.ok) return give(`${c.reason ?? '조건이 안 맞아'}`);
    treeUpgrade(state, obj.id);
    pushNotice(state, `${josa(obj.name ?? def.name, '을/를')} 예약대로 올렸어요`);
  }
  discoverPlacement(state);
  bumpLayoutRev(state);
}

/** 매 스텝(tick.ts): 손님이 다 떠난 예약을 순서대로 실행한다. 결정적 — state.objects 삽입 순서를 그대로 돈다. */
export function runPending(state: GameState): void {
  for (const obj of Object.values(state.objects)) {
    if (!obj.pending) continue;
    if (guestBlock(state, obj)) continue;
    execPending(state, obj);
  }
}

/** 「지금 바로」: 이 시설에 매인 손님을 다른 빈 자리로 옮긴다. 자리가 없으면 만족 −5로 돌려보낸다.
 *  지나가던 손님은 그냥 지나가게 둔다 (길은 몇 걸음이면 풀린다). 앉아 있던 손님만 정리한다. */
export function vacate(state: GameState, obj: PlacedObject): { moved: number; left: number } {
  let moved = 0;
  let left = 0;
  const bus = busStopPos(state);
  for (const g of seatedGuests(state, obj)) {
    const from = g.approachCell ?? { x: Math.round(g.x), y: Math.round(g.y) };
    const seat = freeSeats(state).find((o) => o.id !== obj.id);
    const door = seat ? walkableNeighborsOf(state, seat.x, seat.y)[0] ?? null : null;
    if (seat && door) {
      g.seatId = seat.id;
      g.seatSlot = firstFreeSlot(state, seat);
      if (g.phase === 'walking') {
        // 걸어오던 손님은 새 자리 쪽으로 다시 걷는다
        const path = findPath(state, from, door);
        g.path = path ? path.slice(1) : [];
      } else {
        // 앉아 있던 손님은 새 자리에 그대로 옮겨 앉는다 (나갈 때 쓸 옆 칸도 새 자리 것으로)
        const pos = seatSlotPos(seat, g.seatSlot, seatsOf(state, seat));
        g.x = pos.x;
        g.y = pos.y;
        g.approachCell = door;
        g.path = [];
      }
      moved++;
    } else {
      g.seatId = null;
      g.phase = 'leaving';
      g.approachCell = null;
      g.x = from.x; // 자리에서 옆 칸으로 먼저 일어난다 — 좌석 칸 위에 서 있으면 그 칸이 계속 막힌 걸로 보인다
      g.y = from.y;
      const back = findPath(state, from, bus);
      g.path = back ? back.slice(1) : [];
      addSatisfaction(state, g.type, -VACATE_SATISFACTION);
      left++;
    }
  }
  return { moved, left };
}

/** 「지금 바로」 눌렀을 때 손님이 갈 데가 있나 — 카드 경고 문구용 (빈 자리가 모자라면 그만큼 돌아간다) */
export function vacateWarning(state: GameState, obj: PlacedObject): string | null {
  const n = seatedGuests(state, obj).length;
  if (n === 0) return null;
  const free = freeSeats(state).filter((o) => o.id !== obj.id).length;
  return free >= n ? null : `빈 자리가 없어 손님이 돌아가요 (만족 −${VACATE_SATISFACTION})`;
}

/** 「지금 바로」 실행: 손님을 정리하고 예약을 바로 처리한다. 예약이 없으면 아무것도 안 한다. */
export function doNow(state: GameState, obj: PlacedObject): { moved: number; left: number } {
  const r = vacate(state, obj);
  if (obj.pending && !guestBlock(state, obj)) execPending(state, obj);
  return r;
}
