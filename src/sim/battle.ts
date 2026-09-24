/**
 * 동네 대항전 (스펙 §4) — 매월 **마지막 주 토요일**은 평소 러시 대신 경쟁 카페 한 곳과 1:1로 붙는다.
 *
 * 대회(contest.ts)와 역할이 갈린다:
 *  - **대회** = 메뉴 품질 심사. 연 2회, 심사위원이 맛·모양·향을 본다. 상대는 3곳.
 *  - **대항전** = 영업 실력. 매월 1회, 같은 시간 동안 누가 손님을 더 잘 받았나로 갈린다. 상대는 1곳.
 * 문구도 「심사」가 아니라 「붙는다·이겼다」로 쓴다.
 *
 * 상대: 순위가 가장 가까운 곳부터. 이미 항복받았거나 인수한 곳은 빠진다.
 * 상대 점수 = 그 카페 **성장 곡선**(rival.ts rivalAxes) + **회차 해시 난수** + **우리 등급 보정**(잘될수록 상대도 세진다).
 * 주 rng도 보조 스트림도 쓰지 않아 같은 세이브면 언제 계산해도 같은 값이다 — 봇 KPI 밴드·리플레이가 흔들리지 않는다.
 *
 * 승패:
 *  - 이기면 그 집 단골 1~2명이 **우리 가게로 영구히 옮겨 오고**, 상금이 들어오고, 동네 순위 「서비스」가 오른다.
 *  - 지면 우리 단골 한 명이 그쪽으로 간다 (가장 늦게 생긴 단골부터 — 오래된 정은 잘 안 끊긴다).
 *  - **3연승이면 항복**: 그 집 손님층이 우리 쪽으로 넘어온다(손님 +5%). 5곳을 다 이기면 동네 1위 고정.
 *
 * 1년차엔 열리지 않는다 (rival.ts의 손님 수 효과와 같은 이유 — 1년차 밴드를 건드리지 않는다).
 */
import type { BattleMove, BattleRecord, BattleResult, BattleState, GameState, GoalReward, RivalDef } from './types.ts';
import { DAYS_PER_MONTH, monthIndex } from './clock.ts';
import { gradeOf } from './grade.ts';
import { roleHeads } from './staff.ts';
import { totalSeats } from './guests.ts';
import { cleanValue } from './reputation.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { josa } from './josa.ts';
import { fmtNum } from './format.ts';
import { applyRewards } from './goals.ts';
import { RIVALS, activeRivals, rivalDef, rivalAxes, totalOf, elapsedMonths, scoreboard, rivalsState } from './rival.ts';
import { registerRegular, regularList, forgetRegular } from './interact.ts';
import { guestTypeDef } from '../data/index.ts';
import { RUSH_WEEKDAY, weekdayOf } from './rush.ts'; // 대항전은 그달 마지막 러시 날(마지막 주 토요일)에 붙는다

// ---------- 일정 ----------

/** 1년차엔 대항전이 없다 (rival.ts RIVAL_EFFECT_YEAR와 같은 이유) */
export const BATTLE_FROM_YEAR = 2;
/** 며칠 전에 예고 카드를 띄우나 */
export const BATTLE_NOTICE_DAYS = 3;

/** 그달 마지막 러시 날 (= 마지막 주 토요일). 30일 달에서 27일. */
export function battleDay(): number {
  for (let d = DAYS_PER_MONTH; d >= 1; d--) if (weekdayOf(d) === RUSH_WEEKDAY) return d;
  return DAYS_PER_MONTH;
}
export function isBattleDay(state: GameState): boolean {
  return state.clock.day === battleDay();
}
/** 대항전까지 남은 날 (지났으면 다음 달 것까지). 음수는 없다. */
export function daysToBattle(state: GameState): number {
  const d = battleDay();
  return state.clock.day <= d ? d - state.clock.day : DAYS_PER_MONTH - state.clock.day + d;
}
export function battleOpen(state: GameState): boolean {
  return state.clock.year >= BATTLE_FROM_YEAR;
}
/** 이달 판이 이미 끝났나 (예고 카드가 「오늘 붙어요」를 계속 띄우지 않게) */
export function battleSettled(state: GameState): boolean {
  const b = state.battle;
  return !!b && b.lastMonthIndex === monthIndex(state.clock) && (b.round?.done ?? false);
}
/** 예고 카드가 쓰는 남은 날 — 이달 판이 끝났으면 다음 달 것까지 센다 */
export function battleDaysLeft(state: GameState): number {
  return battleSettled(state) ? DAYS_PER_MONTH - state.clock.day + battleDay() : daysToBattle(state);
}

