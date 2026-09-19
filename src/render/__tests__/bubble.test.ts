import { wrapBubbleText, shortMenuName, BUBBLE_NAME_MAX } from '../bubble';

test('shortMenuName: 괄호 부제를 떼고 6자를 넘으면 …', () => {
  expect(shortMenuName('아메리카노')).toBe('아메리카노');
  expect(shortMenuName('한라봉 에이드 (여름 한정)')).toBe('한라봉 에이…');
  expect(shortMenuName('감귤 라떼 (겨울)')).toBe('감귤 라떼');
  expect(shortMenuName('감귤 치즈케이크').length).toBe(BUBBLE_NAME_MAX + 1);
  expect(shortMenuName('  라떼  ')).toBe('라떼');
});

test('wrapBubbleText: 12자 넘으면 줄을 나눈다', () => {
  expect(wrapBubbleText('짧은 말')).toBe('짧은 말');
  expect(wrapBubbleText('아주아주아주아주아주아주 긴 대사예요').split('\n').length).toBeGreaterThan(1);
});
