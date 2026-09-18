/**
 * 목표 체인 (v3 §2): goals.json 60개를 순서대로. 목표 줄에는 현재 목표 1개와 진행도가 보이고,
 * 달성하면 보상을 즉시 주고 다음 목표로 넘어간다 (alerts에 { type: 'goal', goalId } → UI 대화창).
 * 연구 해금 트리(UNLOCKS)는 없다 — 시설·메뉴·직종·슬롯·기능은 목표 보상으로 열린다.
 *
 * 기능 잠금표 (state.features — 목표 보상 unlockFeature로 열린다. 열리기 전엔 해당 액션이 ok:false):
 * | feature    | 여는 목표 | 잠기는 액션                                          |
 * |------------|-----------|------------------------------------------------------|
 * | promote    | g07       | promote (홍보 활동: 전단·SNS·아르바이트…)             |
 * | parcel     | g11       | buyParcel                                            |
 * | clearRock  | g12       | clearRock (바위·덤불 치우기)                          |
 * | craft      | g16       | develop · addTopping · removeTopping · levelUpMenu   |
 * | popup      | g18       | openPopup (원정 팝업 스토어)                          |
 * | challenge  | g38       | challenge (라이벌 카페 대결)                          |
 */
import type { GameState, GoalDef, GoalCondition, GoalReward, FeatureId, Action, ApplyResult } from './types.ts';
import { GOALS, goalDef, objectDef, menuDef, roleDef } from '../data/index.ts';
import { facilityCount } from './rank.ts';
import { countCategory } from './segments.ts';
import { ownedParcels } from './parcels.ts';
import { metCount, regularCount } from './popup.ts';
import { pushNotice } from './staff.ts';
import { addMileage } from './mileage.ts';
import { MAX_BUILDERS } from './build.ts';
import { pushFx } from './fx.ts';
import { fmtNum } from './format.ts';

export const FEATURE_IDS: FeatureId[] = ['clearRock', 'promote', 'craft', 'popup', 'challenge', 'parcel'];
export const FEATURE_NAME: Record<FeatureId, string> = { clearRock: '바위 치우기', promote: '홍보', craft: '연구 개발', popup: '팝업 스토어', challenge: '카페 대결', parcel: '필지 구매' };
/** 액션 → 필요한 기능 (표는 파일 상단 주석) */
export const FEATURE_OF_ACTION: Partial<Record<Action['type'], FeatureId>> = {
  clearRock: 'clearRock',
  promote: 'promote',
  develop: 'craft', addTopping: 'craft', removeTopping: 'craft', levelUpMenu: 'craft',
  openPopup: 'popup',
  challenge: 'challenge',
  buyParcel: 'parcel',
};
/** 한 번의 checkGoals에서 연달아 처리할 최대 목표 수 (무한 루프 방지) */
export const MAX_GOALS_PER_CHECK = 10;

export function initFeatures(): Record<FeatureId, boolean> {
  return { clearRock: false, promote: false, craft: false, popup: false, challenge: false, parcel: false };
}

export function featureOpen(state: GameState, id: FeatureId): boolean {
  return state.features[id] === true;
}

/** 액션이 기능 잠금에 걸리나 (걸리면 ok:false + 어느 목표에서 열리는지) */
export function checkFeature(state: GameState, actionType: Action['type']): ApplyResult {
  const f = FEATURE_OF_ACTION[actionType];
  if (!f || featureOpen(state, f)) return { ok: true };
  const g = goalForFeature(f);
  return { ok: false, reason: g ? `${FEATURE_NAME[f]}은(는) 목표 "${g.title}"를 이루면 열려요` : `${FEATURE_NAME[f]}은(는) 아직 잠겨 있어요` };
}

export function currentGoal(state: GameState): GoalDef | null {
  return GOALS[state.goals.index] ?? null;
}

/** 목표 조건의 현재 값 */
export function goalValue(state: GameState, c: GoalCondition): number {
  switch (c.type) {
    case 'guests': return state.totalGuests;
    case 'menuSold': return state.menuSold[c.menuId] ?? 0;
    case 'money': return state.money;
    case 'staff': return state.staff.length;
    case 'facilities': return c.category ? countCategory(state, c.category) : facilityCount(state);
    case 'satisfied': return state.stats.satisfiedTotal;
    case 'parcels': return ownedParcels(state).length;
    case 'rank': {
      // 가이드북 최고 순위 (작을수록 좋다). 발표가 없었으면 11(= 10위 밖)
      let best = 11;
      for (const g of Object.values(state.guidebooks)) if (g.best !== null) best = Math.min(best, g.best);
      return best;
    }
    case 'cafeRank': return state.rank;
    case 'stars': return state.star;
    case 'regular': return regularCount(state) + Object.values(state.guestTypes).filter((t) => t.regular !== 'none').length;
    case 'research': return state.research;
    case 'namedGuest': return metCount(state);
    case 'rocks': return state.stats.rocksCleared;
    case 'menus': return state.menuSlots.filter((m) => m !== null).length;
    case 'recipes': return state.stats.recipesMade;
    case 'promotions': return state.stats.promotionsDone;
    case 'rivalWins': return state.stats.rivalWins;
    case 'year': return state.clock.year;
  }
}

export function goalMet(state: GameState, c: GoalCondition): boolean {
  const v = goalValue(state, c);
  return c.type === 'rank' ? v <= c.n : v >= c.n;
}

