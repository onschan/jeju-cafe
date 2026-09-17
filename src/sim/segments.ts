import type { GameState, Guest, GuestTypeState, UnlockCond, ApplyResult, Face, RegularTier, GuestTags } from './types.ts';
import { GUEST_TYPES, FACILITIES, guestTypeDef, guestTags, canonicalGuestId, ITEMS } from '../data/index.ts';
import { nextRandom, pickWeighted } from './rng.ts';
import { monthIndex } from './clock.ts';
import { pushNotice } from './staff.ts';
import { grantItem } from './items.ts';
import { parcelAt } from './parcels.ts';

/** 만족 게이지 0~100: 😊 +2 (타깃 +3), 😠 −1. 30 부탁·50 단골·80 VIP */
export const SAT_HAPPY = 2;
export const SAT_TARGET = 3;
export const SAT_ANGRY = -1;
export const SAT_MAX = 100;
export const SAT_QUEST = 30;
export const SAT_REGULAR = 50;
export const SAT_VIP = 80;
/** 단골: 빈도 ×1.5·예산 ×1.3, VIP: 빈도 ×2·예산 ×1.6 */
export const REGULAR_FREQ = 1.5;
export const REGULAR_WALLET = 1.3;
export const VIP_FREQ = 2;
export const VIP_WALLET = 1.6;
export const MAX_TARGETS = 3;
/** 새로 해금된 타입의 시작 인기 */
export const UNLOCK_POPULARITY = 20;
/** 효과 6종 */
export const ITEM_DROP_CHANCE = 0.05;
export const TIP_RATE = 0.2;
export const AD_DELTA = 1;
export const RESEARCH_BONUS = 1; // 기본 +1에 더해 +1 → +2
export const VISIT_BONUS_CAP = 10;
export const TICKET_CHANCE = 0.01;
/** 임시 카페 랭크: 해금 손님 타입 수 / 6 (Task 7 ★·랭킹이 대체) */
export const RANK_PER_UNLOCKED = 6;
export const MAX_RANK = 5;

export function initGuestTypes(): Record<string, GuestTypeState> {
  const out: Record<string, GuestTypeState> = {};
  for (const t of GUEST_TYPES) out[t.id] = { unlocked: t.unlock.type === 'start', satisfaction: 0, regular: 'none', questDone: false };
  return out;
}
/** 시작 인기: 시작 타입만 (삼춘 30, 나머지 20) */
export function initSegmentPopularity(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of GUEST_TYPES) if (t.unlock.type === 'start') out[t.id] = t.id === 'local_auntie' ? 30 : 20;
  return out;
}

export function guestTypeState(state: GameState, typeId: string): GuestTypeState {
  const id = canonicalGuestId(typeId);
  return (state.guestTypes[id] ??= { unlocked: false, satisfaction: 0, regular: 'none', questDone: false });
}
export function isUnlocked(state: GameState, typeId: string): boolean {
  return state.guestTypes[canonicalGuestId(typeId)]?.unlocked ?? false;
}
export function unlockedTypeIds(state: GameState): string[] {
  return GUEST_TYPES.filter((t) => state.guestTypes[t.id]?.unlocked).map((t) => t.id);
}

// ---------- 해금 ----------

/** 소유 필지에 놓인 종류별 개수 (아직 안 산 필지의 밭담·덤불은 안 센다) */
export function countObjects(state: GameState, objectId: string): number {
  let n = 0;
  for (const o of Object.values(state.objects)) if (o.type === objectId && parcelAt(state, o.x, o.y)?.owned) n++;
  return n;
}

/** 해금 조건 8형 판정 */
export function unlockCondMet(state: GameState, c: UnlockCond): boolean {
  switch (c.type) {
    case 'start': return true;
    case 'rank': return state.rank >= c.rank;
    case 'star': return state.star >= c.star;
    case 'segment': return (state.guestTypes[canonicalGuestId(c.guestId)]?.satisfaction ?? 0) >= c.satisfaction;
    case 'quest': return state.board.quests[c.questId]?.status === 'done';
    case 'spot': return (state.spots[c.spotId] ?? 0) >= c.level;
    case 'date': return monthIndex(state.clock) >= (c.year - 1) * 12 + (c.month - 1);
    case 'count': return countObjects(state, c.objectId) >= c.count;
    case 'all': return c.conditions.every((x) => unlockCondMet(state, x));
  }
}

