import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { serialize, deserialize, MemorySaveStore } from '../save.ts';
import { SAVE_VERSION } from '../state.ts';
import { botDay, newBotCursor } from '../bot.ts';
import { DAY_MS } from '../clock.ts';

test('직렬화 왕복이 같은 상태를 만든다', () => {
  const s = bareState(9);
  expect(apply(s, { type: 'place', objectType: 'tangerine_tree', x: X(0), y: Y(0) }).ok).toBe(true);
  tick(s, 5000);
  const back = deserialize(serialize(s));
  expect(back).toEqual(s);
});

test('버전이 다르면 거부', () => {
  const s = bareState(9);
  const json = serialize(s).replace(`"version":${SAVE_VERSION}`, '"version":999');
  expect(() => deserialize(json)).toThrow(/version/);
});

test('SaveStore: save/load/list', async () => {
  const store = new MemorySaveStore();
  const s = bareState(9);
  await store.save(1, s);
  expect(await store.list()).toEqual([1]);
  expect(await store.load(1)).toEqual(s);
  expect(await store.load(2)).toBeNull();
});

test('list는 숫자 순', async () => {
  const store = new MemorySaveStore();
  const s = bareState(1);
  await store.save(10, s); await store.save(2, s); await store.save(1, s);
  expect(await store.list()).toEqual([1, 2, 10]);
});

test('null/문자열 세이브는 거부', () => {
  expect(() => deserialize('null')).toThrow();
  expect(() => deserialize('"x"')).toThrow();
});

// [코어만] 지금 게임이 이 시스템을 안 부른다 (tick 훅을 껐다). 되살릴 때 skip을 떼고 기대값부터 확인한다.
test.skip('봇 2달 → 저장/불러오기 → 양쪽 1달 더 진행해도 같다 (새 필드 전부 왕복)', () => {
  const a = createInitialState(21); // 진짜 시작 상태(메뉴판·좌석·목표 잠금)에서 봇을 돌린다
  const cur = newBotCursor();
  for (let d = 0; d < 60; d++) botDay(a, cur);
  // 새 시스템 상태가 실제로 채워져 있는지 (빈 필드끼리 같은 건 의미가 없다)
  expect(a.staff.length).toBeGreaterThan(0);
  expect(Object.keys(a.board.quests).length).toBeGreaterThan(0);
  expect(a.board.events.length).toBeGreaterThan(0);
  expect(a.activePromotions.length + a.actionLog.filter((l) => l.action.type === 'promote').length).toBeGreaterThan(0);
  expect(a.goals.claimed.length).toBeGreaterThan(0);            // v3 목표 체인
  expect(Object.keys(a.eventsFired).length).toBeGreaterThan(0); // v3 빅 이벤트
  const json = serialize(a);
  const b = deserialize(json);
  expect(b).toEqual(a);
  const curB = { ...cur };
  for (let d = 0; d < 30; d++) { botDay(a, cur); botDay(b, curB); }
  expect(serialize(b)).toBe(serialize(a));
  expect(b).toEqual(a);
});

test('같은 버전 안에서 추가된 필드(lastMonthIncome)는 불러올 때 채운다', () => {
  const s = bareState(9);
  for (let d = 0; d < 31; d++) tick(s, DAY_MS);
  const json = serialize(s);
  const obj = JSON.parse(json) as Record<string, unknown>;
  delete obj.lastMonthIncome;
  const back = deserialize(JSON.stringify(obj));
  expect(back.lastMonthIncome).toBe(s.lastMonthCard!.income);
});

// ---------- trim: v20 → v21 마이그레이션 ----------
import { OLDEST_LOADABLE } from '../save.ts';

test('zero-base(v31): 맵 크기가 바뀌어 옛 세이브(v30 이하)는 못 잇는다 — 백업 뒤 새 게임', () => {
  expect(OLDEST_LOADABLE).toBe(SAVE_VERSION);
  const s = bareState(1);
  for (const v of [20, 26, 30]) {
    const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
    obj.version = v;
    expect(() => deserialize(JSON.stringify(obj))).toThrow(/version/);
  }
});
