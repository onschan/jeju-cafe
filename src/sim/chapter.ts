/**
 * 막 (chapter, teardown §4 「한 판(5년)」 층): 5년을 **다섯 막**으로 나눈다.
 *
 * 왜 — 지금 한 판은 「돈이 남으니 뭐라도 놓는다」로 굴러간다. 3년차에 등급 3·★2에서 멈추고
 * 시설 46개가 열렸는데 24개는 한 번도 안 놓는다. **이번 판에 무엇을 하려는지**가 없기 때문이다.
 *
 * 막마다 「이번엔 이 손님을 잡는다」가 딱 하나 있다. 막을 넘으려면 **한 판의 러시에서**
 *   ① 그 막의 손님을 need명, **직접**(자동 착석 말고) **그 손님이 원하는 자리**에 앉히고
 *   ② 그 판에서 A 이상
 * 을 같이 해내야 한다. ①이 「실력이 조건」의 알맹이다 — 가만히 두면 자동 착석이 아무 자리에나
 * 앉히므로 ①은 절대 안 오른다(P0-4: 무조작 봇이 러시 해금 7개를 전부 열던 것을 막는다).
 *
 * 막 = 배치 과제이기도 하다. 1막은 그늘, 2막은 귤밭 곁, 3막은 문 앞, 4막은 전망 —
 * 마당을 네 번 다시 짜게 만든다. 5막은 손님층이 아니라 **S 한 판**이다(다시 찾아온 단골).
 *
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, RushState, RushGrade } from './types.ts';
import type { RushWant } from './rush.ts';
import { WANT_LABEL, GRADE_RANK } from './rush.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { addTickets } from './mileage.ts';

/** 막 하나. want가 null이면 손님층이 아니라 등급 자체가 과제다 (5막). */
export interface ChapterDef {
  id: string;
  /** 「1막 · 조용히 쉬러 온 사람」 */
  name: string;
  /** 이번 막이 잡는 손님이 보는 것. null = 손님층 과제 없음 */
  want: RushWant | null;
  /** 러시 한 판에서 직접·제자리에 앉혀야 하는 수 */
  need: number;
  /** 같은 판에서 받아야 하는 최소 등급 */
  grade: RushGrade;
  /** 무엇을 해야 하는지 한 줄 — 마당에서 할 일로 읽히게 */
  todo: string;
  /** 막을 넘었을 때 한 줄 */
  done: string;
}

export const CHAPTERS: ChapterDef[] = [
  { id: 'ch_rest', name: '1막 · 조용히 쉬러 온 사람', want: 'rest', need: 2, grade: 'A',
    todo: '그늘지고 조용한 자리를 만들어요 — 파라솔이나 나무 곁', done: '쉬러 온 사람들이 여기를 기억했어요' },
  { id: 'ch_farm', name: '2막 · 귤밭을 보러 온 사람', want: 'farm', need: 3, grade: 'A',
    todo: '감귤나무나 당근밭 곁에 자리를 놓아요', done: '귤밭 곁 자리가 소문났어요' },
  { id: 'ch_convenience', name: '3막 · 차를 몰고 온 사람', want: 'convenience', need: 3, grade: 'A',
    todo: '문에서 가까운 자리를 늘려요', done: '차를 세우고 바로 앉는 카페가 됐어요' },
  { id: 'ch_scenery', name: '4막 · 바다를 보러 온 사람', want: 'scenery', need: 4, grade: 'A',
    todo: '바다·오름이 보이는 자리를 만들어요 (전망 2 이상)', done: '전망 자리를 보러 사람들이 와요' },
  { id: 'ch_regular', name: '5막 · 다시 찾아온 단골', want: null, need: 0, grade: 'S',
    todo: '러시에서 S를 한 번 받아요', done: '이 카페는 이제 단골들의 자리예요' },
];

/** 막을 넘을 때마다 주는 응모권 */
export const CHAPTER_TICKETS = 3;

export interface ChapterProgress { idx: number }

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

/** 이번 막이 세는 손님인가 — 러시에서 한 명 앉힐 때마다 rush.ts가 묻는다.
 *  직접 앉혔고(manual), 그 손님이 원하는 자리(fit)이고, 이번 막의 손님층일 때만 센다. */
export function countsForChapter(state: GameState, want: RushWant, manual: boolean, fit: boolean): boolean {
  const ch = currentChapter(state);
  return !!ch && ch.want !== null && manual && fit && ch.want === want;
}

/** 러시 정산: 이번 판으로 막을 넘었나. 넘었으면 idx++ 하고 true. */
export function checkChapter(state: GameState, r: RushState, grade: RushGrade): boolean {
  const ch = currentChapter(state);
  if (!ch) return false;
  if (GRADE_RANK[grade] < GRADE_RANK[ch.grade]) return false;
  if (ch.want !== null && (r.chapterHits ?? 0) < ch.need) return false;
  chapterProgress(state).idx++;
  addTickets(state, CHAPTER_TICKETS, ch.name);
  pushNotice(state, `${ch.name} 끝 — ${ch.done}`);
  const next = currentChapter(state);
  pushFx(state, { kind: 'scene', title: ch.name, text: next ? `${ch.done}\n다음은 「${next.name}」 — ${next.todo}` : `${ch.done}\n다섯 막을 다 지났어요.`, tick: state.tick });
  return true;
}

/** 「이번 막」 한 줄 (HUD·할 일). 다 끝냈으면 null.
 *  진행 수는 **러시가 도는 동안만** 센다 — 끝난 판의 2/2가 그대로 걸려 있으면 「다 했는데 왜 안 넘어가지」가 된다
 *  (지난 판이 어땠는지는 결과 카드가 말한다). */
export function chapterLine(state: GameState): { name: string; todo: string; have: number; need: number; grade: RushGrade } | null {
  const ch = currentChapter(state);
  if (!ch) return null;
  const running = state.rush?.phase === 'run';
  return { name: ch.name, todo: ch.todo, have: running ? state.rush?.chapterHits ?? 0 : 0, need: ch.need, grade: ch.grade };
}

/** 러시 결과 카드의 막 한 줄 — 넘었으면 「막 끝」, 아니면 무엇이 모자랐나 */
export function chapterResultLine(state: GameState, r: RushState, grade: RushGrade, cleared: boolean): string | null {
  const ch = cleared ? CHAPTERS[chapterProgress(state).idx - 1] : currentChapter(state);
  if (!ch) return null;
  if (cleared) return `${ch.name} 끝 — ${ch.done}`;
  const hits = r.chapterHits ?? 0;
  if (ch.want === null) return `${ch.name} — ${ch.grade}가 필요해요 (이번 판 ${grade})`;
  if (hits < ch.need) return `${ch.name} — ${WANT_LABEL[ch.want]}을 보는 손님을 제자리에 ${hits}/${ch.need}명`;
  return `${ch.name} — ${ch.grade} 이상이 필요해요 (이번 판 ${grade})`;
}
