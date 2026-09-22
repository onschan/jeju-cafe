import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasIdToken } from '../../data/labels.ts';
import { INTRO_CUTS, SPEAKER_NAME } from '../../data/dialogue/index.ts';
import { introImageUrl } from '../IntroScreen';

/** intro: 프롤로그 6컷 자막(한 줄 ≤ 22자, 영문 id 없음, 화자는 초상이 있는 사람)과 그림 파일(cut1~6 + 간판 켜진 cut6_on) */
describe('프롤로그 컷신 데이터', () => {
  it('6컷, 한 줄 22자 이하, 영문 id 없음', () => {
    expect(INTRO_CUTS).toHaveLength(6);
    for (const c of INTRO_CUTS) {
      expect(c.lines.length).toBeGreaterThan(0);
      expect(c.lines.length).toBeLessThanOrEqual(3);
      for (const l of [c.caption, ...c.lines]) {
        expect(hasIdToken(l), l).toBe(false);
        expect(l.length, l).toBeLessThanOrEqual(22);
      }
      if (c.speaker) expect(SPEAKER_NAME[c.speaker]).toBeTruthy();
    }
    expect(INTRO_CUTS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('그림 파일이 public/assets/intro에 있다 (pnpm assets)', () => {
    const pub = resolve(__dirname, '../../../public');
    for (let i = 0; i < 6; i++) expect(existsSync(resolve(pub, introImageUrl(i).replace(/^\//, ''))), introImageUrl(i)).toBe(true);
    expect(introImageUrl(5, true)).toMatch(/cut6_on\.png$/);
    expect(introImageUrl(0, true)).toMatch(/cut1\.png$/);
    expect(existsSync(resolve(pub, introImageUrl(5, true).replace(/^\//, '')))).toBe(true);
  });
});
