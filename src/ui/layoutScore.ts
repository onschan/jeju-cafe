/**
 * 배치 점수 (video-patch §3.2.3): 「지금 마당이 얼마나 잘 짜여 있나」를 0~100 한 줄로.
 * 새 시뮬을 돌리지 않는다 — 이미 있는 sim 함수(seatScore·reachMap·cornersDoneIncludingWork·monthGuestsLeft)만 조합한다.
 *
 * | 성분 | 비중 | 출처 |
 * |---|---|---|
 * | 자리   | 40 | 좌석 시설들의 seatScore 평균 (SEAT_SCORE_FULL이 만점) |
 * | 동선   | 20 | 손님이 가서 쓰는 시설 중 정류장에서 걸어 닿는 비율 |
 * | 명당   | 20 | 명당 수(공사 중 포함) / CORNER_FULL |
 * | 여유   | 20 | 이달 자리가 없어 돌아간 손님 (0명 = 20, LEFT_FULL명 = 0) |
 *
 * 전월 대비 화살표는 localStorage에 달마다 한 칸씩 밀어 두는 스냅샷으로 낸다 (세이브 스키마를 건드리지 않는다).
 */
import { useSyncExternalStore } from 'react';
import type { GameState } from '../sim/index.ts';
import { seatScore, busStopPos, footprint, SITE_GOOD } from '../sim/index.ts';
import { cornersDoneIncludingWork } from '../sim/corners.ts'; // 안내는 공사 중 명당도 센다 (보상은 완공 기준 — grade.ts cornerCount)
import { objectDef } from '../data/index.ts';
import { reachMap, walkableNeighborsOf, cellKey } from '../sim/path.ts';

/** 성분 만점 */
export const PART_MAX = { seat: 40, flow: 20, corner: 20, room: 20 } as const;
export const SCORE_MAX = PART_MAX.seat + PART_MAX.flow + PART_MAX.corner + PART_MAX.room;
/** 자리 40점을 채우는 평균 자리 점수. site.ts는 0~10을 내지만 10은 바다 정면 같은 특수한 칸뿐이라,
 *  「좋은 자리」 문턱(SITE_GOOD = 5)을 만점으로 본다 — 그래야 자리를 옮긴 만큼 점수가 움직인다. */
const SEAT_SCORE_FULL = SITE_GOOD;
/** 동선에서 보는 시설: 손님이 실제로 가서 쓰는 것만. 담·꾸미기·나무는 못 가도 문제가 아니다 */
const FLOW_KINDS = new Set(['seat', 'facility', 'building', 'landmark']);
/** 명당 20점을 채우는 개수 */
export const CORNER_FULL = 8;
/** 여유 0점이 되는 이달 반려 손님 수 */
export const LEFT_FULL = 30;

export type PartKey = keyof typeof PART_MAX;
export interface LayoutPart { key: PartKey; label: string; value: number; max: number }
export interface LayoutScore { total: number; parts: LayoutPart[] }

