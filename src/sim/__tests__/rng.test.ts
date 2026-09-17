import { nextRandom, randInt, pickWeighted } from '../rng';

test('같은 seed면 같은 수열', () => {
  const a = { rng: 42 };
  const b = { rng: 42 };
  const xs = [nextRandom(a), nextRandom(a), nextRandom(a)];
  const ys = [nextRandom(b), nextRandom(b), nextRandom(b)];
  expect(xs).toEqual(ys);
  expect(xs[0]).toBeGreaterThanOrEqual(0);
  expect(xs[0]).toBeLessThan(1);
});

test('randInt는 [min, max] 범위', () => {
  const s = { rng: 7 };
  for (let i = 0; i < 100; i++) {
    const v = randInt(s, 2, 5);
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThanOrEqual(5);
  }
});

test('pickWeighted는 가중치 0인 항목을 고르지 않는다', () => {
  const s = { rng: 1 };
  for (let i = 0; i < 50; i++) {
    expect(pickWeighted(s, [{ v: 'a', w: 0 }, { v: 'b', w: 1 }], (x) => x.w)?.v).toBe('b');
  }
});
