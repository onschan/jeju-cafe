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
import type { GameState, MonthCard } from './types.ts';
import { createInitialState } from './state.ts';
import { tick } from './tick.ts';
import { apply } from './actions.ts';
import { DAY_MS } from './clock.ts';
import { canPlace, objectAt, cellAt } from './grid.ts';
import { START_ORIGIN } from './layout.ts';
import { objectDef, COMBOS, SETS, questDef } from '../data/index.ts';
import { DEVELOP_RESEARCH, menuOf } from './craft.ts';
import { canDrawTicket, hasFreeDraw } from './shop.ts';
import { MAX_BUILDERS } from './build.ts';
import { canUseItem } from './items.ts';
import { isWeekend, canOpenPopup, bestRegion } from './popup.ts';
import { featureOpen, currentGoal } from './goals.ts';
import { seatScore } from './site.ts';
import { canBuyParcel, ownedParcels } from './parcels.ts';
import { isWorn, canRepair } from './cleanliness.ts';
import { complaintCounts } from './reputation.ts';
import { canAcceptQuest } from './board.ts';
import { canChallenge, challengeOdds } from './rivals.ts';
import { canLevelUp } from './staff.ts';
import { canTrain } from './training.ts';
import { staffCapacity } from './staff.ts';
import { canUpgrade, upgradeCost, isUpgradable } from './upgrade.ts';
import { objectStats, activeCombos, setLevels } from './compat.ts';
import { canInvestSpot, canHostTour, tourScore, TOUR_SUCCESS_SCORE } from './spots.ts';
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
export const BOT_DECO_CELLS: { x: number; y: number }[] = [at(6, 6), at(7, 6), at(8, 6), at(9, 6), at(0, 6), at(1, 6), at(2, 6), at(3, 6), at(1, 7), at(2, 7), at(3, 7), at(6, 7), at(7, 7), at(8, 7), at(9, 7), at(0, 0), at(1, 0), at(2, 0), at(6, 0), at(7, 0), at(8, 0), at(9, 0)];
/** 시설 수 목표를 위해 놓는 시설 종류 (열린 것만, 이 순서로 하나씩) */
/** 열린 순서대로(앞이 잠겨 있으면 멈춘다): 감귤나무 2(세트 「감성 카페」·콤보 「귤밭 뷰」「돌담 수확」) → 목표 보상 순 → 휴게실(★2) */
export const BOT_DECO_TYPES = ['tangerine_tree', 'tangerine_tree', 'deco_planter', 'deco_wood_bench', 'terrace_seat', 'deco_flower_pots', 'bench_stonewall', 'canola', 'restroom', 'staff_room', 'footbath', 'vending', 'rest_pavilion', 'pampas', 'souvenir', 'dolhareubang', 'carrot_field', 'handdrip_bar', 'bike_rack', 'deco_lamp_post', 'cedar', 'basalt_rock', 'deco_mailbox', 'deco_water_jar_set',
  // 랜드마크(★4 조건 2개): 부탁·명소 Lv4 보상으로 열리는 것부터 — 필지당 하나라 canPlace가 자리를 고른다
  'dolhareubang_pair', 'stone_guardians', 'millstone', 'hackberry_shade', 'observatory', 'lighthouse'];
