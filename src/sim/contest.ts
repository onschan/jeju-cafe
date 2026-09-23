/**
 * 대회 — 바리스타 대회 / 카페 경연 (video-patch §3.1). 중반(3~5년차) 정체를 푸는 「10분 단위」 보상 층(코어 원칙 #2·#7).
 *
 * 연 2회 **6월 1일·12월 1일**, 등급 3(REVEAL_GRADE)부터. 개최 7일 전부터 당일 아침까지 접수한다.
 * 종목 3종(에스프레소·라떼아트·시그니처) 중 하나에 **직원 1명 + 메뉴 1개**를 내보낸다.
 *
 * 심사는 새 데이터 축을 만들지 않고 **MenuStats 4축에 직결**한다 — 맛(taste)·향(aroma)·외관(look)·스토리(jeju).
 *   항목점수(k) = clamp(0,100, 메뉴스탯(k) + 직원스탯보정 + 칭호보정 + 연수보정 + 재료보정)
 *   내점수 = Σ 가중치(k) × 항목점수(k)  → 운 판정 배수(대박 ×1.15 / 중박 ×1 / 쪽박 ×0.80)
 * 그래서 **연수·칭호·개발 메뉴·농원 자급·평판·청결이 전부 점수에 들어간다** — 대회는 기존 육성의 출구다.
 * (평판·청결·기력은 luck.ts outcomeChances가 이미 반영하므로 운 판정을 통해 자동으로 들어온다.)
 *
 * 상대 3명은 **회차 해시**(seed·년·월·종목)로 만든다 — 주 rng를 건드리지 않고(봇 KPI 밴드·리플레이 안정),
 * 같은 세이브·같은 회차면 언제 계산해도 같은 상대다(접수 창의 예상 점수·우승 확률도 같은 값을 쓴다).
 */
import type { GameState, ApplyResult, ContestDef, ContestEvent, ContestJudge, ContestResult, ContestState, Staff, MenuStats, Outcome, TitleEffectType } from './types.ts';
import { CONTESTS, contestDef, menuDef, trainingDef, titleDef, TRAININGS } from '../data/index.ts';
import { menuStatsOf, isCustomMenu } from './craft.ts';
import { menuOf } from './menu.ts';
import { outcomeChances, rollOutcome, recordOutcome, GREAT_REPUTATION, FAIL_REPUTATION, FAIL_ENERGY, GREAT_TICKETS, type Chances } from './luck.ts';
import { findStaff, pushNotice } from './staff.ts';
import { addTickets } from './mileage.ts';
import { gradeOf, REVEAL_GRADE } from './grade.ts';
import { dayIndex } from './effects.ts';
import { isWorking } from './titles.ts';
import { fmtNum } from './format.ts';

export { contestDef, CONTESTS };

// ---------- 일정·상수 ----------

/** 개최 달 (연 2회) */
export const CONTEST_MONTHS = [6, 12];
/** 개최일 (그 달 1일 아침) */
export const CONTEST_DAY = 1;
/** 접수 창: 개최 7일 전부터 */
export const SIGNUP_DAYS = 7;
/** 해금 등급 — 그 전엔 대회 창이 보이지 않는다 */
export const CONTEST_GRADE = REVEAL_GRADE;
/** 기록 보관 회차 (6년치) */
export const CONTEST_HISTORY_CAP = 12;

export const JUDGE_KEYS: ContestJudge[] = ['taste', 'aroma', 'look', 'story'];
export const JUDGE_LABEL: Record<ContestJudge, string> = { taste: '맛', aroma: '향', look: '외관', story: '스토리' };
/** 심사 항목 → MenuStats 축 (새 축을 만들지 않는다) */
export const JUDGE_STAT: Record<ContestJudge, keyof MenuStats> = { taste: 'taste', aroma: 'aroma', look: 'look', story: 'jeju' };

/** 운 판정 → 점수 배수 (효과 배수 OUTCOME_MULT와 따로 — 대회는 점수에 곱한다) */
export const SCORE_MULT: Record<Outcome, number> = { great: 1.15, success: 1, fail: 0.8 };

