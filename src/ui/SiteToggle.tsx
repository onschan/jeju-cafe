/** 「입지 보기」 토글 버튼 (스펙 §6.2, 트랙 F). 짓기 창 상단에 놓는다. 모드는 렌더 모듈 전역(siteOverlay.ts)에 있어 창을 닫아도 유지된다. */
import { useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { isSiteOverlayOn, setSiteOverlayOn, subscribeSiteOverlay } from '../render/siteOverlay';
import { brownBtn, brownBtnOn } from './frame';
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
