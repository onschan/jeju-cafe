/**
 * 돌발 사고 (stakes: 「도전 욕구」 진단 5행 — 변수가 없다).
 * - 매월 1일 RISK_CHANCE(25%)로 이달에 한 건을 예약한다(rng 한 번: 발동 여부 + 종류). 발동일은 달 안에 퍼뜨린다(rng 없이 결정적).
 * - 발동하면 대화창 + 선택지 2개. 결과는 rollOutcome 없이 확정 — 고른 것이 바로 결과가 된다.
 * - 답을 안 하고 날이 바뀌면 0번(손해를 보는 쪽)으로 확정한다. 봇·리플레이도 막히지 않는다.
 * 사고 5종: 정전 · 재료 상함 · 직원 결근 · 단체 예약 · 설비 고장.
 */
import type { GameState, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { nextRandom } from './rng.ts';
import { dayIndex, addEffect, isStopped, stoppedCount } from './effects.ts';
import { monthIndex, DAYS_PER_MONTH } from './clock.ts';
import { parcelAt } from './parcels.ts';
import { pushNotice } from './staff.ts';
import { addReputation } from './reputation.ts';
import { totalSeats } from './guests.ts';
import { fmtNum } from './format.ts';

/** 이달에 돌발 사고가 있을 확률 */
export const RISK_CHANCE = 0.25;
/** 발동일 구간 (달 안 RISK_DAY_MIN ~ RISK_DAY_MIN + RISK_DAY_SPREAD − 1일) */
export const RISK_DAY_MIN = 4;
export const RISK_DAY_SPREAD = 22;
/** 단체 예약이 필요로 하는 좌석 */
export const GROUP_SEATS = 6;

export type RiskId = 'blackout' | 'spoiled' | 'absent' | 'group_booking' | 'breakdown';

export interface RiskChoiceDef {
  label: string;   // 버튼 (≤ 22자)
  cost: number;    // 즉시 지출 (0이면 없음)
}
export interface RiskDef {
  id: RiskId;
  title: string;
  lines: string[];              // 대화창 (한 줄 ≤ 22자)
  speaker: 'samchun' | 'halmang' | 'hero';
  choices: [RiskChoiceDef, RiskChoiceDef];
}

/** 사고 5종 — 0번이 「그냥 감수한다」(손해), 1번이 「돈을 내고 막는다」 */
export const RISKS: RiskDef[] = [
  {
    id: 'blackout', title: '정전', speaker: 'samchun',
    lines: ['마을 전기가 나갔져.', '오늘 하루 가게 문을 못 열어.'],
    choices: [{ label: '오늘은 쉰다', cost: 0 }, { label: '발전기 빌린다 (₩30만)', cost: 300_000 }],
  },
  {
    id: 'spoiled', title: '재료 상함', speaker: 'hero',
    lines: ['창고 냉장이 밤새 멈췄어요.', '재료가 상하기 직전이에요.'],
    choices: [{ label: '쓸 수 있는 것만 쓴다', cost: 0 }, { label: '버리고 급히 주문 (₩20만)', cost: 200_000 }],
  },
  {
    id: 'absent', title: '직원 결근', speaker: 'hero',
    lines: ['한 명이 아파서 못 나온대요.', '오늘 손이 하나 모자라요.'],
    choices: [{ label: '남은 사람으로 버틴다', cost: 0 }, { label: '대타를 부른다 (₩15만)', cost: 150_000 }],
  },
  {
    id: 'group_booking', title: '단체 예약', speaker: 'samchun',
    lines: ['관광버스 한 대가 온다고 해.', `자리 ${GROUP_SEATS}개는 있어야 받져.`],
    choices: [{ label: '받는다', cost: 0 }, { label: '오늘은 사양한다', cost: 0 }],
  },
  {
    id: 'breakdown', title: '설비 고장', speaker: 'hero',
    lines: ['시설 하나가 덜컥 멈췄어요.', '고치려면 돈이 들어요.'],
    choices: [{ label: '당분간 세워 둔다', cost: 0 }, { label: '바로 고친다', cost: 0 }],
  },
];

export function riskDef(id: string): RiskDef {
  const d = RISKS.find((r) => r.id === id);
  if (!d) throw new Error(`risk: unknown id ${id}`);
  return d;
}

/** 발동일 (rng 없이 결정적, 달 안에 퍼뜨린다) */
export function riskDayOf(mi: number): number {
  return RISK_DAY_MIN + ((mi * 7 + 3) % RISK_DAY_SPREAD);
}

/** 고장·정지 대상 시설: 소유 필지 안 완공된 유료 시설 중 가장 비싼 것 (id로 동점 정리 — 결정적) */
export function breakdownTarget(state: GameState): PlacedObject | null {
  let best: PlacedObject | null = null;
  for (const o of Object.values(state.objects)) {
    if (o.build || o.stopped) continue;
    const def = objectDef(o.type);
    if (def.cost <= 0 || def.kind === 'path' || def.kind === 'wall' || !parcelAt(state, o.x, o.y)?.owned) continue;
    if (!best || def.cost > objectDef(best.type).cost || (def.cost === objectDef(best.type).cost && o.id < best.id)) best = o;
  }
  return best;
}
/** 설비 고장 수리비 = 시설 건설비의 10% */
export const BREAKDOWN_REPAIR_PCT = 0.1;
export function breakdownRepairCost(state: GameState, obj: PlacedObject | null = breakdownTarget(state)): number {
  return obj ? Math.round(objectDef(obj.type).cost * BREAKDOWN_REPAIR_PCT) : 0;
}
/** 설비 정지 기간 (일) */
export const BREAKDOWN_STOP_DAYS = 7;

/** 단체 예약 성공 보상 / 실패 평판 */
export const GROUP_REWARD = 500_000;
export const GROUP_FAIL_REPUTATION = -5;
/** 결근으로 빠지는 직원 (기력이 가장 낮은 사람 — 결정적) */
export function absentStaffId(state: GameState): string | null {
  const working = state.staff.filter((st) => st.role !== null && !st.training);
  if (working.length === 0) return null;
  return working.reduce((a, b) => (b.energy < a.energy || (b.energy === a.energy && b.id < a.id) ? b : a)).id;
}

// ---------- 예약·발동 ----------

/** 매월 1일: 이달 사고를 예약한다 (rng 한 번). 예약한 id 또는 null. */
export function monthlyRisk(state: GameState): string | null {
  const mi = monthIndex(state.clock);
  const r = nextRandom(state);
  if (r >= RISK_CHANCE) { state.riskDay = 0; state.riskId = null; return null; }
  const def = RISKS[Math.floor((r / RISK_CHANCE) * RISKS.length) % RISKS.length]!;
  state.riskDay = riskDayOf(mi);
  state.riskId = def.id;
  return def.id;
}

/** 어떤 대상을 두고 벌어지는 사고인지 (대화창 문구용) */
function targetOf(state: GameState, id: string): { targetId?: string; targetName?: string } {
  if (id !== 'breakdown') return {};
  const o = breakdownTarget(state);
  return o ? { targetId: o.id, targetName: objectDef(o.type).name } : {};
}

/** 매일: 답을 안 한 어제 사고를 0번으로 확정하고, 오늘이 예정일이면 새 사고를 띄운다. 띄운 id 또는 null. */
export function dailyRisk(state: GameState): string | null {
  const today = dayIndex(state.clock);
  const pending = state.pendingRisk;
  if (pending && pending.day < today) resolveRisk(state, 0); // 답이 없으면 손해 보는 쪽
  if (!state.riskId || state.riskDay !== state.clock.day) return null;
  const id = state.riskId;
  state.riskId = null;
  state.riskDay = 0;
  state.pendingRisk = { id, day: today, ...targetOf(state, id) };
  state.alerts.push({ type: 'risk', id });
  return id;
}

/** 지금 답을 기다리는 사고가 있나 */
export function hasPendingRisk(state: GameState): boolean {
  return !!state.pendingRisk;
}

/** 선택지 하나를 확정한다 (결과는 rollOutcome 없이 그대로). 답할 사고가 없으면 false. */
export function resolveRisk(state: GameState, choice: number): boolean {
  const p = state.pendingRisk;
  if (!p) return false;
  const def = riskDef(p.id);
  const i = choice === 1 ? 1 : 0;
  const opt = def.choices[i]!;
  state.pendingRisk = null;
  if (opt.cost > 0) {
    state.money -= opt.cost;
    state.monthCosts.upkeep += opt.cost;
  }
  applyRisk(state, p.id, i, p);
  return true;
}

/** 고른 결과를 적용하고 알림 한 줄을 남긴다 */
function applyRisk(state: GameState, id: string, choice: number, p: { targetId?: string; targetName?: string }): void {
  switch (id as RiskId) {
    case 'blackout':
      if (choice === 0) {
        addEffect(state, { kind: 'noGuests', mult: 0, days: 1, source: 'risk:blackout' });
        addEffect(state, { kind: 'spawnMult', mult: 0, days: 1, source: 'risk:blackout' });
        pushNotice(state, '정전 — 오늘은 매출이 없어요');
      } else pushNotice(state, '발전기를 빌려 오늘도 문을 열었어요');
      return;
    case 'spoiled':
      if (choice === 0) {
        let lost = 0;
        for (const [k, n] of Object.entries(state.storage)) { const keep = Math.floor(n / 2); lost += n - keep; state.storage[k] = keep; }
        pushNotice(state, `재료가 상했어요 — 창고 재료 ${lost}개를 버렸어요`);
      } else pushNotice(state, '상한 재료를 버리고 급히 채웠어요');
      return;
    case 'absent': {
      if (choice === 0) {
        const sid = absentStaffId(state);
        const st = sid ? state.staff.find((x) => x.id === sid) : null;
        if (st) { st.energy = 0; pushNotice(state, `${st.name} 결근 — 오늘은 손이 모자라요`); }
        else pushNotice(state, '오늘은 혼자 가게를 봐요');
      } else pushNotice(state, '대타를 불러 오늘은 평소대로예요');
      return;
    }
    case 'group_booking': {
      if (choice === 1) { pushNotice(state, '단체 예약은 사양했어요'); return; }
      if (totalSeats(state) >= GROUP_SEATS) {
        state.money += GROUP_REWARD;
        state.monthIncome += GROUP_REWARD;
        state.totalIncome += GROUP_REWARD;
        pushNotice(state, `단체 손님 ₩${fmtNum(GROUP_REWARD)} — 자리가 넉넉했어요`);
      } else {
        addReputation(state, GROUP_FAIL_REPUTATION);
        pushNotice(state, `자리가 ${GROUP_SEATS}개가 안 돼 단체를 돌려보냈어요 — 평판 ${GROUP_FAIL_REPUTATION}`);
      }
      return;
    }
    case 'breakdown': {
      const obj = (p.targetId ? state.objects[p.targetId] : null) ?? breakdownTarget(state);
      if (!obj) { pushNotice(state, '다행히 고장 난 곳이 없었어요'); return; }
      const name = p.targetName ?? objectDef(obj.type).name;
      if (choice === 0) {
        obj.stopped = dayIndex(state.clock) + BREAKDOWN_STOP_DAYS;
        pushNotice(state, `${name} 고장 — ${BREAKDOWN_STOP_DAYS}일 동안 못 써요`);
      } else {
        const cost = breakdownRepairCost(state, obj);
        state.money -= cost;
        state.monthCosts.upkeep += cost;
        pushNotice(state, `${name} 수리 ₩${fmtNum(cost)} — 바로 고쳤어요`);
      }
      return;
    }
  }
}

export { isStopped, stoppedCount };
/** 다음 사고까지 남은 날 (예약이 없으면 null) — UI 경고용이 아니라 테스트·봇용 */
export function riskDaysLeft(state: GameState): number | null {
  if (!state.riskId || !state.riskDay) return null;
  const mi = monthIndex(state.clock);
  return mi * DAYS_PER_MONTH + (state.riskDay - 1) - dayIndex(state.clock);
}