/** 메뉴 스탯 → 항목 점수 배수. menus.json의 축 하나는 실제로 0~40쯤이라(개발 시그니처의 맛 39가 최고급) 그대로 쓰면
 *  심사 점수가 0~40에 눌려 상대를 절대 못 이긴다. 2.5를 곱해 「좋은 메뉴 한 축 = 100점」 눈금으로 편다. */
export const MENU_SCALE = 2.5;
/** 직원 주 스탯 보정 상한 (스탯 100이면 +20) */
export const STAFF_BONUS_MAX = 20;
/** 칭호 보정: 해당 항목에 맞는 칭호 효과 하나마다 +6, 상한 +18 */
export const TITLE_BONUS_PER = 6;
export const TITLE_BONUS_MAX = 18;
/** 연수 보정: 맞는 연수 1회당 +4, 상한 +12 */
export const TRAINING_BONUS_PER = 4;
export const TRAINING_BONUS_MAX = 12;
/** 재료 보정: 제출 메뉴 재료 중 창고(농원 수확) 비율 × 10 */
export const SUPPLY_BONUS_MAX = 10;

/** 심사 항목마다 쳐 주는 칭호 효과 (titles.json에 심사 태그가 따로 없어 기존 효과 종류로 잇는다) */
export const TITLE_JUDGE: Record<ContestJudge, TitleEffectType[]> = {
  taste: ['speed', 'develop'],
  aroma: ['develop', 'fee'],
  look: ['photo'],
  story: ['satisfaction', 'tip'],
};
/** 심사 항목마다 쳐 주는 연수 (trainings.json) */
export const TITLE_TRAINING: Record<ContestJudge, string[]> = {
  taste: ['tr_barista'],
  aroma: ['tr_barista'],
  look: ['tr_barista'],
  story: ['tr_service'],
};

/** 순위별 상금 배율 (참가비 ×n). video-patch §3.1.5는 ×5/×3/×2를 「미검증 추정」으로 적어 두고 봇 재측정을 완료 기준에 넣었다 —
 *  그대로 쓰면 봇 5년차 자금이 2억 1,400만(밴드 상한 2억)이라 한 칸씩 내렸다. 1위는 여전히 참가비의 네 배다. */
export const PRIZE_MULT = [4, 2.5, 1.5, 0];
/** 순위별 응모권 — 4위도 참가상을 받는다 (져도 빈손이 아니게) */
export const RANK_TICKETS = [5, 3, 2, 1];
/** 순위별 출전 직원 경험치 */
export const RANK_EXP = [8, 6, 5, 3];
/** 순위별 손님 유입 배수·기간(일). §3.1.5의 ×1.25/60일도 상금과 같은 이유로 한 칸 내렸다 (봇 5년차 자금 밴드). */
export const RANK_BOOST: ({ mult: number; days: number } | null)[] = [
  { mult: 1.15, days: 45 }, { mult: 1.06, days: 30 }, { mult: 1.03, days: 30 }, null,
];
/** 순위별 간판 배지가 붙는 달 수 */
export const BADGE_MONTHS = [6, 3, 3, 0];
export const BADGE_TEXT = ['우승', '입상', '입상', ''];
/** 트로피 오브젝트 (1~3위가 받는다, 4위는 없다). 실내 1×1 — 받은 개수만큼만 놓을 수 있다.
 *  금·은·동을 따로 만들지 않는다: 효과가 같아 짓기 창 카드만 늘고(밀도), 「시설 종류 60」 가드에도 걸린다. 순위는 도감 기록과 간판 배지가 말한다. */
export const TROPHY_TYPE = 'trophy';
export const TROPHIES: (string | null)[] = [TROPHY_TYPE, TROPHY_TYPE, TROPHY_TYPE, null];
export const TROPHY_IDS = [TROPHY_TYPE];

/** 4위(입상 실패) 손실 */
export const LOSE_REPUTATION = 1;
export const LOSE_ENERGY = 15;

/** 상대 3명: 기준 점수 = 32 + 등급×5 + 회차수×1.5, 2·3번째는 −12·−24, 각각 ±6.
 *  수치는 video-patch §3.1의 「50 + 등급×8 + 회차×2」를 우리 점수 눈금에 맞춰 다시 잰 값이다(문서도 미검증 추정이라 적어 뒀다).
 *  목표: 등급 3 첫 회차에 **연수·칭호·자급 없이 나간 카페는 2~3위**, **키워서 나간 카페는 1위**. 등급 5 후반엔 상대 1위가 80대라 계속 겨룬다. */
