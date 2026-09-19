import type { GameState, ApplyResult, QuestDef, QuestState, EventDef, EventEffect, EventFilter } from './types.ts';
import { QUESTS, EVENTS, questDef, eventDef, guestTypeDef, GUEST_TYPES, canonicalGuestId, spotDef, itemDef } from '../data/index.ts';
import { nextRandom } from './rng.ts';
import { monthIndex } from './clock.ts';
import { pushNotice } from './staff.ts';
import { grantItem } from './items.ts';
import { guestTypeState, isUnlocked, unlockGuestType, evaluateUnlocks, countObjects, SAT_QUEST } from './segments.ts';
import { effectivePopularity } from './promotions.ts';
import { addEffect, filterMatches } from './effects.ts';
import { spotLevel, SPOT_QUEST_LEVEL } from './spots.ts';
import { fmtNum } from './format.ts';
import { villageQuestOpen } from './village.ts'; // z-ending

/** 부탁 기한: 수락한 달 + 2 */
export const QUEST_MONTHS = 2;

// ---------- 부탁 ----------

export function questState(state: GameState, id: string): QuestState | undefined {
  return state.board.quests[id];
}

/** 부탁 카드를 게시판에 올린다 (이미 있으면 실패한 것만 다시). */
export function offerQuest(state: GameState, id: string): boolean {
  const cur = state.board.quests[id];
  if (cur && cur.status !== 'failed') return false;
  const q = questDef(id);
  state.board.quests[id] = { id, status: 'offered', offeredMonthIndex: monthIndex(state.clock), deadlineMonthIndex: null, progress: 0 };
  pushNotice(state, `부탁이 왔어요: ${guestTypeDef(q.guestId).name}`);
  return true;
}

/** 부탁을 올릴 차례인가: 타입이 열려 있고 만족 ≥ 30 (체인 후속 타입은 열리는 즉시). 관광지 Lv4 부탁은 investSpot이 직접 올린다. */
function shouldOffer(state: GameState, q: QuestDef): boolean {
  const cur = state.board.quests[q.id];
  if (cur && cur.status !== 'failed') return false;
  if (!isUnlocked(state, q.guestId)) return false;
  const st = guestTypeState(state, q.guestId);
  if (st.questDone) return false;
  const def = guestTypeDef(q.guestId);
  return st.satisfaction >= SAT_QUEST || def.unlock.type === 'quest' || villageQuestOpen(state, q.guestId); // z-ending: 정착 등급 3이면 삼춘 부탁은 만족 조건 없이
}

/** 만족 30에 닿은 타입의 부탁을 올린다. 새로 올린 id 목록. */
export function refreshQuests(state: GameState): string[] {
  const out: string[] = [];
  for (const q of QUESTS) if (shouldOffer(state, q) && offerQuest(state, q.id)) out.push(q.id);
  return out;
}

/** 조건 진행도 (목표 대비 현재값). menuSold는 수락 시점부터 센다. */
export function questProgress(state: GameState, id: string): { now: number; goal: number } {
  const q = questDef(id);
  const st = state.board.quests[id];
  const c = q.condition;
  switch (c.type) {
    case 'menuSold': return { now: Math.max(0, (state.menuSold[c.params.menuId] ?? 0) - (st?.progress ?? 0)), goal: c.params.count };
    case 'objectPlaced': return { now: countObjects(state, c.params.objectId), goal: c.params.count };
    case 'spotLevel': return { now: spotLevel(state, c.params.spotId), goal: c.params.level };
    case 'segmentPopularity': return { now: Math.floor(effectivePopularity(state, c.params.guestId)), goal: c.params.popularity };
    case 'item': return { now: state.inventory[c.params.itemId] ?? 0, goal: c.params.count };
    case 'none': return { now: 1, goal: 1 };
  }
}

export function canAcceptQuest(state: GameState, id: string): ApplyResult {
  const st = state.board.quests[id];
  if (!st) return { ok: false, reason: '게시판에 없는 부탁이에요' };
  if (st.status === 'active') return { ok: false, reason: '이미 하고 있어요' };
  if (st.status !== 'offered') return { ok: false, reason: '끝난 부탁이에요' };
  return { ok: true };
}

