# 직원 액티브 스킬 + 동네 대항전 — rush3

스펙 `docs/superpowers/specs/2026-09-25-rush-battle.md` §3·§4·§5·§7 중 **스킬 데이터·효과·육성 연결**과 **대항전**.
러시 상태기계(`src/sim/rush.ts`)·러시 HUD(`src/ui/Rush*.tsx`)는 병렬 트랙 rush1·rush2의 몫이라, 여기서는 **`// TODO(rush1)` 스텁 + 훅**만 두었다.

## 0. 왜 이렇게 나눴나

| | 평상시 | 러시 |
|---|---|---|
| 직원 | 패시브 특기 `skills.json` — 품질·재료비·연구·유입 | **액티브 스킬** `staff_skills_active.json` — 조리 시간·팁·착석·청결·인내 |
| 경쟁 | 월간 순위표(`rival.ts`) · 대회 = 메뉴 품질 심사(`contest.ts`) | **대항전 = 영업 실력**(`battle.ts`) |

효과 종류 자체를 갈라 두어 패시브와 액티브가 같은 숫자를 두 번 건드리지 않는다.
대회와 대항전은 주기(연 2회 / 월 1회)·상대 수(3곳 / 1곳)·문구(「심사」 / 「붙는다·이겼다」)로 구분된다.

## 1. 직원 액티브 스킬 (§3)

### 데이터 — `src/data/staff_skills_active.json` (8개 = 직종 4 × 칸 2)

| 직종 | 1번 칸 | 효과 | 쿨 | 2번 칸 | 효과 | 쿨 |
|---|---|---|---|---|---|---|
| 바리스타 | 속사 커피 | 12초 조리 −60% | 30 | 한 모금 서비스 | 10초 만족 +4 | 40 |
| 요리사 | 오늘의 특선 | 10초 팁 ×2 | 35 | 푸짐한 한 접시 | 8초 조리 −40% | 40 |
| 홀 | 능숙한 안내 | 맨 앞 3명 즉시 착석 | 40 | 줄 달래기 | 줄 인내 +10초 | 35 |
| 청소 | 번개 청소 | 청결 +15 · 8초 만족 +3 | 25 | 구석구석 | 청결 +25 · 6초 만족 +2 | 30 |

JSON의 초는 **3배속 기준 초** — 스펙이 러시 길이를 재는 잣대(60~90초)와 같다.
`secToMs`가 게임 시간 ms로 환산한다(`RUSH_SPEED_REF = 3`).

### 육성이 목적이 된다 — `src/sim/skillActive.ts`

- **레벨 5 / 10**: 지속 ×1.25 / ×1.5, 효과 ×1.15 / ×1.3 (`SKILL_LEVEL_STEPS`)
- **칭호 프로 / 전설**: 쿨다운 −20% / −35% (`SKILL_COOLDOWN_CUT`, 숙련은 0)
- **러시 연수 `tr_rush`**: 2번째 스킬. 「칸이 열렸나(`activeSkillSlots ≥ 2`, 중반 해금)」 + 「이 직원이 다녀왔나(`trainingLog.tr_rush`)」 둘 다여야 쓴다 — 전체 해금 하나로 직원 전원이 한꺼번에 세지지 않게.

시간은 **게임 시간 ms 절대 시각**(`usedAt`·`readyAt`·`until`)으로 적는다. 따로 줄여 가지 않으므로 tick 훅이 필요 없고, 같은 세이브면 언제 계산해도 같은 값이라 봇·리플레이가 안 흔들린다.

### 소비 훅 (`guests.ts` 한 줄씩)

| 곳 | 한 줄 | 러시가 아니면 |
|---|---|---|
| `prepTimeMs` | `× (1 - activePrepCut(state, role))` | 0 |
| `serveLuck` 팁 | `× activeTipMult(state)` | 1 |
| `extraSatisfaction` | `+ activeSatisfaction(state)` | 0 |

즉발(착석·인내)은 `instantOf(state, kind)` / `clearInstant`로 러시가 읽어 간다.

## 2. 동네 대항전 (§4) — `src/sim/battle.ts`

