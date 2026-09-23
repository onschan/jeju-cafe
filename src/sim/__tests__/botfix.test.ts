/**
 * botfix: 봇이 「손님이 못 가는 시설」을 스스로 고치는지 · 공사 중인 명당이 진행 표시에 잡히는지 · 채용 추천이 병목을 따르는지.
 * 전부 순수·결정적 (rng·Date 없음).
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick, STEP_MS } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { dailyPlan, monthlyPlan, newBotCursor, fixUnreachable, BOT_FIX_PER_DAY } from '../bot.ts';
import { unreachableObjects, unreachableCount, objectReachable, walkCellReached } from '../reach.ts';
import { objectAt } from '../grid.ts';
import { cornerProgress, cornerProgressIncludingWork, cornersBuilding, cornersDoneIncludingWork, completedCorners } from '../corners.ts';
import { buildingNote, conditionProgress } from '../goals.ts';
import { roleNeeds, recommendedHire, postJobHint, EARLY_HALL_WHY } from '../staffPlan.ts';
import { staffInRole } from '../staff.ts';
import { ROLES } from '../../data/index.ts';
import { at, X, Y } from './helpers.ts';
import type { GameState } from '../types.ts';

/** 봇이 한 달쯤 굴린 상태 (완성 시작 상태) */
function botState(days: number, seed = 1): GameState {
  const s = createInitialState(seed);
  const cur = newBotCursor();
  for (let d = 0; d < days; d++) {
    if (s.clock.month !== cur.lastMonth) { cur.lastMonth = s.clock.month; cur.monthsPlayed++; monthlyPlan(s, cur.monthsPlayed); }
    dailyPlan(s);
    tick(s, DAY_MS);
    if (s.lastMonthCard) apply(s, { type: 'dismissMonthCard' });
  }
  return s;
}
function openRoleIds(s: GameState) {
  return ROLES.map((r) => r.id).filter((id) => s.unlocked.roles.includes(id) && staffInRole(s, id).length < (s.slots[id] ?? 0));
}

describe('봇 도달 복구 (botfix)', () => {
  it('길을 일부러 끊으면 봇이 하루 안에 되살린다 (길 잇기·옮기기·철거)', { timeout: 60_000 }, () => {
    const s = botState(70);
    expect(unreachableCount(s)).toBe(0);
    // 마당 한가운데 올렛길을 걷어내 뒤쪽을 통째로 끊는다
    const cutRow = Object.values(s.objects).filter((o) => o.type === 'path' && o.y === Y(4));
    expect(cutRow.length).toBeGreaterThan(3);
    for (const p of cutRow) apply(s, { type: 'remove', objectId: p.id });
    const broken = unreachableCount(s);
    expect(broken).toBeGreaterThan(0);
    // 하루에 BOT_FIX_PER_DAY건까지 — 며칠이면 0으로 돌아온다
    for (let d = 0; d < 20 && unreachableCount(s) > 0; d++) { dailyPlan(s); tick(s, DAY_MS); if (s.lastMonthCard) apply(s, { type: 'dismissMonthCard' }); }
    expect(unreachableCount(s)).toBe(0);
  });

  it('하루에 고치는 건수는 BOT_FIX_PER_DAY까지 — 마당이 하루아침에 뒤집히지 않는다', { timeout: 60_000 }, () => {
    const s = botState(70);
    const cutRow = Object.values(s.objects).filter((o) => o.type === 'path' && o.y === Y(4));
    for (const p of cutRow) apply(s, { type: 'remove', objectId: p.id });
    const before = unreachableCount(s);
    expect(before).toBeGreaterThan(BOT_FIX_PER_DAY);
    fixUnreachable(s);
    const after = unreachableCount(s);
    expect(before - after).toBeLessThanOrEqual(BOT_FIX_PER_DAY * 2); // 길 한 줄이 여러 시설을 한 번에 살릴 수 있다
    expect(after).toBeLessThan(before);
  });

  it('문 앞을 막고 선 시설은 즉시 치운다', { timeout: 60_000 }, () => {
    const s = botState(40);
    const room = Object.values(s.objects).find((o) => o.type === 'restroom' || o.type === 'cleaning_room');
    if (!room) return; // 아직 방 시설이 없는 시드면 건너뛴다
    const f = { x: room.x, y: room.y + 1 };
    const before = objectAt(s, f.x, f.y);
    if (before) apply(s, { type: 'remove', objectId: before.id });
    expect(apply(s, { type: 'place', objectType: 'tangerine_tree', x: f.x, y: f.y }).ok).toBe(true);
    expect(objectReachable(s, room)).toBe(false);
    fixUnreachable(s);
    const after = objectAt(s, f.x, f.y);
    expect(after?.type).not.toBe('tangerine_tree'); // 옮겼거나 치웠다
  });

  it('walkCellReached는 「손님이 실제로 밟는 걷기 칸」만 참 — 방 바닥·시설 칸은 아니다', () => {
    const s = createInitialState(1);
    const path = Object.values(s.objects).find((o) => o.type === 'path')!;
    expect(walkCellReached(s, path.x, path.y)).toBe(true);
    const seat = Object.values(s.objects).find((o) => o.type === 'table_out')!;
    expect(walkCellReached(s, seat.x, seat.y)).toBe(false);
  });

});