/** 도전하기: 기한 2달, menuSold는 지금까지 판 수를 기준점으로. 호출 전 canAcceptQuest. */
export function acceptQuest(state: GameState, id: string): void {
  const st = state.board.quests[id]!;
  const q = questDef(id);
  st.status = 'active';
  st.deadlineMonthIndex = monthIndex(state.clock) + QUEST_MONTHS;
  st.progress = q.condition.type === 'menuSold' ? (state.menuSold[q.condition.params.menuId] ?? 0) : 0;
  checkQuests(state);
}

/** 보상 문구를 구조화된 rewards에서 만든다 (표의 rewardText는 아이템 id가 그대로 들어 있다). rewards가 비면 rewardText. */
export function questRewardText(q: QuestDef): string {
  const parts = q.rewards.map((r) => {
    switch (r.type) {
      case 'money': return `자금 ₩${fmtNum(r.amount)}`;
      case 'research': return `연구 ${r.amount}`;
      case 'ticket': return `응모권 ${r.amount}`;
      case 'mileage': return `마일리지 ${r.amount}`;
      case 'ad': return `${guestTypeDef(q.guestId).name} 인기 +${r.amount}`;
      case 'item': { let name = r.itemId; try { name = itemDef(r.itemId).name; } catch { /* 표에만 있는 아이템 */ } return `아이템 ${name}`; }
    }
  });
  return parts.length > 0 ? parts.join(' · ') : q.rewardText;
}

function applyReward(state: GameState, q: QuestDef): void {
  for (const r of q.rewards) {
    switch (r.type) {
      case 'money': state.money += r.amount; state.monthIncome += r.amount; break;
      case 'research': state.research += r.amount; break;
      case 'ticket': state.tickets += r.amount; break;
      case 'mileage': state.mileage += r.amount; break;
      case 'ad': state.segmentPopularity[q.guestId] = Math.min(99, (state.segmentPopularity[q.guestId] ?? 0) + r.amount); break;
      case 'item': try { grantItem(state, r.itemId); } catch { /* 표에만 있는 아이템은 건너뛴다 */ } break;
    }
  }
}

/** 완료: 보상 + 다음 손님 해금 + 알림. */
export function completeQuest(state: GameState, id: string): void {
  const st = state.board.quests[id]!;
  const q = questDef(id);
  st.status = 'done';
  applyReward(state, q);
  guestTypeState(state, q.guestId).questDone = true;
  pushNotice(state, `부탁 완료! ${guestTypeDef(q.guestId).name} — ${questRewardText(q)}`);
  if (q.unlockGuestId) unlockGuestType(state, q.unlockGuestId);
  evaluateUnlocks(state);
  refreshQuests(state);
}

/** 진행 중인 부탁의 조건을 검사해 완료 처리. 완료된 id 목록. */
export function checkQuests(state: GameState): string[] {
  const done: string[] = [];
  for (const st of Object.values(state.board.quests)) {
    if (st.status !== 'active') continue;
    const p = questProgress(state, st.id);
    if (p.now >= p.goal) { completeQuest(state, st.id); done.push(st.id); }
  }
  return done;
}

/** 월초: 기한 지난 부탁은 실패 (다음 달 다시 올라온다). */
export function expireQuests(state: GameState): string[] {
  const mi = monthIndex(state.clock);
  const failed: string[] = [];
  for (const st of Object.values(state.board.quests)) {
    if (st.status !== 'active' || st.deadlineMonthIndex === null || mi <= st.deadlineMonthIndex) continue;
    st.status = 'failed';
    failed.push(st.id);
    pushNotice(state, `부탁 기한이 지났어요: ${guestTypeDef(questDef(st.id).guestId).name}`);
  }
  return failed;
}

// ---------- 이벤트 ----------

