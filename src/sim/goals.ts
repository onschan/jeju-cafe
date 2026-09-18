/**
 * 목표 체인 (v3 §2 → 확장 §3.5·§7): goals.json 108개. 메인 목표는 **2개 동시 진행**(index와 그 다음 안 이룬 것 둘 다 판정·표시).
 * 달성하면 applyRewards로 보상을 주고 alerts에 { type: 'reward' }(보상 상자) → { type: 'goal' }(축하 대화)를 남긴다.
 * 조건 판정은 conditionCheckers 레지스트리(타입 → { cur, max }). 다른 트랙(시설 증축·청결·명당·연수·명소 방문객·입지)이 아직 없는 조건은
 * `// TODO(x-<트랙>)` 스텁으로 { cur: 0 }을 돌려 두고 통합 때 한 줄씩 연결한다.
 * 도전 과제·월간 과제·튜토리얼 판정도 checkGoals에서 같이 돈다 (tick·액션 훅은 그대로 한 곳).
 *
 * 기능 잠금표 (state.features — 목표·튜토리얼 보상 unlockFeature로 열린다. 열리기 전엔 해당 액션이 ok:false):
 * | feature    | 여는 목표 | 잠기는 액션                                          |
 * |------------|-----------|------------------------------------------------------|
 * | promote    | g07       | promote (홍보 활동: 전단·SNS·아르바이트…)             |
 * | parcel     | g11       | buyParcel                                            |
 * | clearRock  | g12       | clearRock (바위·덤불 치우기)                          |
 * | craft      | g16       | develop · addTopping · removeTopping · levelUpMenu   |
 * | popup      | g18       | openPopup (원정 팝업 스토어)                          |
 * | challenge  | g47       | challenge (라이벌 카페 대결)                          |
 * | siteView   | 튜토리얼 2 | (UI만: 입지 보기 배지)                                |
 * | comboCodex | 튜토리얼 6 | (UI만: 콤보 도감)                                     |
 * | spotMap    | 튜토리얼 9 | (UI만: 명소 지도)                                     |
 */
import type { GameState, GoalDef, GoalCondition, GoalReward, FeatureId, Action, ApplyResult, RewardSource, GoalSpeaker } from './types.ts';
import { GOALS, goalDef, objectDef, menuDef, roleDef, ROLES, OBJECTS, MENUS, spotDef, guestTypeDef, guidebookDef, itemDef, ITEMS } from '../data/index.ts';
import { facilityCount } from './rank.ts';
import { countCategory } from './segments.ts';
import { ownedParcels } from './parcels.ts';
import { metCount, regularCount } from './popup.ts';
import { pushNotice } from './staff.ts';
import { addMileage } from './mileage.ts';
import { MAX_BUILDERS } from './build.ts';
import { fmtNum } from './format.ts';
import { josa } from './josa.ts';
import { activeCombos, setLevels } from './compat.ts';
import { effectivePopularity } from './promotions.ts';
import { seatsOf } from './cafe.ts';
import { monthIndex } from './clock.ts';
import { reachMap, busStopPos, cellKey, walkableNeighborsOf } from './path.ts';
import { checkChallenges } from './challenges.ts';
import { checkTutorial, TUTORIAL_STEPS } from './tutorial.ts';

export const FEATURE_IDS: FeatureId[] = ['clearRock', 'promote', 'craft', 'popup', 'challenge', 'parcel', 'siteView', 'comboCodex', 'spotMap'];
/** 액션을 잠그는 기능 (목표에서 정확히 한 번 열린다). 나머지는 UI 표시용. */
export const ACTION_FEATURE_IDS: FeatureId[] = ['clearRock', 'promote', 'craft', 'popup', 'challenge', 'parcel'];
export const FEATURE_NAME: Record<FeatureId, string> = { clearRock: '바위 치우기', promote: '홍보', craft: '연구 개발', popup: '팝업 스토어', challenge: '카페 대결', parcel: '필지 구매', siteView: '입지 보기', comboCodex: '콤보 도감', spotMap: '명소 지도' };
/** 액션 → 필요한 기능 (표는 파일 상단 주석) */
export const FEATURE_OF_ACTION: Partial<Record<Action['type'], FeatureId>> = {
  clearRock: 'clearRock',
  promote: 'promote',
  develop: 'craft', addTopping: 'craft', removeTopping: 'craft', levelUpMenu: 'craft',
  openPopup: 'popup',
  challenge: 'challenge',
  buyParcel: 'parcel',
};
/** 한 번의 checkGoals에서 연달아 처리할 최대 목표 수 (무한 루프 방지) */
export const MAX_GOALS_PER_CHECK = 10;
/** 메인 목표 동시 진행 수 (§7.3) */
export const CONCURRENT_GOALS = 2;
/** 삼춘 대출 중 보상 감액 (§3.5 실패·지연 규칙): money 50%, tickets/mileage 절반(내림) */
export const LOAN_REWARD_MULT = 0.5;

