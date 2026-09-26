/** 자리 등급 A~D — 요금 배수를 네 칸으로 자른 글자. 값을 새로 만들지 않는다 (카드의 %와 어긋날 수 없다). */
import { describe, it, expect } from 'vitest';
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { seatFeeQuote } from '../fee.ts';
import { gradeOfPct, gradeOfMult, pctToNextGrade, seatGrade, gradeIfPlaced, gradeCounts, gradeCountsText, scoreGrade, GRADE_MIN_PCT } from '../seatGrade.ts';

describe('자리 등급', () => {
  it('문턱: A ≥ 60% · B ≥ 35% · C ≥ 15% · 나머지 D — 경계값은 위 등급', () => {
    expect(gradeOfPct(-6)).toBe('D');
    expect(gradeOfPct(0)).toBe('D');
    expect(gradeOfPct(GRADE_MIN_PCT.C - 1)).toBe('D');
    expect(gradeOfPct(GRADE_MIN_PCT.C)).toBe('C');
    expect(gradeOfPct(GRADE_MIN_PCT.B)).toBe('B');
    expect(gradeOfPct(GRADE_MIN_PCT.A)).toBe('A');
    expect(gradeOfPct(94)).toBe('A');
    expect(gradeOfMult(1.35)).toBe('B');
  });

  it('다음 등급까지 몇 %p — A면 없다', () => {
    expect(pctToNextGrade(0)).toEqual({ next: 'C', need: 15 });
    expect(pctToNextGrade(20)).toEqual({ next: 'B', need: 15 });
    expect(pctToNextGrade(50)).toEqual({ next: 'A', need: 10 });
    expect(pctToNextGrade(70)).toBeNull();
  });

  it('놓인 자리의 등급은 fee.ts 배수와 같은 %에서 나온다 — 장식은 등급이 없다', () => {
    const s = bareState(1);
    s.money = 1e8;
    s.menuSlots = ['americano', 'latte', 'tangerine_juice'];
    const t = placeObject(s, 'table_out', X(3), Y(3))!;
    const tree = placeObject(s, 'cherry_tree', X(3), Y(4))!;
    const g = seatGrade(s, t)!;
    expect(g.pct).toBe(Math.round((seatFeeQuote(s, t).mult - 1) * 100));
    expect(g.grade).toBe(gradeOfPct(g.pct));
    expect(seatGrade(s, tree)).toBeNull();
  });

  it('놓기 전 예상 등급(gradeIfPlaced)은 놓은 뒤 등급과 같다', () => {
    const s = bareState(1);
    s.money = 1e8;
    s.menuSlots = ['americano', 'latte', 'tangerine_juice'];
    placeObject(s, 'cherry_tree', X(3), Y(4));
    const before = gradeIfPlaced(s, 'table_out', X(3), Y(3))!;
    const t = placeObject(s, 'table_out', X(3), Y(3))!;
    expect(seatGrade(s, t)).toEqual(before);
    expect(gradeIfPlaced(s, 'flower_bed', X(5), Y(5))).toBeNull();
  });

  it('등급별 자리 수 한 줄 — 0인 등급은 빼고, 자리가 없으면 「자리 없음」', () => {
    const s = bareState(1);
    s.money = 1e8;
    s.menuSlots = ['americano', 'latte', 'tangerine_juice'];
    expect(gradeCountsText(gradeCounts(s))).toBe('자리 없음');
    placeObject(s, 'table_out', X(3), Y(3));
    placeObject(s, 'table_out', X(5), Y(3));
    const c = gradeCounts(s);
    expect(c.A + c.B + c.C + c.D).toBe(2);
    expect(gradeCountsText(c)).toMatch(/^[A-D] \d+( · [A-D] \d+)*$/);
  });

  it('라이벌 총점도 같은 글자로', () => {
    expect(scoreGrade(72)).toBe('A');
    expect(scoreGrade(55)).toBe('B');
    expect(scoreGrade(31)).toBe('C');
    expect(scoreGrade(10)).toBe('D');
  });
});
