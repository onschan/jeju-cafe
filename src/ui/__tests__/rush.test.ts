import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../../sim/state.ts';
import { freeSeats, stepRush, RUSH_START_HOUR, RUSH_WEEKDAY as SIM_RUSH_WEEKDAY, weekdayOf as simWeekdayOf } from '../../sim/index.ts';
import type { GameState } from '../../sim/index.ts';
import { hasIdToken } from '../../data/labels.ts';
import { replaceStateForTest } from '../store';
import {
  AUTO_SCORE_MULT, COMBO_FROM, RUSH_LEN_MS, SCORE_PER_GUEST, SCORE_PER_LEFT,
  gradeFor, isNoticeDay, isRushTime, lastRushResult, queueSizeFor, rushMarks, rushOf,
  rushTimeLeftMs, seatFront, startRush, weekdayOf,
} from '../rushBridge';
import { missLine, rushDiagnosis, rushPrepItems, inRushWeek } from '../rushPrep';

/** 러시 타임 UI 다리 (rush-battle §2). sim(rush.ts)을 화면 모양으로 바꿔 주는 층만 본다 — 규칙 자체는 sim 테스트가 본다. */

const FORBIDDEN = /→|정석|시뮬|공략|굴려 보니/;

/** 토요일 12시(러시 시각)로 옮긴 시작 마당. 스토어에도 심어 준다 (다리가 dispatch로 스토어를 쓴다) */
function rushDay(): GameState {
  const s = createInitialState(1);
  while (simWeekdayOf(s.clock.day) !== SIM_RUSH_WEEKDAY) s.clock.day++;
  s.clock.hour = RUSH_START_HOUR;
  replaceStateForTest(s);
  return s;
}
/** 줄에 손님이 설 때까지 감는다 (자동 착석이 줄을 비우므로 한 명 보이면 바로 멈춘다) */
function waitQueue(s: GameState): void {
  for (let i = 0; i < 30 && (s.rush?.queue.length ?? 0) === 0; i++) stepRush(s);
}
/** 러시가 끝날 때까지 감는다 (시계는 안 건드린다 — 러시 타이머만) */
function runToEnd(s: GameState): void {
  for (let i = 0; i < 400 && s.rush?.phase === 'run'; i++) stepRush(s);
}

beforeEach(() => { replaceStateForTest(createInitialState(1)); });

