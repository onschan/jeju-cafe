import { fmtNum } from '../format.ts';
import { josa, hasBatchim } from '../josa.ts';
import { cornerEffectText } from '../../ui/windows/CornerTab.tsx';
import { CORNERS } from '../corners.ts';
import { cornerProgress } from '../corners.ts';
import { bareState } from './helpers.ts';

test('받침 판정', () => {
  expect(hasBatchim('이장님')).toBe(true);
  expect(hasBatchim('해녀')).toBe(false);
  expect(hasBatchim('LP판')).toBe(true);
  expect(hasBatchim('TV')).toBe(false);
  expect(hasBatchim('족자(제주 민화)')).toBe(false);
});

test('조사 선택', () => {
  expect(josa('이장님', '이/가')).toBe('이장님이');
  expect(josa('해녀 삼춘', '이/가')).toBe('해녀 삼춘이');
  expect(josa('동네 삼춘', '이/가')).toBe('동네 삼춘이');
  expect(josa('파라솔', '을/를')).toBe('파라솔을');
  expect(josa('안경', '을/를')).toBe('안경을');
  expect(josa('도자기 항아리', '을/를')).toBe('도자기 항아리를');
  expect(josa('바리스타', '으로/로')).toBe('바리스타로');
  expect(josa('요리사', '으로/로')).toBe('요리사로');
  expect(josa('홀', '으로/로')).toBe('홀로');
  expect(josa('밭 일꾼', '으로/로')).toBe('밭 일꾼으로');
  expect(josa('유채꽃밭', '은/는')).toBe('유채꽃밭은');
});

test('숫자로 끝나면 읽는 소리로: ₩300,000이 · 5명 · 2가 · 「시설 8개」는', () => {
  expect(josa('₩300,000', '이/가')).toBe('₩300,000이');
  expect(josa('₩150,000', '을/를')).toBe('₩150,000을');
  expect(josa('슬롯 2', '을/를')).toBe('슬롯 2를');
  expect(josa('슬롯 1', '을/를')).toBe('슬롯 1을');
  expect(josa('「시설 8개」', '은/는')).toBe('「시설 8개」는');
  expect(josa('30%', '이/가')).toBe('30%가');
});

test('fmtNum: 로케일과 무관하게 천 단위 쉼표', () => {
  expect(fmtNum(0)).toBe('0');
  expect(fmtNum(999)).toBe('999');
  expect(fmtNum(1000)).toBe('1,000');
  expect(fmtNum(1234567)).toBe('1,234,567');
  expect(fmtNum(-3000000)).toBe('-3,000,000');
  expect(fmtNum(12.5)).toBe('12.5');
});

test('이에요/예요: 받침 있으면 「이에요」, 없으면 「예요」 (시설 설명 기본 문구)', () => {
  for (const w of ['돌하르방', '평상', '가로등']) expect(josa(w, '이에요/예요')).toBe(`${w}이에요`);
  for (const w of ['의자', '벤치', '감귤나무']) expect(josa(w, '이에요/예요')).toBe(`${w}예요`);
});

test('테마 효과 한 줄: 손님층 이름 + 이/가 («젊은 손님이 더 온다» / «삼춘이 더 온다»)', () => {
  const s = bareState(1);
  const texts = cornerProgress(s).map(cornerEffectText);
  expect(texts.length).toBe(CORNERS.length);
  for (const t of texts) {
    expect(t).not.toMatch(/손님이\(가\)|\b이 더 온다$/);
    expect(t).toMatch(/(이|가) 더 온다$/);
  }
});
