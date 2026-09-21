import type { GameState, Cell, PlacedObject, Parcel, Terrain, CarryOver } from './types.ts';
import { INITIAL_UNLOCKED, ROLES, FACILITY_START_IDS, objectDef } from '../data/index.ts';
import { START_HOUR } from './clock.ts';
import { makeParcels } from './parcels.ts';
import { PARCEL_W, PARCEL_H, START_ORIGIN, GRID_W, GRID_H, VILLAGE_ROAD_Y } from './layout.ts';
import { initRoutes } from './entry.ts';
import { occupy, canPlaceMain, canPlace, placeObject } from './grid.ts';
import { initGuestTypes, initSegmentPopularity } from './segments.ts';
import { DEFAULT_CAFE_NAME } from './cafe.ts';
import { START_BUILDERS } from './build.ts';
import { initGuidebooks } from './guidebook.ts';
import { initRegions, initNamedGuests, initPopup } from './popup.ts';
import { initFeatures } from './goals.ts';
import { drawCandidates } from './staff.ts';
import { initChallenges, makeMonthly } from './challenges.ts';
import { initTutorial, unlockTutorialFeatures } from './tutorial.ts';
import { monthIndex } from './clock.ts';
import { emptyMonthCosts } from './economy.ts';
import { REPUTATION_START } from './reputation.ts';
import { initMain, MAIN_TYPE, MAIN_SIZE } from './rooms.ts';
import { initEnding, applyCarry } from './ending.ts'; // z-ending
import { initVillage } from './village.ts'; // z-ending

export { PARCEL_W, PARCEL_H, START_ORIGIN, GRID_W, GRID_H, VILLAGE_ROAD_Y };
export const SAVE_VERSION = 19; // 19: z 통합 — 엔딩·마을·이월·튜토리얼 30단계 seen (마이그레이션 없음). 18: y 통합 — 되돌리기(undo)·개체 이름(name)·유입 경로(routes·손님 route/foreign)·본관(main·객체 w/h/mode/careDay) (마이그레이션 없음, 17 세이브는 백업 후 새 게임). 17: 컨텐츠 확장 통합 — 경제(삼춘 대출·세금·대기열·★ 유지 심사)·시설 44·증축·청결·명소 방문객·투어·선물·직원 8직종·입지·목표 108·도전·튜토리얼 (마이그레이션 없음). 15: v3 대격변. 14: 라이벌 카페
/** 시작 자금 500만. 정착지원금은 삼춘 대출(failure.ts: 잔고 < 40만 → 300만, 최대 3회)로 바뀌었다 — 확장 스펙 §4.2 #8 */
export const START_MONEY = 5_000_000;
export const START_MONTH = 3;
export const MENU_SLOT_COUNT = 4;
/** 시작 메뉴판 (§5: 아메리카노·카페라떼·감귤주스가 이미 올라가 있다) */
export const START_MENUS = ['americano', 'latte', 'tangerine_juice'];
/** 시작 직원 후보 수 (§5: 후보 2명 대기) */
export const START_CANDIDATES = 2;
/** 첫 손님이 게임 1시간 안에 오도록 스폰 누적을 미리 채워 둔다 (7시 첫 스폰) */
export const START_SPAWN_ACC = 0.6;
/** 옛 감귤밭의 감귤나무 위치 (필지 상대) */
const ORCHARD_TREES = [{ lx: 2, ly: 2 }, { lx: 6, ly: 2 }, { lx: 2, ly: 5 }, { lx: 6, ly: 5 }];
/** 완성 시작 상태의 본관 자리 (필지 상대, 3×2): 문 = 정면 왼쪽 (3,2), 그 앞 (3,3)이 창고 앞 (layout.ts WAREHOUSE_FRONT) */
export const START_MAIN = { lx: 3, ly: 1 } as const;
/** 시작 필지 안 시작 시설 (필지 상대): 본관 문 앞(3,3)에서 정낭(4,6)까지 올렛길, 그 양옆에 테이블 2 + 파라솔 1,
 *  본관 안 실내 테이블 2 (fix-indoor: 그림으로 박혀 있던 가구 대신 정식 배치 — 뒷벽 카운터 칸(4,1)·(5,1)을 피해 문 옆 (3,1)과 (5,2)) */
