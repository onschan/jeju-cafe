/** ui3 숏컷 설정 (길게 누르기 메뉴·더블 탭·하단 바 길게 누르기·상단 스와이프)와 「맵 위 표시 최소화」.
 *  세이브 스키마를 건드리지 않는다 — localStorage에만 남기고, 없으면 기본값(숏컷 켬 / 최소화 끔)으로 돈다. */
import { useSyncExternalStore } from 'react';

function makePref(key: string, defaultOn: boolean) {
  let on: boolean = (() => { try { const v = localStorage.getItem(key); return v === null ? defaultOn : v !== '0'; } catch { return defaultOn; } })();
  const listeners = new Set<() => void>();
  const get = () => on;
  const set = (v: boolean) => {
    on = v;
    try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* noop */ }
    for (const l of listeners) l();
  };
  const use = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, get, get);
  return { get, set, use };
}

/** 숏컷 전체 (설정에서 끌 수 있다) */
const shortcuts = makePref('jeju-cafe:shortcuts', true);
export const shortcutsOn = shortcuts.get;
export const setShortcutsOn = shortcuts.set;
export const useShortcutsPref = shortcuts.use;

/** 맵 위 표시 최소화: 켜면 인기 바·Lv 배지를 숨기고 문제 표시(공사·고장·낡음)만 남긴다 */
const mapMinimal = makePref('jeju-cafe:mapMinimal', false);
export const mapMinimalOn = mapMinimal.get;
export const setMapMinimalOn = mapMinimal.set;
export const useMapMinimalPref = mapMinimal.use;
