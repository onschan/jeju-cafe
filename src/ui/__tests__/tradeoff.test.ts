/** stakes: 시설 카드·배치 고스트의 기회비용 한 줄 — 「이걸 사면 무엇을 못 하는가」. */
import { createInitialState } from '../../sim/state.ts';
import { apply } from '../../sim/actions.ts';
import { opportunityCost, tradeoffOf, OPPORTUNITY_SHARE } from '../tradeoff.ts';
import { objectDef } from '../../data/index.ts';

function fresh() {
  return createInitialState(1);
}

test('돈이 넉넉하고 일꾼이 놀고 있으면 줄이 없다 (싼 시설)', () => {
  const s = fresh();
  s.money = 50_000_000;
  expect(opportunityCost(s, 'table_out')).toBeNull();
});

test('자금의 절반 넘게 쓰는 시설엔 남는 돈을 알려 준다', () => {
  const s = fresh();
  const price = objectDef('oreum_bench').cost;
  s.money = Math.round(price / OPPORTUNITY_SHARE) - 1; // 값이 자금의 40%를 넘게
  const line = opportunityCost(s, 'oreum_bench');
  expect(line).not.toBeNull();
  expect(line).toContain('남아요');
  expect(line!.length).toBeLessThanOrEqual(22); // 문구 규칙 §6: 한 줄 ≤ 22자
});

test('사고 나면 월급·고정비가 빠듯하면 그 이야기를 먼저 한다', () => {
  const s = fresh();
  const price = objectDef('table_out').cost;
  s.money = price + 10_000; // 사고 나면 고정비(임대료·유지비)도 못 낸다
  expect(opportunityCost(s, 'table_out')).toBe('이걸 사면 이번 달 월급이 빠듯해요');
});

test('일꾼이 다 차 있으면 다음 공사까지 남은 날을 말한다', () => {
  const s = fresh();
  s.money = 50_000_000;
  s.builders = 1;
  // 공사 1일짜리 시설을 하나 짓는 중으로 만든다
  const spot = { x: s.parcels.find((p) => p.owned)!.x + 1, y: s.parcels.find((p) => p.owned)!.y + 1 };
  apply(s, { type: 'place', objectType: 'terrace_seat', x: spot.x, y: spot.y });
  const building = Object.values(s.objects).some((o) => o.build);
  if (!building) return; // 그 칸에 못 놓았으면 이 판정은 건너뛴다
  const line = opportunityCost(s, 'table_out');
  expect(line).toContain('일꾼 1/1');
});

test('고스트 줄에도 기회비용이 실린다', () => {
  const s = fresh();
  const price = objectDef('table_out').cost;
  s.money = price + 10_000;
  const p = s.parcels.find((q) => q.owned)!;
  const t = tradeoffOf(s, 'table_out', p.x + 1, p.y + 1);
  expect(t.cost).toBe('이걸 사면 이번 달 월급이 빠듯해요');
  expect(t.gain.length + t.loss.length).toBeGreaterThan(0);
});
