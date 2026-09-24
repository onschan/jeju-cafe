/** 성장 체감: 하루 기록(daylog) — 오늘의 성장 요약 카드·최근 30일 그래프가 보는 데이터. */
import { bareState } from './helpers.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { closeDay, recentDays, daySummary, DAY_LOG_CAP } from '../daylog.ts';
import { dayIndex } from '../effects.ts';

test('하루가 끝나면 한 줄: 손님·매출·새 단골·등급', () => {
  const s = bareState(1);
  s.dayStats.total = 42;
  s.monthIncome = 380_000;
  const row = closeDay(s);
  expect(row.guests).toBe(42);
  expect(row.income).toBe(380_000);
  expect(row.regulars).toBe(0);
  expect(row.grade).toBe(1);
  expect(row.day).toBe(dayIndex(s.clock) - 1);

  // 다음 날: 매출은 월 누적의 차이만큼
  s.dayStats.total = 48;
  s.monthIncome = 380_000 + 420_000;
  s.regulars = [{ id: 'r1' } as never];
  const row2 = closeDay(s);
  expect(row2.income).toBe(420_000);
  expect(row2.guests).toBe(48);
  expect(row2.regulars).toBe(1); // 새 단골 1명

  const sum = daySummary(s)!;
  expect(sum.today.guests).toBe(48);
  expect(sum.prev!.guests).toBe(42); // 어제 대비 +6
});

test('달이 바뀐 날도 매출이 이어진다 (월 누적이 0으로 리셋된 뒤)', () => {
  const s = bareState(1);
  s.monthIncome = 5_000_000;
  closeDay(s);
  // closeMonth가 지나간 자리: 지난달 마감 600만, 이번 달 누적은 아직 0
  s.lastMonthIncome = 6_000_000;
  s.monthIncome = 0;
  expect(closeDay(s).income).toBe(1_000_000); // 600만 − 500만
});

test('최근 30일만 보관한다', () => {
  const s = bareState(1);
  for (let i = 0; i < DAY_LOG_CAP + 12; i++) { s.dayStats.total = i; closeDay(s); }
  expect(s.dayLog!.length).toBe(DAY_LOG_CAP);
  expect(recentDays(s).length).toBe(DAY_LOG_CAP);
  expect(recentDays(s, 7).length).toBe(7);
  expect(s.dayLog![DAY_LOG_CAP - 1]!.guests).toBe(DAY_LOG_CAP + 11); // 마지막이 가장 최근
});

test('tick이 날마다 한 줄씩 남긴다 (하루 1회)', () => {
  const s = bareState(1);
  for (let i = 0; i < 3; i++) tick(s, DAY_MS);
  expect(s.dayLog!.length).toBe(3);
  expect(new Set(s.dayLog!.map((r) => r.day)).size).toBe(3);
});
