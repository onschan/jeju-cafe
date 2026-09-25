/** 막 (chapter): 한 판 = 다섯 막. 막을 넘는 조건은 「직접·제자리에 n명 + 그 판 등급」이다. */
import { describe, it, expect } from 'vitest';
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import {
  CHAPTERS, CHAPTER_TICKETS, chapterProgress, currentChapter, chaptersCleared, allChaptersDone,
  countsForChapter, checkChapter, chapterLine, chapterBlocker, chapterResultLine,
} from '../chapter.ts';
import { rushState, rushSeatFits, rushGrades, rushExpectedScore, chapterBoost, RUSH_FIT_RADIUS, RUSH_CHAPTER_WEIGHT_MAX } from '../rush.ts';
import { createInitialState } from '../state.ts';
import { botDay, newBotCursor } from '../bot.ts';
import { unlockGuestType } from '../segments.ts';
import type { GameState, RushState } from '../types.ts';

/** 이번 막에 누적 hits명을 쌓아 둔 상태 (막 진행은 이제 판별이 아니라 누적이다) */
function rushWith(s: GameState, hits: number): RushState {
  const r = rushState(s);
  r.chapterHits = hits;
  chapterProgress(s).hits = hits;
  return r;
}
/** 그 막의 등급 조건을 다 채우도록 여러 판을 친다 */
function clearChapter(s: GameState, idx: number): boolean {
  const ch = CHAPTERS[idx]!;
  rushWith(s, ch.need);
  let ok = false;
  for (let i = 0; i < ch.grades; i++) ok = checkChapter(s, rushState(s), ch.grade);
  return ok;
}

