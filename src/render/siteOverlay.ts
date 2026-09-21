/**
 * 「입지 보기」 오버레이 (스펙 §6.2, 트랙 F): 내 땅의 빈 칸마다 좌석 적합도 0~10을 빨강→초록 반투명 다이아몬드로 칠한다.
 * 모드 플래그는 모듈 전역(창을 닫아도 유지) — UI(SiteToggle)와 GameView가 같이 읽는다.
 */
import { Graphics } from 'pixi.js';
import type { GameState } from '../sim/index.ts';
import { seatScore, layoutKey, cellAt, parcelAt } from '../sim/index.ts';
import { ISO_W, ISO_H, cellToScreen } from './iso';

// ---------- 모드 (모듈 전역, 구독 가능) ----------

let siteOverlayOn = false;
const listeners = new Set<() => void>();
export function isSiteOverlayOn(): boolean { return siteOverlayOn; }
export function setSiteOverlayOn(on: boolean): void {
  if (siteOverlayOn === on) return;
  siteOverlayOn = on;
  for (const l of listeners) l();
}
export function subscribeSiteOverlay(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// ---------- 색 ----------

export const SITE_OVERLAY_ALPHA = 0.42;
/** 0 → 빨강, 5 → 노랑, 10 → 초록 */
export function siteScoreColor(score: number): number {
  const t = Math.max(0, Math.min(10, score)) / 10;
  const r = t < 0.5 ? 255 : Math.round(255 * (1 - (t - 0.5) * 2) * 0.85 + 30);
  const g = t < 0.5 ? Math.round(60 + (t * 2) * 160) : 220;
  const b = 40;
  return (r << 16) | (g << 8) | b;
}
/** 고스트 색: 좋은 자리 초록, 나쁜 자리 주황 */
export const GHOST_GOOD = 0x88ff88;
export const GHOST_WARN = 0xffb347;

/** 오버레이 재계산 키: 배치가 바뀌거나 필지를 샀을 때만 다시 그린다 */
export function siteOverlayKey(state: GameState): string {
  return `${layoutKey(state)}|${state.parcels.filter((p) => p.owned).map((p) => p.id).join(',')}`;
}

/** 내 땅의 빈 흙 칸에 좌석 적합도 타일을 그린다 */
export function drawSiteOverlay(g: Graphics, state: GameState): void {
  g.clear();
  const { w, h } = state.grid;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!parcelAt(state, x, y)?.owned) continue;
    const cell = cellAt(state, x, y);
    if (cell.objectId !== null || cell.terrain === 'road') continue;
    const { sx, sy } = cellToScreen(x, y);
    g.poly([sx, sy + 1, sx + ISO_W / 2 - 2, sy + ISO_H / 2, sx, sy + ISO_H - 1, sx - ISO_W / 2 + 2, sy + ISO_H / 2])
      .fill({ color: siteScoreColor(seatScore(state, x, y)), alpha: SITE_OVERLAY_ALPHA });
  }
}
