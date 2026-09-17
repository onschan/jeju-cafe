import { START_ORIGIN } from '../layout.ts';

/** 시작 필지 상대 좌표 → 격자 좌표. 시작 필지가 정중앙(10,8)이라 테스트 고정값은 이 도우미로 옮긴다. */
export const X = (x: number) => START_ORIGIN.x + x;
export const Y = (y: number) => START_ORIGIN.y + y;
export const at = (x: number, y: number) => ({ x: X(x), y: Y(y) });
