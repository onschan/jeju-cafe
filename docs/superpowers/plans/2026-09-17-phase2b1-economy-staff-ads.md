# 2B-1 구현 계획 — 초반 경제·직원·홍보

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫날부터 커피·디저트를 팔아 돈이 돌고, 공고를 내면 랜덤 후보가 오고, 채용한 직원이 격자 위에서 일하며 게임에 영향을 주고, 광고로 손님을 늘릴 수 있다. 헤드리스 봇이 1년차 12달 모두 흑자를 낸다.

**Architecture:** sim에 `economy`(재료 2종·재료비·월말 정산), `staff`(후보 생성·채용·배치·월급·효과), `ads`(광고 효과) 모듈을 추가한다. 손님 주문에 **조리 시간**을 도입해 직원이 체감되게 한다. 직원은 손님과 같은 이동 코드로 격자 위를 걷는다. 데이터는 전부 JSON. 렌더는 파츠 조합(몸·머리 스프라이트 + tint)으로 직원 얼굴을 랜덤 조립한다.

**Tech Stack:** 기존과 동일. 스펙: `docs/superpowers/specs/2026-09-17-phase2b-kairo-loop.md` §1, §2, §3.

**전제:** 2A(에셋 팩)가 main에 머지되어 있다. `src/sim` 규칙(순수·결정적·`.ts` import·고정 스텝) 유지. `SAVE_VERSION`을 2로 올리고 v1 세이브는 백업 후 새 게임(마이그레이션은 하지 않는다 — 아직 플레이어가 없다).

---

## 파일 구조

```
src/data/
├─ ingredients.json   # 재료 (bought/farm, cost)
├─ menus.json         # 시작 12 + 밭 메뉴 (수정)
├─ staff_roles.json   # 역할 7
├─ skills.json        # 스킬 20
├─ names.json         # 이름 60, 머리 4, 피부 3, 상의색 8
├─ ads.json           # 광고 4
├─ unlocks.json       # 슬롯·메뉴·오브젝트 해금 (수정)
└─ index.ts           # 로더 추가
src/sim/
├─ types.ts           # Ingredient/Staff/Candidate/Ad 타입, GameState 확장
├─ state.ts           # 시작 자금 30000, 3월, 슬롯 초기값
├─ economy.ts         # 재료비, 월말 정산
├─ staff.ts           # 후보 생성·채용·해고·배치·월급·효과 계산·이동
├─ ads.ts             # 광고 실행·만료·유입 배수
├─ menu.ts            # bought 재료는 항상 available (수정)
├─ guests.ts          # 조리 시간, 홀 서비스, 광고 배수 (수정)
├─ farm.ts            # 밭 일꾼 자동 심기·수확, 채취꾼 (수정)
├─ actions.ts         # postJob/hire/fire/assign/levelUp/runAd (수정)
├─ tick.ts            # 월말: 월급·광고 만료·후보 만료 (수정)
└─ __tests__/{economy,staff,ads}.test.ts
tools/assets/sprites_chars.py   # staff_base_{dir}_{frame} (흰 상의·회색 바지), hair_{0..3}_{dir} (수정)
src/render/GameView.ts          # 직원 노드 (몸 tint + 머리 오버레이)
src/ui/StaffPanel.tsx  src/ui/AdsPanel.tsx  src/ui/MonthCard.tsx(수정)  src/ui/BottomSheet.tsx(탭 추가)
scripts/headless.ts    # 봇: 공고→채용, 광고, 흑자 검증
```

## 핵심 타입 (Task 1)

```ts
export type IngredientKind = 'bought' | 'farm';
export interface IngredientDef { id: string; name: string; kind: IngredientKind; cost: number } // cost: bought만 의미
export type RoleId = 'barista' | 'cook' | 'hall' | 'field' | 'gather' | 'carry' | 'guide';
export interface RoleDef { id: RoleId; name: string; stat: StatKey; unlockedAtStart: boolean }
export type StatKey = 'service' | 'cooking' | 'sense' | 'stamina';
export interface SkillDef { id: string; name: string; desc: string; effect: SkillEffect }
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
export interface Stats { service: number; cooking: number; sense: number; stamina: number }
export interface Face { hair: number; skin: number; top: number } // 파츠 인덱스
export interface Staff {
  id: string; name: string; face: Face; stats: Stats; skill: string; level: number; salary: number;
  role: RoleId | null; unpaidMonths: number;
  x: number; y: number; path: Pt[]; anchor: Pt | null; // 렌더·이동용
}
export interface Candidate extends Omit<Staff, 'role' | 'unpaidMonths' | 'x' | 'y' | 'path' | 'anchor'> { expiresMonthIndex: number }
export type JobTier = 'flyer' | 'site' | 'headhunter';
export interface AdDef { id: string; name: string; cost: number; months: number; spawnMult: Partial<Record<string, number>>; allMult?: number; popularityPerMonth?: number; special?: 'youtuber' }
export interface ActiveAd { adId: string; remainingMonths: number }

// GameState 추가
staff: Staff[]; candidates: Candidate[]; slots: Record<RoleId, number>;
activeAds: ActiveAd[]; youtuberBoostMonths: number;
monthCosts: { ingredients: number; salary: number; ads: number };
// Guest 추가
waitMs: number;           // 주문 후 조리 대기 남은 시간
// Action 추가
| { type: 'postJob'; tier: JobTier }
| { type: 'hire'; candidateId: string; role: RoleId }
| { type: 'fire'; staffId: string }
| { type: 'assign'; staffId: string; role: RoleId | null }
| { type: 'levelUp'; staffId: string }
| { type: 'runAd'; adId: string }
```