export const BOT_WALLS: { x: number; y: number }[] = [at(5, 5), at(6, 5)];
export const FLYER_MIN_MONEY = 1_000_000;
/** 돈이 이만큼 넘으면 SNS 홍보도 (연구 20) */
export const SNS_MIN_MONEY = 4_000_000;
export const FLYER_MIN_ENERGY = 60;
export const PARTTIME_MAX_MONEY = 2_000_000;
export const BOT_PARCEL_MIN_MONEY = 8_000_000;
export const BOT_DEVELOP_INGREDIENTS = ['beans', 'milk'];
export const BOT_SIGNATURE_INGREDIENTS = ['beans', 'milk', 'tangerine', 'sugar'];
/** 시그니처(★3 조건)는 3년차부터 — 그 전엔 §4.6 3년 밴드의 봇 그대로 */
export const BOT_SIGNATURE_YEAR = 3;
/** 게시판 부탁 수락은 4년차부터 (부탁 보상 돈·손님 해금이 커서 3년 밴드 봇에는 넣지 않는다 — 랜드마크·★4는 이걸로 연다) */
export const BOT_QUEST_YEAR = 4;
/** 콤보 만들기(짝 시설 놓기)는 2년차부터 */
export const BOT_COMBO_YEAR = 2;
/** 콤보·세트·부탁·랜드마크용 시설은 자금이 이만큼 넘을 때만 (채용·명소 투자보다 뒤) */
export const BOT_BUILD_MIN_MONEY = 8_000_000;
/** 라이벌 대결은 승산이 이만큼일 때만 */
export const BOT_CHALLENGE_ODDS = 0.5;
/** 승급(월급 +15%/Lv)은 2년차·자금 1,000만부터 */
export const BOT_LEVELUP_YEAR = 2;
export const BOT_LEVELUP_MIN_MONEY = 10_000_000;
export const BOT_WORKER_MILEAGE = 3;
export const BOT_POPUP_MIN_MONEY = 5_000_000;
/** 요리사는 1년차 7월(5달째)부터 — §4.6 1년차 말 직원 3 */
export const BOT_COOK_MONTHS = 4;
export const BOT_TABLES_PER_MONTH = 4;
/** 최근 자리가 없어 돌아간 손님(불만 no_seat)이 이만큼 넘으면 산 필지(위 3번·왼쪽 4번 필지)에 테이블을 더 놓는다 (한 달 2개) */
export const BOT_EXTRA_TABLE_LEFT = 30;
export const BOT_EXTRA_TABLES_PER_MONTH = 2;
/** 확장 테이블은 4년차부터 (3년차까지는 §4.6 밴드의 봇 그대로) */
export const BOT_EXTRA_TABLE_YEAR = 4;
/** 산 필지의 확장 칸 (격자 절대 좌표): 3번 필지(위) 아래 두 줄, 4번 필지(왼쪽) 오른쪽 두 열. 안 산 필지·바위는 canPlace가 거른다. */
export const BOT_EXTRA_CELLS: { x: number; y: number }[] = [
  ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19].flatMap((x) => [{ x, y: 6 }, { x, y: 7 }]),
  ...[8, 9].flatMap((x) => [8, 9, 10, 11, 12, 13, 14, 15].map((y) => ({ x, y }))),
];
export const BOT_RECIPES = 5;
/** 2년차부터 빈 직원 슬롯을 채운다 (돈 이만큼 넘을 때) — §4.6 직원 3 → 5 → 8 */
export const BOT_HIRE_MIN_MONEY = 5_000_000;
export const BOT_HIRE_YEAR = 2;
export const BOT_HIRE_ORDER: RoleId[] = ['clean', 'hall', 'barista', 'cook', 'carry', 'guide', 'garden', 'promo'];
/** 한 달에 수리하는 낡은 시설 수 (트랙 A 노후·태풍 파손) */
export const BOT_REPAIRS_PER_MONTH = 6;
/** 연수: 랭크 3부터 돈 300만 넘으면 한 달에 한 명 (목표 g33·도전) */
export const BOT_TRAIN_MIN_MONEY = 3_000_000;
export const BOT_TRAINING_ID = 'tr_service';
/** 연수는 이만큼만 (비용이 회당 +20%씩 오른다) */
export const BOT_TRAIN_MAX = 4;
/** 증축: 돈 여유가 있으면 한 달에 하나 (목표 g41·g63·g95) */
export const BOT_UPGRADE_MIN_MONEY = 4_000_000;
/** 관광지 투자: 돈이 다음 레벨 비용 + 여유분을 넘으면 (§4.6 투자 규칙) */
export const BOT_SPOT_RESERVE = 3_000_000;
/** 평판이 이 아래면 사과 이벤트 */
export const BOT_APOLOGY_REPUTATION = 40;
export const BOT_APOLOGY_MIN_MONEY = 1_000_000;
/** 3년차부터는 2,000만을 남기고 투자한다 (3년차 말 자금 3,000만~4,500만 밴드 §4.6) */
export const BOT_RESERVE_YEAR3 = 20_000_000;
/** 4년차 전엔 관광지 Lv3까지만 (Lv4·5는 350만~1,300만/회). 4년차부터는 2,000만 여유분을 남기고 Lv5까지 올린다 */
export const BOT_SPOT_MAX_LEVEL_EARLY = 3;
export const BOT_SPOT_FULL_YEAR = 4;
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
/** 한 달에 놓는 시설 수 상한 */
export const BOT_DECOS_PER_MONTH = 2;
function placeDecos(s: GameState): void {
  // 목록 순서대로, 아직 안 열린 것은 건너뛰고(뒤에 열린 것부터 놓는다), 같은 종류는 목록에 적힌 개수만큼. 정류장 같은 시작 오브젝트는 세지 않는다.
  const cells = [...BOT_DECO_CELLS, ...BOT_EXTRA_CELLS];
  const mine = Object.values(s.objects).filter((o) => objectDef(o.type).cost > 0 && o.type !== 'table_out' && cells.some((c) => c.x === o.x && c.y === o.y));
  const have = new Map<string, number>();
  for (const o of mine) have.set(o.type, (have.get(o.type) ?? 0) + 1);
  const need = new Map<string, number>();
  let placed = 0;
  for (const type of BOT_DECO_TYPES) {
    need.set(type, (need.get(type) ?? 0) + 1);
    if ((have.get(type) ?? 0) >= need.get(type)!) continue;
    if (placed >= BOT_DECOS_PER_MONTH) return;
    if (!s.unlocked.objects.includes(type)) continue;
    if (!canSpend(s, objectDef(type).cost)) return;
    const cell = (s.clock.year >= BOT_EXTRA_TABLE_YEAR ? cells : BOT_DECO_CELLS).find((c) => !objectAt(s, c.x, c.y) && canPlace(s, type, c.x, c.y).ok); // 발자국이 맞는 첫 빈 칸 (4년차부터는 산 필지까지)
    if (!cell || !place(s, type, cell.x, cell.y)) return;
    have.set(type, (have.get(type) ?? 0) + 1);
    placed++;
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
  if (s.clock.year < BOT_HIRE_YEAR || !canSpend(s, BOT_HIRE_MIN_MONEY) || s.staff.length >= BOT_STAFF_BASE + BOT_STAFF_PER_YEAR * s.clock.year || s.staff.length >= staffCapacity(s)) return; // 정원(휴게실 +3)이 차면 공고를 내지 않는다
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
    if (!next.ok || (s.clock.year < BOT_SPOT_FULL_YEAR && (s.spots[def.id] ?? 0) >= BOT_SPOT_MAX_LEVEL_EARLY)) continue;
    const cost = def.levels.find((l) => l.level === (s.spots[def.id] ?? 0) + 1)?.cost ?? Infinity;
    if (canSpend(s, cost) && apply(s, { type: 'investSpot', id: def.id }).ok) return;
  }
}

