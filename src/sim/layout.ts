/** 맵 배치 상수 — 다른 sim 모듈을 import하지 않는 잎 모듈 (순환 import 방지). */

/** 필지는 3열 × 3행, 각 12×10. 1번(시작)이 정중앙 — 상하좌우·대각 모두로 넓어진다 (피드백 2차).
 *  zero-base(specs/2026-09-26-zero-base-start.md): 10×8(80칸)은 본관 4×3을 앉히면 마당이 남지 않았다 — 120칸으로. */
export const PARCEL_COLS = 3;
export const PARCEL_ROWS = 3;
export const PARCEL_W = 12;
export const PARCEL_H = 10;
/** 필지 id → (열, 행). 시작 필지가 가운데. */
export const PARCEL_LAYOUT: Record<string, { col: number; row: number }> = {
  parcel2: { col: 0, row: 0 }, parcel3: { col: 1, row: 0 }, stone_hill: { col: 2, row: 0 },
  parcel4: { col: 0, row: 1 }, parcel1: { col: 1, row: 1 }, village_edge: { col: 2, row: 1 },
  orchard: { col: 0, row: 2 }, parcel6: { col: 1, row: 2 }, parcel5: { col: 2, row: 2 },
};
/** 시작 필지(가운데)의 왼쪽 위 칸. 시작 오브젝트·봇·테스트가 이 기준으로 좌표를 잡는다. */
export const START_ORIGIN = { x: PARCEL_LAYOUT.parcel1!.col * PARCEL_W, y: PARCEL_LAYOUT.parcel1!.row * PARCEL_H } as const;
/** 격자는 처음부터 3×3 필지 전체(30×24)다. */
export const GRID_W = PARCEL_W * PARCEL_COLS;
export const GRID_H = PARCEL_H * PARCEL_ROWS;
/** 마을 길: 시작 필지 아래 변(가운데 줄 필지들의 맨 아랫줄)이 맵 가로 전체로 이어진다 */
export const VILLAGE_ROAD_Y = START_ORIGIN.y + PARCEL_H - 1;
/** 본관 문 앞 (문 (ox+4, oy+3) 바로 아래 칸). 직원 대기 위치. state.ts START_MAIN과 같은 값에서 나온다. */
export const WAREHOUSE_FRONT = { x: START_ORIGIN.x + 4, y: START_ORIGIN.y + 4 } as const;
/** 손님이 맵으로 들어오는 칸 (entry.ts ENTRY_ROUTES.entry와 같은 값).
 *  path.ts가 entry.ts를 import하면 순환이라 좌표만 잎 모듈에 둔다. */
export const ENTRY_CELLS = {
  bus: { x: 0, y: VILLAGE_ROAD_Y },
  parking: { x: GRID_W - 1, y: VILLAGE_ROAD_Y },
  olle: { x: 0, y: PARCEL_LAYOUT.parcel4!.row * PARCEL_H + 4 }, // zero-base: 문 앞 칸(WAREHOUSE_FRONT)과 같은 줄 — 한 줄로 이을 수 있다
} as const;
