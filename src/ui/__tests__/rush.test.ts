import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../../sim/state.ts';
import { freeSeats } from '../../sim/index.ts';
import { hasIdToken } from '../../data/labels.ts';
import {
  AUTO_SCORE_MULT, COMBO_FROM, RUSH_LEN_MS, SCORE_PER_GUEST, SCORE_PER_LEFT, clearRushResult, endRush,
  gradeFor, isNoticeDay, isRushTime, lastRushResult, queueSizeFor, rushMarks, rushOf, rushTick,
  rushTimeLeftMs, seatFront, startRush, weekdayOf,
} from '../rushBridge';
import { missLine, rushDiagnosis, rushPrepItems, inRushWeek } from '../rushPrep';

/** 러시 타임 UI 다리 (rush-battle §2). sim(rush1)이 아직 없을 때 쓰는 임시 엔진이 같은 규칙으로 도는지 본다. */

const FORBIDDEN = /→|정석|시뮬|공략|굴려 보니/;
function starter() { return createInitialState(1); }

beforeEach(() => { endRush(); clearRushResult(); });

describe('러시 타임 다리', () => {
  it('주간 리듬: 5일이 예고, 6일 12시가 러시 — 날짜가 30일이어도 7일 주기로 돈다', () => {
    const s = starter();
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

  it('등급은 기준 점수 대비 비율 — 못 채우면 C, 훌쩍 넘으면 S', () => {
    expect(gradeFor(0, 100)).toBe('C');
    expect(gradeFor(80, 100)).toBe('B');
    expect(gradeFor(110, 100)).toBe('A');
    expect(gradeFor(140, 100)).toBe('S');
    expect(gradeFor(-50, 100)).toBe('C'); // 놓친 손님으로 마이너스가 나도 C까지만
  });

  it('러시를 시작하면 줄이 서고 남은 시간이 찬다. 같은 주는 같은 줄(결정적)', () => {
    const s = starter();
    startRush(s);
    const a = rushOf(s)!;
    expect(a.phase).toBe('run');
    expect(a.queue.length).toBe(queueSizeFor(s));
    expect(a.queue.length).toBeGreaterThanOrEqual(6);
    expect(a.queue.length).toBeLessThanOrEqual(12);
    expect(rushTimeLeftMs(s)).toBe(RUSH_LEN_MS);
    for (const g of a.queue) { expect(g.patience).toBeGreaterThanOrEqual(20_000); expect(g.patience).toBeLessThanOrEqual(40_000); }
    const first = a.queue.map((g) => g.type);
    endRush();
    startRush(s);
    expect(rushOf(s)!.queue.map((g) => g.type)).toEqual(first);
  });

  it('자리에 앉히면 점수·콤보가 오르고, 3연속부터 배수가 붙는다. 자동 진행은 점수가 절반', () => {
    const s = starter();
    startRush(s);
    const seats = freeSeats(s);
    expect(seats.length).toBeGreaterThanOrEqual(2);
    const one = seatFront(s, seats[0]!.id);
    expect(one.ok).toBe(true);
    expect(one.combo).toBe(1);
    expect(one.gained).toBeGreaterThanOrEqual(SCORE_PER_GUEST);
    const two = seatFront(s, seats[1]!.id);
    expect(two.combo).toBe(2);
    // 3연속: 같은 점수라도 배수가 붙어 앞선 판정보다 크다
    const free = freeSeats(s).filter((o) => o.id !== seats[0]!.id && o.id !== seats[1]!.id);
    if (free.length > 0) {
      const three = seatFront(s, free[0]!.id);
      expect(three.combo).toBe(COMBO_FROM);
      expect(three.gained).toBeGreaterThan(two.gained);
    }
    expect(rushOf(s)!.served).toBeGreaterThanOrEqual(2);
    // 자동 진행 계수는 절반
    expect(Math.round(SCORE_PER_GUEST * AUTO_SCORE_MULT)).toBe(5);
  });

  it('인내가 다 된 손님은 떠나고 점수가 깎인다 — 아무것도 안 하면 등급이 내려간다', () => {
    const s = starter();
    startRush(s);
    const before = rushOf(s)!;
    const n = before.queue.length;
    // 한 명만 앉히고 손을 놓는다
    seatFront(s, freeSeats(s)[0]!.id);
    for (let i = 0; i < 200; i++) rushTick(500); // 100초 — 러시가 끝난다
    const after = rushOf(s)!;
    expect(after.phase).toBe('done');
    expect(after.left).toBe(n - 1);
    const r = lastRushResult()!;
    expect(r.served).toBe(1);
    expect(r.left).toBe(n - 1);
    expect(r.grade).toBe('C');
    expect(r.par).toBe(n * SCORE_PER_GUEST);
    expect(SCORE_PER_LEFT).toBe(15);
    expect(missLine(r)).not.toMatch(FORBIDDEN);
    expect(hasIdToken(missLine(r))).toBe(false);
  });

  it('러시 중 자리 색: 앉힐 수 있으면 ok, 아니면 no. 러시가 아니면 아무 칸도 안 칠한다', () => {
    const s = starter();
    expect(rushMarks(s)).toEqual([]);
    startRush(s);
    const marks = rushMarks(s);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((m) => m.kind === 'ok')).toBe(true);
    const seat = marks.find((m) => m.kind === 'ok')!;
    // 그 자리가 다 찰 때까지 앉히면 초록이 회색으로 바뀐다
    for (let i = 0; i < 6 && rushMarks(s).find((m) => m.id === seat.id)!.kind === 'ok'; i++) expect(seatFront(s, seat.id).ok).toBe(true);
    expect(rushMarks(s).find((m) => m.id === seat.id)!.kind).toBe('no');
  });

  it('준비 체크리스트·성적 분석은 한 줄씩 이유가 있는 우리말 (영문 id·지시문 없음)', () => {
    const s = starter();
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
    for (let i = 0; i < 200; i++) rushTick(500);
    const after = rushDiagnosis(s);
    expect(after.result).toBeTruthy();
    expect(after.headline).toContain('놓쳤어요');
    expect(after.fixes.length).toBe(2);
    for (const t of [after.headline, after.why, ...after.fixes]) {
      expect(t).not.toMatch(FORBIDDEN);
      expect(hasIdToken(t), t).toBe(false);
    }
  });
});