---

### Task 1: 타입·데이터·초기 상태 (경제 기반)

**Files:** Modify `src/sim/types.ts`, `src/sim/state.ts`, `src/data/index.ts`; Create `src/data/ingredients.json`, `staff_roles.json`, `skills.json`, `names.json`, `ads.json`; Modify `src/data/menus.json`, `unlocks.json`; Test `src/sim/__tests__/data.test.ts`(추가), `clock.test.ts`(수정)

- [ ] **Step 1: 실패하는 테스트**

`data.test.ts`에 추가:
```ts
import { INGREDIENTS, ROLES, SKILLS, NAMES, ADS, ingredientDef } from '../../data/index.ts';

test('메뉴 재료는 전부 ingredients에 있고, farm 재료는 crop id와 같다', () => {
  for (const m of MENUS) for (const id of Object.keys(m.ingredients)) {
    const ing = ingredientDef(id);
    if (ing.kind === 'farm') expect(CROPS.some((c) => c.id === id)).toBe(true);
    else expect(ing.cost).toBeGreaterThan(0);
  }
});
test('시작 메뉴 12개는 bought 재료만 쓴다', () => {
  const start = MENUS.filter((m) => INITIAL_UNLOCKED.menus.includes(m.id));
  expect(start.length).toBe(12);
  for (const m of start) for (const id of Object.keys(m.ingredients)) expect(ingredientDef(id).kind).toBe('bought');
});
test('메뉴 원가는 가격의 50% 미만', () => {
  for (const m of MENUS) {
    const cost = Object.entries(m.ingredients).reduce((s, [id, n]) => s + (ingredientDef(id).kind === 'bought' ? ingredientDef(id).cost * n : 0), 0);
    expect(cost).toBeLessThan(m.price * 0.5);
  }
});
test('역할 7, 스킬 20, 광고 4, 이름 60', () => {
  expect(ROLES.length).toBe(7); expect(SKILLS.length).toBe(20); expect(ADS.length).toBe(4); expect(NAMES.names.length).toBeGreaterThanOrEqual(60);
});
```
`clock.test.ts` 첫 테스트: `month: 1` → `month: 3`, `money 5000` → `30000`; `s.slots`가 `{ barista: 1, cook: 1, hall: 2, field: 1, gather: 0, carry: 0, guide: 0 }`.

- [ ] **Step 2: 데이터 작성**

`ingredients.json` (bought 9, farm = crops 8):
```json
[
  { "id": "beans", "name": "원두", "kind": "bought", "cost": 700 },
  { "id": "milk", "name": "우유", "kind": "bought", "cost": 400 },
  { "id": "sugar", "name": "설탕", "kind": "bought", "cost": 100 },
  { "id": "flour", "name": "밀가루", "kind": "bought", "cost": 300 },
  { "id": "egg", "name": "달걀", "kind": "bought", "cost": 300 },
  { "id": "butter", "name": "버터", "kind": "bought", "cost": 500 },
  { "id": "tea", "name": "녹찻잎", "kind": "bought", "cost": 500 },
  { "id": "yuja", "name": "유자청", "kind": "bought", "cost": 600 },
  { "id": "ice", "name": "얼음", "kind": "bought", "cost": 100 },
  { "id": "cheese", "name": "치즈", "kind": "bought", "cost": 800 },
  { "id": "cocoa", "name": "코코아", "kind": "bought", "cost": 500 },
  { "id": "carrot", "name": "당근", "kind": "farm", "cost": 0 },
  { "id": "tangerine", "name": "감귤", "kind": "farm", "cost": 0 }
]
```
(메밀·유채·녹차·한라봉·땅콩·고사리는 작물이 추가되는 계획에서 함께 넣는다.)

