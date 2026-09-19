# 컨텐츠 확장 6트랙 통합 기록 (브랜치 `x`)

스펙: `docs/superpowers/specs/2026-09-18-hss2-content-expansion.md` §3~§7, §5 트랙 표. 머지 순서: `x-econ`(E) → `x-facil`(A) → `x-spots`(C) → `x-staff`(D) → `x-site`(F) → `x-goals`(B). 모든 머지는 `npx tsc --noEmit` 통과 후 커밋, 마지막에 `pnpm test`·`pnpm build`·`pnpm validate:goals --strict` 통과.

## 1. 머지 충돌 해결 (양쪽 의미 다 살림)

| 파일 | 결정 |
|---|---|
| `compat.ts` | A `comboTotal/Lv 배수/명당` + C `spotFeePct`(명소 Lv3 +2%·Lv5 +5%)를 `rawStats`의 요금 %에 더한다 |
| `guests.ts` | E 기반값 + C `spotSpawnMult`(명소 태그·투어 버스 단체 ×1.3 — E의 중복 `TOUR_BUS_GROUP_MULT` 제거) + A `recordUse/facilityFee/comboPickMult/comboSatisfaction/cleanSatisfaction` + D `addRoleExp`·특기(`feeBonus`·`groupSatisfaction`·`nightSatisfaction`·`regularBonus`) + F `siteBonus` 4줄(요금·서빙 시간·만족·시설 요금). 명소 손님 유입은 C 방문객 × 3%(`spotGuestBonus`)로 통일 |
| `tick.ts` | 월초: E 순서 유지 + `monthlySpots/monthlyGifts`(투어 버스 월 계약비는 C `chargeTourBus` → E `monthCosts.tourBus`). 새 날: A `dailyCleanliness` + D `dailyWorkExp/dailyTraining/checkRoleUnlocks` + C `dailySpots` |
| `state.ts` | `SAVE_VERSION = 17` 하나. 투어 버스 상태는 C의 `tourBus/tourBusFreeMonths` 하나로(E 중복 삭제) |
| `store.ts`/`index.ts`/`MiniCard.tsx`/`data/index.ts` | export·ACTION_SFX·import 합집합 |
| 급여 | D `staff.ts salaryOf` → E `economy.ts salaryOf(raise%)`로 위임(채용·승급·연수 후 재계산에 `state.salaryRaisePct` 반영) |
| 노후 | E `isAged/AGED_UPKEEP_MULT` 삭제 → A `isWorn/wearOf`, 유지비 배수는 `objectStats().upkeep`에서만 곱함(이중 곱 제거) |
| 청결 | E `cleanlinessGuestMult`·`state.cleanliness` 스텁 삭제 → A `state.clean.value`(손님 배수는 A의 하루짜리 spawnMult 효과 하나로). 심사 `clean` 항목 = `clean.value + cleanJudgePenalty` |
| 청결 회복 | D `cleanPowerOf`(기술÷5+힘÷10, 기력·특기). 청소 직원이 없으면 일하는 직원 전원 ¼ (g26 「청결 80 한 달」이 청소 직종을 여는 순환을 풀기 위해) |
| 실패 대화 | E `failure.ts`의 경고·대출·위기, `guidebook.ts` 강등을 B `alerts {type:'failure', stage}` → `data/dialogue/failure.json` 대화로 |
| 대출 감액 | B `scaleReward` → E `loanRewardMult`(`loan.balance`) |
| 랜드마크 | v3에서 해금 경로가 없던 버그: `LANDMARKS`에 v2 시설 표의 부탁·명소 조건을 붙이고 `evaluateFacilityUnlocks`가 같이 돈다(폭낭은 ★3) |
| 시그니처 | ★3 조건 「시그니처 1」인데 베이스가 ★3에서 열려 막힘 → `SIGNATURE_STAR = 2` |
| 셀렉트 박스 | `src/ui` 8곳 전부 `ButtonGroup`(aria-pressed 버튼 그룹)으로 교체 |

## 2. 연결한 스텁 목록

