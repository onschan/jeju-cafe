/** rock_big = 오름 능선의 큰 바위 (치우는 데 100만) */
export type Terrain = 'soil' | 'rock' | 'rock_big' | 'road';
export type ObjectKind = 'tree' | 'seat' | 'wall' | 'path' | 'building' | 'deco' | 'busstop' | 'gate' | 'landmark' | 'facility';
/** 필지 구역 보너스 종류 (§18) */
export type ParcelBonus = 'none' | 'oreum' | 'gotjawal' | 'batdam' | 'coast' | 'spring' | 'village' | 'stonehill' | 'orchard';
/** signature = 시그니처 베이스로 개발한 메뉴 (누구나 주문한다) */
export type MenuCategory = 'drink' | 'dessert' | 'meal' | 'signature';
export type Mood = 'happy' | 'meh' | 'angry';
/** visiting = 자리에서 일어나 시설(포토존·기념품·자판기…)로 가는 중/이용 중 */
export type GuestPhase = 'walking' | 'seated' | 'visiting' | 'leaving';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// ---------- 데이터 정의 (JSON) ----------
export interface ObjectDef {
  id: string;
  name: string;
  kind: ObjectKind;
  w: number;
  h: number;
  cost: number;
  scenery: number;
  noise: number;
  wind: number;
  upkeep: number;      // 월 유지비
  seats?: number;      // kind === 'seat'
  yield?: FarmYield;   // 농원 시설: 매월 1일 창고에 들어오는 재료 (설치한 달 제외)
  terrain: Terrain[];  // 놓을 수 있는 지형
  removeCost?: number; // 치울 때 환불 대신 드는 돈 (곶자왈 덤불처럼 처음부터 있던 것)
  effectText?: string; // 랜드마크 효과 설명 (데이터만, 효과는 TODO)
  popularity?: number; // 기본 인기 (없으면 BASE_POPULARITY 10)
  feePct?: number;     // 기본 요금 % (없으면 100)
  desc?: string;       // 정보 패널 설명 (없으면 이름)
  seasonScenery?: Partial<Record<Season, number>>; // 계절 경치 보너스 (없으면 SEASON_SCENERY 표)
  room?: true;         // 실내 바닥이 있는 건물: 발자국 칸 위에 indoor 오브젝트를 놓고 손님이 걸어 들어간다 (문 = 정면 왼쪽 칸)
  indoor?: true;       // 실내 전용 오브젝트: room 발자국 칸 위에만 놓는다
  fee?: number;        // 시설 이용료 (손님이 순회하며 낸다)
  unlock?: UnlockCond; // v2 시설 해금 조건 (없으면 해금 트리·시작 목록으로만 열린다)
  unlockText?: string; // 해금 조건 표시 문구 (짓기 탭에서 잠긴 카드에 보여준다)
  category?: FacilityCategory; // v2 시설 분류 (가이드북 해금·심사용)
  buildDays?: number;  // 건설 기간(일). 없거나 0이면 즉시 완공. v2 시설: 소 1·중 3·대 7
}
/** v2 시설 분류 */
export type FacilityCategory = 'rest' | 'convenience' | 'food' | 'fun' | 'farm' | 'scenery' | 'landmark';

/** 농원 시설의 월 수확 (v3 §3: 감귤나무 감귤 6/월, 당근밭 당근 8/월, 녹차밭 녹차 4/월) */
export interface FarmYield { ingredientId: string; perMonth: number }

/** 메뉴·재료 스탯 6종 (스펙 §15.1: 맛/향/보기/건강/양/제주다움) */
export interface MenuStats { taste: number; aroma: number; look: number; health: number; volume: number; jeju: number }
export type MenuStatKey = keyof MenuStats;
export type MenuQuality = '보통' | '좋음' | '최고';
export interface MenuDef {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  ingredients: Record<string, number>; // ingredientId → 개수
  requires?: { role?: RoleId; skill?: string }; // 배치된 직원(기력>0)이 조건을 만족해야 만들 수 있다
  stats: MenuStats;                    // 재료 스탯 합 (+ 개발 보너스). 토핑·스킬 효과는 menuStatsOf가 얹는다
  skills?: Record<string, number>;     // 콤보로 얻은 메뉴 스킬 (토핑 스킬은 menuSkills가 더한다)
  costPct?: number;                    // 콤보 "연하게" 재료비 −20% 같은 원가 보정
  quality?: MenuQuality;
  hiddenId?: string;                   // 히든 레시피로 만들어졌으면 그 id
}

// ---------- 메뉴 크래프팅 (2B-2 Task 5) ----------
export type MenuBase = 'drink' | 'dessert' | 'meal' | 'signature';
/** 재료 분류 (§6.1) */
export type IngredientCategory = 'coffee' | 'dairy' | 'sweet' | 'grain' | 'protein' | 'tea' | 'fruit' | 'water' | 'spice' | 'vegetable' | 'nut' | 'seafood';
export interface IngredientComboSide { category: IngredientCategory | 'any' | 'jeju'; ingredient?: string; minJeju?: number }
export interface IngredientComboDef {
  id: string;
  name: string;
  a: IngredientComboSide;
  b: IngredientComboSide;
  pairText: string;
  bonus: Partial<MenuStats> & { costPct?: number; summerPopularity?: number; winterPopularity?: number };
  bonusText: string;
}
export interface ToppingDef { id: string; name: string; cost: number; stats: Partial<MenuStats>; skills: { name: string; level: number }[]; skillText: string }
export interface HiddenRecipeDef { id: string; name: string; ingredients: string[] }
/** 로스팅·추출 파라미터. 축마다 0/1/2 (기본 1). 음료: grind·temp·time, 디저트: temp·time, 식사: heat·time */
export interface BrewParams { grind?: number; temp?: number; time?: number; heat?: number }
export type ParamAxis = keyof BrewParams;
export interface Developing { base: MenuBase; ingredients: string[]; params: BrewParams; staffId: string; startDay: number; doneDay: number }
export type DevelopOutcome = 'success' | 'great' | 'fail';
export interface DevelopResult {
  outcome: DevelopOutcome;
  menuId: string | null;   // 실패면 null
  name: string;
  base: MenuBase;
  stats: MenuStats;
  quality: MenuQuality | null;
  hidden: boolean;
  combos: string[];        // 발동한 재료 콤보 id
}
/** 메뉴판의 메뉴에 붙는 가변 상태: 토핑(최대 3)·레벨 */
export interface MenuMod { toppings: string[]; level: number }

