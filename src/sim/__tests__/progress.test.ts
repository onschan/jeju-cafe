import { createInitialState } from '../state.ts';
import { nextUnlock, canUnlock, unlock } from '../progress.ts';
import { UNLOCKS } from '../../data/index.ts';

test('다음 해금이 보이고, 포인트가 모자라면 못 연다', () => {
  const s = createInitialState(1);
  expect(nextUnlock(s)?.ref).toBe('carrot_juice');
  expect(canUnlock(s).ok).toBe(false);
  s.research = 5;
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
