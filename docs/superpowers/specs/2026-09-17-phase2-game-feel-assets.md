# 2단계 스펙 보강 — 에셋 팩과 게임 감각

작성일: 2026-09-17. 본 스펙 `2026-09-17-jeju-cafe-design.md`를 보강한다. 충돌 시 이 문서가 우선.

## 배경

1단계 프로토타입을 플레이한 피드백: "칸이 너무 적고 플레이가 어색하다. Hot Springs Story는 넓은 맵을 드래그로 자유롭게 움직인다." 원인은 sim이 아니라 렌더·UI·에셋 밀도. 2단계는 규칙 추가보다 **게임 감각**을 먼저 만든다.

## 2A. 에셋 팩 (이 문서의 주 범위)

### 원칙
- 모든 그래픽·효과음·BGM 초안은 **스크립트로 생성**한다(`tools/assets/`). 손으로 그린 PNG나 직접 만든 곡이 생기면 같은 파일명으로 교체만 하면 된다.
- 톤: 카이로소프트. 1px 어두운 외곽선(`#2b2118`), 2~3톤 명암(광원 좌상단), 채도 높은 팔레트, 32px 격자.
- 오브젝트는 칸보다 **세로로 길게**(1×1칸 = 32×40) 그려 아래 정렬 → 겹침으로 입체감.
- 폰트: **Galmuri11**(OFL, quiple/galmuri v2.40.4). 라이선스 파일 동봉. 숫자·아이콘은 스프라이트로 직접 그림.
- 사운드: 8비트 합성(사각파·삼각파·노이즈 + ADSR). 포맷 **m4a(AAC)** — iOS Safari가 ogg를 재생하지 못함. 원본 WAV는 커밋하지 않음.
- 이모지 사용 금지. HUD·말풍선·버튼 아이콘 전부 16×16 픽셀 아이콘.

### 스프라이트 목록 (시트 하나 `public/assets/sheet.png` + Pixi 스프라이트시트 JSON)
| 그룹 | 이름 | 크기 | 비고 |
|---|---|---|---|
| 타일 | `tile_soil_{season}`, `tile_rock_{season}`, `tile_road_{season}` | 32×32 | 계절 4종. 흙은 점무늬·풀, 봄 유채 노랑점, 겨울 눈 |
| 타일 | `tile_locked` | 32×32 | 안 산 필지 오버레이(반투명 어둠 + 빗금) |
| 오브젝트 | `obj_busstop` | 32×48 | 표지판 + 벤치 |
| | `obj_warehouse` | 96×80 | 3×2칸. 폐창고→카페: 슬레이트 지붕, 간판, 창 |
| | `obj_gate` | 32×40 | 정낭(돌기둥 2 + 나무 막대 1~3), 3변형 `obj_gate_{0..3}` |
| | `obj_path` | 32×32 | 올렛길(현무암 자갈), 방향 무관 |
| | `obj_field_empty`, `obj_field_planted`, `obj_field_ready` | 32×40 | 이랑 / 새싹 / 당근 잎 무성 |
| | `obj_tangerine_tree_young`, `obj_tangerine_tree`, `obj_tangerine_tree_ready` | 32×48 | 묘목 / 성목 / 열매 |
| | `obj_table_out` | 32×40 | 나무 테이블 + 파라솔 |
| | `obj_stonewall` | 32×40 | 현무암 밭담 |
| 캐릭터 | `guest_local_{down,up,left,right}_{0,1,2}` | 32×48 | 삼춘: 모자·몸빼. 3프레임 걷기 |
| | `guest_tourist_{dir}_{frame}` | 32×48 | 관광객: 카메라·배낭 |
| 말풍선 | `bubble_happy`, `bubble_meh`, `bubble_angry`, `bubble_question`, `bubble_wait` | 24×20 | 흰 풍선 + 표정 |
| 이펙트 | `fx_coin_{0..3}`, `fx_sparkle_{0..3}`, `fx_ready_ring` | 16×16 / 32×32 | 코인 튀기, 반짝, 수확 가능 링 |
| UI 아이콘 | `icon_money, icon_research, icon_local, icon_tourist, icon_speed_pause, icon_speed_1, icon_speed_2, icon_speed_3, icon_build, icon_menu, icon_look, icon_harvest, icon_plant, icon_remove, icon_unlock, icon_calendar, icon_sound_on, icon_sound_off` | 16×16 | HUD·바텀시트. `<img>`로 사용 |
| 안내 | `portrait_halmang` | 48×48 | 감귤 할망 얼굴 |

### 사운드
SFX(`public/assets/sfx/*.m4a`, 0.1~0.6초): `tap, place, remove, plant, harvest, coin, happy, meh, unlock, month, fanfare, error, bus`.
BGM(`public/assets/bgm/{spring,summer,autumn,winter}.m4a`, 24초 루프, 2~3성부 + 간단 드럼, 계절별 조성/템포 다름) + `title.m4a`. 초안이며 직접 만든 곡으로 교체 예정.

### 로더와 오디오
- `src/render/assets.ts`: Pixi `Assets`로 시트 로드. `tex(name)`은 없으면 1단계 플레이스홀더로 폴백(개발 중 일부만 교체 가능).
- `src/ui/audio.ts`: Web Audio. 첫 터치에서 언락, SFX 동시 재생, BGM 계절 전환 크로스페이드 1초, 음소거 토글(localStorage), 탭 숨김 시 일시정지.
- 스케일 모드 nearest, CSS `image-rendering: pixelated`, 폰트 Galmuri11 전역.

### 렌더 변경
- 오브젝트 아래 정렬 + 행 기준 y-정렬(뒤 행이 먼저).
- 손님 방향·프레임 애니(경로 delta로 방향, 8프레임/초).
- 밭 상태별 스프라이트, 수확 가능 시 `fx_ready_ring` 펄스.
- 판매 시 코인 팝, 😊는 `bubble_happy` 팝 애니(0.2초 스케일).

## 2B. 게임 감각 (다음 계획)
- 맵: 처음부터 30×24 전체 표시, 안 산 필지는 `tile_locked` + 가격 라벨. 기본 줌 ×2, 세로 12~14칸 보임.
- sim: `parcels`(6개 사각형, owned, price, 지형 생성 규칙) + `buyParcel` 액션. `canPlace`는 소유 필지만.
- 카메라: 관성 스크롤, 경계 고무줄, 핀치 ×1~×3.
- 배치: 고스트 프리뷰(손가락 따라 이동, 가능=초록/불가=빨강) → ✓/✗ 확정. 길·돌담은 드래그 연속 배치.
- 손님: 하루 스폰을 시간대별로 분산(`accMs` 기준), 상시 몇 명이 돌아다니게.
- 1단계 이월: 도로 직접 진입 문제, monthGuests 집계, 시작 월 밸런스(9월 시작 검토).
