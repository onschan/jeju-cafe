/** 상성 UP (video-flow §2-1 C): 시설을 놓으면 값이 오른 자리마다 +n% 가 한꺼번에 뜬다 */
import { describe, it, expect } from 'vitest';
import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { placeObject } from '../grid.ts';

describe('상성 UP', () => {
  it('벚나무를 자리 곁에 놓으면 그 자리들 위에 +n% 가 뜬다 — 놓은 것 자신은 빼고', () => {
    const s = bareState(1);
    s.money = 1e8;
    s.menuSlots = ['americano', 'latte', 'tangerine_juice'];
    const a = placeObject(s, 'table_out', X(3), Y(3))!;
    const b = placeObject(s, 'table_out', X(4), Y(3))!;
    const far = placeObject(s, 'table_out', X(9), Y(9))!; // 반경 밖
    s.fx = [];
    expect(apply(s, { type: 'place', objectType: 'cherry_tree', x: X(3), y: Y(4) }).ok).toBe(true);
    const ups = s.fx.filter((f) => f.kind === 'up');
    expect(ups.length).toBe(2);
    expect(ups.map((f) => f.kind === 'up' && `${f.x},${f.y}`).sort()).toEqual([`${a.x},${a.y}`, `${b.x},${b.y}`].sort());
    expect(ups.every((f) => f.kind === 'up' && /^\+\d+%$/.test(f.text))).toBe(true);
    expect(ups.map((f) => f.kind === 'up' && f.order)).toEqual([0, 1]); // 차례로 튀어오른다
    void far;
  });

  it('값이 안 오르는 것(자리 자체·먼 데 장식)은 아무것도 안 띄운다', () => {
    const s = bareState(1);
    s.money = 1e8;
    s.menuSlots = ['americano', 'latte', 'tangerine_juice'];
    placeObject(s, 'table_out', X(3), Y(3));
    s.fx = [];
    expect(apply(s, { type: 'place', objectType: 'path', x: X(3), y: Y(4) }).ok).toBe(true); // 올렛길 한 칸 — 자리 값은 그대로
    expect(s.fx.some((f) => f.kind === 'up')).toBe(false);
  });
});
