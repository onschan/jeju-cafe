/**
 * 상점 (2B-2 Task 6, 마스터 GDD §6)
 * - 마일리지 상점(농협 메달): 일꾼 삼춘(동시 건설 +1)·곡괭이·응모권·씨앗·묶음팩·강화 아이템·스카우트권
 * - 응모권 추첨(인형뽑기): 응모권 1장 또는 월 1회 무료. 가중치는 v1 roulette.json 8칸. 결과는 sim이 즉시 정하고 UI는 연출만.
 * - 응모권 상점: 유니폼 5(연출)·경관 씨앗·인기 열매
 */
import type { GameState, ApplyResult, DrawResult, DrawPrizeDef } from './types.ts';
import { MILEAGE_SHOP, TICKET_SHOP, UNIFORMS, DRAW_PRIZES, ITEMS, CROPS, GUEST_TYPES, POPULARITY_FRUIT, POPULARITY_FRUIT_DELTA, mileageShopDef, ticketShopDef, uniformDef, canonicalGuestId, guestTypeDef } from '../data/index.ts';
import { grantItem } from './items.ts';
import { pushNotice } from './staff.ts';
import { nextRandom, pickWeighted, randInt } from './rng.ts';
import { monthIndex } from './clock.ts';
import { MAX_BUILDERS } from './build.ts';
import { isUnlocked } from './segments.ts';
import { MAX_SEGMENT_POPULARITY } from './promotions.ts';
import { josa } from './josa.ts';
import { fmtNum } from './format.ts';

export const SEED_PACK = { tangerine_seed: 3, hallabong_seed: 2 } as const;
/** 인형뽑기 상품 크기 */
export const DRAW_MONEY_PER_YEAR = 50_000;
export const DRAW_RESEARCH = 10;
export const DRAW_INGREDIENTS = 8;
export const DRAW_MILEAGE = 1;
/** 유니폼 조각 5개 → 아직 없는 유니폼 1벌 (다 모았으면 응모권 3장) */
export const UNIFORM_PIECES_PER_SET = 5;
export const UNIFORM_PIECES_TICKETS = 3;
/** 매월 1일 응모권 1장 + 무료 추첨 1회 */
export const MONTHLY_FREE_TICKETS = 1;
const WORKER_RE = /^ms_worker_(\d)$/;

// ---------- 마일리지 상점 ----------

export function canBuyMileage(state: GameState, id: string): ApplyResult {
  const def = MILEAGE_SHOP.find((m) => m.id === id);
  if (!def) return { ok: false, reason: '없는 상품이에요' };
  const m = WORKER_RE.exec(id);
  if (m) {
    const n = Number(m[1]);
    if (state.builders >= MAX_BUILDERS) return { ok: false, reason: '일꾼 삼춘은 이제 다 모였어요' };
    if (state.builders !== n - 1) return { ok: false, reason: state.builders >= n ? '이미 고용했어요' : '먼저 앞 번호 삼춘을 고용해요' };
  }
  if (state.mileage < def.price) return { ok: false, reason: '마일리지가 모자라요' };
  return { ok: true };
}

/** 호출 전 canBuyMileage */
export function buyMileage(state: GameState, id: string): void {
  const def = mileageShopDef(id);
  state.mileage -= def.price;
  if (WORKER_RE.test(id)) { state.builders += 1; pushNotice(state, `일꾼 삼춘 합류! 동시 건설 ${state.builders}`); return; }
  if (def.itemId) { grantItem(state, def.itemId); pushNotice(state, `${josa(def.name, '을/를')} 샀어요`); return; }
  switch (id) {
    case 'ms_ticket': state.tickets += 1; pushNotice(state, '응모권 1장을 샀어요'); return;
    case 'ms_seed_pack':
      for (const [item, n] of Object.entries(SEED_PACK)) grantItem(state, item, n);
      pushNotice(state, '씨앗 묶음팩! 감귤 씨앗 3 · 한라봉 씨앗 2');
      return;
    case 'ms_scout': state.freeRecruits += 1; pushNotice(state, '스카우트권! 다음 공고비가 무료예요'); return;
    default: pushNotice(state, `${josa(def.name, '을/를')} 샀어요`);
  }
}

