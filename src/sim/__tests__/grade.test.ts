/** fun-rank: 카페 등급 5단계(grade.ts) · 필지 특징(parcels.ts PARCEL_FEATURES) · 목표 사다리 조건(goals.ts 새 체커) */
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { apply } from '../actions.ts';
import { spawnGuests } from '../guests.ts';
import { checkGrade, gradeOf, gradeName, gradeProgress, gradeMet, cornerCount, guestCap, gradeUpRewards, GRADE_NAMES, GRADE_REQS, GRADE_CAPTION, MAX_GRADE, GRADE_GUEST_CAP_BASE, GRADE_GUEST_CAP_STEP, GRADE_UP_TICKETS, GRADE_UP_TICKETS_PER } from '../grade.ts';
import { updateRank } from '../rank.ts';
import { PARCEL_FEATURES, parcelFeature, buyParcel } from '../parcels.ts';
import { conditionProgress, goalConditionText } from '../goals.ts';
import { serialize, deserialize } from '../save.ts';
import { GOALS } from '../../data/index.ts';
import type { GameState } from '../types.ts';

/** 코너 1개(꽃길) — 트랙 C corners.json: 꽃밭 + 벤치 + 가로등 반경 2 */
function flowerPath(s: GameState) {
  placeObject(s, 'flower_bed', X(2), Y(2));
  placeObject(s, 'deco_wood_bench', X(3), Y(2));
  placeObject(s, 'streetlight', X(2), Y(3));
}
/** 등급 g 조건을 딱 맞게 채운다 (코너는 활성 콤보 — 감귤나무+돌담 「돌담 수확」류가 없어도 되게 cornerCount를 넘기지 않고 조건에서 0으로 둔다) */
function meet(s: GameState, g: number): void {
  const r = GRADE_REQS[g]!;
  s.totalGuests = r.guests;
  s.reputation = r.reputation;
  s.star = r.star;
}

test('등급 표: 이름 5개·조건 4종은 단계마다 오른다·캡션은 22자 이하', () => {
  expect(GRADE_NAMES).toEqual(['올레길 노점', '동네 카페', '소문난 카페', '제주 명소', '전설의 카페']);
  expect(MAX_GRADE).toBe(5);
  for (let g = 3; g <= 5; g++) for (const k of ['guests', 'corners', 'reputation', 'star'] as const) expect(GRADE_REQS[g]![k], `${g}.${k}`).toBeGreaterThanOrEqual(GRADE_REQS[g - 1]![k]);
  for (let g = 1; g <= 5; g++) expect(GRADE_CAPTION[g]!.length, `caption ${g}`).toBeLessThanOrEqual(22);
  expect(gradeName(1)).toBe('올레길 노점');
  expect(gradeName(9)).toBe('전설의 카페');
});

test('새 게임은 등급 1, 진행 4줄, 조건이 하나라도 모자라면 승급하지 않는다', () => {
  const s = bareState(1);
  expect(gradeOf(s)).toBe(1);
  const rows = gradeProgress(s)!;
  expect(rows.map((r) => r.key)).toEqual(['guests', 'corners', 'reputation', 'star']);
  expect(rows.every((r) => r.need === GRADE_REQS[2]![r.key])).toBe(true);
  meet(s, 2);
  expect(cornerCount(s)).toBe(0);
  expect(gradeMet(s, 2)).toBe(false); // 코너 0/1
  expect(checkGrade(s)).toBeNull();
  expect(gradeOf(s)).toBe(1);
});

test('조건을 다 채우면 하루 한 단계 승급: 등급·알림·장면·박수 fx·보상 상자(응모권), rank.ts 훅으로도 돈다', () => {
  const s = bareState(1);
  meet(s, 2);
  // 코너 1: 꽃길 (트랙 C completedCorners — 꽃밭+벤치+가로등)
  flowerPath(s);
  expect(cornerCount(s)).toBe(1);
  const tickets = s.tickets, mileage = s.tickets;
  expect(checkGrade(s)).toBe(2);
  expect(gradeOf(s)).toBe(2);
  expect(s.alerts.map((a) => a.type)).toEqual(['reward', 'grade']);
  const reward = s.alerts[0]!;
  expect(reward.type === 'reward' && reward.source === 'grade' && reward.refId === 'grade2').toBe(true);
  expect(s.tickets).toBe(tickets + GRADE_UP_TICKETS + GRADE_UP_TICKETS_PER * (gradeOf(s) - 1));
  expect(s.fx.map((f) => f.kind)).toEqual(expect.arrayContaining(['scene', 'applause']));
  expect(s.fx.find((f) => f.kind === 'scene')!.kind === 'scene' && (s.fx.find((f) => f.kind === 'scene') as { title: string }).title).toBe('「동네 카페」');
  // 같은 날 두 단계는 오르지 않는다 (조건이 돼도 한 번에 하나)
  meet(s, 3);
  s.grade = 2;
  expect(cornerCount(s)).toBeLessThan(GRADE_REQS[3]!.corners);
  expect(checkGrade(s)).toBeNull();
  // rank.ts updateRank 훅: 등급 판정이 같이 돈다
  const t = bareState(2);
  meet(t, 2);
  flowerPath(t);
  updateRank(t);
  expect(gradeOf(t)).toBe(2);
  expect(gradeUpRewards(5)).toEqual([{ type: 'tickets', n: GRADE_UP_TICKETS + GRADE_UP_TICKETS_PER * 4 }]);
});

