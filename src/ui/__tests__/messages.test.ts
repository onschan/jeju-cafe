import { showMessage, showToast, getMessages, clearMessages, isMessageFresh, MESSAGE_KEEP, MESSAGE_FRESH_MS, pauseGame, setSpeedLocked, isSpeedLocked, getState, setUserSpeed, isPausedByUi } from '../store.ts';

beforeEach(() => { clearMessages(); setSpeedLocked(false); });

test('메시지 줄: 최신이 앞, 같은 문구 연속은 시각만 갱신, 최대 10개', () => {
  showMessage('하나');
  showMessage('둘');
  expect(getMessages().map((m) => m.text)).toEqual(['둘', '하나']);
  showMessage('둘');
  expect(getMessages().length).toBe(2);
  for (let i = 0; i < 20; i++) showMessage(`m${i}`);
  expect(getMessages().length).toBe(MESSAGE_KEEP);
  expect(getMessages()[0]!.text).toBe('m19');
});

test('메시지 줄: 3초 안이면 새것, 지나면 회색(옛것). showToast는 별칭', () => {
  showToast('옛 이름');
  const m = getMessages()[0]!;
  expect(m.text).toBe('옛 이름');
  expect(isMessageFresh(m, m.at + MESSAGE_FRESH_MS - 1)).toBe(true);
  expect(isMessageFresh(m, m.at + MESSAGE_FRESH_MS)).toBe(false);
});

test('속도 잠금: 창은 멈추지 않고 대화창·배치는 멈춘다', () => {
  setUserSpeed(2);
  setSpeedLocked(true);
  expect(isSpeedLocked()).toBe(true);
  const release = pauseGame('window');
  expect(getState().clock.speed).toBe(2);
  expect(isPausedByUi()).toBe(false);
  release();
  const r2 = pauseGame('dialogue');
  expect(getState().clock.speed).toBe(0);
  r2();
  expect(getState().clock.speed).toBe(2);
  setSpeedLocked(false);
  const r3 = pauseGame('window');
  expect(getState().clock.speed).toBe(0);
  r3();
  expect(getState().clock.speed).toBe(2);
});
