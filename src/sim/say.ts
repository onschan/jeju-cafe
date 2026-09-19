/**
 * 말풍선 대사 헬퍼 (v3 §1.2·§5). 결정적 — rng를 쓰지 않고 손님·직원 id의 해시로 문장을 고른다.
 * UI(렌더 트랙)가 탭·단계 전환 때 읽어 말풍선을 띄운다. sim 상태는 바꾸지 않는다.
 */
import type { GameState, Guest, Staff } from './types.ts';
import { guestDialogue, guestTags, namedGuestDef, roleDef } from '../data/index.ts';
import { menuOf, isStaffBusy } from './craft.ts';
import { LOW_ENERGY } from './staff.ts';
import { josa } from './josa.ts';
import { siteSay } from './site.ts';
import { isForeign } from './entry.ts';

/** 문자열 → 0 이상 정수 해시 (결정적 선택용) */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
function pick<T>(xs: readonly T[], key: string): T | null {
  return xs.length === 0 ? null : xs[hashOf(key) % xs.length]!;
}

const ORDER_LINES = ['{menu} 하나 주세요!', '{menu}로 할게요.', '{menu} 부탁해요.'];
const ORDER_LINES_SENIOR = ['{menu} 하나 줍서.', '{menu} 주라게.', '{menu} 하나 허여.'];
const WAIT_LINES = ['{menu} 아직인가…', '기다리는 중…', '언제 나오지?'];
const PRICE_LINES = ['비싸다…', '이 값이면 좀…', '지갑이 가볍네…'];
const PRICE_LINES_SENIOR = ['비싸다게.', '너무 비싸수다.', '이 값이면 안 먹으켜.'];
const NO_SEAT_LINES = ['자리가 없네…', '앉을 데가 없어요.', '꽉 찼네…'];
const NO_SEAT_LINES_SENIOR = ['자리가 어수다.', '앉을 디가 없저.', '꽉 찼져.'];
const LEAVE_HAPPY = ['또 올게요!', '잘 먹었어요!', '맛있었다!'];
const LEAVE_MEH = ['다음에…', '음, 글쎄…', '아쉽네…'];
const VISIT_LINES = ['구경 좀 하고 갈게요.', '여기 뭐가 있지?', '사진 한 장!'];
/** 외국인 손님(트랙 H foreign 태그)은 한국어 대신 이모지 말풍선 */
const FOREIGN_LINES: Record<Guest['phase'] | 'happy' | 'meh' | 'price' | 'wait' | 'order', string[]> = {
  walking: ['😕💺', '🙁🔍'], seated: ['🤔'], visiting: ['📸✨', '👀🍊', '🗺️'], leaving: ['👋'],
  happy: ['😋👍', '🍊💕', '📸😄'], meh: ['😐', '🤷'], price: ['💸😳', '🙄💰'], wait: ['⏳', '🕐❓'], order: ['☕🙏', '🍊👉', '🥐❓'],
};
function foreignSay(g: Guest): string | null {
  const k = g.id;
  switch (g.phase) {
    case 'walking': return g.seatId ? null : pick(FOREIGN_LINES.walking, k);
    case 'seated':
      if (g.mood === null) return g.menuId ? pick(g.waitMs > 1500 ? FOREIGN_LINES.order : FOREIGN_LINES.wait, k) : null;
      if (g.mood === 'happy') return pick(FOREIGN_LINES.happy, k);
      return pick(g.moodReason === 'price' ? FOREIGN_LINES.price : FOREIGN_LINES.meh, k);
    case 'visiting': return pick(FOREIGN_LINES.visiting, k);
    case 'leaving': return g.mood === null ? null : pick(g.mood === 'happy' ? FOREIGN_LINES.happy : FOREIGN_LINES.leaving, k);
  }
}

/** 손님의 현재 기분·단계에 맞는 대사. 대사가 없는 순간(걷는 중 등)은 null. */
export function guestSay(state: GameState, guest: Guest): string | null {
  const g = guest;
  if (g.namedId) {
    // 이름 있는 손님·특별 손님: 자기 대사 (앉아서 만족했을 때만)
    return g.phase === 'seated' && g.mood === 'happy' ? namedGuestDef(g.namedId).line : null;
  }
  if (isForeign(g.type)) return foreignSay(g); // 트랙 H: 외국인은 이모지
  const senior = guestTags(g.type).age === 'senior';
  const d = guestDialogue(g.type);
  const menuName = g.menuId ? menuOf(state, g.menuId).name : null;
  const fill = (s: string | null) => (s ? s.replace('{menu}로', josa(menuName ?? '뭐라도', '으로/로')).replace('{menu}', menuName ?? '뭐라도') : null);
  switch (g.phase) {
    case 'walking':
      return g.seatId ? null : pick(senior ? NO_SEAT_LINES_SENIOR : NO_SEAT_LINES, g.id);
    case 'seated': {
      if (g.mood === null) {
        if (!g.menuId) return null;
        // 주문 직후엔 주문 대사, 조리가 길어지면 기다림 대사
        const lines = g.waitMs > 1500 ? (senior ? ORDER_LINES_SENIOR : ORDER_LINES) : WAIT_LINES;
        return fill(pick(lines, g.id));
      }
      if (g.mood === 'happy') return siteSay(state, g) ?? pick(d.happy, g.id);
      if (g.moodReason === 'price') return pick(senior ? PRICE_LINES_SENIOR : PRICE_LINES, g.id);
      if (g.moodReason) return pick(d.meh[g.moodReason], g.id);
      return null;
    }
    case 'visiting':
      return pick(VISIT_LINES, g.id);
    case 'leaving':
      return g.mood === 'happy' ? pick(LEAVE_HAPPY, g.id) : g.mood === 'meh' || g.mood === 'angry' ? pick(LEAVE_MEH, g.id) : null;
  }
}

const REST_LINES = ['오늘은 쉬는 날이에요.', '쉬는 중…', '내일 봐요.'];
const TIRED_LINES = ['쉬고 싶어요…', 'zzz', '기력이 없어요…'];
const BUSY_LINES = ['개발 중이에요!', '레시피 연구 중…', '집중!'];
const WORK_LINES: Record<string, string[]> = {
  barista: ['원두 향이 좋아요!', '라떼 아트 갑니다!', '한 잔 더!'],
  cook: ['오븐이 뜨거워요!', '반죽 완성!', '오늘 스콘 잘 나왔어요.'],
  hall: ['어서 오세요!', '자리 안내해 드릴게요.', '테이블 닦는 중!'],
  carry: ['재료 왔어요!', '창고 정리 중.', '무거워도 거뜬!'],
  guide: ['이쪽으로 오세요!', '올레길은 저쪽이에요.', '안내해 드릴게요.'],
};
const FRESH_LINES = ['힘이 넘쳐요!', '오늘도 파이팅!', '뭐든 시켜 주세요!'];

/** 직원의 에너지·작업 상태 대사. 항상 한 줄이 있다. */
export function staffSay(state: GameState, staff: Staff): string | null {
  const st = staff;
  if (st.role === null) return pick(REST_LINES, st.id);
  if (isStaffBusy(state, st.id)) return pick(BUSY_LINES, st.id);
  if (st.energy < LOW_ENERGY) return pick(TIRED_LINES, st.id);
  if (st.energy >= 90) return pick(FRESH_LINES, st.id);
  const lines = WORK_LINES[st.role] ?? [`${roleDef(st.role).name} 일하는 중!`];
  return pick(lines, `${st.id}:${state.clock.hour}`);
}
