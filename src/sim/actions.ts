import type { GameState, Action, ApplyResult, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { canPlace, placeObject, removeObject, footprint, relocateObject, objectsInRoom, canClearRock, clearRock } from './grid.ts';
import { canBuyParcel, buyParcel } from './parcels.ts';
import { canSetSlot, setSlot } from './menu.ts';
import { checkFeature, checkGoals } from './goals.ts';
import { canPostJob, postJob, canHire, hire, canFire, fire, canAssign, assign, canLevelUp, levelUp } from './staff.ts';
import { canPromote, promote, canSetTarget, setTarget } from './promotions.ts';
import { discoverCombos } from './compat.ts';
import { canUseItem, useItem } from './items.ts';
import { evaluateUnlocks } from './segments.ts';
import { canAcceptQuest, acceptQuest, canRespondEvent, respondEvent, afterInvest, checkQuests } from './board.ts';
import { canInvestSpot, investSpot } from './spots.ts';
import { canRenameCafe, renameCafe, canExpand, expand, canSetCosmetic, setCosmetic, canPraise, praise, placeCost, type ExpansionId } from './cafe.ts';
import { canDevelop, develop, canAddTopping, addTopping, canRemoveTopping, removeTopping, canLevelUpMenu, levelUpMenu } from './craft.ts';
import { canStartBuild, startBuild } from './build.ts';
import { canBuyMileage, buyMileage, canBuyTicket, buyTicket, canDrawTicket, drawTicket, canSetUniform, setUniform, canUseGuestItem, useGuestItem } from './shop.ts';
import { canOpenPopup, openPopup, canClosePopup, closePopup } from './popup.ts';
import { canChallenge, challenge } from './rivals.ts';

export const PROTECTED_TYPES = new Set(['busstop', 'warehouse', 'gate', 'spring']);
/** 회전할 수 있는 오브젝트 (rot 0..3, 스프라이트 변형 _r{n}이 있을 때만 보인다) */
export const ROTATABLE_TYPES = new Set(['gate', 'bench', 'counter']);
const ACTION_LOG_CAP = 1000;

const CLIENT_ONLY = new Set<Action['type']>(['setSpeed', 'dismissMonthCard', 'dismissDevelop', 'dismissDraw', 'dismissAnnouncement', 'dismissChallenge', 'dismissAlert']);

function log(state: GameState, a: Action) {
  if (CLIENT_ONLY.has(a.type)) return;
  state.actionLog.push({ tick: state.tick, action: a });
  if (state.actionLog.length > ACTION_LOG_CAP) state.actionLog.shift();
}

/** 액션 하나를 적용한다. 기능 잠금(goals.ts 표)에 걸리면 ok:false. 성공하면 로그에 남기고 목표를 바로 판정한다. */
export function apply(state: GameState, a: Action): ApplyResult {
  const f = checkFeature(state, a.type);
  if (!f.ok) return f;
  const r = applyInner(state, a);
  if (r.ok) {
    log(state, a);
    if (!CLIENT_ONLY.has(a.type)) checkGoals(state);
  }
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
      const cost = placeCost(state, a.objectType);
      if (state.money < cost) return { ok: false, reason: '돈이 모자라요' };
      const c = canPlace(state, a.objectType, a.x, a.y);
      if (!c.ok) return c;
      const b = canStartBuild(state, a.objectType);
      if (!b.ok) return b;
      const obj = placeObject(state, a.objectType, a.x, a.y, ROTATABLE_TYPES.has(a.objectType) && a.rot !== undefined ? ((a.rot % 4) + 4) % 4 : undefined);
      startBuild(state, obj);
      state.money -= cost;
      discoverCombos(state);
      evaluateUnlocks(state); // count 해금 (감귤나무 3그루 → 까치)
      checkQuests(state);     // objectPlaced 부탁
      return { ok: true };
    }
    case 'remove': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      const c = canDisturb(state, obj);
      if (!c.ok) return c;
      const def = objectDef(obj.type);
      if (def.room && objectsInRoom(state, obj.id).length > 0) return { ok: false, reason: '안에 가구가 있어요' };
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
      if (objectDef(obj.type).room && objectsInRoom(state, obj.id).length > 0) return { ok: false, reason: '안에 가구가 있어요' };
      const p = canPlace(state, obj.type, a.x, a.y, obj.id);
      if (!p.ok) return p;
      // 돈은 그대로: 치우기 환불 + 다시 짓기 비용이 상쇄된다. 방향·놓은 달은 유지.
      relocateObject(state, obj, a.x, a.y);
      discoverCombos(state);
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
    case 'clearRock': {
      const c = canClearRock(state, a.x, a.y);
      if (!c.ok) return c;
      clearRock(state, a.x, a.y);
      state.stats.rocksCleared++;
      return { ok: true };
    }
    case 'renameCafe': {
      const c = canRenameCafe(state, a.name);
      if (!c.ok) return c;
      renameCafe(state, a.name);
      return { ok: true };
    }
    case 'expand': {
      const c = canExpand(state, a.id);
      if (!c.ok) return c;
      expand(state, a.id as ExpansionId);
      return { ok: true };
    }
    case 'setCosmetic': {
      const c = canSetCosmetic(state, a);
      if (!c.ok) return c;
      setCosmetic(state, a);
      return { ok: true };
    }
    case 'praise': {
      const c = canPraise(state, a.staffId);
      if (!c.ok) return c;
      praise(state, a.staffId);
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
    case 'dismissAlert':
      state.alerts.shift();
      return { ok: true };
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
      state.stats.promotionsDone++;
      return { ok: true };
    }
    case 'setTarget': {
      const c = canSetTarget(state, a.segment);
      if (!c.ok) return c;
      setTarget(state, a.segment);
      return { ok: true };
    }
    case 'useItem': {
      const c = canUseItem(state, a.itemId, a.objectType);
      if (!c.ok) return c;
      useItem(state, a.itemId, a.objectType);
      return { ok: true };
    }
    case 'acceptQuest': {
      const c = canAcceptQuest(state, a.id);
      if (!c.ok) return c;
      acceptQuest(state, a.id);
      return { ok: true };
    }
    case 'respondEvent': {
      const c = canRespondEvent(state, a.id);
      if (!c.ok) return c;
      respondEvent(state, a.id, a.accept);
      return { ok: true };
    }
    case 'investSpot': {
      const c = canInvestSpot(state, a.id);
      if (!c.ok) return c;
      const level = investSpot(state, a.id);
      afterInvest(state, a.id, level);
      return { ok: true };
    }
    case 'develop': {
      const c = canDevelop(state, a.base, a.ingredients, a.staffId);
      if (!c.ok) return c;
      develop(state, a.base, a.ingredients, a.params, a.staffId);
      return { ok: true };
    }
    case 'dismissDevelop':
      state.lastDevelop = null;
      return { ok: true };
    case 'addTopping': {
      const c = canAddTopping(state, a.menuId, a.toppingId);
      if (!c.ok) return c;
      addTopping(state, a.menuId, a.toppingId);
      return { ok: true };
    }
    case 'removeTopping': {
      const c = canRemoveTopping(state, a.menuId, a.toppingId);
      if (!c.ok) return c;
      removeTopping(state, a.menuId, a.toppingId);
      return { ok: true };
    }
    case 'levelUpMenu': {
      const c = canLevelUpMenu(state, a.menuId);
      if (!c.ok) return c;
      levelUpMenu(state, a.menuId);
      return { ok: true };
    }
    case 'buyMileage': {
      const c = canBuyMileage(state, a.id);
      if (!c.ok) return c;
      buyMileage(state, a.id);
      return { ok: true };
    }
    case 'buyTicket': {
      const c = canBuyTicket(state, a.id);
      if (!c.ok) return c;
      buyTicket(state, a.id);
      return { ok: true };
    }
    case 'drawTicket': {
      const c = canDrawTicket(state);
      if (!c.ok) return c;
      drawTicket(state);
      return { ok: true };
    }
    case 'dismissDraw':
      state.lastDraw = null;
      return { ok: true };
    case 'setUniform': {
      const c = canSetUniform(state, a.id);
      if (!c.ok) return c;
      setUniform(state, a.id);
      return { ok: true };
    }
    case 'useGuestItem': {
      const c = canUseGuestItem(state, a.itemId, a.guestId);
      if (!c.ok) return c;
      useGuestItem(state, a.itemId, a.guestId);
      return { ok: true };
    }
    case 'dismissAnnouncement':
      state.lastAnnouncement = null;
      return { ok: true };
    case 'openPopup': {
      const c = canOpenPopup(state, a.regionId);
      if (!c.ok) return c;
      openPopup(state, a.regionId);
      return { ok: true };
    }
    case 'closePopup': {
      const c = canClosePopup(state);
      if (!c.ok) return c;
      closePopup(state);
      return { ok: true };
    }
    case 'challenge': {
      const c = canChallenge(state, a.rivalId, a.menuId);
      if (!c.ok) return c;
      challenge(state, a.rivalId, a.menuId);
      return { ok: true };
    }
    case 'dismissChallenge':
      state.lastChallenge = null;
      return { ok: true };
    default:
      return { ok: false, reason: '아직 구현 안 됨' };
  }
}