describe('러시 타임 다리', () => {
  it('주간 리듬: 5일이 예고, 6일 12시가 러시 — 날짜가 30일이어도 7일 주기로 돈다', () => {
    const s = createInitialState(1);
    expect([1, 8, 15, 22].map((d) => weekdayOf({ ...s.clock, day: d }))).toEqual([1, 1, 1, 1]);
    s.clock.day = 5;
    expect(isNoticeDay(s)).toBe(true);
    expect(isRushTime(s)).toBe(false);
    s.clock.day = 6;
    s.clock.hour = 11;
    expect(isRushTime(s)).toBe(false);
    s.clock.hour = 12;
    expect(isRushTime(s)).toBe(true);
    s.clock.day = 20; // 20일도 토요일 (((20-1)%7)+1 = 6)
    expect(isRushTime(s)).toBe(true);
    s.clock.day = 4;
    expect(inRushWeek(s)).toBe(true); // 목요일부터 준비가 오늘 할 일의 앞
    s.clock.day = 3;
    expect(inRushWeek(s)).toBe(false);
  });

  it('등급은 지금 규모의 기준 점수 대비 비율 — 못 채우면 C, 훌쩍 넘으면 S', () => {
    replaceStateForTest(createInitialState(1));
    const par = 100;
    expect(gradeFor(0, par)).toBe('C');
    expect(gradeFor(par * 2, par)).toBe('S');
    expect(['C', 'B']).toContain(gradeFor(Math.round(par * 0.5), par));
    expect(gradeFor(-50, par)).toBe('C'); // 놓친 손님으로 마이너스가 나도 C까지만
  });

  it('러시가 열리면 줄이 서고 남은 시간이 찬다', () => {
    const s = rushDay();
    startRush(s);
    const a = rushOf(s)!;
    expect(a.phase).toBe('run');
    expect(rushTimeLeftMs(s)).toBe(RUSH_LEN_MS);
    for (let i = 0; i < 20 && rushOf(s)!.queue.length === 0; i++) stepRush(s);
    const q = rushOf(s)!.queue;
    expect(q.length).toBeGreaterThan(0);
    expect(q.length).toBeLessThanOrEqual(queueSizeFor(s));
    for (const g of q) {
      expect(g.patienceLeft).toBeGreaterThan(0);
      expect(g.patienceLeft).toBeLessThanOrEqual(g.patience);
    }
  });

  it('자리에 앉히면 점수가 오르고 받은 손님이 는다 (액션은 sim으로 간다)', () => {
    const s = rushDay();
    startRush(s);
    waitQueue(s);
    const served = rushOf(s)!.served;
    const one = seatFront(s, freeSeats(s)[0]!.id);
    expect(one.ok).toBe(true);
    expect(one.gained).toBeGreaterThanOrEqual(SCORE_PER_GUEST);
    expect(rushOf(s)!.served).toBe(served + 1);
    expect(COMBO_FROM).toBe(3);
    expect(AUTO_SCORE_MULT).toBeLessThan(1); // 자동 착석은 계수가 낮다 (§7-2)
  });

  it('손을 놓으면 줄이 떠나고 등급이 내려간다 — 성적표는 sim 상태에 남는다', () => {
    const s = rushDay();
    startRush(s);
    waitQueue(s);
    seatFront(s, freeSeats(s)[0]!.id);
    runToEnd(s);
    const after = rushOf(s)!;
    expect(after.phase).toBe('done');
    const r = lastRushResult(s)!;
    expect(r.served).toBeGreaterThanOrEqual(1);
    expect(r.par).toBeGreaterThan(0);
    expect(SCORE_PER_LEFT).toBe(15);
    expect(missLine(r)).not.toMatch(FORBIDDEN);
    expect(hasIdToken(missLine(r))).toBe(false);
  });

  it('러시 중 자리 색: 앉힐 수 있으면 ok, 아니면 no. 러시가 아니면 아무 칸도 안 칠한다', () => {
    const s = rushDay();
    expect(rushMarks(s)).toEqual([]);
    startRush(s);
    waitQueue(s);
    const marks = rushMarks(s);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((m) => m.kind === 'ok')).toBe(true);
    const seat = marks.find((m) => m.kind === 'ok')!;
    // 그 자리가 다 찰 때까지 앉히면 초록이 아니게 된다 (줄이 비면 다시 채워 가며)
    for (let i = 0; i < 8 && rushMarks(s).find((m) => m.id === seat.id)!.kind === 'ok'; i++) { waitQueue(s); seatFront(s, seat.id); }
    expect(rushMarks(s).find((m) => m.id === seat.id)!.kind).not.toBe('ok');
  });

  it('준비 체크리스트·성적 분석은 한 줄씩 이유가 있는 우리말 (영문 id·지시문 없음)', () => {
    const s = rushDay();
    const items = rushPrepItems(s);
    expect(items.map((i) => i.key)).toEqual(['seat', 'staff', 'ingredient']);
    for (const it of items) {
      expect(it.text.length).toBeGreaterThan(0);
      expect(it.text).not.toMatch(FORBIDDEN);
      expect(hasIdToken(it.text), it.text).toBe(false);
      expect(it.targets.length).toBeGreaterThan(0);
    }
    // 한 판도 안 했으면 준비 쪽을 말한다
    const before = rushDiagnosis(s);
    expect(before.result).toBeNull();
    expect(before.headline).not.toMatch(FORBIDDEN);
    // 한 판 하고 나면 성적 분석이 된다
    startRush(s);
    runToEnd(s);
    const after = rushDiagnosis(s);
    expect(after.result).toBeTruthy();
    expect(after.fixes.length).toBe(2);
    for (const t of [after.headline, after.why, ...after.fixes]) {
      expect(t).not.toMatch(FORBIDDEN);
      expect(hasIdToken(t), t).toBe(false);
    }
  });
});
