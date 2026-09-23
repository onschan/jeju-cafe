/** ui3: 우리 카페 진단(coach.ts)과 손님이 못 가는 시설(reach.ts).
 *  진단은 순수 함수여야 한다 — 상태를 안 건드리고, 같은 상태면 같은 말을 한다. */
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { diagnose, isCheckupDay, lastCheckupDay, checkupKey, CHECKUP_DAYS } from '../coach.ts';
import { objectReachable, spotReachable, unreachableCount, unreachableObjects } from '../reach.ts';
import { hasIdToken } from '../../data/labels.ts';

/** 문구 규칙 §6: 지시문·화살표·상투구 금지 */
const FORBIDDEN = /→ 지금|정석|시뮬|공략|굴려 보니|→/;
function texts(d: ReturnType<typeof diagnose>): string[] {
  // 「0」·「37%」처럼 숫자만 있는 근거 값은 뺀다 — hasIdToken이 소문자·숫자만 있는 짧은 말을 id로 본다
  return [...d.lines, d.bottleneck.text, ...d.moves, d.route.name, d.route.line, d.route.next, d.summary, d.dateText, ...d.evidence.flatMap((e) => [e.label, e.value])]
    .filter((t) => !/^[\d.,\s/%]+$/.test(t));
}

test('진단일은 1·8·15·22일, 그 사이 날은 직전 진단일로 묶인다', () => {
  const s = bareState(1);
  for (const d of CHECKUP_DAYS) { s.clock.day = d; expect(isCheckupDay(s)).toBe(true); }
  s.clock.day = 5;
  expect(isCheckupDay(s)).toBe(false);
  expect(lastCheckupDay(5)).toBe(1);
  expect(lastCheckupDay(14)).toBe(8);
  expect(lastCheckupDay(30)).toBe(22);
  s.clock.day = 9;
  const a = checkupKey(s);
  s.clock.day = 14;
  expect(checkupKey(s)).toBe(a); // 같은 주면 같은 진단
  s.clock.day = 15;
  expect(checkupKey(s)).not.toBe(a);
});

test('진단은 3줄 · 걸림돌 1개 · 다음 수 2개를 내고, 상태를 안 바꾼다', () => {
  const s = bareState(1);
  const before = JSON.stringify(s);
  const d = diagnose(s);
  expect(JSON.stringify(s)).toBe(before); // 순수 함수
  expect(d.lines).toHaveLength(3);
  expect(d.moves).toHaveLength(2);
  expect(d.bottleneck.text.length).toBeGreaterThan(0);
  expect(d.evidence.length).toBeGreaterThanOrEqual(8);
  expect(JSON.stringify(diagnose(s))).toBe(JSON.stringify(d)); // 결정적
});

test('진단 문구에 영문 id·상투구가 없다 (빈 마당·자리 놓은 뒤 둘 다)', () => {
  const s = bareState(1);
  for (const t of texts(diagnose(s))) { expect(FORBIDDEN.test(t), t).toBe(false); expect(hasIdToken(t), t).toBe(false); }
  placeObject(s, 'path', X(4), Y(5));
  placeObject(s, 'table_out', X(4), Y(4));
  for (const t of texts(diagnose(s, { layout: 42, topMove: '야외 테이블' }))) { expect(FORBIDDEN.test(t), t).toBe(false); expect(hasIdToken(t), t).toBe(false); }
});

test('배치 점수·추천 한 수를 넣으면 근거 줄이 늘어난다', () => {
  const s = bareState(1);
  expect(diagnose(s, { layout: 55, topMove: '야외 테이블' }).evidence.length).toBe(diagnose(s).evidence.length + 2);
});

test('길이 끊긴 자리는 손님이 못 간다 — 이어 주면 풀린다', () => {
  const s = bareState(1);
  // 정낭(4,6)에서 떨어진 자리: 둘레에 걷기 칸이 없다
  const far = placeObject(s, 'table_out', X(8), Y(2));
  expect(objectReachable(s, far)).toBe(false);
  expect(unreachableCount(s)).toBeGreaterThan(0);
  expect(unreachableObjects(s).map((o) => o.id)).toContain(far.id);
  expect(diagnose(s).bottleneck.key).toBe('unreachable');
  expect(diagnose(s).unreachable).toBeGreaterThan(0);

  // 정낭(4,6) 바로 위는 걸어서 닿는다
  const near = placeObject(s, 'table_out', X(4), Y(5));
  expect(objectReachable(s, near)).toBe(true);
});

test('고스트 자리 판정: 길 옆은 되고, 떨어진 칸은 안 된다. 길·담은 늘 된다', () => {
  const s = bareState(1);
  expect(spotReachable(s, 'table_out', X(4), Y(5))).toBe(true);  // 정낭 위
  expect(spotReachable(s, 'table_out', X(8), Y(2))).toBe(false); // 끊긴 곳
  expect(spotReachable(s, 'path', X(8), Y(2))).toBe(true);       // 길은 손님이 갈 일이 없다
});
