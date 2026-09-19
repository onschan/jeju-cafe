import type { GameState, Action, ApplyResult, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { canPlace, placeObject, removeObject, footprint, relocateObject, objectsInRoom, canClearRock, clearRock } from './grid.ts';
import { canBuyParcel, buyParcel } from './parcels.ts';
import { canSetSlot, setSlot } from './menu.ts';
import { checkFeature, checkGoals } from './goals.ts';
import { canAcceptChallenge, acceptChallenge } from './challenges.ts';
import { fillStarterLayout } from './state.ts';
import { TUTORIAL_STEPS, unlockTutorialFeatures } from './tutorial.ts';
import { canPostJob, postJob, canHire, hire, canFire, fire, canAssign, assign, canLevelUp, levelUp } from './staff.ts';
import { canTrain, train } from './training.ts';
import { canPromote, promote, canSetTarget, setTarget } from './promotions.ts';
import { discoverCombos } from './compat.ts';
import { canUseItem, useItem, canGiveGift, giveGift, canCraftGift, craftGift } from './items.ts';
import { evaluateUnlocks } from './segments.ts';
import { canAcceptQuest, acceptQuest, canRespondEvent, respondEvent, afterInvest, checkQuests } from './board.ts';
import { canInvestSpot, investSpot, canHostTour, hostTour, canSetTourBus, setTourBus } from './spots.ts';
import { canRenameCafe, renameCafe, canExpand, expand, canSetCosmetic, setCosmetic, canPraise, praise, placeCost, type ExpansionId } from './cafe.ts';
import { canDevelop, develop, canAddTopping, addTopping, canRemoveTopping, removeTopping, canLevelUpMenu, levelUpMenu } from './craft.ts';
import { canStartBuild, startBuild } from './build.ts';
import { canBuyMileage, buyMileage, canBuyTicket, buyTicket, canDrawTicket, drawTicket, canSetUniform, setUniform, canUseGuestItem, useGuestItem } from './shop.ts';
import { canOpenPopup, openPopup, canClosePopup, closePopup } from './popup.ts';
import { canChallenge, challenge } from './rivals.ts';
import { canUpgrade, upgrade } from './upgrade.ts';
import { canRepair, repair } from './cleanliness.ts';
import { canSetRouteContract, setRouteContract, canExpandParking, parkingExpandCost, PARKING_EXPAND_TO } from './entry.ts';
import { objectStats } from './compat.ts';
import { rememberPlace, rememberRemove, rememberMove, canUndo, undoLast } from './undo.ts';
import { canSetTargets, setTargets } from './segments.ts';

export const PROTECTED_TYPES = new Set(['busstop', 'warehouse', 'gate', 'spring']);
/** 회전할 수 있는 오브젝트 (rot 0..3, 스프라이트 변형 _r{n}이 있을 때만 보인다) */
export const ROTATABLE_TYPES = new Set(['gate', 'bench', 'counter']);
const ACTION_LOG_CAP = 1000;

const CLIENT_ONLY = new Set<Action['type']>(['setSpeed', 'dismissMonthCard', 'dismissDevelop', 'dismissDraw', 'dismissAnnouncement', 'dismissChallenge', 'dismissAlert', 'dismissTour']);

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

/** 일괄 철거 시 돈 변화(+환불 −철거비 합) */
export function demolishRefund(objs: PlacedObject[]): number {
  let d = 0;
  for (const o of objs) { const def = objectDef(o.type); d += def.removeCost ? -def.removeCost : def.cost; }
  return d;
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
      rememberPlace(state, obj, cost);
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
      rememberRemove(state, [obj], def.removeCost ? -def.removeCost : def.cost);
      removeObject(state, a.objectId);
      return { ok: true };
    }
    case 'demolishMany': {
      // 드래그 사각형 일괄 철거: 보호·덤불·방 안 가구 있는 방은 건너뛰고, 하나라도 못 치우면 그 이유로 거부
      const objs: PlacedObject[] = [];
      for (const id of a.objectIds) {
        const obj = state.objects[id];
        if (!obj || PROTECTED_TYPES.has(obj.type) || obj.type === 'bush_wild') continue;
        if (objs.some((o) => o.id === obj.id)) continue;
        const c = canDisturb(state, obj);
        if (!c.ok) return c;
        if (objectDef(obj.type).room && objectsInRoom(state, obj.id).some((r) => !a.objectIds.includes(r.id))) return { ok: false, reason: '안에 가구가 있어요' };
        objs.push(obj);
      }
      if (objs.length === 0) return { ok: false, reason: '치울 게 없어요' };
      const delta = demolishRefund(objs);
      if (state.money + delta < 0) return { ok: false, reason: '돈이 모자라요' };
      state.money += delta;
      rememberRemove(state, objs, delta);
      for (const o of objs) removeObject(state, o.id);
      discoverCombos(state);
      return { ok: true };
    }
    case 'undoLast': {
      const c = canUndo(state);
      if (!c.ok) return c;
      undoLast(state);
      return { ok: true };
    }
    case 'renameObject': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      const name = a.name.trim().slice(0, 12);
      if (name) obj.name = name; else delete obj.name;
      return { ok: true };
    }
    case 'setTargets': {
      const c = canSetTargets(state, a.targets);
      if (!c.ok) return c;
      setTargets(state, a.targets);
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
      rememberMove(state, obj, obj.x, obj.y);
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
    case 'upgradeObject': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      const c = canUpgrade(state, a.objectId, objectStats(state, a.objectId).popularity);
      if (!c.ok) return c;
      const d = canDisturb(state, obj);
      if (!d.ok) return d;
      upgrade(state, a.objectId);
      discoverCombos(state);
      return { ok: true };
    }
    case 'repairObject': {
      const c = canRepair(state, a.objectId);
      if (!c.ok) return c;
      repair(state, a.objectId);
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
    case 'acceptChallenge': {
      const c = canAcceptChallenge(state, a.id);
      if (!c.ok) return c;
      acceptChallenge(state, a.id);
      return { ok: true };
    }
    case 'skipTutorial': {
      // §7.2 건너뛰기(첫 단계에서만): 빈 마당을 완성 시작 상태로 채우고 튜토리얼을 끝낸다
      if (state.tutorial.step > 0) return { ok: false, reason: '이미 튜토리얼을 시작했어요' };
      fillStarterLayout(state);
      unlockTutorialFeatures(state); // 튜토리얼 보상으로만 열리는 입지 보기·콤보 도감·명소 지도
      state.tutorial = { step: TUTORIAL_STEPS, skipped: true };
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
      const c = canLevelUp(state, a.staffId);
      if (!c.ok) return c;
      levelUp(state, a.staffId);
      return { ok: true };
    }
    case 'train': {
      const c = canTrain(state, a.staffId, a.trainingId);
      if (!c.ok) return c;
      train(state, a.staffId, a.trainingId);
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
    case 'hostTour': {
      const c = canHostTour(state, a.spotId);
      if (!c.ok) return c;
      hostTour(state, a.spotId);
      return { ok: true };
    }
    case 'dismissTour':
      state.lastTour = null;
      return { ok: true };
    case 'setTourBus': {
      const c = canSetTourBus(state, a.on);
      if (!c.ok) return c;
      setTourBus(state, a.on);
      return { ok: true };
    }
    case 'setRouteContract': { // 트랙 H: 공항 셔틀 계약/해지
      const c = canSetRouteContract(state, a.route, a.on);
      if (!c.ok) return c;
      setRouteContract(state, a.route, a.on);
      return { ok: true };
    }
    case 'expandParking': { // 트랙 H: 주차장 2×2 → 3×2 교체 (차액)
      const c = canExpandParking(state, a.objectId);
      if (!c.ok) return c;
      const o = state.objects[a.objectId]!;
      const { x, y } = o;
      removeObject(state, o.id);
      const big = placeObject(state, PARKING_EXPAND_TO, x, y);
      startBuild(state, big);
      state.money -= parkingExpandCost();
      return { ok: true };
    }
    case 'giveGift': {
      const c = canGiveGift(state, a.guestId, a.itemId);
      if (!c.ok) return c;
      giveGift(state, a.guestId, a.itemId);
      return { ok: true };
    }
    case 'craftGift': {
      const c = canCraftGift(state, a.itemId);
      if (!c.ok) return c;
      craftGift(state, a.itemId);
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
