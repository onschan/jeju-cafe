/**
 * 5년차 엔딩·최종 점수·이월·빠른 모드 (z-ending, HSS2 확장 스펙 §1.0·UX §6 P2-17 · pace 재배치).
 * - 엔딩: 5년차 3월 1일(시작 1년차 3월에서 4년 경과) 월 결산 카드 뒤 alerts에 { type: 'ending' } → EndingScreen.
 *   그 뒤로도 게임은 그대로 이어진다. 「계속하기」(continueEnding)로 4배속(빠른 모드)이 열린다. 목표는 108 이후 월간 과제만 남는다.
 * - 최종 점수: 항목 9(자금·누적 손님·★·랭크·평판·목표 수·콤보 수·명소 Lv 합·단골 수)에 가중치 → 총점 → 칭호 5단계.
 * - 이월 6종(makeCarry → createInitialState(…, carry) → applyCarry): 콤보 도감·명소 Lv·유니폼·돌하르방·마일리지 20%·정규 손님 인기 20%.
 * 결정적 — rng를 쓰지 않는다.
 */
import type { GameState, FinalScore, ScoreItem, ScoreKey, CarryOver, EndingState, ApplyResult } from './types.ts';
import { regularCount } from './interact.ts';
import { objectDef } from '../data/index.ts';
import { occupy, doorFrontOf } from './grid.ts';
import { monthIndex } from './clock.ts';
import { START_ORIGIN } from './layout.ts';
import { pushNotice } from './staff.ts';

export const ENDING_YEAR = 5; // pace: 10 → 5 (3배속 2.9시간·1배속 8.6시간). 컨텐츠는 그대로, 같은 내용을 4년 안에 겪는다
export const ENDING_MONTH = 3;
export const MILLENNIUM_TREE = 'hackberry';
/** 빠른 모드 배속 */
export const FAST_SPEED = 4;
/** 이월 비율 (마일리지·정규 손님 인기).
 *  pace: 한 판이 9년 → 4년이라 같은 20%면 다음 회차에 남는 게 반 토막이다. 0.2 → 0.3으로 올려 회차 계승의 체감을 유지한다. */
export const CARRY_RATIO = 0.3;
/** 이월 돌하르방 최대 (정낭 양옆) */
export const CARRY_DOLHAREUBANG_MAX = 2;
export const DOLHAREUBANG_TYPES = new Set(['dolhareubang', 'dolhareubang_pair']);
/** 이월 돌하르방이 놓이는 시작 필지 상대 좌표 (정낭 (4,6) 양옆) — 정낭이 없으면 carryDolhareubangCells가 문 양옆으로 (w-free) */
export const CARRY_DOLHAREUBANG_AT: { lx: number; ly: number }[] = [{ lx: 3, ly: 6 }, { lx: 5, ly: 6 }];
/** 이월 돌하르방 자리: 정낭 양옆 → (정낭이 없으면) 마을 어귀 기본 좌표(올렛길 입구 (4,6) 양옆, 비어 있을 때 — fun-start 새 게임엔 정낭이 없다) → 본관 문 앞 양옆 → 기본 좌표 */
export function carryDolhareubangCells(state: GameState): { x: number; y: number }[] {
  const gate = Object.values(state.objects).find((o) => o.type === 'gate');
  if (gate) return [{ x: gate.x - 1, y: gate.y }, { x: gate.x + 1, y: gate.y }];
  const def = CARRY_DOLHAREUBANG_AT.map((c) => ({ x: START_ORIGIN.x + c.lx, y: START_ORIGIN.y + c.ly }));
  if (def.every((c) => { const cell = state.grid.cells[c.y * state.grid.w + c.x]; if (!cell || cell.terrain !== 'soil') return false; const o = cell.objectId ? state.objects[cell.objectId] : null; return !o || DOLHAREUBANG_TYPES.has(o.type); })) return def;
  const main = Object.values(state.objects).find((o) => o.type === 'warehouse');
  if (main) { const f = doorFrontOf(main); return [{ x: f.x - 1, y: f.y }, { x: f.x + 1, y: f.y }]; }
  return def;
}

