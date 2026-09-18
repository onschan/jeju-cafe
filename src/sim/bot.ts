/**
 * 헤드리스 봇 — 밸런스 검증용 단순 전략. 순수·결정적 (state와 apply만 쓴다).
 *
 * v3 전략 (목표 체인을 따라간다):
 * - 시작 상태(테이블 2 + 파라솔 1 + 올렛길 + 메뉴 3종 + 후보 2명)에서 출발. 가로 올렛길(y=4)을 깔고 테이블을 한 달에 4개씩 16개까지 늘린다.
 * - 첫날 후보 중 미소 최고를 홀로 채용. 2달째 전단 공고 → 기술 최고를 바리스타. 1년차 7월에 요리사, 2년차부터 빈 슬롯(2 + 년차 명까지).
 * - 열린 시설(감귤나무·화분·벤치·돌담·당근밭…)을 정해진 칸에 하나씩 놓는다. 시설 수 목표를 밀어 준다.
 * - 홍보가 열리면 돈 500만 넘고 기력 60 넘는 직원이 있을 때 전단 (한 달에 한 번).
 * - 필지 구매가 열리면 돈 800만 넘을 때 살 수 있는 필지를 산다. 바위 치우기가 열리면 소유 필지의 작은 바위를 한 달에 하나.
 * - 연구 개발이 열리고 연구 20 이상이면 원두+우유 음료를 레시피 3개까지 개발하고 첫 메뉴를 메뉴판 4번 칸에 올린다.
 * - 돈 200만 미만이면 아르바이트. 마일리지 3 이상이면 일꾼 삼춘, 무료 인형뽑기, 아이템은 야외 테이블에.
 * - 팝업이 열리면 주말마다 돈이 500만 넘을 때 활기가 가장 높은 지역에 팝업.
 * - 목표 달성·이벤트 대화창(alerts)은 바로 닫는다.
 */
import type { GameState } from './types.ts';
import { createInitialState } from './state.ts';
import { tick } from './tick.ts';
import { apply } from './actions.ts';
import { DAY_MS } from './clock.ts';
import { canPlace, objectAt, cellAt } from './grid.ts';
import { START_ORIGIN } from './layout.ts';
import { objectDef } from '../data/index.ts';
import { DEVELOP_RESEARCH, menuOf } from './craft.ts';
import { canDrawTicket, hasFreeDraw } from './shop.ts';
import { MAX_BUILDERS } from './build.ts';
import { canUseItem } from './items.ts';
import { isWeekend, canOpenPopup, bestRegion } from './popup.ts';
import { featureOpen, currentGoal } from './goals.ts';
import { seatScore } from './site.ts';
import { canBuyParcel, ownedParcels } from './parcels.ts';
import { canInvestSpot } from './spots.ts';
import { SPOTS } from '../data/index.ts';
import { canHire } from './staff.ts';
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
  customMenus: number; // 개발한 메뉴 수
  rank: number;
  star: number;
  mileage: number;
  goals: number;      // 달성한 목표 수
  events: number;     // 그달 말 활성 빅 이벤트 수
}

