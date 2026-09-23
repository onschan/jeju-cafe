/** 요금 보상 곡선 (spot2, 사용자 피드백 "시너지나 명당 배치나 자리 수준이 좋을수록 받는 요금이 좀 더 많이 좋아지면 좋겠다").
 *  배수를 만드는 것이 fee.ts 한곳에 모여 있고, 총 배수 상한(×2.0)도 거기 하나뿐이다. */
import { describe, it, expect } from 'vitest';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { bareState, at } from './helpers.ts';
import { seatFeeQuote, feeQuoteText, feeQuoteIfPlaced, FEE_MULT_CAP, representativePrice } from '../fee.ts';
import { siteFeeMult, SITE_FEE_MAX, FEE_PER_SITE_POINT, siteOf, scoreOf } from '../site.ts';
import { CORNER_CAP, CORNER_TIER_FEE_PP, cornerDef } from '../corners.ts';
import { STREET_BONUS_PCT } from '../tree.ts';
import type { GameState } from '../types.ts';

function place(s: GameState, type: string, x: number, y: number) {
  s.goals.index = 999;
  s.money = 1e9;
  const r = apply(s, { type: 'place', objectType: type, ...at(x, y) });
  expect(r.ok, `${type}@${x},${y}: ${r.reason}`).toBe(true);
  const o = Object.values(s.objects).find((o) => o.type === type && o.x === at(x, y).x && o.y === at(x, y).y)!;
  for (let i = 0; i < 10 && o.build; i++) tick(s, DAY_MS);
  return o;
}

describe('요금 보상 곡선', () => {
  it('자리 점수 1점당 +4%, 상한 +40% — 꾸미면 눈에 보이게 오른다', () => {
    expect(FEE_PER_SITE_POINT).toBe(0.04);
    expect(SITE_FEE_MAX).toBe(0.40);
    expect(siteFeeMult(8)).toBeCloseTo(1.32);
  });
  it('명당은 반경 안 자리에 +12%부터, 조각을 올릴 때마다 +3%p, 합산 상한 +30%', () => {
    expect(cornerDef('corner_flower_path').effect.feePct).toBe(12);
    expect(CORNER_TIER_FEE_PP).toBe(3);
    expect(CORNER_CAP.feePct).toBe(30);
  });
  it('거리 보너스는 +8%', () => {
    expect(STREET_BONUS_PCT).toBe(8);
  });
  it('내역은 실제로 받는 값과 같다 — 기본 × 배수, 상한 ×2.0', () => {
    const s = bareState(1);
    const plain = place(s, 'table_out', 8, 5);
    const q = seatFeeQuote(s, plain, 3000); // bareState엔 메뉴판이 없어 기본 값을 직접 준다
    expect(seatFeeQuote(s, plain).base).toBe(representativePrice(s));
    expect(q.base).toBe(3000);
    expect(q.price).toBe(Math.round(q.base * q.mult));
    expect(q.mult).toBeLessThanOrEqual(FEE_MULT_CAP);
    expect(q.parts.every((p) => p.pct !== 0)).toBe(true);
    // 파트는 큰 것부터
    expect([...q.parts].sort((a, b) => b.pct - a.pct)).toEqual(q.parts);
    expect(feeQuoteText(q)).toContain('기본');
  });
  it('명당 옆 자리는 그냥 자리보다 더 받는다 (꾸민 보람)', () => {
    const s = bareState(1);
    const far = place(s, 'table_out', 9, 6);
    const near = place(s, 'table_out', 1, 1);
    const before = seatFeeQuote(s, near, 3000).price;
    place(s, 'flower_bed', 0, 0);
    place(s, 'deco_wood_bench', 1, 0);
    place(s, 'streetlight', 0, 1);
    const after = seatFeeQuote(s, near, 3000);
    expect(after.price).toBeGreaterThan(before);
    expect(after.parts.some((p) => p.key === 'corner')).toBe(true);
    expect(seatFeeQuote(s, far, 3000).parts.some((p) => p.key === 'corner')).toBe(false);
  });
  it('자리 점수가 높은 칸이 낮은 칸보다 더 받는다 — 고스트도 같은 값을 미리 보여 준다', () => {
    const s = bareState(1);
    const sea = siteOf(s, at(0, 0).x, at(0, 0).y);
    const inner = siteOf(s, at(9, 6).x, at(9, 6).y);
    const better = scoreOf(sea) >= scoreOf(inner) ? at(0, 0) : at(9, 6);
    const worse = better === at(0, 0) ? at(9, 6) : at(0, 0);
    const a = feeQuoteIfPlaced(s, 'table_out', better.x, better.y)!;
    const b = feeQuoteIfPlaced(s, 'table_out', worse.x, worse.y)!;
    expect(a.mult).toBeGreaterThanOrEqual(b.mult);
    // 고스트 값 = 실제로 놓았을 때 값
    const real = place(s, 'table_out', 0, 0);
    expect(seatFeeQuote(s, real).mult).toBe(feeQuoteIfPlaced(s, 'table_out', real.x, real.y, real.id)!.mult);
  });
  it('장식은 요금을 안 받는다 (자리·요금 시설만)', () => {
    const s = bareState(1);
    const bed = place(s, 'flower_bed', 0, 0);
    expect(feeQuoteIfPlaced(s, 'flower_bed', at(2, 2).x, at(2, 2).y)?.parts.some((p) => p.key === 'site')).toBe(false);
    expect(seatFeeQuote(s, bed).mult).toBe(1);
  });
});
