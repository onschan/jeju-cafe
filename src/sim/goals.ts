/**
 * 목표 체인 (v3 §2 → 확장 §3.5·§7): goals.json 108개. 메인 목표는 **2개 동시 진행**(index와 그 다음 안 이룬 것 둘 다 판정·표시).
 * 달성하면 applyRewards로 보상을 주고 alerts에 { type: 'reward' }(보상 상자) → { type: 'goal' }(축하 대화)를 남긴다.
 * 조건 판정은 conditionCheckers 레지스트리(타입 → { cur, max }). 다른 트랙(시설 증축·청결·자리 보너스·연수·명소 방문객·입지)이 아직 없는 조건은
 * `// TODO(x-<트랙>)` 스텁으로 { cur: 0 }을 돌려 두고 통합 때 한 줄씩 연결한다.
 * 도전 과제·월간 과제·튜토리얼 판정도 checkGoals에서 같이 돈다 (tick·액션 훅은 그대로 한 곳).
 *
 * 기능 잠금표 (state.features — 목표 보상 unlockFeature로 열린다. 열리기 전엔 해당 액션이 ok:false).
 * ease: 홍보·연구 개발·입지 보기·콤보 도감·명소 지도는 처음부터 열려 있다(튜토리얼이 순서를 안내하니 잠금이 필요 없다) — 남은 잠금은 셋뿐.
 * | feature    | 여는 목표 | 잠기는 액션                                          |
 * |------------|-----------|------------------------------------------------------|
 * | parcel     | g11       | buyParcel                                            |
 */
import type { GameState, GoalDef, GoalCondition, GoalReward, FeatureId, Action, ApplyResult, RewardSource, GoalSpeaker, Alert, PlacedObject } from './types.ts';
import { GOALS, goalDef, objectDef, menuDef, roleDef, ROLES, OBJECTS, MENUS, RECRUIT_TIERS, spotDef, guestTypeDef, guidebookDef, itemDef, ITEMS } from '../data/index.ts';
import { facilityCount, rankScore, RANK_THRESHOLDS } from './rank.ts';
import { countCategory } from './segments.ts';
import { ownedParcels } from './parcels.ts';
import { regularCount } from './interact.ts';
import { metCount } from './named.ts';
import { pushNotice, staffCapacity } from './staff.ts';
import { addTickets } from './mileage.ts';
import { MAX_BUILDERS } from './build.ts';
import { MENU_SLOT_MAX } from './state.ts'; // stakes: 메뉴판 칸 상한 6
import { fmtNum } from './format.ts';
import { josa } from './josa.ts';
import { setLevels } from './compat.ts';
import { cornersMade, cornersBuilding } from './corners.ts';
import { effectivePopularity } from './promotions.ts';
import { seatsOf } from './cafe.ts';
import { monthIndex } from './clock.ts';
import { dayIndex } from './effects.ts';
import { reachMap, busStopPos, cellKey, walkableNeighborsOf } from './path.ts';
import { checkMonthly } from './monthly.ts';
import { contestHistory, contestWins, contestBestRank } from './contest.ts'; // 대회 목표 3개
import { checkTutorial, TUTORIAL_STEPS } from './tutorial.ts';
import { hasLoan, loanRewardMult } from './failure.ts';
import { levelOf } from './upgrade.ts';
import { mainBuilding } from './rooms.ts';
import { grantItem } from './items.ts';
import { totalSpotVisitors } from './spots.ts';
import { cleanStreakDays, cleanAvgDays, dirtyForDays, CLEAN_HISTORY_DAYS, CLEAN_LOW } from './cleanliness.ts';
import { siteOf } from './site.ts';
import { routeState, routeOpened, ENTRY_ROUTES, PARKING_SLOTS, PARKING_EXPAND_FROM } from './entry.ts'; // 트랙 H
import { GRADE_NAMES } from './grade.ts'; // fun-rank: 등급 조건
import { treeOf } from './tree.ts'; // fun: 트리 단계를 Lv로
import { titleGradeOf } from './titles.ts';
import { ROUTE_IDS } from './entry.ts';
/** 경로 손님 부르는 말 (목표 문구) */
const ROUTE_GUEST_NAME: Record<string, string> = { bus: '버스', parking: '렌터카', olle: '올레꾼' };

