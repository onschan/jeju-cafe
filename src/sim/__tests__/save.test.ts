import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { serialize, deserialize, MemorySaveStore } from '../save.ts';
import { SAVE_VERSION } from '../state.ts';

test('직렬화 왕복이 같은 상태를 만든다', () => {
  const s = createInitialState(9);
  apply(s, { type: 'place', objectType: 'field', x: X(0), y: Y(0) });
  tick(s, 5000);
  const back = deserialize(serialize(s));
  expect(back).toEqual(s);
});

test('버전이 다르면 거부', () => {
  const s = createInitialState(9);
  const json = serialize(s).replace(`"version":${SAVE_VERSION}`, '"version":999');
  expect(() => deserialize(json)).toThrow(/version/);
});

test('SaveStore: save/load/list', async () => {
  const store = new MemorySaveStore();
  const s = createInitialState(9);
  await store.save(1, s);
  expect(await store.list()).toEqual([1]);
  expect(await store.load(1)).toEqual(s);
  expect(await store.load(2)).toBeNull();
});

test('list는 숫자 순', async () => {
  const store = new MemorySaveStore();
  const s = createInitialState(1);
  await store.save(10, s); await store.save(2, s); await store.save(1, s);
  expect(await store.list()).toEqual([1, 2, 10]);
});

test('null/문자열 세이브는 거부', () => {
  expect(() => deserialize('null')).toThrow();
  expect(() => deserialize('"x"')).toThrow();
});
