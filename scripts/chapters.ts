/**
 * 「막」 난이도 측정 (teardown §7 측정 구멍): **러시를 손으로 하는 봇**.
 *
 * 기존 headless 봇은 `tick(s, DAY_MS)`로 하루를 통째로 민다 — 러시는 자동 착석만 돌고
 * 플레이어 조작 경로(줄에서 골라 제자리에 앉히기)를 한 번도 안 밟는다. 그래서 「막이 넘어가긴 하나」를
 * 재려면 러시 동안만 잘게 tick하면서 직접 앉히는 봇이 따로 있어야 한다.
 *
 * 이 봇이 하는 일:
 *   · 평소엔 heuristic 봇 그대로 (짓고 뽑고 홍보한다)
 *   · 달마다 **이번 막에 맞는 것**을 마당에 깐다 (그늘/귤밭/문 앞/전망)
 *   · 러시가 돌면 스텝마다 줄 맨 앞 손님을 **그 손님이 원하는 빈 자리**에 앉힌다 (없으면 아무 자리)
 *   · 직원은 자리가 가장 많이 모인 칸에 세운다
 *
 * 사용: pnpm tsx scripts/chapters.ts [years=5] [seed=1]
 * 찍는 것: 막마다 몇 주 만에 넘었나 · 등급 분포 · 연차별 자금.
 */
import { createInitialState } from '../src/sim/state.ts';
import { botDay, newBotCursor } from '../src/sim/bot.ts';
import { apply } from '../src/sim/actions.ts';
import { tick, STEP_MS } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/effects.ts';
import { rushState, rushPhase, rushSeatFits, wantOf, rushGrades, canSeatFromQueue, rushExpectedScore } from '../src/sim/rush.ts';
import { freeSeats } from '../src/sim/guests.ts';
import { currentChapter, chapterProgress, CHAPTERS } from '../src/sim/chapter.ts';
import { canSetPost, seatsAroundCell } from '../src/sim/staffPost.ts';
import { siteOf } from '../src/sim/site.ts';
import { canPlace } from '../src/sim/grid.ts';
import { parcelAt } from '../src/sim/parcels.ts';
import { objectDef } from '../src/data/index.ts';
import type { GameState } from '../src/sim/types.ts';

const years = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 1);

/** 이번 막이 요구하는 자리를 마당에 깐다. 한 달에 최대 이만큼. */
const PREP_PER_MONTH = 2;

/** 놓을 수 있는 내 땅 칸을 점수 순으로 */
function cellsByScore(s: GameState, type: string, score: (x: number, y: number) => number): { x: number; y: number; v: number }[] {
  const out: { x: number; y: number; v: number }[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (!parcelAt(s, x, y)?.owned || !canPlace(s, type, x, y).ok) continue;
    const v = score(x, y);
    if (v > -Infinity) out.push({ x, y, v });
  }
  return out.sort((a, b) => b.v - a.v);
}

function seatsOf(s: GameState) {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat');
}
function mainDoor(s: GameState) {
  return Object.values(s.objects).find((o) => o.type === 'warehouse');
}