/** 타입 하나를 해금한다 (알림 + 시작 인기). 이미 열려 있으면 false. */
export function unlockGuestType(state: GameState, typeId: string): boolean {
  const id = canonicalGuestId(typeId);
  const st = guestTypeState(state, id);
  if (st.unlocked) return false;
  st.unlocked = true;
  state.segmentPopularity[id] ??= UNLOCK_POPULARITY;
  pushNotice(state, `새 손님: ${guestTypeDef(id).name}`);
  return true;
}

/** v2 시설의 해금 조건(랭크·★·손님 인기·부탁·관광지·날짜·개수)을 검사해 새로 열린 시설 id를 돌려준다. */
export function evaluateFacilityUnlocks(state: GameState): string[] {
  const opened: string[] = [];
  for (const f of FACILITIES) {
    if (!f.unlock || state.unlocked.objects.includes(f.id)) continue;
    if (!unlockCondMet(state, f.unlock)) continue;
    state.unlocked.objects.push(f.id);
    pushNotice(state, `새 시설: ${f.name}`);
    opened.push(f.id);
  }
  return opened;
}

/** 잠긴 타입의 해금 조건을 모두 검사한다. 새로 열린 id 목록을 돌려준다 (연쇄 해금은 다음 호출에서). 시설 해금도 같이 돈다. */
export function evaluateUnlocks(state: GameState): string[] {
  const opened: string[] = [];
  for (const t of GUEST_TYPES) {
    if (state.guestTypes[t.id]?.unlocked) continue;
    if (unlockCondMet(state, t.unlock) && unlockGuestType(state, t.id)) opened.push(t.id);
  }
  updateRank(state);
  evaluateFacilityUnlocks(state);
  return opened;
}

/** 임시 랭크 규칙: 1 + floor(해금 타입 수 / 6), 최대 5. 내려가지 않는다. */
export function updateRank(state: GameState): void {
  const n = unlockedTypeIds(state).length;
  state.rank = Math.max(state.rank, Math.min(MAX_RANK, 1 + Math.floor(n / RANK_PER_UNLOCKED)));
}

// ---------- 타깃 ----------

export function isTarget(state: GameState, typeId: string): boolean {
  return state.targets.includes(canonicalGuestId(typeId));
}

export function canSetTarget(state: GameState, segment: string | null): ApplyResult {
  if (segment === null) return { ok: true };
  const id = canonicalGuestId(segment);
  if (!GUEST_TYPES.some((t) => t.id === id)) return { ok: false, reason: '모르는 손님층이에요' };
  if (!isUnlocked(state, id)) return { ok: false, reason: '아직 안 오는 손님이에요' };
  if (!state.targets.includes(id) && state.targets.length >= MAX_TARGETS) return { ok: false, reason: `타깃은 ${MAX_TARGETS}개까지` };
  return { ok: true };
}

/** null = 전부 해제. 이미 타깃이면 해제, 아니면 추가 (최대 3). targetSegment는 첫 타깃의 별칭. */
export function setTarget(state: GameState, segment: string | null): void {
  if (segment === null) state.targets = [];
  else {
    const id = canonicalGuestId(segment);
    state.targets = state.targets.includes(id) ? state.targets.filter((t) => t !== id) : [...state.targets, id];
  }
  state.targetSegment = state.targets[0] ?? null;
}

// ---------- 단골 ----------

export function regularTier(state: GameState, typeId: string): RegularTier {
  return state.guestTypes[canonicalGuestId(typeId)]?.regular ?? 'none';
}
export function regularFreqMult(state: GameState, typeId: string): number {
  const r = regularTier(state, typeId);
  return r === 'vip' ? VIP_FREQ : r === 'regular' ? REGULAR_FREQ : 1;
}
export function regularWalletMult(state: GameState, typeId: string): number {
  const r = regularTier(state, typeId);
  return r === 'vip' ? VIP_WALLET : r === 'regular' ? REGULAR_WALLET : 1;
}
/** 지금 이 타입의 예산 (단골 배수 포함) */
export function walletOf(state: GameState, typeId: string): number {
  return Math.round(guestTypeDef(typeId).wallet * regularWalletMult(state, typeId));
}

