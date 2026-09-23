import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { apply } from '../../sim/actions.ts';
import { tick } from '../../sim/tick.ts';
import { DAY_MS } from '../../sim/clock.ts';
import { bareState, at } from '../../sim/__tests__/helpers.ts';
import { CORNERS, cornerProgress } from '../../sim/corners.ts';
import { hasIdToken } from '../../data/labels.ts';
import { BUILD_TABS } from '../windows/BuildWindow.tsx';
import { cornerEffectText, cornerMissingText } from '../windows/CornerTab.tsx';
import { cornerBadge, rangeHintFor } from '../rangeHint.ts';
import { goalConditionText } from '../../sim/index.ts';

function place(s: ReturnType<typeof bareState>, type: string, x: number, y: number) {
  s.goals.index = 999; s.money = 1e9;
  expect(apply(s, { type: 'place', objectType: type, ...at(x, y) }).ok).toBe(true);
  for (let i = 0; i < 5; i++) tick(s, DAY_MS);
}

describe('명당 UI (fun-corner)', () => {
  it('짓기 창에 「명당」 탭이 있다', () => {
    expect(BUILD_TABS.find((t) => t.key === 'corner')?.label).toBe('명당');
  });
  it('문구 규칙: 명당 이름·대사·힌트·효과 한 줄·미완성 한 줄·고스트 배지·목표 조건에 영문 id가 없고, 손님 말풍선·힌트는 짧다', () => {
    const s = bareState(1);
    const texts: string[] = [];
    for (const c of CORNERS) texts.push(c.name, c.line, c.guestLine, c.hint);
    for (const p of cornerProgress(s)) texts.push(cornerEffectText(p), cornerMissingText(p));
    texts.push(goalConditionText({ type: 'corners', n: 3 }));
    texts.push(cornerBadge(s, 'flower_bed', at(0, 0).x, at(0, 0).y) ?? '', cornerBadge(s, 'table_out', at(0, 0).x, at(0, 0).y) ?? '');
    const bad = texts.filter((t) => hasIdToken(t));
    expect(bad, bad.slice(0, 5).join(' | ')).toEqual([]);
    for (const c of CORNERS) { expect(c.guestLine.length).toBeLessThanOrEqual(12); expect(c.name.length).toBeLessThanOrEqual(10); }
    for (const t of texts) expect(t).not.toMatch(/→|정석|시뮬/);
  });
  it('미완성 한 줄: "가로등 하나만 더" / 완성이면 "완성!"; 효과 한 줄에 요금·인기·손님층', () => {
    const s = bareState(1);
    place(s, 'flower_bed', 0, 0);
    place(s, 'deco_wood_bench', 1, 0);
    let p = cornerProgress(s).find((x) => x.def.id === 'corner_flower_path')!;
    expect(cornerMissingText(p)).toBe('가로등 하나만 더');
    expect(cornerEffectText(p)).toBe('요금 +5% · 인기 +5 · 여성 손님이 더 온다');
    place(s, 'streetlight', 0, 1);
    p = cornerProgress(s).find((x) => x.def.id === 'corner_flower_path')!;
    expect(cornerMissingText(p)).toContain('완성');
    const road = cornerProgress(s).find((x) => x.def.id === 'corner_stonewall_road')!;
    expect(cornerMissingText(road)).toBe('돌담 4개, 올렛길 하나 더');
  });
  it('고스트 배지: 마지막 조각 자리면 "이걸 놓으면 꽃길 완성", 조각이면 "꽃길 조각", 조각이 아니면 없음 — rangeHintFor에 실린다', () => {
    const s = bareState(1);
    place(s, 'flower_bed', 0, 0);
    place(s, 'deco_wood_bench', 1, 0);
    expect(cornerBadge(s, 'streetlight', at(2, 2).x, at(2, 2).y)).toBe('이걸 놓으면 꽃길 완성');
    expect(cornerBadge(s, 'streetlight', at(9, 6).x, at(9, 6).y)).toBe('꽃길 조각');
    expect(cornerBadge(s, 'gate', at(2, 2).x, at(2, 2).y)).toBeUndefined();
    expect(rangeHintFor(s, 'streetlight', at(2, 2).x, at(2, 2).y).badge).toBe('이걸 놓으면 꽃길 완성');
  });
});

/** 용어 회귀: 상위 개념어는 「명당」 하나다 (사용자 피드백 "어색하다" → 옛 이름 폐기, 영상 패치 문서 §3.3.1에서 「명당」 확정 —
 *  개념어 후보 중 「장소」라는 뜻이 바로 오고, 24종 중 하나인 「포토존」과 이름이 겹치지 않는다).
 *  폐기어가 src 어디에도 남으면 안 된다 — 문구·주석·데이터 모두. `grep -rn` 결과가 비어 있어야 하므로 이 테스트도 폐기어를 글자 코드로만 쓴다.
 *  예외는 EXCEPT에 적고 이유를 남긴다 — 지금은 명소 고유명사 「테마파크」(생성 데이터, 명당과 무관한 이름) 하나뿐이다. */
const OLD_WORDS = [String.fromCharCode(0xcf54, 0xb108), String.fromCharCode(0xd14c, 0xb9c8)];
const SRC_DIR = resolve(__dirname, '../..');
const EXCEPT: RegExp[] = [/\uD14C\uB9C8\uD30C\uD06C/]; // 명소 이름 「테마파크」 — 상위 개념어가 아니라 고유명사
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = resolve(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|json)$/.test(f) ? [p] : [];
  });
}
describe('용어 회귀: 폐기어 0건', () => {
  it('src 전체에 폐기어가 한 건도 없다', () => {
    const hits: string[] = [];
    for (const file of walk(SRC_DIR)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (OLD_WORDS.some((w) => line.includes(w)) && !EXCEPT.some((r) => r.test(line))) hits.push(`${file.slice(SRC_DIR.length + 1)}:${i + 1} ${line.trim().slice(0, 60)}`);
      });
    }
    expect(hits, hits.slice(0, 5).join('\n')).toEqual([]);
  });
  it('명당 이름·짓기 탭·목표 조건 문구가 「명당」을 쓴다', () => {
    expect(BUILD_TABS.find((t) => t.key === 'corner')?.label).toBe('명당');
    expect(goalConditionText({ type: 'corners', n: 3 })).toBe('명당 3개');
    expect(CORNERS.every((c) => OLD_WORDS.every((w) => !c.name.includes(w)))).toBe(true);
  });
});
