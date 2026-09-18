/**
 * ★ 등급·가이드북 11종 (2B-2 Task 7, 마스터 GDD §7)
 * - ★1~5: ranks.json 조건 문구를 해석해 월초에 검사. 승급 → 알림·장면·시설 해금.
 * - 가이드북: 해금 조건(unlockCondMet) → 3월·9월 발표(월간 추천은 매월). 심사 항목 6종(미소·경관·메뉴·체험·단체·종합)을
 *   상태에서 계산해 가중 합 → 경쟁 카페 9곳(seed·년차·가이드북별 결정적)과 비교해 순위 → 1위 상금·연구·씨앗·마일리지.
 */
import type { GameState, GuidebookDef, GuidebookState, JudgeKey, JudgeScores, Announcement, AnnouncementEntry, GuestTags } from './types.ts';
import { GUIDEBOOKS, STARS, GUEST_TYPES, COMBOS, SETS, HIDDEN_RECIPES, INGREDIENT_COMBOS, objectDef, guestTags, statSum } from '../data/index.ts';
import { staffInRole, energyFactor, pushNotice } from './staff.ts';
import { sceneryScore } from './grid.ts';
import { isSeat, seatsOf, cafeLevel } from './cafe.ts';
import { menuStatsOf } from './craft.ts';
import { objectStats } from './compat.ts';
import { unlockCondMet, evaluateUnlocks } from './segments.ts';
import { grantItem } from './items.ts';
import { addMileage, codexCount } from './mileage.ts';
import { effectivePopularity } from './promotions.ts';
import { monthIndex } from './clock.ts';
import { parcelAt } from './parcels.ts';
import { pushFx } from './fx.ts';
import { fmtNum } from './format.ts';

export const MAX_STAR = 5;
export const JUDGE_KEYS: JudgeKey[] = ['smile', 'scenery', 'menu', 'fun', 'group', 'overall'];
export const JUDGE_LABEL: Record<JudgeKey, string> = { smile: '미소', scenery: '경관', menu: '메뉴', fun: '체험', group: '단체', overall: '종합' };
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
  pushNotice(state, `★${next.star} 승급! ${next.unlockText}`);
  pushFx(state, { kind: 'scene', title: `★${next.star} 승급`, text: `우리 카페가 ★${next.star}이 됐어요! ${next.unlockText}`, tick: state.tick });
  evaluateUnlocks(state);
  evaluateGuidebooks(state);
  return next.star;
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

export function judgeScores(state: GameState): JudgeScores {
  const smile = smileScore(state), scenery = scenerySc(state), menu = menuScore(state), fun = funScore(state), group = groupScore(state);
  const overall = clamp100((smile + scenery + menu + fun + group) / 5);
  return { smile, scenery, menu, fun, group, overall };
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

/** 가이드북 가중 합 0~100. 월간 추천은 종합 0.5 + 타깃 손님층 인기 0.5. */
export function guidebookScore(state: GameState, def: GuidebookDef, scores: JudgeScores = judgeScores(state)): number {
  let total = 0;
  for (const [k, w] of Object.entries(def.weights) as [JudgeKey, number][]) total += scores[k] * w;
  if (def.monthly) total += targetPopularity(state, monthlyTarget(state).match) * 0.5;
  return clamp100(total);
}

// ---------- 경쟁 카페 ----------

function hash32(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; }
  return h >>> 0;
}
/** 경쟁 카페 9곳 점수 (내림차순). seed·가이드북·년차·회차로 결정적. 년차마다 +4, 가이드북 급(표 순서)마다 +5. */
export function rivalScores(seed: number, gbId: string, year: number, month: number): number[] {
  const tier = Math.max(0, GUIDEBOOKS.findIndex((g) => g.id === gbId));
  const out: number[] = [];
  for (let i = 0; i < RIVAL_COUNT; i++) {
    const h = hash32(seed, tier + 1, year, month, i + 1);
    out.push(clamp100(12 + tier * 5 + year * 4 + i * 6 + (h % 12)));
  }
  return out.sort((a, b) => b - a);
}
export function rankAmong(score: number, rivals: number[]): number {
  return 1 + rivals.filter((r) => r > score).length;
}

// ---------- 해금·발표 ----------

export function guidebookState(state: GameState, id: string): GuidebookState {
  return (state.guidebooks[id] ??= { unlocked: false, lastRank: null, best: null });
}
export function initGuidebooks(): Record<string, GuidebookState> {
  const out: Record<string, GuidebookState> = {};
  for (const g of GUIDEBOOKS) out[g.id] = { unlocked: g.unlock.type === 'start', lastRank: null, best: null };
  return out;
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
  const mileage = RANK_MILEAGE[rank - 1] ?? 0;
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
    const rivals = rivalScores(state.seed, def.id, state.clock.year, state.clock.month);
    const rank = rankAmong(total, rivals);
    const st = guidebookState(state, def.id);
    st.lastRank = rank;
    st.best = st.best === null ? rank : Math.min(st.best, rank);
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

/** 월초 (정산·해금 뒤): ★ 검사 → 가이드북 해금 → 발표 */
export function monthlyRank(state: GameState): void {
  checkStar(state);
  evaluateGuidebooks(state);
  announce(state);
}

