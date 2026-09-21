/**
 * 헤드리스 봇 — 밸런스 검증용 단순 전략. 순수·결정적 (state와 apply만 쓴다).
 *
 * v3 전략 (목표 체인을 따라간다):
 * - 시작 상태(테이블 2 + 파라솔 1 + 올렛길 + 메뉴 3종 + 후보 2명)에서 출발. 가로 올렛길(y=4)을 깔고 테이블을 한 달에 4개씩 16개까지 늘린다.
 * - 첫날 후보 중 미소 최고를 홀로 채용. 2달째 전단 공고 → 기술 최고를 바리스타. 1년차 7월에 요리사, 2년차부터 빈 슬롯(2 + 년차 명까지).
 * - 열린 시설(감귤나무·화분·벤치·돌담·당근밭…)을 정해진 칸에 하나씩 놓는다. 시설 수 목표를 밀어 준다.
 * - 홍보가 열리면 돈 500만 넘고 기력 60 넘는 직원이 있을 때 전단 (한 달에 한 번).
 * - 필지 구매가 열리면 돈 800만 넘을 때 살 수 있는 필지를 산다.
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
import { canPlace, objectAt, cellAt, footprint, doorFrontOf } from './grid.ts';
import { START_ORIGIN } from './layout.ts';
import { objectDef, COMBOS, SETS, questDef, challengeDef, INDOOR_IDS } from '../data/index.ts';
import { DEVELOP_RESEARCH, menuOf } from './craft.ts';
import { canDrawTicket, hasFreeDraw, canBuyTicket, canUseGuestItem, MID_MONTH_TICKET_DAY } from './shop.ts';
import { effectivePopularity } from './promotions.ts';
import { isUnlocked } from './segments.ts';
import { POPULARITY_FRUIT } from '../data/index.ts';
import { MAX_BUILDERS } from './build.ts';
import { canUseItem } from './items.ts';
import { isWeekend, canOpenPopup, bestRegion } from './popup.ts';
import { featureOpen, goalClaimed, currentGoal, activeGoals } from './goals.ts';
import { seatScore } from './site.ts';
import { canBuyParcel, ownedParcels, parcelAt } from './parcels.ts';
import { isWorn, canRepair } from './cleanliness.ts';
import { complaintCounts } from './reputation.ts';
import { canAcceptQuest } from './board.ts';
import { offeredChallenges, canAcceptChallenge } from './challenges.ts';
import { spotEffectAt } from './compat.ts';
import { SPOT_EFFECTS } from '../data/index.ts';
import { canChallenge, challengeOdds } from './rivals.ts';
import { canLevelUp } from './staff.ts';
import { canTrain } from './training.ts';
import { staffCapacity } from './staff.ts';
import { canUpgrade, upgradeCost, isUpgradable } from './upgrade.ts';
import { objectStats, activeCombos, setLevels } from './compat.ts';
import { canInvestSpot, canHostTour, tourScore, TOUR_SUCCESS_SCORE } from './spots.ts';
import { SPOTS } from '../data/index.ts';
import { canHire } from './staff.ts';
import { parkingSites, routePathCells, routeFacility, canSetRouteContract, ENTRY_ROUTES, PARKING_EXPAND_FROM, PARKING_SLOTS } from './entry.ts'; // 트랙 H
import { mainBuilding, freeFloorCells, nextMainLevel, expandCost, expandCells, canExpandMain, isAnnex, indoorSeats } from './rooms.ts'; // y-indoor
import type { Candidate, RoleId, StatKey, QuestDef } from './types.ts';
import { canDonate, canHoldFestival } from './village.ts'; // z-ending

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
  ending: { total: number; title: string } | null; // z-ending: 엔딩 뒤 최종 점수 (10년차 3월부터)
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
/** 게시판 부탁 수락 (game-feel P1: 2년차부터 — 부탁 완료가 달 중반 사건·손님층 체인이라 헤드리스 KPI도 플레이어에 가깝게. 1년차부터 받으면 1년차 순이익이 900만+로 §4.6 밴드(300~800만)를 넘는다).
 *  지금 할 수 있는 것(questFeasible: 시설·메뉴 열림·아이템 있음)만 받는다 */
