import type { GameState, Action, ApplyResult } from './types.ts';
import { objectDef } from '../data/index.ts';
import { canPlace, placeObject, removeObject, footprint } from './grid.ts';
import { canPlant, plant, canHarvest, harvest } from './farm.ts';
import { canSetSlot, setSlot } from './menu.ts';
import { canUnlock, unlock } from './progress.ts';
import { canPostJob, postJob, canHire, hire, canFire, fire, canAssign, assign, canLevelUp, levelUp } from './staff.ts';
import { canPromote, promote, canSetTarget, setTarget } from './promotions.ts';

export const PROTECTED_TYPES = new Set(['busstop', 'warehouse', 'gate']);
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

function applyInner(state: GameState, a: Action): ApplyResult {
  switch (a.type) {
    case 'place': {
      if (!state.unlocked.objects.includes(a.objectType)) return { ok: false, reason: '아직 못 짓는 것' };
      const def = objectDef(a.objectType);
      if (state.money < def.cost) return { ok: false, reason: '돈이 모자라요' };
      const c = canPlace(state, a.objectType, a.x, a.y);
      if (!c.ok) return c;
      placeObject(state, a.objectType, a.x, a.y);
      state.money -= def.cost;
      return { ok: true };
    }
    case 'remove': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      if (PROTECTED_TYPES.has(obj.type)) return { ok: false, reason: '이건 못 없애요' };
      if (state.guests.some((g) => g.seatId === obj.id)) return { ok: false, reason: '손님이 앉아 있어요' };
      const cells = new Set(footprint(obj.type, obj.x, obj.y).map((p) => `${p.x},${p.y}`));
      const guestCells = state.guests.flatMap((g) => [`${Math.round(g.x)},${Math.round(g.y)}`, ...g.path.map((p) => `${p.x},${p.y}`)]);
      if (guestCells.some((c) => cells.has(c))) return { ok: false, reason: '손님이 지나가는 중이에요' };
      state.money += objectDef(obj.type).cost;
      removeObject(state, a.objectId);
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
