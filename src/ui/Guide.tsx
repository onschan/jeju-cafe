import { useGame, getToast } from './store';
import { objectDef, cropDef } from '../data/index.ts';
import { readyToHarvest, availableMenus, hasReachableSeat, type GameState } from '../sim/index.ts';

/** [9,10,11] → '9~11월', [11,12,1] → '11, 12, 1월' 처럼 연속이면 범위로, 아니면 나열로 */
function formatMonths(months: number[]): string {
  if (months.length === 0) return '';
  const consecutive = months.every((m, i) => i === 0 || m === months[i - 1]! + 1);
  return consecutive && months.length > 1 ? `${months[0]}~${months[months.length - 1]}월` : `${months.join(', ')}월`;
}

/** HUD 두 줄 바로 아래. HUD 토스트도 같은 자리를 쓴다. */
export const GUIDE_TOP = 90;

export function guideText(s: GameState): string | null {
  if (s.clock.year > 1) return null;
  const objs = Object.values(s.objects);
  const kinds = objs.map((o) => objectDef(o.type).kind);
  if (!kinds.includes('seat')) return '할망: 손님 앉을 테이블부터 놓아 보라.';
  if (!hasReachableSeat(s)) return '할망: 손님이 갈 수 있는 길이 없다. 정류장에서 테이블까지 올렛길을 이어 보라.';
  if (!kinds.includes('field')) return '할망: 밭을 하나 지어 보라.';
  if (readyToHarvest(s).length > 0) return '할망: 반짝이는 밭을 눌러 수확하라.';
  if (s.menuSlots.every((m) => m === null)) return '할망: 메뉴판에 아메리카노와 토스트를 올려 보라.';
  if (availableMenus(s).length === 0) return '할망: 재료가 없거나 만들 사람이 없으면 메뉴가 안 나간다.';
  // 메뉴가 나가기 시작하면 직원 → 당근 순서로 알려 준다
  if (s.staff.length === 0) {
    return s.candidates.length > 0
      ? '할망: 후보가 왔다. 직원 탭에서 마음에 드는 사람을 뽑아 보라.'
      : '할망: 손님이 기다리면 직원 탭에서 공고를 내서 직원을 뽑아 보라.';
  }
  if (objs.some((o) => objectDef(o.type).kind === 'field' && !o.crop)) {
    const carrot = cropDef('carrot');
    return carrot.plantMonths.includes(s.clock.month)
      ? `할망: ${s.clock.month}월엔 당근. 지금 심어 보라.`
      : `할망: 당근은 ${formatMonths(carrot.plantMonths)}에 심는다. 그동안 감귤나무를 심어 두면 3년 뒤에 열린다.`;
  }
  return '할망: 잘하고 있다. 손님 얼굴을 보라.';
}

export function Guide() {
  const s = useGame();
  const t = guideText(s);
  // 토스트가 같은 자리를 쓰므로 토스트가 떠 있는 동안은 안내를 숨긴다
  if (!t || getToast()) return null;
  return (
    <div style={{ position: 'absolute', top: GUIDE_TOP, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
      <img className="px" src="/assets/icons/portrait_halmang.png" width={48} height={48} alt="할망" style={{ flex: 'none', imageRendering: 'pixelated' }} />
      <div style={{ flex: 1, background: '#fff3', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}>{t}</div>
    </div>
  );
}