/** 이달 재료 자급률 % = 농원 절감액(창고 재료로 만든 몫) ÷ (절감액 + 산 재료비). 아직 판 게 없으면 0. */
function selfSupplyPct(state: GameState): number {
  const saved = state.monthHarvest.ingredientSaved;
  const total = saved + state.monthCosts.ingredients;
  return total <= 0 ? 0 : Math.round((saved / total) * 100);
}

export const FEATURE_IDS: FeatureId[] = ['parcel'];
/** 액션을 잠그는 기능 (목표에서 정확히 한 번 열린다) */
export const ACTION_FEATURE_IDS: FeatureId[] = ['parcel'];
export const FEATURE_NAME: Record<FeatureId, string> = { parcel: '필지 구매' };
/** 액션 → 필요한 기능 (표는 파일 상단 주석) */
export const FEATURE_OF_ACTION: Partial<Record<Action['type'], FeatureId>> = {
  buyParcel: 'parcel',
};
/** 한 번의 checkGoals에서 연달아 처리할 최대 목표 수 (game-feel P1: 10 → 3, 나머지는 다음 시간 틱에) */
export const MAX_GOALS_PER_CHECK = 3;
/** 하루에 인정하는 메인 목표 상한 (game-feel P1: 봇이 월초에 몰아 행동해 하루 10개가 터졌다 — 넘치면 다음 날 아침부터) */
export const MAX_GOALS_PER_DAY = 3;
/** 같은 큐에 보상 상자가 이만큼 이상 쌓이면 하나로 묶는다 (「목표 3개 달성!」, 아이템 합산, 축하 대사는 마지막 하나) */
export const REWARD_BUNDLE_MIN = 3;
/** 자금 목표 마일스톤 (25·50·75%마다 응모권 1) */
export const MONEY_MILESTONES = [0.25, 0.5, 0.75];
export const MILESTONE_TICKETS = 1;
/** 메인 목표 동시 진행 수 (§7.3) */
export const CONCURRENT_GOALS = 2;
/** 진행 중 목표 뒤에서 미리 인정하는 목표 수 (claimableGoals) */
export const GOAL_LOOKAHEAD = 2;