export const BOT_QUEST_YEAR = 2;
/** 도전 과제 수락도 2년차부터 (1년차 도전 보상 돈 100만+가 1년차 순이익 밴드를 넘긴다) */
export const BOT_CHALLENGE_YEAR = 2;
/** 동시에 하는 부탁 수 (한 번에 하나 — 부탁 시설을 몰아 지으면 시설 인기 합이 불어 3년 자금이 1억을 넘는다) */
export const BOT_QUEST_ACTIVE_MAX = 2;
export const BOT_QUEST_PLACES_PER_MONTH = 1;
/** 도전 과제: 빈 슬롯은 늘 채운다 (tier 낮은 것부터, 명당·숨은 레시피·콤보처럼 봇이 할 줄 아는 것 우선) — game-feel P2 */
export const BOT_CHALLENGE_PREFER = ['c41', 'c43', 'c46', 'c42', 'c44', 'c45'];
/** tier 3 이상(요금 +5%·칭호·마일리지 100 같은 큰 보상)은 안 받는다 — 3년 자금 밴드 */
export const BOT_CHALLENGE_MAX_TIER = 2;
/** 응모권은 보름(15일)에 1장만 쓴다 — 보름 응모권(P0-4)을 플레이어처럼. 다 쓰면(해금·승급·도전 응모권 100장+ → 연구·아이템) 3년 자금이 1억을 넘는다(§4.6 밴드) */
export const BOT_DRAW_TICKETS = true;
/** 명당 만들기: 도전·월간 과제에 명당이 걸려 있거나 2년차부터, 도감에 없는 명당 하나를 만든다 (한 달 하나) */
export const BOT_SPOT_EFFECT_YEAR = 2;
export const BOT_SPOT_CELLS: { x: number; y: number }[] = [0, 1, 2, 3, 6, 7, 8, 9].flatMap((x) => [at(x, 1), at(x, 2)]); // 시작 필지 위쪽 두 줄 (테이블 줄 y=3 위)
export const BOT_SPOT_ORDER = ['spot_orchard', 'spot_bubble', 'spot_massage', 'spot_waterfall', 'spot_oreum'];
/** 레시피 개발 재료 순서: 2·4번째는 숨은 레시피(한라봉 에이드·용천수 콜드브루) — 도감·도전 「숨은 레시피 찾기」 */
export const BOT_RECIPE_PLAN: string[][] = [['beans', 'milk'], ['hallabong', 'ice', 'honey'], ['beans', 'milk'], ['water_spring', 'beans_roast', 'ice'], ['beans', 'milk']];
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
/** y-indoor: 실내 테이블(80만)은 방 안 짝수 줄(ly 0·2)에만 놓아 홀수 줄이 통로가 되게 (문은 항상 비움). 한 달 3개.
 *  목표 g23 「실내 좌석 6석」이 진행 중이거나, 2년차부터 돈 여유(800만)가 있을 때만 — 1년차 자금 목표(700만)를 늦추지 않게 */