/** 낡은 시설(노후·태풍 파손)을 수리비가 있으면 한 달에 몇 개 고친다 — 불만 'worn'이 평판을 깎는다 */
function repairWorn(s: GameState): void {
  let n = 0;
  for (const o of Object.values(s.objects)) {
    if (n >= BOT_REPAIRS_PER_MONTH) return;
    if (!isWorn(s, o) || !canRepair(s, o.id).ok) continue;
    if (apply(s, { type: 'repairObject', objectId: o.id }).ok) n++;
  }
}
/** 랭크 3부터: 연수 중이 아닌 직원 하나를 서비스 연수에 보낸다 (한 달 한 명) */
function trainOne(s: GameState): void {
  if (s.clock.year < BOT_HIRE_YEAR || s.stats.trainings >= BOT_TRAIN_MAX || !canSpend(s, BOT_TRAIN_MIN_MONEY)) return;
  for (const st of s.staff) if (st.role !== null && canTrain(s, st.id, BOT_TRAINING_ID).ok && apply(s, { type: 'train', staffId: st.id, trainingId: BOT_TRAINING_ID }).ok) return;
}
/** 증축: 조건(이용 횟수·인기)이 찬 시설 하나를 한 달에 하나 증축 */
function upgradeOne(s: GameState): void {
  if (!canSpend(s, BOT_UPGRADE_MIN_MONEY)) return;
  for (const o of Object.values(s.objects)) {
    if (!isUpgradable(objectDef(o.type)) || !canUpgrade(s, o.id, objectStats(s, o.id).popularity).ok) continue;
    if (canSpend(s, upgradeCost(s, o)) && apply(s, { type: 'upgradeObject', objectId: o.id }).ok) return;
  }
}