export function initFeatures(): Record<FeatureId, boolean> {
  return { parcel: false };
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

/** 좌석 오브젝트 (guests.ts isSeat와 같은 규칙). guests.ts는 goals.ts를 import하므로 여기서 다시 쓴다. */
function seatObjectsOf(state: GameState) {
  return Object.values(state.objects).filter((o) => objectDef(o.type).kind === 'seat' || seatsOf(state, o) > 0);
}

/** 카페가 손님을 받을 수 있나 (§7.1): 정류장에서 걸어 닿는 좌석 1개 이상 + (튜토리얼 중엔) 메뉴 1개 이상. guests.ts 스폰 훅.
 *  메뉴 조건은 튜토리얼 중에만 본다 — 완성 시작 상태·기존 테스트(빈 메뉴판에 손님을 넣는다)는 그대로 돈다. */
export function canOpen(state: GameState): boolean {
  if (state.tutorial.step < TUTORIAL_STEPS && !state.menuSlots.some((m) => m !== null)) return false;
  if (!mainBuilding(state)) return false; // w-start: 맨땅(본관 없음)엔 손님이 안 온다 — 튜토리얼 2단계에서 본관을 짓는다
  const seats = seatObjectsOf(state);
  if (seats.length === 0) return false;
  const reach = reachMap(state, busStopPos(state));
  return seats.some((s) => walkableNeighborsOf(state, s.x, s.y).some((nb) => reach.dist.has(cellKey(state, nb))));
}

/** 손님이 왜 안 오나 — 한 줄로. 빈 마당에서 시작하므로 「무엇부터 해야 하나」의 답이 화면에 있어야 한다.
 *  손님이 올 수 있으면 null. */
export function openBlocker(state: GameState): string | null {
  if (!mainBuilding(state)) return '본관이 없어요 — 짓기에서 카페 본관부터';
  const seats = seatObjectsOf(state);
  if (seats.length === 0) return '앉을 자리가 없어요 — 짓기 ▸ 자리에서 테이블을 놓아 보세요';
  if (!state.menuSlots.some((m) => m !== null)) return '메뉴판이 비었어요 — 카페 ▸ 메뉴에서 올려 보세요';
  const reach = reachMap(state, busStopPos(state));
  const ok = seats.some((s) => walkableNeighborsOf(state, s.x, s.y).some((nb) => reach.dist.has(cellKey(state, nb))));
  if (!ok) return '정류장에서 자리까지 길이 안 이어졌어요 — 올렛길을 끌어서 깔아 보세요';
  return null;
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
  facilities: (s, c) => n(c.category ? countCategory(s, c.category, true) : facilityCount(s, true), c.n), // 보상은 완공 기준 (진행 표시는 buildingNote가 「짓는 중 n」으로 따로 알린다)
  satisfied: (s, c) => n(s.stats.satisfiedTotal, c.n),
  parcels: (s, c) => n(ownedParcels(s).length, c.n),
  rank: (s, c) => flag(bestRank(s) <= c.n),
  // 용어 정리(quick): 랭크(1~10) 숫자는 플레이어에게 안 보인다 — 진행 막대도 랭크가 아니라
  // 「알려진 정도」 점수(누적 손님·시설·손님층)로 보여 준다. 달성 판정은 그대로 랭크다.
  cafeRank: (s, c) => { const need = RANK_THRESHOLDS[c.n - 1] ?? 0; return s.rank >= c.n ? n(need, need) : n(Math.min(rankScore(s), need), need); },
  stars: (s, c) => n(s.star, c.n),
  regular: (s, c) => n(regularCount(s), c.n),
  research: (s, c) => n(s.research, c.n),
  namedGuest: (s, c) => n(metCount(s), c.n),
  menus: (s, c) => n(s.menuSlots.filter((m) => m !== null).length, c.n),
  recipes: (s, c) => n(s.stats.recipesMade, c.n),
  promotions: (s, c) => n(s.stats.promotionsDone, c.n),
  year: (s, c) => n(s.clock.year, c.n),
  // ---- §3.5 신설 ----
  monthIncome: (s, c) => n(s.lastMonthIncome, c.n),
  staffLevel: (s, c) => n(s.staff.filter((st) => st.level >= c.lv).length, c.n),
  trainings: (s, c) => n(s.stats.trainings, c.n), // x-staff가 stats.trainings를 올린다
  facilityLv: (s, c) => n(Object.values(s.objects).filter((o) => !o.build && goalLevelOf(o) >= c.lv).length, c.n), // 트랙 A 증축 Lv · fun 트리 단계(파라솔 = Lv2, 테라스 = Lv3)도 센다
  setCount: (s, c) => n(activeSetIds(s).size, c.n),
  spotLevel: (s, c) => n(s.spots[c.spotId] ?? 0, c.lv),
  spotAny: (s, c) => n(Object.values(s.spots).filter((lv) => lv >= c.lv).length, c.n),
  visitorsTotal: (s, c) => n(totalSpotVisitors(s), c.n), // 트랙 C 명소 누적 방문객
  guestType: (s, c) => n(Math.max(0, Math.round(effectivePopularity(s, c.guestId))), c.n),
  guidebookRank: (s, c) => flag(bestRank(s, c.bookId) <= c.n),
  guidebookWins: (s, c) => n(s.stats.guidebookWins, c.n),
  cleanliness: (s, c) => n(cleanStreakDays(s, c.n), CLEAN_HISTORY_DAYS), // 트랙 A: 청결 ≥ n 연속 30일
  profitMonths: (s, c) => n(s.stats.profitMonths, c.n),
  itemsUsed: (s, c) => n(s.stats.itemsUsed, c.n),
  uniforms: (s, c) => n(s.uniforms.length, c.n),
  custom: (s, c) => flag(customMet(s, c.id)),
  // ---- §7.5 전략 조건 ----
  siteSeats: (s, c) => n(seatObjectsOf(s).filter((o) => siteOf(s, o.x, o.y).view >= c.view).length, c.n), // 자리 전망
  corners: (s, c) => n(cornersMade(s), c.n), // fun-corner: 만든 명당 수 (도감)
  hiddenRecipes: (s, c) => n(s.codex.recipes.length, c.n), // 도감에 오른 숨은 레시피 수
  upgraded: (s, c) => n(Object.values(s.objects).filter((o) => !o.build && goalLevelOf(o) >= c.lv).length, c.n), // 트랙 A 증축 · fun 트리 단계
  clean: (s, c) => flag(cleanAvgDays(s, c.days) >= c.avg), // 트랙 A: 최근 days일 평균 청결 ≥ avg
  skills: (s, c) => n(s.staff.filter((st) => hasSkill(st.skill)).length, c.n),
  selfSupply: (s, c) => n(selfSupplyPct(s), c.pct), // 이달 재료 자급률 = 농원 절감액 ÷ (절감액 + 재료비)
  training: (s, c) => n(s.stats.trainings, c.n),
  // ---- 도전·월간 ----
  seats: (s, c) => n(seatObjectsOf(s).filter((o) => !o.build).length, c.n), // 보상은 완공 기준
  noLossMonth: (s, c) => n(s.stats.profitMonths, c.n),
  monthGuests: (s, c) => n(s.monthGuests, c.n),
  monthSales: (s, c) => n(s.monthIncome, c.n),
  // ---- 트랙 H 유입 경로 ----
  routeGuests: (s, c) => n(routeState(s, c.route).totalGuests, c.n),
  routeUnlocked: (s, c) => flag(routeOpened(s, c.route)),
  facility: (s, c) => flag(Object.values(s.objects).some((o) => !o.build && (o.type === c.id || (c.id === PARKING_EXPAND_FROM && PARKING_SLOTS[o.type] !== undefined)))), // 주차장은 넓힌 것도 친다
  // ---- fun-rank 눈에 보이는 성장 (grade.ts) ----
  grade: (s, c) => n(s.grade ?? 1, c.n),
  regulars: (s, c) => n(s.regulars?.length ?? 0, c.n), // 트랙 G 단골 등록 손님 수(state.regulars)
  reputation: (s, c) => n(Math.round(s.reputation), c.n),
  legendStaff: (s, c) => n(s.staff.filter((st) => titleGradeOf(st.title) === 'legend').length, c.n),
  routesOpen: (s, c) => n(ROUTE_IDS.filter((r) => r !== 'bus' && routeOpened(s, r)).length, c.n),
  // ---- 카이로 방향: 중반 해금을 돈이 아니라 **배치 실력**에 건다 — 손님이 자기 취향 자리에 앉은 누적 수 ----
  fitGuests: (s, c) => n(s.stats.fitGuests ?? 0, c.n),
};

/** 목표용 시설 단계: 증축 Lv와 업그레이드 트리 단계(index+1) 중 큰 것 (fun: 트리 시설은 증축 대신 트리로 올린다) */
function goalLevelOf(o: PlacedObject): number {
  return Math.max(levelOf(o), (treeOf(o.type)?.index ?? 0) + 1);
}

/** 코드 판정 조건의 조건 문구 (목표 창·잠김 토스트) */
export const CUSTOM_TEXT: Record<string, string> = {
  contestEntered: '대회 한 번 나가기',
  contestTop3: '대회 3위 안',
  contestWin: '대회 우승',
};

/** 코드 판정 조건 */
export function customMet(state: GameState, id: string): boolean {
  switch (id) {
    case 'contestEntered': return contestHistory(state).length > 0 || !!state.contest?.entry; // 대회: 접수만 해도 「나가 봤다」
    case 'contestTop3': return (contestBestRank(state) ?? 9) <= 3;
    case 'contestWin': return contestWins(state) > 0;
    case 'dirty30': return dirtyForDays(state, CLEAN_LOW, CLEAN_HISTORY_DAYS); // 트랙 A: 청결 < 50 상태 30일 (§4.3 악플 이벤트 조건)
    case 'noParking': return !Object.values(state.objects).some((o) => PARKING_SLOTS[o.type] !== undefined); // 렌터카 대란 (§4.5) — 트랙 H 주차장 4종 전부
    default: return false;
  }
}

/** 진행 표시에 붙이는 「짓는 중 n」 — 공사 중이라 아직 안 센 것. 보상은 완공 기준이지만 안내가 같은 말을 되풀이하지 않게 한 칸 붙인다. 없으면 ''. */
export function buildingNote(state: GameState, c: GoalCondition): string {
  let n = 0;
  if (c.type === 'corners') n = cornersBuilding(state);
  else if (c.type === 'seats') n = seatObjectsOf(state).filter((o) => o.build).length;
  else if (c.type === 'facilities') n = c.category ? countCategory(state, c.category) - countCategory(state, c.category, true) : facilityCount(state) - facilityCount(state, true);
  return n > 0 ? `짓는 중 ${n}` : '';
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
/** 판정 대상 = 진행 중 2개 + 그 뒤 GOAL_LOOKAHEAD개 (안 이룬 것). 앞의 목표가 막혀 있어도 뒤에서 이미 이룬 목표는 그 자리에서 인정해
 *  「막힌 목표 하나 뒤에 10개가 몰아 터지는」 정체를 막는다 (game-feel 감사: 봇 3년에서 목표 63개 중 40개가 4일에 몰렸다). 목표 줄·창은 activeGoals(2개)만 보여 준다. */
export function claimableGoals(state: GameState): GoalDef[] {
  const out: GoalDef[] = [];
  for (let i = state.goals.index; i < GOALS.length && out.length < CONCURRENT_GOALS + GOAL_LOOKAHEAD; i++) {
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
    case 'cafeRank': return `알려진 정도 ${RANK_THRESHOLDS[c.n - 1] ?? 0}`;
    case 'stars': return `★${c.n}`;
    case 'regular': return `단골 ${c.n}명`;
    case 'research': return `연구 ${c.n}`;
    case 'namedGuest': return `특별 손님 ${c.n}명`;
    case 'menus': return `메뉴 ${c.n}개 올리기`;
    case 'recipes': return `레시피 ${c.n}개 개발`;
    case 'promotions': return `홍보 ${c.n}회`;
    case 'year': return `${c.n}년차`;
    case 'monthIncome': return `월 매출 ₩${fmtNum(c.n)}`;
    case 'staffLevel': return `Lv${c.lv} 직원 ${c.n}명`;
    case 'trainings': case 'training': return `연수 ${c.n}회`;
    case 'facilityLv': case 'upgraded': return `Lv${c.lv}(${c.lv}단계) 시설 ${c.n}개`;
    case 'setCount': return `세트 효과 ${c.n}개`;
    case 'hiddenRecipes': return `숨은 레시피 ${c.n}개`;
    case 'spotLevel': return `${name.spot(c.spotId)} Lv${c.lv}`;
    case 'spotAny': return `Lv${c.lv} 명소 ${c.n}곳`;
    case 'visitorsTotal': return `명소 방문객 ${fmtNum(c.n)}명`;
    case 'guestType': return `${name.guest(c.guestId)} 인지도 ${c.n}`;
    case 'guidebookRank': return `${name.book(c.bookId)} ${c.n}위 안`;
    case 'guidebookWins': return `가이드북 1위 ${c.n}회`;
    case 'cleanliness': return `청결 ${c.n} 한 달 유지`;
    case 'profitMonths': return `${c.n}개월 연속 흑자`;
    case 'itemsUsed': return `강화 아이템 ${c.n}개 사용`;
    case 'uniforms': return `유니폼 ${c.n}단계`;
    case 'custom': return CUSTOM_TEXT[c.id] ?? '특별 조건';
    case 'siteSeats': return `전망 ${c.view} 이상 좌석 ${c.n}개`;
    case 'corners': return `명당 ${c.n}개`;
    case 'clean': return `청결 ${c.avg} 이상 ${c.days}일`;
    case 'skills': return `특기 직원 ${c.n}명`;
    case 'selfSupply': return `재료 자급률 ${c.pct}%`;
    case 'seats': return `좌석 시설 ${c.n}개`;
    case 'noLossMonth': return `적자 없이 ${c.n}달`;
    case 'monthGuests': return `이달 손님 ${fmtNum(c.n)}명`;
    case 'monthSales': return `이달 매출 ₩${fmtNum(c.n)}`;
    case 'routeGuests': return `${ROUTE_GUEST_NAME[c.route] ?? '경로'} 손님 ${fmtNum(c.n)}명`;
    case 'routeUnlocked': return `${ENTRY_ROUTES[c.route]?.name ?? '경로'} 열기`;
    case 'facility': return `${name.object(c.id)} 짓기`;
    // ---- fun-rank ----
    case 'grade': return `등급 「${GRADE_NAMES[c.n - 1] ?? c.n}」`;
    case 'regulars': return `단골 ${c.n}명`;
    case 'reputation': return `평판 ${c.n}`;
    case 'legendStaff': return c.n === 1 ? '전설 직원 채용' : `전설 직원 ${c.n}명`;
    case 'routesOpen': return `손님 오는 길 ${c.n}종`;
    case 'fitGuests': return `손님 ${c.n}명을 취향 자리에`;
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
    case 'menuSlot': return `메뉴판 칸 +${r.n}`;
    case 'staffCap': return `직원 정원 +${r.n}`;
    case 'jobTier': return `채용 ${recruitTierName(r.id)}`;
  }
}

/** 채용 방법 한글 이름 (id가 화면에 새지 않게) */
function recruitTierName(id: string): string {
  return RECRUIT_TIERS.find((t) => t.id === id)?.name ?? id;
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

// ---------- 보상 지급 (목표/월간 과제/튜토리얼 공용) ----------

/** 삼춘 대출 중인가 (§4.4 — 트랙 E failure.ts의 state.loan.balance) */
export function underLoan(state: GameState): boolean {
  return hasLoan(state);
}

/** 대출 중 감액을 적용한 보상 (§3.5 실패·지연 규칙): money·tickets·mileage × loanRewardMult(0.5, 내림) */
export function scaleReward(state: GameState, r: GoalReward): GoalReward {
  const mult = loanRewardMult(state);
  if (mult >= 1) return r;
  if (r.type === 'money') return { ...r, amount: Math.floor(r.amount * mult) };
  if (r.type === 'tickets') return { ...r, n: Math.floor(r.n * mult) };
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
      break;
    case 'tickets': state.tickets += r.n; break;
    case 'staffSlot': state.slots[r.role] = (state.slots[r.role] ?? 0) + r.n; break;
    case 'research': state.research += r.n; break;
    case 'builder': state.builders = Math.min(MAX_BUILDERS, state.builders + r.n); break;
    case 'unlockFeature': state.features[r.id] = true; pushNotice(state, `${josa(FEATURE_NAME[r.id], '이/가')} 열렸어요`); break;
    case 'item': grantItem(state, r.id, r.n); break; // items.ts (없는 id면 throw — validate:goals가 미리 잡는다)
    case 'seed': state.inventory[r.kind] = (state.inventory[r.kind] ?? 0) + r.n; break;
    case 'unlockGuest': {
      const st = (state.guestTypes[r.id] ??= { unlocked: false, satisfaction: 0, regular: 'none', questDone: false });
      if (!st.unlocked) { st.unlocked = true; pushNotice(state, `새 손님: ${name.guest(r.id)}`); }
      break;
    }
    case 'unlockRecruit': state.freeRecruits += 1; break; // 채용 5단계 해금은 트랙 D recruit_tiers.json의 ★·랭크 조건이 맡고, 보상은 스카우트권(다음 채용 무료) 1장
    case 'unlockGuidebook': {
      const g = (state.guidebooks[r.id] ??= { unlocked: false, lastRank: null, best: null, boost: 0, pending: 0 });
      if (!g.unlocked) { g.unlocked = true; pushNotice(state, `가이드북 ${josa(name.book(r.id), '이/가')} 열렸어요`); }
      break;
    }
    case 'title': if (!state.titles.includes(r.id)) { state.titles.push(r.id); pushNotice(state, `칭호 「${r.name}」`); } break;
    case 'feeBonus': state.feeBonusPct += r.pct; break;
    case 'menuSlot': { // stakes: 메뉴판 칸 +n (최대 menuSlotMax)
      const max = state.menuSlotMax ?? MENU_SLOT_MAX;
      const add = Math.max(0, Math.min(r.n, max - state.menuSlots.length));
      for (let i = 0; i < add; i++) state.menuSlots.push(null);
      if (add > 0) pushNotice(state, `메뉴판 칸이 ${state.menuSlots.length}개가 됐어요`);
      break;
    }
    case 'staffCap': { // midgame: 전체 직원 정원 +n (휴게실 없이도 한 명 더)
      state.staffCapBonus = (state.staffCapBonus ?? 0) + r.n;
      pushNotice(state, `직원 정원이 ${staffCapacity(state)}명이 됐어요`);
      break;
    }
    case 'jobTier': { // midgame: 채용 방법 해금
      const list = (state.unlocked.recruits ??= []);
      if (!list.includes(r.id)) { list.push(r.id); pushNotice(state, `새 채용 방법: ${recruitTierName(r.id)}`); }
      break;
    }
  }
}

/** 보상 묶음을 한 곳에서 지급하고 보상 상자 알림을 남긴다 (목표·도전·월간·튜토리얼 공용). 실제 지급된(감액 반영) 보상 목록. */
export function applyRewards(state: GameState, rewards: GoalReward[], meta: { source: RewardSource; refId: string; title: string; line?: string; speaker?: GoalSpeaker }): GoalReward[] {
  const items = rewards.map((r) => scaleReward(state, r));
  for (const r of items) grantReward(state, r);
  state.alerts.push({ type: 'reward', source: meta.source, refId: meta.refId, title: meta.title, items, line: meta.line, speaker: meta.speaker });
  return items;
}

/** 같은 종류의 보상(돈·응모권·마일리지·연구)은 합치고 나머지는 이어 붙인다 */
export function mergeRewardItems(lists: GoalReward[][]): GoalReward[] {
  const out: GoalReward[] = [];
  const sum: Partial<Record<'money' | 'tickets' | 'research', number>> = {};
  for (const items of lists) for (const r of items) {
    if (r.type === 'money') sum.money = (sum.money ?? 0) + r.amount;
    else if (r.type === 'tickets' || r.type === 'research') sum[r.type] = (sum[r.type] ?? 0) + r.n;
    else out.push(r);
  }
  const head: GoalReward[] = [];
  if (sum.money) head.push({ type: 'money', amount: sum.money });
  if (sum.tickets) head.push({ type: 'tickets', n: sum.tickets });
  if (sum.research) head.push({ type: 'research', n: sum.research });
  return [...head, ...out];
}

/** 아직 안 본 큐(state.alerts)에 보상 상자가 REWARD_BUNDLE_MIN개 이상 쌓였으면 첫 상자 자리에 하나로 묶는다 (game-feel P1: 4월 1일 팝업 9연속·3월 큐 11개).
 *  제목은 「목표 n개 달성!」(전부 목표) / 「보상 n개!」, 아이템은 합산, 축하 대사(line·speaker)는 마지막 상자 것만. 목표 축하 대화({ type: 'goal' })도 마지막 하나만 남긴다.
 *  결정적·멱등: 이미 묶인 상자(count)도 다시 셀 수 있다. 엔딩·이벤트 등 다른 알림은 순서를 지킨다. */
export function coalesceRewardAlerts(state: GameState): void {
  const rewards = state.alerts.filter((a): a is Extract<Alert, { type: 'reward' }> => a.type === 'reward' && a.source !== 'tutorial'); // 튜토리얼 상자는 단계마다 하나씩 (대사 게이트)
  const total = rewards.reduce((n, a) => n + (a.count ?? 1), 0);
  if (rewards.length < REWARD_BUNDLE_MIN) return;
  const goalIds = state.alerts.filter((a): a is Extract<Alert, { type: 'goal' }> => a.type === 'goal').map((a) => a.goalId);
  const allGoals = rewards.every((a) => a.source === 'goal' || a.source === 'bundle');
  const last = rewards[rewards.length - 1]!;
  const bundle: Alert = {
    type: 'reward', source: 'bundle', refId: rewards.map((a) => a.refId).join(','), count: total,
    title: allGoals ? `목표 ${total}개 달성!` : `보상 ${total}개!`,
    items: mergeRewardItems(rewards.map((a) => a.items)), line: last.line, speaker: last.speaker,
  };
  const first = state.alerts.indexOf(rewards[0]!);
  const lastGoal = goalIds[goalIds.length - 1];
  const keep = (a: Alert) => (a.type !== 'reward' || a.source === 'tutorial') && (a.type !== 'goal' || a.goalId === lastGoal);
  const kept = state.alerts.filter(keep);
  const at = state.alerts.slice(0, first).filter(keep).length;
  kept.splice(at, 0, bundle);
  state.alerts.splice(0, state.alerts.length, ...kept);
}

/** 자금 목표의 25·50·75% 마일스톤: 처음 넘는 단계마다 응모권 1장 + 메시지 줄 (goals.milestones에 단계 기록 → GoalBar가 반짝인다). 새로 넘은 단계 목록. */
export function checkMoneyMilestones(state: GameState): { goalId: string; stage: number }[] {
  const out: { goalId: string; stage: number }[] = [];
  for (const g of activeGoals(state)) {
    if (g.condition.type !== 'money') continue;
    const ms = (state.goals.milestones ??= {});
    const pct = state.money / g.condition.n;
    let stage = ms[g.id] ?? 0;
    while (stage < MONEY_MILESTONES.length && pct >= MONEY_MILESTONES[stage]!) {
      stage++;
      ms[g.id] = stage;
      state.tickets += MILESTONE_TICKETS;
      pushNotice(state, `「${g.title}」 ${Math.round(MONEY_MILESTONES[stage - 1]! * 100)}% 달성 — 응모권 ${MILESTONE_TICKETS}장!`);
      out.push({ goalId: g.id, stage });
    }
  }
  return out;
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
  const today = dayIndex(state.clock);
  if (state.goals.day !== today) { state.goals.day = today; state.goals.dayCount = 0; }
  for (let i = 0; i < MAX_GOALS_PER_CHECK && (state.goals.dayCount ?? 0) < MAX_GOALS_PER_DAY; i++) {
    const g = claimableGoals(state).find((x) => goalMet(state, x.condition));
    if (!g) break;
    state.goals.claimed.push(g.id);
    state.goals.dayCount = (state.goals.dayCount ?? 0) + 1;
    applyRewards(state, g.reward, { source: 'goal', refId: g.id, title: g.title });
    state.alerts.push({ type: 'goal', goalId: g.id });
    pushNotice(state, `목표 달성: ${g.title} — ${g.reward.map(goalRewardText).join(' · ')}`);
    done.push(g.id);
    while (state.goals.index < GOALS.length && state.goals.claimed.includes(GOALS[state.goals.index]!.id)) state.goals.index++;
  }
  checkMoneyMilestones(state);
  checkMonthly(state);
  checkTutorial(state);
  coalesceRewardAlerts(state); // 이번 판정(목표·도전·월간·튜토리얼·해금·승급)으로 쌓인 상자가 3개 이상이면 하나로
  return done;
}

export { goalDef };
