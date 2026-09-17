/**
 * 헤드리스 봇 — 밸런스 검증용 단순 전략. 순수·결정적 (state와 apply만 쓴다).
 *
 * 전략 (plan Task 6):
 * - 시작: 정낭 위로 올렛길, 테이블 3, 메뉴 americano/toast/cookie
 * - 2달째: 전단 공고 → service 최고를 홀, sense 최고를 바리스타(→ latte 추가)
 * - 돈 5만 넘고 기력 60 넘는 직원이 있으면 전단 돌리기 (한 달에 한 번)
 * - 9월: 밭 3개 + 밭 일꾼 채용(체력 최고)
 * - 연구가 되면 해금 (돌담은 2개까지 놓는다)
 * - 돈 2만 미만이면 아르바이트 (직원당 한 달 한 번은 sim이 막는다)
 */
import type { GameState } from './types.ts';
import { createInitialState } from './state.ts';
import { tick } from './tick.ts';
import { apply } from './actions.ts';
import { DAY_MS } from './clock.ts';
import { canPlace, objectAt } from './grid.ts';
import { readyToHarvest } from './farm.ts';
import { canUnlock } from './progress.ts';
import { objectDef } from '../data/index.ts';
import type { Candidate, RoleId, StatKey } from './types.ts';

export interface BotRow {
  year: number;
  month: number;
  money: number;      // 월말 정산 직후 잔고
  minMoney: number;   // 그달 매일 관찰한 최저 잔고
  research: number;
  popularity: number;
  net: number;        // 그달 순이익 (월말 카드)
  staff: number;
  promos: number;     // 활성 기간형 홍보 수
  guests: number;     // 그달 손님 수
}

export const BOT_TABLES: { x: number; y: number }[] = [{ x: 3, y: 5 }, { x: 5, y: 5 }, { x: 3, y: 4 }];
export const BOT_FIELDS: { x: number; y: number }[] = [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }];
export const BOT_WALLS: { x: number; y: number }[] = [{ x: 2, y: 4 }, { x: 6, y: 5 }];
export const FLYER_MIN_MONEY = 50000;
export const FLYER_MIN_ENERGY = 60;
export const PARTTIME_MAX_MONEY = 20000;

function countKind(s: GameState, kind: string): number {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === kind).length;
}

function place(s: GameState, type: string, x: number, y: number): boolean {
  return canPlace(s, type, x, y).ok && apply(s, { type: 'place', objectType: type, x, y }).ok;
}

/** 정낭(4,6)에서 위로 올렛길을 깔아 창고 앞(4,3)까지 연결 */
function ensurePath(s: GameState): void {
  for (let y = 5; y >= 3; y--) if (!objectAt(s, 4, y)) apply(s, { type: 'place', objectType: 'path', x: 4, y });
}

function bestBy(cands: Candidate[], stat: StatKey): Candidate | undefined {
  return [...cands].sort((a, b) => b.stats[stat] - a.stats[stat])[0];
}

function hireBest(s: GameState, stat: StatKey, role: RoleId): boolean {
  const c = bestBy(s.candidates, stat);
  return !!c && apply(s, { type: 'hire', candidateId: c.id, role }).ok;
}

function hasRole(s: GameState, role: RoleId): boolean {
  return s.staff.some((st) => st.role === role);
}

function setMenuIfEmpty(s: GameState, slot: number, menuId: string): void {
  if (s.menuSlots[slot] === null && !s.menuSlots.includes(menuId)) apply(s, { type: 'setSlot', slot, menuId });
}

/** 매달 1일 */
function monthlyPlan(s: GameState, monthsPlayed: number): void {
  ensurePath(s);
  if (countKind(s, 'seat') < BOT_TABLES.length) for (const p of BOT_TABLES) place(s, 'table_out', p.x, p.y);
  setMenuIfEmpty(s, 0, 'americano');
  setMenuIfEmpty(s, 1, 'toast');
  setMenuIfEmpty(s, 2, 'cookie');

  // 2달째: 전단 공고 → 홀·바리스타
  if (monthsPlayed === 1 && s.staff.length === 0 && apply(s, { type: 'postJob', tier: 'flyer' }).ok) {
    hireBest(s, 'service', 'hall');
    hireBest(s, 'sense', 'barista');
  }
  if (hasRole(s, 'barista')) setMenuIfEmpty(s, 3, 'latte');

  // 9월: 밭 3개 + 밭 일꾼
  if (s.clock.month === 9) {
    if (countKind(s, 'field') < BOT_FIELDS.length) for (const p of BOT_FIELDS) place(s, 'field', p.x, p.y);
    if (!hasRole(s, 'field') && apply(s, { type: 'postJob', tier: 'flyer' }).ok) hireBest(s, 'stamina', 'field');
  }

  // 돈이 넉넉하면 전단 돌리기 (한 달에 한 번)
  if (s.money > FLYER_MIN_MONEY) {
    const st = s.staff.find((x) => x.role !== null && x.energy > FLYER_MIN_ENERGY);
    if (st) apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' });
  }

  // 해금
  while (canUnlock(s).ok) apply(s, { type: 'unlock' });
  if (s.unlocked.objects.includes('stonewall') && countKind(s, 'wall') < BOT_WALLS.length)
    for (const p of BOT_WALLS) place(s, 'stonewall', p.x, p.y);
}

/** 매일 아침 */
function dailyPlan(s: GameState): void {
  // 당근이 있으면 쿠키 자리에 당근주스 (원가 0)
  if (s.unlocked.menus.includes('carrot_juice') && (s.storage['carrot'] ?? 0) > 0 && !s.menuSlots.includes('carrot_juice'))
    apply(s, { type: 'setSlot', slot: 2, menuId: 'carrot_juice' });
  for (const id of readyToHarvest(s)) apply(s, { type: 'harvest', objectId: id });

  if (s.money < PARTTIME_MAX_MONEY) {
    for (const st of s.staff) if (apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok) break;
  }
}

export function runBot(years: number, seed: number): BotRow[] {
  const s = createInitialState(seed);
  const rows: BotRow[] = [];
  let lastMonth = 0;
  let monthsPlayed = -1;
  let minMoney = s.money;
  const totalDays = years * 12 * 30;
  for (let d = 0; d < totalDays; d++) {
    if (s.clock.month !== lastMonth) {
      lastMonth = s.clock.month;
      monthsPlayed++;
      monthlyPlan(s, monthsPlayed);
    }
    dailyPlan(s);
    minMoney = Math.min(minMoney, s.money);
    tick(s, DAY_MS);
    minMoney = Math.min(minMoney, s.money);
    const card = s.lastMonthCard;
    if (card) {
      rows.push({
        year: card.year, month: card.month, money: s.money, minMoney, research: s.research, popularity: s.popularity,
        net: card.net, staff: s.staff.length, promos: s.activePromotions.length, guests: card.guests,
      });
      minMoney = s.money;
      apply(s, { type: 'dismissMonthCard' });
    }
  }
  return rows;
}
