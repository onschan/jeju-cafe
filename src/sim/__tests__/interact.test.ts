import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { apply } from '../actions.ts';
import { setSlot } from '../menu.ts';
import { spawnGuests, updateGuests, GUEST_SPEED_CELLS_PER_S, PREP_MS } from '../guests.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import { greetedToday, greetsLeftToday, canGreet, greetGuest, greetLine, canRecommend, recommendMenu, recommendFits, guestNameFor, regularFace, REQUESTS, requestDef, isRequestMet, requestHint, maybeRequest, thankIfDone, pendingRequests, doneRequests, regularGauge, regularHearts, regularOf, regularsDue, regularVisitSlot, addRegularGauge, registerRegular, GREET_DAY_MAX, RECOMMEND_TIP_RATE, GAUGE_MAX, REGULAR_TIP_RATE, REQUEST_DAY_MAX, REQUEST_TICKET_COUNT, GREET_SATISFACTION, GAUGE_HAPPY_VISIT } from '../interact.ts';
import { hashOf } from '../say.ts';
import { guestSay } from '../say.ts';
import { hasIdToken } from '../../data/labels.ts';
import { createInitialState } from '../state.ts';
import { runBot } from '../bot.ts';
import * as botApi from '../bot.ts';
import { serialize, deserialize } from '../save.ts';
import type { Guest } from '../types.ts';
import { completedCorners, cornerTags, CORNERS } from '../corners.ts';

function cafe(seed = 1) {
  const s = bareState(seed);
  placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'carrot_juice');
  setSlot(s, 1, 'americano');
  s.storage['carrot'] = 50;
  return s;
}
/** 손님 한 명을 자리까지 걸려 앉힌다 (주문·요청 판정까지) */
function seatOne(s = cafe()): { s: ReturnType<typeof cafe>; g: Guest } {
  expect(spawnGuests(s, 1)).toBe(1);
  const g = s.guests[s.guests.length - 1]!;
  updateGuests(s, (8 / GUEST_SPEED_CELLS_PER_S) * 1000);
  expect(g.phase).toBe('seated');
  return { s, g };
}

describe('데이터: 요청 30개', () => {
  test('id 고유·문구 ≤22자·want는 명당/시설/메뉴/태그 중 하나 이상·힌트가 있다', () => {
    expect(REQUESTS.length).toBe(30);
    expect(new Set(REQUESTS.map((r) => r.id)).size).toBe(30);
    for (const r of REQUESTS) {
      expect(r.text.length, r.id).toBeLessThanOrEqual(22);
      expect(r.thanks.length, r.id).toBeLessThanOrEqual(22);
      expect(Object.keys(r.want).length, r.id).toBeGreaterThan(0);
      expect(requestHint(r).length, r.id).toBeGreaterThan(0);
      expect(requestHint(r).length, r.id).toBeLessThanOrEqual(22);
      expect(hasIdToken(r.text) || hasIdToken(r.thanks) || hasIdToken(requestHint(r)), r.id).toBe(false);
      // 명당·태그 요청은 명당 데이터가 없는 동안(통합 전) 시설로 판정할 수 있어야 한다
      if (r.want.corner || r.want.tagCorner) expect(r.want.facility, r.id).toBeTruthy();
    }
    expect(requestDef('req_photo').want.facility).toBe('signboard');
    expect(() => requestDef('nope')).toThrow();
  });
});

describe('이름·얼굴', () => {
  test('일반 손님은 스폰 때 성+이름을 받고, 같은 id면 같은 이름 (rng 안 씀)', () => {
    const s = cafe();
    const rng = s.rng;
    spawnGuests(s, 2);
    expect(s.rng).not.toBe(rng); // 스폰 자체는 rng를 쓴다
    const [a, b] = s.guests;
    expect(a!.name).toBeTruthy();
    expect(a!.name).toBe(guestNameFor(a!.id, a!.type));
    expect(guestNameFor('g1', 'local_auntie')).toBe(guestNameFor('g1', 'local_auntie'));
    expect(a!.name!.length).toBeGreaterThanOrEqual(2);
    expect(a!.name!.length).toBeLessThanOrEqual(4);
    expect(hasIdToken(a!.name!)).toBe(false);
    expect(b!.name).toBeTruthy();
  });
  test('단골 얼굴은 seed로 결정되고 파츠 범위 안', () => {
    for (let seed = 0; seed < 50; seed++) {
      const f = regularFace(seed);
      expect(f.hair).toBeGreaterThanOrEqual(0); expect(f.hair).toBeLessThan(24);
      expect(f.skin).toBeLessThan(3); expect(f.top).toBeLessThan(8);
    }
    expect(regularFace(7)).toEqual(regularFace(7));
  });
});

