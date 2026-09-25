/**
 * 직원 근무 자리 (staffpost): 직원을 **마당의 칸에 직접 세운다**.
 *
 * 왜 갈아엎었나 — 예전 「담당 구역」은 창 안의 3택 드롭다운(전체/명당 자리/그 밖 마당)이었다.
 * 고르는 순간 숫자만 바뀌고 마당에서는 아무 일도 일어나지 않아서, 플레이어가 **어디에** 무엇을
 * 놓았는지와 아무 상관이 없었다. 배치 게임인데 배치가 없었다.
 *
 * 새 규칙 — 딱 세 줄이다.
 *   1. 배치된 직원은 근무 자리(post) 한 칸을 갖는다. 플레이어가 마당의 걷기 칸을 탭해 정한다(안 정하면 본관 앞).
 *   2. 근무 자리에서 체비쇼프 거리 CARE_RADIUS 안의 좌석이 그 직원이 **돌보는 자리**다.
 *      돌보는 자리 손님은 만족 +(기본 + 미소/CARE_SMILE_PER), 겹쳐도 가장 센 직원 하나만 센다
 *      (합산이면 직원을 한 칸에 다 모으는 게 최적이 되어 배치가 다시 사라진다).
 *   3. 돌봄이 못 닿는 자리는 **벌점이 아니라 그냥 0**이다. 마당을 넓히는 것이 벌칙이 되면 안 된다 —
 *      「어디를 챙길까」는 보너스를 어디에 줄지의 선택이지, 못 챙긴 곳을 맞는 벌이 아니다.
 *
 * 그리고 명당과 이어 붙였다 — 근무 자리가 완성 명당 반경 안이면 그 직원의 돌봄 +CARE_CORNER.
 * 「명당을 만든다 → 거기에 직원을 세운다 → 그 둘레 자리가 잘 팔린다」가 한 줄로 이어진다.
 *
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, PlacedObject, Staff, ApplyResult, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { isWalkable } from './path.ts';
import { parcelAt } from './parcels.ts';
import { sizeOf } from './grid.ts';
import { cornersCoveringCell } from './corners.ts';
import { staffInRole, staffAnchor, ZONE_ROLE } from './staff.ts';

/** 근무 자리에서 돌봄이 닿는 거리 (체비쇼프) */
export const CARE_RADIUS = 2;
/** 돌봄 만족: 기본 + 미소 CARE_SMILE_PER 마다 +1, 상한 CARE_MAX */
export const CARE_BASE = 2;
export const CARE_SMILE_PER = 40;
export const CARE_MAX = 5;
/** 근무 자리가 완성 명당 안이면 그 직원 돌봄 +1 */
export const CARE_CORNER = 1;
/** 돌봄이 안 닿는 자리 — 벌점 없음(0). 마당을 넓히는 게 벌칙이 되면 안 된다. */
export const CARE_NONE_PENALTY = 0;

/** 자리에서 칸까지의 체비쇼프 거리 (발자국 기준, 겹치면 0) */
function cellDist(obj: PlacedObject, p: Pt): number {
  const { w, h } = sizeOf(obj);
  const dx = Math.max(0, obj.x - p.x, p.x - (obj.x + w - 1));
  const dy = Math.max(0, obj.y - p.y, p.y - (obj.y + h - 1));
  return Math.max(dx, dy);
}

/** 이 직원이 지금 서 있기로 한 칸 (플레이어가 정한 근무 자리, 없으면 역할 기본 위치) */
export function postOf(state: GameState, staff: Staff): Pt {
  const p = staff.post;
  if (p && isWalkable(state, p.x, p.y)) return { x: p.x, y: p.y };
  return staffAnchor(state, staff);
}

/** 플레이어가 직접 정한 근무 자리가 있나 (UI 「자동」 표시용) */
export function hasPost(staff: Staff): boolean {
  return staff.post !== undefined;
}

