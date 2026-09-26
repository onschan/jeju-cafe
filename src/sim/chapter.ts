/**
 * 막 (chapter, teardown §4 「한 판(5년)」 층): 5년을 **다섯 막**으로 나눈다.
 *
 * 왜 — 지금 한 판은 「돈이 남으니 뭐라도 놓는다」로 굴러간다. 3년차에 등급 3·★2에서 멈추고
 * 시설 46개가 열렸는데 24개는 한 번도 안 놓는다. **이번 판에 무엇을 하려는지**가 없기 때문이다.
 *
 * 막마다 「이번엔 이 손님을 잡는다」가 딱 하나 있다. 막을 넘으려면 **여러 판에 걸쳐**
 *   ① 그 막의 손님을 누적 need명, **직접**(자동 착석 말고) **그 손님이 원하는 자리**에 앉히고
 *   ② 그 막 동안 A 이상을 grades판
 * 을 둘 다 채워야 한다. ①이 「실력이 조건」의 알맹이다 — 가만히 두면 자동 착석이 아무 자리에나
 * 앉히므로 ①은 절대 안 오른다(P0-4: 무조작 봇이 러시 해금 7개를 전부 열던 것을 막는다).
 *
 * 한 판짜리 조건이었을 때는 러시를 손으로 하는 봇이 **다섯 막을 6주에** 다 넘겼다
 * (scripts/chapters.ts 실측). 누적으로 바꾸고 이번 막의 손님이 줄에 더 서게 해서(RUSH_CHAPTER_WEIGHT)
 * 막 하나가 한 철짜리 과제가 되게 했다.
 *
 * 막 = 배치 과제이기도 하다. 1막은 그늘, 2막은 귤밭 곁, 3막은 문 앞, 4막은 전망 —
 * 마당을 네 번 다시 짜게 만든다. 5막은 손님층이 아니라 **S 한 판**이다(다시 찾아온 단골).
 *
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, RushState, RushGrade } from './types.ts';
import type { RushWant } from './rush.ts';
import { WANT_LABEL, GRADE_RANK } from './rush.ts';
import { objectDef } from '../data/index.ts';
import { seatFitsWant } from './rush.ts';
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
  /** 여러 판에 걸쳐 직접·제자리에 앉혀야 하는 누적 수 */
  need: number;
  /** 그 막 동안 받아야 하는 최소 등급 */
  grade: RushGrade;
  /** 그 등급 이상을 받아야 하는 판 수 */
  grades: number;
  /** 무엇을 해야 하는지 한 줄 — 마당에서 할 일로 읽히게 */
  todo: string;
  /** 막을 넘었을 때 한 줄 */
  done: string;
}

export const CHAPTERS: ChapterDef[] = [
  { id: 'ch_rest', name: '1막 · 조용히 쉬러 온 사람', want: 'rest', need: 50, grade: 'A', grades: 2,
    todo: '그늘지고 조용한 자리를 만들어요 — 파라솔이나 나무 곁', done: '쉬러 온 사람들이 여기를 기억했어요' },
  { id: 'ch_farm', name: '2막 · 귤밭을 보러 온 사람', want: 'farm', need: 100, grade: 'A', grades: 5,
    todo: '감귤나무나 당근밭 곁에 자리를 놓아요', done: '귤밭 곁 자리가 소문났어요' },
  { id: 'ch_convenience', name: '3막 · 차를 몰고 온 사람', want: 'convenience', need: 175, grade: 'A', grades: 10,
    todo: '문에서 가까운 자리를 늘려요', done: '차를 세우고 바로 앉는 카페가 됐어요' },
  { id: 'ch_scenery', name: '4막 · 바다를 보러 온 사람', want: 'scenery', need: 275, grade: 'A', grades: 15,
    todo: '벚나무 같은 큰 경관을 자리 곁에 모아요 — 전망 2 이상', done: '전망 자리를 보러 사람들이 와요' },
  // 5막엔 잡을 손님층이 없다 — 이제 온갖 손님이 온다. 한 층에 맞춘 마당은 여기서 밑천이 드러난다
  // (실측: 4막이 끝나 전망에만 맞춘 마당이 되면 그 뒤 240판 내내 S가 한 번도 안 나왔다).
  // 그래서 문턱을 S가 아니라 「꾸준히 A」로 뒀다 — 한 철 넘게 어느 손님이 와도 제자리에 앉혀야 찬다.
  { id: 'ch_regular', name: '5막 · 다시 찾아온 단골', want: null, need: 0, grade: 'A', grades: 20,
    todo: '이제 온갖 손님이 와요 — 그늘·귤밭·문 앞·전망을 고루 갖춰 스무 판을 A로', done: '이 카페는 이제 단골들의 자리예요' },
];


/** 막을 넘을 때마다 주는 응모권 */
export const CHAPTER_TICKETS = 3;

/** 지금 막과 그 막에서 쌓은 것 (막이 넘어가면 0부터 다시) */
export interface ChapterProgress { idx: number; hits?: number; grades?: number }

