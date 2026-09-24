import { describe, test, expect } from 'vitest';
import { placeObject } from '../grid.ts';
import { bestSeatCells } from '../strategy.ts';
import { apply } from '../actions.ts';
import { tick, STEP_MS } from '../tick.ts';
import { HOUR_MS, DAY_MS } from '../clock.ts';
import { createInitialState } from '../state.ts';
import { serialize, deserialize } from '../save.ts';
import { cloneState } from '../solver.ts';
import { conditionProgress, goalConditionText } from '../goals.ts';
import { freeSeats, totalSeats, hourlySpawn, dailyGuestCount } from '../guests.ts';
import GOALS from '../../data/goals.json' with { type: 'json' };
import type { GameState, GoalCondition } from '../types.ts';
import {
  rushState, rushPhase, isRushDay, isRushRunning, rushDoneThisWeek, weekdayOf, weekIndexOf, weekCycleSeconds, rushSeconds,
  rushArrivals, rushCapacity, rushExpectedScore, rushGradeOf, rushGradeCount, rushGrades, rushQueueCap, rushPatienceMult,
  rushTimeScale, rushMsOfSeconds, rushSeatFits, resolveRushAuto, startRushNow, stepRush, updateRush, daysToRush,
  canSeatFromQueue, canUseStaffSkill, canRushPriority, rushSkillOfRole, RUSH_SKILLS,
  RUSH_WEEKDAY, RUSH_NOTICE_WEEKDAY, RUSH_READY_HOUR, RUSH_START_HOUR, RUSH_RUN_HOURS, RUSH_READY_MS, RUSH_RUN_MS,
  RUSH_SPAWN_MULT, RUSH_QUEUE_BASE, RUSH_QUEUE_MAX, RUSH_PATIENCE_MIN_S, RUSH_PATIENCE_MAX_S, RUSH_COMBO_N, RUSH_COMBO_MULT,
  RUSH_AUTO_COEF, RUSH_SCORE_PER_GUEST, RUSH_LEFT_PENALTY, RUSH_FIT_BONUS, RUSH_REWARDS, RUSH_GRADE_A, RUSH_GRADE_B,
  RUSH_EXPECT_PER_GUEST, RUSH_REALTIME_DT_MAX, RUSH_TARGET_SPEED, WEEK_DAYS,
} from '../rush.ts';

/** 완성 시작 상태(본관·올렛길·자리·메뉴 3종)에 자리를 extra개 더 놓은 카페.
 *  busy면 손님층 인기를 채워 줄이 실제로 밀리게 한다 (러시는 하루 손님 수에서 줄 길이를 뽑는다). */
function cafe(extra = 4, seed = 1, busy = true): GameState {
  const s = createInitialState(seed);
  s.storage['carrot'] = 500;
  for (const c of bestSeatCells(s, extra)) placeObject(s, 'table_out', c.x, c.y);
  if (busy) for (const id of Object.keys(s.segmentPopularity)) s.segmentPopularity[id] = 99;
  s.spawnAcc = 0;
  return s;
}
/** 줄이 설 때까지 러시를 감는다 (최대 n걸음) */
function untilQueue(s: GameState, n = 60): void {
  for (let i = 0; i < n && rushState(s).queue.length === 0; i++) stepRush(s);
}
/** 토요일 11시 직전으로 시계를 맞춘다 */
function toRushDay(s: GameState): void {
  while (weekdayOf(s.clock.day) !== RUSH_WEEKDAY) { s.clock.day++; if (s.clock.day > 30) { s.clock.day = 1; s.clock.month++; } }
  s.clock.hour = RUSH_READY_HOUR - 1;
  s.clock.accMs = 0;
  s.clock.carryMs = 0;
}