export const BOT_INDOOR_PER_MONTH = 3;
export const BOT_INDOOR_GOAL = 'g23';
export const BOT_INDOOR_YEAR = 2;
export const BOT_INDOOR_MIN_MONEY = 12_000_000;
/** 실내 좌석은 이만큼까지만 (야외 테이블 5만 vs 실내 80만 — 자금 KPI) */
export const BOT_INDOOR_MAX_SEATS = 14;
/** y-indoor: 본관 증축은 2년차부터 Lv2까지(Lv3 800만 + 7일 휴업은 3년차 KPI 밴드를 깎는다), 비용 + 여유 400만 (목표 g41 「본관 Lv2」). 늘어나는 칸의 테이블·장식은 치운다 */
export const BOT_EXPAND_YEAR = 2;
export const BOT_EXPAND_MAX_LEVEL = 2;
/** y-indoor: 별관(카페 별관 4×3)은 서쪽 필지(parcel4) 위쪽 (−7,0)에 — 밭담 돌담이 겹치면 치운다. 문 앞 (−7,3)에서 y=4 올렛길을 동쪽으로 이어 시작 필지 가로 길에 붙인다 (목표 g45 「별관 짓기」) */
export const BOT_ANNEX_TYPE = 'annex_cafe';
export const BOT_ANNEX_AT = at(-7, 0);
export const BOT_ANNEX_PATH: { x: number; y: number }[] = [at(-7, 3), ...[-7, -6, -5, -4, -3, -2, -1].map((x) => at(x, 4))];
export const BOT_ANNEX_RESERVE = 4_000_000;
/** 산 필지의 확장 칸 (격자 절대 좌표): 3번 필지(위) 아래 두 줄, 4번 필지(왼쪽) 오른쪽 두 열. 안 산 필지는 canPlace가 거른다. */
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
/** z-ending: 마을 기부는 잔고 ₩2,000만 이상일 때 한 달 ₩50만, 누적 ₩1,000만(기부 항목 20점)까지 */
export const BOT_DONATE_MIN_MONEY = 20_000_000;
export const BOT_DONATE_CAP = 10_000_000;
/** 연수는 이만큼만 (비용이 회당 +20%씩 오른다) */
export const BOT_TRAIN_MAX = 4;
/** 증축: 돈 여유가 있으면 한 달에 하나 (목표 g41·g63·g95) */
export const BOT_UPGRADE_MIN_MONEY = 4_000_000;
/** 관광지 투자: 돈이 다음 레벨 비용 + 여유분을 넘으면 (§4.6 투자 규칙) */
export const BOT_SPOT_RESERVE = 3_000_000;
/** 평판이 이 아래면 사과 이벤트 */
export const BOT_APOLOGY_REPUTATION = 40;
export const BOT_APOLOGY_MIN_MONEY = 1_000_000;
/** 커플 인기 열매 규칙 (g44): 이 값 아래면 응모권으로 인기 열매를 사서 쓴다 */
export const BOT_COUPLE_ID = 'couple';
export const BOT_COUPLE_POPULARITY = 30;
export const BOT_COUPLE_GOAL = 'g44';
/** 커플 해금 체인: 유채밭 Lv4 → 산굼부리 Lv4 → 동백 동산 Lv2 */
export const BOT_COUPLE_SPOT_CHAIN = ['canola_field', 'sangumburi', 'camellia_hill'];
/** 체인이 초반 캡(Lv3)을 넘겨 투자할 때는 이만큼 더 남긴다 (3년차 말 자금 밴드 3,000만 유지) */
export const BOT_COUPLE_CHAIN_RESERVE = 10_000_000;
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
    const cell = (s.clock.year >= BOT_EXTRA_TABLE_YEAR ? cells : [...BOT_DECO_CELLS, ...BOT_EXTRA_CELLS]).find((c) => !objectAt(s, c.x, c.y) && canPlace(s, type, c.x, c.y).ok); // 발자국이 맞는 첫 빈 칸 (장식 칸이 차면 산 필지 — 부탁·명당 시설이 늘어 휴게실(직원 정원 +3) 자리가 없던 시드가 있었다)
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
  // g44 「커플 손님 인기 30」이 열렸는데 커플이 안 오면(camellia_hill Lv2 해금) 유채밭→산굼부리→동백 체인은 초반 Lv3 캡을 안 본다
  const wantCouple = !isUnlocked(s, BOT_COUPLE_ID) && activeGoals(s).some((g) => g.id === BOT_COUPLE_GOAL);
  const once = (): boolean => {
    for (const def of SPOTS) {
      const next = canInvestSpot(s, def.id);
      const chain = wantCouple && BOT_COUPLE_SPOT_CHAIN.includes(def.id) && (def.id !== 'camellia_hill' || (s.spots[def.id] ?? 0) < 2);
      if (!next.ok || (!chain && s.clock.year < BOT_SPOT_FULL_YEAR && (s.spots[def.id] ?? 0) >= BOT_SPOT_MAX_LEVEL_EARLY)) continue;
      const cost = def.levels.find((l) => l.level === (s.spots[def.id] ?? 0) + 1)?.cost ?? Infinity;
      const capBreak = chain && (s.spots[def.id] ?? 0) >= BOT_SPOT_MAX_LEVEL_EARLY && s.clock.year < BOT_SPOT_FULL_YEAR;
      if (canSpend(s, cost + (capBreak ? BOT_COUPLE_CHAIN_RESERVE : 0)) && apply(s, { type: 'investSpot', id: def.id }).ok) return true;
    }
    return false;
  };
  once();
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
/** 명당 만들기 (game-feel P1: 봇 3년 명당 0/12): 도감에 없는 명당 중 중심·필요 시설이 다 열려 있는 것 하나 — 중심을 놓고(있으면 그것) 반경 안 빈 칸에 모자란 시설을 채운다. 한 달 하나. */
function placeForSpot(s: GameState): void {
  const wanted = s.challenges.active.some((a) => challengeDef(a.id).condition.type === 'spotEffects') || s.monthly?.condition.type === 'spotEffects';
  if (!wanted && s.clock.year < BOT_SPOT_EFFECT_YEAR) return;
  const cells = [...BOT_EXTRA_CELLS, ...BOT_SPOT_CELLS]; // 산 필지(위 3번·왼쪽 4번)에 먼저 — 시작 필지 위쪽 줄은 창고·바위·부탁 시설로 붐빈다
  const free = (type: string, c: { x: number; y: number }) => !objectAt(s, c.x, c.y) && canPlace(s, type, c.x, c.y).ok;
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= r;
  for (const id of BOT_SPOT_ORDER) {
    const sp = SPOT_EFFECTS.find((x) => x.id === id);
    if (!sp || s.codex.spots.includes(sp.id)) continue;
    if (![sp.center, ...sp.requires.map((r) => r.objectId)].every((t) => s.unlocked.objects.includes(t))) continue;
    const objs = Object.values(s.objects);
    // 중심 후보: 이미 있는 중심 시설(명당 아닌 것) 또는 빈 칸 — 반경 안에 모자란 시설을 다 놓을 빈 칸이 있는 곳
    const fits = (at: { x: number; y: number }, isNew: boolean): boolean => {
      let needCells = 0;
      for (const r of sp.requires) {
        const have = objs.filter((o) => o.type === r.objectId && near(o, at, sp.radius)).length;
        const need = Math.max(0, r.count - have);
        if (cells.filter((q) => near(q, at, sp.radius) && (q.x !== at.x || q.y !== at.y) && free(r.objectId, q)).length < need) return false;
        needCells += need;
      }
      return cells.filter((q) => near(q, at, sp.radius) && (q.x !== at.x || q.y !== at.y) && !objectAt(s, q.x, q.y)).length >= needCells + (isNew ? 0 : 0);
    };
    let center = objs.find((o) => o.type === sp.center && !spotEffectAt(s, o.id) && fits(o, false));
    if (!center) {
      const c = cells.find((q) => free(sp.center, q) && fits(q, true));
      if (!c || !canSpend(s, objectDef(sp.center).cost) || !place(s, sp.center, c.x, c.y)) continue;
      center = objectAt(s, c.x, c.y)!;
    }
    const at = center;
    for (const r of sp.requires) {
      let have = Object.values(s.objects).filter((o) => o.type === r.objectId && o.id !== at.id && near(o, at, sp.radius)).length;
      while (have < r.count) {
        if (!canSpend(s, objectDef(r.objectId).cost)) return;
        const c = cells.find((q) => near(q, at, sp.radius) && free(r.objectId, q));
        if (!c || !place(s, r.objectId, c.x, c.y)) return;
        have++;
      }
    }
    return;
  }
}
/** y-indoor: 본관·별관 바닥 짝수 줄에 실내 테이블 (통로 줄은 비운다) */
function placeIndoorSeats(s: GameState): void {
  const goalActive = activeGoals(s).some((g) => g.id === BOT_INDOOR_GOAL);
  if (!goalActive && (s.clock.year < BOT_INDOOR_YEAR || indoorSeats(s) >= BOT_INDOOR_MAX_SEATS || !canSpend(s, objectDef('table_in').cost + BOT_INDOOR_MIN_MONEY))) return;
  let n = 0;
  for (const room of Object.values(s.objects).filter((o) => o.type === 'warehouse' || isAnnex(o))) {
    if (room.build) continue;
    for (const p of freeFloorCells(s, room)) {
      if (n >= BOT_INDOOR_PER_MONTH) return;
      if ((p.y - room.y) % 2 !== 0) continue;
      if (place(s, 'table_in', p.x, p.y)) n++;
    }
  }
}
/** y-indoor: 본관 증축 — 늘어나는 칸의 좌석·장식을 치우고 expandMain */
function expandMainIfCan(s: GameState): void {
  if (s.clock.year < BOT_EXPAND_YEAR || !mainBuilding(s)) return;
  const next = nextMainLevel(s);
  if (!next || next > BOT_EXPAND_MAX_LEVEL || s.money < expandCost(s) + BOT_UPGRADE_MIN_MONEY) return; // 목표 g41(본관 Lv2)이 체인을 막지 않게 별관처럼 3년차 여유분(2,000만)은 안 본다 (y 통합: 주차장 자리 좌석 철거로 3년차 초 자금이 2,700만에 못 미치는 시드가 있다)
  for (const p of expandCells(s)) {
    const o = objectAt(s, p.x, p.y);
    if (o && !objectDef(o.type).room && objectDef(o.type).kind !== 'path') apply(s, { type: 'remove', objectId: o.id });
  }
  if (!canExpandMain(s).ok || !apply(s, { type: 'expandMain' }).ok) return;
  // 문이 아래로 내려오므로 새 문 앞 칸을 비우고 올렛길로 잇는다 (시작 테이블 (3,4)가 막는다)
  const f = doorFrontOf(mainBuilding(s)!);
  const blocker = objectAt(s, f.x, f.y);
  if (blocker && objectDef(blocker.type).kind !== 'path') apply(s, { type: 'remove', objectId: blocker.id });
  if (!objectAt(s, f.x, f.y)) place(s, 'path', f.x, f.y);
}
/** y-indoor: 서쪽 필지를 사면 별관 자리까지 올렛길을 먼저 깔고, 별관이 열리고 돈이 되면 짓는다 */
function placeAnnex(s: GameState): void {
  const p0 = BOT_ANNEX_AT;
  if (!parcelAt(s, p0.x, p0.y)?.owned) return;
  for (const p of BOT_ANNEX_PATH) if (!objectAt(s, p.x, p.y)) place(s, 'path', p.x, p.y);
  if (Object.values(s.objects).some((o) => isAnnex(o))) return;
  if (!s.unlocked.objects.includes(BOT_ANNEX_TYPE) || s.money < objectDef(BOT_ANNEX_TYPE).cost + BOT_ANNEX_RESERVE) return; // 목표 g45가 체인을 막지 않게 3년차 여유분(2,000만)은 안 본다
  const d = objectDef(BOT_ANNEX_TYPE);
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) { const o = objectAt(s, p0.x + dx, p0.y + dy); if (o && o.type === 'stonewall') apply(s, { type: 'remove', objectId: o.id }); }
  place(s, BOT_ANNEX_TYPE, p0.x, p0.y);
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
export const BOT_QUEST_BUILD_MIN_MONEY = 3_000_000;
export const BOT_QUEST_CHEAP = 200_000;
/** 장식 칸은 이만큼 비워 둔다 (휴게실·화장실 등 목표 시설 자리) */
export const BOT_DECO_RESERVE = 6;
function placeForQuest(s: GameState): void {
  if (s.money < BOT_QUEST_BUILD_MIN_MONEY) return;
  for (const q of Object.values(s.board.quests)) {
    if (q.status !== 'active') continue;
    const cond = questDef(q.id).condition;
    if (cond.type !== 'objectPlaced') continue;
    const { objectId, count } = cond.params;
    if (!s.unlocked.objects.includes(objectId)) continue;
    if (objectDef(objectId).cost > BOT_QUEST_CHEAP && s.money < BOT_BUILD_MIN_MONEY) continue; // 비싼 시설은 자금 800만부터
    // 부탁 시설은 산 필지·위쪽 줄에 먼저 — 장식 칸(BOT_DECO_CELLS)을 부탁 시설이 채우면 휴게실 자리가 없어 직원 3명에 묶인다(3년 밴드 붕괴)
    const freeDeco = BOT_DECO_CELLS.filter((c) => !objectAt(s, c.x, c.y)).length;
    const cells = [...BOT_EXTRA_CELLS, ...BOT_SPOT_CELLS, ...(freeDeco > BOT_DECO_RESERVE ? BOT_DECO_CELLS : [])];
    let placed = 0;
    while (Object.values(s.objects).filter((o) => o.type === objectId).length < count && placed < BOT_QUEST_PLACES_PER_MONTH) { // 싼 시설(꽃·등)은 한 달에 몇 개씩
      if (!canSpend(s, objectDef(objectId).cost)) return;
      const cell = cells.find((c) => !objectAt(s, c.x, c.y) && canPlace(s, objectId, c.x, c.y).ok);
      if (!cell || !place(s, objectId, cell.x, cell.y)) return;
      placed++;
    }
    if (placed > 0) return;
  }
}
/** 봇이 끝낼 수 있는 부탁인가: 시설은 열려 있고 봇이 놓을 수 있는 종류(경로 시설·건물 제외), 메뉴는 지금 메뉴판에 있는 것, 아이템은 갖고 있는 것 */
export function botCanDoQuest(s: GameState, q: QuestDef): boolean {
  const c = q.condition;
  switch (c.type) {
    case 'objectPlaced': { const d = objectDef(c.params.objectId); return s.unlocked.objects.includes(d.id) && d.cost <= BOT_QUEST_CHEAP && !d.room && d.kind !== 'landmark' && PARKING_SLOTS[d.id] === undefined && !INDOOR_IDS.has(d.id); }
    case 'menuSold': return s.menuSlots.includes(c.params.menuId);
    case 'item': return (s.inventory[c.params.itemId] ?? 0) >= c.params.count;
    case 'none': return true;
    default: return false;
  }
}