/** 인구 태그 (마스터 GDD §1): 콤보·세트의 대상 손님층은 이 태그로 판정한다 */
export type Gender = 'female' | 'male' | 'any';
export type AgeTag = 'youth' | 'adult' | 'senior' | 'none'; // none = 동물·정령 (연령 대상 콤보에 안 걸린다)
export interface GuestTags { gender: Gender; age: AgeTag; group: boolean }

/** 손님 효과 6종 (마스터 GDD §3): 만족 방문마다 발동 */
export type GuestEffect = 'item' | 'money' | 'ad' | 'research' | 'popularity' | 'ticket';
/** 손님이 바라는 것 (v2 표의 likes 코드) — 만족 판정·UI 표시용 */
export type GuestWant = 'rest' | 'food' | 'fun' | 'scenery' | 'convenience' | 'farm';
/** 손님·관광지 해금 조건 (8형) */
export type UnlockCond =
  | { type: 'start' }
  | { type: 'rank'; rank: number }
  | { type: 'star'; star: number }
  | { type: 'segment'; guestId: string; satisfaction: number }
  | { type: 'quest'; questId: string }
  | { type: 'spot'; spotId: string; level: number }
  | { type: 'date'; year: number; month: number }
  | { type: 'count'; objectId: string; count: number }
  | { type: 'category'; category: FacilityCategory; count: number }   // 분류별 시설 개수 (가이드북)
  | { type: 'segmentPop'; guestId: string; popularity: number }        // 손님층 인기 (가이드북)
  | { type: 'goal' }                                                   // 목표 보상으로만 열린다 (v3, goals.ts goalForFacility)
  | { type: 'all'; conditions: UnlockCond[] };

export interface GuestTypeDef {
  id: string;
  name: string;
  likes: MenuCategory[];   // 주문할 수 있는 메뉴 분류 (v2 wants에서 유도)
  likesStats: MenuStatKey[]; // 취향 스탯 (v2 likes에서 유도): 메뉴 스탯이 기준 이상이면 만족 보너스·호감도 ×2
  minScenery: number;
  popularityShift: number; // happy일 때 게이지 이동 (−: 동네, +: 인기)
  weight: number;          // 스폰 가중치
  tags: GuestTags;
  effect: GuestEffect;
  wallet: number;          // 예산 상한 (이보다 비싼 메뉴는 주문 안 함). 0 = 주문 안 함(동물·정령)
  wants: GuestWant[];      // v2 likes 코드
  unlock: UnlockCond;
  questId: string | null;
  nextGuest: string | null;
  chain: string | null;
  line: string;            // 대표 대사 (부탁 카드)
}
/** 손님 타입별 진행 상태. 인기는 state.segmentPopularity(홍보와 공유)에 있다. */
export type RegularTier = 'none' | 'regular' | 'vip';
export interface GuestTypeState { unlocked: boolean; satisfaction: number; regular: RegularTier; questDone: boolean }

// ---------- 게시판: 부탁·이벤트·관광지 (2B-2 Task 4) ----------
export type QuestCondition =
  | { type: 'menuSold'; params: { menuId: string; count: number } }
  | { type: 'objectPlaced'; params: { objectId: string; count: number } }
  | { type: 'spotLevel'; params: { spotId: string; level: number } }
  | { type: 'segmentPopularity'; params: { guestId: string; popularity: number } }
  | { type: 'item'; params: { itemId: string; count: number } }
  | { type: 'none'; params: Record<string, never> };
export type QuestReward =
  | { type: 'money' | 'research' | 'ticket' | 'mileage' | 'ad'; amount: number }
  | { type: 'item'; itemId: string };
export interface QuestDef {
  id: string;
  guestId: string;
  description: string;
  condition: QuestCondition;
  rewards: QuestReward[];
  rewardText: string;
  unlockGuestId: string | null;
}
export type QuestStatus = 'offered' | 'active' | 'done' | 'failed';
export interface QuestState { id: string; status: QuestStatus; offeredMonthIndex: number; deadlineMonthIndex: number | null; progress: number }

export type EventFilter = 'all' | 'group' | 'female' | 'male' | 'youth' | 'adult' | 'senior' | 'local' | 'tourist' | 'family' | { guestId: string };
/** 이벤트 효과 DSL (data/event_effects.ts가 effectText를 이걸로 옮긴다) */
export type EventEffect =
  | { kind: 'money'; amount: number }
  | { kind: 'research'; amount: number }
  | { kind: 'mileage'; amount: number }
  | { kind: 'tickets'; amount: number }
  | { kind: 'spawnMult'; mult: number; days: number; filter?: EventFilter }
  | { kind: 'harvestMult'; mult: number; days: number }
  | { kind: 'upkeepMult'; mult: number; days: number }
  | { kind: 'noGuests'; days: number }
  | { kind: 'popularity'; delta: number; filter?: EventFilter }
  | { kind: 'grantItem'; itemId: string; n: number }
  | { kind: 'unlockObject'; objectId: string }
  | { kind: 'notice'; text: string };
export interface EventDef {
  id: string;
  name: string;
  months: number[];        // 굴릴 수 있는 달 (빈 배열 = 월 롤 대상 아님: 버튼·매주 등)
  prob: number;            // 0~100 (%)
  conditionText: string | null;
  effectText: string;
  line: string;
  choice: boolean;         // 수락/거절 있는 이벤트
  effects: EventEffect[];  // choice면 수락 시
  declineEffects: EventEffect[];
}
export type EventStatus = 'pending' | 'accepted' | 'declined' | 'applied';
export interface EventState { id: string; monthIndex: number; status: EventStatus }
/** 진행 중인 이벤트 효과. untilDay = 절대 일 인덱스(포함 안 함). */
export interface ActiveEffect { kind: 'spawnMult' | 'harvestMult' | 'upkeepMult' | 'noGuests'; mult: number; filter?: EventFilter; untilDay: number; source: string }

