# 2B-2 구현 계획 — 손님층·단골·게시판·메뉴 크래프팅·확률/히든·★·랭킹·튜토리얼

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2B-1(경제·직원·홍보) 위에 카이로 루프의 나머지 시스템을 얹어, 손님층별 만족→단골→의뢰, 상성·아이템·분위기, 메뉴 크래프팅(재료 콤보·파라미터·토핑·스킬), 월말 룰렛·메달 상점, ★ 등급·연말 랭킹 채점, 할망 튜토리얼 팝업이 동작한다. 모든 수치는 **GDD v2 표** `docs/superpowers/specs/2026-09-17-gdd-v2-tables.md`(시설 87·손님 103·부탁 103·콤보 45·세트 14·관광지 24·직원 27·채용 5·유니폼 5·아이템 20+12·상점·가이드북 11·이벤트 42·경관 계절) + 손님 체인 `guest-chain.mmd`에서 옮긴다. v1 데이터 설계서(`game-data-tables.md`)는 재료·메뉴·토핑·룰렛·필지 등 v2 표에 없는 항목에만 쓴다. 마스터 GDD `2026-09-17-gdd-v2-master.md` §1의 변경(인구 태그·효과 6종·부탁 체인·관광지 24 Lv5·가이드북 11·마일리지/응모권 상점)을 각 Task에 적용한다.

**Architecture:** sim 모듈 추가 — `segments`(손님층 인기·만족·타깃), `compat`(상성·분위기), `items`, `board`(의뢰·이벤트·투자), `craft`(메뉴 개발·토핑·스킬 티어), `roulette`, `rank`(★·랭킹 채점), `tutorial`(단계 상태). 전부 순수·결정적. UI는 패널 6개 + 팝업 프레임 공용 컴포넌트. 렌더 변경은 최소(포토존 이펙트, 룰렛 화면은 React/CSS).

**Tech Stack:** 기존과 동일. **전제:** 2B-1 머지.

---

## 파일 구조
```
src/data/  segments.json  compat.json  auras.json  items.json  investments.json  requests.json  events.json
           ingredients.json(스탯 6종 추가)  ingredient_combos.json  toppings.json  menu_skills.json
           brew_compat.json  hidden_recipes.json  roulette.json  medal_shop.json  contests.json
           ranks.json  settle_ranks.json  tutorial.json  dialogue.json(확장)
src/sim/   segments.ts compat.ts items.ts board.ts craft.ts roulette.ts rank.ts tutorial.ts  (+ 기존 수정)
src/ui/    Popup.tsx(카이로식 갈색 프레임 공용)  SegmentsPanel  BoardPanel  CraftPanel  RoulettePanel
           MedalShopPanel  RankPanel  ObjectInfoPanel  TutorialOverlay
tools/data/from_tables.py   # 데이터 설계서 마크다운 표 → JSON 변환 (표 편집이 원본)
```

## 공통 규칙
- 데이터 설계서 표를 손으로 JSON에 옮기지 말고 `tools/data/from_tables.py`가 마크다운 표를 파싱해 생성한다(`pnpm data`). 표 헤더 → 키 매핑은 스크립트에 명시. 이후 밸런싱은 **마크다운 표를 고치고 `pnpm data`**.
- 모든 확률은 `nextRandom(state)`. 새 모듈은 `step()`에서 정해진 순서로 호출(일·월·년 훅).
- 액션 추가: `setTarget`, `useItem`, `acceptRequest`, `invest`, `acceptEvent`, `develop`, `addTopping`, `removeTopping`, `spinRoulette`, `buyMedal`, `enterContest`, `tutorialNext`.

---

### Task 1: 표 → JSON 변환 도구 v2 (gdd-v2-tables.md 파싱, 기존 v1 파서 유지)
**Files:** Create `tools/data/from_tables.py`, `tools/data/test_from_tables.py`; Modify `package.json`(`"data": "python3 tools/data/from_tables.py"`)
- 마크다운 표 파서: `## N.` 절 제목으로 표를 찾고 헤더 행을 키로, 셀을 값으로. 숫자(콤마 제거)·퍼센트·`—`(null)·`a·b`(배열) 변환 규칙. 절별 후처리 함수(예: §1.1 좌석 → `objects.json`의 kind 'seat', `seats` 필드).
- 출력 JSON 목록과 스키마는 각 Task에 정의. 테스트: 샘플 표 문자열 → 기대 객체.
- Commit `feat(data): 마크다운 표 → JSON 변환 도구`

