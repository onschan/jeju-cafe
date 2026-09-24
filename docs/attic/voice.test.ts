/** trim ★: 손님 목소리 피드 — 불만 4사유가 한 줄씩 쌓이고, 같은 날 같은 사유는 묶이며, 하루 8줄에서 멈춘다. */
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { addComplaint } from '../reputation.ts';
import { pushVoice, pushReceipt, receiptText, recentVoices, voiceText, voicesToday, bestViewSeat, dirtiestObject, VOICE_DAY_MAX, VOICE_FIX, VOICE_FIX_LABEL } from '../voice.ts';
import { spawnGuests, updateGuests, PREP_MS, SEAT_MS } from '../guests.ts';
import { setSlot } from '../menu.ts';
import { guestTypeDef } from '../../data/index.ts';
import { WEAR_START_MONTHS } from '../cleanliness.ts';
import { hasIdToken } from '../../data/labels.ts';

test('불만 4사유가 목소리 한 줄로 오고, 문구에 영문 id가 없다', () => {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5));
  addComplaint(s, 'no_seat', 'student');
  addComplaint(s, 'wait_long', 'student');
  addComplaint(s, 'expensive', 'student', '감귤주스');
  expect(s.voices!.map((v) => v.reason)).toEqual(['no_seat', 'wait_long', 'expensive']);
  const texts = s.voices!.map(voiceText);
  expect(texts[0]).toBe('자리가 없어서 그냥 갔어요');
  expect(texts[2]).toBe('감귤주스가 비싸요'); // 조사: 받침 없음 → 「가」
  for (const t of texts) expect(hasIdToken(t), t).toBe(false);
  // 자리 없음은 가장 붐비는 좌석을 가리킨다 (해결 버튼은 「자리 늘리기」)
  expect(s.voices![0]!.cell).toEqual({ x: X(4), y: Y(5) });
  expect(VOICE_FIX.no_seat).toBe('seat');
  expect(VOICE_FIX_LABEL[VOICE_FIX.no_seat]).toBe('자리 늘리기');
  expect(VOICE_FIX.view).toBe('none');
});

test('같은 날 같은 사유는 한 줄로 묶여 수를 센다', () => {
  const s = bareState(1);
  for (let i = 0; i < 3; i++) addComplaint(s, 'no_seat', 'student');
  expect(s.voices).toHaveLength(1);
  expect(s.voices![0]!.count).toBe(3);
  expect(voiceText(s.voices![0]!)).toBe('3명이 자리가 없어 돌아갔어요');
  // 날이 바뀌면 새 줄
  s.clock.day = 2;
  addComplaint(s, 'no_seat', 'student');
  expect(s.voices).toHaveLength(2);
  expect(voicesToday(s)).toBe(1);
});

test('하루 상한 8줄: 넘으면 새 줄을 안 만든다 (묶임은 계속 센다)', () => {
  const s = bareState(1);
  for (let i = 0; i < VOICE_DAY_MAX; i++) pushVoice(s, 'expensive', `메뉴${i}`);
  expect(s.voices).toHaveLength(VOICE_DAY_MAX);
  pushVoice(s, 'expensive', '넘치는 메뉴');
  expect(s.voices).toHaveLength(VOICE_DAY_MAX);
  pushVoice(s, 'expensive', '메뉴0');
  expect(s.voices![0]!.count).toBe(2);
});

test('더러움은 가장 낡은 시설을 가리킨다', () => {
  const s = bareState(1);
  const t = placeObject(s, 'table_out', X(4), Y(5));
  t.wearMonth = t.placedMonth - WEAR_START_MONTHS * 3;
  const d = dirtiestObject(s);
  expect(d?.cell).toEqual({ x: X(4), y: Y(5) });
  addComplaint(s, 'dirty', 'student');
  expect(s.voices![0]!.cell).toEqual({ x: X(4), y: Y(5) });
  expect(voiceText(s.voices![0]!)).toContain('낡고 지저분');
});

