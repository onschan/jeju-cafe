/** 시설 미니 카드의 입지 줄 (스펙 §6.2, 트랙 F): 「이 자리: 전망 3 · 바람 1 · …」 + 좌석·매대면 「자리 점수 7/10」. */
import type { CSSProperties } from 'react';
import type { GameState, PlacedObject } from '../sim/index.ts';
import { siteOf, siteScore, siteLineText, SITE_GOOD } from '../sim/index.ts';
import { PALETTE } from './frame';

const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft };

export function SiteLine({ s, o }: { s: GameState; o: PlacedObject }) {
  const site = siteOf(s, o.x, o.y);
  const score = siteScore(s, o.type, o.x, o.y);
  return (
    <div style={small} data-testid="site-line">
      이 자리: {siteLineText(site)}
      {score !== null && <> · 자리 점수 <b style={{ color: score >= SITE_GOOD ? PALETTE.ok : PALETTE.bad }}>{score}/10</b></>}
    </div>
  );
}