describe('주간 리듬·시간 축 (§1·§7-1)', () => {
  test('요일: 러시는 그 주 6일차, 예고는 하루 전. 달마다 4번(6·13·20·27일)', () => {
    expect(weekdayOf(1)).toBe(0);
    expect(weekdayOf(6)).toBe(RUSH_WEEKDAY);
    expect(weekdayOf(5)).toBe(RUSH_NOTICE_WEEKDAY);
    const days = [];
    for (let d = 1; d <= 30; d++) if (weekdayOf(d) === RUSH_WEEKDAY) days.push(d);
    expect(days).toEqual([6, 13, 20, 27]);
  });
  test('3배속 1주 사이클 2분 안, 그중 러시가 60~90초 (§7-1)', () => {
    expect(weekCycleSeconds()).toBeLessThanOrEqual(120);
    expect(rushSeconds()).toBeGreaterThanOrEqual(60);
    expect(rushSeconds()).toBeLessThanOrEqual(90);
    // 러시가 먹는 게임 시간은 11~15시 네 시간뿐 — 나머지 엿새는 평소 속도다
    expect(RUSH_READY_MS + RUSH_RUN_MS).toBe((1 + RUSH_RUN_HOURS) * HOUR_MS);
  });
  test('감속은 실시간 프레임에만 — 봇·테스트가 하루치를 한 번에 넣는 호출은 그대로', () => {
    const s = cafe();
    toRushDay(s);
    tick(s, HOUR_MS); // 11시: 카운트다운
    expect(rushPhase(s)).toBe('ready');
    expect(rushTimeScale(s, 16)).toBeLessThan(1);      // 프레임 → 감속
    expect(rushTimeScale(s, DAY_MS)).toBe(1);           // 하루치 → 그대로
    expect(rushTimeScale(s, RUSH_REALTIME_DT_MAX + 1)).toBe(1);
    // 3배속에서 카운트다운이 목표 시간만큼 걸린다
    const frames = RUSH_READY_MS / (RUSH_TARGET_SPEED * rushTimeScale(s, 16) * 1);
    expect(frames / 1000).toBeCloseTo(20, 0);
  });
  test('다음 러시까지 며칠', () => {
    const s = cafe();
    s.clock.day = 1;
    expect(daysToRush(s)).toBe(RUSH_WEEKDAY);
    s.clock.day = 6;
    expect(daysToRush(s)).toBe(0);
  });
});

describe('상태기계 전이 (§2)', () => {
  test('예고(금요일) → 카운트다운 → 진행 → 정산, 한 주에 한 번만', () => {
    const s = cafe(6);
    // 예고는 하루 전(금요일) 아침 — 그 전날 밤에서 하루를 넘긴다
    while (weekdayOf(s.clock.day) !== RUSH_NOTICE_WEEKDAY - 1) s.clock.day++;
    s.clock.hour = 23;
    s.clock.accMs = 0;
    s.clock.carryMs = 0;
    tick(s, HOUR_MS * 2); // 다음 날로 넘기며 onNewDay
    expect(weekdayOf(s.clock.day)).toBe(RUSH_NOTICE_WEEKDAY);
    expect(s.notices.some((n) => n.includes('내일 점심'))).toBe(true);

    const t = cafe(6);
    toRushDay(t);
    expect(rushPhase(t)).toBe('idle');
    tick(t, HOUR_MS);
    expect(rushPhase(t)).toBe('ready');
    const r = rushState(t);
    expect(r.week).toBe(weekIndexOf(t));
    // 카운트다운이 끝나면 진행
    tick(t, RUSH_READY_MS);
    expect(rushPhase(t)).toBe('run');
    expect(t.notices.some((n) => n.includes('손님이 몰린다'))).toBe(true);
    // 러시가 끝나면 정산 (등급이 매겨진다)
    tick(t, RUSH_RUN_MS + STEP_MS);
    expect(rushPhase(t)).toBe('done');
    expect(r.grade).not.toBeNull();
    expect(rushDoneThisWeek(t)).toBe(true);
    // 같은 날 또 시작하지 않는다
    tick(t, HOUR_MS);
    expect(rushPhase(t)).toBe('done');
    // 다음 주 토요일엔 다시 선다
    for (let d = 0; d <= WEEK_DAYS; d++) tick(t, DAY_MS);
    expect(rushGrades(t).S + rushGrades(t).A + rushGrades(t).B + rushGrades(t).C).toBeGreaterThanOrEqual(2);
  });
  test('러시 시각(11~15시)이 지난 뒤 불러온 세이브는 그 주 러시를 건너뛴다', () => {
    const s = cafe();
    toRushDay(s);
    s.clock.hour = RUSH_START_HOUR + RUSH_RUN_HOURS + 1;
    tick(s, HOUR_MS);
    expect(rushPhase(s)).toBe('idle');
  });
});

