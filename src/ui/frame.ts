import type { CSSProperties } from 'react';

/** 카이로식 갈색 프레임 팔레트 — 패널·팝업·버튼이 같이 쓴다 */
export const PALETTE = {
  wood: '#6b3d1e',      // 바깥 테두리
  woodLight: '#c99a5b', // 안쪽 테두리
  paper: '#f6e7c6',     // 종이 바탕
  paperDark: '#e8d2a3', // 줄무늬·바 바탕
  ink: '#3b1f0e',       // 글자
  inkSoft: '#7a5636',   // 흐린 글자
  title: '#8b4a22',     // 제목 띠
  titleText: '#fff5dc',
  btn: '#c9743a',
  btnText: '#fff5dc',
  btnOn: '#ffd166',
  btnOnText: '#3b1f0e',
  ok: '#4c9a2a',
  bad: '#c9184a',
  bar: '#e0a24c',
} as const;

/** 갈색 프레임 상자 (제목 띠는 FrameTitle을 위에 얹는다) */
export const frame: CSSProperties = {
  background: PALETTE.paper,
  color: PALETTE.ink,
  border: `4px solid ${PALETTE.wood}`,
  boxShadow: `inset 0 0 0 2px ${PALETTE.woodLight}`,
  borderRadius: 8,
  padding: 8,
};

/** 프레임 안에서 항목을 나누는 작은 카드 */
export const card: CSSProperties = {
  background: '#fffaf0',
  border: `2px solid ${PALETTE.woodLight}`,
  borderRadius: 6,
  padding: 8,
  marginBottom: 8,
};

export const frameTitle: CSSProperties = {
  background: PALETTE.title,
  color: PALETTE.titleText,
  fontWeight: 700,
  fontSize: 16,
  padding: '6px 10px',
  margin: '-8px -8px 8px',
  borderRadius: '4px 4px 0 0',
};

/** 44px 터치 버튼 (갈색) */
export const brownBtn: CSSProperties = {
  minHeight: 44,
  padding: '0 12px',
  marginRight: 6,
  marginBottom: 6,
  border: `3px solid ${PALETTE.wood}`,
  borderRadius: 8,
  background: PALETTE.btn,
  color: PALETTE.btnText,
  fontSize: 16,
  fontFamily: 'inherit',
  fontWeight: 700,
};
export const brownBtnOn: CSSProperties = { ...brownBtn, background: PALETTE.btnOn, color: PALETTE.btnOnText };
export const brownBtnOff: CSSProperties = { ...brownBtn, opacity: 0.45 };
export const dangerBtn: CSSProperties = { ...brownBtn, background: '#8a2a2a' };

/** 스크롤바를 숨기는 클래스 — 스크롤은 그대로 된다. 창 본문·카드 목록·가로 칩 줄에 붙인다.
 *  `::-webkit-scrollbar`는 인라인 style로 못 써서 여기서 <style>을 한 번만 넣는다. */
export const NO_SCROLLBAR = 'no-scrollbar';
const NO_SCROLLBAR_STYLE_ID = 'no-scrollbar-style';
const NO_SCROLLBAR_CSS = `.${NO_SCROLLBAR} { scrollbar-width: none; -ms-overflow-style: none; }
.${NO_SCROLLBAR}::-webkit-scrollbar { width: 0; height: 0; display: none; }`;
if (typeof document !== 'undefined' && !document.getElementById(NO_SCROLLBAR_STYLE_ID)) {
  const el = document.createElement('style');
  el.id = NO_SCROLLBAR_STYLE_ID;
  el.textContent = NO_SCROLLBAR_CSS;
  document.head.appendChild(el);
}

/** 텍스트 입력 상자 (카페 이름·간판). 셀렉트 박스는 쓰지 않는다 — 버튼 그룹으로. */
export const brownInput: CSSProperties = {
  minHeight: 44,
  fontSize: 16,
  fontFamily: 'inherit',
  color: PALETTE.ink,
  background: '#fffaf0',
  border: `2px solid ${PALETTE.wood}`,
  borderRadius: 6,
  padding: '0 6px',
  marginRight: 6,
  marginBottom: 6,
};

