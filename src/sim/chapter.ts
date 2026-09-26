/**
 * 막 (chapter, teardown §4 「한 판(5년)」 층): 5년을 **다섯 막**으로 나눈다.
 *
 * 왜 — 한 판은 「돈이 남으니 뭐라도 놓는다」로 굴러갔다. 3년차에 등급 3·★2에서 멈추고
 * 시설 46개가 열렸는데 24개는 한 번도 안 놓는다. **이번 판에 무엇을 하려는지**가 없기 때문이다.
 *
 * 막마다 「이번엔 이 손님을 잡는다」가 딱 하나 있다. 막을 넘으려면 그 막의 손님이
 * **자기 취향 자리에 앉은 수**(wants.ts seatFitsWant)가 need명을 채워야 한다.
 *
 * 카이로 방향(specs/2026-09-26-direction.md): 손으로 하는 건 배치뿐이다. 손님은 알아서 오고,
 * 자기 취향 자리가 있으면 거기 앉는다(guests.ts findSeat). 그러니 「그늘 자리를 만들었나」가
 * 곧 「조용함을 보는 손님이 제자리에 앉았나」이고, 막은 그 수를 세기만 하면 된다.
 * (러시 시절엔 「직접 앉힌 수 + 등급」이었다. 러시를 걷어내며 등급 조건은 사라졌다.)
 *
 * 막 = 배치 과제다. 1막은 그늘, 2막은 귤밭 곁, 3막은 문 앞, 4막은 전망, 5막은 그 넷을 고루 —
 * 마당을 다섯 번 다시 짜게 만든다.
 *
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState } from './types.ts';
import { objectDef } from '../data/index.ts';
import { seatFitsWant, wantOf, WANT_LABEL, type Want } from './wants.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { addTickets } from './mileage.ts';

/** 막 하나. want가 null이면 손님층을 가리지 않는다 (5막 — 온갖 손님이 제자리에). */
export interface ChapterDef {
  id: string;
  /** 「1막 · 조용히 쉬러 온 사람」 */
  name: string;
  /** 이번 막이 잡는 손님이 보는 것. null = 아무 손님이나 */
  want: Want | null;
  /** 제자리에 앉아야 하는 누적 수 */
  need: number;
  /** 무엇을 해야 하는지 한 줄 — 마당에서 할 일로 읽히게 */
  todo: string;
  /** 막을 넘었을 때 한 줄 */
  done: string;
}

export const CHAPTERS: ChapterDef[] = [
  { id: 'ch_rest', name: '1막 · 조용히 쉬러 온 사람', want: 'rest', need: 30,
    todo: '그늘지고 조용한 자리를 만들어요 — 파라솔이나 나무 곁', done: '쉬러 온 사람들이 여기를 기억했어요' },
  { id: 'ch_farm', name: '2막 · 귤밭을 보러 온 사람', want: 'farm', need: 40,
    todo: '감귤나무나 당근밭 곁에 자리를 놓아요', done: '귤밭 곁 자리가 소문났어요' },
  { id: 'ch_convenience', name: '3막 · 차를 몰고 온 사람', want: 'convenience', need: 80,
    todo: '문에서 가까운 자리를 늘려요', done: '차를 세우고 바로 앉는 카페가 됐어요' },
  { id: 'ch_scenery', name: '4막 · 바다를 보러 온 사람', want: 'scenery', need: 120,
    todo: '벚나무 같은 큰 경관을 자리 곁에 모아요 — 전망 2 이상', done: '전망 자리를 보러 사람들이 와요' },
  // 5막엔 잡을 손님층이 없다 — 온갖 손님이 각자 제자리에 앉아야 한다. 한 층에 맞춘 마당은 여기서 밑천이 드러난다.
  { id: 'ch_regular', name: '5막 · 다시 찾아온 단골', want: null, need: 400,
    todo: '이제 온갖 손님이 와요 — 그늘·귤밭·문 앞·전망을 고루 갖춰요', done: '이 카페는 이제 단골들의 자리예요' },
];

/** 막을 넘을 때마다 주는 응모권 */
export const CHAPTER_TICKETS = 3;

/** 지금 막과 그 막에서 쌓은 것 (막이 넘어가면 0부터 다시). grades는 러시 시절 잔재 — 안 쓴다. */
export interface ChapterProgress { idx: number; hits?: number; grades?: number }

