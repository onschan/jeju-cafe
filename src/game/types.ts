/**
 * 새 코어의 상태 (specs/2026-09-27-rebuild-kairo-core.md). 옛 sim 타입은 안 쓴다.
 * 결정적: state.rng 하나로 난수를 뽑고, Date·Math.random은 쓰지 않는다.
 */
export type Tab = 'env' | 'seat' | 'shop';
export type Floor = 'wood' | 'deck' | 'tile' | 'stone' | 'brick' | 'lawn' | 'gravel' | 'path';
export type Terrain = 'grass' | 'road';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Mood = 'happy' | 'meh' | 'angry';

export interface FacilityDef {
  id: string; name: string; tab: Tab;
  sub?: 'floor' | 'deco' | 'wall'; // floor: 바닥(칸에 깔림) · deco: 장식(어디든) · wall: 벽(잔디·바닥 어디든, 못 지나감, 둘러싸면 실내)
  floor?: Floor;              // sub=floor일 때 어떤 바닥인가
  w: number; h: number; cost: number; upkeep: number;
  pop?: number;               // 기본 인기 (자리·가게)
  station?: OrderKind | 'both'; // 제조대: 이 갈래의 메뉴를 만든다
  fee?: number;               // 기본 요금 (자리: 메뉴 값에 더함 · 가게: 이용료)
  scenery?: number;           // 경치 (환경·장식 — 반경 2 자리·가게가 받는다)
  capacity?: number;          // 동시 이용 인원
  unlock: number;             // 여는 데 드는 연구 (0 = 처음부터)
  tags?: string[];            // 좋아하는 손님층 id
  indoor?: boolean;           // 벽으로 둘러싸인 실내 바닥에만 놓는다
  onGrass?: boolean;          // 바닥 없이 잔디 위에도 놓는다 (자판기처럼)
  comfort?: number;           // 아늑함 (실내 반경 3 자리·가게가 받는다 — 실내판 경치)
  amenity?: 'counter' | 'restroom' | 'staff' | 'kitchen' | 'cleaning' | 'locker' | 'storage'; // 하나만 세는 편의 시설
}
export interface GuestTypeDef { id: string; name: string; wallet: number; expect: number; weight: number; unlock: number; menu: string[] }
export type OrderKind = 'drink' | 'food';
export interface MenuDef { id: string; name: string; price: number; unlock: number; kind?: OrderKind }
/** 주문 한 건: 기다림 → 제조 → 서빙 */
export interface Order { id: number; guest: string; menu: string; kind: OrderKind; phase: 'wait' | 'make' | 'serve' | 'done'; ms: number; waited: number; station?: string }
export interface SynergyDef { id: string; name: string; a: string[]; b: string[] }
export interface InvestDef { id: string; name: string; cost: number; desc: string; fame?: number; guests?: number; scenery?: number; typeMult?: Record<string, number> }
export interface RivalDef { id: string; name: string; base: number; growth: number }

/** wn/ww: 이 칸의 북(y−1 쪽)·서(x−1 쪽) 변에 선 벽의 종류 id. 남·동 변은 이웃 칸의 wn/ww로 적는다. 벽은 칸을 안 먹는다. */
export interface Cell { terrain: Terrain; floor: Floor | null; objectId: string | null; wn?: string | null; ww?: string | null }
export interface Parcel { id: string; name: string; x: number; y: number; w: number; h: number; owned: boolean; price: number }
export interface Facility { id: string; type: string; x: number; y: number; name?: string; level: number; uses: number; sales: number }

export interface Pt { x: number; y: number }
export type GuestPhase = 'in' | 'use' | 'out';
export interface Guest {
  id: string; type: string; phase: GuestPhase;
  x: number; y: number; path: Pt[];
  target: string | null;      // 쓰러 가는 시설 id
  approach: Pt | null;        // 시설 옆 걷는 칸
  timerMs: number;            // 이용 남은 시간
  mood: Mood | null;
  face: { hair: number; skin: number; top: number };
  rev?: number;               // 길을 찾았을 때의 layoutRev — 바뀌면 다시 찾는다
  served?: boolean;           // 주문을 받았나 (제조·서빙이 끝났나)
  waitMs?: number;            // 주문을 기다린 시간
}
/** 직원 능력 4가지 (1~10): 접객 service · 손놀림 speed · 정리 clean · 매력 charm. 등급 S~E로 보여 준다. */
export interface Staff { id: string; name: string; service: number; speed: number; clean: number; charm: number; wage: number; duty: 'service' | 'speed' | 'clean' | 'charm'; served: number; happy: number; month: { served: number; happy: number }; face: { hair: number; skin: number; top: number } }
export interface Candidate extends Staff { until: number /* 며칠 뒤 돌아간다 */; from: string /* 어느 채용 루트로 왔나 */ }

