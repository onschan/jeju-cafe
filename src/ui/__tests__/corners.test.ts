import { describe, it, expect } from 'vitest';
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

describe('코너 UI (fun-corner)', () => {
  it('짓기 창에 「코너」 탭이 있다', () => {
    expect(BUILD_TABS.find((t) => t.key === 'corner')?.label).toBe('코너');
  });
  it('문구 규칙: 코너 이름·대사·힌트·효과 한 줄·미완성 한 줄·고스트 배지·목표 조건에 영문 id가 없고, 손님 말풍선·힌트는 짧다', () => {
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
