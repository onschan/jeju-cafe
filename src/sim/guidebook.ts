/**
 * ★ 등급·가이드북 11종 (2B-2 Task 7, 마스터 GDD §7, 확장 스펙 §3.7)
 * - ★1~5: ranks.json 조건 문구를 해석해 월초에 검사. 승급 → 알림·장면·시설 해금.
 *   유지 심사(§3.7.4): ★3 이상은 승급 2년 뒤부터 2년마다 3월에 조건을 다시 본다. 미달이면 경고 → 9월에도 미달이면 ★ −1 (rank_shield 1회 면제).
 * - 가이드북: 해금 조건(unlockCondMet) → 3월·9월 발표(월간 추천은 매월). 심사 항목 9종(미소·경관·메뉴·체험·단체·쉼·청결·가성비·종합)을
 *   상태에서 계산해 가중 합(guidebooks.json weights) → 경쟁 카페 9곳(§3.7.3 성장 곡선 top_b(y) − 6(i−1) ± 4, seed 결정적)과 비교해 순위 → 1위 상금·연구·씨앗·마일리지.
 *   플레이어가 1위 하면 그 가이드북 라이벌은 다음 해 +3(boost), 라이벌 카페 등장 중이면 +5.
 */
import type { GameState, GuidebookDef, GuidebookState, JudgeKey, JudgeScores, Announcement, AnnouncementEntry, GuestTags } from './types.ts';
import { cleanJudgePenalty } from './cleanliness.ts';
import { GUIDEBOOKS, STARS, GUEST_TYPES, COMBOS, SETS, HIDDEN_RECIPES, INGREDIENT_COMBOS, objectDef, guestTags, statSum } from '../data/index.ts';
import { staffInRole, energyFactor, pushNotice } from './staff.ts';
import { sceneryScore } from './grid.ts';
import { isSeat, seatsOf, cafeLevel } from './cafe.ts';
import { menuStatsOf, priceOf } from './craft.ts';
import { objectStats } from './compat.ts';
import { unlockCondMet, evaluateUnlocks, unlockedTypeIds, walletOf } from './segments.ts';
import { grantItem } from './items.ts';
import { addMileage, codexCount } from './mileage.ts';
import { effectivePopularity } from './promotions.ts';
import { monthIndex } from './clock.ts';
import { parcelAt } from './parcels.ts';
import { pushFx } from './fx.ts';
import { fmtNum } from './format.ts';
import { reputationScore } from './reputation.ts';

export const MAX_STAR = 5;
export const JUDGE_KEYS: JudgeKey[] = ['smile', 'scenery', 'menu', 'fun', 'group', 'rest', 'clean', 'price', 'reputation', 'overall'];
export const JUDGE_LABEL: Record<JudgeKey, string> = { smile: '미소', scenery: '경관', menu: '메뉴', fun: '체험', group: '단체', rest: '쉼', clean: '청결', price: '가성비', reputation: '평판', overall: '종합' };
/** 종합 = 8항목(평판 제외) 평균 + 카페 랭크 × 3 + 콤보 수 × 1 */
export const OVERALL_PER_RANK = 3;
export const OVERALL_PER_COMBO = 1;
/** 라이벌 곡선: i번째(0~8) 라이벌 = top − 6i ± 4 */
export const RIVAL_STEP = 6;
export const RIVAL_NOISE = 4;
/** 플레이어 1위 → 다음 해 라이벌 +3, 라이벌 카페 등장 중 +5 */
export const RIVAL_WIN_BOOST = 3;
export const RIVAL_CAFE_BOOST = 5;
/** ★ 유지 심사: ★3 이상, 승급 2년 뒤부터 2년마다 3월, 9월 재심사 */
export const REVIEW_MIN_STAR = 3;
export const REVIEW_EVERY_YEARS = 2;
export const REVIEW_MONTH = 3;
export const REVIEW_RETRY_MONTH = 9;
export const RANK_SHIELD_ITEM = 'rank_shield';
/** 발표 달 (연 2회) */
export const ANNOUNCE_MONTHS = [3, 9];
export const RIVAL_COUNT = 9;
/** 순위별 보상 비율 (1위 100%, 2위 30%, 3위 10%) · 마일리지 3/2/1 (medal_sources 연말 랭킹) */
export const PRIZE_RATIO = [1, 0.3, 0.1];
export const RANK_MILEAGE = [3, 2, 1];
/** 월간 추천의 타깃 손님층 태그 (monthIndex로 돌아간다) */
export const MONTHLY_TAGS: { key: string; label: string; match: (t: GuestTags) => boolean }[] = [
  { key: 'youth', label: '청년', match: (t) => t.age === 'youth' },
  { key: 'adult', label: '성인', match: (t) => t.age === 'adult' },
  { key: 'senior', label: '시니어', match: (t) => t.age === 'senior' },
  { key: 'group', label: '단체', match: (t) => t.group },
  { key: 'female', label: '여성', match: (t) => t.gender === 'female' },
  { key: 'male', label: '남성', match: (t) => t.gender === 'male' },
];
const SCENERY_TO_SCORE = 100 / 30;
const NO_STAFF_SMILE = 5;