export const START_PATH: { lx: number; ly: number }[] = [{ lx: 3, ly: 3 }, { lx: 4, ly: 3 }, { lx: 4, ly: 4 }, { lx: 4, ly: 5 }];
export const START_SEATS: { type: string; lx: number; ly: number }[] = [
  { type: 'table_out', lx: 3, ly: 4 }, { type: 'table_out', lx: 5, ly: 4 }, { type: 'table_parasol', lx: 5, ly: 5 },
  { type: 'table_in', lx: 3, ly: 1 }, { type: 'table_in', lx: 5, ly: 2 },
];

/** 필지 안 상대 좌표 (lx, ly)의 지형. */
function terrainFor(p: Parcel, lx: number, ly: number): Terrain {
  const y = p.y + ly;
  // 마을 길(가운데 줄 아래 변)은 맵 가로 전체 도로. 해안은 먼 변 2줄이 해안 도로. 마을 어귀는 오른쪽 변이 마을로 나가는 길.
  if (y === VILLAGE_ROAD_Y) return 'road';
  if (p.bonus === 'coast' && ly >= p.h - 2) return 'road';
  if (p.bonus === 'village' && lx === p.w - 1) return 'road';
  // ease: 바위·큰 바위 지형은 없앴다 — 마을 길 밖은 전부 흙. 확장 장벽은 필지 경계뿐.
  return 'soil';
}

function makeCells(parcels: Parcel[]): Cell[] {
  const cells: Cell[] = Array.from({ length: GRID_W * GRID_H }, () => ({ terrain: 'soil' as Terrain, objectId: null, roomId: null }));
  for (const p of parcels)
    for (let ly = 0; ly < p.h; ly++)
      for (let lx = 0; lx < p.w; lx++) cells[(p.y + ly) * GRID_W + (p.x + lx)] = { terrain: terrainFor(p, lx, ly), objectId: null, roomId: null };
  return cells;
}

/** 시작 오브젝트를 격자에 직접 새긴다 (규칙 검사 없이). 이미 뭔가 있으면 건너뛰고 null. */
function stamp(state: GameState, type: string, x: number, y: number): PlacedObject | null {
  const def = objectDef(type);
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) if (state.grid.cells[(y + dy) * state.grid.w + (x + dx)]!.objectId) return null;
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, placedMonth: monthIndex(state.clock) };
  state.objects[id] = obj;
  occupy(state, obj);
  return obj;
}

/** 필지별 시작 오브젝트: 밭담 돌담, 용천수 샘 (ease: 곶자왈 덤불은 없앴다). */
function stampParcelObjects(state: GameState, p: Parcel): void {
  const soil = (lx: number, ly: number) => state.grid.cells[(p.y + ly) * state.grid.w + (p.x + lx)]!.terrain === 'soil';
  switch (p.bonus) {
    case 'batdam':
      // 가로 돌담 두 줄 (밭담 골짜기)
      for (const [ly, xs] of [[2, [1, 2, 3, 4, 6, 7, 8]], [5, [1, 2, 3, 5, 6, 7, 8]]] as const)
        for (const lx of xs) if (soil(lx, ly)) stamp(state, 'stonewall', p.x + lx, p.y + ly);
      break;
    case 'stonehill':
      // 언덕을 따라 비스듬한 돌담 한 줄
      for (let lx = 1; lx <= 8; lx++) if (lx !== 4 && lx !== 5) stamp(state, 'stonewall', p.x + lx, p.y + 3);
      break;
    case 'orchard':
      // 옛 감귤밭: 감귤나무 4그루 (사면 다음 달 1일부터 감귤이 들어온다)
      for (const t of ORCHARD_TREES) if (soil(t.lx, t.ly)) stamp(state, 'tangerine_tree', p.x + t.lx, p.y + t.ly);
      break;
    case 'spring':
      stamp(state, 'spring', p.x + 4, p.y + 3);
      break;
  }
}

/** 시작 배치: 'starter' = v3 완성 시작 상태(본관·올렛길·테이블 2·파라솔·메뉴 3종, 튜토리얼 끝남 — 봇·테스트 기본), 'tutorial' = §7.1 맨땅(본관도 없다 — 길·좌석·메뉴 없음, 손으로 하는 튜토리얼이 본관 짓기부터) */
export type StartLayout = 'starter' | 'tutorial';