/** 막마다 다른 준비 — 이게 「막 = 배치 과제」가 실제로 되는지 보는 부분이다 */
function prepareForChapter(s: GameState): void {
  const ch = currentChapter(s);
  if (!ch) return;
  let done = 0;
  const place = (type: string, x: number, y: number) => {
    if (done >= PREP_PER_MONTH) return false;
    if (!apply(s, { type: 'place', objectType: type, x, y }).ok) return false;
    done++;
    return true;
  };
  switch (ch.want) {
    case 'rest': // 그늘지고 조용한 자리 = 파라솔 (전망이 낮은 칸에)
      for (const c of cellsByScore(s, 'table_parasol', (x, y) => -siteOf(s, x, y).view)) if (!place('table_parasol', c.x, c.y)) break;
      break;
    case 'farm': { // 감귤나무를 자리 곁에, 자리가 없으면 자리부터
      const seats = seatsOf(s);
      if (seats.length === 0) { for (const c of cellsByScore(s, 'table_out', () => 0)) if (!place('table_out', c.x, c.y)) break; break; }
      for (const c of cellsByScore(s, 'tangerine_tree', (x, y) => -Math.min(...seats.map((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)))))) {
        if (!place('tangerine_tree', c.x, c.y)) break;
      }
      break;
    }
    case 'convenience': { // 문에서 가까운 자리
      const main = mainDoor(s);
      if (!main) break;
      for (const c of cellsByScore(s, 'table_out', (x, y) => -(Math.abs(x - main.x) + Math.abs(y - main.y)))) if (!place('table_out', c.x, c.y)) break;
      break;
    }
    case 'scenery': { // 전망 2 이상이 되려면 「경관치 3 이상」이 자리 곁에 모여야 한다 — 꽃밭(2)은 전망에 안 잡힌다
      const seats = seatsOf(s);
      const best = Math.max(0, ...seats.map((o) => siteOf(s, o.x, o.y).view));
      if (best >= 2) { for (const c of cellsByScore(s, 'table_out', (x, y) => siteOf(s, x, y).view)) if (!place('table_out', c.x, c.y)) break; break; }
      for (const c of cellsByScore(s, 'cherry_tree', (x, y) => seats.length === 0 ? 0 : -Math.min(...seats.map((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)))))) {
        if (!place('cherry_tree', c.x, c.y)) break;
      }
      break;
    }
    default: // 5막: 특별히 깔 것 없음 — 자리만 늘린다
      for (const c of cellsByScore(s, 'table_out', (x, y) => siteOf(s, x, y).view)) if (!place('table_out', c.x, c.y)) break;
  }
}

/** 홀 직원을 자리가 가장 많이 모인 칸에 세운다 */
function placeStaff(s: GameState): void {
  for (const st of s.staff) {
    if (st.role !== 'hall' || st.training) continue;
    let best: { x: number; y: number; n: number } | null = null;
    for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
      if (!canSetPost(s, st.id, x, y).ok) continue;
      const n = seatsAroundCell(s, x, y).length;
      if (n > 0 && (!best || n > best.n)) best = { x, y, n };
    }
    if (best) apply(s, { type: 'setStaffPost', staffId: st.id, x: best.x, y: best.y });
  }
}

/** 줄 맨 앞부터, 그 손님이 원하는 빈 자리에 앉힌다 (없으면 아무 빈 자리) */
function seatBest(s: GameState): boolean {
  const r = rushState(s);
  const g = r.queue[0];
  if (!g) return false;
  const free = freeSeats(s);
  if (free.length === 0) return false;
  const fit = free.find((o) => rushSeatFits(s, o, g.type));
  const seat = fit ?? free[0]!;
  if (!canSeatFromQueue(s, g.id, seat.id).ok) return false;
  return apply(s, { type: 'seatFromQueue', guestId: g.id, objectId: seat.id }).ok;
}

// ---------- 한 판 ----------

const s = createInitialState(seed, 'local', 0, 'open');
s.tutorial.step = 5; // 튜토리얼 대사는 UI가 띄운다 — 측정에서는 건너뛴다
const cur = newBotCursor();
const clearedAt: (number | null)[] = CHAPTERS.map(() => null);
let rushes = 0;
let manualSeated = 0;
/** 판마다 (점수, 받은 손님, 온 손님, 기대 점수, 이번 막 적중) */
const perRush: { year: number; score: number; served: number; arrived: number; expect: number; hits: number; grade: string }[] = [];
const wantHits = new Map<string, number>();
const moneyByYear: string[] = [];