test('마당 동시 손님 상한 = 30 + 10×(등급−1): 등급 4가 예전 60, 등급 5는 70', () => {
  const s = bareState(1);
  expect(GRADE_GUEST_CAP_BASE + GRADE_GUEST_CAP_STEP * 3).toBe(60);
  expect(guestCap(s)).toBe(30);
  s.grade = 5;
  expect(guestCap(s)).toBe(70);
  // 스폰 훅: 상한까지만
  s.grade = 1;
  for (let x = 0; x < 20; x++) { placeObject(s, 'table_out', X(x), Y(4)); if (x !== 4) placeObject(s, 'table_out', X(x), Y(6)); }
  for (let x = 0; x < 20; x++) placeObject(s, 'path', X(x), Y(5));
  expect(spawnGuests(s, 50)).toBe(30);
});

test('세이브 왕복: grade 필드 유지, 옛 세이브(grade 없음)는 1로 채운다', () => {
  const s = bareState(1);
  s.grade = 3;
  const back = deserialize(serialize(s));
  expect(back.grade).toBe(3);
  const obj = JSON.parse(serialize(bareState(1))) as { state?: GameState } & GameState;
  const target = (obj.state ?? obj) as GameState;
  delete (target as { grade?: number }).grade;
  expect(deserialize(JSON.stringify(obj)).grade).toBe(1);
});

test('필지 특징: 9장 전부 아이콘·특징·"사면 생기는 것"(≤22자)·랜드마크가 있고, 사면 안개 fx + 장면 창', () => {
  const s = bareState(1);
  for (const p of s.parcels) {
    const f = parcelFeature(p);
    expect(PARCEL_FEATURES[p.id], p.id).toBeDefined();
    expect(f.gain.length, `${p.id} gain`).toBeLessThanOrEqual(22);
    expect(f.icon.length).toBeGreaterThan(0);
    expect(f.landmark.length).toBeGreaterThan(0);
  }
  expect(parcelFeature(s.parcels.find((p) => p.no === 5)!).feature).toBe('바다 조망');
  s.money = 100_000_000;
  buyParcel(s, 'parcel2');
  expect(s.fx.some((f) => f.kind === 'parcel' && f.id === 'parcel2')).toBe(true);
  expect(s.fx.some((f) => f.kind === 'scene' && f.title === '오름 자락')).toBe(true);
});

test('목표 사다리 새 조건: 등급·코너·단골·2층·평판·전설 직원·경로 수 판정과 문구', () => {
  const s = bareState(1);
  s.grade = 3;
  expect(conditionProgress(s, { type: 'grade', n: 4 })).toEqual({ cur: 3, max: 4 });
  expect(conditionProgress(s, { type: 'corners', n: 5 }).cur).toBe(0); // 목표 corners는 코너 도감(codex.corners, 트랙 C)
  expect(conditionProgress(s, { type: 'secondFloor' })).toEqual({ cur: 0, max: 1 });
  s.main.floor2 = true;
  expect(conditionProgress(s, { type: 'secondFloor' })).toEqual({ cur: 1, max: 1 });
  s.reputation = 81.4;
  expect(conditionProgress(s, { type: 'reputation', n: 80 })).toEqual({ cur: 81, max: 80 });
  expect(conditionProgress(s, { type: 'legendStaff', n: 1 })).toEqual({ cur: 0, max: 1 });
  expect(conditionProgress(s, { type: 'routesOpen', n: 4 })).toEqual({ cur: 1, max: 4 }); // fun P0: 주차장은 처음부터 열린 경로
  expect(conditionProgress(s, { type: 'regulars', n: 30 }).max).toBe(30);
  expect(goalConditionText({ type: 'grade', n: 4 })).toBe('등급 「제주 명소」');
  expect(goalConditionText({ type: 'corners', n: 5 })).toBe('코너 5개');
  expect(goalConditionText({ type: 'secondFloor' })).toBe('본관 2층 올리기');
  expect(goalConditionText({ type: 'legendStaff', n: 1 })).toBe('전설 직원 채용');
  expect(goalConditionText({ type: 'routesOpen', n: 4 })).toBe('손님 오는 길 4종');
  // 사다리: 후반 목표(g45~)에 자금 목표가 없고, 등급 3·4·5·본관 Lv3/4·2층·직원이 들어 있다 (trim: 목표 60)
  const late = GOALS.slice(44).map((g) => g.condition);
  expect(late.some((c) => c.type === 'money')).toBe(false);
  expect(late.filter((c) => c.type === 'grade').map((c) => (c as { n: number }).n).sort()).toEqual([3, 4, 5]);
  expect(late.filter((c) => c.type === 'mainLevel').map((c) => (c as { lv: number }).lv).sort()).toEqual([3, 4]);
  expect(late.some((c) => c.type === 'secondFloor')).toBe(true);
  expect(late.some((c) => c.type === 'staff')).toBe(true);
  // 조건 문구는 전부 있다 (switch 누락 방지)
  for (const g of GOALS) expect(goalConditionText(g.condition).length, g.id).toBeGreaterThan(0);
  void apply;
});
