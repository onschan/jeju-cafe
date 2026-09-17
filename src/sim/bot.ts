/**
 * 헤드리스 봇 — 밸런스 검증용 단순 전략. 순수·결정적 (state와 apply만 쓴다).
 *
 * 전략 (plan Task 6):
 * - 시작: 정낭 위로 올렛길 + 가로 올렛길(y=4), 테이블 16(위아래 줄), 메뉴 americano/toast/cookie
 * - 2달째: 전단 공고 → service 최고를 홀, sense 최고를 바리스타(→ latte 추가)
 * - 돈 500만 넘고 기력 60 넘는 직원이 있으면 전단 돌리기 (한 달에 한 번)
 * - 9월: 밭 3개 + 밭 일꾼 채용(체력 최고)
 * - 2년차: 요리사(요리 최고)까지 뽑아 직원 4명 (QA 1차 #13: 16테이블 + 4명이 흑자여야 한다)
 * - 연구가 되면 해금 (돌담은 2개까지 놓는다). 수확은 자동(익으면 창고로).
 * - 돈 200만 미만이면 아르바이트 (직원당 한 달 한 번은 sim이 막는다)
 * - 2년차: 연구 20 이상이면 원두+우유 음료를 하나 나올 때까지 개발하고, 나오면 메뉴판 4번 칸에 올린다
 * - 마일리지 30 이상이면 일꾼 삼춘 고용, 무료 인형뽑기는 매달 돌리고, 강화 아이템·씨앗은 야외 테이블에 쓴다
 */
import type { GameState } from './types.ts';
import { createInitialState } from './state.ts';
import { tick } from './tick.ts';
import { apply } from './actions.ts';
import { DAY_MS } from './clock.ts';
import { canPlace, objectAt } from './grid.ts';
import { canUnlock } from './progress.ts';
import { START_ORIGIN } from './layout.ts';
import { objectDef } from '../data/index.ts';
import { DEVELOP_RESEARCH } from './craft.ts';
import { canDrawTicket, hasFreeDraw } from './shop.ts';
import { MAX_BUILDERS } from './build.ts';
import { canUseItem } from './items.ts';
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
  customMenus: number; // 개발한 메뉴 수 (2년차 개발 확인용)
  rank: number;
  star: number;
  mileage: number;
}

/** 시작 필지 상대 좌표 → 격자 좌표 */
const at = (x: number, y: number) => ({ x: START_ORIGIN.x + x, y: START_ORIGIN.y + y });
/** 가로 올렛길 y=4 양옆(y=3, y=5)에 테이블 (시작 필지 상대). 시작 자금 500만이면 16개(80만)는 무리가 없다. */
export const BOT_TABLES: { x: number; y: number }[] = [
  ...[0, 1, 2, 5, 6, 7, 8, 9].map((x) => at(x, 3)),
  at(5, 6), // (3,3)은 본관 문 앞 칸이라 못 놓는다 → 정낭 옆으로
  ...[0, 1, 2, 3, 7, 8, 9].map((x) => at(x, 5)),
];
export const BOT_FIELDS: { x: number; y: number }[] = [at(6, 6), at(7, 6), at(8, 6)];
export const BOT_WALLS: { x: number; y: number }[] = [at(5, 5), at(6, 5)];
export const FLYER_MIN_MONEY = 5_000_000;
export const FLYER_MIN_ENERGY = 60;
export const PARTTIME_MAX_MONEY = 2_000_000;
export const BOT_DEVELOP_YEAR = 2;
export const BOT_COOK_YEAR = 2;
export const BOT_DEVELOP_INGREDIENTS = ['beans', 'milk'];
export const BOT_WORKER_MILEAGE = 3;
const WORKER_IDS = ['ms_worker_3', 'ms_worker_4', 'ms_worker_5'];

function countKind(s: GameState, kind: string): number {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === kind).length;
}

function place(s: GameState, type: string, x: number, y: number): boolean {
  return canPlace(s, type, x, y).ok && apply(s, { type: 'place', objectType: type, x, y }).ok;
}