/** 시작 필지 상대 좌표 → 격자 좌표 */
const at = (x: number, y: number) => ({ x: START_ORIGIN.x + x, y: START_ORIGIN.y + y });
/** 가로 올렛길 y=4 양옆(y=3, y=5)에 테이블 (시작 필지 상대). 시작 테이블(3,4)(5,4)(5,5)은 이미 있다. */
export const BOT_TABLES: { x: number; y: number }[] = [
  ...[0, 1, 2, 5, 6, 7, 8, 9].map((x) => at(x, 3)),
  at(5, 6), // (3,3)은 본관 문 앞 칸이라 못 놓는다 → 정낭 옆으로
  ...[0, 1, 2, 3, 7, 8, 9].map((x) => at(x, 5)),
];
/** 열린 시설을 놓는 칸 (시작 필지 아래쪽 줄) */
export const BOT_DECO_CELLS: { x: number; y: number }[] = [at(6, 6), at(7, 6), at(8, 6), at(9, 6), at(0, 6), at(1, 6), at(2, 6), at(3, 6), at(0, 7), at(1, 7), at(2, 7), at(3, 7), at(6, 7), at(7, 7), at(8, 7), at(9, 7), at(0, 0), at(1, 0), at(2, 0), at(6, 0), at(7, 0), at(8, 0), at(9, 0)];
/** 시설 수 목표를 위해 놓는 시설 종류 (열린 것만, 이 순서로 하나씩) */
export const BOT_DECO_TYPES = ['tangerine_tree', 'deco_planter', 'deco_wood_bench', 'terrace_seat', 'deco_flower_pots', 'bench_stonewall', 'canola', 'restroom', 'tangerine_tree', 'carrot_field', 'vending', 'handdrip_bar', 'souvenir', 'dolhareubang', 'pampas', 'bike_rack', 'deco_lamp_post', 'cedar', 'basalt_rock', 'tangerine_tree', 'carrot_field', 'deco_mailbox', 'deco_water_jar_set'];
export const BOT_WALLS: { x: number; y: number }[] = [at(5, 5), at(6, 5)];
export const FLYER_MIN_MONEY = 1_000_000;
/** 돈이 이만큼 넘으면 SNS 홍보도 (연구 20) */
export const SNS_MIN_MONEY = 4_000_000;
export const FLYER_MIN_ENERGY = 60;
export const PARTTIME_MAX_MONEY = 2_000_000;
export const BOT_PARCEL_MIN_MONEY = 8_000_000;
export const BOT_DEVELOP_INGREDIENTS = ['beans', 'milk'];
export const BOT_WORKER_MILEAGE = 3;
export const BOT_POPUP_MIN_MONEY = 5_000_000;
/** 요리사는 1년차 7월(5달째)부터 — §4.6 1년차 말 직원 3 */
export const BOT_COOK_MONTHS = 4;
export const BOT_TABLES_PER_MONTH = 4;
export const BOT_RECIPES = 5;
/** 2년차부터 빈 직원 슬롯을 채운다 (돈 이만큼 넘을 때) — §4.6 직원 3 → 5 → 8 */
export const BOT_HIRE_MIN_MONEY = 5_000_000;
export const BOT_HIRE_YEAR = 2;
export const BOT_HIRE_ORDER: RoleId[] = ['hall', 'barista', 'cook', 'carry', 'guide'];
/** 관광지 투자: 돈이 다음 레벨 비용 + 여유분을 넘으면 (§4.6 투자 규칙) */
export const BOT_SPOT_RESERVE = 3_000_000;
/** 평판이 이 아래면 사과 이벤트 */
export const BOT_APOLOGY_REPUTATION = 40;
export const BOT_APOLOGY_MIN_MONEY = 1_000_000;
/** 3년차부터는 2,000만을 남기고 투자한다 (3년차 말 자금 3,000만~4,500만 밴드 §4.6) */
export const BOT_RESERVE_YEAR3 = 20_000_000;
/** 4년차 전엔 관광지 Lv3까지만 (Lv4·5는 350만~1,000만/회) */
export const BOT_SPOT_MAX_LEVEL_EARLY = 3;
/** 직원 수 상한 = 2 + 년차 (2년차 4 · 3년차 5 · 6년차 8) */
export const BOT_STAFF_PER_YEAR = 1;
export const BOT_STAFF_BASE = 2;
export const BOT_SPOT_YEAR = 2;
const WORKER_IDS = ['ms_worker_3', 'ms_worker_4', 'ms_worker_5'];

function countKind(s: GameState, kind: string): number {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === kind).length;
}