export function initFeatures(): Record<FeatureId, boolean> {
  return { clearRock: false, promote: false, craft: false, popup: false, challenge: false, parcel: false, siteView: false, comboCodex: false, spotMap: false };
}

export function featureOpen(state: GameState, id: FeatureId): boolean {
  return state.features[id] === true;
}

/** 액션이 기능 잠금에 걸리나 (걸리면 ok:false + 어느 목표에서 열리는지) */
export function checkFeature(state: GameState, actionType: Action['type']): ApplyResult {
  const f = FEATURE_OF_ACTION[actionType];
  if (!f || featureOpen(state, f)) return { ok: true };
  const g = goalForFeature(f);
  return { ok: false, reason: g ? `${josa(FEATURE_NAME[f], '은/는')} 목표 「${g.title}」${josa(g.title, '을/를').slice(g.title.length)} 이루면 열려요` : `${josa(FEATURE_NAME[f], '은/는')} 아직 잠겨 있어요` };
}

// ---------- 열림 조건 (§7.1: 좌석·길·메뉴가 갖춰질 때까지 손님 0) ----------

/** 좌석 오브젝트 (guests.ts isSeat와 같은 규칙: kind seat + 2층 증축한 본관). guests.ts는 goals.ts를 import하므로 여기서 다시 쓴다. */
function seatObjectsOf(state: GameState) {
  return Object.values(state.objects).filter((o) => objectDef(o.type).kind === 'seat' || seatsOf(state, o) > 0);
}

/** 카페가 손님을 받을 수 있나 (§7.1): 정류장에서 걸어 닿는 좌석 1개 이상 + (튜토리얼 중엔) 메뉴 1개 이상. guests.ts 스폰 훅.
 *  메뉴 조건은 튜토리얼 중에만 본다 — 완성 시작 상태·기존 테스트(빈 메뉴판에 손님을 넣는다)는 그대로 돈다. */
export function canOpen(state: GameState): boolean {
  if (state.tutorial.step < TUTORIAL_STEPS && !state.menuSlots.some((m) => m !== null)) return false;
  const seats = seatObjectsOf(state);
  if (seats.length === 0) return false;
  const reach = reachMap(state, busStopPos(state));
  return seats.some((s) => walkableNeighborsOf(state, s.x, s.y).some((nb) => reach.dist.has(cellKey(state, nb))));
}

// ---------- 조건 판정 레지스트리 ----------

export interface Progress { cur: number; max: number }
type Checker<C extends GoalCondition = GoalCondition> = (state: GameState, c: C) => Progress;
type CheckerMap = { [K in GoalCondition['type']]: Checker<Extract<GoalCondition, { type: K }>> };

/** 가이드북 최고 순위 (작을수록 좋다). 발표가 없었으면 11(= 10위 밖) */
function bestRank(state: GameState, bookId?: string): number {
  let best = 11;
  for (const [id, g] of Object.entries(state.guidebooks)) if ((!bookId || id === bookId) && g.best !== null) best = Math.min(best, g.best);
  return best;
}
/** 활성 콤보 id 집합 (마당 전체) */
function activeComboIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(state.objects)) for (const c of activeCombos(state, id)) ids.add(c.id);
  return ids;
}
function activeSetIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(state.objects)) for (const s of setLevels(state, id)) ids.add(s.id);
  return ids;
}
const hasSkill = (skill: string | undefined) => !!skill && skill !== 'none';
const n = (cur: number, max: number): Progress => ({ cur, max });
/** 순위형: 이루면 1/1 */
const flag = (ok: boolean): Progress => ({ cur: ok ? 1 : 0, max: 1 });