export function chapterProgress(state: GameState): ChapterProgress {
  return (state.chapter ??= { idx: 0 });
}
/** 이번 막에서 지금까지 제자리에 앉힌 수 */
export function chapterHits(state: GameState): number {
  return chapterProgress(state).hits ?? 0;
}
/** 이번 막에서 지금까지 받은 「A 이상」 판 수 */
export function chapterGrades(state: GameState): number {
  return chapterProgress(state).grades ?? 0;
}
/** 러시에서 한 명 앉힐 때마다 rush.ts가 더한다 */
export function addChapterHit(state: GameState): void {
  const p = chapterProgress(state);
  p.hits = (p.hits ?? 0) + 1;
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

/** 러시 정산: 이번 판까지 쳐서 막을 넘었나. 넘었으면 idx++ 하고 진행도를 0으로. */
export function checkChapter(state: GameState, _r: RushState, grade: RushGrade): boolean {
  const ch = currentChapter(state);
  if (!ch) return false;
  const p = chapterProgress(state);
  if (GRADE_RANK[grade] >= GRADE_RANK[ch.grade]) p.grades = (p.grades ?? 0) + 1;
  if ((p.grades ?? 0) < ch.grades) return false;
  if (ch.want !== null && (p.hits ?? 0) < ch.need) return false;
  p.idx++;
  p.hits = 0;
  p.grades = 0;
  addTickets(state, CHAPTER_TICKETS, ch.name);
  pushNotice(state, `${ch.name} 끝 — ${ch.done}`);
  const next = currentChapter(state);
  pushFx(state, { kind: 'scene', title: ch.name, text: next ? `${ch.done}\n다음은 「${next.name}」 — ${next.todo}` : `${ch.done}\n다섯 막을 다 지났어요.`, tick: state.tick });
  return true;
}

/** 이번 막이 **막혀 있나** — 지금 마당에 그 손님을 앉힐 자리가 하나도 없으면 그 까닭 한 줄.
 *
 *  이게 없으면 막이 조용한 절벽이 된다: 실측(scripts/chapters.ts)에서 전망 자리가 없는 마당이
 *  A를 187판 받고도 4막 진행이 0/275였다. 숫자만 안 오르고 왜인지는 아무 데도 안 나온다.
 *  「등급이 모자라다」와 「그 자리가 아예 없다」는 완전히 다른 문제라 따로 말해야 한다. */
export function chapterBlocker(state: GameState): string | null {
  const ch = currentChapter(state);
  if (!ch || ch.want === null) return null;
  const seats = Object.values(state.objects).filter((o) => !o.build && objectDef(o.type).kind === 'seat');
  if (seats.length === 0) return null; // 자리부터 놓으라는 말은 openBlocker가 한다
  if (seats.some((seat) => seatFitsWant(state, seat, ch.want!))) return null;
  return CHAPTER_HINT[ch.want];
}
/** 막이 막혔을 때 무엇을 지으라는지 — 「경관 시설」 같은 뭉뚱그린 말 대신 놓을 것을 집어 준다 */
const CHAPTER_HINT: Record<RushWant, string> = {
  rest: '그늘진 자리가 없어요 — 파라솔 테이블이나 나무 곁으로',
  farm: '귤밭 곁 자리가 없어요 — 감귤나무·당근밭을 자리 3칸 안에',
  convenience: '문 앞 자리가 없어요 — 본관 가까이에 자리를 놓아요',
  scenery: '전망 2 이상인 자리가 없어요 — 벚나무를 자리 곁에 모아요 (꽃밭은 전망에 안 잡혀요)',
  food: '먹거리 시설 곁 자리가 없어요',
  fun: '즐길거리 곁 자리가 없어요',
};

/** 「이번 막」 한 줄 (HUD·할 일). 다 끝냈으면 null.
 *  진행 수는 **러시가 도는 동안만** 센다 — 끝난 판의 2/2가 그대로 걸려 있으면 「다 했는데 왜 안 넘어가지」가 된다
 *  (지난 판이 어땠는지는 결과 카드가 말한다). */
export function chapterLine(state: GameState): { name: string; todo: string; have: number; need: number; grade: RushGrade; gradesHave: number; gradesNeed: number } | null {
  const ch = currentChapter(state);
  if (!ch) return null;
  return { name: ch.name, todo: ch.todo, have: chapterHits(state), need: ch.need, grade: ch.grade, gradesHave: chapterGrades(state), gradesNeed: ch.grades };
}

/** 러시 결과 카드의 막 한 줄 — 넘었으면 「막 끝」, 아니면 무엇이 모자랐나 */
export function chapterResultLine(state: GameState, r: RushState, grade: RushGrade, cleared: boolean): string | null {
  const ch = cleared ? CHAPTERS[chapterProgress(state).idx - 1] : currentChapter(state);
  if (!ch) return null;
  if (cleared) return `${ch.name} 끝 — ${ch.done}`;
  const hits = chapterHits(state);
  const gs = chapterGrades(state);
  const gradeLine = `${ch.grade} 이상 ${gs}/${ch.grades}판`;
  if (ch.want === null) return `${ch.name} — ${gradeLine} (이번 판 ${grade})`;
  const stuck = chapterBlocker(state);
  if (stuck) return `${ch.name} — ${stuck}`;
  const seatLine = `${WANT_LABEL[ch.want]}을 보는 손님 제자리에 ${hits}/${ch.need}명`;
  return `${ch.name} — ${seatLine} · ${gradeLine}`;
}