export type SpotCategory = 'sight' | 'food' | 'play' | 'nature';
export interface SpotDef {
  id: string;
  name: string;
  category: SpotCategory;
  categoryName: string;
  order: number;
  levels: { level: number; cost: number; appeal: number }[];
  lv2GuestId: string | null;
  lv4QuestId: string | null;
  nextSpotId: string | null;
  unlock: UnlockCond;
}
export interface BoardState { quests: Record<string, QuestState>; events: EventState[] }

// ---------- 상성·세트·아이템 (2B-2) ----------
/** 콤보·세트의 대상 손님층 (v2 표의 target) */
export type ComboTarget = 'all' | 'female' | 'male' | 'youth' | 'adult' | 'senior' | 'group';
/** ↑ = 인기 +3 요금 +5%, ↑↑ = +6/+10%, ↓ = −3/−5%, none = 특수 효과만(수확 +20% 등, 표시만) */
export type ComboStrength = 'up' | 'upup' | 'down' | 'none';
export type ComboSide = 'a' | 'b' | 'both';
export interface ComboDef {
  id: string;
  name: string;
  a: string;          // 시설 A 오브젝트 id
  bIds: string[];     // 시설 B 후보 (하나라도 있으면). 'table_*'처럼 끝이 *면 접두 일치
  bCount: number;     // 반경 안에 있어야 하는 B 개수
  target: ComboTarget;
  strength: ComboStrength;
  applyTo: ComboSide; // 보너스를 받는 쪽
  hidden: boolean;
  radius: number;     // 체비쇼프 (기본 2)
  effectText: string;
}
export interface SetDef {
  id: string;
  name: string;
  requires: { objectId: string; count: number }[];
  target: ComboTarget;
  radius: number;         // 기본 3
  levelMult: number[];    // 레벨 1..n 인기 배수
  effectText?: string;
}
/** 아이템이 잘 맞는 시설 분류 (v1 표의 열) */
export type ItemSlot = 'seat' | 'facility' | 'farm' | 'env';
export interface ItemDef {
  id: string;
  name: string;
  stat: 'popularity' | 'feePct' | 'scenery';
  value: number;                            // 기본 효과. 잘 맞는 시설이면 ×2
  fitIds: string[];                         // 잘 맞는 시설 id (v2)
  fitSlots?: Partial<Record<ItemSlot, number>>; // 시설 분류별 0~3 (v1). 0이면 못 씀, 3이면 ×2
  sourceText: string;
}
export interface ActiveCombo {
  id: string;
  name: string;
  strength: ComboStrength;
  side: 'a' | 'b';
  hidden: boolean;
  target: ComboTarget;
  effectText: string;
}
export interface ActiveSet { id: string; name: string; level: number; target: ComboTarget; mult: number }
export interface ObjectStats {
  popularity: number;
  feePct: number;
  scenery: number; // 자기 경치 + 계절 보너스 (상한 30)
  noise: number;
  upkeep: number;
  combos: ActiveCombo[];
  sets: ActiveSet[];
  segmentBonus: Record<string, number>; // 손님층 id → 콤보 대상 가산 인기
}
export interface ItemBonus { popularity: number; feePct: number; scenery?: number }

// ---------- 재료·직원·홍보 (2B-1) ----------
/** farm = 농원 시설에서 매월 들어오는 재료 (창고에 없으면 bought처럼 자동 구매한다) */
export type IngredientKind = 'bought' | 'farm';
/** cost: 창고에 없을 때 자동 구매 원가. stats·category는 v1 표(§6.1)에서. */
export interface IngredientDef { id: string; name: string; kind: IngredientKind; cost: number; category: IngredientCategory; stats: MenuStats; sourceText: string }

export type RoleId = 'barista' | 'cook' | 'hall' | 'carry' | 'guide';
/** 직원 스탯 4 (GDD v2 §5): 체력 stamina · 힘 strength(운반) · 기술 skill(바리스타·요리) · 미소 smile(홀·안내) */
export type StatKey = 'stamina' | 'strength' | 'skill' | 'smile';
export interface RoleDef { id: RoleId; name: string; stat: StatKey; unlockedAtStart: boolean }

export type SkillEffect =
  | { type: 'menuQuality'; category: MenuCategory; value: number }
  | { type: 'speed'; value: number }
  | { type: 'localAffinity'; value: number }
  | { type: 'touristSatisfaction'; value: number }
  | { type: 'language' }
  | { type: 'ingredientDiscount'; value: number }
  | { type: 'researchBonus'; value: number }
  | { type: 'spawnBonus'; value: number }
  | { type: 'luck'; value: number }
  | { type: 'stamina'; value: number };
export interface SkillDef { id: string; name: string; desc: string; effect: SkillEffect }

export interface Stats { stamina: number; strength: number; skill: number; smile: number }
export interface Face { hair: number; skin: number; top: number } // 파츠 인덱스

export interface Staff {
  id: string;
  name: string;
  face: Face;
  stats: Stats;
  skill: string;
  level: number;
  salary: number;
  role: RoleId | null;
  unpaidMonths: number;
  energy: number; // 0~100
  lastParttimeMonthIndex: number; // 아르바이트는 직원당 한 달에 한 번 (−1 = 아직)
  x: number;
  y: number;
  path: Pt[];
  anchor: Pt | null; // 렌더·이동용
  waitMs: number;    // 다음 산책까지 대기
}
export interface Candidate extends Omit<Staff, 'role' | 'unpaidMonths' | 'energy' | 'lastParttimeMonthIndex' | 'x' | 'y' | 'path' | 'anchor' | 'waitMs'> {
  expiresMonthIndex: number;
}

export type JobTier = 'flyer' | 'site' | 'headhunter';

