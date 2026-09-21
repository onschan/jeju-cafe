/** 「입지 보기」 토글 버튼 (스펙 §6.2, 트랙 F). 짓기 창 상단에 놓는다. 모드는 렌더 모듈 전역(siteOverlay.ts)에 있어 창을 닫아도 유지된다. */
import { useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { isSiteOverlayOn, setSiteOverlayOn, subscribeSiteOverlay } from '../render/siteOverlay';
import { brownBtn, brownBtnOn, PALETTE } from './frame';
import { SHELL_TOP } from './Shell';
import { noteTutorial } from './tutorialDialogue';

export function useSiteOverlay(): boolean {
  return useSyncExternalStore(subscribeSiteOverlay, isSiteOverlayOn, isSiteOverlayOn);
}

export function SiteToggle() {
  const on = useSiteOverlay();
  return (
    <button data-testid="site-toggle" data-tut="site-toggle" aria-pressed={on} onClick={() => { setSiteOverlayOn(!on); if (!on) noteTutorial('siteView'); }}
      style={{ ...(on ? brownBtnOn : brownBtn), margin: 0, padding: '0 10px', fontSize: 14, whiteSpace: 'nowrap', flex: '0 0 auto' }}
      title="맵에 좌석 적합도(빨강→초록)를 겹쳐 보여요">
      <Icon name="map" /> 입지 보기{on ? <> <Icon name="check" size={12} /></> : ''}
    </button>
  );
}

/** 맵 위에 떠 있는 「입지 보기」 안내 칩 (fix-indoor: 빛나는 칸엔 반드시 라벨). 오버레이가 켜져 있을 때만 보이고, 탭하면 끈다. */
export function SiteOverlayChip() {
  const on = useSiteOverlay();
  if (!on) return null;
  return (
    <button data-testid="site-chip" onClick={() => setSiteOverlayOn(false)} aria-label="입지 보기 끄기"
      style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: SHELL_TOP + 6, zIndex: 11, minHeight: 44, padding: '0 12px', borderRadius: 22,
        border: `2px solid ${PALETTE.wood}`, background: 'rgba(255,248,230,0.95)', color: PALETTE.ink, fontSize: 14, whiteSpace: 'nowrap', boxShadow: '0 2px 0 #0004', display: 'flex', alignItems: 'center', gap: 6 }}>
      <Icon name="map" size={16} /> 입지 보기 켬 — 빨강→초록이 자리 점수 · 탭해서 끄기
    </button>
  );
}
