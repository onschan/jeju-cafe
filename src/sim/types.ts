export type Terrain = 'soil' | 'rock' | 'road';
export type ObjectKind = 'field' | 'tree' | 'seat' | 'wall' | 'path' | 'building' | 'deco' | 'busstop' | 'gate';
export type MenuCategory = 'drink' | 'dessert' | 'meal';
export type Mood = 'happy' | 'meh' | 'angry';
export type GuestPhase = 'walking' | 'seated' | 'leaving';
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
  cropId?: string;     // kind === 'tree' 고정 작물
  terrain: Terrain[];  // 놓을 수 있는 지형
}

export interface CropDef {
  id: string;
  name: string;
  growDays: number;          // 심은 뒤 첫 수확까지
  plantMonths: number[];     // field 작물: 심을 수 있는 달 (1~12)
  harvestMonths?: number[];  // tree 작물: 매년 수확 가능한 달. 창의 시작 달부터 연속(해 넘김 가능, 예 [11,12,1])
  yieldAmount: number;
}

export interface MenuDef {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  ingredients: Record<string, number>; // ingredientId → 개수
  requires?: { role?: RoleId; skill?: string }; // 배치된 직원(기력>0)이 조건을 만족해야 만들 수 있다
}

export interface GuestTypeDef {
  id: string;
  name: string;
  likes: MenuCategory[];
  minScenery: number;
  popularityShift: number; // happy일 때 게이지 이동 (−: 동네, +: 인기)
  weight: number;          // 스폰 가중치
}

export interface UnlockDef {
  id: string;
  kind: 'object' | 'menu' | 'crop' | 'slot' | 'role';
  ref: string; // slot·role일 때는 RoleId
  cost: number;
}

// ---------- 재료·직원·홍보 (2B-1) ----------
export type IngredientKind = 'bought' | 'farm';
export interface IngredientDef { id: string; name: string; kind: IngredientKind; cost: number } // cost: bought만 의미

export type RoleId = 'barista' | 'cook' | 'hall' | 'field' | 'carry' | 'guide';
export type StatKey = 'service' | 'cooking' | 'sense' | 'stamina';
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

export interface Stats { service: number; cooking: number; sense: number; stamina: number }
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
  x: number;
  y: number;
  path: Pt[];
  anchor: Pt | null; // 렌더·이동용
  waitMs: number;    // 다음 산책까지 대기
}
export interface Candidate extends Omit<Staff, 'role' | 'unpaidMonths' | 'energy' | 'x' | 'y' | 'path' | 'anchor' | 'waitMs'> {
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
export interface ActivePromotion { promotionId: string; remainingMonths: number }

// ---------- 게임 상태 ----------
export interface Pt { x: number; y: number }

export interface Cell {
  terrain: Terrain;
  objectId: string | null; // 이 칸을 덮는 PlacedObject.id
}

export interface CropState {
  cropId: string;
  daysGrown: number;
  ready: boolean;
  harvestedYear: number; // tree: 올해 이미 땄으면 clock.year, -1 = 아직 안 땀
}

export interface PlacedObject {
  id: string;
  type: string; // ObjectDef.id
  x: number;
  y: number;
  crop: CropState | null;
}

export interface Guest {
  id: string;
  type: string; // GuestTypeDef.id
  phase: GuestPhase;
  x: number;            // 셀 좌표(소수 허용, 보간용)
  y: number;
  path: Pt[];           // 남은 경로
  seatId: string | null;
  menuId: string | null;
  mood: Mood | null;
  moodReason: 'no_menu' | 'scenery' | 'wait' | 'price' | null;
  say: string | null;   // 렌더용 말풍선 대사
  timerMs: number;      // seated 남은 시간
  waitMs: number;       // 주문 후 조리 대기 남은 시간
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
  objects: Record<string, PlacedObject>; // 키는 'o123' 형태(비정수 문자열)라 삽입 순서가 보존됨 → 결정적 순회
  storage: Record<string, number>; // cropId → 개수
  menuSlots: (string | null)[];
  unlockedIndex: number;
  unlocked: { objects: string[]; menus: string[]; crops: string[]; roles: RoleId[] };
  staff: Staff[];
  candidates: Candidate[];
  slots: Record<RoleId, number>;
  activePromotions: ActivePromotion[];
  youtuberBoostMonths: number;
  segmentPopularity: Record<string, number>; // 손님층 인기 0~99
  targetSegment: string | null;               // 타깃 손님층: 홍보 효과 ×1.5
  notices: string[];
  guests: Guest[];
  spawnAcc: number; // 시간대별 스폰 소수 누적
  nextId: number;
  monthIncome: number;
  monthGuests: number;
  monthCosts: { ingredients: number; salary: number; ads: number; upkeep: number };
  lastMonthCard: {
    income: number;
    guests: number;
    month: number;
    year: number;
    costs: { ingredients: number; salary: number; ads: number; upkeep: number };
    net: number;
  } | null;
  tick: number; // 고정 스텝 카운터
  actionLog: { tick: number; action: Action }[];
}

// ---------- 액션 ----------
export type Action =
  | { type: 'place'; objectType: string; x: number; y: number }
  | { type: 'remove'; objectId: string }
  | { type: 'plant'; objectId: string; cropId: string }
  | { type: 'harvest'; objectId: string }
  | { type: 'setSlot'; slot: number; menuId: string | null }
  | { type: 'setSpeed'; speed: 0 | 1 | 2 | 3 }
  | { type: 'unlock' }
  | { type: 'dismissMonthCard' }
  | { type: 'postJob'; tier: JobTier }
  | { type: 'hire'; candidateId: string; role: RoleId }
  | { type: 'fire'; staffId: string }
  | { type: 'assign'; staffId: string; role: RoleId | null }
  | { type: 'levelUp'; staffId: string; stat: StatKey }
  | { type: 'promote'; staffId: string; promotionId: string }
  | { type: 'setTarget'; segment: string | null };

export interface ApplyResult { ok: boolean; reason?: string }