/** 만족 게이지 변경. 50·80 문턱을 넘으면 단골·VIP 승격 + 알림. */
export function addSatisfaction(state: GameState, typeId: string, delta: number): void {
  const id = canonicalGuestId(typeId);
  const st = guestTypeState(state, id);
  st.satisfaction = Math.max(0, Math.min(SAT_MAX, st.satisfaction + delta));
  const tier: RegularTier = st.satisfaction >= SAT_VIP ? 'vip' : st.satisfaction >= SAT_REGULAR ? 'regular' : 'none';
  if (tier !== st.regular && (tier === 'vip' || (tier === 'regular' && st.regular === 'none'))) {
    st.regular = tier;
    pushNotice(state, tier === 'vip' ? `${guestTypeDef(id).name}이(가) VIP가 됐어요!` : `${guestTypeDef(id).name}이(가) 단골이 됐어요`);
  }
}

// ---------- 효과 6종 ----------

/** 태그를 공유하는 타입인가 (홍보 효과): 같은 연령대, 또는 둘 다 단체 */
function sharesTags(a: GuestTags, b: GuestTags): boolean {
  return (a.age !== 'none' && a.age === b.age) || (a.group && b.group);
}

/** 만족 방문(happy)마다: 만족 +2/+3, 타입 효과 발동. 호출 전 g.mood === 'happy'. */
export function onHappyVisit(state: GameState, g: Guest): void {
  const id = canonicalGuestId(g.type);
  const def = guestTypeDef(id);
  addSatisfaction(state, id, isTarget(state, id) ? SAT_TARGET : SAT_HAPPY);
  switch (def.effect) {
    case 'item':
      if (nextRandom(state) < ITEM_DROP_CHANCE) {
        const item = pickWeighted(state, ITEMS.filter((i) => i.value > 0), () => 1);
        if (item) { grantItem(state, item.id); pushNotice(state, `${def.name}이(가) ${item.name}을(를) 주고 갔어요`); }
      }
      break;
    case 'money': {
      const tip = Math.round(g.paid * TIP_RATE);
      state.money += tip;
      state.monthIncome += tip;
      break;
    }
    case 'ad':
      for (const t of GUEST_TYPES) {
        if (!state.guestTypes[t.id]?.unlocked || !sharesTags(def.tags, t.tags)) continue;
        state.segmentPopularity[t.id] = Math.min(99, (state.segmentPopularity[t.id] ?? 0) + AD_DELTA);
      }
      break;
    case 'research':
      state.research += RESEARCH_BONUS;
      break;
    case 'popularity': {
      const seat = g.seatId ? state.objects[g.seatId] : undefined;
      if (seat) state.visitBonus[seat.type] = Math.min(VISIT_BONUS_CAP, (state.visitBonus[seat.type] ?? 0) + 1);
      break;
    }
    case 'ticket':
      if (nextRandom(state) < TICKET_CHANCE) { state.tickets += 1; pushNotice(state, `${def.name}이(가) 응모권을 주고 갔어요`); }
      break;
  }
}

export function onAngryVisit(state: GameState, g: Guest): void {
  addSatisfaction(state, g.type, SAT_ANGRY);
}

// ---------- 얼굴 (렌더·초상용, id 해시로 결정) ----------

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** 타입 id에서 결정적으로 뽑은 파츠 인덱스. 시니어는 회색 머리(HAIR_RGB 4). */
export function guestFace(typeId: string): Face {
  const id = canonicalGuestId(typeId);
  const h = hashId(id);
  const tags = guestTags(id);
  return { hair: tags.age === 'senior' ? 4 + ((h >>> 8) % 3) * 6 : (h >>> 8) % 6, skin: (h >>> 4) % 3, top: (h >>> 12) % 8 };
}