/** 홍보 활동 정의 (ads.json 대신 — 2B-1 v2) */
export interface PromotionDef {
  id: string;
  name: string;
  costResearch: number;
  costMoney: number;
  energy: number;
  months: number; // 0 = 즉시 1회성, N>0 = 기간형
  segmentDelta: Record<string, number>; // guestType id → 인기 가산
  allDelta?: number;
  popularityShift?: number; // 동네↔인기 게이지 이동 (SNS)
  special?: 'youtuber' | 'parttime';
}
/** delta는 시작 시점의 타깃 배수를 구워 둔 값 (guestType id → 인기 가산). 나중에 타깃을 바꿔도 변하지 않는다. */
export interface ActivePromotion { promotionId: string; remainingMonths: number; delta: Record<string, number> }

// ---------- 게임 상태 ----------
export interface Pt { x: number; y: number }

/** 월 비용 항목. recruit = 공고비 + 퇴직금 */
export interface MonthCosts { ingredients: number; salary: number; ads: number; upkeep: number; recruit: number }
/** 농원: harvested = 이달 1일 창고에 들어온 재료, ingredientSaved = 창고 재료를 써서 안 산 재료비 */
export interface MonthHarvest { harvested: Record<string, number>; ingredientSaved: number }
/** 월말 정산 카드 */
export interface MonthCard {
  income: number;
  guests: number;
  month: number;
  year: number;
  costs: MonthCosts;
  net: number;
  harvested: Record<string, number>; // 그달 1일 농원에서 들어온 재료 (ingredientId → 개수)
  ingredientSaved: number;           // 그달 창고 재료 덕에 안 산 재료비
  topMenu: string | null;            // 그달 최다 판매 메뉴 id
}

// ---------- 목표 체인 (v3 §2 → 확장 §3.5·§7) ----------
/** 목표·도전 조건. 판정은 goals.ts의 conditionCheckers 레지스트리 (타입 → { cur, max }). 아직 없는 시스템은 스텁. */
export type GoalCondition =
  | { type: 'guests'; n: number }                 // 누적 손님
  | { type: 'menuSold'; menuId: string; n: number }
  | { type: 'money'; n: number }
  | { type: 'staff'; n: number }
  | { type: 'facilities'; n: number; category?: FacilityCategory }
  | { type: 'satisfied'; n: number }              // 누적 만족 손님
  | { type: 'parcels'; n: number }                // 소유 필지 수 (시작 필지 포함)
  | { type: 'rank'; n: number }                   // 가이드북 순위 ≤ n (best)
  | { type: 'cafeRank'; n: number }               // 카페 랭크 ≥ n
  | { type: 'stars'; n: number }
  | { type: 'regular'; n: number }                // 단골★ 수
  | { type: 'research'; n: number }               // 보유 연구 포인트
  | { type: 'namedGuest'; n: number }             // 만난 이름 있는 손님 수
  | { type: 'rocks'; n: number }                  // 치운 바위·덤불
  | { type: 'menus'; n: number }                  // 메뉴판에 올린 메뉴 수
  | { type: 'recipes'; n: number }                // 개발한 레시피
  | { type: 'promotions'; n: number }             // 홍보 실행 횟수
  | { type: 'rivalWins'; n: number }              // 카페 대결 승리
  | { type: 'year'; n: number }                   // n년차
  // ---- §3.5 신설 14 ----
  | { type: 'monthIncome'; n: number }            // 지난달 매출
  | { type: 'staffLevel'; lv: number; n: number } // Lv 이상 직원 n명
  | { type: 'trainings'; n: number }              // 연수 완료 횟수 (x-staff)
  | { type: 'facilityLv'; lv: number; n: number } // Lv 이상 시설 n개 (x-facility)
  | { type: 'comboCount'; n: number }             // 활성 콤보 수
  | { type: 'setCount'; n: number }               // 활성 세트 수
  | { type: 'spotEffect'; n: number }             // 명당 수 (x-facility)
  | { type: 'spotLevel'; spotId: string; lv: number } // 특정 명소 Lv
  | { type: 'spotAny'; lv: number; n: number }    // Lv 이상 명소 n곳
  | { type: 'visitorsTotal'; n: number }          // 전 명소 누적 방문객 (x-spots)
  | { type: 'guestType'; guestId: string; n: number } // 손님 타입 인기 ≥ n
  | { type: 'guidebookRank'; bookId: string; n: number } // 특정 가이드북 n위 안
  | { type: 'guidebookWins'; n: number }          // 가이드북 1위 횟수
  | { type: 'cleanliness'; n: number }            // 청결 n 이상 한 달 (x-facility)
  | { type: 'profitMonths'; n: number }           // 연속 흑자 달
  | { type: 'tourGroup'; n: number }              // 투어 개최 (x-spots)
  | { type: 'itemsUsed'; n: number }              // 강화 아이템 사용
  | { type: 'uniforms'; n: number }               // 유니폼 단계
  | { type: 'custom'; id: string; n?: number }    // 코드 판정 (centennial 등)
  // ---- §7.5 전략 조건 ----
  | { type: 'siteSeats'; view: number; n: number } // 전망 view 이상 좌석 n개 (x-site)
  | { type: 'windlessSeats'; n: number }          // 바람 0 좌석 n개 (x-site)
  | { type: 'combos'; n: number }                 // 도감에 발견한 콤보 수
  | { type: 'spotEffects'; n: number }            // 명당 효과 수 (x-facility)
  | { type: 'upgraded'; lv: number; n: number }   // 증축 Lv 이상 시설 n개 (x-facility)
  | { type: 'clean'; avg: number; days: number }  // 청결 avg 이상 days일 (x-facility)
  | { type: 'skills'; n: number }                 // 특기 보유 직원 n명
  | { type: 'selfSupply'; pct: number }           // 재료 자급률 % (x-spots/farm)
  | { type: 'training'; n: number }               // 연수 완료 (x-staff, trainings 별칭)
  // ---- 도전·월간 과제 전용 ----
  | { type: 'seats'; n: number }                  // 좌석 시설 수
  | { type: 'noLossMonth'; n: number }            // 적자 없이 n달 (연속 흑자, 수락 시점 대비)
  | { type: 'monthGuests'; n: number }            // 이달 손님 수
  | { type: 'monthSales'; n: number };            // 이달 매출