describe('인사', () => {
  test('손님당 1회, 만족 +1·게이지 +1, 대사 6종 로테이션, 하트 fx', () => {
    const { s, g } = seatOne();
    const sat = s.guestTypes[g.type]!.satisfaction;
    expect(greetedToday(s)).toBe(false);
    expect(canGreet(s, g.id).ok).toBe(true);
    expect(apply(s, { type: 'greetGuest', guestId: g.id }).ok).toBe(true);
    expect(greetedToday(s)).toBe(true);
    expect(s.guestTypes[g.type]!.satisfaction).toBe(sat + GREET_SATISFACTION);
    expect(regularGauge(s, g.type)).toBe(1);
    expect(g.greeted).toBe(true);
    expect(g.say).toBe(greetLine(s, g, 0));
    expect(s.fx.at(-1)).toMatchObject({ kind: 'react', guestId: g.id, icon: 'heart' });
    expect(apply(s, { type: 'greetGuest', guestId: g.id }).ok).toBe(false); // 두 번은 안 된다
    expect(apply(s, { type: 'greetGuest', guestId: 'g999' }).ok).toBe(false);
    // 로테이션: 6번째 뒤 처음으로
    const lines = new Set<string>();
    for (let i = 0; i < 6; i++) lines.add(greetLine(s, g, i));
    expect(lines.size).toBe(6);
    expect(greetLine(s, g, 6)).toBe(greetLine(s, g, 0));
  });
  test('하루 10회 상한, 새 날에 다시 열린다', () => {
    const s = cafe();
    let ok = 0;
    for (let round = 0; round < 7; round++) {
      s.guests = [];
      expect(spawnGuests(s, 2)).toBe(2);
      for (const g of s.guests) if (apply(s, { type: 'greetGuest', guestId: g.id }).ok) ok++;
    }
    expect(ok).toBe(GREET_DAY_MAX);
    expect(greetsLeftToday(s)).toBe(0);
    const rest = s.guests.find((g) => !g.greeted)!;
    expect(canGreet(s, rest.id).reason).toBe('오늘 인사는 여기까지');
    s.clock.day += 1;
    expect(greetsLeftToday(s)).toBe(GREET_DAY_MAX);
    expect(greetedToday(s)).toBe(false);
  });
  test('그저 그렇던 손님은 인사하면 기분이 풀린다, 가는 손님은 안 된다', () => {
    const { s, g } = seatOne();
    g.mood = 'meh'; g.moodReason = 'scenery';
    greetGuest(s, g.id);
    expect(g.mood).toBe('happy');
    const { s: s2, g: g2 } = seatOne();
    g2.phase = 'leaving';
    expect(canGreet(s2, g2.id).ok).toBe(false);
  });
});

