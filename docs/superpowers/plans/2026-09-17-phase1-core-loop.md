# 제주 귀농 카페 — 1단계 구현 계획 (sim 코어 + 격자 렌더 + 1년차 루프)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 브라우저에서 "밭을 짓고 → 당근을 심고 → 수확해서 → 메뉴판에 올리면 → 손님이 걸어와 사 먹고 → 연구 포인트로 다음 것을 해금"하는 1년차 루프가 플레이스홀더 그래픽으로 돌아간다.

**Architecture:** `sim/`(순수 TS, 결정적, DOM 의존 0) ↔ `render/`(PixiJS 8, 상태를 읽어 그림) ↔ `ui/`(React 19, HUD·바텀시트, 액션 dispatch). 상태는 하나의 직렬화 가능한 객체이고 `tick(state, dtMs)`와 `apply(state, action)`만이 상태를 바꾼다. sim 함수는 전달받은 상태를 **제자리에서 변경**하고 그 상태를 반환한다(매 프레임 깊은 복사를 피하기 위함). "순수"는 외부 입력·전역·시간·Math.random 없이 결정적이라는 뜻이다.

**Tech Stack:** Vite 6, TypeScript 5, React 19, PixiJS 8, Vitest 3, tsx(스크립트 실행). 패키지 매니저 pnpm.

**Task 2–4 리뷰 후 확정된 규칙 (이후 모든 Task에 적용):**
- `src/sim`·`src/data` 안의 상대 import는 확장자를 붙인다(`'./types.ts'`, `'../data/index.ts'`). JSON은 `import x from './x.json' with { type: 'json' }`. tsconfig에 `allowImportingTsExtensions: true`. 이유: Deno에서 같은 코드로 점수 재계산(스펙 §9.4).
- **고정 스텝 시뮬레이션**: `GameState.tick`(정수)이 `STEP_MS = 100` 게임 ms마다 1 증가. `tick(state, dtMs)`는 `dtMs × speed`를 누적해 `STEP_MS` 단위로 `step(state)`를 반복한다. 손님 이동·시계는 `step` 안에서만 진행. 이유: 프레임 길이와 무관하게 결정적이어야 리플레이가 성립.
- `actionLog`는 `{ tick: number; action: Action }[]`. `setSpeed`·`dismissMonthCard`는 클라이언트 전용이라 로그하지 않는다.
- 감귤처럼 11→1월로 해가 넘어가는 수확 창은 `harvestedYear`에 **창이 시작한 해**를 기록한다(1월 수확이면 `year − 1`).
- `data/index.ts`의 `indexBy`는 중복 id를 만나면 throw.

**Spec:** `docs/superpowers/specs/2026-09-17-jeju-cafe-design.md` §3.1–3.4, §4.1–4.3(당근·감귤·메뉴 3개만), §5.1(삼춘·관광객 2타입), §6.3(일직선 해금), §7, §8. 나머지 섹션은 2~5단계 계획에서 다룬다.

---

## 파일 구조

```
jeju-cafe/
├─ package.json  vite.config.ts  tsconfig.json  index.html
├─ scripts/headless.ts              # 봇이 N년 자동 플레이 → CSV
├─ src/
│  ├─ main.tsx                      # React 마운트
│  ├─ data/
│  │  ├─ objects.json  crops.json  menus.json  guests.json  unlocks.json
│  │  └─ index.ts                   # JSON을 타입 붙여 export, id→def 맵
│  ├─ sim/
│  │  ├─ types.ts                   # 모든 상태·정의 타입
│  │  ├─ rng.ts                     # seed 기반 PRNG (mulberry32)
│  │  ├─ state.ts                   # createInitialState(seed)
│  │  ├─ clock.ts                   # 일·월·년 진행, 계절
│  │  ├─ grid.ts                    # 배치·제거·방풍·경치
│  │  ├─ farm.ts                    # 생육·수확·창고
│  │  ├─ menu.ts                    # 슬롯·재료 확인·판매
│  │  ├─ path.ts                    # 걷기 가능 판정 + A*
│  │  ├─ guests.ts                  # 스폰·이동·주문·만족·퇴장
│  │  ├─ progress.ts                # 연구 포인트·일직선 해금
│  │  ├─ actions.ts                 # apply(state, action)
│  │  ├─ tick.ts                    # tick(state, dtMs)
│  │  ├─ save.ts                    # SaveStore 인터페이스 + LocalSaveStore
│  │  ├─ index.ts                   # 공개 API re-export
│  │  └─ __tests__/*.test.ts
│  ├─ render/
│  │  ├─ textures.ts                # 플레이스홀더 텍스처 생성
│  │  ├─ camera.ts                  # 드래그·핀치·탭→셀 변환
│  │  └─ GameView.ts                # Pixi Application, 레이어, 상태→화면
│  └─ ui/
│     ├─ store.ts                   # 상태 보관, rAF 루프, dispatch, useGame()
│     ├─ App.tsx                    # 레이아웃(캔버스 + HUD + 바텀시트)
│     ├─ HUD.tsx                    # 돈·날짜·배속·다음 해금
│     ├─ BottomSheet.tsx            # 짓기·메뉴판·선택한 칸 정보
│     ├─ MonthCard.tsx              # 월말 정산 카드
│     └─ Guide.tsx                  # 할망 안내 한 줄
```

### 핵심 타입 (Task 2에서 정의, 이후 모든 Task가 이 이름을 사용)

```ts
type Terrain = 'soil' | 'rock' | 'road';
type ObjectKind = 'field' | 'tree' | 'seat' | 'wall' | 'path' | 'building' | 'deco' | 'busstop' | 'gate';
type MenuCategory = 'drink' | 'dessert' | 'meal';
type Mood = 'happy' | 'meh' | 'angry';
type GuestPhase = 'walking' | 'seated' | 'leaving';
```

---

### Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `.gitignore`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "jeju-cafe",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "headless": "tsx scripts/headless.ts"
  },
  "dependencies": {
    "pixi.js": "^8.6.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: vite.config.ts, tsconfig.json, index.html, .gitignore**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'], globals: true },
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "scripts"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>제주 귀농 카페</title>
    <style>
      html, body, #root { margin: 0; height: 100%; overflow: hidden; background: #1e1e1e; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
*.csv
```

- [ ] **Step 3: main.tsx와 빈 App.tsx**

`src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
```

`src/ui/App.tsx`:
```tsx
export function App() {
  return <div style={{ color: '#fff', padding: 16 }}>제주 귀농 카페</div>;
}
```

- [ ] **Step 4: 설치·빌드 확인**

Run: `pnpm install && pnpm build`
Expected: `dist/` 생성, 타입 에러 0

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: Vite + React + Pixi + Vitest 스캐폴드"
```

---

### Task 2: 타입과 PRNG

**Files:**
- Create: `src/sim/types.ts`, `src/sim/rng.ts`
- Test: `src/sim/__tests__/rng.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/rng.test.ts`:
```ts
import { nextRandom, randInt, pickWeighted } from '../rng';

test('같은 seed면 같은 수열', () => {
  const a = { rng: 42 };
  const b = { rng: 42 };
  const xs = [nextRandom(a), nextRandom(a), nextRandom(a)];
  const ys = [nextRandom(b), nextRandom(b), nextRandom(b)];
  expect(xs).toEqual(ys);
  expect(xs[0]).toBeGreaterThanOrEqual(0);
  expect(xs[0]).toBeLessThan(1);
});

test('randInt는 [min, max] 범위', () => {
  const s = { rng: 7 };
  for (let i = 0; i < 100; i++) {
    const v = randInt(s, 2, 5);
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThanOrEqual(5);
  }
});

test('pickWeighted는 가중치 0인 항목을 고르지 않는다', () => {
  const s = { rng: 1 };
  for (let i = 0; i < 50; i++) {
    expect(pickWeighted(s, [{ v: 'a', w: 0 }, { v: 'b', w: 1 }], (x) => x.w)?.v).toBe('b');
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/rng.test.ts`
Expected: FAIL — `Cannot find module '../rng'`

- [ ] **Step 3: types.ts 작성**

`src/sim/types.ts`:
```ts
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
  accMs: number;   // 하루 누적 (게임 ms)
  carryMs: number; // 고정 스텝 잔여 (실시간×speed)
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
  tick: number;                 // 고정 스텝 카운터 (STEP_MS마다 +1)
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
  | { type: 'dismissMonthCard' };

export interface ApplyResult { ok: boolean; reason?: string }
```

- [ ] **Step 4: rng.ts 작성**

`src/sim/rng.ts`:
```ts
/** mulberry32. state.rng를 제자리에서 갱신하고 [0,1)을 돌려준다. */
export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state: { rng: number }, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function pickWeighted<T>(state: { rng: number }, items: T[], weightOf: (t: T) => number): T | null {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  if (total <= 0) return null;
  let r = nextRandom(state) * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return items[items.length - 1] ?? null;
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test src/sim/__tests__/rng.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/rng.ts src/sim/__tests__/rng.test.ts
git commit -m "feat(sim): 상태 타입과 seed 기반 PRNG"
```

---

### Task 3: 데이터 JSON과 로더

**Files:**
- Create: `src/data/objects.json`, `src/data/crops.json`, `src/data/menus.json`, `src/data/guests.json`, `src/data/unlocks.json`, `src/data/index.ts`
- Test: `src/sim/__tests__/data.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/data.test.ts`:
```ts
import { OBJECTS, CROPS, MENUS, GUEST_TYPES, UNLOCKS, objectDef, cropDef, menuDef } from '../../data';

test('모든 메뉴 재료는 존재하는 작물', () => {
  for (const m of MENUS) {
    for (const cropId of Object.keys(m.ingredients)) {
      expect(CROPS.some((c) => c.id === cropId)).toBe(true);
    }
  }
});

test('모든 해금 ref는 존재하는 정의', () => {
  for (const u of UNLOCKS) {
    const pool = u.kind === 'object' ? OBJECTS : u.kind === 'menu' ? MENUS : CROPS;
    expect(pool.some((d) => d.id === u.ref)).toBe(true);
  }
});

test('tree 오브젝트는 cropId가 있고 그 작물은 harvestMonths가 있다', () => {
  for (const o of OBJECTS.filter((o) => o.kind === 'tree')) {
    expect(o.cropId).toBeDefined();
    expect(cropDef(o.cropId!).harvestMonths?.length).toBeGreaterThan(0);
  }
});

test('lookup 헬퍼', () => {
  expect(objectDef('field').kind).toBe('field');
  expect(menuDef('tangerine_juice').category).toBe('drink');
  expect(GUEST_TYPES.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/data.test.ts`
Expected: FAIL — `Cannot find module '../../data'`

- [ ] **Step 3: JSON 작성**

`src/data/objects.json`:
```json
[
  { "id": "busstop", "name": "정류장", "kind": "busstop", "w": 1, "h": 1, "cost": 0, "scenery": 0, "noise": 1, "wind": 0, "terrain": ["road"] },
  { "id": "warehouse", "name": "폐창고(카페)", "kind": "building", "w": 3, "h": 2, "cost": 0, "scenery": 0, "noise": 0, "wind": 1, "terrain": ["soil", "rock"] },
  { "id": "gate", "name": "정낭", "kind": "gate", "w": 1, "h": 1, "cost": 0, "scenery": 1, "noise": 0, "wind": 0, "terrain": ["soil", "rock", "road"] },
  { "id": "path", "name": "올렛길", "kind": "path", "w": 1, "h": 1, "cost": 100, "scenery": 0, "noise": 0, "wind": 0, "terrain": ["soil", "rock"] },
  { "id": "field", "name": "밭", "kind": "field", "w": 1, "h": 1, "cost": 300, "scenery": 0, "noise": 0, "wind": 0, "terrain": ["soil"] },
  { "id": "tangerine_tree", "name": "감귤나무", "kind": "tree", "w": 1, "h": 1, "cost": 800, "scenery": 1, "noise": 0, "wind": 1, "cropId": "tangerine", "terrain": ["soil"] },
  { "id": "table_out", "name": "야외 테이블", "kind": "seat", "w": 1, "h": 1, "cost": 500, "scenery": 0, "noise": 0, "wind": 0, "seats": 2, "terrain": ["soil", "rock"] },
  { "id": "stonewall", "name": "돌담", "kind": "wall", "w": 1, "h": 1, "cost": 200, "scenery": 1, "noise": 0, "wind": 2, "terrain": ["soil", "rock"] }
]
```

`src/data/crops.json`:
```json
[
  { "id": "carrot", "name": "당근", "growDays": 60, "plantMonths": [9, 10, 11], "yieldAmount": 4 },
  { "id": "tangerine", "name": "감귤", "growDays": 1080, "plantMonths": [], "harvestMonths": [11, 12, 1], "yieldAmount": 12 }
]
```

`src/data/menus.json`:
```json
[
  { "id": "tangerine_juice", "name": "감귤주스", "category": "drink", "price": 3000, "ingredients": { "tangerine": 1 } },
  { "id": "carrot_juice", "name": "당근주스", "category": "drink", "price": 2500, "ingredients": { "carrot": 1 } },
  { "id": "carrot_cake", "name": "당근케이크", "category": "dessert", "price": 4500, "ingredients": { "carrot": 2 } }
]
```

`src/data/guests.json`:
```json
[
  { "id": "local", "name": "동네 삼춘", "likes": ["drink", "meal"], "minScenery": 0, "popularityShift": -2, "weight": 5 },
  { "id": "tourist", "name": "관광객", "likes": ["drink", "dessert"], "minScenery": 2, "popularityShift": 2, "weight": 5 }
]
```

`src/data/unlocks.json` (일직선. 시작 시 이미 열린 것: field, path, table_out, tangerine_tree / carrot / tangerine_juice, carrot_juice):
```json
[
  { "id": "u1", "kind": "object", "ref": "stonewall", "cost": 5 },
  { "id": "u2", "kind": "menu", "ref": "carrot_cake", "cost": 8 }
]
```

- [ ] **Step 4: index.ts 작성**

`src/data/index.ts`:
```ts
import type { ObjectDef, CropDef, MenuDef, GuestTypeDef, UnlockDef } from '../sim/types';
import objectsJson from './objects.json';
import cropsJson from './crops.json';
import menusJson from './menus.json';
import guestsJson from './guests.json';
import unlocksJson from './unlocks.json';

export const OBJECTS = objectsJson as ObjectDef[];
export const CROPS = cropsJson as CropDef[];
export const MENUS = menusJson as MenuDef[];
export const GUEST_TYPES = guestsJson as GuestTypeDef[];
export const UNLOCKS = unlocksJson as UnlockDef[];

function indexBy<T extends { id: string }>(xs: T[]): Record<string, T> {
  return Object.fromEntries(xs.map((x) => [x.id, x]));
}
const OBJ = indexBy(OBJECTS);
const CROP = indexBy(CROPS);
const MENU = indexBy(MENUS);
const GUEST = indexBy(GUEST_TYPES);

function must<T>(map: Record<string, T>, id: string, what: string): T {
  const v = map[id];
  if (!v) throw new Error(`unknown ${what}: ${id}`);
  return v;
}
export const objectDef = (id: string) => must(OBJ, id, 'object');
export const cropDef = (id: string) => must(CROP, id, 'crop');
export const menuDef = (id: string) => must(MENU, id, 'menu');
export const guestTypeDef = (id: string) => must(GUEST, id, 'guestType');

/** 게임 시작 시 이미 열려 있는 것 */
export const INITIAL_UNLOCKED = {
  objects: ['field', 'path', 'table_out', 'tangerine_tree'],
  menus: ['tangerine_juice', 'carrot_juice'],
  crops: ['carrot', 'tangerine'],
};
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test src/sim/__tests__/data.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/data src/sim/__tests__/data.test.ts
git commit -m "feat(data): 1단계 오브젝트·작물·메뉴·손님·해금 표"
```

---

### Task 4: 초기 상태와 시계

**Files:**
- Create: `src/sim/state.ts`, `src/sim/clock.ts`
- Test: `src/sim/__tests__/clock.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/clock.test.ts`:
```ts
import { createInitialState } from '../state';
import { advanceClock, seasonOf, DAY_MS, monthIndex } from '../clock';

test('초기 상태: 1년 1월 1일, 10×8 격자, 시작 오브젝트', () => {
  const s = createInitialState(1);
  expect(s.clock).toMatchObject({ day: 1, month: 1, year: 1, speed: 1 });
  expect(s.grid.w).toBe(10);
  expect(s.grid.h).toBe(8);
  expect(s.grid.cells.length).toBe(80);
  const types = Object.values(s.objects).map((o) => o.type).sort();
  expect(types).toEqual(['busstop', 'gate', 'warehouse']);
  expect(s.money).toBe(5000);
});

test('맨 아래 줄은 도로', () => {
  const s = createInitialState(1);
  for (let x = 0; x < 10; x++) expect(s.grid.cells[7 * 10 + x]!.terrain).toBe('road');
  expect(s.grid.cells[0]!.terrain).toBe('soil');
});

test('DAY_MS마다 하루, 30일에 달, 12달에 해', () => {
  const s = createInitialState(1);
  const days = advanceClock(s, DAY_MS * 29);
  expect(days).toBe(29);
  expect(s.clock).toMatchObject({ day: 30, month: 1, year: 1 });
  advanceClock(s, DAY_MS);
  expect(s.clock).toMatchObject({ day: 1, month: 2, year: 1 });
  advanceClock(s, DAY_MS * 30 * 11);
  expect(s.clock).toMatchObject({ day: 1, month: 1, year: 2 });
});

test('speed 0이면 멈춤, speed 3이면 3배', () => {
  const s = createInitialState(1);
  s.clock.speed = 0;
  expect(advanceClock(s, DAY_MS * 5)).toBe(0);
  s.clock.speed = 3;
  expect(advanceClock(s, DAY_MS)).toBe(3);
});

test('계절과 monthIndex', () => {
  expect(seasonOf(3)).toBe('spring');
  expect(seasonOf(7)).toBe('summer');
  expect(seasonOf(10)).toBe('autumn');
  expect(seasonOf(12)).toBe('winter');
  expect(monthIndex({ day: 1, month: 3, year: 2, accMs: 0, carryMs: 0, speed: 1 })).toBe(14);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/clock.test.ts`
Expected: FAIL — `Cannot find module '../state'`

- [ ] **Step 3: state.ts 작성**

`src/sim/state.ts`:
```ts
import type { GameState, Cell, PlacedObject } from './types';
import { INITIAL_UNLOCKED } from '../data';

export const GRID_W = 10;
export const GRID_H = 8;
export const SAVE_VERSION = 1;
export const START_MONEY = 5000;
export const MENU_SLOT_COUNT = 4;

function makeCells(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const terrain = y === GRID_H - 1 ? 'road' : (x + y) % 7 === 3 ? 'rock' : 'soil';
      cells.push({ terrain, objectId: null });
    }
  }
  return cells;
}

/** 시작 오브젝트를 격자에 직접 새긴다 (규칙 검사 없이). */
function stamp(state: GameState, type: string, x: number, y: number, w: number, h: number) {
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, crop: null };
  state.objects[id] = obj;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) state.grid.cells[(y + dy) * state.grid.w + (x + dx)]!.objectId = id;
  return obj;
}

export function createInitialState(seed: number, playerId = 'local'): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    playerId,
    seed,
    rng: seed,
    clock: { day: 1, month: 1, year: 1, accMs: 0, carryMs: 0, speed: 1 },
    money: START_MONEY,
    research: 0,
    popularity: 0,
    grid: { w: GRID_W, h: GRID_H, cells: makeCells() },
    objects: {},
    storage: {},
    menuSlots: Array(MENU_SLOT_COUNT).fill(null),
    unlockedIndex: 0,
    unlocked: {
      objects: [...INITIAL_UNLOCKED.objects],
      menus: [...INITIAL_UNLOCKED.menus],
      crops: [...INITIAL_UNLOCKED.crops],
    },
    guests: [],
    nextId: 1,
    monthIncome: 0,
    monthGuests: 0,
    lastMonthCard: null,
    tick: 0,
    actionLog: [],
  };
  stamp(state, 'busstop', 0, GRID_H - 1, 1, 1);
  stamp(state, 'warehouse', 3, 1, 3, 2);
  stamp(state, 'gate', 4, GRID_H - 2, 1, 1); // 정낭 칸은 gate kind라 걷기 가능(path.ts)
  return state;
}
```

- [ ] **Step 4: clock.ts 작성**

`src/sim/clock.ts`:
```ts
import type { Clock, GameState, Season } from './types';

export const DAY_MS = 2000;
export const DAYS_PER_MONTH = 30;

export function seasonOf(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** 1년 1월 = 0 */
export function monthIndex(c: Clock): number {
  return (c.year - 1) * 12 + (c.month - 1);
}

/** 누적 시간을 반영해 며칠이 지났는지 돌려준다. 달·해 넘김 처리 포함. */
export function advanceClock(state: GameState, dtMs: number): number {
  const c = state.clock;
  c.accMs += dtMs * c.speed;
  let days = 0;
  while (c.accMs >= DAY_MS) {
    c.accMs -= DAY_MS;
    days++;
    c.day++;
    if (c.day > DAYS_PER_MONTH) {
      c.day = 1;
      c.month++;
      if (c.month > 12) {
        c.month = 1;
        c.year++;
      }
    }
  }
  return days;
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test src/sim/__tests__/clock.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/sim/state.ts src/sim/clock.ts src/sim/__tests__/clock.test.ts
git commit -m "feat(sim): 초기 상태와 시계"
```

---

### Task 5: 격자 — 배치·제거·방풍·경치

**Files:**
- Create: `src/sim/grid.ts`
- Test: `src/sim/__tests__/grid.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/grid.test.ts`:
```ts
import { createInitialState } from '../state';
import { canPlace, placeObject, removeObject, cellAt, objectAt, windShelter, sceneryScore, isSheltered } from '../grid';

test('빈 흙 칸에 밭을 놓을 수 있다', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 0, 0).ok).toBe(true);
  const obj = placeObject(s, 'field', 0, 0);
  expect(obj.type).toBe('field');
  expect(cellAt(s, 0, 0).objectId).toBe(obj.id);
  expect(objectAt(s, 0, 0)?.id).toBe(obj.id);
});

test('지형이 맞지 않으면 실패', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 0, 7).ok).toBe(false); // 도로
  expect(canPlace(s, 'field', 3, 0).ok).toBe(false); // (3+0)%7===3 → rock
});

test('겹치거나 격자 밖이면 실패', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 3, 1).ok).toBe(false); // 폐창고 위
  expect(canPlace(s, 'field', 9, 9).ok).toBe(false);
  expect(canPlace(s, 'field', -1, 0).ok).toBe(false);
});

test('다중 칸 오브젝트는 모든 칸을 검사한다', () => {
  const s = createInitialState(1);
  placeObject(s, 'field', 1, 0);
  // warehouse 3×2를 (0,0)에 놓으면 (1,0)과 겹침
  expect(canPlace(s, 'warehouse', 0, 0).ok).toBe(false);
});

test('제거하면 칸이 비고 객체가 사라진다', () => {
  const s = createInitialState(1);
  const obj = placeObject(s, 'field', 0, 0);
  removeObject(s, obj.id);
  expect(cellAt(s, 0, 0).objectId).toBeNull();
  expect(s.objects[obj.id]).toBeUndefined();
});

test('북서쪽 돌담이 방풍을 만든다', () => {
  const s = createInitialState(1);
  placeObject(s, 'field', 5, 5);
  expect(windShelter(s, 5, 5)).toBe(0);
  expect(isSheltered(s, 5, 5)).toBe(false);
  placeObject(s, 'stonewall', 4, 4); // wind 2
  expect(windShelter(s, 5, 5)).toBe(2);
  placeObject(s, 'stonewall', 3, 3); // +2 → 4
  expect(isSheltered(s, 5, 5)).toBe(true);
});

test('남동쪽 돌담은 방풍이 아니다', () => {
  const s = createInitialState(1);
  placeObject(s, 'field', 2, 2);
  placeObject(s, 'stonewall', 3, 3);
  expect(windShelter(s, 2, 2)).toBe(0);
});

test('경치 점수 = 반경 2칸 풍경 합 − 소음 합', () => {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', 8, 4);
  expect(sceneryScore(s, seat.x, seat.y)).toBe(0);
  placeObject(s, 'tangerine_tree', 7, 3); // scenery 1
  placeObject(s, 'stonewall', 9, 5);      // scenery 1
  expect(sceneryScore(s, 8, 4)).toBe(2);
  placeObject(s, 'tangerine_tree', 5, 4); // 거리 3 → 제외
  expect(sceneryScore(s, 8, 4)).toBe(2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/grid.test.ts`
Expected: FAIL — `Cannot find module '../grid'`

- [ ] **Step 3: grid.ts 작성**

`src/sim/grid.ts`:
```ts
import type { GameState, Cell, PlacedObject, ApplyResult } from './types';
import { objectDef } from '../data';

export const SHELTER_THRESHOLD = 3;
export const SCENERY_RADIUS = 2;

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.grid.w && y < state.grid.h;
}

export function cellAt(state: GameState, x: number, y: number): Cell {
  const c = state.grid.cells[y * state.grid.w + x];
  if (!c) throw new Error(`cell out of bounds ${x},${y}`);
  return c;
}

export function objectAt(state: GameState, x: number, y: number): PlacedObject | null {
  if (!inBounds(state, x, y)) return null;
  const id = cellAt(state, x, y).objectId;
  return id ? state.objects[id] ?? null : null;
}

export function footprint(type: string, x: number, y: number): { x: number; y: number }[] {
  const def = objectDef(type);
  const cells = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) cells.push({ x: x + dx, y: y + dy });
  return cells;
}

export function canPlace(state: GameState, type: string, x: number, y: number): ApplyResult {
  const def = objectDef(type);
  for (const p of footprint(type, x, y)) {
    if (!inBounds(state, p.x, p.y)) return { ok: false, reason: '격자 밖이에요' };
    const cell = cellAt(state, p.x, p.y);
    if (cell.objectId) return { ok: false, reason: '이미 뭔가 있어요' };
    if (!def.terrain.includes(cell.terrain)) return { ok: false, reason: '여기엔 못 놓아요' };
  }
  return { ok: true };
}

/** 검사 없이 놓는다. 호출 전 canPlace로 확인할 것. */
export function placeObject(state: GameState, type: string, x: number, y: number): PlacedObject {
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, crop: null };
  const def = objectDef(type);
  if (def.kind === 'tree' && def.cropId) {
    obj.crop = { cropId: def.cropId, daysGrown: 0, ready: false, harvestedYear: 0 };
  }
  state.objects[id] = obj;
  for (const p of footprint(type, x, y)) cellAt(state, p.x, p.y).objectId = id;
  return obj;
}

export function removeObject(state: GameState, objectId: string): void {
  const obj = state.objects[objectId];
  if (!obj) return;
  for (const p of footprint(obj.type, obj.x, obj.y)) cellAt(state, p.x, p.y).objectId = null;
  delete state.objects[objectId];
}

/** 북서쪽 대각 띠(7칸)의 wind 합 */
export function windShelter(state: GameState, x: number, y: number): number {
  let sum = 0;
  const seen = new Set<string>();
  for (let dx = 1; dx <= 3; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      if (Math.abs(dx - dy) > 1) continue;
      const o = objectAt(state, x - dx, y - dy);
      if (!o || seen.has(o.id)) continue;
      seen.add(o.id);
      sum += objectDef(o.type).wind;
    }
  }
  return sum;
}

export function isSheltered(state: GameState, x: number, y: number): boolean {
  return windShelter(state, x, y) >= SHELTER_THRESHOLD;
}

/** 반경 2칸(체비쇼프)의 scenery 합 − noise 합. 자기 자신은 제외. */
export function sceneryScore(state: GameState, x: number, y: number): number {
  const self = objectAt(state, x, y)?.id;
  const seen = new Set<string>();
  let score = 0;
  for (let dy = -SCENERY_RADIUS; dy <= SCENERY_RADIUS; dy++) {
    for (let dx = -SCENERY_RADIUS; dx <= SCENERY_RADIUS; dx++) {
      const o = objectAt(state, x + dx, y + dy);
      if (!o || o.id === self || seen.has(o.id)) continue;
      seen.add(o.id);
      const d = objectDef(o.type);
      score += d.scenery - d.noise;
    }
  }
  return score;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/sim/__tests__/grid.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/grid.ts src/sim/__tests__/grid.test.ts
git commit -m "feat(sim): 격자 배치·제거·방풍·경치 계산"
```

---

### Task 6: 농사 — 심기·생육·수확·창고

**Files:**
- Create: `src/sim/farm.ts`
- Test: `src/sim/__tests__/farm.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/farm.test.ts`:
```ts
import { createInitialState } from '../state';
import { placeObject } from '../grid';
import { canPlant, plant, growOneDay, canHarvest, harvest } from '../farm';

function autumn(s: ReturnType<typeof createInitialState>) {
  s.clock.month = 10;
}

test('밭에 제철 작물만 심을 수 있다', () => {
  const s = createInitialState(1);
  const f = placeObject(s, 'field', 0, 0);
  expect(canPlant(s, f.id, 'carrot').ok).toBe(false); // 1월
  autumn(s);
  expect(canPlant(s, f.id, 'carrot').ok).toBe(true);
  plant(s, f.id, 'carrot');
  expect(f.crop?.cropId).toBe('carrot');
  expect(canPlant(s, f.id, 'carrot').ok).toBe(false); // 이미 심음
});

test('나무는 심는 대상이 아니다', () => {
  const s = createInitialState(1);
  const t = placeObject(s, 'tangerine_tree', 0, 0);
  expect(canPlant(s, t.id, 'carrot').ok).toBe(false);
});

test('growDays 뒤에 ready, 수확하면 창고에 들어가고 밭이 빈다', () => {
  const s = createInitialState(1);
  autumn(s);
  const f = placeObject(s, 'field', 5, 5);
  plant(s, f.id, 'carrot');
  for (let i = 0; i < 59; i++) growOneDay(s);
  expect(f.crop?.ready).toBe(false);
  growOneDay(s);
  expect(f.crop?.ready).toBe(true);
  expect(canHarvest(s, f.id).ok).toBe(true);
  harvest(s, f.id);
  expect(s.storage['carrot']).toBe(2); // 방풍 안 됨 → 4의 절반
  expect(f.crop).toBeNull();
});

test('방풍되면 전량 수확', () => {
  const s = createInitialState(1);
  autumn(s);
  const f = placeObject(s, 'field', 5, 5);
  placeObject(s, 'stonewall', 4, 4);
  placeObject(s, 'stonewall', 3, 3);
  plant(s, f.id, 'carrot');
  for (let i = 0; i < 60; i++) growOneDay(s);
  harvest(s, f.id);
  expect(s.storage['carrot']).toBe(4);
});

test('감귤나무: 3년 자란 뒤 수확 달에만, 1년에 한 번', () => {
  const s = createInitialState(1);
  const t = placeObject(s, 'tangerine_tree', 5, 5);
  s.clock.month = 12;
  for (let i = 0; i < 1079; i++) growOneDay(s);
  expect(t.crop?.ready).toBe(false);
  growOneDay(s);
  expect(t.crop?.ready).toBe(true);
  harvest(s, t.id);
  expect(s.storage['tangerine']).toBe(6);
  expect(t.crop).not.toBeNull(); // 나무는 남는다
  expect(t.crop?.ready).toBe(false);
  growOneDay(s);
  expect(t.crop?.ready).toBe(false); // 올해는 이미 땄음
  s.clock.year += 1;
  growOneDay(s);
  expect(t.crop?.ready).toBe(true);
  s.clock.month = 6;
  growOneDay(s);
  expect(t.crop?.ready).toBe(false); // 수확 달이 아님
});

test('12월에 땄으면 이듬해 1월엔 같은 창이라 못 딴다', () => {
  const s = createInitialState(1);
  const t = placeObject(s, 'tangerine_tree', 5, 5);
  s.clock.month = 12;
  for (let i = 0; i < 1080; i++) growOneDay(s);
  harvest(s, t.id);
  s.clock.month = 1; s.clock.year = 2;
  growOneDay(s);
  expect(t.crop?.ready).toBe(false);
  s.clock.month = 11;
  growOneDay(s);
  expect(t.crop?.ready).toBe(true); // 새 창
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/farm.test.ts`
Expected: FAIL — `Cannot find module '../farm'`

- [ ] **Step 3: farm.ts 작성**

`src/sim/farm.ts`:
```ts
import type { GameState, ApplyResult, CropDef } from './types.ts';
import { objectDef, cropDef } from '../data/index.ts';
import { isSheltered } from './grid.ts';

/** 수확 창이 해를 넘기면(11,12,1) 1월은 전년도 창에 속한다. */
export function harvestSeasonYear(crop: CropDef, month: number, year: number): number {
  const first = crop.harvestMonths?.[0];
  if (first === undefined) return year;
  return month < first ? year - 1 : year;
}

export function canPlant(state: GameState, objectId: string, cropId: string): ApplyResult {
  const obj = state.objects[objectId];
  if (!obj) return { ok: false, reason: '없는 오브젝트' };
  if (objectDef(obj.type).kind !== 'field') return { ok: false, reason: '밭이 아니에요' };
  if (obj.crop) return { ok: false, reason: '이미 심었어요' };
  if (!state.unlocked.crops.includes(cropId)) return { ok: false, reason: '아직 모르는 작물' };
  const crop = cropDef(cropId);
  if (!crop.plantMonths.includes(state.clock.month)) return { ok: false, reason: '지금은 심는 철이 아니에요' };
  return { ok: true };
}

export function plant(state: GameState, objectId: string, cropId: string): void {
  const obj = state.objects[objectId]!;
  obj.crop = { cropId, daysGrown: 0, ready: false, harvestedYear: 0 };
}

/** 하루치 생육. 매일 한 번 호출. */
export function growOneDay(state: GameState): void {
  const { month, year } = state.clock;
  for (const obj of Object.values(state.objects)) {
    if (!obj.crop) continue;
    const crop = cropDef(obj.crop.cropId);
    obj.crop.daysGrown++;
    const kind = objectDef(obj.type).kind;
    if (kind === 'tree') {
      const mature = obj.crop.daysGrown >= crop.growDays;
      const inSeason = crop.harvestMonths?.includes(month) ?? false;
      obj.crop.ready = mature && inSeason && obj.crop.harvestedYear !== harvestSeasonYear(crop, month, year);
    } else {
      obj.crop.ready = obj.crop.daysGrown >= crop.growDays;
    }
  }
}

export function canHarvest(state: GameState, objectId: string): ApplyResult {
  const obj = state.objects[objectId];
  if (!obj?.crop) return { ok: false, reason: '수확할 게 없어요' };
  if (!obj.crop.ready) return { ok: false, reason: '아직 덜 자랐어요' };
  return { ok: true };
}

/** 수확량을 창고에 넣는다. 방풍 안 되면 절반. 나무는 남고 밭은 빈다. */
export function harvest(state: GameState, objectId: string): number {
  const obj = state.objects[objectId]!;
  const crop = cropDef(obj.crop!.cropId);
  const amount = isSheltered(state, obj.x, obj.y) ? crop.yieldAmount : Math.floor(crop.yieldAmount / 2);
  state.storage[crop.id] = (state.storage[crop.id] ?? 0) + amount;
  if (objectDef(obj.type).kind === 'tree') {
    obj.crop!.ready = false;
    obj.crop!.harvestedYear = harvestSeasonYear(crop, state.clock.month, state.clock.year);
  } else {
    obj.crop = null;
  }
  return amount;
}

/** 수확 가능한 오브젝트 id 목록 (UI 반짝임·봇용) */
export function readyToHarvest(state: GameState): string[] {
  return Object.values(state.objects).filter((o) => o.crop?.ready).map((o) => o.id);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/sim/__tests__/farm.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/farm.ts src/sim/__tests__/farm.test.ts
git commit -m "feat(sim): 심기·생육·수확·창고"
```

---

### Task 7: 메뉴판 — 슬롯·재료 확인·판매

**Files:**
- Create: `src/sim/menu.ts`
- Test: `src/sim/__tests__/menu.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/menu.test.ts`:
```ts
import { createInitialState } from '../state';
import { canSetSlot, setSlot, isMenuAvailable, availableMenus, consumeIngredients } from '../menu';

test('해금된 메뉴만 슬롯에 올릴 수 있다', () => {
  const s = createInitialState(1);
  expect(canSetSlot(s, 0, 'carrot_cake').ok).toBe(false);
  expect(canSetSlot(s, 0, 'carrot_juice').ok).toBe(true);
  expect(canSetSlot(s, 9, 'carrot_juice').ok).toBe(false);
  setSlot(s, 0, 'carrot_juice');
  expect(s.menuSlots[0]).toBe('carrot_juice');
  setSlot(s, 0, null);
  expect(s.menuSlots[0]).toBeNull();
});

test('재료가 있어야 available', () => {
  const s = createInitialState(1);
  setSlot(s, 0, 'carrot_juice');
  setSlot(s, 1, 'tangerine_juice');
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(false);
  s.storage['carrot'] = 1;
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(true);
  expect(availableMenus(s)).toEqual(['carrot_juice']);
});

test('판매하면 재료가 줄어든다', () => {
  const s = createInitialState(1);
  s.storage['carrot'] = 3;
  consumeIngredients(s, 'carrot_cake');
  expect(s.storage['carrot']).toBe(1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/menu.test.ts`
Expected: FAIL — `Cannot find module '../menu'`

- [ ] **Step 3: menu.ts 작성**

`src/sim/menu.ts`:
```ts
import type { GameState, ApplyResult } from './types';
import { menuDef } from '../data';

export function canSetSlot(state: GameState, slot: number, menuId: string | null): ApplyResult {
  if (slot < 0 || slot >= state.menuSlots.length) return { ok: false, reason: '없는 칸' };
  if (menuId !== null && !state.unlocked.menus.includes(menuId)) return { ok: false, reason: '아직 모르는 메뉴' };
  return { ok: true };
}

export function setSlot(state: GameState, slot: number, menuId: string | null): void {
  state.menuSlots[slot] = menuId;
}

export function isMenuAvailable(state: GameState, menuId: string): boolean {
  const m = menuDef(menuId);
  return Object.entries(m.ingredients).every(([cropId, n]) => (state.storage[cropId] ?? 0) >= n);
}

/** 슬롯에 있고 재료도 있는 메뉴 id 목록 */
export function availableMenus(state: GameState): string[] {
  return state.menuSlots.filter((id): id is string => id !== null && isMenuAvailable(state, id));
}

export function consumeIngredients(state: GameState, menuId: string): void {
  for (const [cropId, n] of Object.entries(menuDef(menuId).ingredients)) {
    state.storage[cropId] = (state.storage[cropId] ?? 0) - n;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/sim/__tests__/menu.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/menu.ts src/sim/__tests__/menu.test.ts
git commit -m "feat(sim): 메뉴판 슬롯과 재료 소비"
```

---

### Task 8: 경로 — 걷기 가능 판정과 BFS 도달 지도

**Files:**
- Create: `src/sim/path.ts`
- Test: `src/sim/__tests__/path.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/path.test.ts`:
```ts
import { createInitialState } from '../state';
import { placeObject } from '../grid';
import { isWalkable, findPath, walkableNeighborsOf, busStopPos, reachMap, pathFromReach, cellKey } from '../path.ts';

test('도로·올렛길·정낭·정류장은 걷기 가능, 흙·밭·건물은 불가', () => {
  const s = createInitialState(1);
  expect(isWalkable(s, 5, 7)).toBe(true);  // 도로
  expect(isWalkable(s, 0, 7)).toBe(true);  // 정류장
  expect(isWalkable(s, 4, 6)).toBe(true);  // 정낭
  expect(isWalkable(s, 5, 5)).toBe(false); // 흙
  expect(isWalkable(s, 3, 1)).toBe(false); // 폐창고
  placeObject(s, 'path', 5, 5);
  expect(isWalkable(s, 5, 5)).toBe(true);
});

test('정류장 → 정낭 경로가 있다', () => {
  const s = createInitialState(1);
  const p = findPath(s, busStopPos(s), { x: 4, y: 6 });
  expect(p).not.toBeNull();
  expect(p![0]).toEqual({ x: 0, y: 7 });
  expect(p![p!.length - 1]).toEqual({ x: 4, y: 6 });
  expect(p!.length).toBe(6); // 4칸 오른쪽 + 1칸 위 + 시작점
});

test('끊긴 곳으로는 경로가 없다', () => {
  const s = createInitialState(1);
  expect(findPath(s, busStopPos(s), { x: 8, y: 2 })).toBeNull();
});

test('좌석 옆 걷기 가능 칸', () => {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', 4, 5); // 정낭(4,6) 바로 위
  expect(walkableNeighborsOf(s, seat.x, seat.y)).toEqual([{ x: 4, y: 6 }]);
});

test('reachMap은 거리와 경로를 한 번에 준다', () => {
  const s = createInitialState(1);
  placeObject(s, 'path', 4, 5);
  const r = reachMap(s, busStopPos(s));
  expect(r.dist.get(cellKey(s, { x: 4, y: 6 }))).toBe(5);
  expect(r.dist.get(cellKey(s, { x: 4, y: 5 }))).toBe(6);
  expect(r.dist.has(cellKey(s, { x: 8, y: 2 }))).toBe(false);
  const p = pathFromReach(s, r, { x: 4, y: 5 })!;
  expect(p[0]).toEqual({ x: 0, y: 7 });
  expect(p[p.length - 1]).toEqual({ x: 4, y: 5 });
  expect(p.length).toBe(7);
  expect(pathFromReach(s, r, { x: 8, y: 2 })).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/path.test.ts`
Expected: FAIL — `Cannot find module '../path'`

- [ ] **Step 3: path.ts 작성**

`src/sim/path.ts`:
```ts
import type { GameState, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { inBounds, cellAt, objectAt } from './grid.ts';

const WALKABLE_KINDS = new Set(['path', 'gate', 'busstop']);

export function isWalkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  const obj = objectAt(state, x, y);
  if (obj) return WALKABLE_KINDS.has(objectDef(obj.type).kind);
  return cellAt(state, x, y).terrain === 'road';
}

export function busStopPos(state: GameState): Pt {
  const bus = Object.values(state.objects).find((o) => o.type === 'busstop');
  if (!bus) throw new Error('정류장이 없어요');
  return { x: bus.x, y: bus.y };
}

const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export function walkableNeighborsOf(state: GameState, x: number, y: number): Pt[] {
  return DIRS.map((d) => ({ x: x + d.x, y: y + d.y })).filter((p) => isWalkable(state, p.x, p.y));
}

export const cellKey = (state: GameState, p: Pt) => p.y * state.grid.w + p.x;

/** from에서 닿는 모든 걷기 칸까지의 거리와 직전 칸. 한 번 계산해 여러 목적지에 재사용. */
export interface Reach { from: Pt; dist: Map<number, number>; prev: Map<number, number> }

export function reachMap(state: GameState, from: Pt): Reach {
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const queue: Pt[] = [from];
  dist.set(cellKey(state, from), 0);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    const pk = cellKey(state, p);
    for (const n of walkableNeighborsOf(state, p.x, p.y)) {
      const nk = cellKey(state, n);
      if (dist.has(nk)) continue;
      dist.set(nk, dist.get(pk)! + 1);
      prev.set(nk, pk);
      queue.push(n);
    }
  }
  return { from, dist, prev };
}

/** reach.from → to 경로 (양 끝 포함). 닿지 않으면 null. */
export function pathFromReach(state: GameState, reach: Reach, to: Pt): Pt[] | null {
  const toKey = cellKey(state, to);
  if (!reach.dist.has(toKey)) return null;
  const out: Pt[] = [];
  let k: number | undefined = toKey;
  while (k !== undefined) {
    out.unshift({ x: k % state.grid.w, y: Math.floor(k / state.grid.w) });
    k = reach.prev.get(k);
  }
  return out;
}

/** 단발 경로. 스폰처럼 목적지가 여러 개면 reachMap + pathFromReach를 쓸 것. */
export function findPath(state: GameState, from: Pt, to: Pt): Pt[] | null {
  return pathFromReach(state, reachMap(state, from), to);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/sim/__tests__/path.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/path.ts src/sim/__tests__/path.test.ts
git commit -m "feat(sim): 걷기 판정과 BFS 도달 지도"
```

---

### Task 9: 손님 — 스폰·이동·주문·만족·퇴장

**Files:**
- Create: `src/sim/guests.ts`
- Test: `src/sim/__tests__/guests.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/guests.test.ts`:
```ts
import { createInitialState } from '../state';
import { placeObject } from '../grid';
import { setSlot } from '../menu';
import { spawnGuests, updateGuests, freeSeats, GUEST_SPEED_CELLS_PER_S, SEAT_MS } from '../guests';

/** 정낭(4,6) 바로 위 (4,5)에 테이블 → 정낭이 테이블의 걷기 이웃 */
function cafe() {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', 4, 5);
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 10;
  return { s, seat };
}

test('빈 좌석과 경로가 있어야 스폰', () => {
  const s = createInitialState(1);
  expect(spawnGuests(s, 3)).toBe(0); // 좌석 없음
  const { s: s2 } = cafe();
  expect(freeSeats(s2).length).toBe(1);
  expect(spawnGuests(s2, 3)).toBe(2); // 테이블 1개 = 2석 → 2명
  expect(s2.guests[0]!.phase).toBe('walking');
  expect(s2.guests[0]!.seatId).toBeDefined();
});

test('가까운 좌석부터 배정한다', () => {
  const { s } = cafe();
  // 멀리 있는 두 번째 테이블: 정낭 (4,6) → 올렛길 (5,6),(6,6) → 테이블 (7,6)
  placeObject(s, 'path', 5, 6);
  placeObject(s, 'path', 6, 6);
  const far = placeObject(s, 'table_out', 7, 6);
  spawnGuests(s, 3);
  expect(s.guests.map((g) => g.seatId === far.id)).toEqual([false, false, true]);
});

test('걸어가서 앉고, 주문하고, 돈과 연구가 오른다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  const money0 = s.money;
  // 경로 길이 5칸 → 5/속도 초
  updateGuests(s, (6 / GUEST_SPEED_CELLS_PER_S) * 1000);
  expect(g.phase).toBe('seated');
  expect(g.menuId).toBe('carrot_juice');
  expect(g.mood).not.toBeNull();
  expect(s.money).toBe(money0 + 2500);
  expect(s.storage['carrot']).toBe(9);
});

test('좋아하는 메뉴가 없으면 😐, 돈 없음', () => {
  const { s } = cafe();
  s.storage['carrot'] = 0;
  spawnGuests(s, 1);
  const money0 = s.money;
  updateGuests(s, 10_000);
  const g = s.guests[0]!;
  expect(g.mood).toBe('meh');
  expect(s.money).toBe(money0);
});

test('앉은 시간이 지나면 나가고, 정류장에 닿으면 사라진다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  updateGuests(s, 6000);
  expect(s.guests[0]!.phase).toBe('seated');
  updateGuests(s, SEAT_MS);
  expect(s.guests[0]!.phase).toBe('leaving');
  updateGuests(s, 10_000);
  expect(s.guests.length).toBe(0);
});

test('😊이면 연구 +1, 게이지가 타입 방향으로 움직인다', () => {
  const { s } = cafe();
  // 삼춘만 오게 강제
  s.rng = 3;
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  g.type = 'local';
  updateGuests(s, 6000);
  expect(g.mood).toBe('happy'); // local minScenery 0
  expect(s.research).toBe(1);
  expect(s.popularity).toBe(-2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/guests.test.ts`
Expected: FAIL — `Cannot find module '../guests'`

- [ ] **Step 3: guests.ts 작성**

`src/sim/guests.ts`:
```ts
import type { GameState, Guest, PlacedObject, Pt } from './types.ts';
import { objectDef, menuDef, guestTypeDef, GUEST_TYPES } from '../data/index.ts';
import { pickWeighted } from './rng.ts';
import { sceneryScore } from './grid.ts';
import { availableMenus, consumeIngredients } from './menu.ts';
import { busStopPos, findPath, walkableNeighborsOf, reachMap, pathFromReach, cellKey } from './path.ts';

export const GUEST_SPEED_CELLS_PER_S = 3;
export const SEAT_MS = 4000;
export const MAX_GUESTS = 30;

function seatObjects(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => objectDef(o.type).kind === 'seat');
}

/** 아직 손님이 배정되지 않은 좌석 오브젝트 */
export function freeSeats(state: GameState): PlacedObject[] {
  const taken = new Map<string, number>();
  for (const g of state.guests) if (g.seatId && g.phase !== 'leaving') taken.set(g.seatId, (taken.get(g.seatId) ?? 0) + 1);
  return seatObjects(state).filter((o) => (taken.get(o.id) ?? 0) < (objectDef(o.type).seats ?? 1));
}

/** 최대 n명 스폰. 정류장에서 가장 가까운 빈 좌석부터. 실제 스폰된 수를 돌려준다. */
export function spawnGuests(state: GameState, n: number): number {
  let spawned = 0;
  const start = busStopPos(state);
  const reach = reachMap(state, start); // 걷기 지형은 스폰 중 안 바뀌므로 한 번만
  for (let i = 0; i < n && state.guests.length < MAX_GUESTS; i++) {
    let best: { seat: PlacedObject; target: Pt; dist: number } | null = null;
    for (const seat of freeSeats(state)) {
      for (const nb of walkableNeighborsOf(state, seat.x, seat.y)) {
        const d = reach.dist.get(cellKey(state, nb));
        if (d === undefined) continue;
        if (!best || d < best.dist) best = { seat, target: nb, dist: d };
      }
    }
    if (!best) break;
    const path = pathFromReach(state, reach, best.target)!;
    const type = pickWeighted(state, GUEST_TYPES, (t) => t.weight)!;
    state.guests.push({
      id: `g${state.nextId++}`,
      type: type.id,
      phase: 'walking',
      x: start.x,
      y: start.y,
      path: path.slice(1),
      seatId: best.seat.id,
      menuId: null,
      mood: null,
      timerMs: 0,
    });
    spawned++;
  }
  return spawned;
}

function moveAlong(g: Guest, dtMs: number): boolean {
  let budget = (dtMs / 1000) * GUEST_SPEED_CELLS_PER_S;
  while (budget > 0 && g.path.length) {
    const next = g.path[0]!;
    const dx = next.x - g.x;
    const dy = next.y - g.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= budget) {
      g.x = next.x;
      g.y = next.y;
      g.path.shift();
      budget -= dist;
    } else {
      g.x += Math.sign(dx) * budget;
      g.y += Math.sign(dy) * budget;
      budget = 0;
    }
  }
  return g.path.length === 0;
}

function order(state: GameState, g: Guest): void {
  const type = guestTypeDef(g.type);
  const seat = state.objects[g.seatId!]!;
  const candidates = availableMenus(state).filter((id) => type.likes.includes(menuDef(id).category));
  if (candidates.length === 0) {
    g.mood = 'meh';
    return;
  }
  const menuId = pickWeighted(state, candidates, () => 1)!;
  const menu = menuDef(menuId);
  consumeIngredients(state, menuId);
  state.money += menu.price;
  state.monthIncome += menu.price;
  state.monthGuests++;
  g.menuId = menuId;
  const scenery = sceneryScore(state, seat.x, seat.y);
  if (scenery >= type.minScenery) {
    g.mood = 'happy';
    state.research += 1;
    state.popularity = Math.max(-100, Math.min(100, state.popularity + type.popularityShift));
  } else {
    g.mood = 'meh';
  }
}

export function updateGuests(state: GameState, dtMs: number): void {
  const bus = busStopPos(state);
  for (const g of state.guests) {
    if (g.phase === 'walking') {
      if (moveAlong(g, dtMs)) {
        g.phase = 'seated';
        g.timerMs = SEAT_MS;
        order(state, g);
      }
    } else if (g.phase === 'seated') {
      g.timerMs -= dtMs;
      if (g.timerMs <= 0) {
        g.phase = 'leaving';
        g.seatId = null;
        const back = findPath(state, { x: Math.round(g.x), y: Math.round(g.y) }, bus);
        g.path = back ? back.slice(1) : [];
      }
    } else if (g.phase === 'leaving') {
      moveAlong(g, dtMs);
    }
  }
  state.guests = state.guests.filter((g) => !(g.phase === 'leaving' && g.path.length === 0));
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/sim/__tests__/guests.test.ts`
Expected: PASS (5 tests). "😊이면 연구 +1" 테스트에서 `s.popularity`가 −2가 아니면 `g.type = 'local'` 강제가 spawn 뒤에 들어갔는지 확인.

- [ ] **Step 5: Commit**

```bash
git add src/sim/guests.ts src/sim/__tests__/guests.test.ts
git commit -m "feat(sim): 손님 스폰·이동·주문·만족·퇴장"
```

---

### Task 10: 진행 — 연구 포인트와 일직선 해금

**Files:**
- Create: `src/sim/progress.ts`
- Test: `src/sim/__tests__/progress.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/progress.test.ts`:
```ts
import { createInitialState } from '../state';
import { nextUnlock, canUnlock, unlock } from '../progress';

test('다음 해금이 보이고, 포인트가 모자라면 못 연다', () => {
  const s = createInitialState(1);
  expect(nextUnlock(s)?.ref).toBe('stonewall');
  expect(canUnlock(s).ok).toBe(false);
  s.research = 5;
  expect(canUnlock(s).ok).toBe(true);
  unlock(s);
  expect(s.research).toBe(0);
  expect(s.unlocked.objects).toContain('stonewall');
  expect(nextUnlock(s)?.ref).toBe('carrot_cake');
});

test('다 열면 null', () => {
  const s = createInitialState(1);
  s.research = 100;
  unlock(s);
  unlock(s);
  expect(nextUnlock(s)).toBeNull();
  expect(canUnlock(s).ok).toBe(false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/progress.test.ts`
Expected: FAIL — `Cannot find module '../progress'`

- [ ] **Step 3: progress.ts 작성**

`src/sim/progress.ts`:
```ts
import type { GameState, ApplyResult, UnlockDef } from './types';
import { UNLOCKS } from '../data';

export function nextUnlock(state: GameState): UnlockDef | null {
  return UNLOCKS[state.unlockedIndex] ?? null;
}

export function canUnlock(state: GameState): ApplyResult {
  const u = nextUnlock(state);
  if (!u) return { ok: false, reason: '다 열었어요' };
  if (state.research < u.cost) return { ok: false, reason: '연구 포인트가 모자라요' };
  return { ok: true };
}

export function unlock(state: GameState): UnlockDef | null {
  if (!canUnlock(state).ok) return null;
  const u = nextUnlock(state)!;
  state.research -= u.cost;
  state.unlockedIndex++;
  const bucket = u.kind === 'object' ? state.unlocked.objects : u.kind === 'menu' ? state.unlocked.menus : state.unlocked.crops;
  if (!bucket.includes(u.ref)) bucket.push(u.ref);
  return u;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/sim/__tests__/progress.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/progress.ts src/sim/__tests__/progress.test.ts
git commit -m "feat(sim): 연구 포인트와 일직선 해금"
```

---

### Task 11: apply(action)와 tick

**Files:**
- Create: `src/sim/actions.ts`, `src/sim/tick.ts`, `src/sim/index.ts`
- Test: `src/sim/__tests__/actions.test.ts`, `src/sim/__tests__/tick.test.ts`

- [ ] **Step 1: 실패하는 테스트 — actions**

`src/sim/__tests__/actions.test.ts`:
```ts
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { spawnGuests } from '../guests.ts';

test('place: 돈이 있어야 하고, 깎이고, 로그에 남는다', () => {
  const s = createInitialState(1);
  expect(apply(s, { type: 'place', objectType: 'field', x: 0, y: 0 }).ok).toBe(true);
  expect(s.money).toBe(4700);
  expect(Object.values(s.objects).some((o) => o.type === 'field')).toBe(true);
  expect(s.actionLog).toEqual([{ tick: 0, action: { type: 'place', objectType: 'field', x: 0, y: 0 } }]);
});

test('setSpeed·dismissMonthCard는 로그에 남지 않는다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'setSpeed', speed: 2 });
  apply(s, { type: 'dismissMonthCard' });
  expect(s.actionLog.length).toBe(0);
});

test('place: 해금 안 된 오브젝트는 거부', () => {
  const s = createInitialState(1);
  const r = apply(s, { type: 'place', objectType: 'stonewall', x: 0, y: 0 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('아직 못 짓는 것');
});

test('place: 돈 부족', () => {
  const s = createInitialState(1);
  s.money = 100;
  expect(apply(s, { type: 'place', objectType: 'field', x: 0, y: 0 }).ok).toBe(false);
});

test('remove: 시작 오브젝트(정류장·창고)는 못 없앤다, 나머지는 전액 환불', () => {
  const s = createInitialState(1);
  const bus = Object.values(s.objects).find((o) => o.type === 'busstop')!;
  expect(apply(s, { type: 'remove', objectId: bus.id }).ok).toBe(false);
  apply(s, { type: 'place', objectType: 'field', x: 0, y: 0 });
  const f = Object.values(s.objects).find((o) => o.type === 'field')!;
  expect(apply(s, { type: 'remove', objectId: f.id }).ok).toBe(true);
  expect(s.money).toBe(5000);
});

test('remove: 손님이 지나갈 올렛길은 못 없앤다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'path', x: 4, y: 5 });
  apply(s, { type: 'place', objectType: 'table_out', x: 4, y: 4 });
  const path = Object.values(s.objects).find((o) => o.type === 'path')!;
  spawnGuests(s, 1);
  expect(s.guests[0]!.path.some((p) => p.x === 4 && p.y === 5)).toBe(true);
  expect(apply(s, { type: 'remove', objectId: path.id }).ok).toBe(false);
});

test('plant → harvest 흐름', () => {
  const s = createInitialState(1);
  s.clock.month = 10;
  apply(s, { type: 'place', objectType: 'field', x: 0, y: 0 });
  const f = Object.values(s.objects).find((o) => o.type === 'field')!;
  expect(apply(s, { type: 'plant', objectId: f.id, cropId: 'carrot' }).ok).toBe(true);
  expect(apply(s, { type: 'harvest', objectId: f.id }).ok).toBe(false);
  f.crop!.ready = true;
  expect(apply(s, { type: 'harvest', objectId: f.id }).ok).toBe(true);
  expect(s.storage['carrot']).toBe(2);
});

test('setSpeed·setSlot·unlock·dismissMonthCard', () => {
  const s = createInitialState(1);
  expect(apply(s, { type: 'setSpeed', speed: 3 }).ok).toBe(true);
  expect(s.clock.speed).toBe(3);
  expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'carrot_juice' }).ok).toBe(true);
  expect(apply(s, { type: 'unlock' }).ok).toBe(false);
  s.research = 5;
  expect(apply(s, { type: 'unlock' }).ok).toBe(true);
  s.lastMonthCard = { income: 1, guests: 1, month: 1, year: 1 };
  apply(s, { type: 'dismissMonthCard' });
  expect(s.lastMonthCard).toBeNull();
});
```

- [ ] **Step 2: 실패하는 테스트 — tick**

`src/sim/__tests__/tick.test.ts`:
```ts
import { createInitialState } from '../state';
import { apply } from '../actions';
import { tick } from '../tick';
import { DAY_MS } from '../clock';

function cafe() {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: 4, y: 5 });
  apply(s, { type: 'setSlot', slot: 0, menuId: 'carrot_juice' });
  s.storage['carrot'] = 50;
  return s;
}

test('하루가 지나면 손님이 온다', () => {
  const s = cafe();
  tick(s, DAY_MS);
  expect(s.guests.length).toBeGreaterThan(0);
});

test('한 달 지나면 정산 카드가 생기고 월 누적이 리셋된다', () => {
  const s = cafe();
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.clock.month).toBe(2);
  expect(s.lastMonthCard?.month).toBe(1);
  expect(s.lastMonthCard!.income).toBeGreaterThan(0);
  expect(s.monthIncome).toBe(0);
});

test('프레임 길이가 달라도 결과가 같다 (고정 스텝)', () => {
  const a = cafe();
  const b = cafe();
  for (let i = 0; i < 100; i++) tick(a, 700);
  for (let i = 0; i < 700; i++) tick(b, 100);
  expect(a.tick).toBe(b.tick);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test('speed 3이면 같은 실시간에 3배 스텝', () => {
  const s = cafe();
  apply(s, { type: 'setSpeed', speed: 3 });
  tick(s, 1000);
  expect(s.tick).toBe(30);
});

test('speed 0이면 손님도 안 움직인다', () => {
  const s = cafe();
  tick(s, DAY_MS);
  const t0 = s.tick;
  apply(s, { type: 'setSpeed', speed: 0 });
  tick(s, 1000);
  expect(s.tick).toBe(t0);
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm test src/sim/__tests__/actions.test.ts src/sim/__tests__/tick.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: actions.ts 작성**

`src/sim/actions.ts`:
```ts
import type { GameState, Action, ApplyResult } from './types.ts';
import { objectDef } from '../data/index.ts';
import { canPlace, placeObject, removeObject, footprint } from './grid.ts';
import { canPlant, plant, canHarvest, harvest } from './farm.ts';
import { canSetSlot, setSlot } from './menu.ts';
import { canUnlock, unlock } from './progress.ts';

const PROTECTED_TYPES = new Set(['busstop', 'warehouse', 'gate']);
const ACTION_LOG_CAP = 1000;

const CLIENT_ONLY = new Set<Action['type']>(['setSpeed', 'dismissMonthCard']);

function log(state: GameState, a: Action) {
  if (CLIENT_ONLY.has(a.type)) return;
  state.actionLog.push({ tick: state.tick, action: a });
  if (state.actionLog.length > ACTION_LOG_CAP) state.actionLog.shift();
}

export function apply(state: GameState, a: Action): ApplyResult {
  const r = applyInner(state, a);
  if (r.ok) log(state, a);
  return r;
}

function applyInner(state: GameState, a: Action): ApplyResult {
  switch (a.type) {
    case 'place': {
      if (!state.unlocked.objects.includes(a.objectType)) return { ok: false, reason: '아직 못 짓는 것' };
      const def = objectDef(a.objectType);
      if (state.money < def.cost) return { ok: false, reason: '돈이 모자라요' };
      const c = canPlace(state, a.objectType, a.x, a.y);
      if (!c.ok) return c;
      placeObject(state, a.objectType, a.x, a.y);
      state.money -= def.cost;
      return { ok: true };
    }
    case 'remove': {
      const obj = state.objects[a.objectId];
      if (!obj) return { ok: false, reason: '없는 오브젝트' };
      if (PROTECTED_TYPES.has(obj.type)) return { ok: false, reason: '이건 못 없애요' };
      if (state.guests.some((g) => g.seatId === obj.id)) return { ok: false, reason: '손님이 앉아 있어요' };
      const cells = new Set(footprint(obj.type, obj.x, obj.y).map((p) => `${p.x},${p.y}`));
      if (state.guests.some((g) => g.path.some((p) => cells.has(`${p.x},${p.y}`)))) return { ok: false, reason: '손님이 지나가는 중이에요' };
      state.money += objectDef(obj.type).cost;
      removeObject(state, a.objectId);
      return { ok: true };
    }
    case 'plant': {
      const c = canPlant(state, a.objectId, a.cropId);
      if (!c.ok) return c;
      plant(state, a.objectId, a.cropId);
      return { ok: true };
    }
    case 'harvest': {
      const c = canHarvest(state, a.objectId);
      if (!c.ok) return c;
      harvest(state, a.objectId);
      return { ok: true };
    }
    case 'setSlot': {
      const c = canSetSlot(state, a.slot, a.menuId);
      if (!c.ok) return c;
      setSlot(state, a.slot, a.menuId);
      return { ok: true };
    }
    case 'setSpeed':
      state.clock.speed = a.speed;
      return { ok: true };
    case 'unlock': {
      const c = canUnlock(state);
      if (!c.ok) return c;
      unlock(state);
      return { ok: true };
    }
    case 'dismissMonthCard':
      state.lastMonthCard = null;
      return { ok: true };
  }
}
```

- [ ] **Step 5: tick.ts와 index.ts 작성**

`src/sim/tick.ts`:
```ts
import type { GameState } from './types.ts';
import { advanceClock } from './clock.ts';
import { growOneDay } from './farm.ts';
import { spawnGuests, updateGuests, freeSeats } from './guests.ts';

export const STEP_MS = 100;        // 고정 스텝 (게임 ms)
export const DAILY_SPAWN_CAP = 3;
const MAX_STEPS_PER_TICK = 600;    // 백그라운드 복귀 등 폭주 방지 (60초 게임 시간)

function onNewDay(state: GameState): void {
  growOneDay(state);
  const n = Math.min(DAILY_SPAWN_CAP, freeSeats(state).length);
  spawnGuests(state, n);
}

function onNewMonth(state: GameState, prevMonth: number, prevYear: number): void {
  state.lastMonthCard = { income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear };
  state.monthIncome = 0;
  state.monthGuests = 0;
}

/** 고정 스텝 하나. 결정적. 리플레이는 이 함수만 호출한다. */
export function step(state: GameState): void {
  const prevMonth = state.clock.month;
  const prevYear = state.clock.year;
  const days = advanceClock(state, STEP_MS);
  for (let i = 0; i < days; i++) onNewDay(state);
  if (state.clock.month !== prevMonth) onNewMonth(state, prevMonth, prevYear);
  updateGuests(state, STEP_MS);
  state.tick++;
}

/** 실시간 dtMs를 speed로 환산해 STEP_MS 단위로 step을 돌린다. 잔여는 clock.carryMs에 보관. */
export function tick(state: GameState, dtMs: number): GameState {
  const c = state.clock;
  c.carryMs += dtMs * c.speed;
  let steps = 0;
  while (c.carryMs >= STEP_MS && steps < MAX_STEPS_PER_TICK) {
    c.carryMs -= STEP_MS;
    step(state);
    steps++;
  }
  if (steps === MAX_STEPS_PER_TICK) c.carryMs = 0;
  return state;
}
```

주의: `advanceClock(state, STEP_MS)`는 speed를 곱하지 않도록 `clock.ts`의 `advanceClock`에서 `c.accMs += dtMs * c.speed`를 `c.accMs += dtMs`로 바꾼다(speed 환산은 `tick`이 담당). `clock.test.ts`의 "speed 0이면 멈춤, speed 3이면 3배" 테스트는 삭제하고 tick 테스트로 대체한다.

`src/sim/index.ts`:
```ts
export * from './types';
export { createInitialState, GRID_W, GRID_H, MENU_SLOT_COUNT } from './state';
export { tick, step, STEP_MS } from './tick';
export { apply } from './actions';
export { DAY_MS, seasonOf, monthIndex } from './clock';
export { cellAt, objectAt, canPlace, footprint, isSheltered, sceneryScore } from './grid';
export { canPlant, canHarvest, readyToHarvest } from './farm';
export { isMenuAvailable, availableMenus } from './menu';
export { isWalkable } from './path';
export { nextUnlock, canUnlock } from './progress';
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm test`
Expected: 전부 PASS. tick 테스트 중 "하루가 지나면 손님이 온다"가 실패하면 좌석 (4,5)이 정낭 (4,6)과 인접한지 확인.

- [ ] **Step 7: Commit**

```bash
git add src/sim/actions.ts src/sim/tick.ts src/sim/index.ts src/sim/__tests__/actions.test.ts src/sim/__tests__/tick.test.ts
git commit -m "feat(sim): apply(action)과 tick, 공개 API"
```

---

### Task 12: 세이브 — SaveStore와 LocalSaveStore

**Files:**
- Create: `src/sim/save.ts`
- Test: `src/sim/__tests__/save.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/sim/__tests__/save.test.ts`:
```ts
import { createInitialState } from '../state';
import { apply } from '../actions';
import { tick } from '../tick';
import { serialize, deserialize, MemorySaveStore } from '../save';

test('직렬화 왕복이 같은 상태를 만든다', () => {
  const s = createInitialState(9);
  apply(s, { type: 'place', objectType: 'field', x: 0, y: 0 });
  tick(s, 5000);
  const back = deserialize(serialize(s));
  expect(back).toEqual(s);
});

test('버전이 다르면 거부', () => {
  const s = createInitialState(9);
  const json = serialize(s).replace('"version":1', '"version":999');
  expect(() => deserialize(json)).toThrow(/version/);
});

test('SaveStore: save/load/list', async () => {
  const store = new MemorySaveStore();
  const s = createInitialState(9);
  await store.save(1, s);
  expect(await store.list()).toEqual([1]);
  expect(await store.load(1)).toEqual(s);
  expect(await store.load(2)).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/sim/__tests__/save.test.ts`
Expected: FAIL — `Cannot find module '../save'`

- [ ] **Step 3: save.ts 작성**

`src/sim/save.ts`:
```ts
import type { GameState } from './types.ts';
import { SAVE_VERSION } from './state.ts';
import { footprint } from './grid.ts';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const obj = JSON.parse(json) as GameState;
  if (obj.version !== SAVE_VERSION) throw new Error(`save version mismatch: ${obj.version} (expected ${SAVE_VERSION})`);
  rebuildCellOwnership(obj);
  return obj;
}

/** objects.json의 w/h가 바뀌어도 세이브가 깨지지 않도록 cells[].objectId를 objects에서 다시 만든다. */
function rebuildCellOwnership(state: GameState): void {
  for (const c of state.grid.cells) c.objectId = null;
  for (const o of Object.values(state.objects))
    for (const p of footprint(o.type, o.x, o.y)) {
      const cell = state.grid.cells[p.y * state.grid.w + p.x];
      if (cell) cell.objectId = o.id;
    }
}

/** 저장 계층 추상화. 2차에서 Supabase 구현으로 교체 가능. */
export interface SaveStore {
  save(slot: number, state: GameState): Promise<void>;
  load(slot: number): Promise<GameState | null>;
  list(): Promise<number[]>;
}

export class MemorySaveStore implements SaveStore {
  private map = new Map<number, string>();
  async save(slot: number, state: GameState) { this.map.set(slot, serialize(state)); }
  async load(slot: number) { const j = this.map.get(slot); return j ? deserialize(j) : null; }
  async list() { return [...this.map.keys()].sort(); }
}

export class LocalSaveStore implements SaveStore {
  constructor(private prefix = 'jeju-cafe:slot:') {}
  private key(slot: number) { return `${this.prefix}${slot}`; }
  async save(slot: number, state: GameState) { localStorage.setItem(this.key(slot), serialize(state)); }
  async load(slot: number) {
    const j = localStorage.getItem(this.key(slot));
    if (!j) return null;
    try { return deserialize(j); } catch { return null; }
  }
  async list() {
    const out: number[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(this.prefix)) out.push(Number(k.slice(this.prefix.length)));
    }
    return out.sort();
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/sim/__tests__/save.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/save.ts src/sim/__tests__/save.test.ts
git commit -m "feat(sim): 직렬화와 SaveStore(Local/Memory)"
```

---

### Task 13: 헤드리스 시뮬레이터 (밸런싱 봇)

**Files:**
- Create: `scripts/headless.ts`

- [ ] **Step 1: 봇 작성**

`scripts/headless.ts`:
```ts
/**
 * 단순 봇이 N년을 자동 플레이하고 월별 CSV를 stdout에 찍는다.
 * 사용: pnpm headless [years=3] [seed=1] > out.csv
 */
import { createInitialState, tick, apply, DAY_MS, GRID_W, GRID_H } from '../src/sim';
import { canPlace, objectAt } from '../src/sim/grid';
import { readyToHarvest } from '../src/sim/farm';
import { nextUnlock, canUnlock } from '../src/sim/progress';
import { objectDef } from '../src/data';

const years = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 1);
const s = createInitialState(seed);

function tryPlaceAnywhere(type: string): boolean {
  for (let y = 0; y < GRID_H - 1; y++)
    for (let x = 0; x < GRID_W; x++)
      if (canPlace(s, type, x, y).ok && apply(s, { type: 'place', objectType: type, x, y }).ok) return true;
  return false;
}

/** 정낭(4,6)에서 위로 올렛길을 깔아 좌석까지 연결 */
function ensurePath() {
  for (let y = 5; y >= 3; y--) if (!objectAt(s, 4, y)) apply(s, { type: 'place', objectType: 'path', x: 4, y });
}

function monthlyPlan() {
  ensurePath();
  const seats = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat').length;
  const fields = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'field').length;
  if (seats < 2) { apply(s, { type: 'place', objectType: 'table_out', x: 3, y: 5 }); apply(s, { type: 'place', objectType: 'table_out', x: 5, y: 5 }); }
  if (fields < 6 && s.money >= 300) tryPlaceAnywhere('field');
  if (s.menuSlots[0] === null) apply(s, { type: 'setSlot', slot: 0, menuId: 'carrot_juice' });
  if (s.unlocked.menus.includes('carrot_cake') && s.menuSlots[1] === null) apply(s, { type: 'setSlot', slot: 1, menuId: 'carrot_cake' });
  for (const o of Object.values(s.objects))
    if (objectDef(o.type).kind === 'field' && !o.crop) apply(s, { type: 'plant', objectId: o.id, cropId: 'carrot' });
  while (canUnlock(s).ok) apply(s, { type: 'unlock' });
  if (s.unlocked.objects.includes('stonewall') && s.money >= 1000) tryPlaceAnywhere('stonewall');
}

console.log('year,month,money,research,popularity,carrot,nextUnlock');
let lastMonth = 0;
const totalDays = years * 12 * 30;
for (let d = 0; d < totalDays; d++) {
  if (s.clock.month !== lastMonth) {
    lastMonth = s.clock.month;
    monthlyPlan();
    console.log([s.clock.year, s.clock.month, s.money, s.research, s.popularity, s.storage['carrot'] ?? 0, nextUnlock(s)?.ref ?? '-'].join(','));
  }
  for (const id of readyToHarvest(s)) apply(s, { type: 'harvest', objectId: id });
  tick(s, DAY_MS);
  apply(s, { type: 'dismissMonthCard' });
}
```

- [ ] **Step 2: 실행 확인**

Run: `pnpm headless 2 1 | head -30`
Expected: CSV 헤더 + 24줄. 1년차 10월 이후 `carrot` 열이 0보다 커지고, `money`가 우상향. 돈이 계속 0 근처면 `table_out` 위치가 정낭과 연결되는지(`ensurePath`) 확인.

- [ ] **Step 3: Commit**

```bash
git add scripts/headless.ts
git commit -m "feat: 헤드리스 밸런싱 봇"
```

---

### Task 14: 렌더 — 플레이스홀더 텍스처와 카메라

**Files:**
- Create: `src/render/textures.ts`, `src/render/camera.ts`

- [ ] **Step 1: textures.ts 작성**

`src/render/textures.ts`:
```ts
import { Graphics, Renderer, Texture, Text, Container } from 'pixi.js';
import type { Terrain, ObjectKind } from '../sim';

export const TILE = 32;

const TERRAIN_COLOR: Record<Terrain, number> = { soil: 0x8a6a3a, rock: 0x555555, road: 0x9a9a9a };
const KIND_COLOR: Record<ObjectKind, number> = {
  field: 0x5c8a2e, tree: 0xe38b1e, seat: 0xd9c27a, wall: 0x3a3a3a, path: 0xc9b58a,
  building: 0x7a4a2a, deco: 0xaa66aa, busstop: 0x2a5aaa, gate: 0x6a4a2a,
};

const cache = new Map<string, Texture>();

function rectTexture(renderer: Renderer, key: string, w: number, h: number, color: number, border = 0x000000): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Graphics().rect(0, 0, w, h).fill(color).stroke({ color: border, width: 1, alpha: 0.35 });
  const tex = renderer.generateTexture(g);
  cache.set(key, tex);
  return tex;
}