// ---------- ★ 조건 ----------

/** 도감 항목 총수 (상성·세트·히든 레시피·재료 콤보) */
export function codexTotal(): number {
  return COMBOS.length + SETS.length + HIDDEN_RECIPES.length + INGREDIENT_COMBOS.length;
}

/** ranks.json 조건 문구 하나를 판정한다. 모르는 문구는 false (조용히 승급되지 않게). */
export function starConditionMet(state: GameState, text: string): boolean {
  let m: RegExpExecArray | null;
  const num = (s: string) => Number(s.replace(/,/g, ''));
  if ((m = /^월 매출 ([\d,]+)$/.exec(text))) return state.lastMonthIncome >= num(m[1]!);
  if ((m = /^메뉴 (\d+)$/.exec(text))) return state.unlocked.menus.length >= num(m[1]!);
  if ((m = /^직원 (\d+)$/.exec(text))) return state.staff.length >= num(m[1]!);
  if ((m = /^손님층 (\d+) 만족 (\d+)$/.exec(text))) {
    const need = num(m[2]!);
    return Object.values(state.guestTypes).filter((t) => t.unlocked && t.satisfaction >= need).length >= num(m[1]!);
  }
  if ((m = /^시그니처 (\d+)$/.exec(text))) return state.customMenus.filter((d) => d.category === 'signature').length >= num(m[1]!);
  if ((m = /^랜드마크 (\d+)$/.exec(text))) return Object.values(state.objects).filter((o) => objectDef(o.type).kind === 'landmark').length >= num(m[1]!);
  if (/^랭킹 1위$/.test(text)) return Object.values(state.guidebooks).some((g) => g.best === 1);
  if ((m = /^도감 (\d+)%$/.exec(text))) return codexCount(state) * 100 >= codexTotal() * num(m[1]!);
  if ((m = /^정착 등급 (\d+)$/.exec(text))) return cafeLevel(state) >= Math.min(5, num(m[1]!)); // 정착 심사 미구현 — 카페 레벨(누적 매출)로 대신
  return false;
}

/** 다음 ★의 조건과 충족 여부 (최고면 null) */
export function nextStarConditions(state: GameState): { star: number; conditions: { text: string; met: boolean }[]; unlockText: string } | null {
  if (state.star >= MAX_STAR) return null;
  const def = STARS.find((s) => s.star === state.star + 1);
  if (!def) return null;
  return { star: def.star, conditions: def.conditions.map((text) => ({ text, met: starConditionMet(state, text) })), unlockText: def.unlockText };
}

