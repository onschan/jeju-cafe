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
  seats?: number;      // kind === 'seat'
  cropId?: string;     // kind === 'tree' 고정 작물
  terrain: Terrain[];  // 놓을 수 있는 지형
}

export interface CropDef {
  id: string;
  name: string;
  growDays: number;          // 심은 뒤 첫 수확까지
  plantMonths: number[];     // field 작물: 심을 수 있는 달 (1~12)
  harvestMonths?: number[];  // tree 작물: 매년 수확 가능한 달
  yieldAmount: number;
}

export interface MenuDef {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  ingredients: Record<string, number>; // cropId → 개수
}

export interface GuestTypeDef {
  id: string;
  name: string;
  likes: MenuCategory[];
  minScenery: number;
  popularityShift: number; // 😊일 때 게이지 이동 (−: 동네, +: 인기)
  weight: number;          // 스폰 가중치
}

export interface UnlockDef {
  id: string;
  kind: 'object' | 'menu' | 'crop';
  ref: string;
  cost: number;
}

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
  harvestedYear: number; // tree: 올해 이미 땄으면 clock.year
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
  timerMs: number;      // seated 남은 시간
}

export interface Clock {
  day: number;   // 1~30
  month: number; // 1~12
  year: number;  // 1~
  accMs: number;
  speed: 0 | 1 | 2 | 3;
}

export interface GameState {
  version: number;
  playerId: string;
  seed: number;
  rng: number;
  clock: Clock;
  money: number;
  research: number;
  popularity: number; // −100(동네) ~ +100(인기)
  grid: { w: number; h: number; cells: Cell[] };
  objects: Record<string, PlacedObject>;
  storage: Record<string, number>; // cropId → 개수
  menuSlots: (string | null)[];
  unlockedIndex: number;
  unlocked: { objects: string[]; menus: string[]; crops: string[] };
  guests: Guest[];
  nextId: number;
  monthIncome: number;
  monthGuests: number;
  lastMonthCard: { income: number; guests: number; month: number; year: number } | null;
  actionLog: Action[];
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
  | { type: 'dismissMonthCard' };

export interface ApplyResult { ok: boolean; reason?: string }