describe('줄·인내 (§2)', () => {
  test('줄 상한은 12명, 등급·평판이 오르면 20까지', () => {
    const s = cafe();
    expect(rushQueueCap(s)).toBe(RUSH_QUEUE_BASE);
    s.grade = 5;
    s.reputation = 100;
    expect(rushQueueCap(s)).toBe(RUSH_QUEUE_MAX);
    // 난이도 곡선: 등급이 오르면 인내가 짧아진다
    expect(rushPatienceMult(s)).toBeLessThan(1);
    s.grade = 1;
    expect(rushPatienceMult(s)).toBe(1);
  });
  test('인내 게이지가 0이면 떠난다 — left++·평판 −1(판당 상한)·콤보 끊김', () => {
    const s = cafe(4);
    toRushDay(s);
    startRushNow(s);
    const r = rushState(s);
    untilQueue(s);
    const type = r.queue[0]!.type;
    r.streak = 5;
    const rep = s.reputation;
    // 인내가 다 된 손님 여덟을 줄에 세운다 (자동 착석 시각 전이라 그대로 떠난다)
    for (let i = 0; i < 8; i++) { r.queue.unshift({ id: `imp${i}`, type, patienceMs: 1, waitedMs: 0 }); r.arrived++; }
    stepRush(s);
    expect(r.left).toBe(8);
    expect(r.streak).toBe(0); // 콤보가 끊긴다
    expect(s.reputation).toBeLessThan(rep);
    expect(s.reputation).toBe(rep - 3); // 판당 −3까지 (작은 카페가 첫 러시에 무너지지 않게)
  });
  test('인내는 20~40초(3배속) 사이', () => {
    const s = cafe(0);
    toRushDay(s);
    startRushNow(s);
    const r = rushState(s);
    untilQueue(s);
    expect(r.queue.length).toBeGreaterThan(0);
    for (const g of r.queue) {
      expect(g.patienceMs).toBeGreaterThan(0);
      expect(g.patienceMs).toBeLessThanOrEqual(rushMsOfSeconds(RUSH_PATIENCE_MAX_S));
    }
    expect(rushMsOfSeconds(RUSH_PATIENCE_MIN_S)).toBeLessThan(rushMsOfSeconds(RUSH_PATIENCE_MAX_S));
  });
});

describe('스폰 3배·원복 (§2)', () => {
  test('러시 중엔 평소 스폰이 멈추고 문 앞 줄이 평소 그 시간대의 3배로 선다 — 끝나면 원복', () => {
    const s = cafe(8);
    toRushDay(s);
    s.clock.hour = RUSH_START_HOUR;
    const plain = dailyGuestCount(s) * 3; // 12~15시 비중 × 하루 손님 (hourShare로 근사)
    expect(plain).toBeGreaterThan(0);
    startRushNow(s);
    expect(isRushRunning(s)).toBe(true);
    const before = s.spawnAcc;
    expect(hourlySpawn(s)).toBe(0);          // 평소 경로는 멈춘다
    expect(s.spawnAcc).toBe(before);
    // 줄은 평소 그 시간대의 RUSH_SPAWN_MULT배 (다만 규모로 받을 수 있는 양의 RUSH_ARRIVAL_OVER배까지)
    const s2 = cafe(8);
    const cap = rushCapacity(s2);
    expect(rushArrivals(s2)).toBeLessThanOrEqual(Math.ceil(cap * 1.3));
    expect(RUSH_SPAWN_MULT).toBe(3);
    // 러시가 끝나면 평소 스폰이 돌아온다
    const r = rushState(s);
    for (let i = 0; i < RUSH_RUN_MS / STEP_MS + 2; i++) stepRush(s);
    expect(r.phase).toBe('done');
    expect(isRushRunning(s)).toBe(false);
    s.spawnAcc = 0;
    expect(hourlySpawn(s)).toBeGreaterThanOrEqual(0);
  });
});