// ---------- 상태 ----------

export function initBattle(): BattleState {
  const records: Record<string, BattleRecord> = {};
  for (const r of RIVALS) records[r.id] = { wins: 0, losses: 0, streak: 0, surrendered: false };
  return { records, round: null, last: null, pending: false, rankPoints: 0, champion: false, lastMonthIndex: -1 };
}
export function battleState(state: GameState): BattleState {
  const b = (state.battle ??= initBattle());
  for (const d of RIVALS) b.records[d.id] ??= { wins: 0, losses: 0, streak: 0, surrendered: false };
  return b;
}
export function battleRecord(state: GameState, rivalId: string): BattleRecord {
  return battleState(state).records[rivalId] ?? { wins: 0, losses: 0, streak: 0, surrendered: false };
}
/** 「3승 1패」 — 아직 안 붙었으면 「아직」 */
export function recordText(rec: BattleRecord): string {
  if (rec.surrendered) return `${rec.wins}승 ${rec.losses}패 · 항복`;
  if (rec.wins + rec.losses === 0) return '아직';
  return `${rec.wins}승 ${rec.losses}패`;
}
/** 우리 전체 전적 (순위표 내 줄) */
export function myRecord(state: GameState): BattleRecord {
  const b = battleState(state);
  let wins = 0;
  let losses = 0;
  for (const d of RIVALS) { wins += b.records[d.id]!.wins; losses += b.records[d.id]!.losses; }
  return { wins, losses, streak: 0, surrendered: false };
}
/** 항복받은 카페 수 */
export function surrenderedCount(state: GameState): number {
  if (!state.battle) return 0;
  return RIVALS.filter((d) => state.battle!.records[d.id]?.surrendered).length;
}

// ---------- 상대 고르기 ----------

/** 아직 붙을 수 있는 카페 (항복·인수한 곳은 빠진다) */
export function battleRivals(state: GameState): RivalDef[] {
  const b = battleState(state);
  return activeRivals(state).filter((d) => !b.records[d.id]!.surrendered);
}
/** 이번 달 상대 — 순위표에서 나와 가장 가까운 곳(위쪽 먼저). 없으면 null. */
export function battleOpponent(state: GameState): RivalDef | null {
  const pool = battleRivals(state);
  if (pool.length === 0) return null;
  const ok = new Set(pool.map((d) => d.id));
  const rows = scoreboard(state);
  const i = rows.findIndex((r) => r.me);
  for (let step = 1; step < rows.length; step++) {
    for (const j of [i - step, i + step]) {
      const r = rows[j];
      if (r && !r.me && ok.has(r.id)) return rivalDef(r.id);
    }
  }
  return pool[0] ?? null;
}

// ---------- 점수 ----------

function hash32(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; }
  return h >>> 0;
}

/** 상대 점수: 성장 곡선 × 배수 + 해시 난수 + 우리 등급 보정 */
export const BATTLE_SCORE_PER = 3.4;      // 네 항목 총점 1점 = 대항전 3.4점 (네 항목 100점 만점 = 340점, 우리 상한과 같은 자리)
export const BATTLE_NOISE = 41;           // 난수 폭 ±20
export const BATTLE_GRADE_ADJ = 12;       // 우리 등급이 한 칸 오를 때마다 상대도 이만큼 세진다
export function rivalBattleScore(state: GameState, def: RivalDef): number {
  const months = elapsedMonths(state);
  const curve = totalOf(rivalAxes(state.seed, def, months)) * BATTLE_SCORE_PER;
  const noise = (hash32(state.seed, months, def.name.length, 131) % BATTLE_NOISE) - (BATTLE_NOISE - 1) / 2;
  const grade = BATTLE_GRADE_ADJ * Math.max(0, gradeOf(state) - 1);
  return Math.max(0, Math.round(curve + noise + grade));
}

