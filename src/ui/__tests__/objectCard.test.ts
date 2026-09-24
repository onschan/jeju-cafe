/** video P0-4: 시설 손익 카드 — 「합계」 줄이 objectStats 그대로인지, 「누구에게 인기」가 거짓말을 안 하는지, n/N 페이저 차례. */
import { bareState, X, Y } from '../../sim/__tests__/helpers.ts';
import { placeObject } from '../../sim/grid.ts';
import { objectStats, sceneryScore, unlockedTypeIds, BASE_POPULARITY, BASE_FEE_PCT } from '../../sim/index.ts';
import { objectDef, guestTypeDef } from '../../data/index.ts';
import { bestGuestType, sameKindObjects } from '../ObjectInfoPanel';
import { nextGhostAfterPlace } from '../placing.ts';

test('합계 줄 = 기본 + 보너스이고, 그 합계는 objectStats가 준 값 그대로다 (새로 계산하지 않는다)', () => {
  const s = bareState(1);
  const o = placeObject(s, 'table_out', X(4), Y(5));
  const st = objectStats(s, o.id);
  const d = objectDef(o.type);
  const baseP = d.popularity ?? BASE_POPULARITY;
  const baseF = d.feePct ?? BASE_FEE_PCT;
  expect(baseP + (st.popularity - baseP)).toBe(st.popularity);
  expect(baseF + (st.feePct - baseF)).toBe(st.feePct);
  // 경치는 인기와 다른 축이라 합계에 섞이지 않는다 — 카드에서도 따로 선다
  expect(st.scenery).toBe(objectStats(s, o.id).scenery);
});

test('누구에게 인기: 자리는 눈높이(minScenery)를 넘긴 손님층 중 가장 까다로운 층을 고른다', () => {
  const s = bareState(1);
  const o = placeObject(s, 'table_out', X(4), Y(5));
  const around = sceneryScore(s, o.x, o.y);
  const best = bestGuestType(s, o.id)!;
  expect(best).not.toBeNull();
  const def = guestTypeDef(best.id);
  expect(def.name).toBe(best.name);
  expect(around).toBeGreaterThanOrEqual(def.minScenery); // 이 자리가 실제로 만족시키는 손님층이다
  for (const id of unlockedTypeIds(s)) {
    const g = guestTypeDef(id);
    if (around >= g.minScenery) expect(g.minScenery).toBeLessThanOrEqual(def.minScenery); // 그중 가장 까다로운 층
  }
  // 없는 시설을 물어도 안 터진다
  expect(bestGuestType(s, 'nope')).toBeNull();
});

test('n/N 페이저: 같은 종류만 모아 왼쪽 위부터 줄 세운다', () => {
  const s = bareState(1);
  const a = placeObject(s, 'table_out', X(4), Y(5));
  const b = placeObject(s, 'table_out', X(1), Y(2));
  placeObject(s, 'stonewall', X(6), Y(6)); // 다른 종류는 안 섞인다
  const list = sameKindObjects(s, a.id);
  expect(list.map((o) => o.id)).toEqual([b.id, a.id]); // 위쪽(y 작은 것)이 먼저
  expect(sameKindObjects(s, b.id).map((o) => o.id)).toEqual([b.id, a.id]);
  expect(sameKindObjects(s, 'nope')).toEqual([]);
});

test('video P0-2: 돈이 떨어져도 배치 모드를 끊는 말이 아니라 얼마가 모자란지를 알린다', () => {
  const s = bareState(1);
  s.money = 0;
  const end = nextGhostAfterPlace(s, 'table_out', { x: X(3), y: Y(3), rot: 0 });
  expect(end.done).toBe(true);
  if (end.done) {
    expect(end.reason).toContain('돈이 모자라요');
    expect(end.reason).toContain('필요');
    expect(end.reason).not.toContain('마쳤'); // 모드를 끝낸다는 말은 없다
  }
});
