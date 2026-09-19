# y 3트랙 통합 기록 (브랜치 `y`)

스펙: `docs/superpowers/specs/2026-09-18-ux-gameplay-reference.md`(y-ui §1~§5·y-entry §6·y-indoor §8), `2026-09-18-hss2-content-expansion.md` §8. 머지 순서: `y-ui` → `y-entry` → `y-indoor`. 각 머지는 `npx tsc --noEmit` 통과 후 커밋, 마지막에 `pnpm test`·`pnpm build`·`pnpm validate:goals --strict` 통과.

## 1. 머지 충돌 해결 (양쪽 의미 다 살림)

| 파일 | 결정 |
|---|---|
| `RouteCard.tsx` | y-ui가 `StaffPanel` → `Bars`로 옮긴 `Bar`, `frame.won` → `labels.wonText`로 import 정리 (y-entry 머지 직후 tsc 오류 2개) |
| `public/assets/sheet.{png,json}` | 세 트랙의 `sprites_iso_*.py`가 다 있는 상태에서 `pnpm assets` 재생성 (449 스프라이트 · 1024×2932). 경로 시설 5·진입점 표지 5(y-entry)·본관 Lv2~4·2층·별관·실내 가구(y-indoor) 전부 포함 |
| `GameView.ts` | y-ui `setRangeHint/setRectCells/setGauges/focusCell` + y-entry `syncEntryMarkers` + y-indoor `sizeOf/MAIN_SIZE`(본관 Lv 텍스처·2층 오버레이). `GhostSpec`에 `w/h` 유지 |
| `bot.ts` | y-entry `planRoutes`(주차장·올레·셔틀·크루즈) + y-indoor `expandMainIfCan/placeAnnex/실내 가구` 둘 다. import는 `footprint` + `doorFrontOf` 합집합 |
| `guests.ts` | 좌석 체류 = y-indoor `stayMs(…)`(시설당 +8분·소파·책장·조명) **×** y-entry `routeStayMult(g)`(주차장 ×1.2·크루즈 ×0.7). 나머지(y-ui targetSpawnMult · y-entry spawnByRoutes/entry/route 집계 · y-indoor freeSeats/indoorSpawnMult/browseChance)는 자동 병합 |
| `save.ts` | backfill: `routes ??= initRoutes()` + `main ??= initMain()` |
| `tick.ts` | 새 날: `dailyRoutes` + `dailyRooms` · 월초: `monthlyRooms` + `monthlyRoutes` · 매시 `accumulateSeatUse` |
| `types.ts` | `PlacedObject.name`(y-ui) + `w/h/mode/careDay`(y-indoor); `GameState.undo`(y-ui) + `main`(y-indoor) |
| `MiniCard.tsx` | y-ui 공통 틀(◀▶ 순회·`Details` 접기·➕ 같은 것 더·✏️ 이름) 위에 y-indoor 별관 좌석 줄(`annex-cut`)과 `IndoorButtons`(난로·책장·수족관·키즈·바) 삽입. `CounterCard` → y-indoor `MainCard`(export), `route` 분기 → y-entry `RouteCard`. `won` → `wonText` |
| `store.ts` | `ACTION_SFX` 합집합 (y-entry 2 + y-indoor 12) |
| `SAVE_VERSION` | 17 → 18 한 번 (undo·name·routes·route/foreign·main·w/h/mode/careDay — 마이그레이션 없음, 17 세이브는 백업 후 새 게임) |

## 2. y-ui 보고의 임시 자리 교체

| 자리 | 전 | 후 |
|---|---|---|
| 카페 › 실내 | `BuildWindow initialTab="rest"` | y-indoor 「실내」 탭 (`initialTab="indoor"` — 실내 가구 7종·카운터 확장) |
| 카페 › 본관 | `CafePanel`만 | y-indoor `MainCard` 본문(Lv·실내 좌석·이용률·길 끊김 경고·메뉴판/실내 꾸미기/자세히·증축 Lv·2층·옮기기/되돌리기) + 기존 `CafePanel`(이름·카페 레벨·주방 증축/테라스·외벽·간판). `MainCard`의 `onCafe`는 창 안에서 메뉴판 탭으로 |
| 경영 현황 `status-routes` | — | y-entry `RoutesSection`(이미 연결) |
| `App.tsx` 이동 고스트·드래그 | `objectDef` 크기 | `sizeOf(o)` — 본관 Lv2+(4×3) 옮기기 고스트·✓ 버튼 위치·발자국 드래그 판정이 실제 크기 |