/** 정낭(4,6)에서 위로 올렛길을 깔아 창고 옆(4,3)까지 연결하고, y=4에 가로 올렛길 (시작 필지 상대) */
function ensurePath(s: GameState): void {
  for (let y = 5; y >= 3; y--) { const p = at(4, y); if (!objectAt(s, p.x, p.y)) apply(s, { type: 'place', objectType: 'path', ...p }); }
  for (let x = 0; x < 10; x++) { const p = at(x, 4); if (!objectAt(s, p.x, p.y)) apply(s, { type: 'place', objectType: 'path', ...p }); }
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
  // 2년차: 요리사까지 4명
  if (s.clock.year >= BOT_COOK_YEAR && !hasRole(s, 'cook') && s.staff.length === 3 && apply(s, { type: 'postJob', tier: 'flyer' }).ok) hireBest(s, 'cooking', 'cook');

  // 돈이 넉넉하면 전단 돌리기 (한 달에 한 번)
  if (s.money > FLYER_MIN_MONEY) {
    const st = s.staff.find((x) => x.role !== null && x.energy > FLYER_MIN_ENERGY);
    if (st) apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' });
  }

  // 상점: 마일리지 30 이상이면 일꾼 삼춘, 무료 인형뽑기, 아이템은 야외 테이블에
  if (s.mileage >= BOT_WORKER_MILEAGE && s.builders < MAX_BUILDERS) for (const id of WORKER_IDS) if (apply(s, { type: 'buyMileage', id }).ok) break;
  if (hasFreeDraw(s) && canDrawTicket(s).ok && apply(s, { type: 'drawTicket' }).ok) apply(s, { type: 'dismissDraw' });
  for (const [itemId, n] of Object.entries(s.inventory)) if (n > 0 && canUseItem(s, itemId, 'table_out').ok) apply(s, { type: 'useItem', itemId, objectType: 'table_out' });
  if (s.lastAnnouncement) apply(s, { type: 'dismissAnnouncement' });

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

  if (s.money < PARTTIME_MAX_MONEY) {
    for (const st of s.staff) if (apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok) break;
  }

  // 2년차: 메뉴가 하나 나올 때까지 개발 (감각 최고 직원). 나온 메뉴는 4번 칸에.
  if (s.clock.year >= BOT_DEVELOP_YEAR && s.research >= DEVELOP_RESEARCH && !s.developing && s.customMenus.length === 0) {
    const st = [...s.staff].sort((a, b) => b.stats.sense - a.stats.sense)[0];
    if (st) apply(s, { type: 'develop', base: 'drink', ingredients: BOT_DEVELOP_INGREDIENTS, staffId: st.id });
  }
  const custom = s.customMenus[0];
  if (custom && !s.menuSlots.includes(custom.id)) apply(s, { type: 'setSlot', slot: 3, menuId: custom.id });
}

/** 봇 진행 커서 (한 상태를 이어서 돌릴 때 — 세이브 왕복 테스트 등) */
export interface BotCursor { lastMonth: number; monthsPlayed: number }
export function newBotCursor(): BotCursor { return { lastMonth: 0, monthsPlayed: -1 }; }

/** 봇이 하루를 플레이한다 (월초 계획 → 아침 계획 → 하루 tick → 월말 카드 닫기). 순수·결정적. */
export function botDay(s: GameState, cur: BotCursor): void {
  if (s.clock.month !== cur.lastMonth) {
    cur.lastMonth = s.clock.month;
    cur.monthsPlayed++;
    monthlyPlan(s, cur.monthsPlayed);
  }
  dailyPlan(s);
  tick(s, DAY_MS);
  if (s.lastMonthCard) apply(s, { type: 'dismissMonthCard' });
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
        net: card.net, staff: s.staff.length, promos: s.activePromotions.length, guests: card.guests, customMenus: s.customMenus.length,
        rank: s.rank, star: s.star, mileage: s.mileage,
      });
      minMoney = s.money;
      apply(s, { type: 'dismissMonthCard' });
    }
  }
  return rows;
}