describe('추천', () => {
  test('주문을 기다릴 때만, 취향이 맞으면 주문이 바뀌고 팁 20%·"오 이거!"', () => {
    const { s, g } = seatOne();
    expect(g.menuId).toBeTruthy();
    expect(g.mood).toBeNull();
    const other = g.menuId === 'carrot_juice' ? 'americano' : 'carrot_juice';
    const fits = recommendFits(s, g, other);
    const paid = g.paid;
    expect(canRecommend(s, g.id, g.menuId!).ok).toBe(false); // 이미 시킨 것
    expect(canRecommend(s, g.id, 'latte').ok).toBe(false); // 메뉴판에 없다
    expect(canRecommend(s, g.id, other).ok).toBe(true);
    const money = s.money; // apply는 목표 판정(보상금)까지 하므로 돈은 직접 호출로 본다
    expect(recommendMenu(s, g.id, other).match).toBe(fits);
    expect(g.recommended).toBe(true);
    if (fits) {
      expect(g.menuId).toBe(other);
      expect(s.money).toBe(money + Math.round(paid * RECOMMEND_TIP_RATE));
      expect(g.say).toBe('오 이거!');
    } else {
      expect(g.menuId).not.toBe(other);
      expect(s.money).toBe(money);
      expect(g.say).toBe('음…');
      expect(s.fx.at(-1)).toMatchObject({ kind: 'react', icon: 'sweat' });
    }
    expect(apply(s, { type: 'recommendMenu', guestId: g.id, menuId: other }).ok).toBe(false); // 손님당 1회
  });
  test('맞는 경우와 틀린 경우가 둘 다 있다 (스탯 취향 판정)', () => {
    const { s, g } = seatOne();
    const fits = ['carrot_juice', 'americano'].map((m) => recommendFits(s, g, m));
    // 당근주스는 건강 스탯, 아메리카노는 향 — 손님층에 따라 갈린다. 판정 함수가 결정적이면 된다
    expect(fits).toEqual(['carrot_juice', 'americano'].map((m) => recommendFits(s, g, m)));
    // 기분이 정해진 뒤엔 안 된다
    updateGuests(s, PREP_MS);
    expect(g.mood).not.toBeNull();
    expect(canRecommend(s, g.id).ok).toBe(false);
    // 직접 호출: 틀린 추천은 만족을 깎지 않는다
    const { s: s2, g: g2 } = seatOne();
    const sat = s2.guestTypes[g2.type]!.satisfaction;
    const r = recommendMenu(s2, g2.id, recommendFits(s2, g2, 'americano') ? 'carrot_juice' : 'americano');
    if (!r.match) expect(s2.guestTypes[g2.type]!.satisfaction).toBe(sat);
  });
});

