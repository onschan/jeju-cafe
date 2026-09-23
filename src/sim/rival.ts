/**
 * 동네 경쟁 카페 5곳 (rivals2.json) — 「덜어내기」에서 지웠던 라이벌을 **순위표 하나**로 되살린 것.
 *
 * 코어 원칙 #1(다음 단계가 코앞)·#4(선택의 의미):
 *  - 나와 5곳을 **같은 잣대 네 항목**(인기·경관·서비스·매출)으로 매겨 **월간 순위 1~6위**를 보여 준다.
 *    "몇 등인가"는 목표보다 훨씬 짧은 주기로 갱신되므로 다음 한 수가 늘 코앞에 있다.
 *  - 경쟁 카페는 **자기 성장 곡선**으로 달마다 오른다(base + growth × 지난 달 수 ± 해시 잡음).
 *    가만히 있으면 순위가 내려간다 — 그게 도전거리다.
 *  - 세 가지로 **직접** 부딪힌다: ① 같은 달 같은 분류(유행)를 밀면 손님을 나눠 갖는다
 *    ② 뺏기 이벤트(신메뉴·할인) — 그달 손님 −10%, 대응 3갈래 ③ 대회에서 이 5곳 중 3곳이 상대로 나온다.
 *  - 엔드게임: 5년차·등급 4·1위 3달이면 한 곳을 **인수**(손님 흡수 + 시설 1개)하거나 **제휴**(월 고정비, 강점 항목 +10%).
 *
 * 결정적: 주 rng도 보조 스트림도 쓰지 않는다 — 점수·잡음·뺏기 이벤트 전부 **회차 해시**(seed·달·카페)다.
 * 같은 세이브면 언제 계산해도 같은 값이라 봇 KPI 밴드·리플레이가 흔들리지 않는다.
 *
 * 손님 수 효과는 **RIVAL_EFFECT_YEAR(2년차)부터** 걸린다 — 1년차 밴드(말 자금 ≤1,000만)를 건드리지 않는다.
 */
import type { GameState, GoalReward, RivalAxes, RivalAxis, RivalCafeState, RivalDef, RivalRow, RivalsState, TrendCategory } from './types.ts';
import { RIVALS, objectDef } from '../data/index.ts';
import { monthIndex } from './clock.ts';
import { effectivePopularity } from './promotions.ts';
import { sceneryScore } from './grid.ts';
import { isSeat } from './cafe.ts';
import { menuOf } from './menu.ts';
import { gradeOf } from './grade.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { applyRewards } from './goals.ts';
import { fmtNum } from './format.ts';
import { josa } from './josa.ts';
import { START_MONTH } from './state.ts';

export { RIVALS };

// ---------- 잣대 ----------

export const RIVAL_AXES: RivalAxis[] = ['pop', 'view', 'service', 'sales'];
export const RIVAL_AXIS_LABEL: Record<RivalAxis, string> = { pop: '인기', view: '경관', service: '서비스', sales: '매출' };
/** 순위 점수 = 네 항목의 가중 합 (합 1) */
export const RIVAL_WEIGHT: Record<RivalAxis, number> = { pop: 0.3, view: 0.2, service: 0.25, sales: 0.25 };
/** 내 「인기」: 해금 손님층 중 유효 인기 상위 이만큼의 평균 */
export const RIVAL_POP_TOP = 12;
/** 내 「경관」: 자리 평균 경치 × 이 값 (경치 14 남짓이면 100점 — 5년차에도 올릴 데가 남게) */
export const RIVAL_VIEW_PER = 7;
/** 내 「매출」: 지난달 매출을 이 값으로 나눈 점수 (2,500만 = 100점) */
export const RIVAL_SALES_PER_POINT = 250_000;
/** 내 「서비스」: 평판 × 이 비중 + 일하는 직원 1명당 아래 점수. 평판만 보면 어지간하면 100이라 항목이 죽는다. */
export const RIVAL_SERVICE_REP = 0.55;
export const RIVAL_SERVICE_PER_STAFF = 4.5;

