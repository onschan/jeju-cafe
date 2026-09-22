/**
 * 상점 (2B-2 Task 6, 마스터 GDD §6)
 * - 마일리지 상점(농협 메달): 일꾼 삼춘(동시 건설 +1)·빠른 건축 망치·응모권·씨앗·묶음팩·강화 아이템·스카우트권
 * - 응모권 추첨(인형뽑기): 응모권 1장 또는 월 1회 무료. 가중치는 v1 roulette.json 8칸. 결과는 sim이 즉시 정하고 UI는 연출만.
 * - 응모권 상점: 유니폼 5(연출)·경관 씨앗·인기 열매
 */
import type { GameState, ApplyResult, DrawResult, DrawPrizeDef } from './types.ts';
import { OBJECTS, UNIFORMS, DRAW_PRIZES, ITEMS, FARM_INGREDIENT_IDS, ingredientDef, GUEST_TYPES, POPULARITY_FRUIT, POPULARITY_FRUIT_DELTA, canonicalGuestId, guestTypeDef, itemDef } from '../data/index.ts';
import { grantItem, openGiftBox } from './items.ts';
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
export const DRAW_TICKET = 1;
export const DRAW_INGREDIENTS = 8;
/** 유니폼 조각 5개 → 아직 없는 유니폼 1벌 (다 모았으면 응모권 3장) */
export const UNIFORM_PIECES_PER_SET = 5;
export const UNIFORM_PIECES_TICKETS = 3;
/** 매월 1일 응모권 1장 + 무료 추첨 1회 */
export const MONTHLY_FREE_TICKETS = 1;
/** 인형뽑기 1등: 이 확률로 강화 아이템 대신 꼬마 돌하르방(특수) */
export const DRAW_GUARDIAN_CHANCE = 0.1;
export const DRAW_GUARDIAN = 'little_guardian';
/** 곰 삼춘의 망치 최대 보유 (§3.3.4) */
export const HAMMER_MAX = 10;
const WORKER_RE = /^ms_worker_(\d)$/;

/** 설계도류(objectId): 시설을 짓기 목록에 연다. 아직 objects.json에 없는 시설이면 false. */
export function unlockObjectByShop(state: GameState, objectId: string): boolean {
  if (!OBJECTS.some((o) => o.id === objectId)) return false;
  if (!state.unlocked.objects.includes(objectId)) state.unlocked.objects.push(objectId);
  return true;
}
export function objectAlreadyUnlocked(state: GameState, objectId: string): boolean {
  return state.unlocked.objects.includes(objectId);
}

// ---------- 유니폼 ----------

export function hasUniform(state: GameState, uniformId: string): boolean {
  return state.uniforms.includes(uniformId);
}
/** 새 유니폼을 준다 (이미 있으면 false) */
export function grantUniform(state: GameState, uniformId: string): boolean {
  if (hasUniform(state, uniformId)) return false;
  state.uniforms.push(uniformId);
  return true;
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
      return `${josa(`₩${fmtNum(n)}`, '을/를')} 받았어요`;
    }
    case 'research': state.research += DRAW_RESEARCH; return `연구 +${DRAW_RESEARCH}`;
    case 'ticket': state.tickets += DRAW_TICKET; return `응모권 +${DRAW_TICKET}`;
    case 'ingredient_box': {
      const crops = FARM_INGREDIENT_IDS;
      const got: Record<string, number> = {};
      for (let i = 0; i < DRAW_INGREDIENTS; i++) {
        const id = crops[randInt(state, 0, crops.length - 1)]!;
        got[id] = (got[id] ?? 0) + 1;
        state.storage[id] = (state.storage[id] ?? 0) + 1;
      }
      return `재료 상자! ${Object.entries(got).map(([id, n]) => `${ingredientDef(id).name} ${n}`).join(' · ')}`;
    }
    case 'item': {
      if (nextRandom(state) < DRAW_GUARDIAN_CHANCE) { grantItem(state, DRAW_GUARDIAN); return `${josa(itemDef(DRAW_GUARDIAN).name, '을/를')} 뽑았어요!`; }
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
  state.freeDrawMonth = monthIndex(state.clock);
  pushNotice(state, '이달의 무료 인형뽑기 1회! (보름엔 응모권 1장)');
}

/** 매월 MID_MONTH_TICKET_DAY일: 「보름 응모권」 1장 (game-feel: 월초에 다 몰린 보상 사건 하나를 달 가운데로 옮겨 사건 공백을 줄인다 — 총량은 그대로 월 1장) */
export const MID_MONTH_TICKET_DAY = 15;
export function dailyShop(state: GameState): void {
  if (state.clock.day !== MID_MONTH_TICKET_DAY) return;
  state.tickets += MONTHLY_FREE_TICKETS;
  pushNotice(state, '보름 응모권 1장이 왔어요! 장부 → 상점에서 뽑아 봐요');
}
