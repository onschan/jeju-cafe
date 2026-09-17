import type { GameState, Guest, Staff } from '../sim/index.ts';
import { LOW_ENERGY } from '../sim/index.ts';

/** 트랙 A(sim)가 만드는 목표·알림·대사 API를 UI가 한 곳에서만 참조하도록 감싼다.
 *  아직 sim에 없는 것은 여기서 임시 스텁으로 두고, 통합 때 실제 함수로 바꾼다. 스텁마다 TODO(v3-sim) 표시. */

export interface Goal {
  id: string;
  title: string;
  desc: string;
  cur: number;
  max: number;
  rewardText: string;
}

/** 대화창 트리거 큐 항목. sim이 state.notices(v3)에 쌓고 UI가 소비하면 dismissNotice로 지운다. */
export interface Notice {
  type: 'goal' | 'event' | 'quest' | 'rank';
  id: string;
  /** 말하는 사람 (기본 할망) */
  speaker?: 'halmang' | 'samchun' | 'hero';
  title?: string;
  lines: string[];
}

// TODO(v3-sim): state.goals + goals.json으로 교체
const STUB_GOAL_MAX = 10;
export function currentGoal(s: GameState): Goal | null {
  return {
    id: 'stub_guests_10',
    title: `손님 ${STUB_GOAL_MAX}명 맞이`,
    desc: `손님 ${STUB_GOAL_MAX}명이 카페에 다녀가면 달성이에요. 테이블과 올렛길이 이어져 있어야 손님이 와요.`,
    cur: Math.min(s.totalGuests, STUB_GOAL_MAX),
    max: STUB_GOAL_MAX,
    rewardText: '₩500,000',
  };
}

// TODO(v3-sim): state.goals.claimed 기반 지난 목표 목록
export function pastGoals(_s: GameState): Goal[] {
  return [];
}

/** 달성한 목표 수 (튜토리얼 ⑥ 조건). TODO(v3-sim): state.goals.index로 교체 — 지금은 손님 20명이면 3개로 친다 */
export function goalsAchieved(s: GameState): number {
  return s.totalGuests >= 20 ? 3 : s.totalGuests >= 10 ? 1 : 0;
}

// TODO(v3-sim): state.notices(v3 객체 큐)를 읽는다. 지금 state.notices는 월말 문자열 알림이라 여기서는 비워 둔다.
const consumed = new Set<string>();
export function pendingNotices(_s: GameState): Notice[] {
  return [];
}

/** UI가 대화창을 띄운 알림을 지운다. TODO(v3-sim): dispatch({ type: 'dismissNotice', id }) 클라이언트 전용 액션으로 교체 */
export function dismissNotice(id: string): void {
  consumed.add(id);
}

const GUEST_MOOD_LINE: Record<string, string> = {
  happy: '맛있다!',
  meh: '그저 그렇네…',
  angry: '다시는 안 와!',
};
const GUEST_REASON_LINE: Record<string, string> = {
  no_menu: '먹을 게 없네…',
  scenery: '경치가 아쉽네…',
  wait: '너무 오래 기다렸어',
  price: '비싸다…',
};
const GUEST_PHASE_LINE: Record<Guest['phase'], string> = {
  walking: '자리가 있을까?',
  seated: '뭘 먹을까…',
  visiting: '구경 좀 하고',
  leaving: '잘 먹었다',
};

// TODO(v3-sim): sim의 guestSay로 교체 (dialogue.json 사투리 풀)
export function guestSay(_s: GameState, g: Guest): string | null {
  if (g.say) return g.say;
  if (g.mood && g.moodReason && g.mood !== 'happy') return GUEST_REASON_LINE[g.moodReason] ?? null;
  if (g.mood) return GUEST_MOOD_LINE[g.mood] ?? null;
  return GUEST_PHASE_LINE[g.phase] ?? null;
}

// TODO(v3-sim): sim의 staffSay로 교체
export function staffSay(_s: GameState, st: Staff): string | null {
  if (st.unpaidMonths > 0) return '월급이 밀렸어요…';
  if (st.energy < LOW_ENERGY) return '쉬고 싶어요…';
  if (!st.role) return '뭘 하면 될까요?';
  if (st.energy >= 80) return '힘이 넘쳐요!';
  return '열심히 하고 있어요';
}