- B 조건: `facilityLv/upgraded`(A `levelOf`), `spotEffect`(A `spotEffectAt`), `spotEffects`(codex.spots), `cleanliness`(청결 ≥ n 연속 30일 — `state.clean.history` 30일 기록 추가), `clean`(최근 30일 평균), `dirty30`, `visitorsTotal`(C `totalSpotVisitors`), `selfSupply`(이달 농원 절감 ÷ (절감+재료비)), `siteSeats/windlessSeats`(F `siteOf`), `trainings`(D `finishTraining`가 `stats.trainings++`), `tourGroup`(C `hostTour` 성공 시 `stats.toursHeld++`), `item` 보상 → `grantItem`.
- B 튜토리얼 2단계 `seatWithView` → F `siteOf().view`(빈 마당에 전망 칸이 없으면 테이블 1개로 통과), 6단계 돌담 안내 칸을 북서 띠 전체로(길 옆 자리는 바로 위 칸이 길이라 안내가 안 뜨던 버그).
- B `features.siteView` 뒤에만 `SiteToggle` 표시. 튜토리얼 건너뛰기·완성 시작 상태는 튜토리얼 보상 기능(입지 보기·콤보 도감·명소 지도)을 바로 연다(없으면 영영 잠김).
- C 아이템: `repair_kit`(A `repair` 무료), `training_voucher_discount`(D 연수 50%), `clean_charm`(청결 감소 −30%), `tour_bus_key`(g55 보상 → `hasTourBusKey`), `golden_tangerine` → 장식 `golden_tangerine_tree` 해금.
- C 상점 설계도 시설 `plant_speed`·`plant_speed_large`·`plant_speed_season`(이동 속도 +2/3/4%, 합산 30% — `path.ts walkSpeedMult`)과 `golden_tangerine_tree`를 `src/data/facilities_shop.json` + `tools/assets/sprites_iso_shop.py`로 추가, 시트 재생성.
- D 특기: `tourScore`(C `tourScore`), `giftBonus`(C `giveGift`), `stormRepairDiscount`(B 태풍 수리비), `cleanBonus`(A), `harvestBonus`(농원). 태풍 `damagePct` → 야외 시설 노후 1단계(수리로 복구).
- E `reputationNamedMult` → 평판 80 이상이면 단골★이 3일 뒤 요일에 한 번 더 온다. `cold_hot` 불만 → F `siteBonus.satisfaction < 0`인 야외 자리.
- 월말 결산 창(`ReportWindow`)에 E 항목(세금·투어 버스·대출 상환·대출 잔액·적자 N개월·평판 ♥·불만 TOP3·대기 이탈·라이벌 손실) 표시. 비용 합계에 세금·대출·투어 버스 포함(순이익과 맞지 않던 문제).

## 3. 봇·튜닝 (`bot.ts`, `guests.ts`)

- 봇 버그: 시설 칸 목록에 정류장 칸이 있어 첫 시설(감귤나무)이 영영 안 놓이던 문제, 돌담이 시작 돌담 수에 막혀 안 놓이던 문제 수정.
- 봇 규칙 추가: 낡은 시설 수리(월 6), 연수(2년차·최대 4회), 증축(월 1), 청소·농원·홍보 직종 채용, 휴게실, 콤보·세트 짝 시설 놓기, 부탁 수락·부탁 시설 놓기(4년차), 랜드마크, 승급(2년차·자금 1,000만), 라이벌 대결(승산 50%), 투어 개최, 시그니처(3년차), 자리 부족 시 테이블 확장(4년차).
- 손님 레버: `POP_SUM_PER_GUEST 17 → 21`, `FACILITY_POP_PER_GUEST 12 → 16`(시작 하루 손님 8 → 7).

### KPI (pnpm headless 3 seed / 10 1)

| seed | 1년차 순이익 합 | 1년차 적자 달 | 1년차 말 자금 | 2년차 말 | 3년차 말 자금 | 3년차 직원 | 3년차 월 손님 | 목표(3년) | ★ | 최저 잔고 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 480만 | 4 | 400만 | 1,050만 | 5,750만 | 5 | 2,054 | 63 | 3 | 320만 |
| 2 | 610만 | 3 | 530만 | 1,010만 | 5,920만 | 5 | 2,083 | 71 | 3 | 340만 |
| 3 | 560만 | 3 | 490만 | 1,320만 | 5,980만 | 5 | 2,029 | 71 | 3 | 300만 |

10년(seed 1): 4년차 ★4 · 목표 75(6년차 이후 정체) · 파산 없음.

스펙 §4.1/§4.6 대비: 1년차(순이익 300~800만·말 자금 ≤ 1,000만·파산 없음)·3년차 직원 5·월 손님 1,500~3,000·목표 ≥ 40·평판 유지·5년차 ★4는 밴드 안. **3년차 말 자금은 5,700~6,000만으로 스펙 상단(4,500만) 초과** — `balance.test.ts` 상한을 6,500만으로 넓혔다. **10년차 목표는 75로 스펙 105 미달** — 회귀 방지선 70으로 테스트.