- **언제**: 매월 마지막 주 토요일(`day % 7 === 6` → 30일 달의 27일). **2년차부터** — 1년차 밴드(말 자금 ≤1,000만)를 안 건드린다(`rival.ts`의 손님 수 효과와 같은 이유). 3일 전 예고 알림.
- **상대**: 순위표에서 나와 가장 가까운 곳(위쪽 먼저). 항복받았거나 인수한 곳은 빠진다.
- **상대 점수** = 그 카페 성장 곡선 × 3.4 + 회차 해시 난수(±20) + 우리 등급 보정(등급 한 칸당 +12). rng를 안 쓴다.
- **우리 점수**: 러시가 주면 그 점수, 없으면 **자동 해결**(`autoBattleScore`) — §2 점수식을 스탯으로 옮긴 것:
  `min(줄 20, 자리 수, 주인 4 + 홀×4 + 조리×3) × 10 + 평판×0.6 + 청결×0.3`.
  자리만 늘려도, 직원만 늘려도 안 오른다. 조작(자리 배정·스킬·밀린 주문)은 러시가 이 위에 얹는다.
- **승패**
  - 승리: 상대 단골 1~2명이 **영구 이동**(아직 단골 없는 손님층에서 결정적으로) + 상금(등급 × 10만) + 동네 순위 「서비스」 +0.8(최대 6)
  - 패배: 우리 단골 1명이 그쪽으로 (가장 늦게 생긴 사람부터). **단골 3명 이하면 아무도 안 간다** — 한 번 밀린 카페가 영영 못 일어서지 않게.
  - **3연승 → 항복**: 그 집 손님층 이관(손님 +3%/곳), 상대 목록에서 빠짐. 5곳 다 이기면 `champion` → 순위표 1위 고정.

### 다른 파일에 둔 훅 (전부 한 줄)

| 파일 | 한 줄 |
|---|---|
| `tick.ts` onNewDay | `dailyBattle(state)` |
| `rival.ts` `myAxes` | 서비스 항목에 `state.battle.rankPoints` |
| `rival.ts` `scoreboard` | `champion`이면 내 줄을 맨 앞으로 |
| `rival.ts` `rivalGuestMult` | 항복받은 곳 수 × 3% |

## 3. 중반 해금 (§5) — 보상 타입만

| 보상 | 하는 일 | 상태 |
|---|---|---|
| `activeSkillSlot { n }` | 직원 2번째 재주 칸 (최대 2) | **새로 추가** |
| `titleChance { pct }` | 칭호 붙을 확률 +pct% (세 등급 전부, 등급별 60% 상한) | **새로 추가** |
| `staffCap { n }` | 직원 정원 +n | 이미 있음 (midgame) |
| `jobTier { id }` | 채용 방법 해금 | 이미 있음 (midgame) |

`goals.json`의 조건(`rushGrades`)은 rush1이 잡는다.

## 4. UI

| 화면 | 무엇 |
|---|---|
| 직원 창 카드 | 「재주 속사 커피 · 18초 조리 78% 빨리 · 쿨 30초」 + 2번 칸이 잠겨 있으면 「러시 연수를 다녀오면…」 |
| 채용 후보 카드 | 고른 직종 기준 재주 한 줄 |
| 채용 비교표 | 「재주」 열 |
| 미니 카드(맵 탭) | 재주 한 줄 |
| 장부 › 평가 | 동네 순위표에 **전적 열** + **동네 대항전 카드**(예고: 상대·전적·예상 승률 / 진행 중: 비교 바 / 결과: 승패·오간 단골 이름·상금·순위 변동) |
| `src/ui/BattleBar.tsx` | 상대 점수 실시간 비교 바 — TODO(rush2): Rush HUD가 `<BattleBar />` 한 줄만 그리면 된다 |

## 5. rush1·rush2에게 넘기는 인터페이스

