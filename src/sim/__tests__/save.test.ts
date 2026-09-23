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

test('봇 2달 → 저장/불러오기 → 양쪽 1달 더 진행해도 같다 (새 필드 전부 왕복)', () => {
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
import { MIGRATE_FROM } from '../save.ts';
import { SPOT_MAX_LEVEL } from '../spots.ts';

test('v20 세이브: 없어진 시설·명소·직종·경로를 환불·치환하고 알림 한 줄', () => {
  const s = bareState(1);
  const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
  obj.version = MIGRATE_FROM;
  // 없어진 것들을 옛 세이브에 심는다
  (obj.objects as Record<string, unknown>)['oX'] = { id: 'oX', type: 'shuttle_stop', x: 1, y: 1, placedMonth: 0 };
  (obj.spots as Record<string, number>)['camellia_hill'] = 3;
  (obj.spots as Record<string, number>)['canola_field'] = 5;
  (obj.routes as Record<string, unknown>)['cruise'] = { unlocked: true, contract: false, todayGuests: 0, monthGuests: 0, totalGuests: 0, monthIncome: 0, lastArrivalDay: -1, warned: false };
  (obj.unlocked as { objects: string[] }).objects.push('pier');
  (obj.goals as { claimed: string[] }).claimed.push('g_gone');
  const back = deserialize(JSON.stringify(obj));
  expect(back.version).toBe(SAVE_VERSION);
  expect(back.objects['oX']).toBeUndefined();
  expect(back.spots['camellia_hill']).toBeUndefined();
  expect(back.spots['canola_field']).toBe(SPOT_MAX_LEVEL);
  expect((back.routes as Record<string, unknown>)['cruise']).toBeUndefined();
  expect(back.unlocked.objects).not.toContain('pier');
  expect(back.goals.claimed).not.toContain('g_gone');
  expect(back.money).toBeGreaterThan(s.money); // 환불
  expect(back.notices.some((n) => n.includes('환불'))).toBe(true);
});

// ---------- big 통합: v21 → v22 (optional 필드 backfill만) ----------

test('v21 세이브: 5트랙이 붙인 필드가 전부 기본값으로 채워지고 버전이 22가 된다', () => {
  const s = bareState(1);
  s.loan.balance = 3_000_000;
  const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
  obj.version = 21;
  // v21엔 없던 필드를 지워 옛 세이브를 흉내 낸다
  for (const k of ['trend', 'riskDay', 'riskId', 'pendingRisk', 'pendingEventChoice', 'lastGrade', 'badGradeMonths', 'contest', 'dayLog', 'dayLogMark', 'voices', 'grade']) delete obj[k];
  delete (obj.monthCosts as Record<string, unknown>).rent;
  delete (obj.monthCosts as Record<string, unknown>).contest;
  delete (obj.loan as Record<string, unknown>).dueMonthIndex;
  delete (obj.loan as Record<string, unknown>).overdueCount;

  const back = deserialize(JSON.stringify(obj));
  expect(back.version).toBe(SAVE_VERSION);
  expect(SAVE_VERSION).toBe(24);
  // stakes
  expect(back.monthCosts.rent).toBe(0);
  expect(back.trend).toBeTruthy();
  expect(back.pendingRisk).toBeNull();
  expect(back.pendingEventChoice).toBeNull();
  expect(back.loan.dueMonthIndex).toBeGreaterThan(0); // 빚이 남은 옛 세이브에 기한을 준다
  expect(back.loan.overdueCount ?? 0).toBe(0);
  // contest
  expect(back.monthCosts.contest).toBe(0);
  expect(back.contest).toBeTruthy();
  // quick(성장 체감)·fun-rank
  expect(back.dayLog).toEqual([]);
  expect(back.voices).toEqual([]);
  expect(back.grade).toBe(1);
  // 한 번 더 왕복해도 같다
  expect(JSON.parse(serialize(deserialize(serialize(back))))).toEqual(JSON.parse(serialize(back)));
});

// ---------- all 통합: v23 → v24 (여섯 트랙이 붙인 optional 필드) ----------

test('v23 세이브: 여섯 트랙이 붙인 필드가 전부 기본값으로 채워지고 버전이 24가 된다', () => {
  const s = bareState(1);
  const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
  obj.version = 23;
  // v23엔 없던 필드를 지워 옛 세이브를 흉내 낸다
  for (const k of ['rivals', 'cornerSoon', 'staffCapBonus', 'ticketHints']) delete obj[k];
  delete (obj.monthCosts as Record<string, unknown>).deal;
  delete (obj.unlocked as Record<string, unknown>).recruits;
  delete (obj.tutorial as Record<string, unknown>).lastDay;

  const back = deserialize(JSON.stringify(obj));
  expect(back.version).toBe(SAVE_VERSION);
  // rival2 — 동네 경쟁 카페·제휴 고정비 줄
  expect(back.rivals).toBeTruthy();
  expect(back.monthCosts.deal).toBe(0);
  // econ2 — 채용 방법·직원 정원·응모권 안내
  expect(back.unlocked.recruits).toEqual([]);
  expect(back.staffCapBonus).toBe(0);
  expect(back.ticketHints).toBe(0);
  // botfix 5막 — lastDay가 없으면 첫 단계가 바로 뜬다
  expect(back.tutorial.lastDay).toBeUndefined();
  // spot2 — 곧 완성될 명당 기억은 비어 있어도 읽힌다
  expect(back.cornerSoon ?? []).toEqual([]);
  // 한 번 더 왕복해도 같다
  expect(JSON.parse(serialize(deserialize(serialize(back))))).toEqual(JSON.parse(serialize(back)));
});