export function terrainTexture(renderer: Renderer, t: Terrain): Texture {
  return rectTexture(renderer, `t:${t}`, TILE, TILE, TERRAIN_COLOR[t]);
}

export function objectTexture(renderer: Renderer, kind: ObjectKind, w: number, h: number): Texture {
  return rectTexture(renderer, `o:${kind}:${w}x${h}`, w * TILE - 2, h * TILE - 2, KIND_COLOR[kind], 0xffffff);
}

/** 오브젝트 위에 이름을 얹는 라벨 (플레이스홀더 전용) */
export function label(text: string, size = 9): Text {
  return new Text({ text, style: { fontSize: size, fill: 0xffffff, fontFamily: 'system-ui' } });
}

export function bubble(mood: 'happy' | 'meh' | 'angry' | null): Container {
  const c = new Container();
  const g = new Graphics().roundRect(0, 0, 18, 14, 4).fill(0xffffff);
  const t = label(mood === 'happy' ? '😊' : mood === 'meh' ? '😐' : mood === 'angry' ? '😠' : '…', 10);
  t.position.set(2, 1);
  c.addChild(g, t);
  return c;
}
```

- [ ] **Step 2: camera.ts 작성**

`src/render/camera.ts`:
```ts
import { Container, FederatedPointerEvent } from 'pixi.js';
import { TILE } from './textures';