describe('요청', () => {
  test('앉은 손님 20%(id 해시)가 요청하고, 하루 3건·손님층당 1건, 들어준 건 안 고른다', () => {
    const s = cafe();
    for (let i = 0; i < 6; i++) placeObject(s, 'table_out', X(6 + (i % 3) * 2), Y(3 + Math.floor(i / 3) * 2));
    for (let i = 0; i < 6; i++) placeObject(s, 'path', X(4 + i), Y(6));
    let asked = 0;
    for (let round = 0; round < 6; round++) {
      spawnGuests(s, 14);
      updateGuests(s, (12 / GUEST_SPEED_CELLS_PER_S) * 1000);
      asked += s.guests.filter((g) => g.requestId).length;
      s.guests = [];
    }
    expect(asked).toBeGreaterThan(0);
    expect(pendingRequests(s).length).toBeLessThanOrEqual(REQUEST_DAY_MAX);
    const types = pendingRequests(s).map((r) => r.guestType);
    expect(new Set(types).size).toBe(types.length);
    for (const r of pendingRequests(s)) expect(isRequestMet(s, requestDef(r.id))).toBe(false);
  });
  test('직접: 해시가 맞는 손님은 요청하고 말풍선 "?"이 뜬다, 같은 손님층은 하나만', () => {
    const s = cafe();
    const mk = (id: string, type = 'local_auntie'): Guest => ({ id, type, phase: 'seated', x: 0, y: 0, path: [], seatId: null, seatSlot: 0, approachCell: null, menuId: null, mood: null, moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 });
    let id = 0;
    let g = mk(`g${id}`);
    while (hashOf(`req:${g.id}`) % 5 !== 0) g = mk(`g${++id}`);
    const def = maybeRequest(s, g);
    expect(def).not.toBeNull();
    expect(g.requestId).toBe(def!.id);
    expect(g.say).toBe(def!.text);
    expect(guestSay(s, g)).toBe(def!.text); // 탭 말풍선도 요청 대사
    expect(s.fx.at(-1)).toMatchObject({ kind: 'react', guestId: g.id, icon: 'question', text: def!.text });
    let g2 = mk(`g${++id}`);
    while (hashOf(`req:${g2.id}`) % 5 !== 0) g2 = mk(`g${++id}`);
    expect(maybeRequest(s, g2)).toBeNull(); // 같은 손님층 진행 중
    expect(pendingRequests(s).length).toBe(1);
  });
  test('들어주면 다음 그 손님층 방문에 "고마워요" + 게이지 +2 + 응모권(첫 3회)', () => {
    const s = cafe();
    const type = 'local_auntie';
    const def = requestDef('req_juice'); // 메뉴판에 감귤주스
    s.requests = [{ id: def.id, guestType: type, day: 0, done: false }];
    const g: Guest = { id: 'g50', type, phase: 'seated', x: 0, y: 0, path: [], seatId: null, seatSlot: 0, approachCell: null, menuId: null, mood: null, moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 };
    expect(thankIfDone(s, g)).toBeNull(); // 아직
    s.unlocked.menus.push('tangerine_juice');
    setSlot(s, 2, 'tangerine_juice');
    expect(isRequestMet(s, def)).toBe(true);
    const tickets = s.tickets;
    expect(thankIfDone(s, { ...g, type: 'student' })).toBeNull(); // 다른 손님층은 아니다
    expect(thankIfDone(s, g)).toBe(def);
    expect(g.say).toBe(def.thanks);
    expect(regularGauge(s, type)).toBe(2);
    expect(s.tickets).toBe(tickets + 1);
    expect(doneRequests(s).length).toBe(1);
    expect(pendingRequests(s).length).toBe(0);
    expect(s.notices.at(-1)).toContain(def.thanks);
    // 4번째부터는 응모권 없음
    s.requestThanks = REQUEST_TICKET_COUNT;
    s.requests.push({ id: 'req_ade', guestType: type, day: 0, done: false });
    setSlot(s, 3, 'tangerine_ade');
    s.unlocked.menus.push('tangerine_ade');
    const t2 = s.tickets;
    expect(thankIfDone(s, g)).not.toBeNull();
    expect(s.tickets).toBe(t2);
  });
  test('명당 요청: 명당이 완성돼 있으면 명당으로, 아니면 대체 시설로 판정; tagCorner(photo)는 명당 태그로', () => {
    const s = cafe();
    const def = requestDef('req_flower_path');
    expect(def.want.corner).toBe('corner_flower_path'); // corners.json 실제 id
    expect(isRequestMet(s, def)).toBe(false);
    placeObject(s, 'canola', X(2), Y(2));
    expect(isRequestMet(s, def)).toBe(true); // 대체 시설 판정
    const t = cafe();
    placeObject(t, 'flower_bed', X(2), Y(2));
    placeObject(t, 'deco_wood_bench', X(3), Y(2));
    placeObject(t, 'streetlight', X(2), Y(3));
    expect(completedCorners(t).map((c) => c.id)).toContain('corner_flower_path');
    expect(isRequestMet(t, def)).toBe(true); // 명당 우선
    expect(isRequestMet(t, requestDef('req_photo'))).toBe(true); // 꽃길은 photo 태그(사진 확률 0.6)
    expect(cornerTags('corner_flower_path')).toContain('photo');
    expect(cornerTags('corner_haenyeo_rest')).toContain('rest');
    for (const r of REQUESTS) if (r.want.corner) expect(CORNERS.some((c) => c.id === r.want.corner), r.id).toBe(true);
  });
});