### Task 2: 손님 타입 100·인구 태그·효과 6종·부탁 체인·타깃·단골
**Files:** Create `src/sim/segments.ts`, `src/data/segments.json`; Modify `guests.ts`, `types.ts`, `actions.ts`, `tick.ts`; Test `segments.test.ts`
- `GuestTypeDef` → 데이터 설계서 §4 스키마: `{ id, name, initialPopularity, budget, likesBase[], likesStats[], likesObjects[], dislikes[], unlock: {segment?, satisfaction?}|'start'|... }`. 손님층 12.
- `state.segments: Record<id, { popularity, satisfaction, unlocked, regular: 'none'|'regular'|'vip' }>`, `state.targets: string[]`(최대 3).
- 스폰 가중치 = `popularity`(0이면 안 옴) × 홍보 배수 × 시간대. 예산 초과 메뉴는 주문 안 함(`moodReason='price'`).
- 만족 계산에 `likesStats`(메뉴 스탯 합)·`likesObjects`(좌석 반경 2 안)·`dislikes` 반영. 😊 → `satisfaction +2`(타깃 +3), 😠 −1. 30 → 연쇄 해금(`notices`에 "새 손님층 소개"), 50 단골(빈도 ×1.5·예산 ×1.3), 80 VIP.
- 테스트: 해금 연쇄, 타깃 3 제한, 예산 거부, 단골 배수.
- Commit `feat(sim): 손님층 인기·만족·타깃·단골`

### Task 3: 상성·분위기·아이템·오브젝트 정보
**Files:** Create `src/sim/compat.ts`, `src/sim/items.ts`, `src/data/compat.json`, `auras.json`, `items.json`; Modify `grid.ts`(objectStats), `objects.json`(§1 전체 56종 — 스프라이트 없는 것은 플레이스홀더로 표시), UI `ObjectInfoPanel.tsx`
- `objectStats(state, objId) → { popularity, feePct, scenery, noise, upkeep, combos: [...], auraLevels }`: 기본 + 상성(§2) + 아이템(§3) + 분위기(§12) + 계절 보너스. 좌석 만족·가격 계산이 이걸 쓴다.
- 히든 상성은 처음 발동 시 `state.codex.combos`에 등록 + notice.
- `useItem` 액션: 인벤토리 `state.inventory: Record<itemId, n>`에서 소모, 같은 종류 오브젝트 전체 `itemBonus` 누적(상한 +30).
- ObjectInfoPanel: 인기·경치·요금·유지비·계열·설명·아이템 사용 버튼·발동 중 상성 목록.
- 테스트: 상성 적용값, 히든 발견, 아이템 상한, 분위기 레벨.
- Commit `feat(sim): 상성·분위기·아이템과 오브젝트 정보`

### Task 4: 게시판 — 부탁(체인)·이벤트 42·관광지 24 투자(Lv1~5)
**Files:** Create `src/sim/board.ts`, `src/data/requests.json`, `events.json`(§15), `investments.json`(§11); Modify `tick.ts`, `actions.ts`; UI `BoardPanel.tsx`, `Popup.tsx`
- 의뢰 생성: 매월 1일 VIP 손님층·삼춘·명소에서 최대 2개(확률 60%). 조건 타입 `menuSold{menuId,n}` / `objectPlaced{type,n}` / `ingredient{id,n}` / `segmentHappy{seg,n}` / `contest`. 기한 1~2개월, 보상 `{money, research, medals, item?, recipe?}`. 대사 팝업(초상 + 텍스트) → "도전하기".
- 이벤트: §15 표 30개, `trigger: {monthProb, months?, condition}`, `choice?: {accept: {...}, decline}`. 매월 1일 롤. 적용은 `effects` DSL(`spawnMult`, `harvestMult`, `money`, `unlock`, `notice`) — 12종.
- 투자: §11 40개, 조건 검사 → 게시판 카드 → `invest` 액션 → 보상 해금(오브젝트·재료·손님층·필지 권리·특별 손님).
- 테스트: 의뢰 완료 판정, 기한 만료, 이벤트 확률 seed 재현, 투자 조건.
- Commit `feat(sim): 게시판 — 의뢰·이벤트·투자`

### Task 5: 메뉴 크래프팅
**Files:** Create `src/sim/craft.ts`, `src/data/ingredient_combos.json`, `toppings.json`, `menu_skills.json`, `brew_compat.json`, `hidden_recipes.json`; Modify `ingredients.json`(스탯 6 추가, §6.1 32종), `menus.json`(메뉴에 `stats`, `skills`, `toppings[]`, `level`), UI `CraftPanel.tsx`
- `develop` 액션 `{ base, ingredients[], params?, staffId }` → `state.developing = { ...; doneDay }`; 3일 뒤 `resolveDevelop`: 성공 70/대성공 10/실패 20(+직원 보정), 스탯 = 재료 합 + 콤보(§6.2) + 파라미터 보너스(§7: 성공률·보너스 폭) + 직원 + 난수. 히든 레시피 조합이면 이름·보기 고정. 새 메뉴는 `menus`에 동적 추가(`state.customMenus`).
- 토핑 추가/제거 → 스탯·스킬 누적 → 스킬 티어(§15.1 표) 효과: 판매가·재료비·식사 시간·방문 확률·손님층 평가.
- 메뉴 레벨업(재료+돈) → 인기·가격 +.
- 손님 취향: `likesBase`·`likesStats` 일치 시 만족 보너스.
- 테스트: 콤보 발동(같은 재료 제외), 파라미터 성공률, 스킬 티어 경계, 히든 레시피 발견, 재료비 계산에 토핑 포함.
- Commit `feat(sim): 메뉴 크래프팅 — 콤보·파라미터·토핑·스킬`