/** 월초: 다음 ★ 조건을 모두 채웠으면 승급 (한 달에 한 단계). 승급했으면 새 ★. */
export function checkStar(state: GameState): number | null {
  const next = nextStarConditions(state);
  if (!next || !next.conditions.every((c) => c.met)) return null;
  state.star = next.star;
  state.starReview.promotedYear = state.clock.year;
  state.starReview.warned = false;
  pushNotice(state, `★${next.star} 승급! ${next.unlockText}`);
  pushFx(state, { kind: 'scene', title: `★${next.star} 승급`, text: `우리 카페가 ★${next.star}이 됐어요! ${next.unlockText}`, tick: state.tick });
  evaluateUnlocks(state);
  evaluateGuidebooks(state);
  return next.star;
}

/** 현재 ★의 조건(ranks.json)을 지금도 채우고 있나 (★1은 항상 true) */
export function starConditionsHeld(state: GameState, star = state.star): boolean {
  const def = STARS.find((s) => s.star === star);
  return !def || def.conditions.every((c) => starConditionMet(state, c));
}
/** 유지 심사가 도는 달인가: ★3 이상, 승급 +2년부터, 마지막 심사 +2년, 3월 */
export function isReviewDue(state: GameState): boolean {
  const r = state.starReview;
  const y = state.clock.year;
  return state.star >= REVIEW_MIN_STAR && state.clock.month === REVIEW_MONTH && y >= r.promotedYear + REVIEW_EVERY_YEARS && y >= r.lastReviewYear + REVIEW_EVERY_YEARS;
}
/** ★ 유지 심사 (§3.7.4). 3월: 미달이면 경고(6개월 유예). 9월: 여전히 미달이면 ★ −1 (rank_shield 있으면 1회 면제). 강등했으면 새 ★, 아니면 null. */
export function starReview(state: GameState): number | null {
  const r = state.starReview;
  if (isReviewDue(state)) {
    r.lastReviewYear = state.clock.year;
    if (!starConditionsHeld(state)) {
      r.warned = true;
      pushNotice(state, `★${state.star} 유지 심사 경고 — 9월까지 조건을 다시 채우지 못하면 ★이 내려가요`);
      pushFx(state, { kind: 'scene', title: '★ 유지 심사', text: `★${state.star} 조건에 미달이에요. 9월 재심사까지 6개월 유예예요.`, tick: state.tick });
    }
    return null;
  }
  if (!r.warned || state.clock.month !== REVIEW_RETRY_MONTH) return null;
  r.warned = false;
  if (starConditionsHeld(state)) { pushNotice(state, `★${state.star} 유지 심사 통과!`); return null; }
  if ((state.inventory[RANK_SHIELD_ITEM] ?? 0) > 0) {
    state.inventory[RANK_SHIELD_ITEM]!--;
    pushNotice(state, `등급 보호 아이템으로 ★${state.star} 강등을 한 번 막았어요`);
    return null;
  }
  state.star--;
  pushNotice(state, `★ 강등: ★${state.star + 1} → ★${state.star} (열린 시설은 유지, 새로 짓기만 잠겨요)`);
  pushFx(state, { kind: 'scene', title: '★ 강등', text: `유지 심사에서 떨어져 ★${state.star}이 됐어요. 조건을 다시 채우면 올라갈 수 있어요.`, tick: state.tick });
  return state.star;
}

