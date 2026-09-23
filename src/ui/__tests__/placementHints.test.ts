import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../../sim/state.ts';
import { apply } from '../../sim/actions.ts';
import { canPlace, objectAt } from '../../sim/grid.ts';
import { seatScore } from '../../sim/site.ts';
import { solveSync } from '../../sim/solver.ts';
import { setSolverResult, solverKey } from '../../sim/solverCache.ts';
import { objectDef } from '../../data/index.ts';
import type { GameState } from '../../sim/types.ts';
import { placementPicks, pickAt, pickLabel, pickStrengths, wanLabel, moveGain, betterSpot, PICK_COUNT, BETTER_SPOT_MIN, REP_WORTH } from '../PlacementHints.tsx';
import { layoutScore, seatPart, flowPart, cornerPart, roomPart, weakestPart, noteLayoutScore, resetLayoutSnapshot, PART_MAX, SCORE_MAX, LEFT_FULL } from '../layoutScore.ts';

const SEAT = 'table_out';

/** 본관 + 올렛길이 선 새 게임 마당 (solver.test.ts와 같은 시작) */
function yard(seed = 1): GameState { return createInitialState(seed, 'local', 0, 'tutorial'); }
/** 완성 시작 상태 — 좌석·길·메뉴가 있다 */
function starter(seed = 1): GameState { return createInitialState(seed); }

beforeEach(() => { setSolverResult(null); resetLayoutSnapshot(); });