/** 목표 줄 진행도 { cur, max }. rank(순위 ≤ n)는 "n위 안" 목표라 cur = 달성 여부(0/1). 목표가 다 끝났으면 { cur: 0, max: 0 }. */
export function goalProgress(state: GameState): { cur: number; max: number } {
  const g = currentGoal(state);
  if (!g) return { cur: 0, max: 0 };
  if (g.condition.type === 'rank') return { cur: goalMet(state, g.condition) ? 1 : 0, max: 1 };
  return { cur: Math.min(g.condition.n, goalValue(state, g.condition)), max: g.condition.n };
}

/** 목표 조건 한글 문구 (UI 목표 줄·잠긴 카드용) */
export function goalConditionText(c: GoalCondition): string {
  switch (c.type) {
    case 'guests': return `손님 ${fmtNum(c.n)}명 맞이`;
    case 'menuSold': return `${menuDef(c.menuId).name} ${c.n}잔 팔기`;
    case 'money': return `자금 ₩${fmtNum(c.n)}`;
    case 'staff': return `직원 ${c.n}명`;
    case 'facilities': return `시설 ${c.n}개`;
    case 'satisfied': return `만족 손님 ${fmtNum(c.n)}명`;
    case 'parcels': return `필지 ${c.n}개`;
    case 'rank': return `가이드북 ${c.n}위 안`;
    case 'cafeRank': return `카페 랭크 ${c.n}`;
    case 'stars': return `★${c.n}`;
    case 'regular': return `단골 ${c.n}명`;
    case 'research': return `연구 ${c.n}`;
    case 'namedGuest': return `이름 있는 손님 ${c.n}명`;
    case 'rocks': return `바위 ${c.n}개 치우기`;
    case 'menus': return `메뉴 ${c.n}개 올리기`;
    case 'recipes': return `레시피 ${c.n}개 개발`;
    case 'promotions': return `홍보 ${c.n}회`;
    case 'rivalWins': return `라이벌 대결 ${c.n}승`;
    case 'year': return `${c.n}년차`;
  }
}

/** 보상 한글 문구 */
export function goalRewardText(r: GoalReward): string {
  switch (r.type) {
    case 'money': return `₩${fmtNum(r.amount)}`;
    case 'unlockFacility': return `시설 ${objectDef(r.id).name}`;
    case 'unlockMenu': return `메뉴 ${menuDef(r.id).name}`;
    case 'unlockRole': return `직종 ${roleDef(r.id).name}`;
    case 'tickets': return `응모권 ${r.n}`;
    case 'mileage': return `마일리지 ${r.n}`;
    case 'staffSlot': return `${roleDef(r.role).name} 자리 +${r.n}`;
    case 'research': return `연구 ${r.n}`;
    case 'builder': return `일꾼 삼춘 +${r.n}`;
    case 'unlockFeature': return `${FEATURE_NAME[r.id]} 열림`;
  }
}

/** 이 시설을 여는 목표 (잠긴 카드 "🔒 손님 50명 맞이하면 열려요") */
export function goalForFacility(objectId: string): GoalDef | null {
  return GOALS.find((g) => g.reward.some((r) => r.type === 'unlockFacility' && r.id === objectId)) ?? null;
}
export function goalForMenu(menuId: string): GoalDef | null {
  return GOALS.find((g) => g.reward.some((r) => r.type === 'unlockMenu' && r.id === menuId)) ?? null;
}
export function goalForFeature(id: FeatureId): GoalDef | null {
  return GOALS.find((g) => g.reward.some((r) => r.type === 'unlockFeature' && r.id === id)) ?? null;
}

export function grantReward(state: GameState, r: GoalReward): void {
  switch (r.type) {
    case 'money': state.money += r.amount; break;
    case 'unlockFacility': if (!state.unlocked.objects.includes(r.id)) { state.unlocked.objects.push(r.id); pushNotice(state, `새 시설: ${objectDef(r.id).name}`); } break;
    case 'unlockMenu': if (!state.unlocked.menus.includes(r.id)) { state.unlocked.menus.push(r.id); pushNotice(state, `새 메뉴: ${menuDef(r.id).name}`); } break;
    case 'unlockRole': if (!state.unlocked.roles.includes(r.id)) { state.unlocked.roles.push(r.id); pushNotice(state, `새 직종: ${roleDef(r.id).name}`); } break;
    case 'tickets': state.tickets += r.n; break;
    case 'mileage': addMileage(state, r.n); break;
    case 'staffSlot': state.slots[r.role] += r.n; break;
    case 'research': state.research += r.n; break;
    case 'builder': state.builders = Math.min(MAX_BUILDERS, state.builders + r.n); break;
    case 'unlockFeature': state.features[r.id] = true; pushNotice(state, `${FEATURE_NAME[r.id]}이(가) 열렸어요`); break;
  }
}

/** 현재 목표부터 달성된 것을 순서대로 처리한다 (보상 → index++ → claimed → alerts). 달성한 목표 id 목록. tick(하루 1번)과 액션 직후에 부른다. */
export function checkGoals(state: GameState): string[] {
  const done: string[] = [];
  for (let i = 0; i < MAX_GOALS_PER_CHECK; i++) {
    const g = currentGoal(state);
    if (!g || !goalMet(state, g.condition)) break;
    for (const r of g.reward) grantReward(state, r);
    state.goals.index++;
    state.goals.claimed.push(g.id);
    state.alerts.push({ type: 'goal', goalId: g.id });
    pushNotice(state, `목표 달성: ${g.title} — ${g.reward.map(goalRewardText).join(' · ')}`);
    pushFx(state, { kind: 'scene', title: '목표 달성', text: `${g.title}! ${g.line ?? ''}`.trim(), tick: state.tick });
    done.push(g.id);
  }
  return done;
}

export { goalDef };