// ---------- 심사 ----------

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** 미소: 홀 직원(없으면 배치된 직원) 서비스 평균 × 기력 계수 */
function smileScore(state: GameState): number {
  const hall = staffInRole(state, 'hall');
  const pool = hall.length ? hall : state.staff.filter((s) => s.role !== null);
  if (pool.length === 0) return NO_STAFF_SMILE;
  return clamp100(pool.reduce((n, s) => n + s.stats.smile * energyFactor(s), 0) / pool.length);
}
/** 경관: 좌석 자리의 경치 평균 (상한 30 → 100) */
function scenerySc(state: GameState): number {
  const seats = Object.values(state.objects).filter((o) => isSeat(state, o) && !o.build);
  if (seats.length === 0) return 0;
  return clamp100((seats.reduce((n, o) => n + sceneryScore(state, o.x, o.y), 0) / seats.length) * SCENERY_TO_SCORE);
}
/** 메뉴: 메뉴판 메뉴 스탯 합 평균 + 메뉴 수 ×5 */
function menuScore(state: GameState): number {
  const ids = state.menuSlots.filter((m): m is string => m !== null);
  if (ids.length === 0) return 0;
  const avg = ids.reduce((n, id) => n + statSum(menuStatsOf(state, id)), 0) / ids.length;
  return clamp100(avg + ids.length * 5);
}
/** 체험: 즐길거리 시설 수 ×12 + 인기 평균 */
function funScore(state: GameState): number {
  const fun = Object.values(state.objects).filter((o) => objectDef(o.type).category === 'fun' && !o.build && parcelAt(state, o.x, o.y)?.owned);
  if (fun.length === 0) return 0;
  const avgPop = fun.reduce((n, o) => n + objectStats(state, o.id).popularity, 0) / fun.length;
  return clamp100(fun.length * 12 + avgPop);
}
/** 단체: 큰 좌석(4석 이상) ×10 + 주차장 ×20 + 단체 손님층 만족 평균 ×0.3 */
function groupScore(state: GameState): number {
  const objs = Object.values(state.objects).filter((o) => !o.build);
  const big = objs.filter((o) => seatsOf(state, o) >= 4).length;
  const parking = objs.filter((o) => o.type === 'parking').length;
  const groups = GUEST_TYPES.filter((t) => t.tags.group && state.guestTypes[t.id]?.unlocked);
  const sat = groups.length ? groups.reduce((n, t) => n + (state.guestTypes[t.id]?.satisfaction ?? 0), 0) / groups.length : 0;
  return clamp100(big * 10 + parking * 20 + sat * 0.3);
}

/** 쉼: 쉼(좌석) 시설 수 ×8 + 인기 평균 + 족욕 시설 ×5 */
function restScore(state: GameState): number {
  const objs = Object.values(state.objects).filter((o) => !o.build && parcelAt(state, o.x, o.y)?.owned);
  const rest = objs.filter((o) => objectDef(o.type).category === 'rest' || isSeat(state, o));
  if (rest.length === 0) return 0;
  const avgPop = rest.reduce((n, o) => n + objectStats(state, o.id).popularity, 0) / rest.length;
  const footbath = objs.filter((o) => o.type.startsWith('footbath')).length;
  return clamp100(rest.length * 8 + avgPop + footbath * 5);
}
/** 청결: 트랙 A의 state.clean.value (30 미만이면 −10 감점) */
function cleanScore(state: GameState): number {
  return clamp100(state.clean.value + cleanJudgePenalty(state));
}
/** 가성비: 100 − (메뉴판 평균 가격 ÷ 해금 손님층 평균 소지금 × 100) */
function priceScore(state: GameState): number {
  const ids = state.menuSlots.filter((m): m is string => m !== null);
  const types = unlockedTypeIds(state);
  if (ids.length === 0 || types.length === 0) return 0;
  const avgPrice = ids.reduce((n, id) => n + priceOf(state, id), 0) / ids.length;
  const avgWallet = types.reduce((n, id) => n + walletOf(state, id), 0) / types.length;
  if (avgWallet <= 0) return 0;
  return clamp100(100 - (avgPrice / avgWallet) * 100);
}

export function judgeScores(state: GameState): JudgeScores {
  const smile = smileScore(state), scenery = scenerySc(state), menu = menuScore(state), fun = funScore(state), group = groupScore(state);
  const rest = restScore(state), clean = cleanScore(state), price = priceScore(state), reputation = reputationScore(state);
  const overall = clamp100((smile + scenery + menu + fun + group + rest + clean + price) / 8 + state.rank * OVERALL_PER_RANK + state.codex.combos.length * OVERALL_PER_COMBO);
  return { smile, scenery, menu, fun, group, rest, clean, price, reputation, overall };
}

