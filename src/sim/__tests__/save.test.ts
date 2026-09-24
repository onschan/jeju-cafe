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
  expect(SAVE_VERSION).toBe(27);
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

test('v23 세이브: 여섯 트랙이 붙인 필드가 전부 기본값으로 채워진다', () => {
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

// ---------- rushall 통합: v24 → v26 (러시) ----------

test('v24 세이브: 러시가 기본값으로 채워지고, 인사 기록은 지워진다', () => {
  const s = bareState(1);
  const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
  obj.version = 24;
  // v24엔 없던 필드를 지우고, v24에 있던 인사·추천 기록을 흉내 낸다
  for (const k of ['rush', 'rushGrades']) delete obj[k];
  obj.greetDay = 3;
  obj.greetCount = 7;
  obj.recommendCount = 2;

  const back = deserialize(JSON.stringify(obj));
  expect(back.version).toBe(SAVE_VERSION);
  // 러시 — 다음 토요일부터 줄이 선다
  expect(back.rush?.phase).toBe('idle');
  expect(back.rushGrades).toEqual({ S: 0, A: 0, B: 0, C: 0 });
  // 인사·추천은 삭제된 기능이라 기록도 지운다
  expect((back as unknown as Record<string, unknown>).greetDay).toBeUndefined();
  expect((back as unknown as Record<string, unknown>).greetCount).toBeUndefined();
  expect((back as unknown as Record<string, unknown>).recommendCount).toBeUndefined();
  // 한 번 더 왕복해도 같다
  expect(JSON.parse(serialize(deserialize(serialize(back))))).toEqual(JSON.parse(serialize(back)));
});

// ---------- 덜어내기(teardown §3): v25 → v26 (동네 대항전·직원 액티브 스킬 삭제) ----------

test('v25 세이브: 없어진 대항전·액티브 스킬 필드를 지우고 이어 연다', () => {
  const s = bareState(1);
  const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
  obj.version = 25;
  // v25에 있던 대항전·액티브 스킬 상태를 흉내 낸다
  obj.battle = { records: { rv_bakery: { wins: 2, losses: 1, streak: 2, surrendered: false } }, round: null, last: null, pending: true, rankPoints: 4, champion: false, lastMonthIndex: 7 };
  obj.activeSkills = { st1: { skillId: 'as_fast_coffee', usedAt: 1, readyAt: 2, until: 3, power: 0.2, sat: 0 } };
  obj.activeSkillSlots = 2;
  obj.titleChanceBonus = 30;

  const back = deserialize(JSON.stringify(obj));
  expect(back.version).toBe(SAVE_VERSION);
  const raw = back as unknown as Record<string, unknown>;
  expect(raw.battle).toBeUndefined();
  expect(raw.activeSkills).toBeUndefined();
  expect(raw.activeSkillSlots).toBeUndefined();
  expect(raw.titleChanceBonus).toBeUndefined();
  // 남겨야 하는 것 — 러시·동네 경쟁 카페 순위표는 그대로
  expect(back.rush?.phase).toBe('idle');
  expect(back.rivals).toBeTruthy();
  // 한 번 더 왕복해도 같다
  expect(JSON.parse(serialize(deserialize(serialize(back))))).toEqual(JSON.parse(serialize(back)));
});

// ---------- 야외 중심 개편: v26 → v27 (증축·2층·별관·실내 좌석 환불·치환) ----------

test('v26 세이브: 본관 증축 Lv·2층 값을 돌려주고, 없어진 실내 시설·별관은 치우고, 본관은 3×2로 되돌아온다', () => {
  const s = bareState(1);
  s.money = 1_000_000;
  const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
  obj.version = 26;
  // v26 상태 흉내: 본관 Lv3(4×3 아닌 5×3) + 2층, 안에 실내 테이블 하나, 마당에 별관 하나
  const objects = obj.objects as Record<string, Record<string, unknown>>;
  const cells = (obj.grid as { w: number; cells: Record<string, unknown>[] });
  const wh = Object.values(objects).find((o) => o.type === 'warehouse')!;
  wh.w = 5; wh.h = 3;
  (obj.main as Record<string, unknown>) = { level: 3, floor2: true, work: null, movedMonth: -1, undo: null, bgm: null, lighting: 'warm', seatLog: [], usedSeatMs: 0, openMs: 0 };
  const wx = wh.x as number, wy = wh.y as number;
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 5; dx++) {
    const c = cells.cells[(wy + dy) * cells.w + (wx + dx)] as Record<string, unknown>;
    c.roomId = wh.id; c.objectId = wh.id;
  }
  objects['oIn'] = { id: 'oIn', type: 'table_in', x: wx + 2, y: wy + 1, placedMonth: 0 };
  const inner = cells.cells[(wy + 1) * cells.w + (wx + 2)] as Record<string, unknown>;
  inner.objectId = 'oIn';
  objects['oAnnex'] = { id: 'oAnnex', type: 'annex_cafe', x: 0, y: 0, placedMonth: 0 };

  const back = deserialize(JSON.stringify(obj));
  expect(back.version).toBe(SAVE_VERSION);
  // 없어진 시설은 사라지고, 본관은 3×2로 돌아온다
  expect(back.objects['oIn']).toBeUndefined();
  expect(back.objects['oAnnex']).toBeUndefined();
  const main = Object.values(back.objects).find((o) => o.type === 'warehouse')!;
  expect([main.w, main.h]).toEqual([3, 2]);
  // 증축 Lv3(누적 ₩1,100만) + 2층(₩1,500만) + 없어진 시설값이 돌아온다
  expect(back.money).toBeGreaterThanOrEqual(1_000_000 + 26_000_000);
  expect(back.notices.some((n) => n.includes('마당에 앉아요'))).toBe(true);
  // 없어진 본관 필드는 지워진다
  expect((back.main as unknown as Record<string, unknown>).level).toBeUndefined();
  expect((back.main as unknown as Record<string, unknown>).floor2).toBeUndefined();
  // 방 바닥은 3×2만 남는다 (증축으로 커졌던 칸은 마당으로)
  expect(back.grid.cells[(main.y + 2) * back.grid.w + main.x]!.roomId).toBeNull();
  // 한 번 더 왕복해도 같다
  expect(JSON.parse(serialize(deserialize(serialize(back))))).toEqual(JSON.parse(serialize(back)));
});

test('v26 세이브: 옛 실내/야외 담당 구역은 「전체」로 되돌아온다', () => {
  const s = bareState(1);
  const obj = JSON.parse(serialize(s)) as Record<string, unknown>;
  obj.version = 26;
  (obj.staff as Record<string, unknown>[]).push({ id: 'st1', name: '삼춘', role: 'hall', zone: 'indoor', level: 1, energy: 100, exp: 0, stats: { smile: 10, speed: 10, craft: 10, stamina: 10 }, skill: 'none', title: null, training: null, hiredMonth: 0, roleExp: {} } as never);
  const back = deserialize(JSON.stringify(obj));
  expect(back.staff.at(-1)!.zone).toBeUndefined();
});