export interface CameraOptions {
  world: Container;
  onTap: (cellX: number, cellY: number) => void;
  minScale?: number;
  maxScale?: number;
}

/** 드래그 이동·핀치 줌·탭(셀 좌표) 처리. 이동 거리가 짧으면 탭으로 본다. */
export function attachCamera(stage: Container, opts: CameraOptions): () => void {
  const { world, onTap, minScale = 0.75, maxScale = 3 } = opts;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; wx: number; wy: number } | null = null;
  let moved = false;
  let pinchDist = 0;

  const down = (e: FederatedPointerEvent) => {
    pointers.set(e.pointerId, { x: e.globalX, y: e.globalY });
    if (pointers.size === 1) {
      dragStart = { x: e.globalX, y: e.globalY, wx: world.x, wy: world.y };
      moved = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };
  const move = (e: FederatedPointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.globalX, y: e.globalY });
    if (pointers.size === 1 && dragStart) {
      const dx = e.globalX - dragStart.x;
      const dy = e.globalY - dragStart.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      world.x = dragStart.wx + dx;
      world.y = dragStart.wy + dy;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0) {
        const s = Math.min(maxScale, Math.max(minScale, world.scale.x * (d / pinchDist)));
        world.scale.set(s);
      }
      pinchDist = d;
      moved = true;
    }
  };
  const up = (e: FederatedPointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (!moved && dragStart) {
        const lx = (e.globalX - world.x) / world.scale.x;
        const ly = (e.globalY - world.y) / world.scale.y;
        onTap(Math.floor(lx / TILE), Math.floor(ly / TILE));
      }
      dragStart = null;
    }
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const s = Math.min(maxScale, Math.max(minScale, world.scale.x * (e.deltaY < 0 ? 1.1 : 0.9)));
    world.scale.set(s);
  };

  stage.eventMode = 'static';
  stage.hitArea = { contains: () => true };
  stage.on('pointerdown', down).on('pointermove', move).on('pointerup', up).on('pointerupoutside', up);
  window.addEventListener('wheel', wheel, { passive: false });
  return () => {
    stage.off('pointerdown', down).off('pointermove', move).off('pointerup', up).off('pointerupoutside', up);
    window.removeEventListener('wheel', wheel);
  };
}
```

- [ ] **Step 3: 타입 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 0

- [ ] **Step 4: Commit**

```bash
git add src/render/textures.ts src/render/camera.ts
git commit -m "feat(render): 플레이스홀더 텍스처와 카메라"
```

---

### Task 15: 렌더 — GameView (상태 → 화면)

**Files:**
- Create: `src/render/GameView.ts`

- [ ] **Step 1: GameView.ts 작성**

`src/render/GameView.ts`:
```ts
import { Application, Container, Sprite, Graphics } from 'pixi.js';
import type { GameState, PlacedObject, Guest } from '../sim';
import { objectDef } from '../data';
import { TILE, terrainTexture, objectTexture, label, bubble } from './textures';
import { attachCamera } from './camera';