/** 이번 달 농협 추천의 타깃 태그 (monthIndex로 돌아간다) */
export function monthlyTarget(state: GameState): (typeof MONTHLY_TAGS)[number] {
  return MONTHLY_TAGS[monthIndex(state.clock) % MONTHLY_TAGS.length]!;
}
/** 타깃 태그 손님층의 유효 인기 평균 (0~99) */
export function targetPopularity(state: GameState, match: (t: GuestTags) => boolean): number {
  const ids = GUEST_TYPES.filter((t) => state.guestTypes[t.id]?.unlocked && match(guestTags(t.id))).map((t) => t.id);
  if (ids.length === 0) return 0;
  return ids.reduce((n, id) => n + effectivePopularity(state, id), 0) / ids.length;
}

/** 월간 추천(농협)의 타깃 손님층 인기 비중 (나머지 0.4는 종합) */
export const MONTHLY_TARGET_WEIGHT = 0.6;
/** 가이드북 가중 합 0~100. 월간 추천은 종합 0.4 + 타깃 손님층 인기 0.6. */
export function guidebookScore(state: GameState, def: GuidebookDef, scores: JudgeScores = judgeScores(state)): number {
  let total = 0;
  for (const [k, w] of Object.entries(def.weights) as [JudgeKey, number][]) total += scores[k] * w;
  if (def.monthly) total += targetPopularity(state, monthlyTarget(state).match) * MONTHLY_TARGET_WEIGHT;
  return clamp100(total);
}

// ---------- 경쟁 카페 ----------

function hash32(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; }
  return h >>> 0;
}
/** 1위 라이벌 점수 top_b(y) = 1년차 값 + 증가 × (y − 1), 상한 100 (§3.7.3 표) */
export function rivalTop(def: GuidebookDef, year: number): number {
  return Math.min(100, def.rivalTop + def.rivalGrowth * (year - 1));
}
/** 경쟁 카페 9곳 점수 (내림차순). i번째 = top_b(y) + boost − 6 × i ± 4 (seed·가이드북·년차·회차 해시 노이즈). boost = 플레이어 1위 누적 +3 + 라이벌 카페 +5. */
export function rivalScores(seed: number, gbId: string, year: number, month: number, boost = 0): number[] {
  const tier = Math.max(0, GUIDEBOOKS.findIndex((g) => g.id === gbId));
  const def = GUIDEBOOKS[tier]!;
  const top = rivalTop(def, year) + boost;
  const out: number[] = [];
  for (let i = 0; i < RIVAL_COUNT; i++) {
    const h = hash32(seed, tier + 1, year, month, i + 1);
    out.push(clamp100(top - i * RIVAL_STEP + ((h % (RIVAL_NOISE * 2 + 1)) - RIVAL_NOISE)));
  }
  return out.sort((a, b) => b - a);
}
/** 이 가이드북의 라이벌 가산 (state.guidebooks boost + 라이벌 카페 등장 중 +5) */
export function rivalBoost(state: GameState, gbId: string): number {
  return guidebookState(state, gbId).boost + (state.rivals.length > 0 ? RIVAL_CAFE_BOOST : 0);
}
export function rankAmong(score: number, rivals: number[]): number {
  return 1 + rivals.filter((r) => r > score).length;
}

// ---------- 해금·발표 ----------

export function guidebookState(state: GameState, id: string): GuidebookState {
  return (state.guidebooks[id] ??= { unlocked: false, lastRank: null, best: null, boost: 0, pending: 0 });
}
export function initGuidebooks(): Record<string, GuidebookState> {
  const out: Record<string, GuidebookState> = {};
  for (const g of GUIDEBOOKS) out[g.id] = { unlocked: g.unlock.type === 'start', lastRank: null, best: null, boost: 0, pending: 0 };
  return out;
}
/** 새해 1월: 지난해 1위로 번 라이벌 가산(pending)을 boost에 더한다 */
export function rollRivalBoost(state: GameState): void {
  for (const st of Object.values(state.guidebooks)) { st.boost += st.pending; st.pending = 0; }
}
/** 잠긴 가이드북의 해금 조건을 검사. 새로 열린 id 목록. */
export function evaluateGuidebooks(state: GameState): string[] {
  const opened: string[] = [];
  for (const g of GUIDEBOOKS) {
    const st = guidebookState(state, g.id);
    if (st.unlocked || !unlockCondMet(state, g.unlock)) continue;
    st.unlocked = true;
    opened.push(g.id);
    pushNotice(state, `가이드북 등재 후보: ${g.name}`);
  }
  return opened;
}