/** 콤보 만들기 (목표 g21·g35·g59·g77·g93): 아직 발동 안 한 콤보 중 A·B가 다 열려 있고 살 수 있는 것 하나 — 이미 놓인 짝 옆(반경 안) 빈 칸에 상대를 놓는다. 한 달 하나. */
function placeForCombo(s: GameState): void {
  if (s.clock.year < BOT_COMBO_YEAR || s.money < BOT_BUILD_MIN_MONEY) return;
  const active = new Set<string>();
  for (const id of Object.keys(s.objects)) for (const c of activeCombos(s, id)) active.add(c.id);
  const cells = [...BOT_DECO_CELLS, ...BOT_EXTRA_CELLS];
  const near = (o: { x: number; y: number }, type: string, r: number) => cells.find((c) => Math.max(Math.abs(c.x - o.x), Math.abs(c.y - o.y)) <= r && !objectAt(s, c.x, c.y) && canPlace(s, type, c.x, c.y).ok);
  for (const c of COMBOS) {
    if (active.has(c.id) || c.strength === 'down' || c.bCount > 1) continue;
    const b = c.bIds.find((id) => !id.endsWith('*') && s.unlocked.objects.includes(id));
    if (!b || !s.unlocked.objects.includes(c.a)) continue;
    const objs = Object.values(s.objects);
    const anchorA = objs.find((o) => o.type === c.a);
    const anchorB = objs.find((o) => o.type === b);
    const want = anchorA ? b : c.a; // 하나가 있으면 상대를, 둘 다 없으면 A부터
    if (!canSpend(s, objectDef(want).cost)) continue;
    const at = anchorA ?? anchorB;
    const cell = at ? near(at, want, c.radius) : cells.find((x) => !objectAt(s, x.x, x.y) && canPlace(s, want, x.x, x.y).ok);
    if (cell && place(s, want, cell.x, cell.y)) return;
  }
}
/** 세트 만들기 (목표 g48·g76·g94): 아직 안 켜진 세트 중 필요한 시설이 다 열려 있으면 모자란 것을 첫 시설 반경 안에 놓는다 (한 달 하나) */
function placeForSet(s: GameState): void {
  if (s.clock.year < BOT_COMBO_YEAR || s.money < BOT_BUILD_MIN_MONEY) return;
  const active = new Set<string>();
  for (const id of Object.keys(s.objects)) for (const st of setLevels(s, id)) active.add(st.id);
  const cells = [...BOT_DECO_CELLS, ...BOT_EXTRA_CELLS];
  for (const st of SETS) {
    if (active.has(st.id) || !st.requires.every((r) => s.unlocked.objects.includes(r.objectId))) continue;
    const objs = Object.values(s.objects);
    const anchor = objs.find((o) => st.requires.some((r) => r.objectId === o.type));
    for (const r of st.requires) {
      const have = anchor ? objs.filter((o) => o.type === r.objectId && Math.max(Math.abs(o.x - anchor.x), Math.abs(o.y - anchor.y)) <= st.radius).length : 0;
      if (have >= r.count) continue;
      if (!canSpend(s, objectDef(r.objectId).cost)) return;
      const cell = cells.find((c) => (!anchor || Math.max(Math.abs(c.x - anchor.x), Math.abs(c.y - anchor.y)) <= st.radius) && !objectAt(s, c.x, c.y) && canPlace(s, r.objectId, c.x, c.y).ok);
      if (cell && place(s, r.objectId, cell.x, cell.y)) return;
      break; // 이 세트는 자리가 없다 → 다음 세트
    }
  }
}
/** 열린 랜드마크를 아직 없는 필지에 하나씩 (★4 조건 「랜드마크 2」). 필지 전체 칸을 훑는다. */
function placeLandmark(s: GameState): void {
  if (s.money < BOT_BUILD_MIN_MONEY) return;
  for (const id of s.unlocked.objects) {
    const d = objectDef(id);
    if (d.kind !== 'landmark' || Object.values(s.objects).some((o) => o.type === id) || !canSpend(s, d.cost)) continue;
    for (const p of ownedParcels(s)) for (let ly = 0; ly < p.h; ly++) for (let lx = 0; lx < p.w; lx++) {
      const x = p.x + lx, y = p.y + ly;
      if (!objectAt(s, x, y) && canPlace(s, id, x, y).ok && place(s, id, x, y)) return;
    }
  }
}
/** 부탁(게시판) 중 「시설 N개 놓기」는 열려 있으면 놓아 준다 (한 달 하나) */
function placeForQuest(s: GameState): void {
  if (s.money < BOT_BUILD_MIN_MONEY) return;
  for (const q of Object.values(s.board.quests)) {
    if (q.status !== 'active') continue;
    const cond = questDef(q.id).condition;
    if (cond.type !== 'objectPlaced') continue;
    const { objectId, count } = cond.params;
    if (!s.unlocked.objects.includes(objectId) || Object.values(s.objects).filter((o) => o.type === objectId).length >= count) continue;
    if (!canSpend(s, objectDef(objectId).cost)) continue;
    const cell = [...BOT_DECO_CELLS, ...BOT_EXTRA_CELLS].find((c) => !objectAt(s, c.x, c.y) && canPlace(s, objectId, c.x, c.y).ok);
    if (cell && place(s, objectId, cell.x, cell.y)) return;
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
  // 자리가 모자라 돌아간 손님이 많으면 산 필지에 테이블을 더 (평판 'no_seat' 불만 방지)
  if (s.clock.year >= BOT_EXTRA_TABLE_YEAR && (complaintCounts(s).find((c) => c.reason === 'no_seat')?.count ?? 0) >= BOT_EXTRA_TABLE_LEFT) {
    let extra = 0;
    for (const p of BOT_EXTRA_CELLS) { if (extra >= BOT_EXTRA_TABLES_PER_MONTH) break; if (!objectAt(s, p.x, p.y) && place(s, 'table_out', p.x, p.y)) extra++; }
  }
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
  for (const p of BOT_WALLS) if (!objectAt(s, p.x, p.y)) place(s, 'stonewall', p.x, p.y); // 시작 돌담이 있어도 봇 돌담(콤보 「돌담 수확」·세트 「감성 카페」)은 따로 놓는다
  repairWorn(s);
  trainOne(s);
  upgradeOne(s);
  placeForCombo(s);
  placeForSet(s);
  placeForQuest(s);
  placeLandmark(s);
  // 투어 개최: 점수 60 이상인 명소가 있으면 월 1회 (목표 g71)
  if (!s.lastTour) for (const def of SPOTS) if (canHostTour(s, def.id).ok && tourScore(s, def.id) >= TOUR_SUCCESS_SCORE) { apply(s, { type: 'hostTour', spotId: def.id }); break; }
  if (s.lastTour) apply(s, { type: 'dismissTour' });
  // 승급: 경험치·연구가 찬 직원 하나 (목표 g66·g88)
  if (s.clock.year >= BOT_LEVELUP_YEAR && s.money >= BOT_LEVELUP_MIN_MONEY && (s.customMenus.length >= BOT_RECIPES || s.research >= DEVELOP_RESEARCH * 2)) for (const st of s.staff) if (canLevelUp(s, st.id).ok && apply(s, { type: 'levelUp', staffId: st.id }).ok) break; // 연구 포인트는 레시피 개발이 먼저
  // 라이벌 대결: 승산 50% 넘는 메뉴가 있으면 한 달 한 번 (목표 g65·g98)
  if (!s.lastChallenge) {
    const menus = [...s.menuSlots.filter((m): m is string => !!m), ...s.customMenus.map((m) => m.id)];
    outer: for (const r of s.rivals) for (const m of menus) if (canChallenge(s, r.id, m).ok && challengeOdds(s, r.id, m) >= BOT_CHALLENGE_ODDS) { apply(s, { type: 'challenge', rivalId: r.id, menuId: m }); break outer; }
  }
  buyParcelIfAny(s);
  investSpotIfAny(s);
  clearOneRock(s);
}

/** 매일 아침 */
function dailyPlan(s: GameState): void {
  while (s.alerts.length > 0) apply(s, { type: 'dismissAlert' });
  // 게시판 부탁은 오는 대로 받는다 (랜드마크·손님 해금이 부탁 보상)
  if (s.clock.year >= BOT_QUEST_YEAR) for (const q of Object.values(s.board.quests)) if (q.status === 'offered' && canAcceptQuest(s, q.id).ok) apply(s, { type: 'acceptQuest', id: q.id });
  if (s.lastChallenge) apply(s, { type: 'dismissChallenge' });

  if (s.money < PARTTIME_MAX_MONEY && featureOpen(s, 'promote')) {
    for (const st of s.staff) if (apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok) break;
  }

  // 연구 개발이 열리면 레시피 3개까지 개발 (기술 최고 직원). 첫 메뉴는 4번 칸에.
  if (featureOpen(s, 'craft') && s.research >= DEVELOP_RESEARCH && !s.developing && s.customMenus.length < BOT_RECIPES) {
    const st = [...s.staff].sort((a, b) => b.stats.skill - a.stats.skill)[0];
    if (st) apply(s, { type: 'develop', base: 'drink', ingredients: BOT_DEVELOP_INGREDIENTS, staffId: st.id });
  }
  // ★2부터 시그니처 1개 (★3 승급 조건) — 요리사가 맡는다
  if (featureOpen(s, 'craft') && s.star >= 2 && s.clock.year >= BOT_SIGNATURE_YEAR && s.research >= DEVELOP_RESEARCH && !s.developing && !s.customMenus.some((m) => m.category === 'signature')) {
    const cook = s.staff.find((x) => x.role === 'cook');
    if (cook) apply(s, { type: 'develop', base: 'signature', ingredients: BOT_SIGNATURE_INGREDIENTS, staffId: cook.id });
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
export function botDay(s: GameState, cur: BotCursor, onCard?: (card: MonthCard) => void): void {
  if (s.clock.month !== cur.lastMonth) {
    cur.lastMonth = s.clock.month;
    cur.monthsPlayed++;
    monthlyPlan(s, cur.monthsPlayed);
  }
  dailyPlan(s);
  tick(s, DAY_MS);
  if (s.lastMonthCard) { onCard?.(s.lastMonthCard); apply(s, { type: 'dismissMonthCard' }); }
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