export const RIVAL_BASE = 32;
export const RIVAL_PER_GRADE = 5;
export const RIVAL_PER_ROUND = 1.5;
export const RIVAL_STEP = 12;
export const RIVAL_NOISE = 6;
export const RIVAL_COUNT = 3;

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------- 상태 ----------

export function initContest(): ContestState {
  return { entry: null, history: [], bestScore: 0, boost: null, badge: null, trophies: {}, pending: null };
}
/** 대회 상태 (옛 세이브는 처음 쓸 때 채운다) */
export function contestState(state: GameState): ContestState {
  return (state.contest ??= initContest());
}

// ---------- 일정 ----------

/** 대회가 열려 있나 (등급 3부터 — 그 전엔 창도 안 보인다) */
export function contestUnlocked(state: GameState): boolean {
  return gradeOf(state) >= CONTEST_GRADE;
}
/** 그 해에 대회가 몇 번째로 열리나 (1년차 6월 = 1회차). 상대 성장에 쓴다. */
export function roundIndex(year: number, month: number): number {
  return (year - 1) * CONTEST_MONTHS.length + (month >= CONTEST_MONTHS[1]! ? 2 : 1);
}
/** 다음 개최 (년·월). 오늘이 개최일이면 오늘. */
export function nextContest(state: GameState): { year: number; month: number } {
  const { year, month, day } = state.clock;
  for (const m of CONTEST_MONTHS) if (month < m || (month === m && day <= CONTEST_DAY)) return { year, month: m };
  return { year: year + 1, month: CONTEST_MONTHS[0]! };
}
/** 다음 개최일까지 남은 날 (개최일 당일이면 0) */
export function daysToContest(state: GameState): number {
  const next = nextContest(state);
  const { year, month, day } = state.clock;
  return (next.year - year) * 12 * 30 + (next.month - month) * 30 + (CONTEST_DAY - day);
}
/** 접수 창이 열려 있나 (개최 7일 전 ~ 당일 아침) */
export function signupOpen(state: GameState): boolean {
  if (!contestUnlocked(state)) return false;
  const d = daysToContest(state);
  return d >= 0 && d <= SIGNUP_DAYS;
}
/** 오늘이 개최일인가 */
export function isContestDay(state: GameState): boolean {
  return state.clock.day === CONTEST_DAY && CONTEST_MONTHS.includes(state.clock.month);
}
/** 대회 이름 (「제주 바리스타 대회 6월전」) */
export function contestTitle(month: number, event: ContestEvent): string {
  const head = month === CONTEST_MONTHS[0] ? '제주 바리스타 대회' : '제주 카페 경연';
  return `${head} ${contestDef(event).name}부`;
}

// ---------- 심사 ----------