export const conditionCheckers: CheckerMap = {
  guests: (s, c) => n(s.totalGuests, c.n),
  menuSold: (s, c) => n(s.menuSold[c.menuId] ?? 0, c.n),
  money: (s, c) => n(s.money, c.n),
  staff: (s, c) => n(s.staff.length, c.n),
  facilities: (s, c) => n(c.category ? countCategory(s, c.category) : facilityCount(s), c.n),
  satisfied: (s, c) => n(s.stats.satisfiedTotal, c.n),
  parcels: (s, c) => n(ownedParcels(s).length, c.n),
  rank: (s, c) => flag(bestRank(s) <= c.n),
  cafeRank: (s, c) => n(s.rank, c.n),
  stars: (s, c) => n(s.star, c.n),
  regular: (s, c) => n(regularCount(s) + Object.values(s.guestTypes).filter((t) => t.regular !== 'none').length, c.n),
  research: (s, c) => n(s.research, c.n),
  namedGuest: (s, c) => n(metCount(s), c.n),
  rocks: (s, c) => n(s.stats.rocksCleared, c.n),
  menus: (s, c) => n(s.menuSlots.filter((m) => m !== null).length, c.n),
  recipes: (s, c) => n(s.stats.recipesMade, c.n),
  promotions: (s, c) => n(s.stats.promotionsDone, c.n),
  rivalWins: (s, c) => n(s.stats.rivalWins, c.n),
  year: (s, c) => n(s.clock.year, c.n),
  // ---- §3.5 신설 ----
  monthIncome: (s, c) => n(s.lastMonthIncome, c.n),
  staffLevel: (s, c) => n(s.staff.filter((st) => st.level >= c.lv).length, c.n),
  trainings: (s, c) => n(s.stats.trainings, c.n), // x-staff가 stats.trainings를 올린다
  facilityLv: (_s, c) => n(0, c.n), // TODO(x-facility): 증축 Lv ≥ c.lv 시설 수 (upgrade.ts)
  comboCount: (s, c) => n(activeComboIds(s).size, c.n),
  setCount: (s, c) => n(activeSetIds(s).size, c.n),
  spotEffect: (_s, c) => n(0, c.n), // TODO(x-facility): 명당 수 (spot_effects.json)
  spotLevel: (s, c) => n(s.spots[c.spotId] ?? 0, c.lv),
  spotAny: (s, c) => n(Object.values(s.spots).filter((lv) => lv >= c.lv).length, c.n),
  visitorsTotal: (_s, c) => n(0, c.n), // TODO(x-spots): 전 명소 누적 방문객
  guestType: (s, c) => n(Math.max(0, Math.round(effectivePopularity(s, c.guestId))), c.n),
  guidebookRank: (s, c) => flag(bestRank(s, c.bookId) <= c.n),
  guidebookWins: (s, c) => n(s.stats.guidebookWins, c.n),
  cleanliness: (_s, c) => n(0, c.n), // TODO(x-facility): 청결 ≥ c.n 30일 유지 (cleanliness.ts)
  profitMonths: (s, c) => n(s.stats.profitMonths, c.n),
  tourGroup: (s, c) => n(s.stats.toursHeld, c.n), // x-spots가 stats.toursHeld를 올린다
  itemsUsed: (s, c) => n(s.stats.itemsUsed, c.n),
  uniforms: (s, c) => n(s.uniforms.length, c.n),
  custom: (s, c) => flag(customMet(s, c.id)),
  // ---- §7.5 전략 조건 ----
  siteSeats: (_s, c) => n(0, c.n), // TODO(x-site): seatObjects.filter(siteOf(state,x,y).view >= c.view)
  windlessSeats: (_s, c) => n(0, c.n), // TODO(x-site): seatObjects.filter(siteOf(state,x,y).wind === 0)
  combos: (s, c) => n(s.codex.combos.length, c.n),
  spotEffects: (_s, c) => n(0, c.n), // TODO(x-facility): 명당 효과 수
  upgraded: (_s, c) => n(0, c.n), // TODO(x-facility): 증축 Lv ≥ c.lv 시설 수
  clean: (_s, c) => n(0, c.days), // TODO(x-facility): 청결 평균 ≥ c.avg 유지 일수
  skills: (s, c) => n(s.staff.filter((st) => hasSkill(st.skill)).length, c.n),
  selfSupply: (_s, c) => n(0, c.pct), // TODO(x-spots): 재료 자급률 %
  training: (s, c) => n(s.stats.trainings, c.n),
  // ---- 도전·월간 ----
  seats: (s, c) => n(seatObjectsOf(s).length, c.n),
  noLossMonth: (s, c) => n(s.stats.profitMonths, c.n),
  monthGuests: (s, c) => n(s.monthGuests, c.n),
  monthSales: (s, c) => n(s.monthIncome, c.n),
};