`menus.json` 시작 12 + 밭 메뉴 6:
```json
[
  { "id": "americano", "name": "아메리카노", "category": "drink", "price": 3500, "ingredients": { "beans": 1 } },
  { "id": "latte", "name": "카페라떼", "category": "drink", "price": 4500, "ingredients": { "beans": 1, "milk": 1 } },
  { "id": "green_tea", "name": "녹차", "category": "drink", "price": 3500, "ingredients": { "tea": 1 } },
  { "id": "yuja_tea", "name": "유자차", "category": "drink", "price": 4000, "ingredients": { "yuja": 1 } },
  { "id": "iced_tea", "name": "아이스티", "category": "drink", "price": 3500, "ingredients": { "tea": 1, "ice": 1 } },
  { "id": "hot_choco", "name": "핫초코", "category": "drink", "price": 4000, "ingredients": { "cocoa": 1, "milk": 1 } },
  { "id": "toast", "name": "토스트", "category": "dessert", "price": 3000, "ingredients": { "flour": 1, "butter": 1 } },
  { "id": "scone", "name": "스콘", "category": "dessert", "price": 3500, "ingredients": { "flour": 1, "butter": 1, "sugar": 1 } },
  { "id": "cheesecake", "name": "치즈케이크", "category": "dessert", "price": 5500, "ingredients": { "cheese": 1, "flour": 1, "egg": 1 } },
  { "id": "cookie", "name": "쿠키", "category": "dessert", "price": 2500, "ingredients": { "flour": 1, "sugar": 1 } },
  { "id": "egg_sandwich", "name": "계란 샌드위치", "category": "meal", "price": 5000, "ingredients": { "egg": 2, "flour": 1 } },
  { "id": "croissant", "name": "크루아상", "category": "meal", "price": 4500, "ingredients": { "flour": 1, "butter": 2 } },
  { "id": "carrot_juice", "name": "당근주스", "category": "drink", "price": 4000, "ingredients": { "carrot": 1 } },
  { "id": "tangerine_juice", "name": "감귤주스", "category": "drink", "price": 4500, "ingredients": { "tangerine": 1 } },
  { "id": "carrot_cake", "name": "당근케이크", "category": "dessert", "price": 6000, "ingredients": { "carrot": 2, "flour": 1, "egg": 1 } },
  { "id": "tangerine_scone", "name": "감귤 스콘", "category": "dessert", "price": 5000, "ingredients": { "tangerine": 1, "flour": 1, "butter": 1 } },
  { "id": "tangerine_ade", "name": "감귤 에이드", "category": "drink", "price": 5000, "ingredients": { "tangerine": 2, "ice": 1 } },
  { "id": "carrot_soup", "name": "당근 수프", "category": "meal", "price": 6500, "ingredients": { "carrot": 2, "milk": 1 } }
]
```
`INITIAL_UNLOCKED.menus` = 시작 12개 id. `unlocks.json`은 일직선으로: carrot_juice(5) → stonewall(5) → slot:hall(8) → tangerine_juice(8) → carrot_cake(10) → slot:barista(12) → tangerine_scone(12) → slot:field(12) → tangerine_ade(15) → slot:cook(15) → carrot_soup(18) → role:gather(20) → role:carry(20). `UnlockDef.kind`에 `'slot' | 'role'` 추가(`ref`는 RoleId).

`staff_roles.json`:
```json
[
  { "id": "barista", "name": "바리스타", "stat": "sense", "unlockedAtStart": true },
  { "id": "cook", "name": "요리사", "stat": "cooking", "unlockedAtStart": true },
  { "id": "hall", "name": "홀", "stat": "service", "unlockedAtStart": true },
  { "id": "field", "name": "밭 일꾼", "stat": "stamina", "unlockedAtStart": true },
  { "id": "gather", "name": "채취꾼", "stat": "stamina", "unlockedAtStart": false },
  { "id": "carry", "name": "운반", "stat": "stamina", "unlockedAtStart": false },
  { "id": "guide", "name": "안내", "stat": "service", "unlockedAtStart": false }
]
```
`skills.json` 20개 — 예: `coffee_master`(menuQuality drink .15), `dessert_master`, `meal_master`, `quick_hands`(speed .2), `jeju_native`(localAffinity .3), `insta_vibe`(touristSatisfaction .3), `polyglot`(language), `thrifty`(ingredientDiscount .1), `researcher`(researchBonus .5), `popular`(spawnBonus .1), `lucky`(luck .2), `tough`(stamina .3), 나머지 8개는 위 타입의 약한 변형(값 절반, 이름 다르게: 커피 애호가 등).

`names.json`: `{ "names": [60개 한국 이름: 김민준, 이서연, 박도윤, 최지우, 정하은, 강시우, 조서준, 윤지아, 장예준, 임채원, 한지호, 오수아, 서준서, 신유나, 권도현, 황하린, 안건우, 송지민, 류시윤, 홍서아, 고현우, 문나은, 양준혁, 손예린, 배지훈, 백소율, 허태양, 남지원, 심아린, 노민재, 하윤서, 곽은우, 성다은, 차준영, 주소연, 우지환, 구하율, 민서현, 진태민, 지수빈, 엄도훈, 채유진, 원지안, 천시온, 방하준, 공서윤, 강태오, 이도경, 박세아, 김라온, 정은호, 최다인, 조윤호, 윤가온, 장현서, 임하람, 한소이, 오재이, 서온유, 신이안], "hair": 4, "skin": 3, "top": 8 }`

`ads.json`:
```json
[
  { "id": "flyer", "name": "전단지", "cost": 5000, "months": 1, "spawnMult": { "local": 1.2, "family": 1.2 } },
  { "id": "sns", "name": "SNS 광고", "cost": 20000, "months": 1, "spawnMult": { "tourist": 1.4 }, "popularityPerMonth": 5 },
  { "id": "radio", "name": "지역 라디오", "cost": 50000, "months": 2, "allMult": 1.25, "popularityPerMonth": -3 },
  { "id": "youtuber", "name": "유튜버 초대", "cost": 100000, "months": 0, "spawnMult": {}, "special": "youtuber" }
]
```

