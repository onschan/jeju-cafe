# 제주 귀농 카페

카이로소프트 스타일 경영 시뮬레이션. 모바일 웹 우선. 설계·계획은 `docs/superpowers/`에 있다.

## 개발
- `pnpm dev` — 개발 서버 (`--host`라 같은 Wi-Fi의 폰에서 접속 가능)
- `pnpm test` — sim 단위 테스트
- `pnpm headless 3 1` — 봇이 3년 자동 플레이, 월별 CSV 출력 (밸런싱용, 인자: 년수 seed)
- `pnpm build` — 타입 검사 + 번들

개발 모드에서는 `window.__game = { getState, dispatch, resetGame }`로 콘솔에서 상태를 볼 수 있다.

## 구조
- `src/sim` — 게임 규칙. 순수 TS, 결정적(seed PRNG), DOM·Node 의존 0. 상대 import는 `.ts` 확장자 필수(Deno 호환)
- `src/data` — JSON 밸런싱 표 (작물·메뉴·오브젝트·손님·해금)
- `src/render` — PixiJS. 상태를 읽어 그리기만 한다
- `src/ui` — React HUD·패널. 입력은 `dispatch(action)`으로 sim에 전달
- `scripts/headless.ts` — 밸런싱 봇

시뮬레이션은 100ms 고정 스텝(`step`)으로 돌고, `actionLog`에 `{tick, action}`이 남아 같은 seed로 리플레이할 수 있다.

## 시간대
- 게임 1시간 = `HOUR_MS`(2초). 하루는 6시~24시 18시간(36초), 한 달 30일(≈18분). `clock.hour`는 HUD에 `AM/PM h:00`으로 보인다.
- 손님은 하루치(`dailyGuestCount`)를 시간대에 나눠 스폰한다. 6~9시는 동네 손님 2배, 11~17시는 관광객 2배(`hourTypeMult`).
- 18시부터 캔버스 위에 밤 오버레이가 깔리고(`nightAlpha`) 창고·정류장·등이 빛난다. 24시가 지나면 다음 날 6시.

## 경제
- 돈은 손님이 메뉴를 살 때(와 아르바이트) 들어온다. 사 오는 재료(`ingredients.json`의 `bought`)는 판매 즉시 원가를 차감하고, 밭에서 난 재료는 창고 수량을 쓴다(원가 0). 운반·절약 스킬만큼 할인.
- 월말(`closeMonth`)에 월급·오브젝트 유지비(`ObjectDef.upkeep`)·홍보비를 정산하고 월말 카드(`MonthCard`)에 수입 / 재료비 / 월급 / 유지비 / 홍보 / 순이익을 보여 준다. 월급을 못 주면 `unpaidMonths`가 쌓이고 두 달째에 퇴사한다(`notices`).
- 밸런스 기준은 "새 게임 첫 달부터 순이익 > 0" — `pnpm headless 3 1`과 `balance.test`가 지킨다.

## 직원
- **공고**(`postJob`, 전단/구인 사이트/헤드헌터 = `TIERS`) → 후보 3~5명(seed 결정적, 다음 달까지 유효) → **채용**(`hire`, 역할 지정) → **배치**(`assign`) → **레벨업**(`levelUp`, 스탯 하나만 +5~+9, 비용 = 현재 스탯 × 10 연구P).
- 역할(`staff_roles.json`): 바리스타(음료 조리 시간·라떼류 필요), 요리사(식사·디저트), 홀(손님 만족·서비스), 밭 일꾼(매일 아침 익은 것 수확 + 제철 작물 자동 심기), 운반·안내(해금 후). 슬롯 수는 `state.slots`.
- 기력 0~100: 배치된 직원은 시간당 `ENERGY_PER_HOUR` 소모, 밤에 `NIGHT_ENERGY_RECOVERY` 회복. `LOW_ENERGY`(30) 미만이면 효과 절반, 0이면 창고 앞에 서 있는다.
- 직원은 역할 위치(`staffAnchor`: 홀 → 좌석 옆, 밭 → 밭 옆, 나머지 → 창고 앞) 반경 2칸을 산책한다. 메뉴 `requires`가 있으면 그 역할의 직원(기력 > 0)이 있어야 팔린다.

## 홍보
- `promotions.json`: 전단 돌리기·SNS·전봇대·라디오·유튜버 초대·아르바이트. 직원 하나가 기력을 쓰고, 연구P나 돈을 낸다(`promote` 액션). 기간형은 동시에 `MAX_ACTIVE_PROMOTIONS`(2)개까지.
- 효과는 손님층별 인기 `segmentPopularity`에 쌓이고 매월 자연 감소한다. `targetSegment`를 정하면 그 손님층 효과 ×1.5. 유튜버는 60% 확률로 관광객 3개월 부스트, 아르바이트는 직원당 한 달에 한 번 돈을 받는다.

## 렌더(아이소)
- 2:1 다이메트릭, 타일 64×32(`src/render/iso.ts`). 셀 (x, y)의 다이아몬드 위 꼭짓점이 `cellToScreen`, 중심이 `cellCenter`. 오브젝트·손님·직원은 `actors` 한 컨테이너에서 `zIndex = x + y`(오브젝트는 가장 앞 셀 기준 `depth`, 캐릭터는 `+0.5`)로 정렬한다.
- 오브젝트 스프라이트는 `iso_obj_*`(발자국 앞 꼭짓점 `footAnchor`에 하단 중앙) → 없으면 탑다운 `obj_*` 폴백. 앉은 손님은 sim이 준 좌석 자리 좌표(`seatSlotPos`)를 그대로 쓴다.
- **파츠 캐릭터**(`src/render/character.ts`): 몸 `body_{skin}_{dir}_{frame}` → 상의 `top_{dir}_{frame}`(tint) → 머리 `hair_{style}_{dir}`(tint) → 액세서리 `acc_{kind}_{dir}` 순서로 쌓은 Container. tint 색표(`HAIR_RGB` 6, `TOP_RGB` 8)는 `tools/assets/sprites_chars.py`와 같다. `Staff.face`는 `skin % 3`, `hair % 8`(스타일)·`hair % 6`(색), `top % 8`로 접고, 역할이 액세서리를 정한다(홀·요리사 앞치마, 바리스타 모자, 밭 밀짚모자, 운반 배낭, 안내 안경). 머리 위 16px 역할 배지, 기력 30 미만이면 반투명.
- 손님 `guest_local_*`/`guest_tourist_*`는 전용 스프라이트 그대로. 걷기 애니는 8fps 3프레임, 서 있으면 프레임 1.

## 에셋 규격
스펙 §7.5 참고(32px 타일, 캐릭터 32×48, 카이로소프트 톤). 샘플은 `assets-sample/`. 시트가 없으면 코드가 만든 색 사각형 플레이스홀더로 폴백한다.

## 에셋 파이프라인
- `pnpm assets` — 스프라이트 시트·아이콘 생성 (`tools/assets/build.py`). 검토용 `tools/assets/out/contact.png`
- `pnpm assets:audio` — 효과음·BGM 생성 (ffmpeg 필요)
- `pnpm assets:font` — Galmuri11 다운로드 (OFL)
- 직접 그린 PNG나 곡으로 바꾸려면: 같은 이름으로 `public/assets/`에 두고 `tools/assets/`에서 그 이름의 생성 코드를 지운다.
- 폰트: Galmuri (OFL-1.1, https://github.com/quiple/galmuri). 라이선스 `public/fonts/LICENSE-Galmuri.txt`
