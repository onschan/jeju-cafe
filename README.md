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

## 에셋 규격
스펙 §7.5 참고(32px 타일, 캐릭터 32×48, 카이로소프트 톤). 지금은 코드가 만든 색 사각형 플레이스홀더. 샘플은 `assets-sample/`.
실제 PNG 로더는 2단계 계획에서 추가한다.
