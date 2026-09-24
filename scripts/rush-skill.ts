/**
 * 러시 조작 효과 측정 (rush-battle §7-2: 「플레이어 조작이 점수를 20% 이상 바꾼다」).
 *
 * 같은 세이브(봇이 n주를 돌린 상태)를 두 벌 복제해서
 *   A. 무조작  — resolveRushAuto (기존 착석 로직, 점수 계수 0.6)
 *   B. 이상적 조작 — 줄이 서는 즉시 취향·명당에 맞는 빈 자리로 배정, 밀린 주문 우선 처리
 * 를 돌려 점수·등급·받은 손님·놓친 손님을 견준다.
 * teardown §3: 직원 액티브 스킬은 없어졌다 — 조작은 「자리 배정」과 「밀린 주문」 둘뿐이다.
 *
 * 사용: pnpm tsx scripts/rush-skill.ts [rushes=8] [seed=1]
 */
import type { GameState } from '../src/sim/types.ts';
import { createInitialState } from '../src/sim/state.ts';
import { botDay, newBotCursor } from '../src/sim/bot.ts';
import { apply } from '../src/sim/actions.ts';
import { tick } from '../src/sim/tick.ts';
import { HOUR_MS } from '../src/sim/clock.ts';
import { cloneState } from '../src/sim/solver.ts';
import { freeSeats, totalSeats } from '../src/sim/guests.ts';
import {
  rushState, isRushDay, rushDoneThisWeek, startRushNow, stepRush, resolveRushAuto, rushSeatFits,
  canRushPriority, rushGradeOf, RUSH_READY_HOUR,
} from '../src/sim/rush.ts';

const wanted = Number(process.argv[2] ?? 8);
const seed = Number(process.argv[3] ?? 1);

/** 이상적 조작: 배정 → 밀린 주문. 러시가 끝날 때까지. */
function playIdeal(s: GameState) {
  const r = startRushNow(s);
  let guard = 4000;
  while (r.phase === 'run' && guard-- > 0) {
    // 1) 자리 배정: 줄 앞부터, 취향·명당·전망이 맞는 빈 자리를 우선
    for (const g of [...r.queue]) {
      const open = freeSeats(s);
      if (open.length === 0) break;
      const seat = open.find((o) => rushSeatFits(s, o, g.type)) ?? open[0]!;
      apply(s, { type: 'seatFromQueue', guestId: g.id, objectId: seat.id });
    }
    // 2) 밀린 주문 우선 처리 (자리마다 한 번)
    for (const gg of s.guests) if (gg.seatId && canRushPriority(s, gg.seatId).ok) apply(s, { type: 'rushPriority', objectId: gg.seatId });
    stepRush(s);
  }
  return r;
}

const s = createInitialState(seed);
const cur = newBotCursor();
const rows: { week: string; seats: number; auto: number; ideal: number; autoG: string; idealG: string; aServed: number; iServed: number; aLeft: number; iLeft: number }[] = [];
let day = 0;
while (rows.length < wanted && day < 1200) {
  // 러시 날 아침, 봇의 진행은 그대로 두고 그 시점 상태를 두 벌 복제해 러시 직전(11시)까지 각각 굴린다
  if (isRushDay(s) && !rushDoneThisWeek(s)) {
    const a = cloneState(s);
    const b = cloneState(s);
    for (const c of [a, b]) while (c.clock.hour < RUSH_READY_HOUR) tick(c, HOUR_MS);
    startRushNow(a);
    startRushNow(b);
    const ar = resolveRushAuto(a)!;
    const br = playIdeal(b);
    rows.push({
      week: `${s.clock.year}년 ${s.clock.month}월 ${s.clock.day}일`, seats: totalSeats(s),
      auto: ar.score, ideal: br.score,
      autoG: rushGradeOf(a, ar.score, ar.arrived), idealG: rushGradeOf(b, br.score, br.arrived),
      aServed: ar.served, iServed: br.served, aLeft: ar.left, iLeft: br.left,
    });
  }
  botDay(s, cur);
  if (s.lastMonthCard) apply(s, { type: 'dismissMonthCard' });
  day++;
}

console.log('| 날짜 | 자리 | 무조작 점수 | 이상적 점수 | 차이 | 무조작(받음/놓침·등급) | 조작(받음/놓침·등급) |');
console.log('|---|---|---|---|---|---|---|');
let sumA = 0;
let sumB = 0;
for (const r of rows) {
  sumA += r.auto; sumB += r.ideal;
  const pct = r.auto > 0 ? `+${Math.round(((r.ideal - r.auto) / r.auto) * 100)}%` : '—';
  console.log(`| ${r.week} | ${r.seats} | ${r.auto} | ${r.ideal} | ${pct} | ${r.aServed}/${r.aLeft} ${r.autoG} | ${r.iServed}/${r.iLeft} ${r.idealG} |`);
}
const gain = sumA > 0 ? ((sumB - sumA) / sumA) * 100 : 0;
console.log(`\n합계: 무조작 ${sumA} → 조작 ${sumB} (+${gain.toFixed(1)}%) — §7-2 기준 20% ${gain >= 20 ? '통과' : '미달'}`);