/** 이 달에 발표할 가이드북 (해금된 것 중 3·9월 전부, 월간 추천은 매월) */
export function guidebooksToAnnounce(state: GameState, month = state.clock.month): GuidebookDef[] {
  const semi = ANNOUNCE_MONTHS.includes(month);
  return GUIDEBOOKS.filter((g) => state.guidebooks[g.id]?.unlocked && (g.monthly || semi));
}

function applyPrize(state: GameState, def: GuidebookDef, rank: number): { prize: number; research: number; mileage: number; seedText: string | null } {
  const ratio = PRIZE_RATIO[rank - 1] ?? 0;
  const prize = Math.round(def.prize * ratio);
  const research = Math.round(def.research * ratio);
  const mileage = (RANK_MILEAGE[rank - 1] ?? 0) + (rank === 1 ? def.mileage : 0);
  state.money += prize;
  state.monthIncome += prize;
  state.research += research;
  addMileage(state, mileage);
  let seedText: string | null = null;
  if (rank === 1 && def.seeds.length > 0) {
    for (const s of def.seeds) grantItem(state, s.itemId, s.count);
    seedText = def.seeds.map((s) => `${s.itemId === 'tangerine_seed' ? '감귤 씨앗' : s.itemId === 'hallabong_seed' ? '한라봉 씨앗' : s.itemId === 'scenery_seed' ? '경관 씨앗' : '인기 열매'} ${s.count}`).join(' · ');
  }
  return { prize, research, mileage, seedText };
}

/** 발표: 해당 가이드북마다 채점·순위·보상. 발표할 게 없으면 null. */
export function announce(state: GameState, defs: GuidebookDef[] = guidebooksToAnnounce(state)): Announcement | null {
  if (defs.length === 0) return null;
  const scores = judgeScores(state);
  const mi = monthIndex(state.clock);
  const starBefore = state.star;
  const entries: AnnouncementEntry[] = [];
  for (const def of defs) {
    const total = guidebookScore(state, def, scores);
    const rivals = rivalScores(state.seed, def.id, state.clock.year, state.clock.month, rivalBoost(state, def.id));
    const rank = rankAmong(total, rivals);
    const st = guidebookState(state, def.id);
    st.lastRank = rank;
    st.best = st.best === null ? rank : Math.min(st.best, rank);
    if (rank === 1) st.pending += RIVAL_WIN_BOOST;
    const r = applyPrize(state, def, rank);
    const targetText = def.monthly ? monthlyTarget(state).label : null;
    entries.push({ id: def.id, name: def.name, scores, total, rivals, rank, ...r, targetText });
    pushNotice(state, `${def.name} ${rank}위!${r.prize > 0 ? ` 상금 ₩${fmtNum(r.prize)}` : ''}`);
  }
  const winner = entries.find((e) => e.rank === 1);
  if (winner) pushFx(state, { kind: 'scene', title: '가이드북 1위', text: `${winner.name} 1위! 카페가 유명해졌어요`, tick: state.tick });
  const starAfter = checkStar(state) ?? state.star;
  const a: Announcement = { monthIndex: mi, month: state.clock.month, year: state.clock.year, entries, starBefore, starAfter };
  state.lastAnnouncement = a;
  return a;
}

/** 월초 (정산·해금 뒤): (1월) 라이벌 가산 반영 → ★ 유지 심사 → ★ 승급 검사 → 가이드북 해금 → 발표 */
export function monthlyRank(state: GameState): void {
  if (state.clock.month === 1) rollRivalBoost(state);
  starReview(state);
  checkStar(state);
  evaluateGuidebooks(state);
  announce(state);
}