/** 이 직원이 이 항목에서 받는 칭호 보정 */
export function titleBonusFor(staff: Staff, judge: ContestJudge): number {
  if (!staff.title) return 0;
  const want = new Set(TITLE_JUDGE[judge]);
  let n = 0;
  try { for (const e of titleDef(staff.title).effects) if (want.has(e.type)) n++; } catch { /* 없는 칭호 id (옛 저장) */ }
  return Math.min(TITLE_BONUS_MAX, n * TITLE_BONUS_PER);
}
/** 이 직원이 이 항목에서 받는 연수 보정 */
export function trainingBonusFor(staff: Staff, judge: ContestJudge): number {
  const log = staff.trainingLog ?? {};
  let n = 0;
  for (const id of TITLE_TRAINING[judge]) n += log[id] ?? 0;
  return Math.min(TRAINING_BONUS_MAX, n * TRAINING_BONUS_PER);
}
/** 제출 메뉴 재료 중 창고(농원 수확)에 있는 비율 → 0~+10 */
export function supplyBonus(state: GameState, menuId: string): number {
  let need = 0;
  let have = 0;
  for (const [id, n] of Object.entries(menuOf(state, menuId).ingredients)) {
    need += n;
    have += Math.min(n, state.storage[id] ?? 0);
  }
  if (need <= 0) return 0;
  return round1((have / need) * SUPPLY_BONUS_MAX);
}
/** 항목 점수 0~100 (운 판정 전). 기여 내역도 같이 돌려준다 — 접수 창이 「무엇을 키우면 오르나」를 보여 준다. */
export function judgeScore(state: GameState, judge: ContestJudge, staff: Staff, menuId: string): { total: number; menu: number; staff: number; title: number; training: number; supply: number } {
  const menu = round1(menuStatsOf(state, menuId)[JUDGE_STAT[judge]] * MENU_SCALE);
  const stat = judge === 'story' ? staff.stats.smile : staff.stats.skill;
  const st = round1((stat / 100) * STAFF_BONUS_MAX);
  const title = titleBonusFor(staff, judge);
  const training = trainingBonusFor(staff, judge);
  const supply = supplyBonus(state, menuId);
  return { total: clamp100(round1(menu + st + title + training + supply)), menu, staff: st, title, training, supply };
}
/** 심사 4항목 (운 판정 전) */
export function judgeScores(state: GameState, staff: Staff, menuId: string): Record<ContestJudge, number> {
  const out = {} as Record<ContestJudge, number>;
  for (const k of JUDGE_KEYS) out[k] = judgeScore(state, k, staff, menuId).total;
  return out;
}
/** 가중 합 0~100 (운 판정 전) */
export function baseScore(def: ContestDef, scores: Record<ContestJudge, number>): number {
  let n = 0;
  for (const k of JUDGE_KEYS) n += def.weights[k] * scores[k];
  return round1(n);
}

// ---------- 상대 ----------

function hash32(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; }
  return h >>> 0;
}
/** 상대 3명 점수 (내림차순). 회차 해시라 같은 세이브·같은 회차면 늘 같다 — 주 rng도 보조 스트림도 쓰지 않는다. */
export function rivalScores(seed: number, year: number, month: number, event: ContestEvent, grade: number): number[] {
  const ei = Math.max(0, CONTESTS.findIndex((c) => c.id === event));
  const top = RIVAL_BASE + grade * RIVAL_PER_GRADE + roundIndex(year, month) * RIVAL_PER_ROUND;
  const out: number[] = [];
  for (let i = 0; i < RIVAL_COUNT; i++) {
    const h = hash32(seed, year, month, ei + 1, i + 1);
    out.push(clamp100(top - i * RIVAL_STEP + ((h % (RIVAL_NOISE * 2 + 1)) - RIVAL_NOISE)));
  }
  return out.sort((a, b) => b - a);
}
/** 이번 회차 상대 (접수 창·개최 둘 다 이걸 쓴다) */
export function currentRivals(state: GameState, event: ContestEvent): number[] {
  const next = nextContest(state);
  return rivalScores(state.seed, next.year, next.month, event, gradeOf(state));
}
export function rankAmong(score: number, rivals: number[]): number {
  return 1 + rivals.filter((r) => r > score).length;
}

// ---------- 예상 (접수 전에 보는 값) ----------

export interface ContestOdds {
  scores: Record<ContestJudge, number>;
  base: number;
  low: number;    // 쪽박일 때 점수
  high: number;   // 대박일 때 점수
  rivals: number[];
  rank: number;   // 중박 기준 예상 순위
  bestRank: number;
  worstRank: number;
  chances: Chances;
  winPct: number; // 우승 확률 % (대박/중박/쪽박 세 갈래를 상대와 비교)
  fee: number;
  prize: number;  // 예상 순위의 상금
}
/** 접수 카드에 미리 보여 주는 예상 점수·우승 확률. 상태를 바꾸지 않는다(순수 계산). */
export function contestOdds(state: GameState, event: ContestEvent, staffId: string, menuId: string): ContestOdds | null {
  const staff = findStaff(state, staffId);
  if (!staff) return null;
  const def = contestDef(event);
  const scores = judgeScores(state, staff, menuId);
  const base = baseScore(def, scores);
  const rivals = currentRivals(state, event);
  const chances = outcomeChances(state, 'contest', staff);
  const at = (o: Outcome) => round1(base * SCORE_MULT[o]);
  const low = at('fail');
  const high = at('great');
  const rank = rankAmong(at('success'), rivals);
  const winPct = Math.round(
    (chances.great * (rankAmong(high, rivals) === 1 ? 1 : 0)
      + chances.success * (rank === 1 ? 1 : 0)
      + chances.fail * (rankAmong(low, rivals) === 1 ? 1 : 0)) * 100,
  );
  return {
    scores, base, low, high, rivals, rank,
    bestRank: rankAmong(high, rivals), worstRank: rankAmong(low, rivals),
    chances, winPct, fee: def.fee, prize: def.fee * (PRIZE_MULT[rank - 1] ?? 0),
  };
}

