/** 타이틀 화면 「옛 세이브는 백업됐어요」 판정 (z-polish) */
import { hasOldSave, VERSION_TEXT } from '../TitleScreen';
import { SAVE_VERSION } from '../../sim/index.ts';

function storageOf(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
}

test('백업 키가 있거나 슬롯 version이 지금보다 낮으면 true', () => {
  expect(hasOldSave(storageOf({}))).toBe(false);
  expect(hasOldSave(storageOf({ 'jeju-cafe:slot:1': JSON.stringify({ version: SAVE_VERSION }) }))).toBe(false);
  expect(hasOldSave(storageOf({ 'jeju-cafe:slot:1': JSON.stringify({ version: SAVE_VERSION - 1 }) }))).toBe(true);
  expect(hasOldSave(storageOf({ 'jeju-cafe:slot:backup:2': '{}' }))).toBe(true);
  expect(hasOldSave(storageOf({ 'jeju-cafe:slot:3': 'not json', 'other': 'x' }))).toBe(false);
  expect(hasOldSave(null)).toBe(false);
});

test('버전 표기는 v로 시작한다', () => {
  expect(VERSION_TEXT.startsWith('v')).toBe(true);
});