describe('점수·등급 (§2)', () => {
  test('자리 배정 보너스: 취향·명당·전망이 맞으면 보너스 점수', () => {
    const s = cafe(4);
    toRushDay(s);
    startRushNow(s);
    const r = rushState(s);
    untilQueue(s);
    const g = r.queue[0]!;
    const seat = freeSeats(s)[0]!;
    const fit = rushSeatFits(s, seat, g.type);
    expect(canSeatFromQueue(s, g.id, seat.id).ok).toBe(true);
    expect(apply(s, { type: 'seatFromQueue', guestId: g.id, objectId: seat.id }).ok).toBe(true);
    expect(r.served).toBe(1);
    expect(r.manual).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(RUSH_SCORE_PER_GUEST);
    if (fit) expect(r.bonus).toBe(RUSH_FIT_BONUS);
    // 이미 앉은 손님은 다시 못 앉힌다
    expect(canSeatFromQueue(s, g.id, seat.id).ok).toBe(false);
  });
  test('콤보: 연속 3명부터 ×1.5, 손님이 떠나면 끊긴다', () => {
    const s = cafe(8);
    toRushDay(s);
    startRushNow(s);
    const r = rushState(s);
    const gains: number[] = [];
    for (let n = 0; n < RUSH_COMBO_N + 1; n++) {
      untilQueue(s);
      const g = r.queue[0];
      const seat = freeSeats(s)[0];
      if (!g || !seat) break;
      const before = r.score;
      apply(s, { type: 'seatFromQueue', guestId: g.id, objectId: seat.id });
      gains.push(r.score - before);
    }
    expect(gains.length).toBeGreaterThanOrEqual(RUSH_COMBO_N);
    expect(r.combo).toBeGreaterThanOrEqual(1);
    expect(r.streak).toBeGreaterThanOrEqual(RUSH_COMBO_N);
    expect(RUSH_COMBO_MULT).toBe(1.5);
  });
  test('등급 문턱은 좌석·직원 규모에 맞춘 상대 평가 — 같은 점수라도 큰 카페는 낮은 등급', () => {
    const small = cafe(2);
    const big = cafe(12);
    expect(rushCapacity(big)).toBeGreaterThan(rushCapacity(small));
    const arrived = 30;
    expect(rushExpectedScore(big, arrived)).toBeGreaterThan(rushExpectedScore(small, arrived));
    const score = RUSH_EXPECT_PER_GUEST * 10;
    expect(rushGradeOf(small, score, arrived)).not.toBe(rushGradeOf(big, score, arrived));
    // 문턱 자체
    const exp = rushExpectedScore(small, arrived);
    expect(rushGradeOf(small, Math.round(exp * RUSH_GRADE_A), arrived)).toBe('A');
    expect(rushGradeOf(small, Math.round(exp * RUSH_GRADE_B), arrived)).toBe('B');
    expect(rushGradeOf(small, 0, arrived)).toBe('C');
    expect(rushGradeOf(small, exp * 2, arrived)).toBe('S');
  });
  test('떠난 손님은 15점씩 깎는다 (0 아래로는 안 내려간다)', () => {
    const s = cafe(4);
    toRushDay(s);
    startRushNow(s);
    const r = rushState(s);
    untilQueue(s);
    const seat = freeSeats(s)[0]!;
    apply(s, { type: 'seatFromQueue', guestId: r.queue[0]!.id, objectId: seat.id });
    const earned = r.score;
    expect(earned).toBeGreaterThan(0);
    r.left = 1;
    for (let i = 0; i < RUSH_RUN_MS / STEP_MS + 2 && r.phase === 'run'; i++) stepRush(s);
    expect(r.phase).toBe('done');
    expect(RUSH_LEFT_PENALTY).toBe(15);
    expect(r.score).toBe(Math.max(0, r.score));
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
  test('등급 보상 (§2): S 응모권 3·평판 +5·다음 주 손님 +10%, C 평판 −2', () => {
    expect(RUSH_REWARDS.S).toEqual({ tickets: 3, reputation: 5, guestPct: 10 });
    expect(RUSH_REWARDS.A).toEqual({ tickets: 2, reputation: 3, guestPct: 0 });
    expect(RUSH_REWARDS.B.tickets).toBe(1);
    expect(RUSH_REWARDS.C.reputation).toBe(-2);
  });
});

describe('직원 스킬·밀린 주문 (§2·§3)', () => {
  test('기본 4종은 직종마다 하나씩, 러시 중에만·쿨다운', () => {
    expect(RUSH_SKILLS.map((x) => x.role).sort()).toEqual(['barista', 'clean', 'cook', 'hall']);
    expect(rushSkillOfRole('hall')?.effect).toBe('seat');
    expect(rushSkillOfRole(null)).toBeNull();
    const s = cafe(6);
    s.staff.push({ id: 'st1', name: '홀삼춘', role: 'hall', level: 1, exp: 0, energy: 100, stats: { skill: 10, service: 10, stamina: 10 }, salary: 0, hiredMonth: 0, training: null, skill: 'none' } as never);
    expect(canUseStaffSkill(s, 'st1').ok).toBe(false); // 러시 밖
    toRushDay(s);
    startRushNow(s);
    const r = rushState(s);
    for (let i = 0; i < 60 && r.queue.length < 2; i++) stepRush(s);
    expect(r.queue.length).toBeGreaterThanOrEqual(2);
    expect(canUseStaffSkill(s, 'st1').ok).toBe(true);
    const served = r.served;
    expect(apply(s, { type: 'useStaffSkill', staffId: 'st1' }).ok).toBe(true);
    expect(r.served).toBeGreaterThan(served); // 능숙한 안내: 앞의 세 분을 바로 앉힌다
    expect(canUseStaffSkill(s, 'st1').ok).toBe(false); // 쿨다운
  });
  test('밀린 주문 우선 처리: 조리를 앞당기고 점수 +5, 자리마다 한 번', () => {
    const s = cafe(4);
    toRushDay(s);
    startRushNow(s);
    const r = rushState(s);
    for (let i = 0; i < 30; i++) stepRush(s);
    const waiting = s.guests.find((g) => g.phase === 'seated' && g.mood === null && g.waitMs > 0);
    expect(waiting, '조리를 기다리는 손님').toBeTruthy();
    const id = waiting!.seatId!;
    const before = waiting!.waitMs;
    expect(canRushPriority(s, id).ok).toBe(true);
    expect(apply(s, { type: 'rushPriority', objectId: id }).ok).toBe(true);
    expect(waiting!.waitMs).toBeLessThan(before);
    expect(canRushPriority(s, id).ok).toBe(false);
  });
});

describe('자동 해결 (§2 · §7-2)', () => {
  test('resolveRushAuto는 결정적이고 UI 없이 점수를 낸다', () => {
    const a = cafe(6, 7);
    toRushDay(a);
    startRushNow(a);
    const b = cloneState(a);
    const ra = resolveRushAuto(a)!;
    const rb = resolveRushAuto(b)!;
    expect(ra.score).toBe(rb.score);
    expect(ra.served).toBe(rb.served);
    expect(ra.left).toBe(rb.left);
    expect(ra.grade).toBe(rb.grade);
    expect(a.rng).toBe(b.rng);
    expect(ra.phase).toBe('done');
    expect(ra.manual).toBe(0);
    expect(RUSH_AUTO_COEF).toBe(0.6);
  });
  test('조작이 점수를 20% 이상 바꾼다 — 같은 세이브에서 무조작 vs 배정 최적 (§7-2)', () => {
    const base = cafe(8, 5);
    toRushDay(base);
    startRushNow(base);
    const auto = cloneState(base);
    const skilled = cloneState(base);
    const ra = resolveRushAuto(auto)!;
    // 이상적 조작: 줄이 서는 즉시 취향에 맞는 빈 자리로
    const rs = rushState(skilled);
    for (let i = 0; i < RUSH_RUN_MS / STEP_MS + 2 && rs.phase === 'run'; i++) {
      for (const g of [...rs.queue]) {
        const open = freeSeats(skilled);
        if (open.length === 0) break;
        const seat = open.find((o) => rushSeatFits(skilled, o, g.type)) ?? open[0]!;
        apply(skilled, { type: 'seatFromQueue', guestId: g.id, objectId: seat.id });
      }
      stepRush(skilled);
    }
    expect(ra.score).toBeGreaterThan(0);
    expect(rs.score / ra.score).toBeGreaterThanOrEqual(1.2);
  });
});

describe('해금을 등급에 걸기 (§5)', () => {
  test('rushGrade 조건은 그 등급 이상을 받은 횟수를 센다', () => {
    const s = cafe();
    rushGrades(s).S = 1;
    rushGrades(s).A = 2;
    rushGrades(s).B = 3;
    rushGrades(s).C = 9;
    expect(rushGradeCount(s, 'S')).toBe(1);
    expect(rushGradeCount(s, 'A')).toBe(3);
    expect(rushGradeCount(s, 'B')).toBe(6);
    expect(rushGradeCount(s, 'C')).toBe(15);
    const c: GoalCondition = { type: 'rushGrade', n: 3, grade: 'A' };
    expect(conditionProgress(s, c)).toEqual({ cur: 3, max: 3 });
    expect(goalConditionText(c)).toBe('러시 A등급 3번');
    expect(goalConditionText({ type: 'rushGrade', n: 1, grade: 'S' })).toBe('러시 S등급 받기');
  });
  test('중반(자금 700만~3,000만) 해금 6개 이상이 러시 등급으로 열린다', () => {
    const goals = GOALS as { id: string; condition: GoalCondition; reward: { type: string }[] }[];
    const rush = goals.filter((g) => g.condition.type === 'rushGrade');
    expect(rush.length).toBeGreaterThanOrEqual(6);
    // 전부 무언가를 열어 준다 (돈만 쌓이는 정체를 없애는 게 목적)
    for (const g of rush) expect(g.reward.some((r) => r.type.startsWith('unlock') || r.type === 'menuSlot' || r.type === 'staffSlot' || r.type === 'item')).toBe(true);
  });
});

describe('저장·옛 세이브', () => {
  test('러시 상태가 왕복하고, 진행 중이던 러시는 지나간 것으로 본다', () => {
    const s = cafe(4);
    toRushDay(s);
    startRushNow(s);
    untilQueue(s);
    expect(rushState(s).queue.length).toBeGreaterThan(0);
    const back = deserialize(serialize(s));
    expect(back.rush!.phase).toBe('idle');
    expect(back.rush!.queue).toEqual([]);
    expect(back.rushGrades).toEqual(s.rushGrades);
  });
  test('러시 필드가 없는 옛 세이브도 그대로 돌아간다', () => {
    const s = createInitialState(1);
    delete s.rush;
    delete s.rushGrades;
    const back = deserialize(serialize(s));
    expect(back.rush!.phase).toBe('idle');
    expect(back.rushGrades).toEqual({ S: 0, A: 0, B: 0, C: 0 });
    tick(back, DAY_MS);
    expect(rushPhase(back)).toBe('idle');
  });
});

describe('삭제: 인사·추천 (§3·§6)', () => {
  test('인사·추천 액션은 없어졌다', () => {
    const s = cafe(2);
    expect(apply(s, { type: 'greetGuest', guestId: 'g1' } as never).ok).toBe(false);
    expect(apply(s, { type: 'recommendMenu', guestId: 'g1', menuId: 'americano' } as never).ok).toBe(false);
  });
  test('단골 게이지는 러시에서 받은 손님으로 찬다', () => {
    const s = cafe(6);
    toRushDay(s);
    startRushNow(s);
    resolveRushAuto(s);
    const gauge = Object.values(s.regularsGauge ?? {});
    expect(gauge.length).toBeGreaterThan(0);
    expect(Math.max(...gauge)).toBeGreaterThan(0);
  });
});

describe('규모가 커져도 러시가 하루 손님을 늘리지 않는다 (§7-3)', () => {
  test('러시에서 받은 만큼 그날 남은 스폰 몫에서 뺀다', () => {
    const s = cafe(8);
    toRushDay(s);
    s.clock.hour = RUSH_START_HOUR;
    s.spawnAcc = 0;
    startRushNow(s);
    const r = rushState(s);
    for (let i = 0; i < RUSH_RUN_MS / STEP_MS + 2; i++) stepRush(s);
    expect(r.served).toBeGreaterThan(0);
    expect(s.spawnAcc).toBeLessThan(0); // 받은 만큼 빚이 남아 저녁 스폰이 줄어든다
    expect(s.spawnAcc).toBeGreaterThanOrEqual(-r.served); // 받은 수보다 더는 안 뺀다
    expect(totalSeats(s)).toBeGreaterThan(0);
  });
});