export interface GameViewOptions {
  onTap: (cellX: number, cellY: number) => void;
}

/** Pixi 씬을 소유하고, render(state)로 상태를 화면에 반영한다. 상태를 바꾸지 않는다. */
export class GameView {
  app = new Application();
  world = new Container();
  private tiles = new Container();
  private objects = new Container();
  private guests = new Container();
  private overlay = new Container();
  private objNodes = new Map<string, Container>();
  private guestNodes = new Map<string, Container>();
  private tilesBuilt = false;
  private detachCamera: (() => void) | null = null;
  private selection = new Graphics();

  async init(parent: HTMLElement, opts: GameViewOptions) {
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    parent.appendChild(this.app.canvas);
    this.world.addChild(this.tiles, this.objects, this.guests, this.overlay);
    this.overlay.addChild(this.selection);
    this.app.stage.addChild(this.world);
    this.detachCamera = attachCamera(this.app.stage, { world: this.world, onTap: opts.onTap });
    this.world.scale.set(Math.min(2, Math.max(1, Math.floor(parent.clientWidth / (10 * TILE)))));
    this.world.position.set(8, 60);
  }

  destroy() {
    this.detachCamera?.();
    this.app.destroy(true, { children: true });
  }

  setSelection(cell: { x: number; y: number } | null) {
    this.selection.clear();
    if (!cell) return;
    this.selection.rect(cell.x * TILE, cell.y * TILE, TILE, TILE).stroke({ color: 0xffff00, width: 2 });
  }