/** 완성 시작 상태의 본관을 새긴다 (w-start: 맨땅 튜토리얼은 플레이어가 placeMain으로 직접 짓는다). 이미 본관이 있으면 그대로.
 *  기본 자리(3,1)가 막혀 있으면(둘러보기 중에 뭔가 놓았을 때) 시작 필지 안에서 놓을 수 있는 첫 자리를 찾는다. */
function stampMain(state: GameState): void {
  if (Object.values(state.objects).some((o) => o.type === MAIN_TYPE)) return;
  const { x: ox, y: oy } = START_ORIGIN;
  if (stamp(state, MAIN_TYPE, ox + START_MAIN.lx, oy + START_MAIN.ly)) return;
  const size = MAIN_SIZE[1]!;
  for (let ly = 0; ly < PARCEL_H; ly++) for (let lx = 0; lx < PARCEL_W; lx++) {
    if (canPlaceMain(state, ox + lx, oy + ly, size.w, size.h).ok && stamp(state, MAIN_TYPE, ox + lx, oy + ly)) return;
  }
}

/** §7.2 건너뛰기: 맨땅에 기존 완성 시작 상태(본관·올렛길·테이블 2·파라솔·실내 테이블 2·메뉴 3종)를 채운다. 이미 있는 칸은 건너뛴다.
 *  indoor=false면 본관 안은 비워 둔다 (장 건너뛰기 — 튜토리얼 24단계에서 실내 테이블을 처음 놓는다). */
export function fillStarterLayout(state: GameState, indoor = true): void {
  const { x: ox, y: oy } = START_ORIGIN;
  stampMain(state);
  for (const c of START_PATH) stamp(state, 'path', ox + c.lx, oy + c.ly);
  for (const st of START_SEATS) {
    if (objectDef(st.type).indoor) { if (indoor && canPlace(state, st.type, ox + st.lx, oy + st.ly).ok) placeObject(state, st.type, ox + st.lx, oy + st.ly); } // 실내 가구는 방 바닥 위에 정식 배치 (고정 설비·통로 검사)
    else stamp(state, st.type, ox + st.lx, oy + st.ly);
  }
  for (const m of START_MENUS) {
    if (state.menuSlots.includes(m)) continue;
    const slot = state.menuSlots.indexOf(null);
    if (slot >= 0) state.menuSlots[slot] = m;
  }
}