export type FeatureId = 'clearRock' | 'promote' | 'craft' | 'popup' | 'challenge' | 'parcel' | 'siteView' | 'comboCodex' | 'spotMap';
export type GoalReward =
  | { type: 'money'; amount: number }
  | { type: 'unlockFacility'; id: string }
  | { type: 'unlockMenu'; id: string }
  | { type: 'unlockRole'; id: RoleId }
  | { type: 'tickets'; n: number }
  | { type: 'mileage'; n: number }
  | { type: 'staffSlot'; role: RoleId; n: number }
  | { type: 'research'; n: number }
  | { type: 'builder'; n: number }
  | { type: 'unlockFeature'; id: FeatureId }
  | { type: 'item'; id: string; n: number }          // 아이템 n개 (inventory)
  | { type: 'unlockGuest'; id: string }              // 손님 타입 해금
  | { type: 'unlockRecruit'; id: string }            // 채용 등급 해금 (x-staff)
  | { type: 'unlockGuidebook'; id: string }          // 가이드북 해금
  | { type: 'seed'; kind: string; n: number }        // 씨앗 아이템 n개 (kind = 아이템 id)
  | { type: 'title'; id: string; name: string }      // 칭호 (state.titles)
  | { type: 'feeBonus'; pct: number };               // 요금 +pct% (state.feeBonusPct)
export type GoalSpeaker = 'halmang' | 'samchun' | 'hero';
export interface GoalDef {
  id: string;
  title: string;      // 한글 14자 이내
  desc: string;       // 한 줄
  condition: GoalCondition;
  reward: GoalReward[];
  speaker?: GoalSpeaker;
  line?: string;      // 축하 대사 1줄
}
/** index = 아직 안 이룬 첫 목표 순번 (goals.json), claimed = 달성한 목표 id (메인 2개 동시 진행이라 순서가 어긋날 수 있다) */
export interface GoalsState { index: number; claimed: string[] }
export interface GameStats {
  satisfiedTotal: number;  // 누적 만족(happy) 손님
  rocksCleared: number;    // 치운 바위·덤불
  promotionsDone: number;  // 홍보 실행 횟수
  recipesMade: number;     // 개발 성공한 레시피
  rivalWins: number;       // 카페 대결 승리
  profitMonths: number;    // 연속 흑자 달 (월말 갱신)
  lossMonths: number;      // 연속 적자 달
  guidebookWins: number;   // 가이드북 1위 횟수
  itemsUsed: number;       // 강화 아이템 사용 횟수
  trainings: number;       // 연수 완료 횟수 (x-staff가 올린다)
  toursHeld: number;       // 투어 개최 성공 (x-spots가 올린다)
  seenMonth: number;       // 월말 관찰용 monthIndex (goals.ts observeMonth)
  seenAnnouncement: number; // 마지막으로 센 가이드북 발표 monthIndex
}
/** 보상 상자에 담기는 보상 알림의 출처 */
export type RewardSource = 'goal' | 'challenge' | 'monthly' | 'tutorial';
/** UI 대화창·팝업 큐 항목 */
export type Alert =
  | { type: 'goal'; goalId: string }
  | { type: 'event'; id: string }
  | { type: 'eventEnd'; id: string }
  | { type: 'reward'; source: RewardSource; refId: string; title: string; items: GoalReward[]; line?: string; speaker?: GoalSpeaker }
  | { type: 'challengeFailed'; id: string }
  | { type: 'failure'; stage: 'warn' | 'loan' | 'crisis' | 'demote' };

// ---------- 도전 과제 3레인 (§7.3) ----------
export interface ChallengeDef {
  id: string;
  title: string;      // 14자 이내
  desc: string;
  condition: GoalCondition;
  days: number;       // 기한 (수락일부터)
  reward: GoalReward[];
  tier: 1 | 2 | 3 | 4 | 5;
  requires?: number;  // 메인 목표 index 이상일 때 목록에 나온다
  delta?: boolean;    // true면 수락 시점 값 대비 증가분으로 판정 (자금 +300만 등)
}
export interface ActiveChallenge { id: string; startDay: number; endDay: number; base: number; progress: number }
export interface ChallengesState {
  active: ActiveChallenge[];
  done: string[];
  failed: { id: string; until: number }[]; // until = 다시 고를 수 있는 dayIndex
}
/** 월간 과제 (매월 1일 자동 1개, 그달 안). 난이도는 현재 수치 기준 자동. */
export interface MonthlyState {
  id: string;         // m_<monthIndex>_<kind>
  monthIndex: number;
  title: string;
  condition: GoalCondition;
  base: number;       // 생성 시점 값 (delta 조건)
  reward: GoalReward[];
  status: 'active' | 'done' | 'failed';
}
/** 손으로 하는 튜토리얼 (§7.2): step = 끝낸 단계 수 (0~9). 9면 끝. skipped면 완성 시작 상태로 채웠다. */
export interface TutorialState { step: number; skipped: boolean }

// ---------- 제주 빅 이벤트 (v3 A5) ----------
/** 손님 태그 배수의 키: 인구 태그 + 외국인·학생·1인·가족 */
export type BigEventTag = 'youth' | 'adult' | 'senior' | 'female' | 'male' | 'group' | 'foreign' | 'student' | 'solo' | 'family';
export interface BigEventSpecialGuest { name: string; portraitSeed: number; line: string; budget: number; tip: number }
export interface BigEventEffects {
  guestMult?: number;                          // 하루 손님 수 배수
  tagMult?: Partial<Record<BigEventTag, number>>; // 손님층 가중치 배수
  moneyBonus?: number;                         // 발동 즉시 자금
  feeMult?: number;                            // 메뉴 값 배수
  popularity?: number;                         // 발동 즉시 동네↔인기 게이지
  repairCost?: number;                         // 발동 즉시 시설 수리비 (시설당)
  specialGuest?: BigEventSpecialGuest;         // 특별 손님 1회 방문
}
export interface BigEventDef {
  id: string;
  title: string;
  month?: number;             // 이 달에만 (1~12)
  year?: number;              // n년차 이후
  once?: boolean;             // 한 번만
  chance: number;             // 0~1, 매월 1일 판정
  condition?: GoalCondition;  // 추가 조건
  durationDays: number;
  effects: BigEventEffects;
  dialogue: { speaker: GoalSpeaker; lines: string[] };
  endDialogue?: string;
}
/** endsDay = 끝나는 절대 일 인덱스(포함 안 함, effects.dayIndex 기준) */
export interface ActiveBigEvent { id: string; startDay: number; endsDay: number; specialVisited: boolean }