- [ ] **Step 3: 타입·state·로더**

types.ts에 위 "핵심 타입" 블록 추가. `UnlockDef.kind`: `'object' | 'menu' | 'crop' | 'slot' | 'role'`. state.ts: `START_MONEY = 30000`, `START_MONTH = 3`, `SAVE_VERSION = 2`, 초기 `staff: [], candidates: [], slots: {...}, activeAds: [], youtuberBoostMonths: 0, monthCosts: { ingredients: 0, salary: 0, ads: 0 }`, `unlocked.roles: ['barista','cook','hall','field']`. data/index.ts: `INGREDIENTS, ROLES, SKILLS, NAMES, ADS`, `ingredientDef, roleDef, skillDef, adDef`.

- [ ] **Step 4: 통과 확인·Commit** — `pnpm test`; 기존 테스트 중 시작 월·자금·메뉴 id에 의존하던 것(`menu.test`, `guests.test`, `actions.test`, `tick.test`, headless)은 이 Task에서 함께 고친다: `carrot_juice`는 여전히 존재하므로 대부분 그대로, `tangerine_juice`는 이제 해금 목록에 없으니 `canSetSlot(s, 1, 'tangerine_juice')` 기대값을 false로. `git commit -m "feat(sim): 재료 2종·시작 메뉴 12·직원/광고 데이터와 타입"`

---

### Task 2: economy.ts — 재료비와 월말 정산

**Files:** Create `src/sim/economy.ts`; Modify `src/sim/menu.ts`, `src/sim/guests.ts`, `src/sim/tick.ts`; Test `src/sim/__tests__/economy.test.ts`

- [ ] **Step 1: 실패하는 테스트**
```ts
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { isMenuAvailable, consumeIngredients } from '../menu.ts';
import { ingredientCost } from '../economy.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';

test('bought 재료 메뉴는 창고 없이도 available, 팔면 재료비가 빠진다', () => {
  const s = createInitialState(1);
  expect(isMenuAvailable(s, 'latte')).toBe(true);
  expect(ingredientCost(s, 'latte')).toBe(1100);
  const m0 = s.money;
  consumeIngredients(s, 'latte');
  expect(s.money).toBe(m0 - 1100);
  expect(s.monthCosts.ingredients).toBe(1100);
});
test('farm 재료 메뉴는 창고가 있어야 하고 재료비 0', () => {
  const s = createInitialState(1);
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(false);
  s.storage['carrot'] = 1;
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(true);
  expect(ingredientCost(s, 'carrot_juice')).toBe(0);
});
test('월말 카드에 수입·재료비·월급·광고·순이익이 있고 monthCosts가 리셋된다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: 4, y: 5 });
  apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' });
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  const c = s.lastMonthCard!;
  expect(c.income).toBeGreaterThan(0);
  expect(c.costs.ingredients).toBeGreaterThan(0);
  expect(c.net).toBe(c.income - c.costs.ingredients - c.costs.salary - c.costs.ads);
  expect(s.monthCosts).toEqual({ ingredients: 0, salary: 0, ads: 0 });
});
```
`lastMonthCard` 타입을 `{ income, guests, month, year, costs: {ingredients, salary, ads}, net }`으로 확장.

- [ ] **Step 2: 구현**
`economy.ts`:
```ts
export function ingredientCost(state: GameState, menuId: string): number {
  const disc = ingredientDiscount(state); // staff.ts의 운반·절약 효과 (Task 3 전까지는 0)
  let sum = 0;
  for (const [id, n] of Object.entries(menuDef(menuId).ingredients)) { const ing = ingredientDef(id); if (ing.kind === 'bought') sum += ing.cost * n; }
  return Math.round(sum * (1 - disc));
}
export function closeMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const costs = { ...state.monthCosts };
  state.lastMonthCard = { income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear, costs, net: state.monthIncome - costs.ingredients - costs.salary - costs.ads };
  state.monthIncome = 0; state.monthGuests = 0; state.monthCosts = { ingredients: 0, salary: 0, ads: 0 };
}
```
`menu.ts`: `isMenuAvailable`는 bought 무시, farm만 창고 확인. `consumeIngredients`는 farm 차감 + `const c = ingredientCost(state, menuId); state.money -= c; state.monthCosts.ingredients += c;`. `tick.ts`의 `onNewMonth` → `closeMonth` 호출로 교체(월급·광고는 Task 3·4에서 그 앞에 끼워 넣는다).

- [ ] **Step 3: 통과·Commit** `feat(sim): 재료비와 월말 정산`

---

### Task 3: staff.ts — 후보 생성·채용·배치·월급·효과

**Files:** Create `src/sim/staff.ts`; Modify `src/sim/actions.ts`, `src/sim/tick.ts`, `src/sim/progress.ts`, `src/sim/economy.ts`; Test `src/sim/__tests__/staff.test.ts`