export const PART_LABEL: Record<PartKey, string> = { seat: '자리', flow: '동선', corner: '명당', room: '좌석 여유' };
/** 가장 약한 성분을 어떻게 올리나 (한 줄, 지시문 없이 이유로) */
export const PART_ADVICE: Record<PartKey, string> = {
  seat: '바다가 보이거나 그늘진 칸이 자리 점수가 높다',
  flow: '올렛길이 끊긴 시설은 손님이 못 간다',
  corner: '짝이 되는 시설을 가까이 모으면 명당이 된다',
  room: '자리가 모자라면 손님이 그냥 돌아간다',
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** 좌석 시설들의 자리 점수 평균 (좌석이 없으면 0 — NaN을 만들지 않는다) */
export function seatPart(s: GameState): number {
  const seats = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat');
  if (seats.length === 0) return 0;
  const avg = seats.reduce((n, o) => n + seatScore(s, o.x, o.y), 0) / seats.length;
  return clamp((avg / SEAT_SCORE_FULL) * PART_MAX.seat, 0, PART_MAX.seat);
}

/** 정류장에서 걸어 닿는 시설 비율 (시설이 없으면 만점 — 막힌 것이 하나도 없다) */
export function flowPart(s: GameState): number {
  const objs = Object.values(s.objects).filter((o) => FLOW_KINDS.has(objectDef(o.type).kind));
  if (objs.length === 0) return PART_MAX.flow;
  const reach = reachMap(s, busStopPos(s));
  let ok = 0;
  for (const o of objs) {
    const cells = footprint(o.type, o.x, o.y);
    if (cells.some((p) => walkableNeighborsOf(s, p.x, p.y).some((nb) => reach.dist.has(cellKey(s, nb))))) ok++;
  }
  return clamp((ok / objs.length) * PART_MAX.flow, 0, PART_MAX.flow);
}

/** 명당 수 — 배치 점수는 「지금 마당이 어떻게 짜였나」를 읽어 주는 안내라 공사 중인 명당도 센다 (보상은 여기 안 걸려 있다) */
export function cornerPart(s: GameState): number {
  return clamp((cornersDoneIncludingWork(s) / CORNER_FULL) * PART_MAX.corner, 0, PART_MAX.corner);
}

/** 자리가 없어 돌아간 손님이 적을수록 높다 */
export function roomPart(s: GameState): number {
  const left = Math.max(0, s.monthGuestsLeft ?? 0);
  return clamp((1 - left / LEFT_FULL) * PART_MAX.room, 0, PART_MAX.room);
}

/** 배치 점수 0~100 + 4성분 */
export function layoutScore(s: GameState): LayoutScore {
  const raw: Record<PartKey, number> = { seat: seatPart(s), flow: flowPart(s), corner: cornerPart(s), room: roomPart(s) };
  const parts = (Object.keys(PART_MAX) as PartKey[]).map((key) => ({ key, label: PART_LABEL[key], value: Math.round(raw[key]), max: PART_MAX[key] }));
  return { total: clamp(Math.round(raw.seat + raw.flow + raw.corner + raw.room), 0, SCORE_MAX), parts };
}

/** 만점 대비 가장 모자란 성분 (같으면 표 순서 앞쪽) */
export function weakestPart(score: LayoutScore): LayoutPart {
  return [...score.parts].sort((a, b) => a.value / a.max - b.value / b.max)[0]!;
}

// ---------- 전월 대비 ----------

const SNAP_KEY = 'jeju-cafe:layoutScore';
interface Snap { mk: number; cur: number; prev: number | null }

const monthKey = (s: GameState) => s.clock.year * 12 + s.clock.month;
/** 메모리에 들고 localStorage로 거울만 맞춘다 (localStorage가 없는 환경에서도 이달↔전월 비교가 돈다) */
let snapshot: Snap | null | undefined;
function readSnap(): Snap | null {
  if (snapshot !== undefined) return snapshot;
  try { const raw = localStorage.getItem(SNAP_KEY); snapshot = raw ? (JSON.parse(raw) as Snap) : null; } catch { snapshot = null; }
  return snapshot;
}
function writeSnap(v: Snap): void {
  snapshot = v;
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(v)); } catch { /* noop */ }
}
/** 테스트·새 게임용 — 쌓인 스냅샷을 버린다 */
export function resetLayoutSnapshot(): void {
  snapshot = null;
  try { localStorage.removeItem(SNAP_KEY); } catch { /* noop */ }
}

/** 이달 점수를 적어 두고 전월 점수를 돌려준다 (없으면 null). 달이 바뀌면 이달 것이 전월로 내려간다. */
export function noteLayoutScore(s: GameState, total: number): number | null {
  const mk = monthKey(s);
  const snap = readSnap();
  if (!snap || snap.mk !== mk) {
    const next: Snap = { mk, cur: total, prev: snap && snap.mk === mk - 1 ? snap.cur : null };
    writeSnap(next);
    return next.prev;
  }
  writeSnap({ ...snap, cur: total });
  return snap.prev;
}

// ---------- 설정: 자리 추천 보기 (기본 켬) ----------

const HINT_KEY = 'jeju-cafe:placeHints';
let hintsOn: boolean = (() => { try { return localStorage.getItem(HINT_KEY) !== '0'; } catch { return true; } })();
const listeners = new Set<() => void>();
export function placeHintsOn(): boolean { return hintsOn; }
export function setPlaceHintsOn(v: boolean): void {
  hintsOn = v;
  try { localStorage.setItem(HINT_KEY, v ? '1' : '0'); } catch { /* noop */ }
  for (const l of listeners) l();
}
export function usePlaceHintsPref(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, placeHintsOn, placeHintsOn);
}