test('좋은 말도 쌓인다: 전망 자리·명당 사진은 피드에 좋은 줄로', () => {
  const s = bareState(1);
  placeObject(s, 'table_out', 12, 1); // 북쪽 = 바다
  expect(bestViewSeat(s)).toEqual({ x: 12, y: 1 });
  pushVoice(s, 'view', undefined, bestViewSeat(s));
  pushVoice(s, 'corner', '꽃길');
  expect(voiceText(s.voices![0]!)).toBe('바다 보이는 자리 최고예요');
  expect(voiceText(s.voices![1]!)).toBe('꽃길에서 사진 찍었어요');
  expect(recentVoices(s, 3)).toHaveLength(2);
  expect(recentVoices(s, 1)[0]!.reason).toBe('corner'); // 최근 것부터
});

/** 조사 버그(「아메리카노이 비싸요」) 회귀: 이름+조사는 josa()로 — 받침 있는 이름 3·없는 이름 3 */
test('후기 조사: 받침 있으면 「이」, 없으면 「가」', () => {
  const line = (detail: string, reason: 'expensive' | 'dirty' = 'expensive') => voiceText({ id: 'v1', reason, count: 1, day: 0, tick: 0, detail });
  for (const name of ['감귤빵', '흑돼지 덮밥', '한라봉청']) expect(line(name)).toBe(`${name}이 비싸요`);
  for (const name of ['아메리카노', '감귤주스', '우도 땅콩 라떼']) expect(line(name)).toBe(`${name}가 비싸요`);
  expect(line('평상', 'dirty')).toBe('평상이 낡고 지저분해요');
  expect(line('파라솔 테이블', 'dirty')).toBe('파라솔 테이블이 낡고 지저분해요');
  expect(line('의자', 'dirty')).toBe('의자가 낡고 지저분해요');
});

// ---------- video P0-5: 손님 영수증 한 줄 ----------

test('pushReceipt: 돈을 안 낸 손님은 줄을 안 남기고, 새 손님이 오면 번호가 올라 앞 줄을 교체한다', () => {
  const s = bareState(1);
  pushReceipt(s, 'student', 2, 0);
  expect(s.receipt).toBeUndefined(); // 주문을 안 한 손님은 영수증이 없다
  pushReceipt(s, 'student', 2, 4500);
  expect(s.receipt!.id).toBe(1);
  expect(receiptText(s.receipt!)).toBe('대학생 · 인기 +2 · ₩4,500');
  pushReceipt(s, 'student', -1, 3000);
  expect(s.receipt!.id).toBe(2); // 한 칸짜리 슬롯 — 알림 링버퍼는 안 건드린다
  expect(receiptText(s.receipt!)).toBe('대학생 · 인기 −1 · ₩3,000');
  pushReceipt(s, 'student', 0, 3000);
  expect(receiptText(s.receipt!)).toBe('대학생 · ₩3,000'); // 게이지가 안 움직이면 인기 줄을 빼고 말한다
  expect(hasIdToken(receiptText(s.receipt!))).toBe(false);
});

test('손님이 나가면 영수증이 남는다 (낸 돈·손님층), 러시 중엔 안 남는다', () => {
  const build = () => {
    const s = bareState(1);
    placeObject(s, 'table_out', X(4), Y(5));
    setSlot(s, 0, 'carrot_juice');
    s.storage['carrot'] = 10;
    spawnGuests(s, 1);
    updateGuests(s, 6000);
    return s;
  };
  const s = build();
  const g = s.guests[0]!;
  expect(g.paid).toBeGreaterThan(0);
  expect(s.receipt).toBeUndefined(); // 아직 앉아 있다
  updateGuests(s, PREP_MS);
  updateGuests(s, SEAT_MS);
  updateGuests(s, 10_000);
  expect(s.guests.length).toBe(0);
  expect(s.receipt!.typeId).toBe(g.type);
  expect(s.receipt!.paid).toBe(g.paid);
  expect(receiptText(s.receipt!)).toContain(guestTypeDef(g.type).name);
  // 러시 중엔 HUD가 이미 꽉 찼다 — 영수증을 안 남긴다
  const r = build();
  r.rush!.phase = 'run';
  updateGuests(r, PREP_MS);
  updateGuests(r, SEAT_MS);
  updateGuests(r, 10_000);
  expect(r.guests.length).toBe(0);
  expect(r.receipt).toBeUndefined();
});