  render(state: GameState) {
    if (!this.tilesBuilt) this.buildTiles(state);
    this.syncObjects(state);
    this.syncGuests(state);
  }

  private buildTiles(state: GameState) {
    this.tiles.removeChildren();
    for (let y = 0; y < state.grid.h; y++) {
      for (let x = 0; x < state.grid.w; x++) {
        const cell = state.grid.cells[y * state.grid.w + x]!;
        const sp = new Sprite(terrainTexture(this.app.renderer, cell.terrain));
        sp.position.set(x * TILE, y * TILE);
        this.tiles.addChild(sp);
      }
    }
    this.tilesBuilt = true;
  }

  private makeObjectNode(o: PlacedObject): Container {
    const def = objectDef(o.type);
    const c = new Container();
    const sp = new Sprite(objectTexture(this.app.renderer, def.kind, def.w, def.h));
    sp.position.set(1, 1);
    const t = label(def.name);
    t.position.set(3, 2);
    c.addChild(sp, t);
    c.position.set(o.x * TILE, o.y * TILE);
    return c;
  }

  private syncObjects(state: GameState) {
    for (const [id, node] of this.objNodes) {
      if (!state.objects[id]) { node.destroy({ children: true }); this.objNodes.delete(id); }
    }
    for (const o of Object.values(state.objects)) {
      let node = this.objNodes.get(o.id);
      if (!node) { node = this.makeObjectNode(o); this.objects.addChild(node); this.objNodes.set(o.id, node); }
      // 작물 상태 표시: 심음=초록 점, 수확 가능=노란 테두리 깜빡임
      const badge = (node.getChildByLabel('badge') as Graphics | null) ?? (() => { const g = new Graphics(); g.label = 'badge'; node!.addChild(g); return g; })();
      badge.clear();
      if (o.crop) {
        if (o.crop.ready) {
          const on = Math.floor(performance.now() / 300) % 2 === 0;
          if (on) badge.rect(0, 0, TILE, TILE).stroke({ color: 0xffe066, width: 2 });
        } else {
          badge.circle(TILE - 6, TILE - 6, 3).fill(0x66ff66);
        }
      }
    }
  }