/** need: 만족 못 했을 때 가장 아쉬웠던 것 (니즈 창이 모은다) */
export interface Receipt { id: number; type: string; money: number; fame: number; mood: Mood; at: number; need?: string }
export interface Clock { year: number; month: number; day: number; hour: number; ms: number; speed: 0 | 1 | 2 | 3 }

export interface Loan { balance: number; count: number; lastYear: number }
export interface Evaluation { year: number; rank: number; score: number; rows: { id: string; name: string; score: number; me: boolean }[]; prize: number }

/** 연출 이벤트 (그림 쪽이 소비한다) */
export type Fx =
  | { kind: 'synergy'; x: number; y: number; name: string; order: number }
  | { kind: 'money'; x: number; y: number; won: number }
  | { kind: 'unlock'; text: string }
  | { kind: 'notice'; text: string };

export interface GameState {
  version: number;
  cafeName: string;
  seed: number; rng: number; tick: number;
  clock: Clock;
  money: number; research: number; fame: number;
  grid: { w: number; h: number; cells: Cell[] };
  parcels: Parcel[];
  facilities: Record<string, Facility>;
  layoutRev: number;          // 배치가 바뀔 때마다 +1 (시트 캐시 키)
  nextId: number;
  guests: Guest[]; guestSeq: number; spawnAcc: number; todayGuests: number; todayIncome: number;
  orders: Order[]; orderSeq: number;
  lastDay: { guests: number; income: number } | null; // 어제 장사 (하루 요약 카드)
  staff: Staff[]; candidates: Candidate[]; candidatesMonth: number;
  hiring: { channel: string; daysLeft: number } | null;   // 진행 중인 채용 공고
  unlocked: { facilities: string[]; menus: string[]; guests: string[] };
  menu: string[];             // 메뉴판에 올린 메뉴
  target: string | null;      // 광고 타깃 손님층
  invested: string[];
  objectivesDone: string[];
  hints: string[];            // 한 번 본 안내 대사 id
  tutorial: number;           // 따라 하기 단계 (−1 = 안 함·다 끝냄) (할망·삼춘 첫 5분 안내)
  receipts: Receipt[]; receiptSeq: number;
  fx: Fx[];
  loan: Loan;
  evaluations: Evaluation[];
  month: { income: number; spent: number; guests: number; happy: number; fame0: number };
  lastMonth: { income: number; spent: number; guests: number; happy: number; fame0: number; year: number; month: number } | null;
  stats: { guests: number; happy: number; angry: number; income: number; turnedAway: number };
  log: { tick: number; action: Action }[];
}

export type Action =
  | { type: 'place'; id: string; x: number; y: number }
  | { type: 'placeLine'; id: string; from: Pt; to: Pt }
  | { type: 'wallRect'; id: string; from: Pt; to: Pt }   // 네모 둘레에 벽을 두른다 (올렛길 닿는 변은 문)
  | { type: 'wallEdges'; id: string; edges: { x: number; y: number; side: 'n' | 'w' }[] } // 고른 변들에 벽
  | { type: 'removeWalls'; x: number; y: number }       // 그 칸 둘레 벽 네 변을 걷는다
  | { type: 'removeWall'; x: number; y: number; side: 'n' | 'w' } // 변 하나만 걷는다
  | { type: 'remove'; facilityId: string }
  | { type: 'removeFloor'; x: number; y: number }
  | { type: 'rename'; facilityId: string; name: string }
  | { type: 'levelUp'; facilityId: string }   // 연구+돈으로 단계 올리기
  | { type: 'unlock'; id: string }           // 연구로 시설·메뉴·손님층 열기
  | { type: 'setMenu'; menuId: string; on: boolean }
  | { type: 'setTarget'; guestType: string | null }
  | { type: 'recruit'; channel: string }     // 채용 루트로 공고를 낸다
  | { type: 'setDuty'; staffId: string; duty: 'service' | 'speed' | 'clean' | 'charm' }
  | { type: 'hire'; candidateId: string }
  | { type: 'fire'; staffId: string }
  | { type: 'invest'; id: string }
  | { type: 'buyParcel'; id: string }
  | { type: 'setSpeed'; speed: 0 | 1 | 2 | 3 }
  | { type: 'setName'; name: string }
  | { type: 'hint'; id: string }
  | { type: 'tutorialStep'; reward: number }; // 따라 하기 한 단계 완료           // 안내 대사를 봤다

export interface ApplyResult { ok: boolean; reason?: string }