export interface Cell {
  terrain: Terrain;
  objectId: string | null; // 이 칸을 덮는 PlacedObject.id (실내 오브젝트가 있으면 그것, 없으면 방)
  roomId: string | null;   // 이 칸을 바닥으로 삼는 room 오브젝트 id
}

export interface PlacedObject {
  id: string;
  type: string; // ObjectDef.id
  x: number;
  y: number;
  placedMonth: number; // 놓은 달(monthIndex). 농원 수확은 다음 달 1일부터
  rot?: number; // 0..3, 방향 있는 오브젝트만 (스프라이트 변형 _r{n})
  build?: { doneDay: number; days: number }; // 건설 중 (doneDay = 완공 절대 일 인덱스). 없으면 완공
}

/** 필지. 격자는 처음부터 전체 크기이고, 소유한 필지에만 지을 수 있다. */
export interface Parcel {
  id: string;
  no: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  owned: boolean;
  price: number;
  bonus: ParcelBonus;
}

/** 렌더 전용 연출 큐 (sim이 남기고 렌더가 tick으로 새 항목만 읽는다). 최근 FX_CAP개만 보관. */
export type FxEvent =
  | { kind: 'harvest'; x: number; y: number; tick: number } // 농원 월 수확 반짝임
  | { kind: 'pop'; x: number; y: number; n: number; tick: number }
  | { kind: 'greet'; staffId: string; tick: number }
  | { kind: 'photo'; x: number; y: number; tick: number } // 인생샷 스킬: 손님이 사진을 찍었다
  | { kind: 'complete'; x: number; y: number; tick: number } // 시설 완공 반짝임
  | { kind: 'scene'; title: string; text: string; tick: number }; // UI 장면 창(완공·★ 승급·랭크 업). 렌더는 무시한다

// ---------- 상점·추첨·유니폼·가이드북 (2B-2 Task 6·7) ----------
export interface MileageShopDef { id: string; name: string; price: number; description: string; itemId?: string }
export interface TicketShopDef { id: string; name: string; price: number; description: string; itemId?: string; uniformId?: string }
export interface UniformDef { id: string; name: string; ticketTier: number; effectText: string; parts: { top: string; acc?: string } }
/** 인형뽑기 상품 종류 (v1 roulette.json 가중치를 다시 라벨링) */
export type DrawPrizeKind = 'money' | 'research' | 'ingredient_box' | 'mileage' | 'item' | 'seed' | 'uniform_piece' | 'miss';
export interface DrawPrizeDef { kind: DrawPrizeKind; label: string; pct: number }
export interface DrawResult { kind: DrawPrizeKind; label: string; text: string; free: boolean }
/** 가이드북 심사 항목 6종 (0~100) */
export type JudgeKey = 'smile' | 'scenery' | 'menu' | 'fun' | 'group' | 'overall';
export type JudgeScores = Record<JudgeKey, number>;
export interface GuidebookDef {
  id: string;
  name: string;
  unlock: UnlockCond;
  unlockText: string;
  criteriaText: string;
  weights: Partial<Record<JudgeKey, number>>; // 합 1
  prize: number;
  research: number;
  seeds: { itemId: string; count: number }[];
  monthly: boolean; // 매월 발표 (이번 달 농협 추천)
}
export interface GuidebookState { unlocked: boolean; lastRank: number | null; best: number | null }
export interface AnnouncementEntry {
  id: string;
  name: string;
  scores: JudgeScores;
  total: number;      // 가중 합 0~100
  rivals: number[];   // 경쟁 카페 9곳 점수 (내림차순)
  rank: number;       // 1..10
  prize: number;      // 받은 돈
  research: number;
  mileage: number;
  seedText: string | null;
  targetText: string | null; // 월간 추천: 이번 달 타깃 손님층
}
export interface Announcement { monthIndex: number; month: number; year: number; entries: AnnouncementEntry[]; starBefore: number; starAfter: number }

// ---------- 원정 팝업·지역·이름 있는 손님 (2B-4) ----------
export interface RegionDef { id: string; name: string; popupCost: number; vitality: number; appetite: number; decayPerWeek: number; recoverPerWeek: number; note?: string }
/** likesBase의 'any'는 모든 분류 */
export interface NamedGuestDef {
  id: string;
  regionId: string;
  no: number;
  name: string;
  job: string;
  line: string;
  likesBase: (MenuCategory | 'any')[];
  likesStats: MenuStatKey[];
  budget: number;
  face: { seed: number };
  acc: string[];
}
export interface RegionState { vitality: number; appetite: number }
/** affinity 0~300, rewardsTaken 0~3(100·200·300에서 보상), regular = 첫 보상 때 ★ → 본점 방문. met = 한 번이라도 만났다(도감 공개) */
export interface NamedGuestState { affinity: number; rewardsTaken: number; regular: boolean; met: boolean }
/** 팝업 손님 한 명의 방문 결과 (PopupScreen 연출용, 최근 POPUP_VISIT_CAP개) */
export interface PopupVisit {
  namedId: string;
  menuId: string | null;
  mood: Mood;
  reason: 'no_menu' | 'price' | null;
  taste: boolean;        // 취향 일치(×2)
  gain: number;          // 호감도 증가
  affinity: number;      // 방문 뒤 호감도
  reward: string | null; // 이 방문에서 받은 보상 문구
  regularNow: boolean;   // 이 방문에서 단골★이 됐다
  tick: number;
}
/** regionId = 열려 있는 팝업 지역(null이면 없음). openedDay = 연 날(절대 일 인덱스). lastRegionId = 이번 주 팝업을 연 지역(주말 회복에서 제외). queue = 오늘 아직 안 온 손님 id(매 시간 한 명). */
export interface PopupState { regionId: string | null; openedDay: number; lastRegionId: string | null; queue: string[]; visits: PopupVisit[] }

