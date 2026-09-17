/** 아이소메트릭(2:1 다이메트릭) 좌표 변환. 타일 64×32.
 *  셀 (x, y)의 다이아몬드는 위 꼭짓점이 `cellToScreen(x, y)`, 중심이 그 16px 아래.
 *  연속 셀 좌표에서 셀 (x, y)는 [x, x+1) × [y, y+1) 정사각형에 해당한다. */

export const ISO_W = 64;
export const ISO_H = 32;

const HW = ISO_W / 2; // 32
const HH = ISO_H / 2; // 16

/** 셀의 다이아몬드 위 꼭짓점 화면 좌표. */
export function cellToScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * HW, sy: (x + y) * HH };
}

/** 셀의 다이아몬드 중심 화면 좌표. */
export function cellCenter(x: number, y: number): { sx: number; sy: number } {
  const { sx, sy } = cellToScreen(x, y);
  return { sx, sy: sy + HH };
}

/** 화면 좌표 → 셀. 연속 역변환 뒤 floor(다이아몬드 안쪽이 그 셀). */
export function screenToCell(sx: number, sy: number): { x: number; y: number } {
  const cx = sx / ISO_W + sy / ISO_H;
  const cy = sy / ISO_H - sx / ISO_W;
  return { x: Math.floor(cx), y: Math.floor(cy) };
}

/** 정렬용 깊이. w×h 오브젝트는 가장 앞 셀(x+w−1, y+h−1) 기준. 손님은 x + y + 0.5를 쓴다. */
export function depth(x: number, y: number, w = 1, h = 1): number {
  return (x + w - 1) + (y + h - 1);
}

/** w×h 발자국의 앞(아래) 꼭짓점 화면 좌표 — 스프라이트 하단 중앙을 여기에 맞춘다. */
export function footAnchor(x: number, y: number, w: number, h: number): { sx: number; sy: number } {
  // 발자국 다이아몬드 합집합은 연속 좌표 [x, x+w] × [y, y+h]; 그 아래 꼭짓점은 (x+w, y+h).
  return cellToScreen(x + w, y + h);
}