describe('막 (chapter)', () => {
  it('새 게임은 1막부터 — 다섯 막이 모두 서로 다른 과제다', () => {
    const s = bareState(1);
    expect(chapterProgress(s).idx).toBe(0);
    expect(currentChapter(s)!.id).toBe('ch_rest');
    expect(CHAPTERS.length).toBe(5);
    expect(new Set(CHAPTERS.map((c) => c.want)).size).toBe(CHAPTERS.length); // 같은 손님층을 두 막이 쓰지 않는다
    expect(chapterLine(s)!.need).toBe(CHAPTERS[0]!.need);
    expect(chapterLine(s)!.gradesNeed).toBe(CHAPTERS[0]!.grades);
  });

  it('자동 착석·엉뚱한 자리는 막 진행으로 안 센다 — 이게 「실력이 조건」의 알맹이다', () => {
    const s = bareState(1);
    expect(countsForChapter(s, 'rest', true, true)).toBe(true);
    expect(countsForChapter(s, 'rest', false, true)).toBe(false); // 자동 착석
    expect(countsForChapter(s, 'rest', true, false)).toBe(false); // 취향과 안 맞는 자리
    expect(countsForChapter(s, 'scenery', true, true)).toBe(false); // 이번 막의 손님이 아니다
  });

  it('등급만 좋아도, 수만 채워도 못 넘는다 — 둘 다 채워야 한다', () => {
    const s = bareState(1);
    const ch = CHAPTERS[0]!;
    // ① 등급은 넘치게 받아도 수가 모자라면 안 넘어간다
    for (let i = 0; i < ch.grades + 2; i++) expect(checkChapter(s, rushWith(s, ch.need - 1), 'A')).toBe(false);
    expect(chapterProgress(s).idx).toBe(0);
    // ② 수를 다 채워도 등급 판수가 모자라면 안 넘어간다 (새 판에서)
    const t = bareState(1);
    rushWith(t, ch.need);
    for (let i = 0; i < ch.grades + 2; i++) expect(checkChapter(t, rushState(t), 'B')).toBe(false);
    expect(chapterProgress(t).idx).toBe(0);
    // ③ 둘 다 채우면 넘어간다
    const u = bareState(1);
    const tickets = u.tickets;
    expect(clearChapter(u, 0)).toBe(true);
    expect(chapterProgress(u).idx).toBe(1);
    expect(chapterProgress(u).hits).toBe(0); // 막이 넘어가면 진행도는 0부터
    expect(chaptersCleared(u)).toBe(1);
    expect(u.tickets).toBe(tickets + CHAPTER_TICKETS);
    expect(u.fx.some((f) => f.kind === 'scene')).toBe(true); // 막이 넘어가는 장면
  });

  it('5막은 손님층이 아니라 S — 다 넘기면 막이 끝난다', () => {
    const s = bareState(1);
    for (let i = 0; i < 4; i++) expect(clearChapter(s, i)).toBe(true);
    const last = currentChapter(s)!;
    expect(last.want).toBeNull();
    for (let i = 0; i < last.grades; i++) expect(checkChapter(s, rushState(s), 'A')).toBe(false); // A로는 안 쌓인다
    expect(clearChapter(s, 4)).toBe(true);
    expect(allChaptersDone(s)).toBe(true);
    expect(currentChapter(s)).toBeNull();
    expect(chapterLine(s)).toBeNull();
  });

  it('결과 카드 한 줄: 못 넘었으면 무엇이 모자랐나, 넘었으면 그 막의 끝말', () => {
    const s = bareState(1);
    placeObject(s, 'table_parasol', X(3), Y(3)); // 그늘 자리가 있어야 「자리가 아예 없다」가 아니다
    const r = rushWith(s, 1);
    expect(chapterResultLine(s, r, 'A', false)).toContain(`1/${CHAPTERS[0]!.need}`);
    clearChapter(s, 0);
    expect(chapterResultLine(s, rushState(s), 'A', true)).toContain(CHAPTERS[0]!.done);
  });

  it('그 손님을 앉힐 자리가 아예 없으면 숫자 대신 까닭을 말한다 — 조용한 절벽을 막는다', () => {
    const s = bareState(1);
    expect(chapterBlocker(s)).toBeNull(); // 자리가 하나도 없으면 그건 openBlocker의 몫
    const plain = placeObject(s, 'table_out', X(6), Y(6))!;
    expect(chapterBlocker(s)).toContain('그늘'); // 1막은 그늘 자리가 필요한데 맨 테이블뿐
    expect(chapterResultLine(s, rushState(s), 'A', false)).toContain('그늘');
    placeObject(s, 'table_parasol', X(3), Y(3));
    expect(chapterBlocker(s)).toBeNull();
    void plain;
  });

  it('손 한 번 안 댄 봇은 반 년을 굴려도 1막을 못 넘는다 — 해금이 저절로 열리던 것(P0-4)의 반대', () => {
    const s = createInitialState(7);
    const cur = newBotCursor();
    for (let d = 0; d < 6 * 30; d++) botDay(s, cur);
    const g = rushGrades(s);
    expect(g.S + g.A + g.B + g.C).toBeGreaterThan(5); // 러시는 여러 판 돌았고
    expect(chapterProgress(s).idx).toBe(0);                        // 그런데 막은 그대로다
  }, 30_000);

  it('파라솔 테이블은 그 자리가 곧 그늘 자리다 — 1막이 「깔아 놓고도 못 넘는」 막이 되지 않게', () => {
    const s = bareState(1);
    const parasol = placeObject(s, 'table_parasol', X(4), Y(6))!;
    const plain = placeObject(s, 'table_out', X(7), Y(6))!;
    expect(rushSeatFits(s, parasol, 'village_head')).toBe(true);  // 이장님 = rest
    expect(rushSeatFits(s, plain, 'village_head')).toBe(false);   // 그늘이 없는 맨 테이블
  });

  it('막 손님 가중치는 드문 손님만 끌어올린다 — 흔한 손님을 더 흔하게 만들면 러시가 가난해진다', () => {
    const s = bareState(1);
    unlockGuestType(s, 'local_uncle'); // 밭 삼춘 = farm (시작 해금은 rest 3종뿐이다)
    // rest는 해금된 손님의 절반이 넘는다 → 그대로 (실측: 6배로 올렸더니 러시가 지갑 얇은 동네 손님으로 도배돼 봇이 파산했다)
    expect(chapterBoost(s, 'rest')).toBe(1);
    // farm은 드물다 → 끌어올린다
    expect(chapterBoost(s, 'farm')).toBeGreaterThan(1);
    expect(chapterBoost(s, 'farm')).toBeLessThanOrEqual(RUSH_CHAPTER_WEIGHT_MAX);
    expect(chapterBoost(s, null)).toBe(1); // 5막은 손님층이 없다
  });

  it('등급은 받은 손님 기준이라 카페를 키워도 눈금이 안 바뀐다', () => {
    const s = bareState(1);
    const big = bareState(1);
    for (let i = 0; i < 8; i++) placeObject(big, 'table_out', X(1 + (i % 4) * 2), Y(1 + Math.floor(i / 4) * 2));
    // 받은 손님이 같으면 작은 카페든 큰 카페든 기준이 같다 (예전엔 좌석 수로 커져 「키울수록 등급이 떨어졌다」)
    expect(rushExpectedScore(big, 30, 12)).toBe(rushExpectedScore(s, 30, 12));
  });

  it('귤밭·먹거리·즐길거리는 서로 다른 시설을 본다 — 막마다 배치 과제가 달라야 한다', () => {
    const s = bareState(1);
    const seat = placeObject(s, 'table_out', X(4), Y(4))!;
    // 감귤나무를 곁에 놓기 전에는 「귤밭 자리」가 아니다
    expect(rushSeatFits(s, seat, 'local_uncle')).toBe(false); // 밭 삼춘 = farm
    placeObject(s, 'tangerine_tree', X(4) + RUSH_FIT_RADIUS, Y(4));
    expect(rushSeatFits(s, seat, 'local_uncle')).toBe(true);
  });
});