// ---------- 라이벌 카페 (2B-4 Task 3, 스펙 §15.3) ----------
export type RivalSize = 'small' | 'medium' | 'large';
export interface RivalDef {
  id: string;
  name: string;
  size: RivalSize;
  sizeText: string;
  upkeep: number;
  stealPerMonth: number;
  statPenalty: number;            // 매월 우리 메뉴 양·보기 −%
  judge: Partial<MenuStats>;      // 심사 가중치 (합 1)
  bankruptMonthly: number;        // 매월 자체 파산 % (대형)
  line: string;
}
/** 생긴 라이벌 하나. id = 'r{n}', rivalId = RivalDef.id. stolen = 빼앗긴 단골★ id (철수하면 돌아온다) */
export interface RivalState { id: string; rivalId: string; openedMonthIndex: number; penaltyPct: number; stolen: string[]; lastChallengeMonth: number }
/** 카페 대결 결과 (UI 심사 게이지, dismissChallenge로 닫는다) */
export interface ChallengeResult {
  rivalStateId: string;
  rivalId: string;
  menuId: string;
  menuName: string;
  breakdown: Partial<MenuStats>; // 가중치 × 스탯 항목별 점수
  score: number;                 // 항목 합 + 운
  luck: number;
  power: number;                 // 라이벌 점수
  win: boolean;
}

export interface Guest {
  id: string;
  type: string; // GuestTypeDef.id
  namedId?: string; // 이름 있는 손님(단골★)이면 NamedGuestDef.id — type은 NAMED_TYPE
  phase: GuestPhase;
  x: number;            // 셀 좌표(소수 허용, 보간용)
  y: number;
  path: Pt[];           // 남은 경로
  seatId: string | null;
  seatSlot: number;             // 좌석 오브젝트 안의 자리 번호 (0..seats-1)
  approachCell: Pt | null;      // 좌석 옆 걷기 칸 — 앉을 때 기록, 나갈 때 여기서 출발
  menuId: string | null;
  mood: Mood | null;
  moodReason: 'no_menu' | 'scenery' | 'wait' | 'price' | null;
  say: string | null;   // 렌더용 말풍선 대사
  visitId: string | null;       // 순회 중인 시설 오브젝트 id (visiting)
  timerMs: number;      // seated·visiting 남은 시간
  waitMs: number;       // 주문 후 조리 대기 남은 시간
  paid: number;         // 주문 시 낸 돈 (자금 효과의 팁 계산용)
}

export interface Clock {
  day: number;   // 1~30
  month: number; // 1~12
  year: number;  // 1~
  hour: number;  // 6~24
  accMs: number; // 하루 누적 (게임 ms)
  carryMs: number; // 고정 스텝 잔여 (실시간×speed)
  speed: 0 | 1 | 2 | 3;
}