- [ ] **Step 1: 실패하는 테스트**
```ts
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { generateCandidate, salaryOf, roleEffect, canHire } from '../staff.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';

test('공고 등급별 후보 수와 스탯 범위', () => {
  const s = createInitialState(7);
  expect(apply(s, { type: 'postJob', tier: 'flyer' }).ok).toBe(true);
  expect(s.candidates.length).toBe(3);
  expect(s.money).toBe(30000 - 10000);
  for (const c of s.candidates) for (const v of Object.values(c.stats)) { expect(v).toBeGreaterThanOrEqual(10); expect(v).toBeLessThanOrEqual(40); }
  expect(new Set(s.candidates.map((c) => c.id)).size).toBe(3);
});
test('같은 seed면 같은 후보', () => {
  const a = createInitialState(3), b = createInitialState(3);
  apply(a, { type: 'postJob', tier: 'site' }); apply(b, { type: 'postJob', tier: 'site' });
  expect(JSON.stringify(a.candidates)).toBe(JSON.stringify(b.candidates));
});
test('월급 공식', () => {
  expect(salaryOf({ service: 20, cooking: 20, sense: 20, stamina: 20 }, 1)).toBe(20 * 4 * 30 + 5000);
});
test('채용: 슬롯이 있어야 하고, 역할이 해금돼야 하고, 후보가 사라진다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  const c = s.candidates[0]!;
  expect(canHire(s, c.id, 'gather').ok).toBe(false); // 미해금 역할
  expect(apply(s, { type: 'hire', candidateId: c.id, role: 'hall' }).ok).toBe(true);
  expect(s.staff.length).toBe(1); expect(s.staff[0]!.role).toBe('hall'); expect(s.candidates.length).toBe(2);
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  expect(apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' }).ok).toBe(false); // 슬롯 2 초과
});
test('후보는 다음 달 초에 사라진다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.candidates.length).toBe(0);
});
test('월말 월급 차감, 못 주면 unpaidMonths, 2달이면 퇴사', () => {
  const s = createInitialState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  const sal = s.staff[0]!.salary;
  s.money = sal + 100;
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.lastMonthCard!.costs.salary).toBe(sal);
  s.money = 0;
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.staff[0]!.unpaidMonths).toBe(1);
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.staff.length).toBe(0);
});
test('assign·fire·levelUp', () => {
  const s = createInitialState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  const st = s.staff[0]!;
  expect(apply(s, { type: 'assign', staffId: st.id, role: 'barista' }).ok).toBe(true);
  expect(apply(s, { type: 'levelUp', staffId: st.id }).ok).toBe(false);
  s.research = 3; const before = { ...st.stats };
  expect(apply(s, { type: 'levelUp', staffId: st.id }).ok).toBe(true);
  expect(st.level).toBe(2); expect(st.stats.service).toBeGreaterThan(before.service);
  const m0 = s.money;
  expect(apply(s, { type: 'fire', staffId: st.id }).ok).toBe(true);
  expect(s.money).toBe(m0 - st.salary); expect(s.staff.length).toBe(0);
});
test('roleEffect: 홀 서비스 합, 바리스타 감각, 운반 할인', () => {
  const s = createInitialState(1);
  s.staff.push({ id: 's1', name: 'x', face: { hair: 0, skin: 0, top: 0 }, stats: { service: 50, cooking: 10, sense: 30, stamina: 10 }, skill: 'thrifty', level: 1, salary: 0, role: 'carry', unpaidMonths: 0, x: 0, y: 0, path: [], anchor: null });
  expect(roleEffect(s, 'carry')).toBe(10);
  expect(roleEffect(s, 'hall')).toBe(0);
});
```

- [ ] **Step 2: 구현 요점** (`staff.ts`)
- `TIERS = { flyer: { cost: 10000, count: 3, min: 10, max: 40 }, site: { cost: 50000, count: 4, min: 30, max: 60 }, headhunter: { cost: 200000, count: 5, min: 50, max: 80 } }`
- `generateCandidate(state, tier)`: `randInt`로 스탯 4개, 이름 `pickWeighted`(균등), 스킬 균등, 얼굴 파츠 `randInt`, `salary = salaryOf(stats, 1)`, `expiresMonthIndex = monthIndex(clock) + 1`, id `c${nextId++}`.
- `salaryOf(stats, level) = (sum(stats)) * 30 + level * 5000`.
- `canHire`: 후보 존재, 역할 해금(`state.unlocked.roles`), `staffInRole(role) < slots[role]`, 돈은 필요 없음(월급은 월말).
- `hire`: Staff 생성(`x,y`는 창고 문 앞 (4,3), `anchor` 역할별: hall→좌석 근처, barista/cook→창고 문, field→밭, 나머지→창고 옆).
- `roleEffect(state, role)`: 그 역할 직원들의 핵심 스탯 합 + 스킬 보정. `ingredientDiscount(state) = min(0.3, roleEffect('carry')/500 + thrifty 스킬 합)`.
- `payroll(state)`: 월말에 각 직원 월급 차감. 돈이 모자라면 그 직원 `unpaidMonths++`, 2가 되면 퇴사(로그 문자열을 `state.notices: string[]`에 push — HUD 토스트용, 최대 10개 보관). 지급된 만큼 `monthCosts.salary`.
- `levelUp`: 연구 `level * 3` 소모, 스탯 각 +3~+6(`randInt`), `salary` 재계산, 최대 10.
- `expireCandidates(state)`: 월초에 `expiresMonthIndex <= monthIndex` 제거.
- `moveStaff(state, dtMs)`: 직원마다 `anchor` 주변 걷기 가능 칸 중 랜덤 목적지로 `findPath` → 도착하면 1~3초 대기 후 다음. 손님의 `moveAlong` 재사용(guests.ts에서 export).
- tick.ts `step`: 월 바뀜 처리 순서 = `payroll` → `expireAds`(Task 4) → `closeMonth` → `expireCandidates`. 매 스텝 `moveStaff`.
- progress.ts `unlock`: kind `slot` → `state.slots[ref]++`; `role` → `state.unlocked.roles.push(ref)`.