/** 발표일 — 1일이 아니라 **5일 아침**. 월초 1일엔 결산·가이드북 발표·이벤트·유행이 이미 몰려 있다(도파민 분산). */
export const RIVAL_BOARD_DAY = 5;
/** 뺏기 이벤트가 걸리는 날 (그달 중반) */
export const RIVAL_STEAL_DAY = 12;
/** 뺏기 이벤트 확률 % (해시 판정) */
export const RIVAL_STEAL_CHANCE = 35;

// ---------- 손님 수 효과 ----------

/** 손님 수 효과가 시작되는 연차 — 1년차는 순위표만 보여 주고 손님 수는 건드리지 않는다 */
export const RIVAL_EFFECT_YEAR = 2;
/** 순위에 따라 붙는 손님 배수 — 1위 +10%, 2위 +6%, 3위 +3%, 그 아래는 0.
 *  「1위만 +10%」이면 순위가 낮은 동안은 내내 손해만 나서 초반이 눈덩이처럼 무너진다. 계단을 둔다. */
export const RIVAL_RANK_BONUS = [0.10, 0.06, 0.03, 0, 0, 0];
export const RIVAL_LEAD_BONUS = RIVAL_RANK_BONUS[0]!;
/** 뺏기 이벤트를 그냥 두면 그달 손님 −10% */
export const RIVAL_STEAL_PENALTY = 0.10;
/** 유행 분류가 겹칠 때 손님을 나누는 최대 폭 (점수가 같으면 절반인 −5%).
 *  **이번 달 가장 많이 판 분류가 유행일 때만** 걸린다 — 유행에 올라타면 ×1.5를 먹는 대신 경쟁 카페와 나눈다(선택의 의미). */
export const RIVAL_SHARE_MAX = 0.10;
/** 인수한 카페 한 곳당 손님 +6% (그 카페 손님이 넘어온다) */
export const RIVAL_ACQUIRE_BONUS = 0.06;

// ---------- 대응 선택지 ----------

/** 맞불 홍보 비용 */
export const RIVAL_COUNTER_COST = 500_000;
/** 메뉴 개발로 답하면 손님은 반만 지키고(−5%) 연구가 들어온다 */
export const RIVAL_DEVELOP_RESEARCH = 15;
export const RIVAL_DEVELOP_PENALTY = 0.05;

// ---------- 인수·제휴 ----------

export const RIVAL_DEAL_ENDGAME_YEAR = 5;
export const RIVAL_DEAL_GRADE = 4;
/** 1위를 이만큼 이어 가야 인수·제휴를 걸 수 있다 */
export const RIVAL_DEAL_LEAD_MONTHS = 3;
export const RIVAL_ACQUIRE_COST = 30_000_000;
/** 제휴 월 고정비 */
export const RIVAL_DEAL_MONTHLY = 500_000;
/** 제휴하면 그 카페 강점 항목이 내 점수에서 +10% */
export const RIVAL_DEAL_AXIS_PCT = 0.10;

/** 순위가 오르면 주는 응모권 (오른 계단 수만큼, 최대 3) */
export const RIVAL_UP_TICKETS = 1;
export const RIVAL_UP_TICKETS_MAX = 3;

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function hash32(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; }
  return h >>> 0;
}

// ---------- 상태 ----------

export function initRivals(): RivalsState {
  const cafes: Record<string, RivalCafeState> = {};
  for (const r of RIVALS) cafes[r.id] = { rank: null, deal: false, acquired: false };
  return { cafes, myRank: null, prevRank: null, myScore: 0, leadMonths: 0, lastMonthIndex: -1, rows: [], line: '', steal: null, pending: false };
}
/** 경쟁 상태 (옛 세이브는 처음 쓸 때 채운다) */
export function rivalsState(state: GameState): RivalsState {
  const r = (state.rivals ??= initRivals());
  for (const d of RIVALS) r.cafes[d.id] ??= { rank: null, deal: false, acquired: false };
  return r;
}
export function rivalDef(id: string): RivalDef {
  const d = RIVALS.find((r) => r.id === id);
  if (!d) throw new Error(`rival: unknown id ${id}`);
  return d;
}
/** 아직 동네에 남아 있는 경쟁 카페 (인수한 곳은 빠진다) */
export function activeRivals(state: GameState): RivalDef[] {
  const r = rivalsState(state);
  return RIVALS.filter((d) => !r.cafes[d.id]!.acquired);
}
export function acquiredRivals(state: GameState): RivalDef[] {
  const r = rivalsState(state);
  return RIVALS.filter((d) => r.cafes[d.id]!.acquired);
}

