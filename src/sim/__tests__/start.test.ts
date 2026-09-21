import { describe, it, expect } from 'vitest';
import { createInitialState, START_MENUS, START_CANDIDATES, START_SEATS, SAVE_VERSION } from '../state.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import { hasReachableSeat, dailyGuestCount, totalSeats } from '../guests.ts';
import { guestSay, staffSay } from '../say.ts';
import { INITIAL_UNLOCKED, START_OBJECT_IDS, objectDef } from '../../data/index.ts';
import { hire } from '../staff.ts';
import { serialize, deserialize } from '../save.ts';

describe('v3 시작 상태 (§5)', () => {
  it('본관 + 테이블 2 + 파라솔 1 + 올렛길로 정류장에서 자리에 닿고, 메뉴 3종이 올라가 있고, 후보 2명이 기다린다', () => {
    const s = createInitialState(1);
    expect(SAVE_VERSION).toBe(19);
    expect(s.money).toBe(5_000_000);
    expect(hasReachableSeat(s)).toBe(true);
    const seats = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat');
    expect(seats.map((o) => o.type).sort()).toEqual(START_SEATS.map((x) => x.type).sort());
    expect(totalSeats(s)).toBe(10); // 야외 테이블 2×2 + 파라솔 2 + 실내 테이블 2×2 (fix-indoor: 본관 안 정식 배치)
    expect(s.menuSlots).toEqual([...START_MENUS, null]);
    expect(s.candidates).toHaveLength(START_CANDIDATES);
    expect(s.unlocked.objects.sort()).toEqual([...new Set(START_OBJECT_IDS)].sort());
    expect(s.unlocked.menus).toEqual(INITIAL_UNLOCKED.menus);
    expect(s.unlocked.objects).toHaveLength(9); // 8종 + 정낭 (w-free)
    expect(s.unlocked.menus).toHaveLength(3);
    expect(s.slots).toEqual({ barista: 1, cook: 1, hall: 2, carry: 0, guide: 0, clean: 2, garden: 2, promo: 1 });
    expect(s.storage).toEqual({});
  });

  it('하루 손님 수는 7~12명이고 첫 손님이 게임 1시간 안에 온다 (통합 튜닝 21/16 뒤 시작 7명 — §5의 8명에서 1명 줄었다)', () => {
    const s = createInitialState(1);
    const n = dailyGuestCount(s);
    expect(n).toBeGreaterThanOrEqual(7);
    expect(n).toBeLessThanOrEqual(12);
    tick(s, HOUR_MS);
    expect(s.guests.length).toBeGreaterThan(0);
    tick(s, DAY_MS);
    expect(s.totalGuests).toBeGreaterThanOrEqual(7);
    expect(s.totalGuests).toBeLessThanOrEqual(14);
  });

  it('같은 seed면 같은 시작 상태·같은 하루 (결정적), 저장·복원이 같다', () => {
    const a = createInitialState(7);
    const b = createInitialState(7);
    expect(serialize(a)).toBe(serialize(b));
    tick(a, DAY_MS);
    tick(b, DAY_MS);
    expect(serialize(a)).toBe(serialize(b));
    expect(serialize(deserialize(serialize(a)))).toBe(serialize(a));
  });
});

describe('말풍선 헬퍼 guestSay·staffSay', () => {
  it('손님: 주문·만족·불만·비싸다·자리 없음 대사가 단계별로 나오고 결정적이다', () => {
    const s = createInitialState(1);
    for (let h = 0; h < 6; h++) tick(s, HOUR_MS);
    expect(s.guests.length).toBeGreaterThan(0);
    for (const g of s.guests) {
      const a = guestSay(s, g);
      expect(a).toBe(guestSay(s, g));
      if (g.phase === 'seated' && g.menuId && g.mood === null) expect(a).toBeTruthy();
      if (g.phase === 'seated' && g.mood === 'happy') expect(a).toBeTruthy();
    }
    const g = { ...s.guests[0]!, phase: 'seated' as const, mood: 'meh' as const, moodReason: 'price' as const, menuId: null };
    expect(guestSay(s, g)).toMatch(/비싸|값|지갑/);
    const noSeat = { ...g, phase: 'walking' as const, seatId: null };
    expect(guestSay(s, noSeat)).toMatch(/자리|앉|찼/);
    const noMenu = { ...g, moodReason: 'no_menu' as const };
    expect(guestSay(s, noMenu)).toBeTruthy();
  });

  it('직원: 기력·역할·개발 중에 따라 대사가 바뀐다', () => {
    const s = createInitialState(1);
    const st = hire(s, s.candidates[0]!.id, 'hall');
    expect(staffSay(s, st)).toBeTruthy();
    const fresh = staffSay(s, st);
    st.energy = 10;
    expect(staffSay(s, st)).not.toBe(fresh);
    expect(staffSay(s, st)).toMatch(/쉬|zzz|기력/);
    st.energy = 50;
    expect(staffSay(s, st)).toBe(staffSay(s, st));
    st.role = null;
    expect(staffSay(s, st)).toMatch(/쉬/);
  });
});