export interface GameState {
  version: number;
  playerId: string;
  createdAt: number; // epoch ms, 호출자가 지정 (sim은 Date를 쓰지 않는다)
  seed: number;
  rng: number;
  clock: Clock;
  money: number;
  research: number;
  popularity: number; // −100(동네) ~ +100(인기)
  grid: { w: number; h: number; cells: Cell[] };
  parcels: Parcel[];
  settleGrantUsed: boolean; // 정착지원금(잔고 < 40만이면 1회 300만)을 받았나
  objects: Record<string, PlacedObject>; // 키는 'o123' 형태(비정수 문자열)라 삽입 순서가 보존됨 → 결정적 순회
  storage: Record<string, number>; // 창고: ingredientId → 개수 (농원 수확·재료 상자). 메뉴를 만들 때 먼저 쓰고, 없으면 자동 구매
  menuSlots: (string | null)[];
  unlocked: { objects: string[]; menus: string[]; roles: RoleId[] };
  goals: GoalsState;                          // 목표 체인 (v3 §2)
  features: Record<FeatureId, boolean>;       // 목표 보상으로 열리는 기능 (goals.ts 표)
  stats: GameStats;                           // 목표 판정용 누적 카운터
  challenges: ChallengesState;                // 도전 과제 2슬롯 (§7.3)
  monthly: MonthlyState | null;               // 월간 과제 (§7.3)
  tutorial: TutorialState;                    // 손으로 하는 튜토리얼 진행 (§7.2)
  titles: string[];                           // 얻은 칭호 id (도전 보상)
  feeBonusPct: number;                        // 칭호 등으로 얻은 요금 보너스 % (합)
  alerts: Alert[];                            // UI 대화창 큐 (목표 달성·빅 이벤트). dismissAlert로 앞에서 뺀다
  events: ActiveBigEvent[];                   // 진행 중인 제주 빅 이벤트 (동시 최대 2)
  eventsFired: Record<string, number>;        // 빅 이벤트 id → 발동 횟수 (once 판정)
  monthHarvest: MonthHarvest;                 // 이달 농원 수확·절감 (월말 카드로 옮긴다)
  staff: Staff[];
  candidates: Candidate[];
  slots: Record<RoleId, number>;
  activePromotions: ActivePromotion[];
  youtuberBoostMonths: number;
  segmentPopularity: Record<string, number>; // 손님층 인기 0~99
  targetSegment: string | null;               // 타깃 손님층 (targets[0]의 별칭 — HUD·구 코드용): 홍보 효과 ×1.5
  targets: string[];                          // 타깃 손님 타입 최대 3
  guestTypes: Record<string, GuestTypeState>; // 손님 타입별 해금·만족·단골
  visitBonus: Record<string, number>;         // objectType → 시설 인기 효과 누적 (+10 상한)
  tickets: number;                            // 응모권
  mileage: number;
  rank: number;                               // 카페 랭크 1~ (랭크 점수 = 누적 손님 + 시설 + 해금 손님층, 문턱표)
  star: number;                               // ★ 등급 1~5 (ranks.json 조건, 월초 검사)
  totalGuests: number;                        // 누적 손님 수 (랭크 점수)
  builders: number;                           // 일꾼 삼춘 수 = 동시 건설 수 (기본 2)
  uniform: string | null;                     // 입고 있는 유니폼 id (연출)
  uniforms: string[];                         // 가진 유니폼
  uniformPieces: number;                      // 유니폼 조각 (5개 → 유니폼 1벌)
  freeDrawMonth: number;                      // 이 monthIndex에 무료 추첨 1회가 남아 있다 (−1 = 없음)
  lastDraw: DrawResult | null;                // 마지막 인형뽑기 결과 (UI 연출, dismissDraw로 닫는다)
  freeRecruits: number;                       // 직원 스카우트권: 다음 공고비 무료 횟수
  codexMileage: number;                       // 도감 10개마다 준 마일리지 단계
  guidebooks: Record<string, GuidebookState>; // 가이드북 11종 진행
  lastAnnouncement: Announcement | null;      // 마지막 랭킹 발표 (UI 팝업, dismissAnnouncement로 닫는다)
  board: BoardState;
  spots: Record<string, number>;              // spotId → 레벨 (0 = 미투자)
  effects: ActiveEffect[];                    // 이벤트 효과 (기간형)
  menuSold: Record<string, number>;           // menuId → 누적 판매 수 (부탁 진행: 수락 시점 값과의 차, 목표 menuSold)
  monthMenuSold: Record<string, number>;      // 이달 판매 수 (월말 카드 최다 판매 메뉴)
  codex: { combos: string[]; sets: string[]; recipes: string[]; ingredientCombos: string[] }; // 발동한 적 있는 상성·세트·히든 레시피·재료 콤보 id (도감)
  customMenus: MenuDef[];                     // 개발한 메뉴 (id m_custom_N). menuOf(state, id)가 기본 메뉴보다 먼저 찾는다
  menuMods: Record<string, MenuMod>;          // menuId → 토핑·레벨 (없으면 토핑 없음·레벨 1)
  developing: Developing | null;              // 진행 중인 메뉴 개발 (직원은 그동안 바쁘다)
  lastDevelop: DevelopResult | null;          // 마지막 개발 결과 (UI 팝업, dismissDevelop으로 닫는다)
  inventory: Record<string, number>;          // itemId → 개수
  itemBonus: Record<string, ItemBonus>;       // objectType → 아이템 누적 보너스 (인기 상한 +30)
  notices: string[];
  fx: FxEvent[];                              // 연출 큐 (자동 수확 반짝임·숫자 팝업)
  cafeName: string;                           // 카페 이름 (renameCafe)
  totalIncome: number;                        // 누적 매출 (카페 레벨)
  expansions: string[];                       // 증축 id (kitchen·floor2·terrace)
  cosmetics: { wallColor: number; sign: string }; // 인테리어 (외벽 색 인덱스·간판 문구) — 연출만
  praised: Record<string, number>;            // staffId → 마지막으로 칭찬한 일 인덱스
  regions: Record<string, RegionState>;       // 지역 활기·식욕 (2B-4)
  namedGuests: Record<string, NamedGuestState>; // 이름 있는 손님 56 호감도·단골★
  popup: PopupState;                          // 원정 팝업 스토어
  rivals: RivalState[];                       // 라이벌 카페 (동시 최대 2)
  lastChallenge: ChallengeResult | null;      // 마지막 카페 대결 (UI 팝업)
  guests: Guest[];
  spawnAcc: number; // 시간대별 스폰 소수 누적
  researchAcc: number; // 만족 손님 누적 (5마다 연구 +1)
  nextId: number;
  monthIncome: number;
  monthGuests: number;
  monthCosts: MonthCosts;
  lastMonthIncome: number; // 지난달 매출 (★ 조건 "월 매출"용 — lastMonthCard는 닫으면 null이 된다)
  lastMonthCard: MonthCard | null;
  tick: number; // 고정 스텝 카운터
  actionLog: { tick: number; action: Action }[];
}

// ---------- 액션 ----------
export type Action =
  | { type: 'place'; objectType: string; x: number; y: number; rot?: number }
  | { type: 'remove'; objectId: string }
  | { type: 'move'; objectId: string; x: number; y: number }
  | { type: 'rotate'; objectId: string; rot: number }
  | { type: 'buyParcel'; id: string }
  | { type: 'clearRock'; x: number; y: number }
  | { type: 'renameCafe'; name: string }
  | { type: 'expand'; id: string }
  | { type: 'setCosmetic'; wallColor?: number; sign?: string }
  | { type: 'praise'; staffId: string }
  | { type: 'setSlot'; slot: number; menuId: string | null }
  | { type: 'setSpeed'; speed: 0 | 1 | 2 | 3 }
  | { type: 'dismissAlert' }
  | { type: 'acceptChallenge'; id: string }
  | { type: 'skipTutorial' }
  | { type: 'dismissMonthCard' }
  | { type: 'postJob'; tier: JobTier }
  | { type: 'hire'; candidateId: string; role: RoleId }
  | { type: 'fire'; staffId: string }
  | { type: 'assign'; staffId: string; role: RoleId | null }
  | { type: 'levelUp'; staffId: string; stat: StatKey }
  | { type: 'promote'; staffId: string; promotionId: string }
  | { type: 'setTarget'; segment: string | null }
  | { type: 'useItem'; itemId: string; objectType: string }
  | { type: 'acceptQuest'; id: string }
  | { type: 'respondEvent'; id: string; accept: boolean }
  | { type: 'investSpot'; id: string }
  | { type: 'develop'; base: MenuBase; ingredients: string[]; params?: BrewParams; staffId: string }
  | { type: 'dismissDevelop' }
  | { type: 'addTopping'; menuId: string; toppingId: string }
  | { type: 'removeTopping'; menuId: string; toppingId: string }
  | { type: 'levelUpMenu'; menuId: string }
  | { type: 'buyMileage'; id: string }
  | { type: 'buyTicket'; id: string }
  | { type: 'drawTicket' }
  | { type: 'dismissDraw' }
  | { type: 'setUniform'; id: string | null }
  | { type: 'useGuestItem'; itemId: string; guestId: string }
  | { type: 'dismissAnnouncement' }
  | { type: 'openPopup'; regionId: string }
  | { type: 'closePopup' }
  | { type: 'challenge'; rivalId: string; menuId: string } // rivalId = RivalState.id
  | { type: 'dismissChallenge' };

export interface ApplyResult { ok: boolean; reason?: string }