// ---------- 경쟁 카페 점수 (자기 성장 곡선) ----------

/** 게임 시작(1년 3월)부터 지난 달 수 */
export function elapsedMonths(state: GameState): number {
  return Math.max(0, monthIndex(state.clock) - (START_MONTH - 1));
}
/** 경쟁 카페 한 곳의 네 항목 점수. 회차 해시라 같은 세이브·같은 달이면 늘 같다. */
export function rivalAxes(seed: number, def: RivalDef, months: number): RivalAxes {
  const out = {} as RivalAxes;
  RIVAL_AXES.forEach((axis, ai) => {
    const h = hash32(seed, ai + 1, months, def.name.length);
    const noise = (h % 7) - 3;
    out[axis] = clamp100(round1(def.base[axis] + def.growth[axis] * months + noise));
  });
  return out;
}
export function totalOf(axes: RivalAxes): number {
  let n = 0;
  for (const a of RIVAL_AXES) n += RIVAL_WEIGHT[a] * axes[a];
  return round1(n);
}

// ---------- 내 점수 (같은 잣대) ----------

/** 내 「인기」 — 해금 손님층 유효 인기 상위 RIVAL_POP_TOP종의 평균 */
export function myPopScore(state: GameState): number {
  const vals = Object.entries(state.guestTypes)
    .filter(([, t]) => t.unlocked)
    .map(([id]) => effectivePopularity(state, id))
    .sort((a, b) => b - a)
    .slice(0, RIVAL_POP_TOP);
  if (vals.length === 0) return 0;
  return clamp100(round1(vals.reduce((a, b) => a + b, 0) / vals.length));
}
/** 내 「경관」 — 자리 평균 경치 × RIVAL_VIEW_PER (appeal.ts cafeScenery와 같은 식이지만 import 고리를 만들지 않는다) */
export function myViewScore(state: GameState): number {
  const seats = Object.values(state.objects).filter((o) => !o.build && isSeat(state, o));
  if (seats.length === 0) return 0;
  const avg = seats.reduce((a, o) => a + sceneryScore(state, o.x, o.y), 0) / seats.length;
  return clamp100(round1(avg * RIVAL_VIEW_PER));
}
/** 내 「서비스」 — 평판과 일하는 직원 머릿수 (손님을 맞는 손이 몇인가) */
export function myServiceScore(state: GameState): number {
  const heads = state.staff.filter((st) => st.role !== null && !st.training).length;
  return clamp100(round1(state.reputation * RIVAL_SERVICE_REP + heads * RIVAL_SERVICE_PER_STAFF));
}
/** 내 네 항목 (제휴 보정 포함) */
export function myAxes(state: GameState): RivalAxes {
  const axes: RivalAxes = {
    pop: myPopScore(state),
    view: myViewScore(state),
    service: myServiceScore(state),
    sales: clamp100(round1(state.lastMonthIncome / RIVAL_SALES_PER_POINT)),
  };
  const r = rivalsState(state);
  for (const d of RIVALS) if (r.cafes[d.id]!.deal) axes[d.strength] = clamp100(round1(axes[d.strength] * (1 + RIVAL_DEAL_AXIS_PCT)));
  return axes;
}
export function myTotal(state: GameState): number {
  return totalOf(myAxes(state));
}

// ---------- 순위표 ----------

