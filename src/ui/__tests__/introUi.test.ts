import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasIdToken } from '../../data/labels.ts';
import { INTRO_CUTS, SPEAKER_NAME } from '../../data/dialogue/index.ts';
import { introImageUrl, shownCount, typedDoneOf } from '../IntroScreen';

/** intro: 프롤로그 11컷 자막(한 줄 ≤ 22자, 영문 id 없음, 화자는 초상이 있는 사람)과 그림 파일(cut1~11 + 간판 켜진 cut11_on) */
const CUT_N = 11;
describe('프롤로그 컷신 데이터', () => {
  it('11컷, 한 줄 22자 이하, 영문 id 없음', () => {
    expect(INTRO_CUTS).toHaveLength(CUT_N);
    for (const c of INTRO_CUTS) {
      expect(c.lines.length).toBeGreaterThan(0);
      expect(c.lines.length).toBeLessThanOrEqual(3);
      for (const l of [c.caption, ...c.lines]) {
        expect(hasIdToken(l), l).toBe(false);
        expect(l.length, l).toBeLessThanOrEqual(22);
      }
      if (c.speaker) expect(SPEAKER_NAME[c.speaker]).toBeTruthy();
    }
    expect(INTRO_CUTS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('사직서 앞에 지친 과정·제주를 떠올린 이유·결심이 먼저 온다', () => {
    const at = (n: number) => INTRO_CUTS[n - 1]!;
    expect(at(8).caption).toBe('사직서');                       // 사직서는 8컷 — 갑자기 내지 않는다
    expect(at(6).caption).toContain('제주');                    // 6컷: 작년 제주 여행 (회상)
    expect(at(7).lines.join(' ')).toContain('주인');            // 7컷: 카페 주인이 되겠다는 결심
    expect(at(10).speaker).toBe('halmang');
    expect(at(10).lines.join(' ')).toContain('귤밭'); // 카이로 방향: 무대는 폐창고가 아니라 제주 귤밭·경관이다
  });

  it('컷이 바뀐 직후엔 보이는 글자가 0 — 다음 자막이 완성된 채 한 프레임 번쩍이지 않는다', () => {
    const full = { cut: 3, n: 40, done: true }; // 4컷 자막을 다 찍은 상태
    expect(shownCount(full, 3)).toBe(40);
    expect(typedDoneOf(full, 3)).toBe(true);
    // 5컷으로 넘어간 첫 렌더 — 타자 리셋(effect)은 아직 안 돌았다
    expect(shownCount(full, 4)).toBe(0);
    expect(typedDoneOf(full, 4)).toBe(false);
    // 새 컷의 타자가 돌기 시작하면 그 컷 값으로 따라온다
    expect(shownCount({ cut: 4, n: 1, done: false }, 4)).toBe(1);
    // 탭해서 즉시 전부 보이기
    expect(shownCount({ cut: 4, n: 22, done: true }, 4)).toBe(22);
    expect(typedDoneOf({ cut: 4, n: 22, done: true }, 4)).toBe(true);
  });

  it('그림 파일이 public/assets/intro에 있다 (pnpm assets)', () => {
    const pub = resolve(__dirname, '../../../public');
    for (let i = 0; i < CUT_N; i++) expect(existsSync(resolve(pub, introImageUrl(i).replace(/^\//, ''))), introImageUrl(i)).toBe(true);
    expect(introImageUrl(CUT_N - 1, true)).toMatch(/cut11_on\.png$/);
    expect(introImageUrl(0, true)).toMatch(/cut1\.png$/);
    expect(existsSync(resolve(pub, introImageUrl(CUT_N - 1, true).replace(/^\//, '')))).toBe(true);
  });
});
