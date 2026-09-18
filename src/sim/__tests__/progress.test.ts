import { bareState } from './helpers.ts';
import { addResearchProgress, HAPPY_PER_RESEARCH, TASTE_MATCH_WEIGHT } from '../progress.ts';

test('연구 진행: 만족 손님 5명 = 연구 1, 연구원 스킬(+50%)이면 더 빨리', () => {
  const s = bareState(1);
  for (let i = 0; i < HAPPY_PER_RESEARCH - 1; i++) expect(addResearchProgress(s, 1)).toBe(0);
  expect(s.research).toBe(0);
  expect(addResearchProgress(s, 1)).toBe(1);
  expect(s.research).toBe(1);
  expect(s.researchAcc).toBe(0);
  expect(addResearchProgress(s, 12)).toBe(2); // 나머지 2는 남는다
  expect(s.researchAcc).toBe(2);
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 1, strength: 1, skill: 1, smile: 1 }, skill: 'researcher', level: 1, salary: 0, poolId: '', statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 }, extraSkills: [], maxLevel: 10, baseSalary: 0, exp: 0, trainingCount: 0, training: null, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  expect(addResearchProgress(s, 2)).toBe(1); // 2 + 2×1.5 = 5
  expect(s.researchAcc).toBe(0);
});

test('연구 진행: 0이나 취향 맞은 손님 몫(2)도 같은 규칙으로 누적된다', () => {
  const s = bareState(1);
  expect(addResearchProgress(s, 0)).toBe(0);
  expect(s.research).toBe(0);
  expect(s.researchAcc).toBe(0);
  expect(addResearchProgress(s, TASTE_MATCH_WEIGHT)).toBe(0);
  expect(addResearchProgress(s, TASTE_MATCH_WEIGHT)).toBe(0);
  expect(addResearchProgress(s, TASTE_MATCH_WEIGHT)).toBe(1); // 2+2+2 = 6 → 연구 1, 누적 1
  expect(s.research).toBe(1);
  expect(s.researchAcc).toBe(1);
});

test('연구 진행: 한 번에 크게 쌓이면 여러 점을 한꺼번에 얻고, 나머지가 정확히 남는다', () => {
  const s = bareState(1);
  expect(addResearchProgress(s, HAPPY_PER_RESEARCH * 7 + 3)).toBe(7);
  expect(s.research).toBe(7);
  expect(s.researchAcc).toBe(3);
});
