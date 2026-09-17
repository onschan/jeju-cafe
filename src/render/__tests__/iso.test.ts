import { describe, it, expect } from 'vitest';
import { ISO_W, ISO_H, cellToScreen, cellCenter, screenToCell, depth, footAnchor } from '../iso';

describe('iso 좌표 변환', () => {
  it('타일 크기 상수', () => {
    expect(ISO_W).toBe(64);
    expect(ISO_H).toBe(32);
  });

  it('cellToScreen: 2:1 다이메트릭', () => {
    expect(cellToScreen(0, 0)).toEqual({ sx: 0, sy: 0 });
    expect(cellToScreen(1, 0)).toEqual({ sx: 32, sy: 16 });
    expect(cellToScreen(0, 1)).toEqual({ sx: -32, sy: 16 });
    expect(cellToScreen(3, 4)).toEqual({ sx: -32, sy: 112 });
  });

  it('cellCenter는 다이아몬드 중심(위 꼭짓점에서 16px 아래)', () => {
    expect(cellCenter(0, 0)).toEqual({ sx: 0, sy: 16 });
    expect(cellCenter(2, 5)).toEqual({ sx: -96, sy: 128 });
  });

  it('왕복: 셀 중심 → 화면 → 셀 (음수 포함 20칸)', () => {
    const cells: [number, number][] = [];
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 1; y++) cells.push([x, y]);
    expect(cells.length).toBe(20);
    for (const [x, y] of cells) {
      const { sx, sy } = cellCenter(x, y);
      expect(screenToCell(sx, sy)).toEqual({ x, y });
    }
  });

  it('screenToCell: (3,4) 다이아몬드 안쪽 점은 (3,4), 변을 넘으면 이웃', () => {
    const { sx, sy } = cellToScreen(3, 4); // 위 꼭짓점
    const c = { sx, sy: sy + 16 };         // 중심
    // 안쪽: 중심 근처와 각 꼭짓점에서 살짝 안쪽
    for (const [dx, dy] of [[0, 0], [20, 0], [-20, 0], [0, 10], [0, -10], [10, 5], [-10, -5]]) {
      expect(screenToCell(c.sx + dx!, c.sy + dy!)).toEqual({ x: 3, y: 4 });
    }
    // 오른쪽 변(위 꼭짓점→오른 꼭짓점)을 넘으면 y−1
    expect(screenToCell(c.sx + 16, c.sy - 9)).toEqual({ x: 3, y: 3 });
    // 왼쪽 위 변을 넘으면 x−1
    expect(screenToCell(c.sx - 16, c.sy - 9)).toEqual({ x: 2, y: 4 });
    // 오른쪽 아래 변을 넘으면 x+1
    expect(screenToCell(c.sx + 16, c.sy + 9)).toEqual({ x: 4, y: 4 });
    // 왼쪽 아래 변을 넘으면 y+1
    expect(screenToCell(c.sx - 16, c.sy + 9)).toEqual({ x: 3, y: 5 });
  });

  it('screenToCell: 음수 화면 좌표도 floor로 처리', () => {
    expect(screenToCell(-1, 0)).toEqual({ x: -1, y: 0 });
    const { sx, sy } = cellCenter(-3, -2);
    expect(screenToCell(sx, sy)).toEqual({ x: -3, y: -2 });
  });

  it('depth: 앞쪽 셀이 더 큰 값', () => {
    expect(depth(1, 1)).toBeLessThan(depth(2, 1));
    expect(depth(2, 1)).toBeLessThan(depth(2, 2));
    expect(depth(1, 2)).toBe(depth(2, 1));
    expect(depth(1, 1)).toBeLessThan(depth(1, 2));
    expect(depth(1, 2)).toBeLessThan(depth(2, 2));
  });

  it('depth: 다중 칸은 앞 모서리 기준', () => {
    expect(depth(0, 0, 2, 2)).toBe(2);
    expect(depth(0, 0, 2, 2)).toBe(depth(1, 1));
    expect(depth(3, 1, 3, 2)).toBe(depth(5, 2));
  });

  it('footAnchor: 2×2 at (0,0)의 앞 꼭짓점은 셀 (1,1)의 아래 꼭짓점', () => {
    const bottomOf11 = { sx: cellToScreen(1, 1).sx, sy: cellToScreen(1, 1).sy + ISO_H };
    expect(footAnchor(0, 0, 2, 2)).toEqual(bottomOf11);
    const bottomOf00 = { sx: 0, sy: 32 };
    expect(footAnchor(0, 0, 1, 1)).toEqual(bottomOf00);
    // 3×2 at (2,1): 앞 셀 (4,2)의 아래 꼭짓점
    expect(footAnchor(2, 1, 3, 2)).toEqual({ sx: cellToScreen(4, 2).sx, sy: cellToScreen(4, 2).sy + ISO_H });
  });
});
