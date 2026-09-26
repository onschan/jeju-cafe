/** 명당은 업그레이드로 깨지지 않는다 — 트리 업그레이드 공사 중(build.upgrade)에도 그 자리는 같은 종류의 조각이다 (사용자 피드백). */
import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { placeObject } from '../grid.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { completedCorners, cornerOfPiece } from '../corners.ts';
import { nextStep } from '../tree.ts';

test('밤 카페(불빛 3 + 자리): 테이블을 파라솔로, 정원등을 가로등으로 올려도 공사 중·완공 뒤 모두 명당이 그대로다', () => {
  const s = bareState(1);
  s.money = 100_000_000;
  for (const id of ['garden_lamp', 'streetlight', 'table_parasol', 'terrace_seat']) if (!s.unlocked.objects.includes(id)) s.unlocked.objects.push(id);
  placeObject(s, 'path', X(4), Y(5));
  const lamp = placeObject(s, 'garden_lamp', X(1), Y(5));
  placeObject(s, 'garden_lamp', X(1), Y(6)); placeObject(s, 'garden_lamp', X(1), Y(7)); // 불빛 셋
  const seat = placeObject(s, 'table_out', X(2), Y(6)); // 오른쪽 (3,6)이 비어 있어 2×1 테라스로도 올라간다
  expect(completedCorners(s).map((c) => c.id)).toContain('corner_night_cafe');
  expect(cornerOfPiece(s, seat.id)?.id).toBe('corner_night_cafe');
  // 자리 업그레이드 (공사 며칠) — 공사 중에도 명당이 살아 있다
  expect(nextStep(seat.type)?.type).toBe('table_parasol');
  expect(apply(s, { type: 'treeUpgrade', objectId: seat.id }).ok).toBe(true);
  expect(seat.type).toBe('table_parasol');
  if (seat.build) expect(seat.build.upgrade).toBe(true);
  expect(completedCorners(s).map((c) => c.id)).toContain('corner_night_cafe');
  for (let i = 0; i < 10; i++) tick(s, DAY_MS);
  expect(seat.build).toBeUndefined();
  expect(completedCorners(s).map((c) => c.id)).toContain('corner_night_cafe');
  // 테라스(2×1, 등급 2부터, 공사 며칠)까지 — 공사 중에도 명당이 살아 있다 (build.upgrade)
  s.grade = 2;
  expect(apply(s, { type: 'treeUpgrade', objectId: seat.id }).ok).toBe(true);
  expect(seat.type).toBe('terrace_seat');
  expect(seat.build?.upgrade).toBe(true);
  expect(completedCorners(s).map((c) => c.id)).toContain('corner_night_cafe');
  for (let i = 0; i < 10; i++) tick(s, DAY_MS);
  expect(seat.build).toBeUndefined();
  expect(completedCorners(s).map((c) => c.id)).toContain('corner_night_cafe');
  // 불빛도 올린다
  expect(apply(s, { type: 'treeUpgrade', objectId: lamp.id }).ok).toBe(true);
  expect(lamp.type).toBe('streetlight');
  expect(completedCorners(s).map((c) => c.id)).toContain('corner_night_cafe');
  for (let i = 0; i < 10; i++) tick(s, DAY_MS);
  expect(completedCorners(s).find((c) => c.id === 'corner_night_cafe')!.tierSteps).toBeGreaterThan(0); // 올릴수록 효과가 세진다
});