// ---------- 접수 ----------

/** 그 종목에 낼 수 있는 메뉴 (메뉴판에 올라 있는 것 중) */
export function contestMenus(state: GameState, event: ContestEvent): string[] {
  const def = contestDef(event);
  const slots = state.menuSlots.filter((m): m is string => m !== null);
  for (const cat of def.categories) {
    const hit = slots.filter((id) => menuOf(state, id).category === cat);
    if (hit.length > 0) return hit;
  }
  return [];
}
/** 그 종목에 내보낼 수 있는 직원 (직종이 맞고 일하는 중) */
export function contestStaff(state: GameState, event: ContestEvent): Staff[] {
  const roles = new Set(contestDef(event).roles);
  return state.staff.filter((s) => s.role !== null && roles.has(s.role) && isWorking(state, s));
}

export function canEnterContest(state: GameState, event: ContestEvent, staffId: string, menuId: string): ApplyResult {
  if (!contestUnlocked(state)) return { ok: false, reason: '아직 대회에 못 나가요' };
  if (!signupOpen(state)) return { ok: false, reason: '접수 기간이 아니에요' };
  const c = contestState(state);
  if (c.entry) return { ok: false, reason: '이미 접수했어요' };
  const def = CONTESTS.find((d) => d.id === event);
  if (!def) return { ok: false, reason: '없는 종목이에요' };
  const staff = findStaff(state, staffId);
  if (!staff) return { ok: false, reason: '없는 직원이에요' };
  if (!staff.role || !def.roles.includes(staff.role)) return { ok: false, reason: '이 종목에 맞는 직종이 아니에요' };
  if (!isWorking(state, staff)) return { ok: false, reason: '지금 자리를 비운 직원이에요' };
  if (!contestMenus(state, event).includes(menuId)) return { ok: false, reason: '메뉴판에서 낼 메뉴를 골라요' };
  if (state.money < def.fee) return { ok: false, reason: '참가비가 모자라요' };
  return { ok: true };
}

/** 접수: 참가비를 낸다. 호출 전 canEnterContest. */
export function enterContest(state: GameState, event: ContestEvent, staffId: string, menuId: string): void {
  const def = contestDef(event);
  const c = contestState(state);
  state.money -= def.fee;
  state.monthCosts.contest = (state.monthCosts.contest ?? 0) + def.fee;
  c.entry = { event, staffId, menuId, day: dayIndex(state.clock) };
  pushNotice(state, `${contestTitle(nextContest(state).month, event)}에 접수했어요 — 참가비 ₩${fmtNum(def.fee)}`);
}

export function canCancelContest(state: GameState): ApplyResult {
  const c = contestState(state);
  if (!c.entry) return { ok: false, reason: '접수한 대회가 없어요' };
  if (isContestDay(state)) return { ok: false, reason: '대회 날엔 못 물러요' };
  return { ok: true };
}
/** 접수 취소: 참가비를 돌려준다 (대회 날은 못 무른다). */
export function cancelContest(state: GameState): void {
  const c = contestState(state);
  const def = contestDef(c.entry!.event);
  state.money += def.fee;
  state.monthCosts.contest = Math.max(0, (state.monthCosts.contest ?? 0) - def.fee);
  c.entry = null;
  pushNotice(state, '대회 접수를 물렀어요 — 참가비를 돌려받았어요');
}

// ---------- 개최 ----------

