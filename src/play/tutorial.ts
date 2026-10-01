/** 따라 하기: 장사에 필요한 기본 한 벌을 순서대로. 단계마다 할 일 한 줄 + 어디서 하는지, 이루면 상금과 한마디. */
import type { GameState } from '../game/index.ts';
import { facilityDef, usables, isEnclosed, footprint, sheetOf } from '../game/index.ts';
import type { PortraitId } from './dialogueStore';

export interface TutorialStep {
  text: string;                 // 할 일
  how: string;                  // 어디서 어떻게
  reward: number;
  done: (s: GameState) => boolean;
  say: { who: PortraitId; lines: string[] };
}
const floorCells = (s: GameState) => s.grid.cells.filter((c) => c.floor && c.floor !== 'path').length;
const seats = (s: GameState) => usables(s).filter((f) => facilityDef(f.type).tab === 'seat').length;
const envs = (s: GameState) => Object.values(s.facilities).filter((f) => { const d = facilityDef(f.type); return d.tab === 'env' && !d.sub; }).length;
const indoorSeats = (s: GameState) => usables(s).filter((f) => sheetOf(s, f).indoor).length;

export const TUTORIAL: TutorialStep[] = [
  { text: '바닥을 12칸까지 깔아요', how: '건축 › 바닥·벽 › 나무 데크 — 드래그로 한 줄씩', reward: 150_000, done: (s) => floorCells(s) >= 12,
    say: { who: 'halmang', lines: ['바닥이 깔린 데가 네 카페다. 넓을수록 자리를 더 놓지.', '올렛길로 손님이 들어오니 길은 막지 말고.'] } },
  { text: '자리를 3개 놓아요', how: '건축 › 시설 › 테이블 — 바닥 위에', reward: 200_000, done: (s) => seats(s) >= 3,
    say: { who: 'samchun', lines: ['자리가 있어야 손님을 받지. 자리마다 한 번에 한 명씩이야.', '자리 옆에 걸어올 통로를 꼭 남겨 둬.'] } },
  { text: '나무나 꽃을 2개 심어요', how: '건축 › 환경 — 잔디 위에, 자리 가까이', reward: 150_000, done: (s) => envs(s) >= 2,
    say: { who: 'halmang', lines: ['자리 옆 두 칸 안의 나무·꽃이 「경치」가 돼서 인기를 올린다.', '어울리는 것끼리 붙여 두면 「상성 UP」도 뜨지.'] } },
  { text: '손님 10명을 받아요', how: '시계를 3배속으로 — 영수증이 아래 줄에 찍혀요', reward: 200_000, done: (s) => s.stats.guests >= 10,
    say: { who: 'samchun', lines: ['손님이 만족하면 명성이 오르고, 명성이 오르면 손님이 더 와.', '불만이 있으면 손님 창의 「손님 니즈」에 까닭이 쌓여.'] } },
  { text: '제조대를 놓아요', how: '건축 › 실내 › 제조대 — 바닥 위에', reward: 200_000, done: (s) => Object.values(s.facilities).some((f) => facilityDef(f.type).station),
    say: { who: 'samchun', lines: ['이제 주문이 들어오면 제조대에서 만들어져. 다 되면 손님 자리로 간다.', '바리스타 담당이 빠를수록 빨리 나오고, 홀 담당이 좋을수록 빨리 가져다 줘.'] } },
  { text: '사람을 구해요', how: '운영 › 직원 › 사람 구하기 — 전단지부터', reward: 250_000, done: (s) => s.staff.length > 0 || !!s.hiring || s.candidates.length > 0,
    say: { who: 'samchun', lines: ['공고를 내면 며칠 뒤 후보가 와. 비쌀수록 좋은 사람이 오지.', '뽑고 나면 담당을 잘하는 자리로 바꿔 줘 — 맡은 능력만 제값이야.'] } },
  { text: '벽으로 둘러싸 방을 만들어요', how: '건축 › 바닥·벽 › 나무 판벽 — 「네모 두르기」로 데크를 감싸요', reward: 300_000, done: (s) => indoorSeats(s) >= 1,
    say: { who: 'halmang', lines: ['둘러싸면 실내다. 인기 +2에 겨울 추위도 면하지.', '올렛길에 닿는 변은 문으로 저절로 비워진다.'] } },
  { text: '실내에 뭔가 놓아요', how: '건축 › 실내 — 카운터·벽난로·책장', reward: 300_000, done: (s) => Object.values(s.facilities).some((f) => facilityDef(f.type).indoor),
    say: { who: 'samchun', lines: ['카운터는 자리 요금을, 벽난로·책장은 「아늑함」을 올려.', '이제 네 카페다. 마당이든 실내든 마음껏 꾸며 봐!'] } },
];
export function tutorialStep(s: GameState): { i: number; step: TutorialStep } | null {
  if (s.tutorial < 0 || s.tutorial >= TUTORIAL.length) return null;
  return { i: s.tutorial, step: TUTORIAL[s.tutorial]! };
}
void isEnclosed; void footprint;