for (let day = 0; day < years * 12 * 30; day++) {
  const idxBefore = chapterProgress(s).idx;
  if (s.clock.day === 1) { prepareForChapter(s); placeStaff(s); }
  // 러시가 있는 날은 잘게, 아니면 하루 통째로
  if (s.clock.day % 7 === 6) {
    const cursorBefore = { ...cur };
    if (s.clock.month !== cur.lastMonth) { cur.lastMonth = s.clock.month; cur.monthsPlayed++; }
    void cursorBefore;
    const end = dayIndex(s.clock) + 1;
    let noted = false;
    let guard = 0;
    while (dayIndex(s.clock) < end && guard++ < 5000) {
      tick(s, STEP_MS);
      if (rushPhase(s) === 'run') { while (seatBest(s)) manualSeated++; }
      if (rushPhase(s) === 'done' && !noted) {
        noted = true;
        const r = rushState(s);
        perRush.push({ year: s.clock.year, score: r.score, served: r.served, arrived: r.arrived, expect: rushExpectedScore(s, r.arrived, r.served), hits: r.chapterHits ?? 0, grade: r.grade ?? '?' });
        for (const t of r.done) { const w = wantOf(t); wantHits.set(w, (wantHits.get(w) ?? 0) + 1); }
      }
    }
    if (s.lastMonthCard) apply(s, { type: 'dismissMonthCard' });
  } else {
    botDay(s, cur);
  }
  if (chapterProgress(s).idx !== idxBefore) {
    clearedAt[idxBefore] = Math.floor(day / 7) + 1;
  }
  if (s.clock.day === 30 && s.clock.month === 12) moneyByYear.push(`${s.clock.year}년차 ₩${s.money.toLocaleString('en-US')}`);
}
rushes = Object.values(rushGrades(s)).reduce((a, b) => a + b, 0);

const g = rushGrades(s);
console.log(`씨앗 ${seed} · ${years}년 · 러시 ${rushes}판 (S ${g.S} · A ${g.A} · B ${g.B} · C ${g.C}) · 직접 앉힌 손님 ${manualSeated}명`);
for (let i = 0; i < CHAPTERS.length; i++) {
  const w = clearedAt[i];
  console.log(`  ${CHAPTERS[i]!.name} — ${w === null ? '못 넘음' : `${w}주차에 넘음`}`);
}
console.log(`  ${moneyByYear.join(' · ')}`);
const avg = (f: (r: typeof perRush[number]) => number) => (perRush.reduce((a, r) => a + f(r), 0) / Math.max(1, perRush.length)).toFixed(1);
console.log(`  판당: 온 손님 ${avg((r) => r.arrived)} · 받은 손님 ${avg((r) => r.served)} · 점수 ${avg((r) => r.score)} · 기준 ${avg((r) => r.expect)} · 손님 하나당 ${(perRush.reduce((a, r) => a + r.score, 0) / Math.max(1, perRush.reduce((a, r) => a + r.served, 0))).toFixed(1)}점`);
for (let y = 1; y <= years; y++) {
  const rs = perRush.filter((r) => r.year === y);
  if (rs.length === 0) continue;
  const c = (g: string) => rs.filter((r) => r.grade === g).length;
  console.log(`  ${y}년차: ${rs.length}판 (S ${c('S')} · A ${c('A')} · B ${c('B')} · C ${c('C')}) · 판당 점수 ${(rs.reduce((a, r) => a + r.score, 0) / rs.length).toFixed(0)} / 기준 ${(rs.reduce((a, r) => a + r.expect, 0) / rs.length).toFixed(0)} · 놓친 ${(rs.reduce((a, r) => a + (r.arrived - r.served), 0) / rs.length).toFixed(1)}명`);
}
const ratios = perRush.map((r) => r.score / Math.max(1, r.expect)).sort((a, b) => a - b);
const pct = (q: number) => ratios[Math.min(ratios.length - 1, Math.floor(q * ratios.length))]!.toFixed(2);
console.log(`  점수/기준 분포: 10% ${pct(0.1)} · 50% ${pct(0.5)} · 75% ${pct(0.75)} · 90% ${pct(0.9)} · 최고 ${ratios.at(-1)!.toFixed(2)}`);
console.log(`  받은 손님이 보던 것: ${[...wantHits].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ${n}`).join(' · ')}`);
const cp = chapterProgress(s);
const bestView = Math.max(0, ...seatsOf(s).map((o) => siteOf(s, o.x, o.y).view));
console.log(`  멈춘 막: ${currentChapter(s)?.name ?? '없음'} · 제자리 ${cp.hits ?? 0}명 · 등급 ${cp.grades ?? 0}판 · 자리 최고 전망 ${bestView}`);
console.log(`  최종 자금 ₩${s.money.toLocaleString('en-US')} · 자리 ${seatsOf(s).length}개 · 직원 ${s.staff.length}명 · 평판 ${Math.round(s.reputation)}`);