function place(s: GameState, type: string, x: number, y: number): boolean {
  return s.unlocked.objects.includes(type) && canPlace(s, type, x, y).ok && apply(s, { type: 'place', objectType: type, x, y }).ok;
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

/** 요리사가 있으면 3번 칸(감귤주스 자리)에 열린 디저트·식사 중 가장 비싼 것 — 요리사 월급값을 하게 (한 번 올리면 유지) */
export const BOT_DESSERT_SLOT = 2;
function pickDessert(s: GameState): void {
  if (!hasRole(s, 'cook')) return;
  const food = s.unlocked.menus.filter((id) => { const m = menuOf(s, id); return m.category !== 'drink'; }).sort((a, b) => menuOf(s, b).price - menuOf(s, a).price)[0];
  if (!food || s.menuSlots.includes(food)) return;
  apply(s, { type: 'setSlot', slot: BOT_DESSERT_SLOT, menuId: food });
}

/** 열린 시설을 정해진 칸에 하나씩 (이미 놓은 종류 수만큼 건너뛴다) */
function placeDecos(s: GameState): void {
  const placed = new Set(Object.values(s.objects).filter((o) => BOT_DECO_CELLS.some((c) => c.x === o.x && c.y === o.y)).map((o) => `${o.x},${o.y}`));
  let i = placed.size;
  for (const type of BOT_DECO_TYPES.slice(i)) {
    const cell = BOT_DECO_CELLS[i];
    if (!cell) return;
    if (!s.unlocked.objects.includes(type)) return; // 아직 안 열린 것부터는 다음 달에
    if (!canSpend(s, objectDef(type).cost)) return;
    if (place(s, type, cell.x, cell.y)) i++;
    else return;
  }
}

/** §4.6 투자 규칙의 여유분: 다음 목표가 "자금 N"이고 N의 80%를 모았으면 N + 300만(목표까지 저축), 아니면 300만(성장 투자). 이만큼은 남기고 쓴다. */
export const BOT_SAVE_RATIO = 0.8;
export function botReserve(s: GameState): number {
  const g = currentGoal(s);
  const goalMoney = g?.condition.type === 'money' && s.money >= g.condition.n * BOT_SAVE_RATIO ? g.condition.n : 0;
  return Math.max(goalMoney + BOT_SPOT_RESERVE, s.clock.year >= 3 ? BOT_RESERVE_YEAR3 : 0);
}
/** 여유분을 남기고 cost를 쓸 수 있나 */
function canSpend(s: GameState, cost: number): boolean {
  return s.money - cost >= botReserve(s);
}

/** 2년차부터: 빈 슬롯(홀 → 바리스타 → 요리사 → 운반 → 안내)이 있고 돈이 넉넉하면 전단 공고 → 핵심 스탯 최고를 채용 (한 달 한 명) */
function hireForFreeSlot(s: GameState): void {
  if (s.clock.year < BOT_HIRE_YEAR || !canSpend(s, BOT_HIRE_MIN_MONEY) || s.staff.length >= BOT_STAFF_BASE + BOT_STAFF_PER_YEAR * s.clock.year) return;
  for (const role of BOT_HIRE_ORDER) {
    if (!s.unlocked.roles.includes(role) || s.staff.filter((st) => st.role === role).length >= (s.slots[role] ?? 0)) continue;
    if (s.candidates.length === 0 && !apply(s, { type: 'postJob', tier: 'flyer' }).ok) return;
    const c = s.candidates.find((x) => canHire(s, x.id, role).ok);
    if (c && apply(s, { type: 'hire', candidateId: c.id, role }).ok) return;
  }
}

/** 2년차부터: 투자할 수 있는 관광지 중 다음 레벨 비용 + 여유 300만이 있으면 하나 (한 달 하나) */
function investSpotIfAny(s: GameState): void {
  if (s.clock.year < BOT_SPOT_YEAR) return;
  for (const def of SPOTS) {
    const next = canInvestSpot(s, def.id);
    if (!next.ok || (s.clock.year < 4 && (s.spots[def.id] ?? 0) >= BOT_SPOT_MAX_LEVEL_EARLY)) continue;
    const cost = def.levels.find((l) => l.level === (s.spots[def.id] ?? 0) + 1)?.cost ?? Infinity;
    if (canSpend(s, cost) && apply(s, { type: 'investSpot', id: def.id }).ok) return;
  }
}

/** 열린 필지 중 살 수 있는 것을 하나 산다 */
function buyParcelIfAny(s: GameState): void {
  if (!featureOpen(s, 'parcel') || s.money < BOT_PARCEL_MIN_MONEY) return;
  for (const p of s.parcels) if (!p.owned && canBuyParcel(s, p.id).ok && canSpend(s, p.price) && apply(s, { type: 'buyParcel', id: p.id }).ok) return;
}

/** 소유 필지의 작은 바위를 하나 치운다 (덤불도) */
function clearOneRock(s: GameState): void {
  if (!featureOpen(s, 'clearRock') || s.money < 2_000_000) return;
  for (const p of ownedParcels(s))
    for (let ly = 0; ly < p.h; ly++)
      for (let lx = 0; lx < p.w; lx++) {
        const x = p.x + lx, y = p.y + ly;
        const c = cellAt(s, x, y);
        const o = objectAt(s, x, y);
        if ((c?.terrain === 'rock' && !o) || o?.type === 'bush_wild') if (apply(s, { type: 'clearRock', x, y }).ok) return;
      }
}

/** 매달 1일 */
function monthlyPlan(s: GameState, monthsPlayed: number): void {
  ensurePath(s);
  // 테이블은 한 달에 4개씩 늘린다 (사람처럼): 시작 3석 + 16
  let added = 0;
  for (const p of [...BOT_TABLES].sort((a, b) => seatScore(s, b.x, b.y) - seatScore(s, a.x, a.y))) { if (added >= BOT_TABLES_PER_MONTH) break; if (!objectAt(s, p.x, p.y) && place(s, 'table_out', p.x, p.y)) added++; }
  setMenuIfEmpty(s, 3, 'green_tea');
  pickDessert(s);

  // 첫 달: 후보 중 미소 최고를 홀로. 2달째: 전단 공고 → 기술 최고를 바리스타
  if (monthsPlayed === 0 && s.staff.length === 0) hireBest(s, 'smile', 'hall');
  if (monthsPlayed === 1 && !hasRole(s, 'barista') && apply(s, { type: 'postJob', tier: 'flyer' }).ok) hireBest(s, 'skill', 'barista');
  // 1년차 7월: 요리사까지 3명, 2년차부터 빈 슬롯을 채운다 (§4.6: 3년차 5명)
  if (monthsPlayed >= BOT_COOK_MONTHS && !hasRole(s, 'cook') && s.staff.length === 2 && s.money >= BOT_HIRE_MIN_MONEY && apply(s, { type: 'postJob', tier: 'flyer' }).ok) hireBest(s, 'skill', 'cook');
  else hireForFreeSlot(s);

  // 홍보: 매달 전단 (돈 100만 넘고 기력 60 넘는 직원), 돈 400만 넘으면 SNS도 — 인기가 손님 수를 정하므로 (§4.2 #1) 꾸준히
  if (featureOpen(s, 'promote') && s.money > FLYER_MIN_MONEY) {
    const st = s.staff.find((x) => x.role !== null && x.energy > FLYER_MIN_ENERGY);
    if (st) apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' });
    const st2 = s.staff.find((x) => x.role !== null && x.energy > FLYER_MIN_ENERGY);
    if (st2 && s.money > SNS_MIN_MONEY) apply(s, { type: 'promote', staffId: st2.id, promotionId: 'sns' });
  }

  // 평판이 40 아래면 사과 이벤트 (월 1회, 50만) — 청소·수리(트랙 A repairObject)가 들어오면 그쪽을 먼저
  if (s.reputation < BOT_APOLOGY_REPUTATION && s.money > BOT_APOLOGY_MIN_MONEY && featureOpen(s, 'promote')) {
    const st = s.staff.find((x) => x.role !== null && x.energy > 10);
    if (st) apply(s, { type: 'promote', staffId: st.id, promotionId: 'apology_event' });
  }

  // 상점: 마일리지 3 이상이면 일꾼 삼춘, 무료 인형뽑기, 아이템은 야외 테이블에
  if (s.mileage >= BOT_WORKER_MILEAGE && s.builders < MAX_BUILDERS) for (const id of WORKER_IDS) if (apply(s, { type: 'buyMileage', id }).ok) break;
  if (hasFreeDraw(s) && canDrawTicket(s).ok && apply(s, { type: 'drawTicket' }).ok) apply(s, { type: 'dismissDraw' });
  for (const [itemId, n] of Object.entries(s.inventory)) if (n > 0 && canUseItem(s, itemId, 'table_out').ok) apply(s, { type: 'useItem', itemId, objectType: 'table_out' });
  if (s.lastAnnouncement) apply(s, { type: 'dismissAnnouncement' });

  // 시설·돌담·필지·바위
  placeDecos(s);
  if (countKind(s, 'wall') < BOT_WALLS.length) for (const p of BOT_WALLS) place(s, 'stonewall', p.x, p.y);
  buyParcelIfAny(s);
  investSpotIfAny(s);
  clearOneRock(s);
}

/** 매일 아침 */
function dailyPlan(s: GameState): void {
  while (s.alerts.length > 0) apply(s, { type: 'dismissAlert' });
  if (s.lastChallenge) apply(s, { type: 'dismissChallenge' });

  if (s.money < PARTTIME_MAX_MONEY && featureOpen(s, 'promote')) {
    for (const st of s.staff) if (apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok) break;
  }

  // 연구 개발이 열리면 레시피 3개까지 개발 (기술 최고 직원). 첫 메뉴는 4번 칸에.
  if (featureOpen(s, 'craft') && s.research >= DEVELOP_RESEARCH && !s.developing && s.customMenus.length < BOT_RECIPES) {
    const st = [...s.staff].sort((a, b) => b.stats.skill - a.stats.skill)[0];
    if (st) apply(s, { type: 'develop', base: 'drink', ingredients: BOT_DEVELOP_INGREDIENTS, staffId: st.id });
  }
  const custom = s.customMenus[0];
  if (custom && !s.menuSlots.includes(custom.id)) apply(s, { type: 'setSlot', slot: 3, menuId: custom.id });
  if (s.lastDevelop) apply(s, { type: 'dismissDevelop' });

  // 주말: 활기가 가장 높은 지역에 팝업
  if (featureOpen(s, 'popup') && isWeekend(s.clock.day) && s.money > BOT_POPUP_MIN_MONEY && !s.popup.regionId) {
    const regionId = bestRegion(s);
    if (canOpenPopup(s, regionId).ok) apply(s, { type: 'openPopup', regionId });
  }
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
  const cur = newBotCursor();
  let minMoney = s.money;
  const totalDays = years * 12 * 30;
  for (let d = 0; d < totalDays; d++) {
    if (s.clock.month !== cur.lastMonth) {
      cur.lastMonth = s.clock.month;
      cur.monthsPlayed++;
      monthlyPlan(s, cur.monthsPlayed);
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
        rank: s.rank, star: s.star, mileage: s.mileage, goals: s.goals.claimed.length, events: s.events.length,
      });
      minMoney = s.money;
      apply(s, { type: 'dismissMonthCard' });
    }
  }
  return rows;
}