/** 열린 필지 중 살 수 있는 것을 하나 산다 */
/** 봇의 레시피 개발 시점: 연구 개발은 처음부터 열려 있지만(ease) 봇은 예전처럼 g16(메뉴 4개) 뒤에만 — 1년차 밴드를 그대로 두려고 */
function botCraftOpen(s: GameState): boolean {
  return goalClaimed(s, 'g16');
}
function buyParcelIfAny(s: GameState): void {
  if (!featureOpen(s, 'parcel') || s.money < BOT_PARCEL_MIN_MONEY) return;
  for (const p of s.parcels) if (!p.owned && canBuyParcel(s, p.id).ok && canSpend(s, p.price) && apply(s, { type: 'buyParcel', id: p.id }).ok) return;
}

/** 트랙 H 유입 경로: 주차장(마을 길 옆 첫 자리) → 올레 표식·셔틀 정류장·선착장 + 진입점까지 올렛길 → 셔틀 계약 */
export const BOT_ROUTE_SITES: Record<'olle' | 'shuttle' | 'cruise', { x: number; y: number }> = { olle: { x: 3, y: 11 }, shuttle: { x: 15, y: 20 }, cruise: { x: 14, y: 0 } }; // 셔틀은 샘(15,19) 아래, 옆 열(x=16)로 마을 길까지
/** 경로 시설에서 시작 필지 올렛길(가로 y=12 · 세로 x=14)까지 잇는 칸. 크루즈는 parcel2·parcel4를 지나므로 그 필지를 산 뒤에 이어진다. */
const BOT_ROUTE_LINKS: Record<'olle' | 'shuttle' | 'cruise', { x: number; y: number }[]> = {
  olle: [{ x: 3, y: 12 }, ...[4, 5, 6, 7, 8, 9].map((x) => ({ x, y: 12 }))],
  shuttle: [16, 17, 18, 19, 20].map((y) => ({ x: 16, y })),
  cruise: [...[1, 2, 3, 4, 5, 6, 7].map((y) => ({ x: 14, y })), ...[13, 12, 11, 10, 9].map((x) => ({ x, y: 7 })), ...[8, 9, 10, 11, 12].map((y) => ({ x: 9, y }))], // 본관(13~15, 9~10)·북쪽 테이블 줄을 피해 오름 자락(9,7)→밭담 골짜기 x=9로 내려와 가로 올렛길(10,12)에 닿는다
};
function laySteps(s: GameState, cells: { x: number; y: number }[]): void {
  for (const c of cells) {
    const o = objectAt(s, c.x, c.y);
    if (o?.type === 'path' || objectDef(o?.type ?? 'path').kind === 'busstop') continue;
    if (!objectAt(s, c.x, c.y)) apply(s, { type: 'place', objectType: 'path', ...c });
  }
}
/** 경로 시설은 2년차부터 — 1년차에 주차장을 지으면 가족·커플 손님 매출로 §4.6 밴드(1년차 순이익 300~800만)를 넘는다. 목표도 g36(2년차)부터 */
export const BOT_ROUTE_YEAR = 2;
/** 시작 필지 오른쪽 아래(마을 길 옆) 2×2 — 2년차에 그 자리의 테이블·시설을 치우고(환불) 주차장을 놓는다. 1년차 배치는 §4.6 밴드 그대로. */
export const BOT_PARKING_SITE = at(8, 5);
function clearParkingSite(s: GameState): boolean {
  for (const c of footprint(PARKING_EXPAND_FROM, BOT_PARKING_SITE.x, BOT_PARKING_SITE.y)) {
    const o = objectAt(s, c.x, c.y);
    if (o && !apply(s, { type: 'remove', objectId: o.id }).ok) return false; // 손님이 앉아 있으면 다음 달
  }
  return true;
}
function planRoutes(s: GameState): void {
  if (s.clock.year < BOT_ROUTE_YEAR) return;
  if (!routeFacility(s, 'parking') && !Object.values(s.objects).some((o) => o.type === PARKING_EXPAND_FROM) && s.unlocked.objects.includes(PARKING_EXPAND_FROM) && canSpend(s, objectDef(PARKING_EXPAND_FROM).cost)) {
    const sites = parkingSites(s);
    const site = sites.find((p) => p.x === BOT_PARKING_SITE.x && p.y === BOT_PARKING_SITE.y) ?? (clearParkingSite(s) ? BOT_PARKING_SITE : sites[0]);
    if (site) place(s, PARKING_EXPAND_FROM, site.x, site.y);
  }
  for (const route of ['olle', 'shuttle', 'cruise'] as const) {
    const type = ENTRY_ROUTES[route].facilities[0]!;
    const site = BOT_ROUTE_SITES[route];
    if (!routeFacility(s, route) && !Object.values(s.objects).some((o) => o.type === type) && canSpend(s, objectDef(type).cost)) {
      // 자리에 올렛길이 먼저 깔려 있으면(별관 문 앞 올렛길 — placeAnnex) 걷어내고 놓는다. 표지·정류장은 걷기 칸이라 문 앞이 막히지 않는다.
      const here = objectAt(s, site.x, site.y);
      if (here?.type === 'path') apply(s, { type: 'remove', objectId: here.id });
      if (!objectAt(s, site.x, site.y)) place(s, type, site.x, site.y);
    }
    if (!Object.values(s.objects).some((o) => o.type === type)) continue;
    laySteps(s, [...routePathCells(route, site), ...BOT_ROUTE_LINKS[route]]);
  }
  if (canSetRouteContract(s, 'shuttle', true).ok && canSpend(s, 2_000_000)) apply(s, { type: 'setRouteContract', route: 'shuttle', on: true });
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
  if (s.money > FLYER_MIN_MONEY) {
    const st = s.staff.find((x) => x.role !== null && x.energy > FLYER_MIN_ENERGY);
    if (st) apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' });
    const st2 = s.staff.find((x) => x.role !== null && x.energy > FLYER_MIN_ENERGY);
    if (st2 && s.money > SNS_MIN_MONEY) apply(s, { type: 'promote', staffId: st2.id, promotionId: 'sns' });
  }

  // 평판이 40 아래면 사과 이벤트 (월 1회, 50만) — 청소·수리(트랙 A repairObject)가 들어오면 그쪽을 먼저
  if (s.reputation < BOT_APOLOGY_REPUTATION && s.money > BOT_APOLOGY_MIN_MONEY) {
    const st = s.staff.find((x) => x.role !== null && x.energy > 10);
    if (st) apply(s, { type: 'promote', staffId: st.id, promotionId: 'apology_event' });
  }

  // 상점: 마일리지 3 이상이면 일꾼 삼춘, 무료 인형뽑기, 아이템은 야외 테이블에
  if (s.mileage >= BOT_WORKER_MILEAGE && s.builders < MAX_BUILDERS) for (const id of WORKER_IDS) if (apply(s, { type: 'buyMileage', id }).ok) break;
  if (hasFreeDraw(s) && canDrawTicket(s).ok && apply(s, { type: 'drawTicket' }).ok) apply(s, { type: 'dismissDraw' });
  for (const [itemId, n] of Object.entries(s.inventory)) if (n > 0 && canUseItem(s, itemId, 'table_out').ok) apply(s, { type: 'useItem', itemId, objectType: 'table_out' });
  // 커플 인기(g44 「커플 손님 인기 30」): 응모권 5장이면 인기 열매를 사서 커플에게 (홍보는 커플을 안 올린다)
  if (effectivePopularity(s, BOT_COUPLE_ID) < BOT_COUPLE_POPULARITY && isUnlocked(s, BOT_COUPLE_ID) && (s.inventory[POPULARITY_FRUIT] ?? 0) <= 0 && canBuyTicket(s, 'ts_popularity_fruit').ok) apply(s, { type: 'buyTicket', id: 'ts_popularity_fruit' });
  if (effectivePopularity(s, BOT_COUPLE_ID) < BOT_COUPLE_POPULARITY && canUseGuestItem(s, POPULARITY_FRUIT, BOT_COUPLE_ID).ok) apply(s, { type: 'useGuestItem', itemId: POPULARITY_FRUIT, guestId: BOT_COUPLE_ID });
  if (s.lastAnnouncement) apply(s, { type: 'dismissAnnouncement' });

  // 시설·돌담·필지
  placeDecos(s);
  for (const p of BOT_WALLS) if (!objectAt(s, p.x, p.y)) place(s, 'stonewall', p.x, p.y); // 시작 돌담이 있어도 봇 돌담(콤보 「돌담 수확」·세트 「감성 카페」)은 따로 놓는다
  repairWorn(s);
  trainOne(s);
  upgradeOne(s);
  expandMainIfCan(s); // y-indoor
  placeIndoorSeats(s);
  placeAnnex(s);
  placeForCombo(s);
  placeForSet(s);
  placeForSpot(s);
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
  planRoutes(s); // 트랙 H
  // z-ending: 돈이 넉넉하면 마을 기부(정착 등급 「기부」 항목, 누적 상한까지), 10월엔 마을제 (g82·g90)
  if (s.money >= BOT_DONATE_MIN_MONEY && s.village.donated < BOT_DONATE_CAP && canDonate(s).ok) apply(s, { type: 'donateVillage' });
  if (canHoldFestival(s).ok) apply(s, { type: 'holdFestival' });
}