// ---------- 응모권 상점 ----------

export function hasUniform(state: GameState, uniformId: string): boolean {
  return state.uniforms.includes(uniformId);
}

export function canBuyTicket(state: GameState, id: string): ApplyResult {
  const def = TICKET_SHOP.find((t) => t.id === id);
  if (!def) return { ok: false, reason: '없는 상품이에요' };
  if (def.uniformId && hasUniform(state, def.uniformId)) return { ok: false, reason: '이미 가진 유니폼이에요' };
  if (state.tickets < def.price) return { ok: false, reason: '응모권이 모자라요' };
  return { ok: true };
}

/** 유니폼을 얻으면 바로 입는다 (연출). 이미 있으면 false. */
export function grantUniform(state: GameState, uniformId: string): boolean {
  uniformDef(uniformId);
  if (hasUniform(state, uniformId)) return false;
  state.uniforms.push(uniformId);
  state.uniform = uniformId;
  pushNotice(state, `새 유니폼: ${uniformDef(uniformId).name}`);
  return true;
}

/** 호출 전 canBuyTicket */
export function buyTicket(state: GameState, id: string): void {
  const def = ticketShopDef(id);
  state.tickets -= def.price;
  if (def.uniformId) { grantUniform(state, def.uniformId); return; }
  if (def.itemId) { grantItem(state, def.itemId); pushNotice(state, `${josa(def.name, '을/를')} 샀어요`); }
}

export function canSetUniform(state: GameState, id: string | null): ApplyResult {
  if (id === null) return { ok: true };
  if (!UNIFORMS.some((u) => u.id === id)) return { ok: false, reason: '없는 유니폼이에요' };
  if (!hasUniform(state, id)) return { ok: false, reason: '아직 없는 유니폼이에요' };
  return { ok: true };
}
export function setUniform(state: GameState, id: string | null): void {
  state.uniform = id;
}

// ---------- 손님층 아이템 (인기 열매) ----------

export function canUseGuestItem(state: GameState, itemId: string, guestId: string): ApplyResult {
  if (itemId !== POPULARITY_FRUIT) return { ok: false, reason: '손님한테 쓰는 아이템이 아니에요' };
  if ((state.inventory[itemId] ?? 0) <= 0) return { ok: false, reason: '아이템이 없어요' };
  const id = canonicalGuestId(guestId);
  if (!GUEST_TYPES.some((t) => t.id === id)) return { ok: false, reason: '모르는 손님층이에요' };
  if (!isUnlocked(state, id)) return { ok: false, reason: '아직 안 오는 손님이에요' };
  return { ok: true };
}
/** 인기 열매: 손님 1종 인기 +10. 호출 전 canUseGuestItem. */
export function useGuestItem(state: GameState, itemId: string, guestId: string): void {
  const id = canonicalGuestId(guestId);
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) - 1;
  state.segmentPopularity[id] = Math.min(MAX_SEGMENT_POPULARITY, (state.segmentPopularity[id] ?? 0) + POPULARITY_FRUIT_DELTA);
  pushNotice(state, `${guestTypeDef(id).name} 인기 +${POPULARITY_FRUIT_DELTA}`);
}

// ---------- 응모권 추첨 (인형뽑기) ----------

export function hasFreeDraw(state: GameState): boolean {
  return state.freeDrawMonth === monthIndex(state.clock);
}

export function canDrawTicket(state: GameState): ApplyResult {
  if (hasFreeDraw(state) || state.tickets >= 1) return { ok: true };
  return { ok: false, reason: '응모권이 없어요' };
}

