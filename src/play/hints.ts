/** 첫 5분 안내: 상황이 처음 벌어질 때 할망·삼춘이 한 번씩 말한다. 본 것은 state.hints에 남아 세이브를 이어도 다시 안 나온다. */
import type { GameState } from '../game/index.ts';
import { unlockables, usables, synergyPairs, isEnclosed, facilityDef, footprint, parcelAdjacent } from '../game/index.ts';
import type { PortraitId, PortraitExpr } from './dialogueStore';

export interface Hint { id: string; when: (s: GameState) => boolean; speaker: PortraitId; expr?: PortraitExpr; lines: string[] }
export const HINTS: Hint[] = [
  { id: 'first_guest', when: (s) => s.stats.guests >= 1, speaker: 'samchun', expr: 'happy', lines: ['첫 손님이 다녀갔어! 아래 줄에 영수증이 찍혔지.', '손님이 만족하면 명성이 오르고, 명성이 오르면 손님이 더 온다.'] },
  { id: 'first_synergy', when: (s) => Object.values(s.facilities).some((f) => synergyPairs(s, f).length > 0), speaker: 'halmang', lines: ['「상성 UP」 봤나? 어울리는 것끼리 옆에 두면 인기 +4, 요금 +200이다.', '시설을 탭하면 카드에 어떤 짝인지 적혀 있어.'] },
  { id: 'research_ready', when: (s) => unlockables(s).some((u) => !u.done && s.research >= u.cost), speaker: 'samchun', lines: ['연구가 모였네. 정보 › 연구에서 새 시설이나 메뉴를 열 수 있어.', '정보 단추에 빨간 점이 뜨면 열 게 있다는 뜻이야.'] },
  { id: 'money_low', when: (s) => s.money < 500_000, speaker: 'samchun', expr: 'surprised', lines: ['돈이 바닥이야! 유지비와 월급은 월말에 한꺼번에 나가.', '잔고가 −200만 아래로 떨어지면 내가 300만은 꿔 줄게. 1년에 한 번뿐이다.'] },
  { id: 'land_ready', when: (s) => s.objectivesDone.length >= 4 && s.parcels.some((p) => !p.owned && parcelAdjacent(s, p) && s.money >= p.price), speaker: 'halmang', lines: ['옆 땅을 살 만큼 모였구나. 팻말을 탭하면 살 수 있다.', '땅이 넓어지면 바닥을 더 깔고 자리를 더 놓을 수 있지.'] },
  { id: 'candidate', when: (s) => usables(s).length >= 4 && s.staff.length === 0, speaker: 'samchun', lines: ['자리가 늘었으니 직원을 하나 뽑아. 정보 › 직원에서 이달 후보를 볼 수 있어.', '서비스가 좋으면 손님이 빨리 돌고 더 만족해.'] },
  { id: 'winter', when: (s) => s.clock.month === 12 && usables(s).some((f) => { const d = facilityDef(f.type); return !isEnclosed(s, footprint(f.x, f.y, d.w, d.h)); }), speaker: 'halmang', expr: 'surprised', lines: ['겨울이다. 바깥 자리는 추워서 인기가 6이나 떨어져.', '울타리나 돌벽으로 둘러싸면 실내가 된다. 문은 올렛길로 내면 돼.'] },
  { id: 'first_rank', when: (s) => s.evaluations.length >= 1 && s.evaluations[0]!.rank > 1, speaker: 'samchun', lines: ['랭킹 점수는 명성 + 시설 인기 합이야. 경쟁 카페는 해마다 커진다.', '자리를 늘리고 단계를 올리면 인기 합이, 손님이 만족하면 명성이 올라.'] },
];
/** 지금 처음으로 조건이 맞은 안내 하나 (없으면 null) */
export function nextHint(s: GameState): Hint | null { return HINTS.find((h) => !s.hints.includes(h.id) && h.when(s)) ?? null; }
