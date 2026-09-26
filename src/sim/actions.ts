import type { GameState, Action, ApplyResult, PlacedObject } from './types.ts';
import { bumpLayoutRev } from './layoutRev.ts';
import { objectDef } from '../data/index.ts';
import { canPlace, placeObject, removeObject, relocateObject } from './grid.ts';
import { canBuildMain, placeMain, canAutoConnectPath, autoConnectPath, MAIN_TYPE } from './rooms.ts';
import { canBuyParcel, buyParcel } from './parcels.ts';
import { canSetSlot, setSlot } from './menu.ts';
import { checkFeature, checkGoals } from './goals.ts';
import { fillStarterLayout } from './state.ts';
import { TUTORIAL_STEPS, unlockTutorialFeatures, skipTutorialChapter, skipTutorialStep, noteTutorial, TRACKED_ACTIONS } from './tutorial.ts';
import { canPostJob, postJob, canHire, hire, canFire, fire, canAssign, assign, canLevelUp, levelUp, canSetNight, setNight } from './staff.ts'; // staff2 훅: 저녁 근무
import { canSetPost, setPost, clearPost } from './staffPost.ts'; // staffpost 훅: 마당의 근무 자리
import { canTrain, train } from './training.ts';
import { canPromote, promote, canSetTarget, setTarget } from './promotions.ts';
import { discoverPlacement } from './compat.ts';
import { canUseItem, useItem, canGiveGift, giveGift, canCraftGift, craftGift } from './items.ts';
import { evaluateUnlocks } from './segments.ts';
import { canAcceptQuest, acceptQuest, canRespondEvent, respondEvent, afterInvest, checkQuests } from './board.ts';
import { canInvestSpot, investSpot } from './spots.ts';
import { canRenameCafe, renameCafe, canExpand, expand, canSetCosmetic, setCosmetic, canPraise, praise, placeCost, type ExpansionId } from './cafe.ts';
import { canDevelop, develop, canAddTopping, addTopping, canRemoveTopping, removeTopping, canLevelUpMenu, levelUpMenu } from './craft.ts';
import { canStartBuild, startBuild } from './build.ts';
import { canDrawTicket, drawTicket, canSetUniform, setUniform, canUseGuestItem, useGuestItem } from './shop.ts';
import { canUpgrade, upgrade, isUpgradable } from './upgrade.ts';
import { canRepair, repair } from './cleanliness.ts';
import { canTreeUpgrade, treeUpgrade, nextStep } from './tree.ts'; // fun 업그레이드 트리
import { canExpandParking, parkingExpandCost, PARKING_EXPAND_TO, unlockRouteFacilities, installRouteForParcel, canAutoLinkRoute, autoLinkRoute } from './entry.ts';
import { objectStats } from './compat.ts';
import { rememberPlace, rememberPlaceMany, rememberRemove, rememberMove, canUndo, undoLast, undoTargets } from './undo.ts';
import { planLine, isLineType } from './line.ts';
import { canSetTargets, setTargets } from './segments.ts';
import { canContinueEnding, continueEnding, canSetSpeed } from './ending.ts'; // z-ending
import { resolveRisk } from './risk.ts'; // stakes: 돌발 사고 선택지
import { resolveEventChoice } from './events.ts'; // stakes: 빅 이벤트 선택지
import { canEnterContest, enterContest, canCancelContest, cancelContest, canPlaceTrophy, contestState } from './contest.ts'; // 대회
import { rivalsState, canAnswerRival, answerRival, canAllyRival, allyRival, endAllyRival, canAcquireRival, acquireRival } from './rival.ts'; // 동네 경쟁 카페
import { guestBlock, setPending, clearPending, doNow, vacate, WORK_NAME } from './pending.ts'; // seatfix: 손님이 앉아 있어도 예약해 두는 이동·철거·증축

/** 못 옮기고 못 없애는 것 (정류장·본관·샘). 정낭은 w-free부터 일반 시설 — 옮기고 없애고 더 놓을 수 있다. */
export const PROTECTED_TYPES = new Set(['busstop', 'warehouse', 'spring']);
/** 회전할 수 있는 오브젝트 (rot 0..3, 스프라이트 변형 _r{n}이 있을 때만 보인다) */
export const ROTATABLE_TYPES = new Set(['gate', 'counter']);
const ACTION_LOG_CAP = 1000;