describe('공사 중인 명당·좌석 (botfix)', () => {
  /** 꽃길 세 조각을 붙여 놓는다 (벤치·가로등은 공사 1일) */
  function placeFlowerPath(s: GameState) {
    expect(apply(s, { type: 'place', objectType: 'flower_bed', ...at(1, 1) }).ok).toBe(true);
    expect(apply(s, { type: 'place', objectType: 'deco_wood_bench', ...at(2, 1) }).ok).toBe(true);
    expect(apply(s, { type: 'place', objectType: 'streetlight', ...at(1, 2) }).ok).toBe(true);
  }

  it('마지막 조각을 놓는 순간 「다 모았다」로 잡히고, 효과·도감은 완공 뒤 그대로', () => {
    const s = createInitialState(1, 'local', 0, 'tutorial');
    placeFlowerPath(s);
    // 공사 중 — 완성 명당은 아직 없지만 진행 표시는 다 모인 것으로 본다
    expect(completedCorners(s)).toEqual([]);
    expect(cornersBuilding(s)).toBe(1);
    expect(cornersDoneIncludingWork(s)).toBe(1);
    expect(cornerProgress(s).find((p) => p.def.id === 'corner_flower_path')!.building).toBe(true);
    expect(cornerProgressIncludingWork(s).find((p) => p.def.id === 'corner_flower_path')!.done).toBe(true);
    expect(buildingNote(s, { type: 'corners', n: 1 })).toBe('짓는 중 1');
    // 공사가 끝나면 진짜 완성 — 「짓는 중」 표시는 사라진다
    let ms = 0;
    while (Object.values(s.objects).some((o) => o.build) && ms < 2 * DAY_MS) { tick(s, STEP_MS); ms += STEP_MS; }
    expect(completedCorners(s).map((c) => c.id)).toContain('corner_flower_path');
    expect(cornersBuilding(s)).toBe(0);
    expect(buildingNote(s, { type: 'corners', n: 1 })).toBe('');
  });

  it('목표·과제의 좌석 수는 완공 기준이고, 진행 표시에 「짓는 중 n」이 붙는다', () => {
    const s = createInitialState(1, 'local', 0, 'tutorial');
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(1, 1) }).ok).toBe(true);
    const seat = Object.values(s.objects).find((o) => o.type === 'table_out')!;
    const built = conditionProgress(s, { type: 'seats', n: 9 }).cur;
    expect(buildingNote(s, { type: 'seats', n: 9 })).toBe('');
    seat.build = { doneDay: 99, days: 1 }; // 공사 중으로 둔다
    expect(conditionProgress(s, { type: 'seats', n: 9 }).cur).toBe(built - 1); // 보상은 완공 기준
    expect(buildingNote(s, { type: 'seats', n: 9 })).toBe('짓는 중 1'); // 안내는 공사 중 포함
  });
});

describe('채용 추천 (staff2)', () => {
  it('새 게임에서는 홀이 추천된다 (초반 가중치) — 근거 한 줄과 공고 안내가 같은 직종을 가리킨다', () => {
    const s = createInitialState(1);
    const open = openRoleIds(s);
    const needs = roleNeeds(s);
    expect(needs[0]!.role).toBe('hall');
    const rec = recommendedHire(s, s.candidates, open);
    expect(rec).not.toBeNull();
    expect(rec!.role).toBe('hall');
    expect(rec!.why.length).toBeGreaterThan(0);
    expect(postJobHint(s, open)).toContain('홀');
    expect(EARLY_HALL_WHY.length).toBeLessThanOrEqual(22);
  });

  it('자리가 늘고 직원이 셋이면 실제 병목(요리사 없음)이 이긴다', { timeout: 60_000 }, () => {
    const s = botState(400);
    expect(s.staff.length).toBeGreaterThanOrEqual(3);
    if (s.candidates.length === 0) apply(s, { type: 'postJob', tier: 'flyer' });
    const open = openRoleIds(s);
    const rec = recommendedHire(s, s.candidates, open);
    expect(roleNeeds(s)[0]!.role).not.toBe('hall');
    if (rec) expect(rec.role).toBe(roleNeeds(s).find((n) => open.includes(n.role))!.role);
  });
});

/** 좌표 도우미가 살아 있는지 (헬퍼 변경 방지) */
it('helpers', () => { expect(typeof X(0)).toBe('number'); expect(typeof Y(0)).toBe('number'); expect(unreachableObjects(createInitialState(1))).toEqual([]); });