## 3. 성능 — 배치 서명 캐시 (`src/sim/layoutRev.ts`)

y-indoor 보고의 병목(스텝마다 오브젝트 전체 순회 ~40%): `path.ts walkSpeedMult`·`busStopPos`, `site.ts cacheOf`(문자열 `layoutKey`), `compat.ts indexByType`(tick 키).

- `layoutSig(state)` = `rev:dayIndex:nextId`. `rev`는 WeakMap(저장 안 함)이고 `grid.ts occupy/vacate`(배치·철거·이동·본관 증축/이사·되돌리기 전부 지남), `clearRock`(걷기 칸), `build.ts` 공사 시작/완공, `upgrade.ts` 증축 공사, `actions.ts apply()` 성공 시 올린다. 날이 바뀌면 dayIndex가 덮는다(완공·본관 공사 완료·경로 해금).
- `layoutCached(state, cache, compute)` 한 줄로 `busStopPos`·`walkSpeedMult` 캐시, `site.ts`·`compat.ts`는 키만 교체. `layoutKey` export는 남겨 뒀다(호환).
- 결과 동일(캐시 전후 headless 3년 seed 1·3 CSV 완전 일치), `pnpm headless 3 1` **21.2s(main) → 16.7s(y)**, 봇 규칙이 더 많은데도 −21%.

## 4. 봇 통합 버그 (y-indoor × y-entry)

- **올레 표식 자리 충돌**: y-indoor 봇의 별관 문 앞 올렛길(`BOT_ANNEX_PATH` 첫 칸 (3,11))과 y-entry 봇의 올레 표식 자리 `BOT_ROUTE_SITES.olle`(3,11)가 같은 칸. 올렛길이 먼저 깔려 `!objectAt` 검사에 막혀 표식을 영영 안 놓았고 g49(올레꾼 10명)가 체인을 막아 3년차 목표 47(주별 68/71)로 떨어졌다. → 자리에 `path`가 있으면 걷어내고 놓는다(표지는 `busstop` kind = 걷기 칸이라 별관 문 앞이 막히지 않음).
- **본관 Lv2 증축이 3년차 여유분(2,000만)에 막힘**: 주차장 자리 좌석 철거(y-entry 2년차)로 시드 3은 3년차 초 자금이 2,700만에 못 미쳐 g41(본관 Lv2)이 안 풀렸다 → 별관(g45)과 같은 규칙으로 여유분을 안 본다.

### KPI (`pnpm headless 3 seed`)

| seed | 1년차 순이익 합 | 1년차 적자 달 | 1년차 말 자금 | 2년차 말 | 3년차 말 자금 | 3년차 직원 | 3년차 월 손님 | 목표(3년) | ★ | 최저 잔고 | 시간 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 731만 | 3 | 465만 | 938만 | 4,609만 | 5 | 2,411 | 57 | 3(4년차 초 ★4) | 302만 | 16.7s |
| 2 | 719만 | 3 | 425만 | 703만 | 3,714만 | 5 | 2,226 | 57 | 3(4년차 초 ★4) | 313만 | 15.5s |
| 3 | 730만 | 1 | 441만 | 730만 | 4,008만 | 5 | 1,797 | 57 | 3(4년차 초 ★4) | 298만 | 15.2s |

밴드(1년차 말 ≤ 1,000만 · 3년차 말 3,000~6,500만 · 목표 ≥ 40 · 파산 없음 · 직원 5 · 월 손님 1,500~3,000) 전부 안. main(71~74)보다 목표가 적은 건 y-indoor가 목표 3개를 실내 계열(g23·g41·g45)로 바꾸고 y-entry가 2년차 경로 목표(g36·g42·g49)를 넣어 체인이 길어진 것 — 세 트랙 단독(57~71)과 같은 수준.

## 5. 375×812 QA (새 게임)

