/** 자리 점수 (trim: 입지 5요소 → 전망·그늘 하나): 같은 테이블을 바닷가·나무 그늘·구석에 놓으면 요금·만족·점수가 갈린다. */
import { bareState } from './helpers.ts';
import { placeObject, removeObject } from '../grid.ts';
import type { GameState, PlacedObject } from '../types.ts';
import {
  siteOf, seatScore, siteScore, siteTone, scoredType, scoreOf, siteBonus, siteSay, siteBadgeText, siteLineText, layoutKey,
  SITE_SAY, FEE_PER_VIEW, SITE_MAX, SAT_SHADE_SUMMER,
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

test('두 값만 남는다: 바닷가는 전망, 나무 옆은 그늘, 방 안은 그늘 2', () => {
  const s = yard();
  const sea = siteOf(s, 12, 1);       // 북쪽 가장자리 2줄 방향 = 바다
  const inner = siteOf(s, 14, 12);    // 문 앞 길 바로 옆
  expect(Object.keys(sea).sort()).toEqual(['shade', 'view']);
  for (const st of [sea, inner]) for (const k of ['view', 'shade'] as const) {
    expect(st[k]).toBeGreaterThanOrEqual(0);
    expect(st[k]).toBeLessThanOrEqual(SITE_MAX[k]);
  }
  expect(sea.view).toBeGreaterThanOrEqual(3);
  expect(inner.view).toBe(0);
  placeObject(s, 'tangerine_tree', 17, 13);
  expect(siteOf(s, 18, 13).shade).toBe(1);
  expect(siteOf(s, 14, 10)).toMatchObject({ shade: 2 }); // 본관 바닥 칸
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

test('자리 점수 0~10: 전망이 크게, 그늘이 조금. 바닷가 > 구석', () => {
  const s = yard();
  expect(scoreOf({ view: 0, shade: 0 })).toBe(0);
  expect(scoreOf({ view: 5, shade: 2 })).toBe(10);
  expect(scoreOf({ view: 0, shade: 2 })).toBe(2);
  expect(seatScore(s, 12, 1)).toBeGreaterThan(seatScore(s, 14, 12));
  for (const [x, y] of [[12, 1], [14, 12], [16, 14], [22, 12]] as const) {
    const sc = seatScore(s, x, y);
    expect(sc).toBeGreaterThanOrEqual(0);
    expect(sc).toBeLessThanOrEqual(10);
  }
});

test('같은 테이블을 다른 자리에 놓으면 요금·만족이 갈린다', () => {
  const s = yard();
  const sea = table(s, 12, 1);
  const near = table(s, 14, 12);
  // 요금: 전망 +4%/점
  expect(siteBonus(s, sea).feeMult).toBeCloseTo(1 + FEE_PER_VIEW * siteOf(s, 12, 1).view);
  expect(siteBonus(s, sea).feeMult).toBeGreaterThan(siteBonus(s, near).feeMult);
  expect(siteBonus(s, near).feeMult).toBe(1);
  expect(siteBonus(s, near).satisfaction).toBe(0);
  // 여름: 그늘 +6/점 → 나무 옆이 좋다
  s.clock.month = 7;
  placeObject(s, 'tangerine_tree', 15, 4);
  placeObject(s, 'tangerine_tree', 17, 4);
  const shade = table(s, 16, 4); // 그늘 2 → +12 → 1
  expect(siteBonus(s, shade).satisfaction).toBe(1);
  expect(siteBonus(s, shade).satisfaction).toBeGreaterThan(siteBonus(s, near).satisfaction);
  s.clock.month = 1; // 겨울엔 그늘이 손해(−4/점)
  expect(siteBonus(s, shade).satisfaction).toBeLessThan(1);
  expect(SAT_SHADE_SUMMER).toBeGreaterThan(0);
});

test('파라솔은 자기 자리에 그늘 +1, 이웃 칸에도 그늘', () => {
  const s = yard(7);
  placeObject(s, 'tangerine_tree', 21, 6); // (20,5)·(20,6) 둘 다 그늘 1
  const p = placeObject(s, 'table_parasol', 20, 5); // 그늘 1 + 자기 파라솔 1 = 2 (+12 → 1)
  expect(siteBonus(s, p).satisfaction).toBe(1);
  expect(siteOf(s, 20, 6).shade).toBe(2); // 파라솔은 이웃 칸에도 그늘
});

test('점수가 붙는 종류: 좌석·이용료 시설만. 장식은 null', () => {
  const s = yard();
  placeObject(s, 'cedar', 17, 3);
  expect(scoredType('table_out')).toBe(true);
  expect(scoredType('warehouse')).toBe(true); // 2층 좌석
  expect(scoredType('vending')).toBe(true);
  expect(scoredType('deco_planter')).toBe(false);
  expect(siteScore(s, 'deco_planter', 16, 14)).toBeNull();
  expect(siteTone(s, 'deco_planter', 16, 14)).toBeNull();
  expect(siteScore(s, 'vending', 16, 4)).toBe(seatScore(s, 16, 4));
  expect(siteTone(s, 'vending', 16, 14)).toBe('bad');
  const v = placeObject(s, 'vending', 16, 4);
  expect(siteBonus(s, v).feeMult).toBeCloseTo(1 + FEE_PER_VIEW * siteOf(s, 16, 4).view);
});

test('결정적: 같은 배치면 같은 값, 오브젝트가 바뀌면 캐시가 풀린다', () => {
  const a = yard();
  const b = yard();
  expect(siteOf(a, 12, 1)).toEqual(siteOf(b, 12, 1));
  expect(siteOf(a, 16, 14)).toBe(siteOf(a, 16, 14)); // 캐시 히트
  const before = siteOf(a, 20, 8).view;
  const k0 = layoutKey(a);
  const tree = placeObject(a, 'cedar', 22, 8);
  expect(layoutKey(a)).not.toBe(k0);
  expect(siteOf(a, 20, 8).view).toBeGreaterThan(before);
  removeObject(a, tree.id);
  expect(siteOf(a, 20, 8).view).toBe(before);
  // tick만 지나도 값은 같다
  a.tick += 100;
  expect(siteOf(a, 20, 8)).toEqual(siteOf(b, 20, 8));
  expect(siteOf(a, -1, 0)).toEqual({ view: 0, shade: 0 }); // 격자 밖
});

test('대사: 여름 그늘 "시원하다", 바닷가 "바다가 보인다!"', () => {
  const s = yard(7);
  const sea = table(s, 12, 1);
  placeObject(s, 'tangerine_tree', 17, 13);
  const shade = table(s, 18, 13);
  const guest = (seatId: string) => ({ id: 'g1', type: 'student', phase: 'seated' as const, x: 0, y: 0, path: [], seatId, seatSlot: 0, approachCell: null, menuId: null, mood: 'happy' as const, moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 });
  expect(siteSay(s, guest(shade.id))).toBe(SITE_SAY.cool);
  s.clock.month = 4;
  expect(siteSay(s, guest(sea.id))).toBe(SITE_SAY.sea);
  expect(siteSay(s, guest(table(s, 16, 4).id))).toBeNull();
  expect(siteSay(s, { ...guest(sea.id), phase: 'leaving' })).toBeNull();
  // 배지·카드 문구
  const st = siteOf(s, 12, 1);
  expect(siteBadgeText(st)).toBe(`자리 ${scoreOf(st)}`);
  expect(siteLineText(st)).toBe(`자리 ${scoreOf(st)} (전망 ${st.view} · 그늘 ${st.shade})`);
});