/** 무조작 자동 해결 점수 (§2 「봇·헤드리스는 자동 해결」).
 *  §2의 점수식(받은 손님 수 × 10 + 팁 + 자리 보너스)을 스탯으로 옮긴 것이다.
 *  **받은 손님 수는 줄 길이·빈 자리·서빙 손이 함께 정한다** — 자리만 늘려도, 직원만 늘려도 점수가 안 오른다.
 *  조작(자리 배정·스킬·밀린 주문)은 러시가 이 위에 얹는다 (§7-2: 조작이 20% 이상 바꾼다). */
export const BATTLE_LINE = 20;            // 줄은 최대 20명 (§2 난이도 곡선)
export const BATTLE_OWNER_GUESTS = 4;     // 주인 혼자 받는 몫
export const BATTLE_HALL_GUESTS = 4;      // 홀 한 몫이 더 받는 손님
export const BATTLE_KITCHEN_GUESTS = 3;   // 조리 한 몫이 더 받는 손님
export const BATTLE_PER_GUEST = 10;       // 받은 손님 한 명 = 10점 (§2)
export const BATTLE_TIP_PER_REP = 0.6;    // 평판이 팁으로
export const BATTLE_CLEAN_PER = 0.3;      // 깨끗하면 자리 보너스
export function autoBattleScore(state: GameState): number {
  const hands = BATTLE_OWNER_GUESTS + roleHeads(state, 'hall') * BATTLE_HALL_GUESTS
    + (roleHeads(state, 'barista') + roleHeads(state, 'cook')) * BATTLE_KITCHEN_GUESTS;
  const served = Math.min(BATTLE_LINE, totalSeats(state), hands);
  return Math.max(0, Math.round(
    served * BATTLE_PER_GUEST
    + state.reputation * BATTLE_TIP_PER_REP
    + cleanValue(state) * BATTLE_CLEAN_PER,
  ));
}

/** 예상 승률 % (예고 카드). 점수 차를 완만한 계단으로 바꾼다. */
export const BATTLE_ODDS_SPREAD = 120;
export function winChancePct(myScore: number, theirScore: number): number {
  const d = (myScore - theirScore) / BATTLE_ODDS_SPREAD;
  const p = 1 / (1 + Math.exp(-d * 2));
  return Math.max(5, Math.min(95, Math.round(p * 100)));
}

export interface BattlePreview {
  def: RivalDef;
  record: BattleRecord;
  myScore: number;      // 무조작 기준 예상 점수 (조작하면 더 올라간다)
  theirScore: number;
  chancePct: number;
  daysLeft: number;
}
/** 예고 카드 자료 (상대·전적·예상 승률). 상태를 바꾸지 않는다. */
export function battlePreview(state: GameState): BattlePreview | null {
  if (!battleOpen(state)) return null;
  const def = battleOpponent(state);
  if (!def) return null;
  const myScore = autoBattleScore(state);
  const theirScore = rivalBattleScore(state, def);
  return { def, record: battleRecord(state, def.id), myScore, theirScore, chancePct: winChancePct(myScore, theirScore), daysLeft: battleDaysLeft(state) };
}

// ---------- 보상 ----------

/** 상금 = 등급 × 이 값 (등급이 오를수록 상대도 세진다 — 값도 같이 오른다) */
export const BATTLE_PRIZE_PER_GRADE = 100_000;
/** 이기면 넘어오는 단골 수 (해시로 1~2) */
export const BATTLE_WIN_REGULARS = [1, 2];
/** 승리 한 번이 동네 순위 「서비스」에 더하는 점수 (패배는 같은 만큼 깎인다) */
export const BATTLE_RANK_POINT = 0.8;
export const BATTLE_RANK_POINT_MAX = 6;
/** 3연승이면 항복 */
export const BATTLE_SURRENDER_STREAK = 3;
/** 항복받은 카페 한 곳당 손님 +3% (그 집 손님층 30%가 넘어온 몫 — 동네 여섯 집 중 한 집의 30%) */
export const BATTLE_SURRENDER_GUESTS = 0.03;

/** 항복·1위 고정이 손님 수에 더하는 배수 (rival.ts rivalGuestMult가 곱한다) */
export function battleGuestMult(state: GameState): number {
  if (!state.battle) return 1;
  return 1 + BATTLE_SURRENDER_GUESTS * surrenderedCount(state);
}

// ---------- 한 판 ----------