### Task 6: 응모권 추첨(인형뽑기 톤)·마일리지 상점·응모권 상점·강화 아이템 20·유니폼
**Files:** Create `src/sim/roulette.ts`, `src/data/roulette.json`, `medal_shop.json`; Modify `tick.ts`(월말 `rouletteAvailable=true`), `actions.ts`; UI `RoulettePanel.tsx`(원판 CSS 회전 애니 2초 → 결과 팡파르), `MedalShopPanel.tsx`
- `spinRoulette`: 무료 1회/월 또는 메달 1 → 가중치 8칸(§14) → 보상 적용. 결과는 sim이 즉시 결정하고 UI는 연출만(결정성).
- 메달 획득 규칙(§14)을 각 모듈 훅에 심는다. `buyMedal` 액션 12항목.
- 폐창고 발굴 `dig` 액션 월 1회 30%, 밭 조성 5%.
- 테스트: 확률 분포(seed 1000회 → 오차 ±3%p), 무료 회전 리셋, 메달 차감.
- Commit `feat(sim): 룰렛·메달 상점·발굴`

### Task 7: 카페 랭크·★ 등급·가이드북 11종 채점
**Files:** Create `src/sim/rank.ts`, `src/data/ranks.json`(§17), `settle_ranks.json`, `contests.json`(§13); Modify `tick.ts`(3월·9월 랭킹, 12월 마을제); UI `RankPanel.tsx`(항목별 게이지 애니 → 종합 → ★)
- ★ 조건 3개 검사(월말). 승급 시 해금 목록 적용 + 팡파르 팝업.
- 랭킹 채점: 메뉴(평균 스탯·수)·경치(좌석 평균 경치)·접객(홀 서비스·대기 시간)·제주다움(제주 재료 비율·랜드마크) 각 0~100 → 종합. 가상 경쟁 카페 9곳 점수(seed·년차 스케일) → 순위·보상(메달·연구).
- 콩쿠르: 게시판 이벤트로 등장(조건), `enterContest {menuId}` → 심사 가중치 × 메뉴 스탯 + 난수 → 우승/입상/탈락, 부상 적용.
- 정착 등급 7단계 조건(§17) 마을제(12월) 심사.
- 테스트: ★ 승급, 채점 범위, 콩쿠르 판정 결정성.
- Commit `feat(sim): ★ 등급·랭킹 채점·콩쿠르·정착 심사`

### Task 8: 튜토리얼·팝업 프레임·대사
**Files:** Create `src/sim/tutorial.ts`, `src/data/tutorial.json`(12단계: 조건 + 할망 대사 2~3줄 + 강조할 UI 요소 id); UI `TutorialOverlay.tsx`, `Popup.tsx` 공용(제목 바·본문·네/아니요·초상 슬롯), 고용·해고·투자·룰렛·구매 확인에 적용
- 튜토리얼 상태 `state.tutorial: { step, done }`; 각 단계 조건은 sim 상태로 판정(예: step 2 = 테이블 1개 배치). 스킵 가능(설정).
- 대사 확장 `dialogue.json`: 손님층 12 × (happy 5, meh 이유별 5), 삼춘 6명 인사 5, 이벤트·의뢰 대사.
- Commit `feat(ui): 튜토리얼 12단계·카이로식 팝업·대사 확장`

### Task 9: 헤드리스 봇 확장·밸런스
- 봇이 타깃 설정·의뢰 수락·개발·룰렛·투자·콩쿠르까지 수행. 15년 CSV에 ★·랭킹·정착 등급 열 추가. 밸런스 테스트: 5년차 ★3 도달, 15년차 ★5 가능(seed 3개 중 2개).
- Commit `feat: 봇 확장과 밸런스 테스트`

### Task 10: 최종 확인·README·2B-3 이월 목록
- 폰 뷰 15분 플레이(첫 달 → ★1 → 첫 의뢰 → 첫 룰렛). 콘솔 에러 0. README 갱신.

## 완료 기준
- 손님층 12가 인기·만족·타깃으로 움직이고, 30/50/80 연쇄가 보인다.
- 오브젝트 정보 패널에 상성·아이템·분위기가 반영된 인기·경치가 나온다.
- 게시판에 의뢰·이벤트·투자 카드가 뜨고, 수락/완료/보상이 돈다.
- 메뉴 개발로 새 메뉴를 만들고 토핑·스킬 티어가 가격·회전율에 영향을 준다.
- 월말 룰렛과 메달 상점이 동작한다. ★ 승급·3/9월 랭킹·12월 마을제 팝업이 뜬다.
- 첫 플레이에 할망 튜토리얼이 12단계로 안내한다.
- 모든 수치가 데이터 설계서 표에서 `pnpm data`로 생성된다.