- [ ] **Step 3: 통과·Commit** `feat(sim): 직원 공고·채용·배치·월급·효과`

---

### Task 4: 직원이 게임에 영향 — 조리 시간·서비스·밭 일꾼·채취꾼

**Files:** Modify `src/sim/guests.ts`, `src/sim/farm.ts`, `src/sim/tick.ts`; Test `src/sim/__tests__/staff.test.ts`(추가), `guests.test.ts`(수정)

- [ ] **Step 1: 실패하는 테스트**
```ts
test('조리 시간: 직원 없으면 5초, 바리스타(감각 50)면 3초 이하', () => {
  const s = cafe(); // americano 슬롯
  spawnGuests(s, 1); updateGuests(s, 6000);
  const g = s.guests[0]!;
  expect(g.phase).toBe('seated'); expect(g.mood).toBeNull(); expect(g.waitMs).toBeGreaterThan(0);
  updateGuests(s, 5000);
  expect(g.mood).not.toBeNull();
  const s2 = cafe(); s2.staff.push(staffWith({ sense: 50 }, 'barista'));
  spawnGuests(s2, 1); updateGuests(s2, 6000); updateGuests(s2, 3000);
  expect(s2.guests[0]!.mood).not.toBeNull();
});
test('홀 직원 서비스는 만족 기준을 낮춘다', () => {
  // tourist minScenery 2, 자리 경치 1 → meh. 홀 service 60이면 happy
  const s = cafe(); spawnGuests(s, 1); s.guests[0]!.type = 'tourist'; updateGuests(s, 12000);
  expect(s.guests[0]!.mood).toBe('meh');
  const s2 = cafe(); s2.staff.push(staffWith({ service: 60 }, 'hall'));
  spawnGuests(s2, 1); s2.guests[0]!.type = 'tourist'; updateGuests(s2, 12000);
  expect(s2.guests[0]!.mood).toBe('happy');
});
test('밭 일꾼은 제철에 빈 밭에 심고 익으면 딴다', () => {
  const s = createInitialState(1); s.clock.month = 10;
  apply(s, { type: 'place', objectType: 'field', x: 6, y: 6 });
  s.staff.push(staffWith({ stamina: 30 }, 'field'));
  tick(s, DAY_MS);
  const f = Object.values(s.objects).find((o) => o.type === 'field')!;
  expect(f.crop?.cropId).toBe('carrot');
  f.crop!.ready = true; tick(s, DAY_MS);
  expect(s.storage['carrot']).toBeGreaterThan(0);
});
test('채취꾼은 하루 한 번 확률로 farm 재료를 가져온다', () => {
  const s = createInitialState(5); s.unlocked.roles.push('gather'); s.slots.gather = 1;
  s.staff.push(staffWith({ stamina: 80 }, 'gather'));
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect((s.storage['carrot'] ?? 0) + (s.storage['tangerine'] ?? 0)).toBeGreaterThan(0);
});
```
`staffWith(partialStats, role)` 헬퍼는 테스트 파일 상단에.

- [ ] **Step 2: 구현 요점**
- guests.ts `order()`: 메뉴 결정·재료 소비·돈은 즉시, 하지만 `mood`는 `waitMs` 뒤에 결정. `waitMs = PREP_MS(5000) × (1 − min(0.6, roleEffect(barista|cook by category)/100))` (drink→barista, dessert/meal→cook) × (1 − speed 스킬). `updateGuests`의 seated 분기: `waitMs > 0`이면 감소, 0이 되는 순간 `resolveMood`. 만족 기준: `scenery + serviceBonus >= minScenery`, `serviceBonus = floor(roleEffect('hall') / 30)`. `SEAT_MS`는 mood 결정 후부터 센다. `monthGuests`는 도착 시 센다(이월 항목 해결).
- farm.ts: `staffFarmWork(state)` 매일 — 밭 일꾼 있으면 `readyToHarvest` 전부 수확, 빈 밭에 제철 작물(해금된 것 중 첫 번째) 심기. 하루 작업량 = `1 + floor(stamina/20)` 칸. `gatherWork(state)`: 채취꾼마다 `nextRandom < 0.3 + stamina/200 + luck` 이면 farm 재료 중 랜덤 1~2개.
- tick.ts `onNewDay`: `growOneDay` → `staffFarmWork` → `gatherWork` → spawn.
- guests.test의 기존 타이밍 테스트는 `waitMs` 도입으로 6000ms 뒤 `mood`가 null이니 `updateGuests(s, 6000 + 5000)`로 갱신.