/** 오늘 판을 열 때가 됐나 (달마다 한 번) */
export function battleDue(state: GameState): boolean {
  if (!battleOpen(state) || !isBattleDay(state)) return false;
  const b = battleState(state);
  return b.lastMonthIndex !== monthIndex(state.clock) && battleOpponent(state) !== null;
}

/** 판을 연다 — 상대와 상대 점수를 못 박고, 우리 점수는 러시가 채운다.
 *  TODO(rush1): rush.ts가 러시를 끝낼 때 resolveBattle(state, 러시 점수)를 부른다. */
export function startBattle(state: GameState): void {
  const def = battleOpponent(state);
  if (!def) return;
  const b = battleState(state);
  b.round = { rivalId: def.id, monthIndex: monthIndex(state.clock), theirScore: rivalBattleScore(state, def), myScore: 0, done: false };
  b.lastMonthIndex = monthIndex(state.clock);
  pushNotice(state, `오늘은 ${josa(def.name, '과/와')} 붙는 날이에요`);
}
/** 진행 중인 판 (오늘·이달 것만) */
export function activeBattle(state: GameState) {
  const b = state.battle;
  const r = b?.round;
  return r && !r.done && r.monthIndex === monthIndex(state.clock) ? r : null;
}
/** 러시 HUD 비교 바 한 줄 (TODO(rush2): Rush HUD가 이걸 그린다). 판이 없으면 null. */
export function battleHud(state: GameState): { rivalName: string; myScore: number; theirScore: number; leading: boolean } | null {
  const r = activeBattle(state);
  if (!r) return null;
  return { rivalName: rivalDef(r.rivalId).name, myScore: r.myScore, theirScore: r.theirScore, leading: r.myScore >= r.theirScore };
}
/** 러시가 점수를 올릴 때마다 (TODO(rush1)) */
export function setBattleScore(state: GameState, myScore: number): void {
  const r = activeBattle(state);
  if (r) r.myScore = Math.max(0, Math.round(myScore));
}

/** 승패를 가른다. myScore를 안 주면 자동 해결 점수를 쓴다 (봇·헤드리스). */
export function resolveBattle(state: GameState, myScore?: number): BattleResult | null {
  const b = battleState(state);
  const round = b.round;
  if (!round || round.done) return null;
  const def = rivalDef(round.rivalId);
  const rec = b.records[def.id]!;
  const mine = Math.max(0, Math.round(myScore ?? (round.myScore > 0 ? round.myScore : autoBattleScore(state))));
  round.myScore = mine;
  round.done = true;
  const won = mine >= round.theirScore;
  const rankBefore = rivalsState(state).myRank;
  const moved: BattleMove[] = [];
  let prize = 0;
  let surrender = false;

  if (won) {
    rec.wins++;
    rec.streak++;
    b.rankPoints = Math.min(BATTLE_RANK_POINT_MAX, b.rankPoints + BATTLE_RANK_POINT);
    const n = BATTLE_WIN_REGULARS[hash32(state.seed, round.monthIndex, 7) % BATTLE_WIN_REGULARS.length] ?? 1;
    moved.push(...gainRegulars(state, n));
    prize = BATTLE_PRIZE_PER_GRADE * gradeOf(state);
    if (rec.streak >= BATTLE_SURRENDER_STREAK && !rec.surrendered) {
      rec.surrendered = true;
      surrender = true;
      moved.push(...gainRegulars(state, 1));
      if (battleRivals(state).length === 0) b.champion = true;
    }
  } else {
    rec.losses++;
    rec.streak = 0;
    b.rankPoints = Math.max(0, b.rankPoints - BATTLE_RANK_POINT);
    moved.push(...loseRegular(state));
  }

  if (prize > 0) {
    applyRewards(state, [{ type: 'money', amount: prize }] as GoalReward[], { source: 'rival', refId: `battle${round.monthIndex}`, title: `${def.name} 이김` });
  }
  const rankAfter = scoreboard(state).find((r) => r.me)?.rank ?? null;
  const result: BattleResult = {
    rivalId: def.id, rivalName: def.name, monthIndex: round.monthIndex,
    myScore: mine, theirScore: round.theirScore, won, prize, moved, surrender, rankBefore, rankAfter,
  };
  b.last = result;
  b.pending = true;
  pushNotice(state, resultLine(result));
  pushFx(state, { kind: 'scene', title: won ? `${def.name} 이겼다` : `${def.name}에 졌다`, text: sceneText(result), tick: state.tick });
  if (b.champion) {
    pushNotice(state, '동네 카페 다섯 곳이 모두 손을 들었어요');
    pushFx(state, { kind: 'scene', title: '동네 1위', text: '다섯 집 모두 우리 손님을 넘겨줬다. 이제 이 동네는 우리 차지다', tick: state.tick });
  }
  return result;
}

