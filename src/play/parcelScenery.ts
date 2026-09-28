/** 미소유 필지 풍경 (그림 전용, 상태에 없다): 바닥 채움 타일 + 소품 몇 개. 사면 소품이 사라지고 흙이 된다. 옛 parcel_scenery를 새 필지 9칸에 맞춰 손으로 다시 짰다. */
import type { Parcel } from '../game/index.ts';

export type Fill = 'canola' | 'orchard' | 'pampas' | 'stone' | 'soil';
interface Spec { fill: Fill; props: string[]; count: number; big?: string }
const SPEC: Record<string, Spec> = {
  north: { fill: 'soil', props: ['cedar', 'pine', 'cedar', 'basalt_rock', 'hydrangea'], count: 14 },           // 곶자왈 숲
  west: { fill: 'canola', props: ['canola', 'canola', 'scarecrow'], count: 8 },                                  // 유채밭
  east: { fill: 'stone', props: ['stonewall', 'dolhareubang_pair', 'cat_house', 'deco_flower_pots'], count: 7, big: 'haenyeo_hut' }, // 마을 어귀
  south: { fill: 'soil', props: ['basalt_rock', 'hydrangea', 'pampas', 'water_jar'], count: 8, big: 'pond' },    // 샘물 터
  nw: { fill: 'pampas', props: ['pampas', 'pampas', 'basalt_rock'], count: 10, big: 'oreum_bench' },              // 오름 자락
  ne: { fill: 'stone', props: ['stonewall', 'stone_guardians', 'millstone', 'basalt_rock'], count: 8 },          // 돌담 언덕
  sw: { fill: 'orchard', props: ['tangerine_tree', 'tangerine_tree_young', 'tangerine_tree_ready', 'deco_tangerine_crates'], count: 12 }, // 옛 감귤밭
  se: { fill: 'stone', props: ['basalt_rock', 'basalt_rock', 'pampas'], count: 6, big: 'lighthouse' },            // 바닷가
};
function hash(a: number, b: number): number { let h = (a * 374761393 + b * 668265263) | 0; h = ((h ^ (h >>> 13)) * 1274126177) | 0; return (h ^ (h >>> 16)) >>> 0; }

export function parcelFill(p: Parcel): Fill { return SPEC[p.id]?.fill ?? 'soil'; }
/** 소품 목록 (셀 좌표, 깊이 순). 가장자리 한 칸은 비운다. 큰 것 하나는 가운데. */
export function parcelProps(p: Parcel, isRoad: (x: number, y: number) => boolean): { sprite: string; x: number; y: number }[] {
  const spec = SPEC[p.id]; if (!spec) return [];
  const out: { sprite: string; x: number; y: number }[] = [];
  const used = new Set<string>();
  const put = (sprite: string, x: number, y: number) => { const k = `${x},${y}`; if (used.has(k) || isRoad(x, y)) return false; used.add(k); out.push({ sprite, x, y }); return true; };
  if (spec.big) put(spec.big, p.x + Math.floor(p.w / 2) - 1, p.y + Math.floor(p.h / 2) + 1);
  let seed = p.x * 31 + p.y * 7;
  for (let i = 0; i < spec.count * 3 && out.length < spec.count + (spec.big ? 1 : 0); i++) {
    const h = hash(seed++, i);
    const x = p.x + 1 + (h % (p.w - 2)), y = p.y + 1 + ((h >>> 8) % (p.h - 2));
    // 팻말 자리(가운데 위)는 비워 둔다
    if (Math.abs(x - (p.x + Math.floor(p.w / 2))) <= 1 && Math.abs(y - (p.y + Math.floor(p.h / 2))) <= 1) continue;
    put(spec.props[(h >>> 16) % spec.props.length]!, x, y);
  }
  return out.sort((a, b) => (a.x + a.y) - (b.x + b.y));
}