/** carry: 엔딩 뒤 「이월해서 새로 시작」 묶음 (ending.ts makeCarry). 시작 상태를 다 만든 뒤 applyCarry로 얹는다. */
export function createInitialState(seed: number, playerId = 'local', createdAt = 0, layout: StartLayout = 'starter', carry: CarryOver | null = null): GameState {
  const parcels = makeParcels();
  const state: GameState = {
    version: SAVE_VERSION,
    playerId,
    createdAt,
    seed,
    rng: seed,
    clock: { day: 1, month: START_MONTH, year: 1, hour: START_HOUR, accMs: 0, carryMs: 0, speed: 1 },
    money: START_MONEY,
    research: 0,
    popularity: 0,
    grid: { w: GRID_W, h: GRID_H, cells: makeCells(parcels) },
    parcels,
    loan: { count: 0, balance: 0, lastMonthIndex: -1 },
    deficitMonths: 0,
    crisisMonths: 0,
    yearNet: 0,
    lastYearNet: 0,
    salaryRaisePct: 0,
    waiting: [],
    monthGuestsLeft: 0,
    monthLoan: 0,
    starReview: { promotedYear: 1, lastReviewYear: 0, warned: false },
    reputation: REPUTATION_START,
    complaints: [],
    reviews: [],
    monthComplaints: {},
    monthReputationDelta: 0,
    dayStats: { satisfied: 0, complained: 0, total: 0 },
    reputationWarned: false,
    lastApologyMonthIndex: -1,
    objects: {},
    storage: {},
    menuSlots: Array(MENU_SLOT_COUNT).fill(null),
    unlocked: {
      objects: [...new Set([...INITIAL_UNLOCKED.objects, ...FACILITY_START_IDS])],
      menus: [...INITIAL_UNLOCKED.menus],
      roles: ROLES.filter((r) => r.unlockedAtStart).map((r) => r.id),
    },
    goals: { index: 0, claimed: [] },
    features: initFeatures(),
    stats: { satisfiedTotal: 0, promotionsDone: 0, recipesMade: 0, rivalWins: 0, profitMonths: 0, lossMonths: 0, guidebookWins: 0, itemsUsed: 0, trainings: 0, toursHeld: 0, seenMonth: -1, seenAnnouncement: -1 },
    challenges: initChallenges(),
    monthly: null,
    tutorial: initTutorial(layout === 'starter'),
    titles: [],
    feeBonusPct: 0,
    alerts: [],
    events: [],
    eventsFired: {},
    weeklyEventDay: 0,
    monthHarvest: { harvested: {}, ingredientSaved: 0 },
    staff: [],
    candidates: [],
    slots: { barista: 1, cook: 1, hall: 2, carry: 0, guide: 0, clean: 2, garden: 2, promo: 1 },
    activePromotions: [],
    youtuberBoostMonths: 0,
    segmentPopularity: initSegmentPopularity(),
    targetSegment: null,
    targets: [],
    undo: null,
    guestTypes: initGuestTypes(),
    visitBonus: {},
    tickets: 0,
    mileage: 0,
    rank: 1,
    star: 1,
    totalGuests: 0,
    builders: START_BUILDERS,
    uniform: null,
    uniforms: [],
    uniformPieces: 0,
    freeDrawMonth: START_MONTH - 1, // 첫 달(monthIndex) 무료 추첨 1회
    lastDraw: null,
    freeRecruits: 0,
    codexMileage: 0,
    guidebooks: initGuidebooks(),
    lastAnnouncement: null,
    board: { quests: {}, events: [] },
    spots: {},
    spotVisitors: {},
    spotPrizes: {},
    goldenTangerineGiven: false,
    tourBus: false,
    tourBusFreeMonths: 0,
    tourMonth: -1,
    lastTour: null,
    giftDay: -1,
    effects: [],
    menuSold: {},
    monthMenuSold: {},
    codex: { combos: [], sets: [], recipes: [], ingredientCombos: [], spots: [] },
    clean: { value: 100, lastGuests: 0, history: [] },
    customMenus: [],
    menuMods: {},
    developing: null,
    lastDevelop: null,
    inventory: {},
    itemBonus: {},
    notices: [],
    fx: [],
    cafeName: DEFAULT_CAFE_NAME,
    totalIncome: 0,
    expansions: [],
    cosmetics: { wallColor: 0, sign: '' },
    praised: {},
    regions: initRegions(),
    namedGuests: initNamedGuests(),
    popup: initPopup(),
    rivals: [],
    lastChallenge: null,
    main: initMain(),
    guests: [],
    routes: initRoutes(), // 트랙 H 손님 유입 경로 5종
    ending: initEnding(), // z-ending
    village: initVillage(), // z-ending
    carry: null,
    spawnAcc: START_SPAWN_ACC,
    researchAcc: 0,
    nextId: 1,
    monthIncome: 0,
    monthGuests: 0,
    monthCosts: emptyMonthCosts(),
    lastMonthIncome: 0,
    lastMonthCard: null,
    tick: 0,
    actionLog: [],
  };
  // 시작 필지(1번, 정중앙): 정류장은 필지 아래 변의 마을 길에 (첫날부터 손님이 온다)
  const { x: ox, y: oy } = START_ORIGIN;
  stamp(state, 'busstop', ox, oy + PARCEL_H - 1);
  stamp(state, 'gate', ox + 4, oy + PARCEL_H - 2); // 정낭 칸은 gate kind라 걷기 가능(path.ts)
  // §5 완성 시작 상태(본관 + 올렛길 + 테이블 2 + 파라솔 1 + 메뉴 3종)는 'starter'일 때만. 'tutorial'(§7.1·w-start)은 맨땅 — 본관은 튜토리얼 2단계에서 직접 짓고(placeMain), 손님은 본관·좌석·길·메뉴가 갖춰질 때까지 안 온다(canOpen).
  if (layout === 'starter') { fillStarterLayout(state); unlockTutorialFeatures(state); }
  for (const p of parcels) stampParcelObjects(state, p);
  // §5 직원 후보 2명 대기 (전단 등급)
  drawCandidates(state, 'flyer', START_CANDIDATES);
  state.monthly = makeMonthly(state); // 이달의 과제 (§7.3) — 시작 달 것은 알림 없이
  if (carry) applyCarry(state, carry); // z-ending 이월 6종
  return state;
}
