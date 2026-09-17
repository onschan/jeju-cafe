import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { serialize, deserialize, MemorySaveStore } from '../save.ts';

test('직렬화 왕복이 같은 상태를 만든다', () => {
  const s = createInitialState(9);
  apply(s, { type: 'place', objectType: 'field', x: 0, y: 0 });
  tick(s, 5000);
  const back = deserialize(serialize(s));
  expect(back).toEqual(s);
});

test('버전이 다르면 거부', () => {
  const s = createInitialState(9);
  const json = serialize(s).replace('"version":1', '"version":999');
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