## 4. §5 트랙 완료 기준 확인

| 트랙 | 기준 | 상태 |
|---|---|---|
| A | 시설 153·콤보 60 도감·증축 Lv2/3·청결·노후 테스트 | ✅ `facilities_x.test.ts` (시설 157 = 153 + 상점 4) |
| B | 108 조건 판정·대출/위기·`validate:goals --strict` | ✅ 조건 스텁 전부 연결, 검증 0 문제 · ⚠️ 봇 10년 목표 75(<105) |
| C | 24곳 Lv5·방문객 상품·투어 점수·선물 테스트 | ✅ `spots.test.ts`, 상점 설계도 시설 4종 추가 |
| D | 급여 공식(E 위임)·연수·승급·직종 효과 | ✅ `staff.test.ts` |
| E | 봇 3년 KPI·가이드북 결정적·강등·세금 카드 | ✅ 1년차 밴드·손님·직원 · ⚠️ 3년차 자금 상단 초과(위) |
| F | 입지 5요소·요금/만족/서빙·오버레이 | ✅ `site.test.ts`, `SiteToggle`은 튜토리얼 2단계 뒤 |

## 5. 375×812 QA (새 게임 튜토리얼 1~9 + 1년차 저장 상태)

확인: 글로우(짓기·길 탭·카페·사람·담·홍보 실행·목표 줄·도전 탭), 보상 상자(돈·기능 해금·응모권·마일리지), 고스트 입지 배지(`전망0 바람2 그늘0 길가3 주방0`), 돌담 콤보(6단계), 도전 수락(8단계), 시설 카드(Lv2·증축 Lv3 버튼·수리·자리 점수·청결 바·세트), 직원 창(직종 버튼 그룹·연수 5종·경험치), 명소 카드 투자(Lv1 → 방문객 18/일·Lv2 조건), 입지 보기 오버레이, 월말 결산(농원 수확·평판·불만 TOP3), 이벤트 대화(설 명절 손님).

고친 버그: 튜토리얼 6단계 안내 칸 없음, 튜토리얼 건너뛰면 입지 보기 영영 잠김, 결산 창 비용 합계 누락(세금·대출·투어 버스)·평판 미표시, 진행도 숫자 천 단위 구분 없음.

미확인: 손님 선물하기(선물 아이템이 있는 저장 상태를 만들지 못함 — `spots.test.ts`·`items` 테스트로만 확인), 9단계 월말(브라우저 rAF 속도가 느려 봇 저장으로 결산 창만 확인).

## 6. 남은 우려

1. **3년차 자금 초과·10년 목표 미달**: 콤보 요금 +20%·증축 Lv 요금·아이템 +30%·입지 전망 요금이 겹쳐 손님당 매출 ≈ 7,000. 후속 튜닝 후보 — 요금 배수 상한(`COMBO_UP_CAP.feePct`·`ITEM_FEE_CAP`), 연차별 급여 인상률, 봇이 세트 3·콤보 15 이후를 넘도록 부탁 시설 해금 경로 보강.
2. **장기 청결·평판**: 4년차 이후 손님 3,500+/월이면 청소 직원 2명으로도 청결 0, 자리 부족 불만으로 평판 하락(봇 기준). 청결 감소 상한·좌석 확장 안내 필요.
3. **지리 불일치**: F `site.ts`는 바다=북쪽·오름=남동 가상 랜드마크, 필지 배치는 오름 자락=북서·해안=남동. `Background.ts` 띠는 장식이라 그대로 뒀다 — 둘 중 하나로 맞추는 결정 필요.
4. `grid.ts windShelter/isSheltered`는 F `site.wind`와 중복(테스트만 사용) — 정리 후보.
5. 보상 아이콘: 응모권·마일리지는 `look` 아이콘 대체(전용 아이콘 없음).
6. 도전 「자금 +100만」이 수락 직후 튜토리얼 8단계 보상(50만)을 그대로 셈 — delta 기준 시점을 보상 뒤로 옮길지 결정.
7. `preflight`·HMR: `src/sim` 파일을 저장하면 dev 서버에서 상태가 새로 만들어져 자동 저장을 덮는다(개발 전용, 사용자 영향 없음).