확인(스크린샷): 튜토리얼 1~9단계가 아이콘 그리드 UI에서 글로우와 함께 진행(짓기 → 길 탭 → 정낭~문 앞 올렛길 페인트 · 쉼 탭 → 안내 칸에 야외 테이블(효과 범위 원·연속 배치) · 카페 → 메뉴판 → 올리기 · 첫 손님 결제 · 사람 → 채용 · 담 → 북서 띠 돌담 · 카페 → 홍보 실행 · 목표 줄 → 도전 수락 · 월말 결산), 보상 상자·기능 해금 카드. 카페 › 본관(MainCard + CafePanel) · 카페 › 실내(실내 탭). 본관 카드 → 증축 Lv2(₩300만·7일 공사, 완공 장면·「문 앞에 올렛길」 안내, 길 끊김 ✕ 경고) → 실내 꾸미기 → 실내 테이블 고스트(방 안 초록)·배치 → 본관 옮기기(Lv2 4×3 고스트·✓ 버튼·발자국 밖 드래그·「바위를 먼저 치워요」 빨강·이벤트 중/손님 있을 때 잠금 문구). 주차장(마을 길 옆) → 완공 → 렌터카 손님 5명·경로 카드(오늘/이달/다음 도착/상한/길 연결 ○/넓히기) · 경영 「손님 경로」 표 · 동쪽 🚗 진입 표지(연결 = 색) · 남쪽 셔틀 표지(잠김 = 회색). 일괄 철거(선택 수·환불 표시) → 되돌리기 복구, 메시지 줄(최근 메시지 목록), 🏠 본관 포커스, 속도 버튼.

주의(버그 아님): 튜토리얼 2단계 연속 배치 중엔 하단 바가 배치 바로 덮여 3단계 「아래 카페를 눌러」 전에 「완료」를 먼저 눌러야 한다. 브라우저 탭이 가려지면 rAF가 느려져(프레임당 dt ≤ 100ms) 하루가 1분 넘게 걸린다 — QA에서는 `import('/src/ui/store.ts')`로 `tick`을 직접 돌려 날을 넘겼다.

미확인: 올레 표식·셔틀·크루즈 UI 배치(필지 3개 조건) — 봇 headless(g49 올레꾼 10명 달성)로만 확인. 별관 배치·2층(본관 Lv3)·실내 요소 상호작용 버튼은 `rooms.test.ts`로만.

## 6. 남은 우려 / 미해결

1. **g44 「커플 손님 인기 30」이 봇 3년 내내 0/30** — main에서도 동일(통합 무관). `segmentPopularity.couple`은 홍보(bakeDelta)·선물·광고 부탁·이벤트로만 오르는데 봇이 커플 대상 홍보를 안 한다. 두 번째 슬롯이 진행되므로 체인은 안 막히지만 목표 수를 깎는다 → 봇에 커플 대상 홍보 규칙 또는 g44 조건 완화 후보.
2. `indoorFlags`(rooms.ts) 키 `dayIndex:nextId:actionLog.length`는 `actionLog`가 1,000개 캡에 닿으면 철거·이동을 못 본다(플래그가 하루 늦게 갱신). `layoutSig`로 바꾸면 해결 — 이번엔 y-indoor 소유 코드라 손대지 않음.
3. 본관 증축·이사는 문이 옮겨져 기존 올렛길이 끊긴다. 경고(카드·완공 장면)는 있지만 자동으로 잇지 않아 첫 7일간 평판이 크게 깎인다(QA ♥50 → 22). 증축 확인 문구에 「문이 아래로 내려와요」를 넣거나 완공 시 문 앞 1칸을 자동으로 잇는 안.
4. 카페 › 실내 탭이 BuildWindow 전체(탭 줄 포함)를 보여 준다 — 실내 탭만 고정한 축소 뷰가 더 깔끔할 수 있음.
5. RouteCard는 y-ui 공통 카드 틀(◀▶·자세히·이름)을 쓰지 않는다(경로 시설은 종류당 1개라 순회 의미가 적어 그대로 둠).
6. `.claude/launch.json`(dev 포트 5191)은 건드리지 않았다. 통합 QA는 `pnpm dev --port 5355 --strictPort`.
