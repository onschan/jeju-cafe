/** 입지 시스템 (스펙 §6, 트랙 F): 같은 테이블을 바닷가·돌담 뒤·길가·주방 옆에 놓으면 요금·만족·서빙 시간이 표대로 달라진다. */
import { bareState } from './helpers.ts';
import { placeObject, removeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { spawnGuests, updateGuests, PREP_MS } from '../guests.ts';
import type { GameState, PlacedObject, Staff } from '../types.ts';
import {
  siteOf, seatScore, siteScore, siteTone, kindWeights, siteBonus, siteSay, siteBadgeText, siteBadgeTextPlain, siteLineText, layoutKey,
  SEAT_WEIGHTS, STALL_WEIGHTS, SITE_SAY, FEE_PER_VIEW, SERVE_PER_KITCHEN, STALL_PER_TRAFFIC, SITE_MAX,
} from '../site.ts';

/** 본관(13,9 3×2, 문 앞 (13,11))에서 동쪽으로 올렛길 y=11 (x 13~22) + 남쪽으로 (13,12~14) → 마을 길(y=15)·정류장(10,15)과 이어진다 */
function yard(month = 4): GameState {
  const s = bareState(1);
  s.clock.month = month;
  for (let x = 13; x <= 22; x++) placeObject(s, 'path', x, 11);
  for (let y = 12; y <= 14; y++) placeObject(s, 'path', 13, y);
  return s;
}
const table = (s: GameState, x: number, y: number): PlacedObject => placeObject(s, 'table_out', x, y);
const hallStaff = (): Staff => ({ id: 'st1', name: '홀', face: 0, role: 'hall', level: 1, stats: { smile: 50, skill: 10, stamina: 10, sense: 10 }, salary: 0, energy: 100, unpaidMonths: 0, skill: 'coffee_lover', x: 0, y: 0, path: [] } as unknown as Staff);

test('5요소: 바닷가(전망)·돌담 뒤(바람)·길가(길가)·주방 옆(주방 거리)이 표대로 나온다', () => {
  const s = yard();
  const sea = siteOf(s, 12, 1);       // 북쪽 가장자리 2줄 방향 = 바다
  const kitchen = siteOf(s, 14, 12);  // 문 앞 길 바로 옆
  const far = siteOf(s, 22, 12);      // 길 끝 (문 앞에서 9칸)
  const road = siteOf(s, 16, 14);     // 마을 길(y=15) 바로 위
  for (const st of [sea, kitchen, far, road]) for (const k of ['view', 'wind', 'shade', 'traffic', 'kitchen'] as const) {
    expect(st[k]).toBeGreaterThanOrEqual(0);
    expect(st[k]).toBeLessThanOrEqual(SITE_MAX[k]);
  }
  expect(sea.view).toBeGreaterThanOrEqual(3);
  expect(kitchen.view).toBe(0);
  expect(sea.wind).toBe(3);           // 북서쪽에 아무것도 없다
  expect(kitchen.kitchen).toBe(0);
  expect(far.kitchen).toBe(2);        // 9칸 / 4
  expect(road.traffic).toBe(3);
  expect(siteOf(s, 16, 4).traffic).toBe(0);  // 길·도로가 반경 3 안에 없다
  // 돌담 뒤: 북서쪽 쐐기에 돌담 3개 → 바람 0
  for (const [x, y] of [[25, 13], [26, 12], [25, 12]] as const) placeObject(s, 'stonewall', x, y);
  expect(siteOf(s, 26, 13).wind).toBe(0);
  // 나무 옆은 그늘, 방 안은 바람 0·그늘 2
  placeObject(s, 'tangerine_tree', 17, 13);
  expect(siteOf(s, 18, 13).shade).toBe(1);
  expect(siteOf(s, 14, 10)).toMatchObject({ wind: 0, shade: 2 }); // 본관 바닥 칸
});

test('전망: 경관치 3 이상 경관·랜드마크만 전망이고, 방(건물)이 사이를 막으면 −2', () => {
  const s = yard();
  expect(siteOf(s, 20, 8).view).toBe(0);
  placeObject(s, 'deco_planter', 21, 8); // 경관 2 소품은 전망이 아니다
  expect(siteOf(s, 20, 8).view).toBe(0);
  placeObject(s, 'cedar', 22, 8);        // 경관 8 → 4
  expect(siteOf(s, 20, 8).view).toBe(4);
  // 바다 쪽에 본관(방) — 바다와 칸 사이에 건물이 있으면 가려진다
  const s2 = yard();
  expect(siteOf(s2, 12, 2).view).toBe(3);
  placeObject(s2, 'warehouse', 11, 0); // (11~13, 0~1)이 바다와 (12,2) 사이
  expect(siteOf(s2, 12, 2).view).toBe(0);
});

test('같은 테이블을 네 자리에 놓으면 요금·만족·서빙 시간이 갈린다', () => {
  const s = yard();
  for (const [x, y] of [[25, 13], [26, 12], [25, 12]] as const) placeObject(s, 'stonewall', x, y);
  const sea = table(s, 12, 1);
  const wall = table(s, 26, 13);
  const road = table(s, 16, 14);
  const near = table(s, 14, 12);
  const far = table(s, 22, 12);
  // 요금: 전망 +4%/점
  expect(siteBonus(s, sea).feeMult).toBeCloseTo(1 + FEE_PER_VIEW * siteOf(s, 12, 1).view);
  expect(siteBonus(s, sea).feeMult).toBeGreaterThan(siteBonus(s, near).feeMult);
  expect(siteBonus(s, near).feeMult).toBe(1);
  // 서빙: 주방 거리 +15%/점, 홀 직원 있으면 절반
  expect(siteBonus(s, near).serveMult).toBe(1);
  expect(siteBonus(s, far).serveMult).toBeCloseTo(1 + SERVE_PER_KITCHEN * 2);
  s.staff.push(hallStaff());
  expect(siteBonus(s, far).serveMult).toBeCloseTo(1 + SERVE_PER_KITCHEN * 2 * 0.5);
  s.staff.pop();
  // 만족 (봄): 큰 차이 없음
  expect(siteBonus(s, road).satisfaction).toBe(0);
  // 겨울: 바람 −8/점 → 바닷가(바람 3) < 돌담 뒤(바람 0)
  s.clock.month = 1;
  expect(siteBonus(s, sea).satisfaction).toBeLessThan(siteBonus(s, wall).satisfaction);
  expect(siteBonus(s, sea).satisfaction).toBeLessThanOrEqual(-1); // −24(바람) + 9(전망) → −15/10
  // 여름: 그늘 +6/점 → 나무 옆이 좋다, 바람은 시원함(+)
  s.clock.month = 7;
  placeObject(s, 'tangerine_tree', 15, 4);
  placeObject(s, 'tangerine_tree', 17, 4);
  const shade = table(s, 16, 4); // 그늘 2(+12) + 바람 2(왼쪽 나무가 막아 +6) → 1
  expect(siteBonus(s, shade).satisfaction).toBe(1);
  expect(siteBonus(s, shade).satisfaction).toBeGreaterThan(siteBonus(s, near).satisfaction);
  s.clock.month = 1; // 겨울엔 그늘이 손해(−4/점) → 여름보다 낮다
  expect(siteBonus(s, shade).satisfaction).toBeLessThan(1);
  s.clock.month = 7;
  expect(siteBonus(s, sea).satisfaction).toBeGreaterThanOrEqual(0);
  // 좌석 점수: 돌담 뒤 > 길가·바닷가(바람)
  expect(seatScore(s, 26, 13)).toBeGreaterThan(seatScore(s, 16, 14));
  for (const o of [sea, wall, road, near, far, shade]) { const sc = seatScore(s, o.x, o.y); expect(sc).toBeGreaterThanOrEqual(0); expect(sc).toBeLessThanOrEqual(10); }
});

test('파라솔: 바람 2 미만이면 자기 그늘 +1, 2 이상이면 접힌다', () => {
  const s = yard(7);
  const open = placeObject(s, 'table_parasol', 20, 9);   // 바람 3
  expect(siteBonus(s, open).satisfaction).toBe(siteBonus(s, table(s, 21, 9)).satisfaction);
  for (const [x, y] of [[19, 5], [20, 4], [19, 4]] as const) placeObject(s, 'stonewall', x, y);
  placeObject(s, 'tangerine_tree', 21, 6); // (20,5)·(20,6) 둘 다 그늘 1
  const sheltered = placeObject(s, 'table_parasol', 20, 5); // 바람 0 → 파라솔 그늘 +1 = 2 (+12 → 1)
  expect(siteBonus(s, sheltered).satisfaction).toBe(1);
  expect(siteOf(s, 20, 6).shade).toBe(2); // 파라솔은 이웃 칸에도 그늘
});

test('매대(이용료 시설): 길가 ×(1+0.15×traffic), 좌석 가중치와 다르다', () => {
  const s = yard();
  const roadside = placeObject(s, 'vending', 16, 14);
  const quiet = placeObject(s, 'vending', 16, 4);
  expect(siteBonus(s, roadside).feeMult).toBeCloseTo(1 + STALL_PER_TRAFFIC * 3);
  expect(siteBonus(s, quiet).feeMult).toBe(1);
  expect(siteBonus(s, roadside).serveMult).toBe(1);
  expect(kindWeights('table_out')).toBe(SEAT_WEIGHTS);
  expect(kindWeights('warehouse')).toBe(SEAT_WEIGHTS); // 2층 좌석
  expect(kindWeights('vending')).toBe(STALL_WEIGHTS);
  expect(kindWeights('deco_planter')).toBeNull();
  expect(siteScore(s, 'deco_planter', 16, 14)).toBeNull();
  expect(siteTone(s, 'deco_planter', 16, 14)).toBeNull();
  expect(siteScore(s, 'vending', 16, 14)).toBe(10);
  expect(siteTone(s, 'vending', 16, 14)).toBe('good');
  expect(siteTone(s, 'vending', 16, 4)).toBe('bad');
});

test('결정적: 같은 배치면 같은 값, 오브젝트가 바뀌면 캐시가 풀린다', () => {
  const a = yard();
  const b = yard();
  expect(siteOf(a, 12, 1)).toEqual(siteOf(b, 12, 1));
  expect(siteOf(a, 16, 14)).toEqual(siteOf(a, 16, 14));
  expect(siteOf(a, 16, 14)).toBe(siteOf(a, 16, 14)); // 캐시 히트
  const before = siteOf(a, 26, 13).wind;
  const k0 = layoutKey(a);
  const wall = placeObject(a, 'stonewall', 25, 12);
  expect(layoutKey(a)).not.toBe(k0);
  expect(siteOf(a, 26, 13).wind).toBe(before - 1);
  removeObject(a, wall.id);
  expect(siteOf(a, 26, 13).wind).toBe(before);
  // tick만 지나도 값은 같다
  a.tick += 100;
  expect(siteOf(a, 26, 13)).toEqual(siteOf(b, 26, 13));
  expect(siteOf(a, -1, 0)).toEqual({ view: 0, wind: 3, shade: 0, traffic: 0, kitchen: 4 }); // 격자 밖
});

test('손님 흐름: 먼 자리에 앉은 손님은 조리 대기가 서빙 배수만큼 길다 (guests.ts 훅)', () => {
  const s = yard();
  const far = table(s, 22, 12);
  setSlot(s, 0, 'americano');
  expect(spawnGuests(s, 1)).toBe(1);
  updateGuests(s, 10_000);
  const g = s.guests[0]!;
  expect(g.phase).toBe('seated');
  expect(g.seatId).toBe(far.id);
  expect(g.waitMs).toBeCloseTo(PREP_MS * siteBonus(s, far).serveMult);
  expect(g.waitMs).toBeGreaterThan(PREP_MS);
});

test('대사: 겨울 바람 자리 "춥다…", 여름 그늘 "시원하다", 바닷가 "바다가 보인다!"', () => {
  const s = yard(1);
  const sea = table(s, 12, 1);
  placeObject(s, 'tangerine_tree', 17, 13);
  const shade = table(s, 18, 13);
  const guest = (seatId: string) => ({ id: 'g1', type: 'student', phase: 'seated' as const, x: 0, y: 0, path: [], seatId, seatSlot: 0, approachCell: null, menuId: null, mood: 'happy' as const, moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 });
  expect(siteSay(s, guest(sea.id))).toBe(SITE_SAY.cold);
  s.clock.month = 7;
  expect(siteSay(s, guest(shade.id))).toBe(SITE_SAY.cool);
  s.clock.month = 4;
  expect(siteSay(s, guest(sea.id))).toBe(SITE_SAY.sea);
  expect(siteSay(s, guest(table(s, 16, 4).id))).toBeNull();
  expect(siteSay(s, { ...guest(sea.id), phase: 'leaving' })).toBeNull();
  // 배지·카드 문구
  const st = siteOf(s, 12, 1);
  expect(siteBadgeText(st)).toBe(`👁${st.view} 🌬${st.wind} ☂${st.shade} 🚶${st.traffic} 🍳${st.kitchen}`);
  expect(siteBadgeTextPlain(st)).toBe(`전망${st.view} 바람${st.wind} 그늘${st.shade} 길가${st.traffic} 주방${st.kitchen}`);
  expect(siteLineText(st)).toBe(`전망 ${st.view} · 바람 ${st.wind} · 그늘 ${st.shade} · 길가 ${st.traffic} · 주방 ${st.kitchen}`);
});