/** conditionText → 판정. 지원하는 패턴만; 나머지는 무조건(true). "버튼"은 수동이라 false. */
export function eventConditionMet(state: GameState, text: string | null): boolean {
  if (!text) return true;
  return text.split('·').every((part) => singleCondition(state, part.trim()));
}
function singleCondition(state: GameState, t: string): boolean {
  let m: RegExpExecArray | null;
  if (t.includes('버튼')) return false;
  if ((m = /^손님 (\w+) 인기 (\d+)$/.exec(t))) return effectivePopularity(state, canonicalGuestId(m[1]!)) >= Number(m[2]);
  if ((m = /^손님 (\w+) 해금$/.exec(t))) return isUnlocked(state, canonicalGuestId(m[1]!));
  if ((m = /^관광지 (\w+) Lv(\d+)$/.exec(t))) return spotLevel(state, m[1]!) >= Number(m[2]);
  if ((m = /^세트 (\w+) 완성$/.exec(t))) return state.codex.sets.includes(m[1]!);
  if ((m = /^★(\d+)$/.exec(t))) return state.star >= Number(m[1]);
  if ((m = /^랭크 (\d+)$/.exec(t))) return state.rank >= Number(m[1]);
  if ((m = /^(\d+)년차 이상$/.exec(t))) return state.clock.year >= Number(m[1]);
  if ((m = /^직원 Lv(\d+) 이상$/.exec(t))) return state.staff.some((s) => s.level >= Number(m![1]));
  if ((m = /^메뉴 (\d+)개$/.exec(t))) return state.unlocked.menus.length >= Number(m[1]);
  if ((m = /^잔고 < ([\d,]+)$/.exec(t))) return state.money < Number(m[1]!.replace(/,/g, ''));
  if ((m = /^(\w+) 없음$/.exec(t))) return countObjects(state, m[1]!) === 0;
  if ((m = /^(\w+) (\d+)개$/.exec(t))) return countObjects(state, m[1]!) >= Number(m[2]);
  if ((m = /^(\w+) 수확$/.exec(t))) return Object.values(state.objects).some((o) => o.type === m![1] && !o.build); // v3: 농원 시설이 완공돼 있으면 매월 수확한다
  return true;
}

function popularityFilterIds(state: GameState, filter: EventFilter | undefined): string[] {
  return GUEST_TYPES.filter((t) => isUnlocked(state, t.id) && filterMatches(filter, t.id)).map((t) => t.id);
}

/** 효과 DSL 하나 적용 */
export function applyEventEffect(state: GameState, e: EventEffect, source: string): void {
  switch (e.kind) {
    case 'money': state.money += e.amount; if (e.amount > 0) state.monthIncome += e.amount; break;
    case 'research': state.research += e.amount; break;
    case 'mileage': state.mileage += e.amount; break;
    case 'tickets': state.tickets += e.amount; break;
    case 'spawnMult': addEffect(state, { kind: 'spawnMult', mult: e.mult, filter: e.filter, days: e.days, source }); break;
    case 'harvestMult': addEffect(state, { kind: 'harvestMult', mult: e.mult, days: e.days, source }); break;
    case 'upkeepMult': addEffect(state, { kind: 'upkeepMult', mult: e.mult, days: e.days, source }); break;
    case 'noGuests': addEffect(state, { kind: 'noGuests', mult: 0, days: e.days, source }); break;
    case 'popularity':
      for (const id of popularityFilterIds(state, e.filter)) state.segmentPopularity[id] = Math.max(0, Math.min(99, (state.segmentPopularity[id] ?? 0) + e.delta));
      break;
    case 'grantItem': try { grantItem(state, e.itemId, e.n); } catch { /* 표에만 있는 아이템 */ } break;
    case 'unlockObject': if (!state.unlocked.objects.includes(e.objectId)) state.unlocked.objects.push(e.objectId); break;
    case 'notice': pushNotice(state, e.text); break;
  }
}

function applyEvent(state: GameState, def: EventDef, effects: EventEffect[]): void {
  for (const e of effects) applyEventEffect(state, e, def.id);
}

/** 이 달에 굴릴 수 있나: 달·조건·(중복 방지: 같은 달 같은 이벤트 한 번) */
export function eventEligible(state: GameState, def: EventDef): boolean {
  if (!def.months.includes(state.clock.month)) return false;
  const mi = monthIndex(state.clock);
  if (state.board.events.some((e) => e.id === def.id && e.monthIndex === mi)) return false;
  return eventConditionMet(state, def.conditionText);
}

