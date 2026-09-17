import type { GameState, Parcel, ParcelBonus, ApplyResult } from './types.ts';
import { PARCELS, guestTags } from '../data/index.ts';
import { pushNotice } from './staff.ts';
import { PARCEL_COLS, PARCEL_ROWS, PARCEL_W, PARCEL_H, START_ORIGIN, PARCEL_LAYOUT as LAYOUT } from './layout.ts';

export { PARCEL_COLS, PARCEL_ROWS, PARCEL_W, PARCEL_H, START_ORIGIN };
/** parcels.json 가격(15만~30만)은 구 화폐 단위라 ×10 → 100만~300만 (시작 자금 500만 기준) */
export const PARCEL_PRICE_SCALE = 10;
/** 신구간(1월)엔 30% 할인 */
export const SINGUGAN_MONTH = 1;
export const SINGUGAN_DISCOUNT = 0.3;
/** 해안: 관광객·단체 유입 ×1.3, 좌석 Fee ×1.10 */
export const COAST_SPAWN_MULT = 1.3;
export const COAST_FEE_MULT = 1.1;
/** 해안 유입 보너스를 받는 손님: 청년(관광객층)·단체 */
export function coastBoosted(typeId: string): boolean {
  const t = guestTags(typeId);
  return t.group || t.age === 'youth';
}
/** 오름: 그 필지 좌석의 경치 +2 */
export const OREUM_SCENERY = 2;
/** 돌담 언덕: 경치 +1 */
export const STONEHILL_SCENERY = 1;
/** 마을 어귀: 삼춘(시니어) 유입 ×1.2 */
export const VILLAGE_SENIOR_MULT = 1.2;
/** 밭담: 밭 품질 "좋음" → 수확 ×1.2. 곶자왈: 차·고사리 ×1.1. 용천수: 모든 작물 ×1.1 */
export const BATDAM_HARVEST_MULT = 1.2;
export const GOTJAWAL_HARVEST_MULT = 1.1;
export const GOTJAWAL_CROPS = new Set(['tea', 'gosari']);
export const SPRING_HARVEST_MULT = 1.1;

const BONUS_BY_NO: Record<number, ParcelBonus> = { 1: 'none', 2: 'oreum', 3: 'gotjawal', 4: 'batdam', 5: 'coast', 6: 'spring', 7: 'village', 8: 'stonehill', 9: 'orchard' };

/** 소유 필지 수에 따른 해금: 2·3·7(마을 어귀)번은 처음부터, 4·5·8번은 3개 소유 뒤, 6·9번은 5개 소유 뒤 (토지 권리증 투자는 TODO) */
export function parcelUnlockOwnedCount(no: number): number {
  if (no <= 3 || no === 7) return 1;
  if (no <= 5 || no === 8) return 3;
  return 5;
}

export function makeParcels(): Parcel[] {
  return PARCELS.map((p) => {
    const at = LAYOUT[p.id];
    if (!at) throw new Error(`parcel layout missing: ${p.id}`);
    return {
    id: p.id,
    no: p.no,
    name: p.name,
    x: at.col * p.w,
    y: at.row * p.h,
    w: p.w,
    h: p.h,
    owned: p.start,
    price: p.price * PARCEL_PRICE_SCALE,
    bonus: BONUS_BY_NO[p.no] ?? 'none',
    };
  });
}

export function parcelAt(state: GameState, x: number, y: number): Parcel | null {
  return state.parcels.find((p) => x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h) ?? null;
}

export function parcelById(state: GameState, id: string): Parcel | null {
  return state.parcels.find((p) => p.id === id) ?? null;
}

export function ownedParcels(state: GameState): Parcel[] {
  return state.parcels.filter((p) => p.owned);
}

/** 변을 맞댄(4방향 이웃) 필지인가 — 대각선은 아니다 */
export function parcelsAdjacent(a: Parcel, b: Parcel): boolean {
  const sameRow = a.y === b.y && (a.x + a.w === b.x || b.x + b.w === a.x);
  const sameCol = a.x === b.x && (a.y + a.h === b.y || b.y + b.h === a.y);
  return sameRow || sameCol;
}

/** 지금 사면 드는 값 (신구간 할인 반영) */
export function parcelPrice(state: GameState, p: Parcel): number {
  const disc = state.clock.month === SINGUGAN_MONTH ? SINGUGAN_DISCOUNT : 0;
  return Math.round(p.price * (1 - disc));
}

export function canBuyParcel(state: GameState, id: string): ApplyResult {
  const p = parcelById(state, id);
  if (!p) return { ok: false, reason: '없는 필지예요' };
  if (p.owned) return { ok: false, reason: '이미 내 땅이에요' };
  const owned = ownedParcels(state);
  if (owned.length < parcelUnlockOwnedCount(p.no)) return { ok: false, reason: `필지 ${parcelUnlockOwnedCount(p.no)}개를 가진 뒤에 살 수 있어요` };
  if (!owned.some((o) => parcelsAdjacent(o, p))) return { ok: false, reason: '내 땅과 붙어 있어야 해요' };
  if (state.money < parcelPrice(state, p)) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

/** 검사 없이 산다. 호출 전 canBuyParcel로 확인할 것. */
export function buyParcel(state: GameState, id: string): void {
  const p = parcelById(state, id)!;
  const price = parcelPrice(state, p);
  state.money -= price;
  p.owned = true;
  pushNotice(state, `${p.name} 필지를 샀어요 (₩${price.toLocaleString()})`);
}

// ---------- 구역 보너스 ----------

export function parcelBonusAt(state: GameState, x: number, y: number): ParcelBonus {
  return parcelAt(state, x, y)?.bonus ?? 'none';
}

/** 좌석이 있는 필지의 스폰 가중치 배수 (해안: 관광객·단체 ×1.3, 마을 어귀: 삼춘 ×1.2) */
export function parcelSpawnMult(bonus: ParcelBonus, typeId: string): number {
  if (bonus === 'coast' && coastBoosted(typeId)) return COAST_SPAWN_MULT;
  if (bonus === 'village' && guestTags(typeId).age === 'senior') return VILLAGE_SENIOR_MULT;
  return 1;
}

/** 좌석이 있는 필지의 요금 배수 (해안 ×1.10) */
export function parcelFeeMult(bonus: ParcelBonus): number {
  return bonus === 'coast' ? COAST_FEE_MULT : 1;
}

/** 필지 경치 가산 (오름 +2, 돌담 언덕 +1) */
export function parcelSceneryBonus(bonus: ParcelBonus): number {
  return bonus === 'oreum' ? OREUM_SCENERY : bonus === 'stonehill' ? STONEHILL_SCENERY : 0;
}

/** 수확량 배수 (밭담 ×1.2, 용천수 ×1.1, 곶자왈은 차·고사리만 ×1.1) */
export function parcelHarvestMult(bonus: ParcelBonus, cropId: string): number {
  if (bonus === 'batdam') return BATDAM_HARVEST_MULT;
  if (bonus === 'spring') return SPRING_HARVEST_MULT;
  if (bonus === 'gotjawal' && GOTJAWAL_CROPS.has(cropId)) return GOTJAWAL_HARVEST_MULT;
  return 1;
}
