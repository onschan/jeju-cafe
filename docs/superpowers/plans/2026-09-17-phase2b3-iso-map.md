# 2B-3 구현 계획 — 아이소메트릭 뷰·넓은 맵·필지·랜드마크·밤·타이틀

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면이 온천골 스토리2처럼 보인다 — 아이소메트릭 격자, 처음부터 30×24 전체 맵(미소유 필지는 어둡게 + 가격), 맵 밖 배경(숲·바다·오름), 관성 카메라, 고스트 배치 + 주변 칸 경치 숫자, ✓/회전, 밤 조명, 타이틀 화면·세이브 슬롯. sim은 필지·랜드마크·구역 보너스만 추가.

**Architecture:** 렌더 좌표 변환만 바꾼다: 셀 (x,y) → 화면 `sx = (x − y) × 32, sy = (x + y) × 16`(2:1 다이메트릭, 타일 64×32). 오브젝트 스프라이트는 아이소용으로 **도구가 재생성**(상자 돌출: 윗면 + 두 옆면, 광원 좌상단). 캐릭터는 그대로(아이소에서도 정면 스프라이트가 표준). y-정렬 = `x + y`. 탭 → 셀 역변환. sim 격자·경로·규칙은 무변경.

**Tech Stack:** 기존. **전제:** 2B-1 머지(2B-2와 병행 가능 — sim 충돌 없음).

---

## 파일 구조
```
tools/assets/iso.py            # 아이소 상자/타일 프리미티브 (top·left·right 면, 그림자)
tools/assets/sprites_iso_tiles.py, sprites_iso_objects.py, sprites_iso_env.py, sprites_bg.py
src/render/iso.ts              # cellToScreen / screenToCell / depth
src/render/GameView.ts         # 좌표 변환·정렬·고스트·숫자 오버레이·밤 틴트 (수정)
src/render/camera.ts           # 관성·경계 고무줄 (수정)
src/render/Background.ts       # 맵 밖 배경 레이어(패럴랙스 없음, 필지 소유에 따라 표시)
src/sim/parcels.ts, src/data/parcels.json(§18), landmarks.json(§1.6)
src/ui/PlaceMode.tsx(고스트 ✓/↻/✗), TitleScreen.tsx, SaveSlots.tsx, NightOverlay(렌더)
```

### Task 1: iso.ts — 좌표 변환·깊이 (TDD)
- `cellToScreen(x, y) = { sx: (x − y) * 32, sy: (x + y) * 16 }`, `screenToCell(sx, sy)` 역변환(반올림), `depth(x, y, h) = (x + y) * 2 + h`. 테스트: 왕복, 인접 셀의 깊이 순서, 다중 칸 오브젝트의 기준점(바닥 앞 꼭짓점).
- Commit `feat(render): 아이소 좌표 변환`

### Task 2: 아이소 스프라이트 생성기
- `tools/assets/iso.py`: `iso_tile(top_color, w=64,h=32)`, `iso_box(w_cells, d_cells, height_px, palette)`(윗면 LT·왼쪽 MD·오른쪽 DK + 외곽선), `iso_stack` 합성. 타일 4계절 × 3지형(64×32), locked 타일. 오브젝트 56종을 §1 표 기준으로 상자 조합 + 디테일(창·간판·지붕은 2D 스프라이트를 옆면에 블릿). 환경 14종은 정면 스프라이트(나무·꽃은 빌보드)를 아이소 바닥 그림자 위에.
- 시트 이름 규칙 `iso_tile_*`, `iso_obj_*` — 기존 탑다운 시트는 유지(폴백).
- 콘택트 시트로 검토(외곽선·광원·바닥 앞 꼭짓점 정렬). Commit `feat(assets): 아이소 타일·오브젝트·환경 스프라이트`

### Task 3: GameView 아이소 전환
- 타일 컨테이너를 아이소 배치로, 오브젝트 앵커 = 바닥 앞 꼭짓점(스프라이트 하단 중앙), 캐릭터 발 위치 = 셀 중심 아이소 변환. `sortableChildren` zIndex = `depth`. 탭 → `screenToCell`.
- 카메라: 관성(속도 감쇠 0.92/프레임), 경계 고무줄(맵 바운딩 박스 + 여유 200px), 기본 줌 ×2, 핀치 1~3.
- 밤: 18시부터 `NightOverlay`(검푸른 반투명 알파 0→0.55, 22시 최대), 등불 오브젝트에 `glow` 스프라이트(additive blend).
- Commit `feat(render): 아이소 렌더·관성 카메라·밤`

### Task 4: sim — 필지·랜드마크·구역 보너스
- `parcels.json` §18, `state.parcels: { id, owned }[]`, 격자 30×24 전체 생성(필지별 지형 규칙: 오름=rock 많음, 곶자왈=tree 장애물, 밭담=stonewall 기본, 해안=road 2줄), `canPlace`는 소유 필지만. `buyParcel` 액션(토지 권리증 투자 조건 + 신구간 30% 할인).
- 구역 보너스: `parcelBonus(state, x, y)` → 스폰 가중치·Fee%·Sc·채집·작물 품질에 적용. 랜드마크 `landmarks.json` §1.6, 범위 반경 3 효과는 `objectStats`에 합산.
- 테스트: 미소유 배치 거부, 구매 조건, 보너스 적용, 랜드마크 필지당 1.
- Commit `feat(sim): 필지·구역 보너스·랜드마크`

### Task 5: 배치 모드 — 고스트·경치 숫자·✓/↻
- 오브젝트 선택 → 손가락 아래 고스트(반투명, 가능 초록/불가 빨강) 드래그 → 주변 칸에 **예상 경치/상성 숫자**(HSS2처럼 초록 숫자) → 하단 ✓ 확정 / ↻ 회전(방향 있는 오브젝트만) / ✗ 취소. 길·돌담은 드래그 연속.
- Commit `feat(ui): 고스트 배치·경치 미리보기·회전`

### Task 6: 배경·타이틀·세이브 슬롯
- `Background.ts`: 맵 밖 4방향 배경(숲/오름/바다/마을) — 필지 소유에 따라 바다(5번 필지)·오름(2번)이 나타남. 스프라이트 `bg_*` 6장(아이소 지평선 띠).
- `TitleScreen.tsx`: 로고(픽셀 아트 `logo.png` 도구 생성)·배경 일러스트(폐창고 카페, 아이소 렌더 캡처를 정적 PNG로)·`시작 / 이어하기 / 최고 점수`·`사이트`. `SaveSlots.tsx`: 자동 + 슬롯 3, 각 슬롯에 년월·돈·★ 표시, 삭제 확인.
- Commit `feat(ui): 타이틀·세이브 슬롯·배경 레이어`

### Task 7: 손님 스폰 분산·도로 진입 수정·확인
- 손님 시간대 분산은 2B-1에서; 여기서는 정낭이 유일한 입구가 되도록 `isWalkable`에서 도로는 정류장 인접 2칸만 허용.
- 폰 뷰 확인: 아이소 맵 드래그 관성, 필지 구매 → 바다 배경 등장, 밤 조명, 타이틀 → 이어하기.

## 완료 기준
- 화면 캡처를 온천골 스토리2 옆에 두었을 때 같은 장르로 보인다(아이소·넓은 맵·배경·밤).
- 필지를 사면 맵이 넓어지고 구역 보너스가 손님·가격에 반영된다.
- 고스트 배치에서 숫자 미리보기가 보이고 ✓로 확정한다.
- 타이틀에서 시작/이어하기가 되고 세이브 슬롯 3개가 동작한다.