/** 상금·트로피·배지·유입 배수·응모권·경험치. 순위표(PRIZE_MULT…)가 4행 전부를 덮는다. */
function applyRewards(state: GameState, def: ContestDef, rank: number, staff: Staff | undefined, month: number): { prize: number; tickets: number; trophy: string | null } {
  const c = contestState(state);
  const i = rank - 1;
  const prize = def.fee * (PRIZE_MULT[i] ?? 0);
  const tickets = RANK_TICKETS[i] ?? 0;
  const trophy = TROPHIES[i] ?? null;
  if (prize > 0) { state.money += prize; state.monthIncome += prize; }
  addTickets(state, tickets);
  if (trophy) {
    c.trophies[trophy] = (c.trophies[trophy] ?? 0) + 1;
    if (!state.unlocked.objects.includes(trophy)) state.unlocked.objects.push(trophy);
  }
  const boost = RANK_BOOST[i];
  if (boost) c.boost = { mult: boost.mult, untilDay: dayIndex(state.clock) + boost.days };
  const months = BADGE_MONTHS[i] ?? 0;
  if (months > 0) c.badge = { text: `${contestDef(def.id).name} ${BADGE_TEXT[i]}`, untilDay: dayIndex(state.clock) + months * 30 };
  if (staff) staff.exp += RANK_EXP[i] ?? 0;
  if (rank >= 4) {
    state.reputation = Math.max(0, state.reputation - LOSE_REPUTATION);
    if (staff) staff.energy = Math.max(0, staff.energy - LOSE_ENERGY);
  }
  void month;
  return { prize, tickets, trophy };
}

/** 운 판정의 덤 (luck.ts 상수를 그대로 쓴다): 대박 = 평판 +3·응모권 +1 / 쪽박 = 평판 −2·기력 −20 */
function applyOutcomeSide(state: GameState, outcome: Outcome, staff: Staff | undefined): void {
  if (outcome === 'great') {
    state.reputation = Math.min(100, state.reputation + GREAT_REPUTATION);
    addTickets(state, GREAT_TICKETS);
  } else if (outcome === 'fail') {
    state.reputation = Math.max(0, state.reputation - FAIL_REPUTATION);
    if (staff) staff.energy = Math.max(0, staff.energy - FAIL_ENERGY);
  }
}

/** 개최일 아침: 접수한 대회를 치른다. 접수가 없으면 null. */
export function runContest(state: GameState): ContestResult | null {
  const c = contestState(state);
  const entry = c.entry;
  if (!entry) return null;
  c.entry = null;
  const def = contestDef(entry.event);
  const staff = findStaff(state, entry.staffId);
  const scores = judgeScores(state, staff ?? blankStaff(), entry.menuId);
  const base = baseScore(def, scores);
  const chances = outcomeChances(state, 'contest', staff ?? null);
  const outcome = rollOutcome(state, { task: 'contest', staff: staff ?? null });
  const myScore = round1(base * SCORE_MULT[outcome]);
  const rivals = rivalScores(state.seed, state.clock.year, state.clock.month, entry.event, gradeOf(state));
  const rank = rankAmong(myScore, rivals);
  const best = myScore > c.bestScore;
  if (best) c.bestScore = myScore;
  applyOutcomeSide(state, outcome, staff);
  const { prize, tickets, trophy } = applyRewards(state, def, rank, staff, state.clock.month);
  let menuName = entry.menuId;
  try { menuName = menuOf(state, entry.menuId).name; } catch { try { menuName = menuDef(entry.menuId).name; } catch { /* 없어진 메뉴 */ } }
  const result: ContestResult = {
    year: state.clock.year, month: state.clock.month, event: entry.event,
    scores, base, myScore, rivals, rank, outcome, chances, best, prize, tickets,
    staffId: entry.staffId, staffName: staff?.name ?? '우리 카페', menuName, trophy,
  };
  c.history.unshift(result);
  if (c.history.length > CONTEST_HISTORY_CAP) c.history.length = CONTEST_HISTORY_CAP;
  c.pending = result;
  recordOutcome(state, {
    task: 'contest', outcome, staffId: staff?.id ?? null, title: contestTitle(state.clock.month, entry.event), chances,
    lines: [`점수 ×${SCORE_MULT[outcome]}`],
  });
  state.lastOutcome = null; // 대회는 전용 화면(ContestShow)으로 보여 준다 — 룰렛 팝업은 띄우지 않는다
  pushNotice(state, `${contestTitle(state.clock.month, entry.event)} ${rank}위!${prize > 0 ? ` 상금 ₩${fmtNum(prize)}` : ''}`);
  return result;
}