- [ ] **Step 3: 통과·Commit** `feat(sim): 조리 시간·홀 서비스·밭 일꾼·채취꾼`

---

### Task 5: ads.ts — 광고

**Files:** Create `src/sim/ads.ts`; Modify `actions.ts`, `guests.ts`, `tick.ts`; Test `src/sim/__tests__/ads.test.ts`

- [ ] **Step 1: 테스트**
```ts
test('광고 실행: 비용 차감, 최대 2개, 만료', () => {
  const s = createInitialState(1);
  expect(apply(s, { type: 'runAd', adId: 'flyer' }).ok).toBe(true);
  expect(s.money).toBe(25000); expect(s.monthCosts.ads).toBe(5000);
  apply(s, { type: 'runAd', adId: 'sns' });
  expect(apply(s, { type: 'runAd', adId: 'radio' }).ok).toBe(false);
  expect(apply(s, { type: 'runAd', adId: 'flyer' }).ok).toBe(false); // 중복
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.activeAds.length).toBe(0);
});
test('spawnMultiplier', () => {
  const s = createInitialState(1);
  apply(s, { type: 'runAd', adId: 'sns' });
  expect(spawnMultiplier(s, 'tourist')).toBeCloseTo(1.4);
  expect(spawnMultiplier(s, 'local')).toBe(1);
});
test('유튜버: 성공하면 3개월 부스트, 실패하면 아무 것도', () => {
  let ok = 0, fail = 0;
  for (let seed = 1; seed <= 20; seed++) { const s = createInitialState(seed); s.money = 1e6; apply(s, { type: 'runAd', adId: 'youtuber' }); if (s.youtuberBoostMonths === 3) ok++; else fail++; }
  expect(ok).toBeGreaterThan(5); expect(fail).toBeGreaterThan(2);
});
test('광고가 있으면 하루 손님이 는다', () => {
  const s = cafeWith3Tables(); const base = dailyGuestCount(s);
  apply(s, { type: 'runAd', adId: 'radio' });
  expect(dailyGuestCount(s)).toBeGreaterThan(base);
});
```
- [ ] **Step 2: 구현 요점** `ads.ts`: `runAd`(돈·중복·최대 2·youtuber는 `nextRandom < 0.6`이면 `youtuberBoostMonths = 3`), `spawnMultiplier(state, type)` = 활성 광고 곱 × (youtuber && tourist ? 2 : 1) × (1 + popular 스킬 합), `expireAds(state)`(월말: remainingMonths−−, 0이면 제거; popularityPerMonth 적용; youtuberBoostMonths−−). guests.ts: `dailyGuestCount(state) = clamp(2 + floor(seats/2) + floor((avgMult−1)×4), 1, 12)`, 타입 선택 가중치 = `weight × spawnMultiplier`. tick.ts `onNewDay`: `spawnGuests(state, dailyGuestCount(state))`.
- [ ] **Step 3: 통과·Commit** `feat(sim): 광고와 손님 유입 배수`

---

### Task 6: 헤드리스 봇 — 1년차 흑자 검증

**Files:** Modify `scripts/headless.ts`; Create `src/sim/__tests__/balance.test.ts`

- [ ] **Step 1: 봇 확장** — 시작 시 테이블 3, 슬롯에 americano/latte/scone/toast; 2달째 `postJob flyer` → 후보 중 service 최고를 hall, sense 최고를 barista; 돈 5만 넘으면 전단지; 9월에 밭 3개 + field 일꾼; 연구 되면 unlock. CSV에 `net, staff, ads` 열 추가.
- [ ] **Step 2: 밸런스 테스트**
```ts
test('봇이 1년차 12달 모두 순이익 > 0', () => {
  const rows = runBot(12, 1); // headless의 루프를 함수로 추출해 재사용
  for (const r of rows) expect(r.net).toBeGreaterThan(0);
  expect(rows[11]!.money).toBeGreaterThan(30000);
});
```
`scripts/headless.ts`의 봇 로직을 `src/sim/bot.ts`(순수)로 옮기고 스크립트는 CSV 출력만 담당. 실패하면 **데이터(가격·원가·월급 계수·손님 수)를 조정**해서 통과시킨다 — 코드가 아니라 JSON을 만진다. 조정한 값을 보고한다.
- [ ] **Step 3: Commit** `feat: 봇 확장과 1년차 흑자 밸런스 테스트`

---

### Task 7: 캐릭터 파츠 시스템 (직원·손님·주민 공용)

