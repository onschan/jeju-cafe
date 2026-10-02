/** 기기마다 다른 화면에 맞춘 치수. 좁은 폰(≤360)은 글자·여백을 줄이고, 낮은 화면(≤680)은 아래 띠를 접는다.
 *  노치·홈 인디케이터는 env(safe-area-inset-*)로 피한다 — 값은 CSS에서만 알 수 있어 계산식으로 넘긴다. */
import { useEffect, useState } from 'react';

export interface Metrics {
  w: number; h: number;
  compact: boolean;      // 좁은 폰 (아이폰 SE·미니)
  short: boolean;        // 낮은 화면 (가로 보기·작은 폰)
  topH: number;          // 상단 바 높이 (안전영역 제외)
  navH: number;          // 하단 메뉴 단추 높이
  statsH: number;        // 요약 띠 높이 (낮은 화면에선 0)
  receiptH: number;      // 영수증 띠 높이
  font: number;          // 기본 글자 크기
}
export function metricsOf(w: number, h: number): Metrics {
  const compact = w <= 360;
  const short = h <= 680;
  return {
    w, h, compact, short,
    topH: compact ? 28 : 30,
    navH: short ? 46 : 54,
    statsH: short ? 0 : 24,
    receiptH: short ? 0 : 22,
    font: compact ? 12 : 13,
  };
}
/** 창·띠가 쓰는 CSS 변수 — 안전영역을 섞은 계산식이라 문자열로 준다 */
export function cssVars(m: Metrics): Record<string, string> {
  const bottom = `calc(${m.receiptH + m.statsH + m.navH + 13}px + env(safe-area-inset-bottom, 0px))`;
  return {
    '--top': `calc(${m.topH + 6}px + env(safe-area-inset-top, 0px))`,
    '--topbar': `calc(${m.topH}px + env(safe-area-inset-top, 0px))`,
    '--bottom': bottom,
    '--above': `calc(${bottom} + 28px)`,
    '--safe-t': 'env(safe-area-inset-top, 0px)',
    '--safe-b': 'env(safe-area-inset-bottom, 0px)',
  };
}
/** 화면 크기를 따라다닌다 — 주소창이 접히는 폰에서도 맞게 (visualViewport) */
export function useMetrics(): Metrics {
  const read = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    return metricsOf(Math.min(w, 520), h);
  };
  const [m, setM] = useState<Metrics>(read);
  useEffect(() => {
    const on = () => setM(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
      window.visualViewport?.removeEventListener('resize', on);
    };
  }, []);
  return m;
}