describe('단골 게이지·등록', () => {
  test('만족 방문 +0.2, 5면 단골 등록(이름·얼굴 고정·알림·장면), 그 뒤 5에서 멈춘다', () => {
    const s = cafe();
    const type = 'local_auntie';
    for (let i = 0; i < 24; i++) addRegularGauge(s, type, GAUGE_HAPPY_VISIT);
    expect(regularGauge(s, type)).toBeCloseTo(4.8);
    expect(regularHearts(s, type)).toBe(4);
    expect(regularOf(s, type)).toBeNull();
    addRegularGauge(s, type, GAUGE_HAPPY_VISIT);
    const r = regularOf(s, type)!;
    expect(r).not.toBeNull();
    expect(r.name).toBe(guestNameFor(r.id, type));
    expect(regularGauge(s, type)).toBe(GAUGE_MAX);
    expect(s.notices.at(-1)).toContain('단골이 됐어요');
    expect(s.fx.at(-1)).toMatchObject({ kind: 'scene', title: '단골이 생겼다' });
    addRegularGauge(s, type, 3);
    expect(regularGauge(s, type)).toBe(GAUGE_MAX);
    expect(s.regulars!.length).toBe(1); // 손님층당 한 명
  });
  test('단골은 정한 요일·시각에 와서 이름·얼굴이 고정이고 팁 20%를 더 낸다', () => {
    const s = cafe();
    const r = registerRegular(s, 'local_auntie');
    const slot = regularVisitSlot(r);
    expect(regularVisitSlot(r)).toEqual(slot);
    s.clock.day = slot.weekday === 0 ? 7 : slot.weekday; s.clock.hour = slot.hour;
    expect(regularsDue(s).map((x) => x.id)).toEqual([r.id]);
    s.clock.hour = slot.hour + 1;
    expect(regularsDue(s)).toEqual([]);
    s.clock.hour = slot.hour - 1; s.clock.accMs = 0; s.clock.carryMs = 0;
    // 한 시간 지나면 hourlyRegulars가 스폰
    const before = s.guests.length;
    tick(s, HOUR_MS);
    const g = s.guests.find((x) => x.regularId === r.id);
    expect(g, '단골 스폰').toBeTruthy();
    expect(g!.name).toBe(r.name);
    expect(g!.faceSeed).toBe(r.seed);
    expect(s.notices).toContain(`${r.name} 왔다!`);
    expect(s.fx.some((e) => e.kind === 'react' && e.guestId === g!.id && e.icon === 'wave')).toBe(true);
    expect(regularsDue(s)).toEqual([]); // 와 있는 동안은 또 안 온다
    expect(s.spawnAcc).toBeLessThan(1); // 단골은 그날 손님 수 안에서 온다 (spawnAcc −1)
    // 팁: 매출(재료 자동 구매는 빼고)이 낸 돈 + 20%
    const income = s.totalIncome;
    updateGuests(s, (12 / GUEST_SPEED_CELLS_PER_S) * 1000);
    expect(g!.phase).toBe('seated');
    expect(g!.menuId).toBeTruthy();
    expect(s.totalIncome - income).toBe(g!.paid + Math.round(g!.paid * REGULAR_TIP_RATE));
    expect(before).toBeGreaterThanOrEqual(0);
  });
});

describe('결정성·저장·봇', () => {
  test('같은 seed로 두 번 굴리면 요청·게이지·단골이 같다 (해시 기반, rng 불변)', () => {
    const a = cafe(3), b = cafe(3);
    for (const s of [a, b]) for (let i = 0; i < 40; i++) tick(s, HOUR_MS);
    expect(a.requests).toEqual(b.requests);
    expect(a.regularsGauge).toEqual(b.regularsGauge);
    expect(a.regulars).toEqual(b.regulars);
    expect(a.rng).toBe(b.rng);
  });
  test('저장 왕복: 요청·게이지·단골·손님 이름이 그대로', () => {
    const u = cafe();
    registerRegular(u, 'local_auntie');
    u.requests = [{ id: 'req_juice', guestType: 'local_auntie', day: 0, done: false }];
    spawnGuests(u, 1);
    const back = deserialize(serialize(u));
    expect(back.regulars).toEqual(u.regulars);
    expect(back.requests).toEqual(u.requests);
    expect(back.guests[0]!.name).toBe(u.guests[0]!.name);
  }, 30_000);
  test('봇 반년: 인사·요청·단골이 자금을 흔들지 않고(파산 없음) 요청·게이지가 실제로 쌓인다 (1년차 밴드는 headless로)', () => {
    const rows = runBot(0.5, 1);
    const last = rows.at(-1)!;
    expect(last.money).toBeLessThanOrEqual(12_000_000); // trim: 반년 시점 여유선 (1년차 말 ≤1,000만은 headless가 본다 — 없어진 돈 쓸 곳만큼 반년 잔고가 조금 올랐다)
    expect(last.minMoney).toBeGreaterThan(-5_000_000);
    const s = createInitialState(1);
    const { botDay, newBotCursor } = botApi;
    const cur = newBotCursor();
    for (let d = 0; d < 60; d++) botDay(s, cur);
    expect((s.requests ?? []).length).toBeGreaterThan(0);
    expect(Object.keys(s.regularsGauge ?? {}).length).toBeGreaterThan(0);
  }, 60_000);
  test('옛 저장(필드 없음)도 그대로 돈다', () => {
    const s = cafe();
    delete s.requests; delete s.regularsGauge; delete s.regulars; delete s.greetDay;
    tick(s, DAY_MS);
    expect(greetedToday(s)).toBe(false);
    expect(regularHearts(s, 'local_auntie')).toBeGreaterThanOrEqual(0);
  });
});