/** 지금 이 순간의 순위표 (나 + 남은 경쟁 카페). 상태를 바꾸지 않는다 — 창을 열 때도 이걸 쓴다. */
export function scoreboard(state: GameState): RivalRow[] {
  const st = rivalsState(state);
  const months = elapsedMonths(state);
  const rows: RivalRow[] = [
    { id: 'me', name: state.cafeName, axes: myAxes(state), total: myTotal(state), rank: 0, prevRank: st.myRank, me: true, deal: false },
    ...activeRivals(state).map((d) => {
      const axes = rivalAxes(state.seed, d, months);
      return { id: d.id, name: d.name, axes, total: totalOf(axes), rank: 0, prevRank: st.cafes[d.id]!.rank, me: false, deal: st.cafes[d.id]!.deal };
    }),
  ];
  // 동점이면 나를 앞에 (id 순으로 결정적)
  rows.sort((a, b) => b.total - a.total || (a.me ? -1 : b.me ? 1 : a.id.localeCompare(b.id)));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** 나와 1계단 위(또는 바로 아래) 카페의 격차 */
export function rankGap(rows: RivalRow[]): { above: RivalRow | null; below: RivalRow | null; gap: number } {
  const i = rows.findIndex((r) => r.me);
  const above = i > 0 ? rows[i - 1]! : null;
  const below = i >= 0 && i < rows.length - 1 ? rows[i + 1]! : null;
  const me = rows[i];
  return { above, below, gap: above && me ? round1(above.total - me.total) : 0 };
}

/** 발표 한 줄 — "감귤 베이커리가 이번 달 디저트로 앞섰어요" 꼴. 내가 1위면 지켰다는 말. */
export function boardLine(state: GameState, rows: RivalRow[]): string {
  const { above } = rankGap(rows);
  if (!above) return state.trend ? `동네 1위를 지켰어요 · ${TREND_LABEL[state.trend.category]}가 잘 나갔어요` : '동네 1위를 지켰어요';
  const def = RIVALS.find((d) => d.id === above.id);
  const axis = def ? def.strength : 'pop';
  const what = def ? CATEGORY_LABEL[def.category] : RIVAL_AXIS_LABEL[axis];
  return `${josa(above.name, '이/가')} 이번 달 ${josa(what, '으로/로')} 앞섰어요`;
}
const CATEGORY_LABEL: Record<TrendCategory, string> = { coffee: '커피', dessert: '디저트', meal: '식사', juice: '주스' };
const TREND_LABEL = CATEGORY_LABEL;

// ---------- 월간 발표 ----------

export function boardDue(state: GameState): boolean {
  return state.clock.day === RIVAL_BOARD_DAY && rivalsState(state).lastMonthIndex !== monthIndex(state.clock);
}

/** 발표: 순위를 매기고 기록 → 보상 → 알림·장면 창. 하루 한 번(5일 아침)만 돈다. */
export function runBoard(state: GameState): RivalRow[] {
  const st = rivalsState(state);
  const rows = scoreboard(state);
  const me = rows.find((r) => r.me)!;
  const before = st.myRank;
  st.prevRank = before;
  st.myRank = me.rank;
  st.myScore = me.total;
  st.rows = rows;
  st.lastMonthIndex = monthIndex(state.clock);
  st.line = boardLine(state, rows);
  st.pending = true;
  for (const r of rows) if (!r.me) st.cafes[r.id]!.rank = r.rank;
  st.leadMonths = me.rank === 1 ? st.leadMonths + 1 : 0;
  pushNotice(state, `동네 ${me.rank}위 · ${st.line}`);
  pushFx(state, { kind: 'scene', title: `동네 ${me.rank}위`, text: st.line, tick: state.tick });
  // 오른 계단만큼 응모권 (내려가면 보상 없음 — 잃을 것이 있어야 도전이 된다)
  if (before !== null && me.rank < before) {
    const n = Math.min(RIVAL_UP_TICKETS_MAX, (before - me.rank) * RIVAL_UP_TICKETS);
    const rewards: GoalReward[] = [{ type: 'tickets', n }];
    applyRewards(state, rewards, { source: 'rival', refId: `board${st.lastMonthIndex}`, title: `동네 ${before}위 → ${me.rank}위` });
  }
  return rows;
}

// ---------- 뺏기 이벤트 ----------

export const STEAL_TEXT: Record<'newmenu' | 'sale', string> = { newmenu: '신메뉴를 냈어요', sale: '할인 행사를 열었어요' };

/** 그달 뺏기 이벤트를 걸지 (해시 판정 — rng를 안 쓴다) */
export function stealDue(state: GameState): boolean {
  if (state.clock.year < RIVAL_EFFECT_YEAR || state.clock.day !== RIVAL_STEAL_DAY) return false;
  const st = rivalsState(state);
  const mi = monthIndex(state.clock);
  if (st.steal && st.steal.monthIndex === mi) return false;
  return hash32(state.seed, mi, 77) % 100 < RIVAL_STEAL_CHANCE;
}
export function rollSteal(state: GameState): void {
  const st = rivalsState(state);
  const mi = monthIndex(state.clock);
  const list = activeRivals(state);
  if (list.length === 0) return;
  const h = hash32(state.seed, mi, 91);
  const def = list[h % list.length]!;
  const kind = (h >>> 8) % 2 === 0 ? 'newmenu' : 'sale';
  st.steal = { rivalId: def.id, monthIndex: mi, kind, answer: 'none' };
  pushNotice(state, `${josa(def.name, '이/가')} ${STEAL_TEXT[kind]} — 이달 손님이 줄어요`);
}
/** 아직 살아 있는 뺏기 이벤트 (달이 바뀌면 사라진다) */
export function activeSteal(state: GameState) {
  const st = rivalsState(state);
  const s = st.steal;
  return s && s.monthIndex === monthIndex(state.clock) ? s : null;
}
export function stealTitle(state: GameState): string {
  const s = activeSteal(state);
  if (!s) return '';
  return `${josa(rivalDef(s.rivalId).name, '이/가')} ${STEAL_TEXT[s.kind]}`;
}
/** 대응 3갈래. 맞불 홍보는 돈이 있어야 한다. */
export function canAnswerRival(state: GameState, choice: 'counter' | 'develop' | 'ignore'): { ok: boolean; reason?: string } {
  const s = activeSteal(state);
  if (!s) return { ok: false, reason: '지금은 대응할 일이 없어요' };
  if (s.answer !== 'none') return { ok: false, reason: '이미 답했어요' };
  if (choice === 'counter' && state.money < RIVAL_COUNTER_COST) return { ok: false, reason: `맞불 홍보에 ₩${fmtNum(RIVAL_COUNTER_COST)}이 있어야 해요` };
  return { ok: true };
}
export function answerRival(state: GameState, choice: 'counter' | 'develop' | 'ignore'): void {
  const s = activeSteal(state);
  if (!s) return;
  s.answer = choice;
  if (choice === 'counter') {
    state.money -= RIVAL_COUNTER_COST;
    pushNotice(state, `맞불 홍보 — 이달 손님을 지켰어요`);
  } else if (choice === 'develop') {
    state.research += RIVAL_DEVELOP_RESEARCH;
    pushNotice(state, `메뉴로 맞받았어요 — 연구 +${RIVAL_DEVELOP_RESEARCH}`);
  } else {
    pushNotice(state, '이번 달은 그냥 두기로 했어요');
  }
}
/** 이번 달 뺏기 손해 배수 */
export function stealMult(state: GameState): number {
  const s = activeSteal(state);
  if (!s || s.answer === 'counter') return 1;
  if (s.answer === 'develop') return 1 - RIVAL_DEVELOP_PENALTY;
  return 1 - RIVAL_STEAL_PENALTY;
}

// ---------- 유행 겹침: 손님을 나눠 갖는다 ----------

/** 내가 이번 달 유행 분류를 **밀고 있나** — 이달 가장 많이 판 분류가 유행일 때만 그렇다.
 *  메뉴판에 올려만 뒀으면 아니다. 유행에 올라타는 것이 선택이 되려면 대가도 선택이어야 한다. */
export function pushingTrend(state: GameState): boolean {
  const want = state.trend ? state.trend.category : null;
  if (!want) return false;
  const byCat: Partial<Record<TrendCategory, number>> = {};
  let sold = 0;
  for (const [id, n] of Object.entries(state.monthMenuSold)) {
    let cat: TrendCategory;
    try { cat = menuCategory(state, id); } catch { continue; }
    byCat[cat] = (byCat[cat] ?? 0) + n;
    sold += n;
  }
  if (sold <= 0) return false;
  let top: TrendCategory = want;
  for (const [cat, n] of Object.entries(byCat) as [TrendCategory, number][]) if (n > (byCat[top] ?? 0)) top = cat;
  return top === want;
}
function menuCategory(state: GameState, menuId: string): TrendCategory {
  const m = menuOf(state, menuId);
  if (m.category === 'dessert') return 'dessert';
  if (m.category === 'meal' || m.category === 'signature') return 'meal';
  return m.id.includes('juice') || m.id.includes('ade') || m.id.includes('tea') ? 'juice' : 'coffee';
}
/** 이번 달 유행을 같이 미는 경쟁 카페 */
export function trendCompetitors(state: GameState): RivalDef[] {
  const want = state.trend ? state.trend.category : null;
  return want ? activeRivals(state).filter((d) => d.category === want) : [];
}
/** 유행이 겹칠 때 손님 배수 (점수가 같으면 ×0.92, 내가 훨씬 세면 ×1에 가깝다) */
export function trendShareMult(state: GameState): number {
  if (!pushingTrend(state)) return 1;
  const list = trendCompetitors(state);
  if (list.length === 0) return 1;
  const months = elapsedMonths(state);
  const theirs = list.reduce((n, d) => n + totalOf(rivalAxes(state.seed, d, months)), 0) / list.length;
  const mine = Math.max(1, rivalsState(state).myScore);
  return 1 - RIVAL_SHARE_MAX * (theirs / (theirs + mine));
}

// ---------- 손님 수 훅 ----------

/** 손님 유입 배수 (dailyGuestCount가 대회 배수 옆에서 곱한다). 1년차엔 늘 1 — 밴드를 건드리지 않는다. */
export function rivalGuestMult(state: GameState): number {
  if (!state.rivals || state.clock.year < RIVAL_EFFECT_YEAR) return 1;
  const st = state.rivals;
  let m = 1;
  if (st.myRank !== null) m *= 1 + (RIVAL_RANK_BONUS[st.myRank - 1] ?? 0);
  m *= stealMult(state);
  m *= trendShareMult(state);
  m *= 1 + RIVAL_ACQUIRE_BONUS * acquiredRivals(state).length;
  return m;
}

// ---------- 인수·제휴 (엔드게임) ----------

export function endgameOpen(state: GameState): boolean {
  const st = rivalsState(state);
  return state.clock.year >= RIVAL_DEAL_ENDGAME_YEAR && gradeOf(state) >= RIVAL_DEAL_GRADE && st.leadMonths >= RIVAL_DEAL_LEAD_MONTHS;
}
export function endgameReason(state: GameState): string {
  const st = rivalsState(state);
  if (state.clock.year < RIVAL_DEAL_ENDGAME_YEAR) return `${RIVAL_DEAL_ENDGAME_YEAR}년차부터 이야기를 꺼낼 수 있어요`;
  if (gradeOf(state) < RIVAL_DEAL_GRADE) return '카페 등급이 더 올라야 해요';
  return `동네 1위를 ${RIVAL_DEAL_LEAD_MONTHS}달 이어야 해요 (지금 ${st.leadMonths}달)`;
}
export function canAllyRival(state: GameState, id: string): { ok: boolean; reason?: string } {
  const st = rivalsState(state);
  const c = st.cafes[id];
  if (!c) return { ok: false, reason: '없는 카페예요' };
  if (c.acquired) return { ok: false, reason: '이미 우리 것이에요' };
  if (c.deal) return { ok: false, reason: '이미 제휴 중이에요' };
  if (!endgameOpen(state)) return { ok: false, reason: endgameReason(state) };
  return { ok: true };
}
export function allyRival(state: GameState, id: string): void {
  const st = rivalsState(state);
  st.cafes[id]!.deal = true;
  const d = rivalDef(id);
  pushNotice(state, `${josa(d.name, '과/와')} 손을 잡았어요 — ${josa(RIVAL_AXIS_LABEL[d.strength], '이/가')} 올라요`);
}
export function endAllyRival(state: GameState, id: string): void {
  const st = rivalsState(state);
  if (!st.cafes[id]?.deal) return;
  st.cafes[id]!.deal = false;
  pushNotice(state, `${josa(rivalDef(id).name, '과/와')}의 제휴를 끝냈어요`);
}
export function canAcquireRival(state: GameState, id: string): { ok: boolean; reason?: string } {
  const st = rivalsState(state);
  const c = st.cafes[id];
  if (!c) return { ok: false, reason: '없는 카페예요' };
  if (c.acquired) return { ok: false, reason: '이미 우리 것이에요' };
  if (!endgameOpen(state)) return { ok: false, reason: endgameReason(state) };
  if (state.money < RIVAL_ACQUIRE_COST) return { ok: false, reason: `₩${fmtNum(RIVAL_ACQUIRE_COST)}이 있어야 해요` };
  return { ok: true };
}
export function acquireRival(state: GameState, id: string): void {
  const st = rivalsState(state);
  const d = rivalDef(id);
  state.money -= RIVAL_ACQUIRE_COST;
  st.cafes[id]!.acquired = true;
  st.cafes[id]!.deal = false;
  st.cafes[id]!.rank = null;
  const rewards: GoalReward[] = [{ type: 'unlockFacility', id: d.gift }];
  applyRewards(state, rewards, { source: 'rival', refId: `acq_${id}`, title: `${d.name} 인수` });
  pushNotice(state, `${josa(d.name, '을/를')} 인수했어요 — 손님이 넘어와요`);
  pushFx(state, { kind: 'scene', title: `${d.name} 인수`, text: `이제 동네에서 한 곳이 줄었다. ${giftName(d.gift)}도 우리 것이다`, tick: state.tick });
}
function giftName(id: string): string {
  try { return objectDef(id).name; } catch { return '시설 하나'; }
}
/** 이달 제휴 고정비 합 (economy.ts 월 정산 훅) */
export function dealCost(state: GameState): number {
  if (!state.rivals) return 0;
  return RIVALS.filter((d) => state.rivals!.cafes[d.id]?.deal).length * RIVAL_DEAL_MONTHLY;
}

// ---------- 대회 상대 연결 ----------

/** 대회 상대 3곳 — 랜덤이 아니라 **동네 카페 5곳 중에서** 회차 해시로 고른다 (이름·강점이 이어진다).
 *  all: 인수한 카페는 빼고 고른다 — 우리 것이 된 곳이 대회에서 우리와 겨루면 말이 안 된다.
 *  남은 곳이 셋보다 적으면(넷을 인수) 그때는 다섯 곳 전부에서 고른다 — 상대 수는 언제나 셋이다. */
export function contestOpponents(seed: number, year: number, month: number, eventIndex: number, exclude: readonly string[] = []): RivalDef[] {
  const pool = exclude.length > 0 ? RIVALS.filter((d) => !exclude.includes(d.id)) : RIVALS;
  const from = pool.length >= 3 ? pool : RIVALS;
  const n = from.length;
  const start = hash32(seed, year, month, eventIndex + 1) % n;
  const out: RivalDef[] = [];
  for (let i = 0; i < Math.min(3, n); i++) out.push(from[(start + i) % n]!);
  return out;
}

// ---------- 훅 ----------

/** 매일 아침 (tick.ts onNewDay): 5일 발표 · 12일 뺏기 이벤트 */
export function dailyRivals(state: GameState): void {
  if (boardDue(state)) runBoard(state);
  if (stealDue(state)) rollSteal(state);
}