/** 직원이 없어진 경우의 빈 스탯 (점수 계산이 터지지 않게) */
function blankStaff(): Staff {
  return { stats: { skill: 0, smile: 0, strength: 0, stamina: 0 } } as unknown as Staff;
}

// ---------- 훅 ----------

/** 개최 7일 전 예고 한 줄 (하루 한 번) */
export function dailyContest(state: GameState): void {
  const c = contestState(state);
  const today = dayIndex(state.clock);
  if (c.boost && today >= c.boost.untilDay) c.boost = null;
  if (c.badge && today >= c.badge.untilDay) c.badge = null;
  if (!contestUnlocked(state)) return;
  if (daysToContest(state) === SIGNUP_DAYS && !c.entry) {
    const next = nextContest(state);
    pushNotice(state, `${next.month}월에 ${next.month === CONTEST_MONTHS[0] ? '바리스타 대회' : '카페 경연'}이 열린대요 — 이레 뒤예요`);
  }
}
/** 월초 (1일): 개최일이면 접수한 대회를 치른다 */
export function monthlyContest(state: GameState): void {
  if (!isContestDay(state)) return;
  runContest(state);
}

/** 손님 유입 배수 (dailyGuestCount가 평판 계수와 같은 자리에 곱한다) */
export function contestGuestMult(state: GameState): number {
  const b = state.contest?.boost;
  if (!b || dayIndex(state.clock) >= b.untilDay) return 1;
  return b.mult;
}
/** 간판 배지 문구 (없으면 null) */
export function contestBadge(state: GameState): string | null {
  const b = state.contest?.badge;
  if (!b || dayIndex(state.clock) >= b.untilDay) return null;
  return b.text;
}

// ---------- 트로피 ----------

/** 대회에서 받은 만큼만 놓을 수 있다 (상 하나에 트로피 하나) */
export function trophyOwned(state: GameState, type: string): number {
  return state.contest?.trophies[type] ?? 0;
}
export function trophyPlaced(state: GameState, type: string): number {
  return Object.values(state.objects).filter((o) => o.type === type).length;
}
export function canPlaceTrophy(state: GameState, type: string): ApplyResult {
  if (!TROPHY_IDS.includes(type)) return { ok: true };
  const owned = trophyOwned(state, type);
  if (trophyPlaced(state, type) >= owned) return { ok: false, reason: owned > 0 ? '받은 트로피를 다 놓았어요' : '대회에서 받아야 놓을 수 있어요' };
  return { ok: true };
}

// ---------- 도감·목표 ----------

export function contestHistory(state: GameState): ContestResult[] {
  return state.contest?.history ?? [];
}
export function contestWins(state: GameState): number {
  return contestHistory(state).filter((r) => r.rank === 1).length;
}
export function contestBestRank(state: GameState): number | null {
  const h = contestHistory(state);
  return h.length === 0 ? null : Math.min(...h.map((r) => r.rank));
}
/** 도감 「대회」 줄: 받은 트로피 3종 중 몇 종 */
export function trophyKinds(state: GameState): number {
  return TROPHY_IDS.filter((id) => trophyOwned(state, id) > 0).length;
}

/** 시그니처 메뉴로 나갈 수 있나 (접수 창 안내용) */
export function hasSignature(state: GameState): boolean {
  return state.menuSlots.some((id) => id !== null && isCustomMenu(state, id) && menuOf(state, id).category === 'signature');
}

/** 연수 목록 이름 (접수 창의 「무엇을 키우면 오르나」 줄) */
export function trainingNameFor(judge: ContestJudge): string {
  const id = TITLE_TRAINING[judge][0];
  if (!id) return '연수';
  try { return trainingDef(id).name; } catch { return TRAININGS[0]?.name ?? '연수'; }
}
