import { createInitialState } from '../state.ts';
import { nextUnlock, canUnlock, unlock } from '../progress.ts';

test('다음 해금이 보이고, 포인트가 모자라면 못 연다', () => {
  const s = createInitialState(1);
  expect(nextUnlock(s)?.ref).toBe('stonewall');
  expect(canUnlock(s).ok).toBe(false);
  s.research = 5;
  expect(canUnlock(s).ok).toBe(true);
  unlock(s);
  expect(s.research).toBe(0);
  expect(s.unlocked.objects).toContain('stonewall');
  expect(nextUnlock(s)?.ref).toBe('carrot_cake');
});

test('다 열면 null', () => {
  const s = createInitialState(1);
  s.research = 100;
  unlock(s);
  unlock(s);
  expect(nextUnlock(s)).toBeNull();
  expect(canUnlock(s).ok).toBe(false);
});
