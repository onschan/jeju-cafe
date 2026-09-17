import { useEffect } from 'react';
import { assetUrl } from './assetUrl';
import { useGame, getToast } from './store';
import { useGuideTop } from './Guide';
import { PALETTE } from './frame';
import { useTutorial, currentStep, checkTutorial, advanceTutorial, skipTutorial, stepLines, TUTORIAL_STEPS, MORE_TAB_NAMES } from './tutorial';

const PULSE_CSS = `
@keyframes tut-pulse { 0%, 100% { box-shadow: 0 0 0 0 #ffd166; } 50% { box-shadow: 0 0 0 5px #ffd16600, 0 0 12px 4px #ffd166; } }
`;

const smallBtn = {
  minHeight: 28, padding: '0 8px', border: `2px solid ${PALETTE.wood}`, borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
} as const;

/** 할망 튜토리얼: Guide와 같은 자리(HUD 아래)에 초상 + 2줄 대사 + 건너뛰기. 강조 탭은 노란 펄스. */
export function TutorialOverlay() {
  const s = useGame();
  const top = useGuideTop();
  useTutorial();
  useEffect(() => { checkTutorial(s); });
  const step = currentStep();
  // 토스트가 같은 자리를 쓰므로 토스트가 떠 있는 동안은 숨긴다
  if (!step || getToast()) return null;
  const manual = !step.done;
  const lines = stepLines(step, s);
  return (
    <div data-testid="tutorial" data-step={step.id} style={{ position: 'absolute', top, left: 12, right: 12, display: 'flex', alignItems: 'flex-start', gap: 8, pointerEvents: 'none' }}>
      <style>{PULSE_CSS}{step.tab ? `[data-tab="${step.tab}"]${MORE_TAB_NAMES.has(step.tab) ? ', [data-tab="더보기"]:not([aria-expanded="true"])' : ''} { animation: tut-pulse 1s ease-in-out infinite; }` : ''}</style>
      <img className="px" src={assetUrl('assets/icons/portrait_halmang.png')} width={48} height={48} alt="할망" style={{ flex: 'none', imageRendering: 'pixelated' }} />
      <div style={{ flex: 1, background: PALETTE.paper, color: PALETTE.ink, border: `3px solid ${PALETTE.wood}`, boxShadow: `inset 0 0 0 2px ${PALETTE.woodLight}`, padding: '6px 8px', borderRadius: 8, fontSize: 13, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <b style={{ color: PALETTE.title }}>할망의 가르침 {step.id}/{TUTORIAL_STEPS.length}</b>
          <span style={{ display: 'flex', gap: 4 }}>
            {manual && <button style={{ ...smallBtn, background: PALETTE.btnOn, color: PALETTE.btnOnText }} onClick={advanceTutorial}>{step.id === TUTORIAL_STEPS.length ? '끝' : '다음'}</button>}
            <button aria-label="튜토리얼 건너뛰기" style={{ ...smallBtn, background: '#fffaf0', color: PALETTE.inkSoft }} onClick={skipTutorial}>건너뛰기</button>
          </span>
        </div>
        <div>{lines[0]}</div>
        <div>{lines[1]}</div>
      </div>
    </div>
  );
}