**Files:** Modify `tools/assets/sprites_chars.py`; regenerate sheet. 사용자 요청: 캐릭터를 훨씬 많이. 손으로 한 명씩 그리지 않고 **파츠 조합**으로 수백 종을 만든다.

- `body_{skin}_{dir}_{frame}` 36장(피부 3종 × 4방향 × 3프레임): 캐릭터 규격, 상의는 `#ffffff` 3톤(tint용), 바지 `road.MD`, 머리카락 없음.
- `hair_{style}_{dir}` 32장(스타일 8: 단발, 짧은 머리, 포니테일, 파마, 올림머리, 스포츠, 긴 생머리, 대머리(빈 프레임)) — `#ffffff` 3톤, tint로 색 6종.
- `acc_{kind}_{dir}` 24장(액세서리 6: 밀짚모자, 야구모자, 안경, 배낭, 카메라, 앞치마) — 고유 색, tint 없음.
- 렌더에서 조합: 몸(tint 상의색 8) + 머리(tint 6) + 액세서리 0~2. 경우의 수 3×8×6×8×(액세서리 조합) ≈ 수천. `Face` 타입을 `{ skin, hair, hairColor, top, acc: string[] }`로 확장하고 `names.json`에 개수 명시.
- 기존 `guest_local_*`/`guest_tourist_*` 24장은 유지(전용 디자인). 새 손님 타입(가족·올레꾼·한달살기·유튜버·외국인)은 파츠 조합 + 액세서리 규칙(올레꾼=야구모자+배낭, 유튜버=카메라 …)으로 `guests.json`에 정의.
- 삼춘 6명(3단계)도 같은 파츠에 고정 조합 + 초상 6장.
- `pnpm assets` → 콘택트 시트로 확인. Commit `feat(assets): 캐릭터 파츠 시스템(몸·머리·액세서리)`

### Task 8: 렌더 — 직원 노드

**Files:** Modify `src/render/GameView.ts`, `src/render/assets.ts`

- `makeCharacterNode(face)` 공용: 몸 `body_{skin}_{dir}_{frame}` tint=top색 + 머리 `hair_{style}_{dir}` tint=hairColor + 액세서리 `acc_{kind}_{dir}` 순서로 쌓은 Container. 직원·(새) 손님 타입·삼춘이 모두 이 함수를 쓴다. 방향·프레임 갱신 시 세 레이어 텍스처를 함께 교체.
- 역할 배지: 머리 위 16px 아이콘(`icon_build` 등 기존 아이콘 재활용: barista→`icon_menu`, cook→`icon_harvest`, hall→`icon_look`, field→`icon_plant`, gather→`icon_research`, carry→`icon_money`).
- 손님과 같은 방향·프레임·y-정렬.

---

### Task 9: UI — 직원 패널·광고 패널·월말 카드

**Files:** Create `src/ui/StaffPanel.tsx`, `src/ui/AdsPanel.tsx`; Modify `src/ui/BottomSheet.tsx`(탭 `직원`, `홍보` 추가), `src/ui/MonthCard.tsx`, `src/ui/Guide.tsx`

- StaffPanel: 상단 "공고" 버튼 3개(비용·후보 수 표시) → 후보 카드(이름·얼굴 파츠 미리보기 = 아이콘 대신 색 사각형 3개, 스탯 4개 막대 ★, 스킬 이름+설명, 월급) + 역할 드롭다운(슬롯 남은 것만) + 채용 버튼. 아래 "직원" 목록: 역할 변경, 레벨업(연구 비용 표시), 해고(확인 1회). 슬롯 현황 `홀 1/2`.
- AdsPanel: 광고 4개 카드(비용·기간·효과 한 줄) + 실행 버튼, 활성 광고와 남은 달.
- MonthCard: 수입 / 재료비 / 월급 / 광고 / **순이익**(색), 손님 수. `notices`(퇴사 등)도 표시.
- Guide: 1년차 힌트에 "3월: 아메리카노·토스트를 메뉴판에" → "손님이 기다리면 직원을 뽑아 보라(공고)" → "9월: 당근" 순서로 갱신.
- 텍스트는 초등 어휘, 아이콘은 기존 16px 세트 재활용.

---

### Task 10: 최종 확인

- `pnpm test` 전부, `pnpm headless 3 1`로 흑자 확인, 폰 뷰에서: 첫날 손님이 아메리카노를 사고 돈이 오름 → 공고 → 채용 → 직원이 걸어다님 → 홀 직원 후 관광객 😊 → 광고 후 손님 증가 → 월말 카드에 월급 차감.
- README에 직원·광고·경제 절 추가. Commit `docs: 2B-1`.

## 완료 기준
- 새 게임 첫 달부터 순이익 > 0 (봇 테스트).
- 공고→후보 3~5명(랜덤, seed 결정적)→채용→배치→월급 차감→효과(조리 시간·만족·자동 농사·채집·할인)가 전부 보임.
- 광고 2개 동시, 만료, 유튜버 확률.
- 직원이 파츠 조합 스프라이트로 격자 위를 걷는다.