/** 코드 판정 조건 */
export function customMet(state: GameState, id: string): boolean {
  switch (id) {
    case 'centennial': return state.clock.year >= 10 && state.clock.month === 11 && state.star >= 5; // 10년차 11월 감귤축제, ★5
    case 'dirty30': return false; // TODO(x-facility): 청결 < 50 상태 30일 (§4.3 악플 이벤트 조건)
    case 'noParking': return !Object.values(state.objects).some((o) => o.type === 'parking'); // 렌터카 대란 (§4.5)
    default: return false;
  }
}

/** 조건 진행도 { cur, max } */
export function conditionProgress(state: GameState, c: GoalCondition): Progress {
  const check = conditionCheckers[c.type] as Checker;
  return check(state, c);
}
/** 목표 조건의 현재 값 (순위형은 달성 여부 0/1) */
export function goalValue(state: GameState, c: GoalCondition): number {
  return conditionProgress(state, c).cur;
}
export function goalMet(state: GameState, c: GoalCondition): boolean {
  const p = conditionProgress(state, c);
  return p.cur >= p.max;
}

// ---------- 메인 목표 2개 동시 진행 ----------

/** 지금 진행 중인 메인 목표 (index부터 안 이룬 것 최대 CONCURRENT_GOALS개) */
export function activeGoals(state: GameState): GoalDef[] {
  const out: GoalDef[] = [];
  for (let i = state.goals.index; i < GOALS.length && out.length < CONCURRENT_GOALS; i++) {
    const g = GOALS[i]!;
    if (!state.goals.claimed.includes(g.id)) out.push(g);
  }
  return out;
}
/** 첫 번째 진행 목표 (목표 줄) */
export function currentGoal(state: GameState): GoalDef | null {
  return activeGoals(state)[0] ?? null;
}
export function goalClaimed(state: GameState, id: string): boolean {
  return state.goals.claimed.includes(id);
}

/** 목표 줄 진행도 { cur, max }. 순위형(rank·guidebookRank·custom)은 1/1. 목표가 다 끝났으면 { cur: 0, max: 0 }. */
export function goalProgress(state: GameState, g: GoalDef | null = currentGoal(state)): Progress {
  if (!g) return { cur: 0, max: 0 };
  const p = conditionProgress(state, g.condition);
  return { cur: Math.min(p.max, p.cur), max: p.max };
}

const name = {
  spot: (id: string) => { try { return spotDef(id).name; } catch { return '명소'; } },
  guest: (id: string) => { try { return guestTypeDef(id).name; } catch { return '손님'; } },
  book: (id: string) => { try { return guidebookDef(id).name; } catch { return '가이드북'; } },
  menu: (id: string) => { try { return menuDef(id).name; } catch { return '메뉴'; } },
  object: (id: string) => OBJECTS.find((o) => o.id === id)?.name ?? '새 시설',
  role: (id: string) => ROLES.find((r) => r.id === id)?.name ?? '새 직종',
  item: (id: string) => { try { return itemDef(id).name; } catch { return ITEMS.find((i) => i.id === id)?.name ?? '아이템'; } },
};

