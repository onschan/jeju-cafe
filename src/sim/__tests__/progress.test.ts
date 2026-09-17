import { createInitialState } from '../state.ts';
import { nextUnlock, canUnlock, unlock, addResearchProgress, HAPPY_PER_RESEARCH } from '../progress.ts';
import { UNLOCKS } from '../../data/index.ts';

test('다음 해금이 보이고, 포인트가 모자라면 못 연다', () => {
  const s = createInitialState(1);
  expect(nextUnlock(s)?.ref).toBe('carrot_juice');
  expect(canUnlock(s).ok).toBe(false);
  s.research = 10;
  expect(canUnlock(s).ok).toBe(true);
  unlock(s);
  expect(s.research).toBe(0);
  expect(s.unlocked.menus).toContain('carrot_juice');
  expect(nextUnlock(s)?.ref).toBe('stonewall');
});

test('slot·role 종류 해금은 slots·unlocked.roles에 반영된다', () => {
  const s = createInitialState(1);
  s.research = 1_000_000;
  for (let i = 0; i < UNLOCKS.length; i++) unlock(s);
  expect(s.slots.hall).toBe(3); // 기본 2 + slot:hall 해금
  expect(s.slots.barista).toBe(2);
  expect(s.slots.field).toBe(2);
  expect(s.slots.cook).toBe(2);
  expect(s.unlocked.roles).toEqual(expect.arrayContaining(['carry']));
  expect(s.unlocked.roles).not.toContain('guide');
});

test('다 열면 null', () => {
  const s = createInitialState(1);
  s.research = 1_000_000;
  for (let i = 0; i < UNLOCKS.length + 5; i++) unlock(s);
  expect(nextUnlock(s)).toBeNull();
  expect(canUnlock(s).ok).toBe(false);
});

test('연구 진행: 만족 손님 5명 = 연구 1, 연구원 스킬(+50%)이면 더 빨리', () => {
  const s = createInitialState(1);
  for (let i = 0; i < HAPPY_PER_RESEARCH - 1; i++) expect(addResearchProgress(s, 1)).toBe(0);
  expect(s.research).toBe(0);
  expect(addResearchProgress(s, 1)).toBe(1);
  expect(s.research).toBe(1);
  expect(s.researchAcc).toBe(0);
  expect(addResearchProgress(s, 12)).toBe(2); // 나머지 2는 남는다
  expect(s.researchAcc).toBe(2);
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 1, strength: 1, skill: 1, smile: 1 }, skill: 'researcher', level: 1, salary: 0, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  expect(addResearchProgress(s, 2)).toBe(1); // 2 + 2×1.5 = 5
  expect(s.researchAcc).toBe(0);
});