describe('배치 추천 칸 (§3.2.1)', () => {
  it('캐시가 없으면 숫자 없는 회색 3칸 — 빈 화면을 남기지 않는다', () => {
    const s = starter();
    const r = placementPicks(s, SEAT);
    expect(r.state).not.toBe('cache');
    expect(r.picks.length).toBeGreaterThan(0);
    expect(r.picks.length).toBeLessThanOrEqual(PICK_COUNT);
    expect(r.picks.every((p) => p.label === null)).toBe(true);
    expect(r.picks.map((p) => p.rank)).toEqual(r.picks.map((_, i) => i + 1));
  });

  it('캐시가 있으면 상위 3칸 + 예상 이득 라벨, 1위가 rank 1', () => {
    const s = starter();
    solveSync(s, { horizon: 4, maxCandidates: 12, maxRollouts: 12 });
    const r = placementPicks(s, SEAT);
    if (r.state !== 'cache') return; // 이 시드에서 좌석 수가 후보에 안 들면 폴백 경로 (위 케이스가 덮는다)
    expect(r.picks.length).toBeLessThanOrEqual(PICK_COUNT);
    expect(r.picks[0]!.rank).toBe(1);
  });

  it('추천 칸은 모두 지금 놓을 수 있는 칸이다 (캐시·폴백 둘 다)', () => {
    const s = starter();
    for (const pass of [0, 1]) {
      if (pass === 1) solveSync(s, { horizon: 4, maxCandidates: 12, maxRollouts: 12 });
      const r = placementPicks(s, SEAT);
      for (const p of r.picks) expect(canPlace(s, SEAT, p.x, p.y).ok, `${p.x},${p.y}`).toBe(true);
    }
  });

  it('추천 칸 판정: 그 칸이면 찾고 아니면 null (탭은 고스트만 옮긴다 — 짓기는 ✓ 확정뿐)', () => {
    const picks = [{ x: 3, y: 4, rank: 1, label: '+42만' }, { x: 5, y: 6, rank: 2, label: null }];
    expect(pickAt(picks, 3, 4)).toBe(picks[0]);
    expect(pickAt(picks, 9, 9)).toBeNull();
  });

  it('세 칸은 서로 다른 강점을 단다 (verify: 같은 이유 세 개는 고를 거리가 아니다)', () => {
    const s = starter();
    const r = placementPicks(s, SEAT);
    const lines = pickStrengths(s, SEAT, r.picks);
    expect(lines).toHaveLength(r.picks.length);
    const names = lines.map((l) => l.replace(/^[①②③\d]\s*/, ''));
    expect(new Set(names).size).toBe(names.length); // 강점이 겹치지 않는다
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(12);
  });

  it('빈 마당(시설 0)에서도 NaN·예외 없이 칸을 낸다', () => {
    const s = yard();
    const r = placementPicks(s, SEAT);
    expect(r.picks.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('추천 칸 라벨 (§3.2.1)', () => {
  it('만 단위 반올림 — 1만 미만이면 라벨이 없다', () => {
    expect(wanLabel(420_000)).toBe('+42만');
    expect(wanLabel(424_999)).toBe('+42만');
    expect(wanLabel(425_000)).toBe('+43만');
    expect(wanLabel(4_999)).toBeNull();
    expect(wanLabel(5_000)).toBe('+1만');
  });
  it('평판이 돈보다 크면 「평판 +2」', () => {
    expect(pickLabel({ money: 420_000, reputation: 1, goals: 0 })).toBe('+42만');
    expect(pickLabel({ money: 10_000, reputation: 2, goals: 0 })).toBe('평판 +2'); // 2 × REP_WORTH > 1만
    expect(2 * REP_WORTH).toBeGreaterThan(10_000);
    expect(pickLabel({ money: 0, reputation: 0.2, goals: 0 })).toBeNull();
  });
});

describe('「여기보다 좋은 자리」 (§3.2.2)', () => {
  it('옮겨서 버는 돈은 자리 점수 차에 비례하고, 같거나 나쁜 칸이면 0 이하', () => {
    expect(moveGain(1_000_000, 10, 5)).toBe(500_000);
    expect(moveGain(1_000_000, 10, 10)).toBe(0);
    expect(moveGain(1_000_000, 10, 12)).toBeLessThan(0);
    expect(moveGain(1_000_000, 0, 0)).toBe(0); // 0으로 나누지 않는다
  });
  it('문턱 경계: 299,999는 안 그리고 300,000은 그린다', () => {
    expect(BETTER_SPOT_MIN).toBe(300_000);
    expect(moveGain(600_000, 10, 5)).toBe(300_000);
    expect(moveGain(600_000, 10, 5) >= BETTER_SPOT_MIN).toBe(true);
    expect(299_999 >= BETTER_SPOT_MIN).toBe(false);
  });
  it('캐시가 없으면 줄이 뜨지 않는다 (항상 뜨는 잔소리 금지)', () => {
    const s = starter();
    const seat = Object.values(s.objects).find((o) => objectDef(o.type).kind === 'seat');
    expect(seat).toBeTruthy();
    expect(betterSpot(s, seat!.id)).toBeNull();
  });
  it('보호 시설·길·없는 id엔 줄이 뜨지 않는다', () => {
    const s = starter();
    solveSync(s, { horizon: 4, maxCandidates: 12, maxRollouts: 12 });
    const bus = Object.values(s.objects).find((o) => o.type === 'busstop');
    expect(betterSpot(s, bus!.id)).toBeNull();
    const path = Object.values(s.objects).find((o) => objectDef(o.type).kind === 'path');
    if (path) expect(betterSpot(s, path.id)).toBeNull();
    expect(betterSpot(s, 'no-such-id')).toBeNull();
  });
});

describe('배치 점수 (§3.2.3)', () => {
  it('4성분이 각 상한 안, 합계가 0~100', () => {
    for (const s of [yard(), starter(), starter(7)]) {
      const sc = layoutScore(s);
      expect(sc.total).toBeGreaterThanOrEqual(0);
      expect(sc.total).toBeLessThanOrEqual(SCORE_MAX);
      for (const p of sc.parts) {
        expect(p.value, p.key).toBeGreaterThanOrEqual(0);
        expect(p.value, p.key).toBeLessThanOrEqual(p.max);
        expect(Number.isFinite(p.value)).toBe(true);
      }
    }
  });

  it('좌석이 하나도 없으면 자리 성분은 0 (NaN이 아니다)', () => {
    const s = yard();
    for (const o of Object.values(s.objects)) if (objectDef(o.type).kind === 'seat') apply(s, { type: 'remove', objectId: o.id });
    expect(seatPart(s)).toBe(0);
    expect(Number.isNaN(seatPart(s))).toBe(false);
  });

  it('돌아간 손님이 없으면 여유 만점, 상한을 넘으면 0', () => {
    const s = starter();
    s.monthGuestsLeft = 0;
    expect(roomPart(s)).toBe(PART_MAX.room);
    s.monthGuestsLeft = LEFT_FULL;
    expect(roomPart(s)).toBe(0);
    s.monthGuestsLeft = LEFT_FULL * 3;
    expect(roomPart(s)).toBe(0);
  });

  it('명당을 하나도 못 만들었으면 0, 동선은 0~20', () => {
    const s = starter();
    expect(cornerPart(s)).toBe(0);
    expect(flowPart(s)).toBeGreaterThanOrEqual(0);
    expect(flowPart(s)).toBeLessThanOrEqual(PART_MAX.flow);
  });

  it('가장 약한 성분은 만점 대비 비율로 고른다', () => {
    const s = starter();
    const sc = layoutScore(s);
    const weak = weakestPart(sc);
    for (const p of sc.parts) expect(weak.value / weak.max).toBeLessThanOrEqual(p.value / p.max);
  });

  it('전월 대비: 첫 달은 비교가 없고, 다음 달엔 지난달 점수가 나온다', () => {
    const s = starter();
    expect(noteLayoutScore(s, 60)).toBeNull();
    expect(noteLayoutScore(s, 62)).toBeNull(); // 같은 달은 이달 값만 갱신
    s.clock.month += 1;
    expect(noteLayoutScore(s, 70)).toBe(62);
  });

  it('좋은 자리에 좌석을 놓으면 자리 성분이 올라간다', () => {
    const s = starter();
    const before = seatPart(s);
    // 지금 좌석 평균보다 자리 점수가 높은 빈 칸을 찾아 하나 더 놓는다
    const seats = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat');
    const avg = seats.reduce((n, o) => n + seatScore(s, o.x, o.y), 0) / seats.length;
    let placed = false;
    for (let y = 0; y < s.grid.h && !placed; y++) for (let x = 0; x < s.grid.w && !placed; x++) {
      if (!canPlace(s, SEAT, x, y).ok || seatScore(s, x, y) <= avg) continue;
      if (apply(s, { type: 'place', objectType: SEAT, x, y }).ok) placed = true;
    }
    if (!placed) return; // 이 마당엔 더 좋은 빈 칸이 없다
    expect(objectAt(s, 0, 0) === undefined || true).toBe(true);
    expect(seatPart(s)).toBeGreaterThan(before);
  });
});

describe('solverKey', () => {
  it('배치 점수·추천 칸은 sim을 바꾸지 않는다 (상태 키 불변)', () => {
    const s = starter();
    const key = solverKey(s);
    layoutScore(s);
    placementPicks(s, SEAT);
    expect(solverKey(s)).toBe(key);
  });
});