const CLIENT_ONLY = new Set<Action['type']>(['setSpeed', 'dismissMonthCard', 'dismissDevelop', 'dismissDraw', 'dismissAnnouncement', 'dismissAlert', 'dismissOutcome', 'dismissContest', 'dismissRivalBoard', 'continueEnding']);

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
    bumpLayoutRev(state); // 배치 캐시 무효화 (layoutRev.ts)
    if (TRACKED_ACTIONS.has(a.type)) noteTutorial(state, a.type); // 튜토리얼 조건 판정용 (되돌리기·연수·뽑기·선물…)
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

/** 지금 당장 치우거나 옮길 수 있나: 보호 오브젝트·앉은 손님·지나가는 손님.
 *  seatfix: 손님 때문에 막혔을 때 UI는 이걸로 버튼을 끄지 않는다 — 예약(reserveWork)이나 「지금 바로」(doWorkNow)를 고르게 한다. */
export function canDisturb(state: GameState, obj: PlacedObject): ApplyResult {
  if (PROTECTED_TYPES.has(obj.type)) return { ok: false, reason: '이건 못 없애요' };
  const blocked = guestBlock(state, obj);
  return blocked ? { ok: false, reason: blocked } : { ok: true };
}

function applyInner(state: GameState, a: Action): ApplyResult {
  switch (a.type) {
    case 'place': {
      if (a.objectType === MAIN_TYPE) return applyInner(state, { type: 'placeMain', x: a.x, y: a.y }); // 본관은 짓기 창 「건물」 탭 카드 → placeMain (w-start)
      if (!state.unlocked.objects.includes(a.objectType)) return { ok: false, reason: '아직 못 짓는 것' };
      { const t = canPlaceTrophy(state, a.objectType); if (!t.ok) return t; } // 대회 트로피는 받은 개수만큼만
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
      discoverPlacement(state);
      evaluateUnlocks(state); // count 해금 (감귤나무 3그루 → 까치)
      unlockRouteFacilities(state); // 주차장(쉼 시설 6개) 같은 경로 시설은 다음 날 아침이 아니라 바로 열린다
      checkQuests(state);     // objectPlaced 부탁
      return { ok: true };
    }
    case 'placeLine': {
      // ease: 길·담 두 번 탭 — 시작→끝 직선/ㄱ자. 이미 있는 칸은 건너뛰고, 놓은 칸 전체를 되돌리기 1회로 묶는다
      if (!isLineType(a.objectType)) return { ok: false, reason: '길·담만 줄로 놓아요' };
      if (!state.unlocked.objects.includes(a.objectType)) return { ok: false, reason: '아직 못 짓는 것' };
      const plan = planLine(state, a.objectType, a.from, a.to, a.order ?? 'xy');
      if (!plan.ok) return { ok: false, reason: plan.reason ?? '여기엔 못 놓아요' };
      const per = placeCost(state, a.objectType);
      const placed: PlacedObject[] = [];
      for (const p of plan.cells) {
        const obj = placeObject(state, a.objectType, p.x, p.y);
        startBuild(state, obj);
        placed.push(obj);
      }
      state.money -= plan.cost;
      rememberPlaceMany(state, placed, per * placed.length);
      discoverPlacement(state);
      evaluateUnlocks(state);
      unlockRouteFacilities(state);
      checkQuests(state);
      return { ok: true };
    }
    case 'autoLinkRoute': {
      const c = canAutoLinkRoute(state, a.route);
      if (!c.ok) return { ok: false, reason: c.reason };
      const placed = autoLinkRoute(state, a.route);
      rememberPlaceMany(state, placed, c.route!.cost);
      discoverPlacement(state);
      return { ok: true };
    }
    case 'autoConnectPath': {
      // ease 「마을 길까지 자동 잇기」: 본관 문 앞 → 정류장과 이어진 칸까지 최단 올렛길. 되돌리기 1회로 전부
      const c = canAutoConnectPath(state);
      if (!c.ok) return { ok: false, reason: c.reason };
      const placed = autoConnectPath(state);
      rememberPlaceMany(state, placed, c.route!.cost);
      discoverPlacement(state);
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
      rememberRemove(state, [obj], def.removeCost ? -def.removeCost : def.cost);
      removeObject(state, a.objectId);
      return { ok: true };
    }
    case 'demolishMany': {
      // 드래그 사각형 일괄 철거: 보호·방 안 가구 있는 방은 건너뛰고, 손님이 앉은 시설은 예약해 둔다 (seatfix — 하나 때문에 전체가 막히지 않게)
      const objs: PlacedObject[] = [];
      let reserved = 0;
      for (const id of a.objectIds) {
        const obj = state.objects[id];
        if (!obj || PROTECTED_TYPES.has(obj.type)) continue;
        if (objs.some((o) => o.id === obj.id)) continue;
        if (guestBlock(state, obj)) { setPending(state, obj, { kind: 'remove' }); reserved++; continue; }
        objs.push(obj);
      }
      if (objs.length === 0) return reserved > 0 ? { ok: true } : { ok: false, reason: '치울 게 없어요' };
      const delta = demolishRefund(objs);
      if (state.money + delta < 0) return { ok: false, reason: '돈이 모자라요' };
      state.money += delta;
      rememberRemove(state, objs, delta);
      for (const o of objs) removeObject(state, o.id);
      discoverPlacement(state);
      return { ok: true };
    }
    case 'undoLast': {
      const c = canUndo(state);
      if (!c.ok) return c;
      for (const o of undoTargets(state)) vacate(state, o); // seatfix: 앉은 손님은 다른 자리로 비켜 준다 (자리가 없으면 돌아간다)
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
      if (obj.type === MAIN_TYPE) return { ok: false, reason: '본관은 못 옮겨요' }; // 본관은 처음 고른 자리에 고정
      const c = canDisturb(state, obj);
      if (!c.ok) return c;
      const p = canPlace(state, obj.type, a.x, a.y, obj.id);
      if (!p.ok) return p;
      // 돈은 그대로: 치우기 환불 + 다시 짓기 비용이 상쇄된다. 방향·놓은 달은 유지.
      rememberMove(state, obj, obj.x, obj.y);
      relocateObject(state, obj, a.x, a.y);
      discoverPlacement(state);
      return { ok: true };
    }
    case 'rotate': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      if (!ROTATABLE_TYPES.has(obj.type)) return { ok: false, reason: '돌릴 수 없는 거예요' };
      obj.rot = ((a.rot % 4) + 4) % 4;
      return { ok: true };
    }
    case 'treeUpgrade': { // fun: 업그레이드 트리 (같은 원점에서 종류 교체, 차액)
      const c = canTreeUpgrade(state, a.objectId);
      if (!c.ok) return { ok: false, reason: c.reason };
      const d = canDisturb(state, state.objects[a.objectId]!);
      if (!d.ok) return d;
      treeUpgrade(state, a.objectId);
      discoverPlacement(state);
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
      discoverPlacement(state);
      return { ok: true };
    }
    case 'repairObject': {
      const c = canRepair(state, a.objectId);
      if (!c.ok) return c;
      repair(state, a.objectId);
      return { ok: true };
    }
    // ---- seatfix: 손님이 앉아 있어도 눌러 두는 예약 ----
    case 'reserveWork': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      if (PROTECTED_TYPES.has(obj.type) || obj.type === MAIN_TYPE) return { ok: false, reason: '이건 예약 못 해요' }; // 본관은 기존 이사 규칙(월 1회·공사 일수)을 그대로 쓴다
      if (a.work === 'move' && (a.x === undefined || a.y === undefined)) return { ok: false, reason: '옮길 자리를 골라 주세요' };
      if (a.work === 'upgrade' && !isUpgradable(objectDef(obj.type))) return { ok: false, reason: '증축할 수 없는 거예요' };
      if (a.work === 'treeUpgrade' && !nextStep(obj.type)) return { ok: false, reason: '최고 단계예요' };
      setPending(state, obj, a.work === 'move' ? { kind: 'move', to: { x: a.x!, y: a.y! } } : { kind: a.work });
      return { ok: true };
    }
    case 'cancelWork': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      if (!obj.pending) return { ok: false, reason: '예약이 없어요' };
      clearPending(obj);
      return { ok: true };
    }
    case 'doWorkNow': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      if (!obj.pending) return { ok: false, reason: '예약이 없어요' };
      const name = WORK_NAME[obj.pending.kind];
      doNow(state, obj);
      return { ok: true, reason: name };
    }
    case 'buyParcel': {
      const c = canBuyParcel(state, a.id);
      if (!c.ok) return c;
      buyParcel(state, a.id);
      installRouteForParcel(state, a.id); // fun P0: 서·남·북 땅을 사면 경로 시설이 무료로 생기고 열린다
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
    // ---- w-start: 첫 본관 짓기 (맨땅 튜토리얼 2단계) ----
    case 'placeMain': {
      const c = canBuildMain(state, a.x, a.y);
      if (!c.ok) return c;
      placeMain(state, a.x, a.y);
      discoverPlacement(state);
      return { ok: true };
    }
    // ---- 카페 분위기 (rooms.ts) ----
    case 'setBgm':
      state.main.bgm = a.bgm;
      return { ok: true };
    case 'setLighting':
      state.main.lighting = a.lighting;
      return { ok: true };
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
    case 'setSpeed': {
      const c = canSetSpeed(state, a.speed); // z-ending: 4배속은 빠른 모드에서만
      if (!c.ok) return c;
      state.clock.speed = a.speed;
      return { ok: true };
    }
    case 'continueEnding': { // z-ending
      const c = canContinueEnding(state);
      if (!c.ok) return c;
      continueEnding(state);
      return { ok: true };
    }
    case 'dismissAlert':
      state.alerts.shift();
      return { ok: true };
    case 'resolveRisk': // stakes: 돌발 사고 — 고른 것이 바로 결과
      return resolveRisk(state, a.choice) ? { ok: true } : { ok: false, reason: '답할 사고가 없어요' };
    case 'resolveEventChoice': // stakes: 빅 이벤트 선택지
      return resolveEventChoice(state, a.choice) ? { ok: true } : { ok: false, reason: '답할 사건이 없어요' };
    case 'skipTutorial': {
      // §7.2 건너뛰기(첫 단계에서만): 빈 마당을 완성 시작 상태로 채우고 튜토리얼을 끝낸다
      if (state.tutorial.step > 0) return { ok: false, reason: '이미 튜토리얼을 시작했어요' };
      fillStarterLayout(state);
      unlockTutorialFeatures(state); // 튜토리얼 보상으로만 열리는 입지 보기·콤보 도감·명소 지도
      state.tutorial = { step: TUTORIAL_STEPS, skipped: true, seen: state.tutorial.seen ?? [] };
      return { ok: true };
    }
    case 'skipTutorialChapter': {
      // 장 단위 건너뛰기: 남은 단계의 해금 보상만 적용. 맨 처음(1장 0단계)이면 빈 마당을 완성 시작 상태로 채워 바로 영업할 수 있게 한다
      if (state.tutorial.step >= TUTORIAL_STEPS) return { ok: false, reason: '튜토리얼이 끝났어요' };
      if (state.tutorial.step === 0) fillStarterLayout(state);
      skipTutorialChapter(state);
      return { ok: true };
    }
    case 'skipTutorialStep': {
      // ease 「이미 알아요」: 이 단계만 보상 없이 통과. 0단계(둘러보기)는 맨땅 그대로 — 본관은 2단계에서 짓는다
      if (state.tutorial.step >= TUTORIAL_STEPS) return { ok: false, reason: '튜토리얼이 끝났어요' };
      skipTutorialStep(state);
      return { ok: true };
    }
    case 'tutorialNote':
      noteTutorial(state, a.key);
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
    case 'setStaffPost': { const c = canSetPost(state, a.staffId, a.x, a.y); if (c.ok) setPost(state, a.staffId, a.x, a.y); return c; } // staffpost 훅
    case 'clearStaffPost': { clearPost(state, a.staffId); return { ok: true }; } // staffpost 훅
    case 'setStaffNight': { const c = canSetNight(state, a.staffId, a.on); if (c.ok) setNight(state, a.staffId, a.on); return c; } // staff2 훅
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
    case 'dismissOutcome': // staff-luck 룰렛 팝업
      state.lastOutcome = null;
      return { ok: true };
    // ---- 대회 (contest.ts) ----
    case 'enterContest': {
      const c = canEnterContest(state, a.event, a.staffId, a.menuId);
      if (!c.ok) return c;
      enterContest(state, a.event, a.staffId, a.menuId);
      return { ok: true };
    }
    case 'cancelContest': {
      const c = canCancelContest(state);
      if (!c.ok) return c;
      cancelContest(state);
      return { ok: true };
    }
    case 'dismissContest':
      contestState(state).pending = null;
      return { ok: true };
    // ---- 동네 경쟁 카페 (rival.ts) ----
    case 'answerRival': {
      const c = canAnswerRival(state, a.choice);
      if (!c.ok) return c;
      answerRival(state, a.choice);
      return { ok: true };
    }
    case 'dismissRivalBoard':
      rivalsState(state).pending = false;
      return { ok: true };
    case 'allyRival': {
      const c = canAllyRival(state, a.id);
      if (!c.ok) return c;
      allyRival(state, a.id);
      return { ok: true };
    }
    case 'endAllyRival':
      endAllyRival(state, a.id);
      return { ok: true };
    case 'acquireRival': {
      const c = canAcquireRival(state, a.id);
      if (!c.ok) return c;
      acquireRival(state, a.id);
      return { ok: true };
    }
    default:
      return { ok: false, reason: '아직 구현 안 됨' };
  }
}
