/** fix-indoor: 밤 조명 — 가로등(반경 2, 저녁 만족 +2)·정원등(반경 1)·초롱, 조명 없는 야외 자리는 밤 −2 「어두워요」 */
import { describe, test, expect } from 'vitest';
import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { placeObject } from '../grid.ts';
import { buildGroupOf, objectDef, START_OBJECT_IDS } from '../../data/index.ts';
import { NIGHT_HOUR, LIGHT_RADIUS, STREETLIGHT_SAT, DARK_SAT, lightAt, litCellsOf, nightSeatPoints, nightSatisfaction, nightSeatLine, lights } from '../lighting.ts';
import { extraSatisfaction } from '../guests.ts';
import type { Guest } from '../types.ts';

describe('가로등·정원등 데이터', () => {
  test('처음부터 열려 있고, 가로등은 길·담 탭·₩8만·경관 +1·반경 2, 정원등은 경관·장식 탭·₩5만·반경 1', () => {
    expect(START_OBJECT_IDS).toEqual(expect.arrayContaining(['streetlight', 'garden_lamp']));
    expect(objectDef('streetlight')).toMatchObject({ name: '가로등', cost: 80_000, scenery: 1, w: 1, h: 1 });
    expect(objectDef('garden_lamp')).toMatchObject({ name: '정원등', cost: 50_000, scenery: 1 });
    expect(buildGroupOf('streetlight')).toBe('pathWall');
    expect(buildGroupOf('garden_lamp')).toBe('sceneryDeco');
    expect(LIGHT_RADIUS).toMatchObject({ streetlight: 2, garden_lamp: 1, lantern_path: 1, stone_lantern: 1 });
    const s = bareState(1);
    expect(s.unlocked.objects).toEqual(expect.arrayContaining(['streetlight', 'garden_lamp']));
    expect(apply(s, { type: 'place', objectType: 'streetlight', x: X(0), y: Y(0) }).ok).toBe(true);
  });
});

describe('밤 밝기·만족', () => {
  test('가로등 반경 2 안은 밝고 가로등 불빛, 정원등 반경 1은 밝지만 가로등 아님, 실내는 늘 밝다', () => {
    const s = bareState(1);
    const l = placeObject(s, 'streetlight', X(0), Y(0));
    expect(lights(s).map((o) => o.id)).toEqual([l.id]);
    expect(litCellsOf(l)).toHaveLength(25);
    expect(lightAt(s, X(2), Y(2))).toEqual({ lit: true, streetlight: true });
    expect(lightAt(s, X(3), Y(0))).toEqual({ lit: false, streetlight: false });
    placeObject(s, 'garden_lamp', X(6), Y(6));
    expect(lightAt(s, X(7), Y(7))).toEqual({ lit: true, streetlight: false });
    expect(lightAt(s, X(8), Y(6))).toEqual({ lit: false, streetlight: false });
    expect(lightAt(s, X(4), Y(2)).lit).toBe(true); // 본관 안
    // 공사 중(build)인 조명은 아직 안 밝는다
    const b = placeObject(s, 'streetlight', X(8), Y(1));
    b.build = { doneDay: 99, days: 1 } as typeof b.build;
    expect(lightAt(s, X(8), Y(1)).lit).toBe(false);
  });

  test('18시부터 마당 자리: 가로등 +2 · 정원등 0 · 조명 없음 −2 (경치 단위 /10), 낮엔 0', () => {
    const s = bareState(1);
    const dark = placeObject(s, 'table_out', X(0), Y(5));
    const lit = placeObject(s, 'table_out', X(1), Y(1));
    const soft = placeObject(s, 'table_out', X(7), Y(7));
    placeObject(s, 'streetlight', X(0), Y(0));
    placeObject(s, 'garden_lamp', X(6), Y(6));
    s.clock.hour = NIGHT_HOUR - 1;
    expect(nightSeatPoints(s, dark)).toBe(0);
    s.clock.hour = NIGHT_HOUR;
    expect(nightSeatPoints(s, dark)).toBe(DARK_SAT);
    expect(nightSeatPoints(s, lit)).toBe(STREETLIGHT_SAT);
    expect(nightSeatPoints(s, soft)).toBe(0);
    expect(nightSatisfaction(s, dark)).toBeCloseTo(DARK_SAT / 10);
    // 손님 만족 훅에 들어간다
    const g = { type: 'tourist', mood: null } as unknown as Guest;
    expect(extraSatisfaction(s, g, lit) - extraSatisfaction(s, g, dark)).toBeCloseTo((STREETLIGHT_SAT - DARK_SAT) / 10);
    // 카드 줄
    expect(nightSeatLine(s, dark)).toEqual({ text: `밤엔 어두워요 (만족 ${DARK_SAT}) — 가로등·정원등을 두세요`, bad: true });
    expect(nightSeatLine(s, lit)).toMatchObject({ bad: false });
    expect(nightSeatLine(s, lit)!.text).toContain('가로등');
    expect(nightSeatLine(s, soft)).toMatchObject({ bad: false });
    expect(nightSeatLine(s, Object.values(s.objects).find((o) => o.type === 'streetlight')!)).toBeNull();
  });
});
