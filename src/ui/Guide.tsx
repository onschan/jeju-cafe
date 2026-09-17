import { useGame } from './store';
import { objectDef } from '../data/index.ts';
import { readyToHarvest, availableMenus, type GameState } from '../sim/index.ts';

export function guideText(s: GameState): string | null {
  if (s.clock.year > 1) return null;
  const objs = Object.values(s.objects);
  const kinds = objs.map((o) => objectDef(o.type).kind);
  if (!kinds.includes('seat')) return '할망: 손님 앉을 테이블부터 놓아 보라.';
  if (!kinds.includes('path') && !objs.some((o) => objectDef(o.type).kind === 'seat' && o.y === 5 && o.x === 4)) return '할망: 정낭에서 테이블까지 올렛길을 이어야 손님이 온다.';
  if (!kinds.includes('field')) return '할망: 밭을 하나 지어 보라.';
  if (objs.some((o) => objectDef(o.type).kind === 'field' && !o.crop)) return s.clock.month >= 9 && s.clock.month <= 11 ? '할망: 지금 당근 심을 철이여.' : '할망: 당근은 9~11월에 심는다. 기다려 보라.';
  if (readyToHarvest(s).length > 0) return '할망: 반짝이는 밭을 눌러 수확하라.';
  if (s.menuSlots.every((m) => m === null)) return '할망: 메뉴판에 당근주스를 올려 보라.';
  if (availableMenus(s).length === 0) return '할망: 재료가 없으면 메뉴가 안 나간다.';
  return '할망: 잘하고 있다. 손님 얼굴을 보라.';
}

export function Guide() {
  const s = useGame();
  const t = guideText(s);
  if (!t) return null;
  return <div style={{ position: 'absolute', top: 76, left: 12, right: 12, background: '#fff3', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 13, pointerEvents: 'none' }}>{t}</div>;
}