```ts
// skillActive.ts
rushActive(state)                       // 지금은 state.rush.active를 구조적으로 읽는 스텁
canUseSkill(state, staffId, skillId?)   // 액션 { type: 'useStaffSkill', staffId }가 부른다
useStaffSkill(state, staffId, skillId?)
skillCards(state): SkillCard[]          // 러시 하단 직원 카드 3~6장
instantOf(state, 'seatFront' | 'patience') / clearInstant(state, kind)
activePrepCut / activeTipMult / activeSatisfaction   // guests.ts가 이미 물고 있다

// battle.ts
RUSH_WEEKDAY = 6                        // 러시 요일 — rush1이 그대로 쓰면 된다
activeBattle(state) / battleHud(state)  // 진행 중인 판 · 비교 바 한 줄
setBattleScore(state, myScore)          // 러시가 점수를 올릴 때마다
resolveBattle(state, myScore?)          // 러시 끝에서 점수와 함께 (안 주면 자동 해결)
```

`dailyBattle`은 `state.rush.enabled`가 `true`가 아니면 그 자리에서 자동 해결한다 (`rushWillResolve`).
rush1이 러시를 붙이면 그 한 줄만 `rushEnabled(state)`로 바꾸고, 러시 끝에서 `resolveBattle(state, 점수)`를 부르면 된다.

## 6. 균형 조정 기록

첫 값(상대 = 곡선 ×2.8 + 등급 ×45, 상금 15만/등급, 순위 점수 1.5(최대 15), 항복 손님 +5%)으로는
봇이 2~3년차 대항전을 **전승**해 3년차 말 자금 9,037만(밴드 상한 8,500만)·월 손님 3,029(상한 3,000)를 넘겼다.
자동 해결 점수가 자리·평판·청결로 금세 포화되는 게 원인이라, 점수식을 **받은 손님 수**(줄·자리·손이 함께 정함) 기준으로 바꾸고 아래로 낮췄다.

| 값 | 처음 | 지금 |
|---|---|---|
| 상대 점수 배수 | 2.8 | 3.4 |
| 등급 보정 | 45 | 12 |
| 상금 | 15만 × 등급 | 10만 × 등급 |
| 순위 점수 | 1.5 (최대 15) | 0.8 (최대 6) |
| 항복 손님 | +5%/곳 | +3%/곳 |
| 패배 단골 보호 | 없음 | 단골 3명 이하면 안 뺏김 |

봇(무조작)은 약한 집은 이기고 로스터리 하루 같은 강한 집에는 진다 — §7-2의 「조작이 점수를 20% 이상 바꾼다」가 설 자리를 남긴 것이다.

## 7. 검증

- `pnpm test` 1,077 통과 (새 테스트 42: `skillActive.test.ts` 22 · `battle.test.ts` 20)
- `pnpm build` · `pnpm validate:goals --strict` (목표 68 · 문제 0)
- `pnpm headless 3 {1,2,3}`: 1년차 말 ₩771만·₩681만·₩718만 (≤1,000만) · 3년차 말 ₩3,258만·₩3,884만·₩5,770만 (2,500~8,500만) · 파산 없음
- `pnpm headless 5 1`: 5년 KPI 통과 (목표 66 · 직원 8 · 자금 ₩5,999만 · 엔딩 768점)
- `noCliche`·`noIdLeak` 통과
- 375×812 브라우저 확인(세이브 주입): 직원 카드 재주 줄 · 채용 후보 재주 줄 · 순위표 전적 열 · 대항전 예고/결과 카드

### 기존 테스트 수정

`연수 2종` / `직원 풀 27명` 테스트가 연수 개수 2를 고정하고 있어, 러시 연수가 붙으면서 3으로 고치고 효과 검사는 기존 2종만 돌게 했다 (`src/sim/__tests__/staff.test.ts`).

## 8. 스키마

전부 optional 필드 + `save.ts backfill` (SAVE_VERSION은 통합 때 한 번):

```
GameState.activeSkills?: Record<staffId, ActiveSkillUse>   // {} 
GameState.activeSkillSlots?: number                         // 1
GameState.titleChanceBonus?: number                         // 0
GameState.battle?: BattleState                              // initBattle()
TrainingDef.grantActiveSlot? / requires.activeSlot?
GoalReward: activeSkillSlot · titleChance
Action: useStaffSkill · dismissBattle
FxEvent: { kind: 'skill', staffId, text, tick }             // 렌더는 아직 무시 (rush2 몫)
```