/** 이겨서 넘어오는 단골 — 아직 단골이 없는 해금 손님층에서 결정적으로 고른다 */
function gainRegulars(state: GameState, n: number): BattleMove[] {
  const have = new Set(regularList(state).map((r) => r.guestType));
  const pool = Object.entries(state.guestTypes).filter(([id, t]) => t.unlocked && !have.has(id)).map(([id]) => id).sort();
  const out: BattleMove[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = hash32(state.seed, state.tick, i, 53) % pool.length;
    const typeId = pool.splice(idx, 1)[0]!;
    const r = registerRegular(state, typeId);
    out.push({ name: r.name, typeName: guestTypeDef(typeId).name, to: 'us' });
  }
  return out;
}
/** 져도 이만큼은 남는다 — 질 때마다 한 명씩 빠지면 한 번 밀린 카페가 영영 못 일어선다 */
export const BATTLE_KEEP_REGULARS = 3;
/** 져서 떠나는 단골 한 명 — 가장 늦게 생긴 단골부터 (오래된 정은 잘 안 끊긴다) */
function loseRegular(state: GameState): BattleMove[] {
  const list = regularList(state);
  if (list.length <= BATTLE_KEEP_REGULARS) return [];
  const victim = [...list].sort((a, b) => b.day - a.day || b.id.localeCompare(a.id))[0]!;
  const gone = forgetRegular(state, victim.id);
  if (!gone) return [];
  return [{ name: gone.name, typeName: guestTypeDef(gone.guestType).name, to: 'them' }];
}

/** 알림 한 줄 */
export function resultLine(r: BattleResult): string {
  const score = `${r.myScore} 대 ${r.theirScore}`;
  if (!r.won) return `${r.rivalName}에게 ${score}로 졌어요`;
  if (r.surrender) return `${josa(r.rivalName, '이/가')} 손을 들었어요`;
  return `${josa(r.rivalName, '을/를')} ${score}로 이겼어요`;
}
/** 결과 장면 한 줄 */
export function sceneText(r: BattleResult): string {
  const names = r.moved.map((m) => m.name).join(' · ');
  if (r.surrender) return `${names} 씨까지 우리 쪽으로. 그 집은 더 못 버틴다`;
  if (r.won) return names ? `${names} 씨가 이제 우리 손님이다` : `상금 ₩${fmtNum(r.prize)}이 들어왔다`;
  return names ? `${names} 씨가 그 집으로 갔다` : '오늘은 저쪽이 더 잘 받았다';
}

// ---------- 훅 ----------

/** 매일 아침 (tick.ts onNewDay). 예고 → 판 열기 → (러시가 없으면) 자동 해결. */
export function dailyBattle(state: GameState): void {
  if (!battleOpen(state)) return;
  if (daysToBattle(state) === BATTLE_NOTICE_DAYS) {
    const p = battlePreview(state);
    if (p) pushNotice(state, `${BATTLE_NOTICE_DAYS}일 뒤 ${josa(p.def.name, '과/와')} 붙어요`);
  }
  // 어제 판이 열렸는데 러시를 못 치른 경우(러시 시간대가 지난 뒤 연 세이브)는 오늘 아침에 자동으로 매듭짓는다
  const stale = state.battle?.round;
  if (stale && !stale.done && stale.monthIndex !== monthIndex(state.clock)) resolveBattle(state);
  if (!battleDue(state)) return;
  startBattle(state);
  if (!rushWillResolve(state)) resolveBattle(state);
}
/** 러시가 이 판을 직접 끝낼 것인가 — 러시가 있으면 그날 러시 점수가 곧 대항전 점수다 (tick.ts가 잇는다). */
function rushWillResolve(state: GameState): boolean {
  return state.rush !== undefined;
}

/** 결과 연출을 닫는다 (actions dismissBattle) */
export function dismissBattle(state: GameState): void {
  if (state.battle) state.battle.pending = false;
}