/** 상품 하나를 가중치로 뽑는다 (결정적). */
export function rollPrize(state: GameState, prizes: DrawPrizeDef[] = DRAW_PRIZES): DrawPrizeDef {
  return pickWeighted(state, prizes, (p) => p.pct) ?? prizes[prizes.length - 1]!;
}

/** 상품 적용 → 결과 문구 */
function applyPrize(state: GameState, prize: DrawPrizeDef): string {
  switch (prize.kind) {
    case 'money': {
      const n = DRAW_MONEY_PER_YEAR * state.clock.year;
      state.money += n;
      state.monthIncome += n;
      return `₩${fmtNum(n)}을 받았어요`;
    }
    case 'research': state.research += DRAW_RESEARCH; return `연구 +${DRAW_RESEARCH}`;
    case 'ingredient_box': {
      const crops = CROPS.map((c) => c.id);
      const got: Record<string, number> = {};
      for (let i = 0; i < DRAW_INGREDIENTS; i++) {
        const id = crops[randInt(state, 0, crops.length - 1)]!;
        got[id] = (got[id] ?? 0) + 1;
        state.storage[id] = (state.storage[id] ?? 0) + 1;
      }
      return `재료 상자! ${Object.entries(got).map(([id, n]) => `${CROPS.find((c) => c.id === id)?.name ?? id} ${n}`).join(' · ')}`;
    }
    case 'mileage': state.mileage += DRAW_MILEAGE; return `마일리지 +${DRAW_MILEAGE}`;
    case 'item': {
      const pool = ITEMS.filter((i) => i.value > 0 && i.fitIds.length > 0);
      const item = pickWeighted(state, pool.length ? pool : ITEMS.filter((i) => i.value > 0), () => 1)!;
      grantItem(state, item.id);
      return `${josa(item.name, '을/를')} 뽑았어요!`;
    }
    case 'seed': {
      const id = nextRandom(state) < 0.5 ? 'tangerine_seed' : 'hallabong_seed';
      grantItem(state, id);
      return id === 'tangerine_seed' ? '감귤 씨앗을 뽑았어요' : '한라봉 씨앗을 뽑았어요';
    }
    case 'uniform_piece': {
      state.uniformPieces += 1;
      if (state.uniformPieces < UNIFORM_PIECES_PER_SET) return `유니폼 조각 (${state.uniformPieces}/${UNIFORM_PIECES_PER_SET})`;
      state.uniformPieces = 0;
      const missing = UNIFORMS.filter((u) => !hasUniform(state, u.id));
      if (missing.length === 0) { state.tickets += UNIFORM_PIECES_TICKETS; return `조각을 다 모았어요! 유니폼은 다 있어서 응모권 ${UNIFORM_PIECES_TICKETS}장`; }
      const u = missing[0]!;
      grantUniform(state, u.id);
      return `조각을 다 모았어요! 새 유니폼 ${u.name}`;
    }
    case 'miss': return '꽝… 다음에 또 해요';
  }
}

/** 응모권 1장(또는 무료 1회) → 상품. 호출 전 canDrawTicket. */
export function drawTicket(state: GameState): DrawResult {
  const free = hasFreeDraw(state);
  if (free) state.freeDrawMonth = -1; else state.tickets -= 1;
  const prize = rollPrize(state);
  const text = applyPrize(state, prize);
  const result: DrawResult = { kind: prize.kind, label: prize.label, text, free };
  state.lastDraw = result;
  pushNotice(state, `인형뽑기: ${prize.label} — ${text}`);
  return result;
}

/** 월초: 응모권 1장 + 무료 추첨 1회 */
export function monthlyShop(state: GameState): void {
  state.tickets += MONTHLY_FREE_TICKETS;
  state.freeDrawMonth = monthIndex(state.clock);
  pushNotice(state, '이달의 응모권 1장 + 무료 인형뽑기 1회!');
}