/** 월초 롤: 표 순서대로 prob%. 선택 이벤트는 pending으로 게시판에, 나머지는 바로 적용 + 알림(대사). 일어난 id 목록. */
export function rollEvents(state: GameState, events: EventDef[] = EVENTS): string[] {
  const mi = monthIndex(state.clock);
  const fired: string[] = [];
  for (const def of events) {
    if (!eventEligible(state, def)) continue;
    if (nextRandom(state) * 100 >= def.prob) continue;
    fired.push(def.id);
    if (def.choice) {
      state.board.events.push({ id: def.id, monthIndex: mi, status: 'pending' });
      pushNotice(state, `${def.name}: ${def.line}`);
    } else {
      state.board.events.push({ id: def.id, monthIndex: mi, status: 'applied' });
      applyEvent(state, def, def.effects);
      pushNotice(state, `${def.name}: ${def.line}`);
    }
  }
  return fired;
}

export function canRespondEvent(state: GameState, id: string): ApplyResult {
  const ev = state.board.events.find((e) => e.id === id && e.status === 'pending');
  if (!ev) return { ok: false, reason: '답할 이벤트가 없어요' };
  return { ok: true };
}

/** 수락/거절. 호출 전 canRespondEvent. */
export function respondEvent(state: GameState, id: string, accept: boolean): void {
  const ev = state.board.events.find((e) => e.id === id && e.status === 'pending')!;
  const def = eventDef(id);
  ev.status = accept ? 'accepted' : 'declined';
  applyEvent(state, def, accept ? def.effects : def.declineEffects);
}

/** 월초: 지난달 pending 선택 이벤트는 자동 거절, 오래된 기록은 정리 (최근 12개월) */
export function expireEvents(state: GameState): void {
  const mi = monthIndex(state.clock);
  for (const ev of state.board.events) if (ev.status === 'pending' && ev.monthIndex < mi) ev.status = 'declined';
  state.board.events = state.board.events.filter((e) => e.monthIndex >= mi - 12);
}

// ---------- 관광지 훅 ----------

/** 투자 뒤: Lv2 손님·Lv4 부탁·다음 관광지 해금 */
export function afterInvest(state: GameState, spotId: string, level: number): void {
  evaluateUnlocks(state); // Lv2 손님 (spot 해금형)
  const def = spotDef(spotId);
  if (level >= SPOT_QUEST_LEVEL && def.lv4QuestId) {
    const q = questDef(def.lv4QuestId);
    if (!isUnlocked(state, q.guestId)) unlockGuestType(state, q.guestId);
    offerQuest(state, def.lv4QuestId);
  }
  if (level >= SPOT_QUEST_LEVEL && def.nextSpotId) pushNotice(state, `${spotDef(def.nextSpotId).name}에 투자할 수 있어요`);
  checkQuests(state);
}

// ---------- 매일·매월 ----------

/** 매일: 조건 진행 확인 → 완료, 만족 30 타입 부탁 올리기 */
export function dailyBoard(state: GameState): void {
  checkQuests(state);
  refreshQuests(state);
}

/** 월초 (손님 해금 뒤): 기한·선택 만료 → 이벤트 롤 → 부탁 올리기 */
export function monthlyBoard(state: GameState): void {
  expireQuests(state);
  expireEvents(state);
  rollEvents(state);
  refreshQuests(state);
}

/** UI 배지: 도전 안 한 부탁 + 답 안 한 이벤트 */
export function boardBadge(state: GameState): number {
  return Object.values(state.board.quests).filter((q) => q.status === 'offered').length + state.board.events.filter((e) => e.status === 'pending').length;
}

/** 게시판에 보이는 부탁 (offered·active 먼저, 그다음 done·failed 최근순) */
export function visibleQuests(state: GameState): QuestState[] {
  const order: Record<QuestState['status'], number> = { active: 0, offered: 1, failed: 2, done: 3 };
  return Object.values(state.board.quests).sort((a, b) => order[a.status] - order[b.status] || b.offeredMonthIndex - a.offeredMonthIndex);
}

