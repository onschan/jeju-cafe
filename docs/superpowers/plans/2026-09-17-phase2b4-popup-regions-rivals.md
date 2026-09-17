# 2B-4 구현 계획 — 원정 팝업 스토어·지역 손님 56·호감도·단골★·라이벌 카페

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주말마다 제주 7개 지역에 팝업 스토어를 내어 이름 있는 손님 56명을 만나고, 호감도를 채워 보상과 단골★을 얻어 본점에 데려오며, 3년차부터 나타나는 라이벌 카페를 카페 대결로 물리친다. 데이터는 데이터 설계서 §5, 스펙 §15.2–15.3.

**Architecture:** sim `popup.ts`(지역 상태·팝업 운영·손님 등장·호감도·보상), `rivals.ts`(생성·효과·대결·파산), `codex.ts`(도감 통합). 팝업은 별도 격자가 아니라 **팝업 화면**(카이로 라멘의 본점처럼 간단한 카운터 뷰): 하루 8명이 줄을 서서 메뉴를 고르고 반응하는 연출. 캐릭터는 파츠 시스템(2B-1 Task 7)으로 id 시드 조합 + 고정 액세서리. 본점 방문은 기존 손님 스폰에 "이름 있는 손님" 슬롯을 끼워 넣는다.

**전제:** 2B-1(파츠 시스템 포함), 2B-2(손님 취향·메뉴 스탯).

---

### Task 1: 데이터 — regions.json·named_guests.json·rivals.json
- §5 표 → `regions.json` `[{ id, name, popupCost, vitality: 100, appetite: 100, decayPerWeek: 8, recoverPerWeek: 5 }]`, `named_guests.json` `[{ id, regionId, name, job, line, likesBase, likesStats[], budget, face: { seed } , acc: [] }]` 56명, `rivals.json` 라이벌 타입 6(동네 카페·프랜차이즈·트럭 카페·디저트 전문·대형 브랜드·SNS 카페: 규모·유지비·뺏는 단골 수·스탯 감소·대결 심사 가중치).
- `tools/data/from_tables.py`에 §5 파서 추가. Commit `feat(data): 지역·이름 있는 손님·라이벌 표`

### Task 2: popup.ts — 지역·팝업 운영·호감도
- `state.popup: { regionId | null, weekOpen: number }`, `state.regions: Record<id, { vitality, appetite }>`, `state.namedGuests: Record<id, { affinity: 0~300, rewardsTaken: 0~3, regular: boolean }>`.
- 액션 `openPopup { regionId }`(비용, 주말 = 매월 6·13·20·27일), `closePopup`. 팝업 중엔 하루 손님 8명이 순서대로 등장(그 지역 8명 중 `appetite`에 비례해 6~8명), 각자 메뉴판에서 취향 일치 메뉴를 고름(없으면 😐, 예산 초과면 "비싸다"). 호감도 +10(취향 일치 ×2). 100/200/300에서 보상 1/2/3(재료 상자 → 아이템 → 레시피·메달). 첫 보상 시 `regular = true` → 본점 스폰 후보(주 1회 방문).
- 지역 활기·식욕: 팝업 열린 주 −8, 닫힌 주 +5, 0~100. 손님 수 = 8 × appetite/100.
- 테스트: 주말 판정, 비용, 손님 수, 호감도·보상 단계, 단골 본점 방문, 결정성.
- Commit `feat(sim): 원정 팝업·지역 손님 호감도·단골`

### Task 3: rivals.ts — 라이벌 카페
- 3년차부터 월 10%(동시 최대 2). 효과: 매월 단골 1명 이탈(랜덤), 메뉴 `양`·`보기` −5%(누적 상한 −50%). 액션 `challenge { rivalId, menuId }` → 심사 = 라이벌 가중치 × 메뉴 스탯 + 난수 vs 라이벌 점수(규모×년차) → 승리: 철수·메달 2·단골 회수 / 패배: 인기 −5. 대형 라이벌은 월 15% 자체 파산. 12개월 후 자진 철수.
- 테스트: 생성 확률(seed), 효과 누적 상한, 대결 판정, 파산.
- Commit `feat(sim): 라이벌 카페·카페 대결`

### Task 4: 렌더·UI — 팝업 화면·지역 지도·도감
- `PopupScreen.tsx` + Pixi 미니 씬: 배경(지역별 배경 1장 — 2B-3 배경 재사용), 카운터, 손님 8명이 줄 서서 순서대로 앞으로 걸어와 말풍선(취향 대사) → 반응 → 퇴장. 호감도 바.
- 지역 지도 탭(기존 명소 지도에 팝업 버튼·활기/식욕 게이지).
- 도감: 손님 56(실루엣→발견 시 공개, 호감도·단골★), 손님층 12, 직원 풀, 메뉴, 콤보, 아이템.
- 라이벌 카드(게시판 "이벤트")·대결 화면(심사 게이지 애니).
- Commit `feat(ui): 팝업 스토어 화면·지역 지도·도감·라이벌 대결`

### Task 5: 봇·밸런스·확인
- 봇: 매주 가장 활기 높은 지역에 팝업, 취향 맞는 메뉴 보유 시 우선. 15년 내 단골 30명 이상 목표.
- 폰 뷰: 팝업 열기 → 손님 줄 → 호감도 → 첫 보상·단골 → 본점에서 재회.

## 완료 기준
- 7지역 56명이 도감에 등록되고, 단골★이 본점에 온다.
- 지역 활기/식욕 때문에 지역을 옮겨 다니게 된다.
- 라이벌이 생기고 대결로 물리칠 수 있다.