  private makeGuestNode(g: Guest): Container {
    const c = new Container();
    const body = new Graphics().roundRect(8, 4, 16, 24, 4).fill(g.type === 'local' ? 0x4a90d9 : 0xe07a5f);
    c.addChild(body);
    return c;
  }

  private syncGuests(state: GameState) {
    const alive = new Set(state.guests.map((g) => g.id));
    for (const [id, node] of this.guestNodes) {
      if (!alive.has(id)) { node.destroy({ children: true }); this.guestNodes.delete(id); }
    }
    for (const g of state.guests) {
      let node = this.guestNodes.get(g.id);
      if (!node) { node = this.makeGuestNode(g); this.guests.addChild(node); this.guestNodes.set(g.id, node); }
      node.position.set(g.x * TILE, g.y * TILE - 8);
      const old = node.getChildByLabel('bubble');
      if (old) old.destroy({ children: true });
      if (g.phase === 'seated') {
        const b = bubble(g.mood);
        b.label = 'bubble';
        b.position.set(14, -12);
        node.addChild(b);
      }
    }
  }
}
```

- [ ] **Step 2: 타입 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 0. `getChildByLabel`이 없다는 에러가 나면 pixi.js 버전이 8.x인지 확인(`pnpm ls pixi.js`).

- [ ] **Step 3: Commit**

```bash
git add src/render/GameView.ts
git commit -m "feat(render): GameView 상태→화면 동기화"
```

---

### Task 16: UI — store와 게임 루프

**Files:**
- Create: `src/ui/store.ts`

- [ ] **Step 1: store.ts 작성**

`src/ui/store.ts`:
```ts
import { useSyncExternalStore } from 'react';
import { createInitialState, tick, apply, type GameState, type Action, type ApplyResult } from '../sim';
import { LocalSaveStore } from '../sim/save';

const saveStore = new LocalSaveStore();
const AUTO_SLOT = 0;

let state: GameState = createInitialState(Date.now() % 1_000_000);
let version = 0;
const listeners = new Set<() => void>();
let lastMonthSaved = 0;
let toast: { text: string; until: number } | null = null;

function emit() { version++; for (const l of listeners) l(); }

export function getState() { return state; }
export function getVersion() { return version; }
export function getToast() { return toast && toast.until > performance.now() ? toast.text : null; }

export function dispatch(a: Action): ApplyResult {
  const r = apply(state, a);
  if (!r.ok && r.reason) toast = { text: r.reason, until: performance.now() + 1500 };
  emit();
  return r;
}