/** 목표 조건 한글 문구 (UI 목표 줄·잠긴 카드용) */
export function goalConditionText(c: GoalCondition): string {
  switch (c.type) {
    case 'guests': return `손님 ${fmtNum(c.n)}명 맞이`;
    case 'menuSold': return `${name.menu(c.menuId)} ${c.n}잔 팔기`;
    case 'money': return `자금 ₩${fmtNum(c.n)}`;
    case 'staff': return `직원 ${c.n}명`;
    case 'facilities': return `시설 ${c.n}개`;
    case 'satisfied': return `만족 손님 ${fmtNum(c.n)}명`;
    case 'parcels': return `필지 ${c.n}개`;
    case 'rank': return `가이드북 ${c.n}위 안`;
    case 'cafeRank': return `카페 랭크 ${c.n}`;
    case 'stars': return `★${c.n}`;
    case 'regular': return `단골 ${c.n}명`;
    case 'research': return `연구 ${c.n}`;
    case 'namedGuest': return `이름 있는 손님 ${c.n}명`;
    case 'rocks': return `바위 ${c.n}개 치우기`;
    case 'menus': return `메뉴 ${c.n}개 올리기`;
    case 'recipes': return `레시피 ${c.n}개 개발`;
    case 'promotions': return `홍보 ${c.n}회`;
    case 'rivalWins': return `라이벌 대결 ${c.n}승`;
    case 'year': return `${c.n}년차`;
    case 'monthIncome': return `월 매출 ₩${fmtNum(c.n)}`;
    case 'staffLevel': return `Lv${c.lv} 직원 ${c.n}명`;
    case 'trainings': case 'training': return `연수 ${c.n}회`;
    case 'facilityLv': case 'upgraded': return `Lv${c.lv} 시설 ${c.n}개`;
    case 'comboCount': return `콤보 ${c.n}개`;
    case 'setCount': return `세트 효과 ${c.n}개`;
    case 'spotEffect': case 'spotEffects': return `명당 ${c.n}개`;
    case 'spotLevel': return `${name.spot(c.spotId)} Lv${c.lv}`;
    case 'spotAny': return `Lv${c.lv} 명소 ${c.n}곳`;
    case 'visitorsTotal': return `명소 방문객 ${fmtNum(c.n)}명`;
    case 'guestType': return `${name.guest(c.guestId)} 인기 ${c.n}`;
    case 'guidebookRank': return `${name.book(c.bookId)} ${c.n}위 안`;
    case 'guidebookWins': return `가이드북 1위 ${c.n}회`;
    case 'cleanliness': return `청결 ${c.n} 한 달 유지`;
    case 'profitMonths': return `${c.n}개월 연속 흑자`;
    case 'tourGroup': return `투어 개최 ${c.n}회`;
    case 'itemsUsed': return `강화 아이템 ${c.n}개 사용`;
    case 'uniforms': return `유니폼 ${c.n}단계`;
    case 'custom': return c.id === 'centennial' ? '100주년 감귤축제' : '특별 조건';
    case 'siteSeats': return `전망 ${c.view} 이상 좌석 ${c.n}개`;
    case 'windlessSeats': return `바람 없는 좌석 ${c.n}개`;
    case 'combos': return `콤보 도감 ${c.n}개`;
    case 'clean': return `청결 ${c.avg} 이상 ${c.days}일`;
    case 'skills': return `특기 직원 ${c.n}명`;
    case 'selfSupply': return `재료 자급률 ${c.pct}%`;
    case 'seats': return `좌석 시설 ${c.n}개`;
    case 'noLossMonth': return `적자 없이 ${c.n}달`;
    case 'monthGuests': return `이달 손님 ${fmtNum(c.n)}명`;
    case 'monthSales': return `이달 매출 ₩${fmtNum(c.n)}`;
  }
}

