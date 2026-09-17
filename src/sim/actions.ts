import type { GameState, Action, ApplyResult, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { canPlace, placeObject, removeObject, footprint } from './grid.ts';
import { canBuyParcel, buyParcel } from './parcels.ts';
import { canPlant, plant, canHarvest, harvest } from './farm.ts';
import { canSetSlot, setSlot } from './menu.ts';
import { canUnlock, unlock } from './progress.ts';
import { canPostJob, postJob, canHire, hire, canFire, fire, canAssign, assign, canLevelUp, levelUp } from './staff.ts';
import { canPromote, promote, canSetTarget, setTarget } from './promotions.ts';

export const PROTECTED_TYPES = new Set(['busstop', 'warehouse', 'gate', 'spring']);
/** 회전할 수 있는 오브젝트 (rot 0..3, 스프라이트 변형 _r{n}이 있을 때만 보인다) */
export const ROTATABLE_TYPES = new Set(['gate', 'bench', 'counter']);
const ACTION_LOG_CAP = 1000;

const CLIENT_ONLY = new Set<Action['type']>(['setSpeed', 'dismissMonthCard']);

function log(state: GameState, a: Action) {
  if (CLIENT_ONLY.has(a.type)) return;
  state.actionLog.push({ tick: state.tick, action: a });
  if (state.actionLog.length > ACTION_LOG_CAP) state.actionLog.shift();
}

export function apply(state: GameState, a: Action): ApplyResult {
  const r = applyInner(state, a);
  if (r.ok) log(state, a);
  return r;
}

/** 치우거나 옮길 수 있나: 보호 오브젝트·앉은 손님·지나가는 손님 */
function canDisturb(state: GameState, obj: PlacedObject): ApplyResult {
  if (PROTECTED_TYPES.has(obj.type)) return { ok: false, reason: '이건 못 없애요' };
  if (state.guests.some((g) => g.seatId === obj.id)) return { ok: false, reason: '손님이 앉아 있어요' };
  const cells = new Set(footprint(obj.type, obj.x, obj.y).map((p) => `${p.x},${p.y}`));
  const guestCells = state.guests.flatMap((g) => [`${Math.round(g.x)},${Math.round(g.y)}`, ...(g.approachCell ? [`${g.approachCell.x},${g.approachCell.y}`] : []), ...g.path.map((p) => `${p.x},${p.y}`)]);
  if (guestCells.some((c) => cells.has(c))) return { ok: false, reason: '손님이 지나가는 중이에요' };
  return { ok: true };
}

function applyInner(state: GameState, a: Action): ApplyResult {
  switch (a.type) {
    case 'place': {
      if (!state.unlocked.objects.includes(a.objectType)) return { ok: false, reason: '아직 못 짓는 것' };
      const def = objectDef(a.objectType);
      if (state.money < def.cost) return { ok: false, reason: '돈이 모자라요' };
      const c = canPlace(state, a.objectType, a.x, a.y);
      if (!c.ok) return c;
      placeObject(state, a.objectType, a.x, a.y, ROTATABLE_TYPES.has(a.objectType) && a.rot !== undefined ? ((a.rot % 4) + 4) % 4 : undefined);
      state.money -= def.cost;
      return { ok: true };
    }
    case 'remove': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      const c = canDisturb(state, obj);
      if (!c.ok) return c;
      const def = objectDef(obj.type);
      if (def.removeCost) {
        if (state.money < def.removeCost) return { ok: false, reason: '돈이 모자라요' };
        state.money -= def.removeCost;
      } else {
        state.money += def.cost;
      }
      removeObject(state, a.objectId);
      return { ok: true };
    }
    case 'move': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      const c = canDisturb(state, obj);
      if (!c.ok) return c;
      const p = canPlace(state, obj.type, a.x, a.y, obj.id);
      if (!p.ok) return p;
      // 돈은 그대로: 치우기 환불 + 다시 짓기 비용이 상쇄된다. 작물·방향은 유지.
      for (const cell of footprint(obj.type, obj.x, obj.y)) state.grid.cells[cell.y * state.grid.w + cell.x]!.objectId = null;
      obj.x = a.x;
      obj.y = a.y;
      for (const cell of footprint(obj.type, obj.x, obj.y)) state.grid.cells[cell.y * state.grid.w + cell.x]!.objectId = obj.id;
      return { ok: true };
    }
    case 'rotate': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      if (!ROTATABLE_TYPES.has(obj.type)) return { ok: false, reason: '돌릴 수 없는 거예요' };
      obj.rot = ((a.rot % 4) + 4) % 4;
      return { ok: true };
    }
    case 'buyParcel': {
      const c = canBuyParcel(state, a.id);
      if (!c.ok) return c;
      buyParcel(state, a.id);
      return { ok: true };
    }
    case 'plant': {
      const c = canPlant(state, a.objectId, a.cropId);
      if (!c.ok) return c;
      plant(state, a.objectId, a.cropId);
      return { ok: true };
    }
    case 'harvest': {
      const c = canHarvest(state, a.objectId);
      if (!c.ok) return c;
      harvest(state, a.objectId);
      return { ok: true };
    }
    case 'setSlot': {
      const c = canSetSlot(state, a.slot, a.menuId);
      if (!c.ok) return c;
      setSlot(state, a.slot, a.menuId);
      return { ok: true };
    }
    case 'setSpeed':
      state.clock.speed = a.speed;
      return { ok: true };
    case 'unlock': {
      const c = canUnlock(state);
      if (!c.ok) return c;
      unlock(state);
      return { ok: true };
    }
    case 'dismissMonthCard':
      state.lastMonthCard = null;
      return { ok: true };
    case 'postJob': {
      const c = canPostJob(state, a.tier);
      if (!c.ok) return c;
      postJob(state, a.tier);
      return { ok: true };
    }
    case 'hire': {
      const c = canHire(state, a.candidateId, a.role);
      if (!c.ok) return c;
      hire(state, a.candidateId, a.role);
      return { ok: true };
    }
    case 'fire': {
      const c = canFire(state, a.staffId);
      if (!c.ok) return c;
      fire(state, a.staffId);
      return { ok: true };
    }
    case 'assign': {
      const c = canAssign(state, a.staffId, a.role);
      if (!c.ok) return c;
      assign(state, a.staffId, a.role);
      return { ok: true };
    }
    case 'levelUp': {
      const c = canLevelUp(state, a.staffId, a.stat);
      if (!c.ok) return c;
      levelUp(state, a.staffId, a.stat);
      return { ok: true };
    }
    case 'promote': {
      const c = canPromote(state, a.staffId, a.promotionId);
      if (!c.ok) return c;
      promote(state, a.staffId, a.promotionId);
      return { ok: true };
    }
    case 'setTarget': {
      const c = canSetTarget(state, a.segment);
      if (!c.ok) return c;
      setTarget(state, a.segment);
      return { ok: true };
    }
    default:
      return { ok: false, reason: '아직 구현 안 됨' };
  }
}
