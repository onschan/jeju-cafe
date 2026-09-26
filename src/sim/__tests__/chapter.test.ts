/** 막 (chapter): 한 판 = 다섯 막. 막을 넘는 조건은 「그 막의 손님이 자기 취향 자리에 앉은 수」다. */
import { describe, it, expect } from 'vitest';
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { CHAPTERS, CHAPTER_TICKETS, chapterProgress, currentChapter, chaptersCleared, allChaptersDone, noteChapterSeat, checkChapter, chapterLine, chapterBlocker } from '../chapter.ts';
import { seatFitsWant, seatFitsGuest, FIT_RADIUS } from '../wants.ts';
import { createInitialState } from '../state.ts';
import { botDay, newBotCursor } from '../bot.ts';
import { unlockGuestType } from '../segments.ts';
import type { GameState } from '../types.ts';

/** 이번 막에 제자리 손님 n명을 쌓는다 (이장님 = rest, 밭 삼춘 = farm, 렌터카 가족 = convenience, 인스타 여행러 = scenery) */
const TYPE_OF: Record<string, string> = { rest: 'village_head', farm: 'local_uncle', convenience: 'rentcar_family', scenery: 'insta_traveler' };
function seatMany(s: GameState, n: number): void {
  const ch = currentChapter(s)!;
  const type = ch.want ? TYPE_OF[ch.want]! : 'village_head';
  for (let i = 0; i < n; i++) noteChapterSeat(s, type, true);
}

describe('막 (chapter)', () => {
  it('새 게임은 1막부터 — 다섯 막이 모두 서로 다른 과제다', () => {
    const s = bareState(1);
    expect(chapterProgress(s).idx).toBe(0);
    expect(currentChapter(s)!.id).toBe('ch_rest');
    expect(CHAPTERS.length).toBe(5);
    expect(new Set(CHAPTERS.map((c) => c.want)).size).toBe(CHAPTERS.length); // 같은 손님층을 두 막이 쓰지 않는다
    expect(chapterLine(s)!.need).toBe(CHAPTERS[0]!.need);
  });

  it('취향과 안 맞는 자리에 앉은 것, 다른 손님층은 안 센다 — 이게 「배치가 과제」인 까닭이다', () => {
    const s = bareState(1);
    noteChapterSeat(s, 'village_head', false); // 이장님(rest)이 아무 자리에나
    expect(chapterProgress(s).hits ?? 0).toBe(0);
    noteChapterSeat(s, 'insta_traveler', true); // 경치 손님이 제자리에 — 1막 손님이 아니다
    expect(chapterProgress(s).hits ?? 0).toBe(0);
    noteChapterSeat(s, 'village_head', true);   // 이장님이 그늘 자리에
    expect(chapterProgress(s).hits).toBe(1);
    expect(s.stats.fitGuests).toBe(2); // 누적 제자리 손님은 손님층을 안 가린다 (목표 해금용)
  });

  it('수를 채우면 새 날에 넘어가고, 진행도는 0부터 다시', () => {
    const s = bareState(1);
    seatMany(s, CHAPTERS[0]!.need - 1);
    expect(checkChapter(s)).toBe(false);
    const tickets = s.tickets;
    seatMany(s, 1);
    expect(checkChapter(s)).toBe(true);
    expect(chapterProgress(s).idx).toBe(1);
    expect(chapterProgress(s).hits).toBe(0);
    expect(chaptersCleared(s)).toBe(1);
    expect(s.tickets).toBe(tickets + CHAPTER_TICKETS);
    expect(s.fx.some((f) => f.kind === 'scene')).toBe(true); // 막이 넘어가는 장면
  });

  it('5막은 손님층을 안 가린다 — 다 넘기면 막이 끝난다', () => {
    const s = bareState(1);
    for (let i = 0; i < 4; i++) { seatMany(s, CHAPTERS[i]!.need); expect(checkChapter(s)).toBe(true); }
    const last = currentChapter(s)!;
    expect(last.want).toBeNull();
    noteChapterSeat(s, 'insta_traveler', true); noteChapterSeat(s, 'local_uncle', true); // 아무 손님층이나
    expect(chapterProgress(s).hits).toBe(2);
    seatMany(s, last.need);
    expect(checkChapter(s)).toBe(true);
    expect(allChaptersDone(s)).toBe(true);
    expect(currentChapter(s)).toBeNull();
    expect(chapterLine(s)).toBeNull();
  });

  it('그 손님을 앉힐 자리가 아예 없으면 까닭을 말한다 — 조용한 절벽을 막는다', () => {
    const s = bareState(1);
    expect(chapterBlocker(s)).toBeNull(); // 자리가 하나도 없으면 그건 openBlocker의 몫
    placeObject(s, 'table_out', X(6), Y(6));
    expect(chapterBlocker(s)).toContain('그늘'); // 1막은 그늘 자리가 필요한데 맨 테이블뿐
    placeObject(s, 'table_parasol', X(3), Y(3));
    expect(chapterBlocker(s)).toBeNull();
  });

  it('손 한 번 안 대고 굴린 봇도 1막은 넘는다 — 손님이 알아서 오고 알아서 제자리에 앉는다 (카이로 방향)', () => {
    const s = createInitialState(7);
    const cur = newBotCursor();
    for (let d = 0; d < 6 * 30; d++) botDay(s, cur);
    expect(chapterProgress(s).idx).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('파라솔 테이블은 그 자리가 곧 그늘 자리다', () => {
    const s = bareState(1);
    const parasol = placeObject(s, 'table_parasol', X(4), Y(6))!;
    const plain = placeObject(s, 'table_out', X(7), Y(6))!;
    expect(seatFitsGuest(s, parasol, 'village_head')).toBe(true);  // 이장님 = rest
    expect(seatFitsGuest(s, plain, 'village_head')).toBe(false);   // 그늘이 없는 맨 테이블
  });

  it('귤밭·먹거리·즐길거리는 서로 다른 시설을 본다 — 막마다 배치 과제가 달라야 한다', () => {
    const s = bareState(1);
    unlockGuestType(s, 'local_uncle');
    const seat = placeObject(s, 'table_out', X(4), Y(4))!;
    expect(seatFitsWant(s, seat, 'farm')).toBe(false);
    placeObject(s, 'tangerine_tree', X(4) + FIT_RADIUS, Y(4));
    expect(seatFitsWant(s, seat, 'farm')).toBe(true);
  });
});