/** 보상 한글 문구 */
export function goalRewardText(r: GoalReward): string {
  switch (r.type) {
    case 'money': return `₩${fmtNum(r.amount)}`;
    case 'unlockFacility': return `시설 ${name.object(r.id)}`;
    case 'unlockMenu': return `메뉴 ${name.menu(r.id)}`;
    case 'unlockRole': return `직종 ${name.role(r.id)}`;
    case 'tickets': return `응모권 ${r.n}`;
    case 'mileage': return `마일리지 ${r.n}`;
    case 'staffSlot': return `${name.role(r.role)} 자리 +${r.n}`;
    case 'research': return `연구 ${r.n}`;
    case 'builder': return `일꾼 삼춘 +${r.n}`;
    case 'unlockFeature': return `${FEATURE_NAME[r.id]} 열림`;
    case 'item': return `${name.item(r.id)} ${r.n}개`;
    case 'unlockGuest': return `손님 ${name.guest(r.id)}`;
    case 'unlockRecruit': return '새 채용 공고';
    case 'unlockGuidebook': return `가이드북 ${name.book(r.id)}`;
    case 'seed': return `${name.item(r.kind)} ${r.n}개`;
    case 'title': return `칭호 「${r.name}」`;
    case 'feeBonus': return `요금 +${r.pct}%`;
  }
}

/** 이 시설을 여는 목표 (잠긴 카드 "🔒 손님 50명 맞이하면 열려요") */
export function goalForFacility(objectId: string): GoalDef | null {
  return GOALS.find((g) => g.reward.some((r) => r.type === 'unlockFacility' && r.id === objectId)) ?? null;
}
export function goalForMenu(menuId: string): GoalDef | null {
  return GOALS.find((g) => g.reward.some((r) => r.type === 'unlockMenu' && r.id === menuId)) ?? null;
}
export function goalForFeature(id: FeatureId): GoalDef | null {
  return GOALS.find((g) => g.reward.some((r) => r.type === 'unlockFeature' && r.id === id)) ?? null;
}

// ---------- 보상 지급 (goals/challenges/tutorial 공용) ----------

/** 삼춘 대출 중인가 (§4.4 — x-economy failure.ts가 state.loan을 만들면 연결). 지금은 없음. */
export function underLoan(state: GameState): boolean {
  const s = state as GameState & { loan?: { count?: number; remaining?: number } };
  return (s.loan?.remaining ?? 0) > 0; // TODO(x-economy): failure.ts의 대출 상태 필드에 맞춘다
}

/** 대출 중 감액을 적용한 보상 (§3.5 실패·지연 규칙) */
export function scaleReward(state: GameState, r: GoalReward): GoalReward {
  if (!underLoan(state)) return r;
  if (r.type === 'money') return { ...r, amount: Math.floor(r.amount * LOAN_REWARD_MULT) };
  if (r.type === 'tickets' || r.type === 'mileage') return { ...r, n: Math.floor(r.n * LOAN_REWARD_MULT) };
  return r;
}

export function grantReward(state: GameState, r: GoalReward): void {
  switch (r.type) {
    case 'money': state.money += r.amount; break;
    case 'unlockFacility':
      if (!state.unlocked.objects.includes(r.id)) { state.unlocked.objects.push(r.id); pushNotice(state, `새 시설: ${name.object(r.id)}`); }
      break;
    case 'unlockMenu':
      if (!state.unlocked.menus.includes(r.id) && MENUS.some((m) => m.id === r.id)) { state.unlocked.menus.push(r.id); pushNotice(state, `새 메뉴: ${name.menu(r.id)}`); }
      break;
    case 'unlockRole':
      if (!state.unlocked.roles.includes(r.id) && ROLES.some((x) => x.id === r.id)) { state.unlocked.roles.push(r.id); pushNotice(state, `새 직종: ${name.role(r.id)}`); }
      break; // TODO(x-staff): 'clean' 직종은 staff_roles.json에 생기면 자동으로 열린다
    case 'tickets': state.tickets += r.n; break;
    case 'mileage': addMileage(state, r.n); break;
    case 'staffSlot': state.slots[r.role] = (state.slots[r.role] ?? 0) + r.n; break;
    case 'research': state.research += r.n; break;
    case 'builder': state.builders = Math.min(MAX_BUILDERS, state.builders + r.n); break;
    case 'unlockFeature': state.features[r.id] = true; pushNotice(state, `${josa(FEATURE_NAME[r.id], '이/가')} 열렸어요`); break;
    case 'item': state.inventory[r.id] = (state.inventory[r.id] ?? 0) + r.n; break; // TODO(x-items): 없는 아이템 id는 통합 때 items.ts grantItem으로
    case 'seed': state.inventory[r.kind] = (state.inventory[r.kind] ?? 0) + r.n; break;
    case 'unlockGuest': {
      const st = (state.guestTypes[r.id] ??= { unlocked: false, satisfaction: 0, regular: 'none', questDone: false });
      if (!st.unlocked) { st.unlocked = true; pushNotice(state, `새 손님: ${name.guest(r.id)}`); }
      break;
    }
    case 'unlockRecruit': state.freeRecruits += 1; break; // TODO(x-staff): 채용 등급 해금 상태가 생기면 연결 (지금은 스카우트권 1)
    case 'unlockGuidebook': {
      const g = (state.guidebooks[r.id] ??= { unlocked: false, lastRank: null, best: null });
      if (!g.unlocked) { g.unlocked = true; pushNotice(state, `가이드북 ${josa(name.book(r.id), '이/가')} 열렸어요`); }
      break;
    }
    case 'title': if (!state.titles.includes(r.id)) { state.titles.push(r.id); pushNotice(state, `칭호 「${r.name}」`); } break;
    case 'feeBonus': state.feeBonusPct += r.pct; break;
  }
}