export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useGame(): GameState {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

export async function loadOrNew() {
  const saved = await saveStore.load(AUTO_SLOT);
  if (saved) { state = saved; emit(); }
}

export function resetGame() {
  state = createInitialState(Date.now() % 1_000_000);
  emit();
}

/** rAF 루프. 렌더 콜백에 상태를 넘긴다. 반환값으로 정지. */
export function startLoop(render: (s: GameState) => void): () => void {
  let last = performance.now();
  let raf = 0;
  let pausedSpeed: GameState['clock']['speed'] | null = null;

  const frame = (now: number) => {
    const dt = Math.min(100, now - last);
    last = now;
    tick(state, dt);
    const monthKey = state.clock.year * 12 + state.clock.month;
    if (monthKey !== lastMonthSaved) { lastMonthSaved = monthKey; void saveStore.save(AUTO_SLOT, state); }
    render(state);
    emit();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onVis = () => {
    if (document.hidden) { pausedSpeed = state.clock.speed; state.clock.speed = 0; }
    else if (pausedSpeed !== null) { state.clock.speed = pausedSpeed; pausedSpeed = null; last = performance.now(); }
  };
  document.addEventListener('visibilitychange', onVis);
  return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
}
```

- [ ] **Step 2: 타입 확인**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 0

- [ ] **Step 3: Commit**

```bash
git add src/ui/store.ts
git commit -m "feat(ui): 상태 스토어와 rAF 게임 루프, 자동 저장"
```

---

### Task 17: UI — HUD, 바텀시트, 월말 카드, 안내, App 조립

**Files:**
- Create: `src/ui/HUD.tsx`, `src/ui/BottomSheet.tsx`, `src/ui/MonthCard.tsx`, `src/ui/Guide.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: HUD.tsx**

`src/ui/HUD.tsx`:
```tsx
import { useGame, dispatch, getToast } from './store';
import { nextUnlock, canUnlock } from '../sim';
import { objectDef, menuDef, cropDef } from '../data';

const SPEEDS = [0, 1, 2, 3] as const;

function unlockName(u: NonNullable<ReturnType<typeof nextUnlock>>) {
  return u.kind === 'object' ? objectDef(u.ref).name : u.kind === 'menu' ? menuDef(u.ref).name : cropDef(u.ref).name;
}

export function HUD() {
  const s = useGame();
  const u = nextUnlock(s);
  const toast = getToast();
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 12px', color: '#fff', fontSize: 14, background: 'linear-gradient(#000a, #0000)', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</span>
        <span>💰 {s.money.toLocaleString()}</span>
        <span>🔬 {s.research}</span>
        <span style={{ pointerEvents: 'auto' }}>
          {SPEEDS.map((sp) => (
            <button key={sp} onClick={() => dispatch({ type: 'setSpeed', speed: sp })}
              style={{ minWidth: 36, minHeight: 36, marginLeft: 4, background: s.clock.speed === sp ? '#ffd166' : '#333', color: s.clock.speed === sp ? '#000' : '#fff', border: 0, borderRadius: 6 }}>
              {sp === 0 ? '⏸' : `×${sp}`}
            </button>
          ))}
        </span>
      </div>
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>🧢 <meter min={-100} max={100} value={s.popularity} style={{ width: 80 }} /> 📷</span>
        {u ? (
          <button disabled={!canUnlock(s).ok} onClick={() => dispatch({ type: 'unlock' })}
            style={{ pointerEvents: 'auto', minHeight: 36, background: canUnlock(s).ok ? '#06d6a0' : '#444', color: '#fff', border: 0, borderRadius: 6, padding: '0 10px' }}>
            다음: {unlockName(u)} ({Math.min(s.research, u.cost)}/{u.cost})
          </button>
        ) : <span>다 열었어요!</span>}
      </div>
      {toast && <div style={{ marginTop: 6, background: '#ef476f', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>{toast}</div>}
    </div>
  );
}
```

- [ ] **Step 2: BottomSheet.tsx**

`src/ui/BottomSheet.tsx`:
```tsx
import { useGame, dispatch } from './store';
import { objectAt, canPlant, isMenuAvailable, MENU_SLOT_COUNT } from '../sim';
import { objectDef, cropDef, menuDef, CROPS } from '../data';

export type Mode = { kind: 'idle' } | { kind: 'build'; objectType: string } | { kind: 'cell'; x: number; y: number } | { kind: 'menu' };

const btn: React.CSSProperties = { minHeight: 44, padding: '0 12px', marginRight: 6, marginBottom: 6, border: 0, borderRadius: 8, background: '#333', color: '#fff', fontSize: 14 };

export function BottomSheet({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const s = useGame();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#222', color: '#fff', padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', borderTop: '1px solid #444', maxHeight: '40vh', overflowY: 'auto' }}>
      <div style={{ marginBottom: 6 }}>
        <button style={{ ...btn, background: mode.kind === 'idle' ? '#ffd166' : '#333', color: mode.kind === 'idle' ? '#000' : '#fff' }} onClick={() => setMode({ kind: 'idle' })}>👆 보기</button>
        <button style={{ ...btn, background: mode.kind === 'build' ? '#ffd166' : '#333', color: mode.kind === 'build' ? '#000' : '#fff' }} onClick={() => setMode({ kind: 'build', objectType: 'field' })}>🔨 짓기</button>
        <button style={{ ...btn, background: mode.kind === 'menu' ? '#ffd166' : '#333', color: mode.kind === 'menu' ? '#000' : '#fff' }} onClick={() => setMode({ kind: 'menu' })}>📋 메뉴판</button>
      </div>

      {mode.kind === 'build' && (
        <div>
          {s.unlocked.objects.map((t) => {
            const d = objectDef(t);
            const on = mode.objectType === t;
            return (
              <button key={t} style={{ ...btn, background: on ? '#06d6a0' : '#333' }} onClick={() => setMode({ kind: 'build', objectType: t })}>
                {d.name} {d.cost > 0 ? `₩${d.cost}` : ''}
              </button>
            );
          })}
          <div style={{ fontSize: 12, opacity: 0.7 }}>칸을 눌러서 놓아요</div>
        </div>
      )}

      {mode.kind === 'cell' && <CellPanel x={mode.x} y={mode.y} />}

      {mode.kind === 'menu' && (
        <div>
          {Array.from({ length: MENU_SLOT_COUNT }, (_, i) => {
            const cur = s.menuSlots[i] ?? null;
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <span style={{ display: 'inline-block', width: 40 }}>{i + 1}.</span>
                <select value={cur ?? ''} onChange={(e) => dispatch({ type: 'setSlot', slot: i, menuId: e.target.value || null })} style={{ minHeight: 40, fontSize: 14 }}>
                  <option value="">(비움)</option>
                  {s.unlocked.menus.map((m) => <option key={m} value={m}>{menuDef(m).name} ₩{menuDef(m).price}</option>)}
                </select>
                {cur && <span style={{ marginLeft: 8 }}>{isMenuAvailable(s, cur) ? '✅ 재료 있음' : '❌ 재료 없음'}</span>}
              </div>
            );
          })}
          <div style={{ fontSize: 12, opacity: 0.7 }}>창고: {Object.entries(s.storage).map(([c, n]) => `${cropDef(c).name} ${n}`).join(' · ') || '비어 있음'}</div>
        </div>
      )}
    </div>
  );
}

function CellPanel({ x, y }: { x: number; y: number }) {
  const s = useGame();
  const o = objectAt(s, x, y);
  if (!o) return <div style={{ opacity: 0.7 }}>빈 칸 ({x},{y})</div>;
  const d = objectDef(o.type);
  return (
    <div>
      <div style={{ marginBottom: 6 }}><b>{d.name}</b>{o.crop && ` · ${cropDef(o.crop.cropId).name} ${o.crop.ready ? '수확할 수 있어요!' : `${o.crop.daysGrown}일째`}`}</div>
      {d.kind === 'field' && !o.crop && CROPS.filter((c) => s.unlocked.crops.includes(c.id) && c.plantMonths.length > 0).map((c) => (
        <button key={c.id} style={btn} disabled={!canPlant(s, o.id, c.id).ok} onClick={() => dispatch({ type: 'plant', objectId: o.id, cropId: c.id })}>
          🌱 {c.name} 심기{!canPlant(s, o.id, c.id).ok && ' (철 아님)'}
        </button>
      ))}
      {o.crop?.ready && <button style={{ ...btn, background: '#ffd166', color: '#000' }} onClick={() => dispatch({ type: 'harvest', objectId: o.id })}>✨ 수확</button>}
      {!['busstop', 'warehouse', 'gate'].includes(o.type) && (
        <button style={{ ...btn, background: '#8a2a2a' }} onClick={() => dispatch({ type: 'remove', objectId: o.id })}>🗑 치우기 (₩{d.cost} 돌려받음)</button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: MonthCard.tsx와 Guide.tsx**

`src/ui/MonthCard.tsx`:
```tsx
import { useGame, dispatch } from './store';

export function MonthCard() {
  const s = useGame();
  const c = s.lastMonthCard;
  if (!c) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => dispatch({ type: 'dismissMonthCard' })}>
      <div style={{ background: '#fff', color: '#222', borderRadius: 12, padding: 20, minWidth: 240, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{c.year}년 {c.month}월 결산</div>
        <div style={{ marginTop: 10 }}>손님 {c.guests}명</div>
        <div>번 돈 ₩{c.income.toLocaleString()}</div>
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>눌러서 닫기</div>
      </div>
    </div>
  );
}
```

`src/ui/Guide.tsx` — 할망이 상태를 보고 다음 할 일 한 줄:
```tsx
import { useGame } from './store';
import { objectDef } from '../data';
import { readyToHarvest, availableMenus } from '../sim';

export function guideText(s: ReturnType<typeof useGame>): string | null {
  if (s.clock.year > 1) return null;
  const objs = Object.values(s.objects);
  const kinds = objs.map((o) => objectDef(o.type).kind);
  if (!kinds.includes('seat')) return '할망: 손님 앉을 테이블부터 놓아 보라.';
  if (!kinds.includes('path') && !objs.some((o) => objectDef(o.type).kind === 'seat' && o.y === 5 && o.x === 4)) return '할망: 정낭에서 테이블까지 올렛길을 이어야 손님이 온다.';
  if (!kinds.includes('field')) return '할망: 밭을 하나 지어 보라.';
  if (objs.some((o) => objectDef(o.type).kind === 'field' && !o.crop)) return s.clock.month >= 9 && s.clock.month <= 11 ? '할망: 지금 당근 심을 철이여.' : '할망: 당근은 9~11월에 심는다. 기다려 보라.';
  if (readyToHarvest(s).length > 0) return '할망: 반짝이는 밭을 눌러 수확하라.';
  if (s.menuSlots.every((m) => m === null)) return '할망: 메뉴판에 당근주스를 올려 보라.';
  if (availableMenus(s).length === 0) return '할망: 재료가 없으면 메뉴가 안 나간다.';
  return '할망: 잘하고 있다. 손님 얼굴을 보라.';
}

export function Guide() {
  const s = useGame();
  const t = guideText(s);
  if (!t) return null;
  return <div style={{ position: 'absolute', top: 76, left: 12, right: 12, background: '#fff3', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 13, pointerEvents: 'none' }}>{t}</div>;
}
```

- [ ] **Step 4: App.tsx 조립**

`src/ui/App.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { GameView } from '../render/GameView';
import { startLoop, dispatch, loadOrNew, getState } from './store';
import { HUD } from './HUD';
import { BottomSheet, type Mode } from './BottomSheet';
import { MonthCard } from './MonthCard';
import { Guide } from './Guide';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GameView | null>(null);
  const modeRef = useRef<Mode>({ kind: 'idle' });
  const [mode, setModeState] = useState<Mode>({ kind: 'idle' });
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); viewRef.current?.setSelection(m.kind === 'cell' ? { x: m.x, y: m.y } : null); };

  useEffect(() => {
    const host = hostRef.current!;
    const view = new GameView();
    viewRef.current = view;
    let stop: (() => void) | null = null;
    let disposed = false;
    (async () => {
      await loadOrNew();
      await view.init(host, {
        onTap: (x, y) => {
          const m = modeRef.current;
          const s = getState();
          if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) return;
          if (m.kind === 'build') dispatch({ type: 'place', objectType: m.objectType, x, y });
          else setMode({ kind: 'cell', x, y });
        },
      });
      if (disposed) { view.destroy(); return; }
      stop = startLoop((s) => view.render(s));
    })();
    return () => { disposed = true; stop?.(); if (viewRef.current) viewRef.current.destroy(); };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
      <HUD />
      <Guide />
      <BottomSheet mode={mode} setMode={setMode} />
      <MonthCard />
    </div>
  );
}
```

- [ ] **Step 5: 실행해서 1년차 루프 수동 확인**

Run: `pnpm dev` → 브라우저(모바일 뷰 390×844)에서:
1. "짓기 → 야외 테이블"을 (4,5)에 놓기 → 다음 날 손님이 정류장에서 걸어와 앉고 "😐"(재료 없음)
2. "짓기 → 밭" 놓고, 시간을 ×3으로 9월까지 진행 → 밭 탭 → "당근 심기"
3. 60일 후 밭이 노랗게 깜빡임 → 탭 → "수확" → 창고에 당근
4. "메뉴판 → 1번 당근주스" → 손님 "😊", 돈·🔬 증가
5. 🔬 5 → "다음: 돌담" 버튼 활성 → 누르면 짓기 목록에 돌담
6. 달이 바뀌면 결산 카드, 새로고침해도 상태 유지(자동 저장)

Expected: 6단계 모두 동작. 손님이 안 오면 콘솔에서 `getState().guests`와 테이블 위치를 확인.

- [ ] **Step 6: 빌드·전체 테스트**

Run: `pnpm build && pnpm test`
Expected: 빌드 성공, 테스트 전부 PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "feat(ui): HUD·바텀시트·월말 카드·할망 안내, 1년차 루프 완성"
```

---

### Task 18: 마무리 — README와 다음 단계 메모

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md**

```markdown
# 제주 귀농 카페

카이로소프트 스타일 경영 시뮬레이션. 모바일 웹 우선. 설계: `docs/superpowers/specs/`.

## 개발
- `pnpm dev` — 개발 서버 (`--host`로 폰에서 접속 가능)
- `pnpm test` — sim 단위 테스트
- `pnpm headless 3 1` — 봇이 3년 자동 플레이, CSV 출력 (밸런싱용)
- `pnpm build` — 타입 검사 + 번들

## 구조
- `src/sim` — 게임 규칙 (순수 TS, 결정적, DOM 의존 0)
- `src/render` — PixiJS 렌더 (상태 읽기만)
- `src/ui` — React HUD·패널 (액션 dispatch)
- `src/data` — JSON 밸런싱 표

## 에셋 규격
스펙 §7.5 참고. 지금은 코드 생성 플레이스홀더. 실제 PNG는 `public/assets/` 아래 같은 경로에 두면 로더가 우선 사용(2단계 계획에서 로더 추가).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README"
```

---

## 이 계획이 끝나면 (다음 계획의 입력)

- 2단계 계획: 태풍·돌담 튜토리얼, 필지 구매(지형 6종), 직원 3역할, 콤보 도감, 에셋 로더(PNG 폴백), 계절 팔레트
- 3단계 계획: 삼춘 6명·호감도, 명소 지도·연결, 랜드마크, 외국인 "?" 규칙·단체·기념품 매대, 정착 등급, 절기·랜덤 이벤트
- 4단계 계획: 마을제 결산·엔딩·2회차, 도감·앨범, 컷신, 세이브 슬롯 UI, PWA
- 5단계 계획(선택): Supabase 익명 랭킹, 공유 카드