/** 점수 항목 9: 값 → 점수 환산 (합 최대 933점).
 *  pace 재보정: 눈금이 10년치(자금 3억·손님 2만·목표 108·명소 24곳 × Lv5)라 4년짜리 한 판에선
 *  자금·목표·명소가 바닥에 깔리고 누적 손님만 상한에 붙어 있었다. 지금 컨텐츠 최대치(목표 60·명당 24·명소 8곳 × Lv3)와
 *  4년 실측(봇 seed 1~3: 자금 ₩2,500~3,700만 · 손님 8~9만 · ★4 · 랭크 9~10 · 목표 53~57 · 명당 8~9 · 명소 Lv 합 18~24 · 단골 58~62)에 맞춰 다시 잡았다.
 *  → 봇 한 판 ≈ 660~700점 「제주 명소 카페」, ★5·명당 도감·자금까지 채운 한 판이 800점 「제주의 전설 카페」. */
export const SCORE_ITEMS: { key: ScoreKey; label: string; per: number; cap: number }[] = [
  { key: 'money', label: '자금', per: 1 / 500_000, cap: 150 },         // ₩50만 = 1점 (₩7,500만까지)
  { key: 'guests', label: '누적 손님', per: 1 / 700, cap: 180 },       // 700명 = 1점 (12만 6천 명까지)
  { key: 'star', label: '★ 등급', per: 25, cap: 125 },                 // ★1 = 25점 (★5 = 125)
  { key: 'rank', label: '카페 랭크', per: 10, cap: 100 },              // 랭크 1 = 10점 (최고 랭크 10)
  { key: 'reputation', label: '평판', per: 0.5, cap: 50 },             // 평판 2 = 1점
  { key: 'goals', label: '달성 목표', per: 1.5, cap: 90 },             // 목표 1 = 1.5점 (60개)
  { key: 'corners', label: '명당 도감', per: 4, cap: 96 },             // 명당 1 = 4점 (24종)
  { key: 'spots', label: '명소 Lv 합', per: 3, cap: 72 },              // 명소 Lv 1 = 3점 (8곳 × Lv3)
  { key: 'regulars', label: '단골', per: 0.7, cap: 70 },               // 단골 1 = 0.7점 (100명)
];
/** 칭호 5단계 (총점 문턱, 오름차순) */
export const SCORE_TITLES: { min: number; title: string }[] = [
  { min: 0, title: '올레길 커피 노점' },
  { min: 200, title: '동네 사랑방 카페' },
  { min: 400, title: '올레꾼이 찾는 카페' },
  { min: 600, title: '제주 명소 카페' },
  { min: 800, title: '제주의 전설 카페' },
];

export function initEnding(): EndingState {
  return { reached: false, score: null, continued: false, fastMode: false };
}

export function spotLevelSum(state: GameState): number {
  return Object.values(state.spots).reduce((s, lv) => s + Math.max(0, lv), 0);
}
function rawValue(state: GameState, key: ScoreKey): number {
  switch (key) {
    case 'money': return Math.max(0, state.money);
    case 'guests': return state.totalGuests;
    case 'star': return state.star;
    case 'rank': return state.rank;
    case 'reputation': return state.reputation;
    case 'goals': return state.goals.claimed.length;
    case 'corners': return state.codex.corners?.length ?? 0;
    case 'spots': return spotLevelSum(state);
    case 'regulars': return regularCount(state);
  }
}
export function scoreTier(total: number): number {
  let tier = 1;
  SCORE_TITLES.forEach((t, i) => { if (total >= t.min) tier = i + 1; });
  return tier;
}
/** 최종 점수 계산 (순수) */
export function computeScore(state: GameState): FinalScore {
  const items: ScoreItem[] = SCORE_ITEMS.map((d) => {
    const value = rawValue(state, d.key);
    return { key: d.key, label: d.label, value, points: Math.min(d.cap, Math.floor(value * d.per)) };
  });
  const total = items.reduce((s, i) => s + i.points, 0);
  const tier = scoreTier(total);
  const title = SCORE_TITLES[tier - 1]!.title;
  return { items, total, title, tier, year: state.clock.year, month: state.clock.month };
}

/** 엔딩 시점을 지났나 (5년차 3월 1일 이후) */
export function endingDue(state: GameState): boolean {
  return monthIndex(state.clock) >= (ENDING_YEAR - 1) * 12 + (ENDING_MONTH - 1);
}

/** 월초 훅 (tick.ts onNewMonth, closeMonth 뒤): 5년차 3월 1일에 한 번 엔딩 알림 */
export function endingMonthly(state: GameState): void {
  if (!state.ending.reached && endingDue(state)) {
    state.ending.reached = true;
    state.ending.score = computeScore(state);
    state.alerts.push({ type: 'ending' });
    pushNotice(state, `${ENDING_YEAR}년차 결산 — 최종 점수 ${state.ending.score.total}점 「${state.ending.score.title}」`);
  }
}