/** 보상 묶음을 한 곳에서 지급하고 보상 상자 알림을 남긴다 (목표·도전·월간·튜토리얼 공용). 실제 지급된(감액 반영) 보상 목록. */
export function applyRewards(state: GameState, rewards: GoalReward[], meta: { source: RewardSource; refId: string; title: string; line?: string; speaker?: GoalSpeaker }): GoalReward[] {
  const items = rewards.map((r) => scaleReward(state, r));
  for (const r of items) grantReward(state, r);
  state.alerts.push({ type: 'reward', source: meta.source, refId: meta.refId, title: meta.title, items, line: meta.line, speaker: meta.speaker });
  return items;
}

// ---------- 월말·발표 누적 카운터 (E 소유 economy/guidebook을 안 건드리고 여기서 관찰) ----------

/** 월이 바뀐 뒤 처음 판정할 때: 지난달 흑자/적자 연속 수, 가이드북 1위 횟수 갱신 */
function observeMonth(state: GameState): void {
  const mi = monthIndex(state.clock);
  if (state.stats.seenMonth !== mi) {
    state.stats.seenMonth = mi;
    const card = state.lastMonthCard;
    if (card) {
      if (card.net >= 0) { state.stats.profitMonths++; state.stats.lossMonths = 0; }
      else { state.stats.lossMonths++; state.stats.profitMonths = 0; }
    }
  }
  const a = state.lastAnnouncement;
  if (a && a.monthIndex !== state.stats.seenAnnouncement) {
    state.stats.seenAnnouncement = a.monthIndex;
    state.stats.guidebookWins += a.entries.filter((e) => e.rank === 1).length;
  }
}

/** 진행 중인 메인 목표(2개) 중 달성된 것을 처리한다 (보상 → claimed → alerts: reward + goal → index 정리). 달성한 목표 id 목록.
 *  도전 과제·월간 과제·튜토리얼도 여기서 같이 판정한다. tick(매시간·매일)과 액션 직후에 부른다. */
export function checkGoals(state: GameState): string[] {
  observeMonth(state);
  const done: string[] = [];
  for (let i = 0; i < MAX_GOALS_PER_CHECK; i++) {
    const g = activeGoals(state).find((x) => goalMet(state, x.condition));
    if (!g) break;
    state.goals.claimed.push(g.id);
    applyRewards(state, g.reward, { source: 'goal', refId: g.id, title: g.title });
    state.alerts.push({ type: 'goal', goalId: g.id });
    pushNotice(state, `목표 달성: ${g.title} — ${g.reward.map(goalRewardText).join(' · ')}`);
    done.push(g.id);
    while (state.goals.index < GOALS.length && state.goals.claimed.includes(GOALS[state.goals.index]!.id)) state.goals.index++;
  }
  checkChallenges(state);
  checkTutorial(state);
  return done;
}

export { goalDef };
