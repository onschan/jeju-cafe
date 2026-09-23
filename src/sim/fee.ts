/**
 * 요금 내역 (spot2, 사용자 피드백 "시너지나 명당 배치나 자리 수준이 좋을수록 받는 요금이 좀 더 많이 좋아지면 좋겠다").
 *
 * 손님이 내는 값은 **메뉴 값 × 자리 배수**다. 배수를 만드는 것이 여기 한곳에 모여 있다 —
 * 흩어져 있으면 카드에 적는 숫자와 실제로 받는 값이 갈라진다.
 *
 *   자리 점수 0~10 → +4%/점 (상한 +40%)   site.ts siteBonus
 *   명당          → 반경 2 안 좌석에 +12%~ (조각 단계마다 +3%p, 합산 상한 +30%)  corners.ts
 *   거리          → 같은 트리 2단계 이상 3연속 +8%                     tree.ts
 *   시설          → 증축 Lv·아이템·명소 Lv                              compat.ts objectStats
 *   필지          → 해안 필지                                           parcels.ts
 *   행사·칭호     → 기간 이벤트·직원 칭호
 *
 * 곱해서 총 배수 상한 FEE_MULT_CAP(×2.0). 상한은 여기 하나뿐이다.
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, PlacedObject } from './types.ts';
import { objectStats, BASE_FEE_PCT } from './compat.ts';
import { siteBonus } from './site.ts';
import { streetFeeMult, STREET_BONUS_PCT } from './tree.ts';
import { parcelBonusAt, parcelFeeMult } from './parcels.ts';
import { eventFeeMult } from './events.ts';
import { titleBonus } from './titles.ts';
import { availableMenus } from './menu.ts';
import { priceOf } from './craft.ts';

/** 잘 꾸민 자리라도 메뉴 값의 두 배까지 — 상한은 여기 하나다 */
export const FEE_MULT_CAP = 2.0;

export interface FeePart { key: 'site' | 'corner' | 'street' | 'facility' | 'parcel' | 'event' | 'title'; label: string; pct: number }
export interface FeeQuote {
  base: number;      // 메뉴 값
  parts: FeePart[];  // 0%가 아닌 것만, 큰 것부터
  mult: number;      // 총 배수 (상한 적용 뒤)
  capped: boolean;   // 상한에 걸렸나
  price: number;     // 실제로 받는 값
}

const pct = (mult: number) => Math.round((mult - 1) * 100);

/** 이 자리가 메뉴 값에 얹는 배수 내역. basePrice를 안 주면 지금 파는 메뉴 중 첫 번째 값으로 본다. */
export function seatFeeQuote(state: GameState, seat: PlacedObject, basePrice?: number): FeeQuote {
  const stats = objectStats(state, seat.id);
  const cornerPct = stats.corner.feePct;
  const parts: FeePart[] = [
    { key: 'site', label: '자리', pct: pct(siteBonus(state, seat).feeMult) },
    { key: 'corner', label: '명당', pct: cornerPct },
    { key: 'street', label: '거리', pct: pct(streetFeeMult(state, seat)) },
    { key: 'facility', label: '시설', pct: Math.round(stats.feePct - BASE_FEE_PCT - cornerPct) },
    { key: 'parcel', label: '바닷가', pct: pct(parcelFeeMult(parcelBonusAt(state, seat.x, seat.y))) },
    { key: 'event', label: '행사', pct: pct(eventFeeMult(state)) },
    { key: 'title', label: '직원', pct: pct(1 + titleBonus(state, 'fee')) },
  ];
  const raw = parts.reduce((m, p) => m * (1 + p.pct / 100), 1);
  const mult = Math.min(FEE_MULT_CAP, raw);
  const base = basePrice ?? representativePrice(state);
  return {
    base,
    parts: parts.filter((p) => p.pct !== 0).sort((a, b) => b.pct - a.pct),
    mult,
    capped: raw > FEE_MULT_CAP,
    price: Math.round(base * mult),
  };
}

/** 카드에 보여 줄 「기본」 값: 지금 파는 메뉴 중 첫 번째. 메뉴가 없으면 0. */
export function representativePrice(state: GameState): number {
  const id = availableMenus(state)[0];
  return id ? priceOf(state, id) : 0;
}

/** 카드 한 줄: "기본 ₩4,500 · 자리 +28% · 명당 +12% → ₩6,300" (0%는 빼고, 큰 것 3개까지) */
export function feeQuoteText(q: FeeQuote): string {
  const top = q.parts.slice(0, 3).map((p) => `${p.label} ${p.pct > 0 ? '+' : ''}${p.pct}%`);
  const head = top.length > 0 ? `${top.join(' · ')} → ` : '';
  return `기본 ₩${q.base.toLocaleString('en-US')} · ${head}₩${q.price.toLocaleString('en-US')}`;
}

/** 이 종류를 (x, y)에 놓으면 받게 될 값 (배치 고스트 예상 요금). 좌석이 아니면 null. */
export function feeQuoteIfPlaced(state: GameState, type: string, x: number, y: number, ignoreId?: string): FeeQuote | null {
  const ghost: PlacedObject = { id: '__feeGhost', type, x, y, placedMonth: 0 };
  const probe: GameState = { ...state, objects: { ...state.objects, __feeGhost: ghost } };
  for (const id of Object.keys(probe.objects)) if (id === ignoreId) delete probe.objects[id];
  try {
    return seatFeeQuote(probe, ghost);
  } catch {
    return null;
  }
}

export { STREET_BONUS_PCT };