/** 매일 아침 */
function dailyPlan(s: GameState): void {
  while (s.alerts.length > 0) apply(s, s.alerts[0]!.type === 'ending' ? { type: 'continueEnding' } : { type: 'dismissAlert' }); // z-ending: 엔딩은 「계속하기」
  // 게시판 부탁은 지금 할 수 있는 것(시설·메뉴 열림·아이템 있음)만 받는다 (랜드마크·손님 해금이 부탁 보상)
  if (s.clock.year >= BOT_QUEST_YEAR) for (const q of Object.values(s.board.quests)) if (Object.values(s.board.quests).filter((x) => x.status === 'active').length < BOT_QUEST_ACTIVE_MAX && q.status === 'offered' && botCanDoQuest(s, questDef(q.id)) && canAcceptQuest(s, q.id).ok) apply(s, { type: 'acceptQuest', id: q.id });
  if (s.lastChallenge) apply(s, { type: 'dismissChallenge' });
  // 도전 2슬롯은 늘 채운다 (게임이 아는 것 우선, 그다음 tier 낮은 순) — game-feel P2
  if (s.clock.year >= BOT_CHALLENGE_YEAR) for (const c of [...offeredChallenges(s)].filter((c) => c.tier <= BOT_CHALLENGE_MAX_TIER).sort((a, b) => (BOT_CHALLENGE_PREFER.indexOf(a.id) + 1 || 99) - (BOT_CHALLENGE_PREFER.indexOf(b.id) + 1 || 99) || a.tier - b.tier)) {
    if (s.challenges.active.length >= 2) break;
    if (canAcceptChallenge(s, c.id).ok) apply(s, { type: 'acceptChallenge', id: c.id });
  }
  // 보름 응모권: 15일에 한 장
  if (BOT_DRAW_TICKETS && s.clock.day === MID_MONTH_TICKET_DAY && !hasFreeDraw(s) && s.tickets >= 1 && canDrawTicket(s).ok && apply(s, { type: 'drawTicket' }).ok) apply(s, { type: 'dismissDraw' });

  if (s.money < PARTTIME_MAX_MONEY) {
    for (const st of s.staff) if (apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok) break;
  }

  // 연구 개발이 열리면 레시피 3개까지 개발 (기술 최고 직원). 첫 메뉴는 4번 칸에.
  if (botCraftOpen(s) && s.research >= DEVELOP_RESEARCH && !s.developing && s.customMenus.length < BOT_RECIPES) {
    const st = [...s.staff].sort((a, b) => b.stats.skill - a.stats.skill)[0];
    const ingredients = BOT_RECIPE_PLAN[s.customMenus.length] ?? BOT_DEVELOP_INGREDIENTS;
    if (st && !apply(s, { type: 'develop', base: 'drink', ingredients, staffId: st.id }).ok) apply(s, { type: 'develop', base: 'drink', ingredients: BOT_DEVELOP_INGREDIENTS, staffId: st.id });
  }
  // ★2부터 시그니처 1개 (★3 승급 조건) — 요리사가 맡는다
  if (botCraftOpen(s) && s.star >= 2 && s.clock.year >= BOT_SIGNATURE_YEAR && s.research >= DEVELOP_RESEARCH && !s.developing && !s.customMenus.some((m) => m.category === 'signature')) {
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
  let rows: BotRow[] = [];
  for (const r of botDays(years, seed)) rows = r;
  return rows;
}

/** 긴 실행(5·10년)용: 며칠마다 이벤트 루프에 양보해 vitest 워커 RPC(onTaskUpdate)가 굶지 않게 한다 */
export async function runBotAsync(years: number, seed: number, yieldEveryDays = 30): Promise<BotRow[]> {
  let rows: BotRow[] = [];
  let d = 0;
  for (const r of botDays(years, seed)) {
    rows = r;
    if (++d % yieldEveryDays === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return rows;
}

/** 하루씩 진행하며 지금까지의 월별 행을 낸다 (runBot·runBotAsync 공용) */
function* botDays(years: number, seed: number): Generator<BotRow[]> {
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
        ending: s.ending.score ? { total: s.ending.score.total, title: s.ending.score.title } : null,
      });
      minMoney = s.money;
      apply(s, { type: 'dismissMonthCard' });
    }
    yield rows;
  }
}