/** 계속하기: 엔딩 알림을 닫고 빠른 모드를 연다 */
export function canContinueEnding(state: GameState): ApplyResult {
  if (state.alerts[0]?.type !== 'ending') return { ok: false, reason: '지금은 엔딩이 아니에요' };
  return { ok: true };
}
export function continueEnding(state: GameState): void {
  state.alerts.shift();
  state.ending.continued = true;
  state.ending.fastMode = true;
  pushNotice(state, '계속하기 — 빠른 모드(4배속)가 열렸어요');
}
export function canSetSpeed(state: GameState, speed: number): ApplyResult {
  if (speed >= FAST_SPEED && !state.ending.fastMode) return { ok: false, reason: '빠른 모드는 엔딩 뒤 「계속하기」로 열려요' };
  return { ok: true };
}

// ---------- 이월 ----------

export function dolhareubangCount(state: GameState): number {
  return Object.values(state.objects).filter((o) => DOLHAREUBANG_TYPES.has(o.type)).length;
}
/** 지금 상태에서 이월 묶음을 만든다 (순수) */
export function makeCarry(state: GameState): CarryOver {
  const guestPopularity: Record<string, number> = {};
  for (const [id, pop] of Object.entries(state.segmentPopularity)) {
    const v = Math.floor(pop * CARRY_RATIO);
    if (v > 0) guestPopularity[id] = v;
  }
  const spots: Record<string, number> = {};
  for (const [id, lv] of Object.entries(state.spots)) if (lv > 0) spots[id] = lv;
  return {
    corners: [...(state.codex.corners ?? [])],
    spots,
    uniforms: [...state.uniforms],
    dolhareubang: Math.min(CARRY_DOLHAREUBANG_MAX, dolhareubangCount(state)),
    tickets: Math.floor(state.tickets * CARRY_RATIO),
    guestPopularity,
    millennium: state.unlocked.objects.includes(MILLENNIUM_TREE),
    fromScore: state.ending.score?.total ?? computeScore(state).total,
  };
}

/** 새 게임에 이월을 적용한다 (state.ts createInitialState 끝에서). 돌하르방은 정낭 양옆(없으면 문 양옆) 빈 칸에 놓는다. */
export function applyCarry(state: GameState, carry: CarryOver): void {
  state.carry = carry;
  const codex = (state.codex.corners ??= []);
  for (const id of carry.corners) if (!codex.includes(id)) codex.push(id);
  for (const [id, lv] of Object.entries(carry.spots)) state.spots[id] = Math.max(state.spots[id] ?? 0, lv);
  for (const id of carry.uniforms) if (!state.uniforms.includes(id)) state.uniforms.push(id);
  state.tickets += carry.tickets;
  for (const [id, pop] of Object.entries(carry.guestPopularity)) state.segmentPopularity[id] = Math.max(state.segmentPopularity[id] ?? 0, pop);
  if (carry.dolhareubang > 0) {
    if (!state.unlocked.objects.includes('dolhareubang')) state.unlocked.objects.push('dolhareubang');
    const def = objectDef('dolhareubang');
    for (const { x, y } of carryDolhareubangCells(state).slice(0, carry.dolhareubang)) {
      if (x < 0 || y < 0 || x >= state.grid.w || y >= state.grid.h) continue;
      const cell = state.grid.cells[y * state.grid.w + x];
      if (!cell || cell.objectId || !def.terrain.includes(cell.terrain)) continue;
      const id = `o${state.nextId++}`;
      state.objects[id] = { id, type: 'dolhareubang', x, y, placedMonth: monthIndex(state.clock) };
      occupy(state, state.objects[id]!);
    }
  }
  if (carry.millennium && !state.unlocked.objects.includes(MILLENNIUM_TREE)) state.unlocked.objects.push(MILLENNIUM_TREE);
}

/** 이월 묶음 요약 문구 (EndingScreen·TitleScreen) */
export function carryText(c: CarryOver): string[] {
  const out: string[] = [];
  out.push(`명당 도감 ${c.corners.length}개`);
  out.push(`명소 Lv 합 ${Object.values(c.spots).reduce((s, v) => s + v, 0)}`);
  out.push(`유니폼 ${c.uniforms.length}벌`);
  out.push(`돌하르방 ${c.dolhareubang}개`);
  out.push(`응모권 ${c.tickets}장`);
  out.push(`손님 인지도 ${Object.keys(c.guestPopularity).length}층 (20%)`);
  if (c.millennium) out.push('폭낭 그늘');
  return out;
}