export function canSetPost(state: GameState, staffId: string, x: number, y: number): ApplyResult {
  const st = state.staff.find((s) => s.id === staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (st.role === null) return { ok: false, reason: '쉬는 직원은 자리를 못 맡아요' };
  if (st.training) return { ok: false, reason: '연수 중이에요' };
  if (!parcelAt(state, x, y)?.owned) return { ok: false, reason: '내 땅에만 세울 수 있어요' };
  if (!isWalkable(state, x, y)) return { ok: false, reason: '설 수 없는 칸이에요' };
  return { ok: true };
}

export function setPost(state: GameState, staffId: string, x: number, y: number): void {
  const st = state.staff.find((s) => s.id === staffId);
  if (st) st.post = { x, y };
}

export function clearPost(state: GameState, staffId: string): void {
  const st = state.staff.find((s) => s.id === staffId);
  if (st) delete st.post;
}

/** 손님을 돌보는 직종 — 홀만. 바리스타·요리사·청소는 근무 자리를 갖되 돌봄 만족은 안 준다
 *  (그들이 서 있는 곳은 조리·청소 동선이라 「자리 옆에 세운다」가 의미를 갖지 않는다). */
export function careStaff(state: GameState): Staff[] {
  return staffInRole(state, ZONE_ROLE).filter((st) => st.energy > 0);
}

/** 이 직원 한 명이 주는 돌봄 만족 (미소·명당 가산 포함) */
export function careValueOf(state: GameState, st: Staff): number {
  const post = postOf(state, st);
  const corner = cornersCoveringCell(state, post.x, post.y).length > 0 ? CARE_CORNER : 0;
  return Math.min(CARE_MAX, CARE_BASE + Math.floor(st.stats.smile / CARE_SMILE_PER) + corner);
}

/** 이 자리를 돌보는 직원들 (가까운 순) */
export function caringStaffOf(state: GameState, seat: PlacedObject): Staff[] {
  return careStaff(state)
    .filter((st) => cellDist(seat, postOf(state, st)) <= CARE_RADIUS)
    .sort((a, b) => cellDist(seat, postOf(state, a)) - cellDist(seat, postOf(state, b)));
}

/** 이 직원이 돌보는 자리들 (UI 「돌보는 자리 n곳」) */
export function caredSeatsOf(state: GameState, st: Staff): PlacedObject[] {
  const post = postOf(state, st);
  return Object.values(state.objects).filter((o) => !o.build && objectDef(o.type).kind === 'seat' && cellDist(o, post) <= CARE_RADIUS);
}

/** 이 칸에 직원을 세우면 돌보게 될 좌석들 (미리보기 — 아직 세우기 전에도 쓴다) */
export function seatsAroundCell(state: GameState, x: number, y: number): PlacedObject[] {
  return Object.values(state.objects).filter((o) => !o.build && objectDef(o.type).kind === 'seat' && cellDist(o, { x, y }) <= CARE_RADIUS);
}

/** 이 자리가 돌봄을 받나 (러시 점수·화면 표시) */
export function isCared(state: GameState, seat: PlacedObject): boolean {
  return caringStaffOf(state, seat).length > 0;
}

/** staffpost: 자리 만족 가산. 돌보는 직원 중 가장 센 하나만 (합산 아님 — 합산이면 한 칸에 몰아 세우는 게 최적이 된다). */
export function careSatisfaction(state: GameState, seat: PlacedObject): number {
  const all = careStaff(state);
  if (all.length === 0) return 0;
  let best = 0;
  for (const st of all) if (cellDist(seat, postOf(state, st)) <= CARE_RADIUS) best = Math.max(best, careValueOf(state, st));
  return best > 0 ? best : CARE_NONE_PENALTY;
}

/** 돌봄을 못 받는 좌석 수 (안내 한 줄용) */
export function unCaredSeatCount(state: GameState): number {
  if (careStaff(state).length === 0) return 0;
  let n = 0;
  for (const o of Object.values(state.objects)) {
    if (o.build || objectDef(o.type).kind !== 'seat') continue;
    if (!isCared(state, o)) n++;
  }
  return n;
}