export function chapterProgress(state: GameState): ChapterProgress {
  return (state.chapter ??= { idx: 0 });
}
/** 지금 막 (다 끝냈으면 null) */
export function currentChapter(state: GameState): ChapterDef | null {
  return CHAPTERS[chapterProgress(state).idx] ?? null;
}
/** 넘은 막 수 */
export function chaptersCleared(state: GameState): number {
  return Math.min(CHAPTERS.length, chapterProgress(state).idx);
}
export function allChaptersDone(state: GameState): boolean {
  return chapterProgress(state).idx >= CHAPTERS.length;
}
/** 이번 막에서 지금까지 제자리에 앉은 수 */
export function chapterHits(state: GameState): number {
  return chapterProgress(state).hits ?? 0;
}

/** 손님이 자리에 앉는 순간 guests.ts가 부른다. 그 손님이 **자기 취향 자리**(fit)에 앉았고
 *  이번 막의 손님층이면(5막은 아무나) 센다. 취향과 무관하게 앉은 건 안 센다 — 그게 배치 과제의 알맹이다.
 *  덤으로 누적 stats.fitGuests도 올린다 (목표 해금이 이걸 본다). */
export function noteChapterSeat(state: GameState, typeId: string, fit: boolean): void {
  if (!fit) return;
  state.stats.fitGuests = (state.stats.fitGuests ?? 0) + 1;
  const ch = currentChapter(state);
  if (!ch) return;
  if (ch.want !== null && wantOf(typeId) !== ch.want) return;
  const p = chapterProgress(state);
  p.hits = (p.hits ?? 0) + 1;
}

/** 새 날마다 (tick.onNewDay): 막을 넘었나. 넘었으면 idx++ 하고 진행도를 0으로. */
export function checkChapter(state: GameState): boolean {
  const ch = currentChapter(state);
  if (!ch) return false;
  const p = chapterProgress(state);
  if ((p.hits ?? 0) < ch.need) return false;
  p.idx++;
  p.hits = 0;
  delete p.grades;
  addTickets(state, CHAPTER_TICKETS, ch.name);
  pushNotice(state, `${ch.name} 끝 — ${ch.done}`);
  const next = currentChapter(state);
  pushFx(state, { kind: 'scene', title: ch.name, text: next ? `${ch.done}\n다음은 「${next.name}」 — ${next.todo}` : `${ch.done}\n다섯 막을 다 지났어요.`, tick: state.tick });
  return true;
}

/** 이번 막이 **막혀 있나** — 지금 마당에 그 손님을 앉힐 자리가 하나도 없으면 그 까닭 한 줄.
 *
 *  이게 없으면 막이 조용한 절벽이 된다: 실측에서 전망 자리가 없는 마당은 아무리 장사가 잘돼도
 *  4막 진행이 0이었다. 숫자만 안 오르고 왜인지는 아무 데도 안 나온다. */
export function chapterBlocker(state: GameState): string | null {
  const ch = currentChapter(state);
  if (!ch || ch.want === null) return null;
  const seats = Object.values(state.objects).filter((o) => !o.build && objectDef(o.type).kind === 'seat');
  if (seats.length === 0) return null; // 자리부터 놓으라는 말은 openBlocker가 한다
  if (seats.some((seat) => seatFitsWant(state, seat, ch.want!))) return null;
  return CHAPTER_HINT[ch.want];
}
/** 막이 막혔을 때 무엇을 지으라는지 — 「경관 시설」 같은 뭉뚱그린 말 대신 놓을 것을 집어 준다 */
const CHAPTER_HINT: Record<Want, string> = {
  rest: '그늘진 자리가 없어요 — 파라솔 테이블이나 나무 곁으로',
  farm: '귤밭 곁 자리가 없어요 — 감귤나무·당근밭을 자리 3칸 안에',
  convenience: '문 앞 자리가 없어요 — 본관 가까이에 자리를 놓아요',
  scenery: '전망 2 이상인 자리가 없어요 — 벚나무를 자리 곁에 모아요 (꽃밭은 전망에 안 잡혀요)',
  food: '먹거리 시설 곁 자리가 없어요',
  fun: '즐길거리 곁 자리가 없어요',
};

/** 「이번 막」 한 줄 (안내 줄). 다 끝냈으면 null. */
export function chapterLine(state: GameState): { name: string; todo: string; have: number; need: number; wantLabel: string | null } | null {
  const ch = currentChapter(state);
  if (!ch) return null;
  return { name: ch.name, todo: ch.todo, have: chapterHits(state), need: ch.need, wantLabel: ch.want ? WANT_LABEL[ch.want] : null };
}
