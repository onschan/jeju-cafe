import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { INTRO_CUTS, SPEAKER_NAME } from '../data/dialogue/index.ts';
import { frame, brownBtn, brownBtnOn, PALETTE } from './frame';
import { unlockAudio, bgm, sfx } from './audio';
import { assetUrl } from './assetUrl';

/** 프롤로그 컷신 (intro): 「새 게임」 → 6컷(서울 야근 → 만원 지하철 → 사직서 → 비행기 → 폐창고 → 카페 간판) → 튜토리얼 ①.
 *  이어하기엔 안 뜬다. 타이틀 설정 「프롤로그 다시 보기」는 replay 모드(끝나면 타이틀로, BGM은 타이틀 그대로).
 *  그림은 public/assets/intro/cut{n}.png(320×180, 화면엔 가로 꽉 채워 2배). 자막은 타자 효과(탭하면 즉시 → 한 번 더 탭하면 다음 컷).
 *  컷 전환은 검정 페이드 400ms. 1~3컷은 'intro' BGM(잔잔한 단조), 4컷부터 타이틀 BGM, 끝나면 봄 BGM.
 *  마지막 컷은 자막이 다 나오면 간판 불이 깜빡이다 켜지고(cut6 ↔ cut6_on) 「시작」 버튼. */

export const INTRO_SEEN_KEY = 'jeju-cafe:introSeen';
const FADE_MS = 400;
const TYPE_MS = 45;
/** 간판 불 깜빡임: off→on→off→on(유지) 간격 */
const SIGN_BLINK_MS = [0, 220, 440, 700];
const LAST = INTRO_CUTS.length - 1;

export function markIntroSeen(): void {
  try { localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* noop */ }
}
export function hasSeenIntro(): boolean {
  try { return localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch { return false; }
}

export function introImageUrl(cut: number, signOn = false): string {
  return assetUrl(`assets/intro/cut${cut + 1}${cut === LAST && signOn ? '_on' : ''}.png`);
}

/** 그림 위 작은 라벨 (장소·시간) */
const captionStyle: CSSProperties = {
  position: 'absolute', left: 6, top: 6, padding: '2px 8px', fontSize: 13, fontWeight: 700,
  background: '#000a', color: '#fff5dc', borderRadius: 4, letterSpacing: 0.5,
};
const skipStyle: CSSProperties = {
  ...brownBtn, position: 'absolute', right: 8, top: 'calc(8px + env(safe-area-inset-top))', margin: 0, minHeight: 44, fontSize: 15,
  background: '#fffaf0', color: PALETTE.inkSoft, zIndex: 2,
};

export function IntroScreen({ onDone, replay = false }: { onDone: () => void; replay?: boolean }) {
  const [cut, setCut] = useState(0);
  const [typedN, setTypedN] = useState(0);
  const [typedDone, setTypedDone] = useState(false);
  const [dark, setDark] = useState(true);          // 검정 오버레이 (페이드)
  const [signOn, setSignOn] = useState(false);
  const [signDone, setSignDone] = useState(false);
  const busy = useRef(false);                       // 페이드 중 탭 무시
  const c = INTRO_CUTS[cut]!;
  const full = c.lines.join('\n');
  const isLast = cut === LAST;

  // 그림 7장 미리 읽기 + 첫 페이드 인 + 1컷 BGM
  useEffect(() => {
    for (let i = 0; i <= LAST; i++) { const im = new Image(); im.src = introImageUrl(i); }
    const im = new Image(); im.src = introImageUrl(LAST, true);
    const id = window.setTimeout(() => setDark(false), 30);
    if (!replay) void bgm('intro');
    return () => window.clearTimeout(id);
  }, [replay]);

  // 4컷부터 타이틀 BGM (다시 보기는 타이틀 BGM이 이미 흐른다)
  useEffect(() => { if (!replay && cut >= 3) void bgm('title'); }, [cut, replay]);

  // 타자 효과
  useEffect(() => {
    setTypedN(0); setTypedDone(false);
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setTypedN(i);
      if (i >= full.length) { window.clearInterval(id); setTypedDone(true); }
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [full]);

  // 마지막 컷: 자막이 끝나면 간판 불 깜빡 → 켜짐
  useEffect(() => {
    if (!isLast || !typedDone) return;
    const ids = SIGN_BLINK_MS.map((ms, i) => window.setTimeout(() => { setSignOn(i % 2 === 1); if (i === 1) sfx('unlock'); if (i === SIGN_BLINK_MS.length - 1) setSignDone(true); }, ms + 200));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [isLast, typedDone]);

  const finish = () => {
    if (busy.current) return;
    busy.current = true;
    markIntroSeen();
    setDark(true);
    window.setTimeout(() => { if (!replay) void bgm('spring'); onDone(); }, FADE_MS);
  };
  const next = () => {
    if (busy.current) return;
    if (!typedDone) { setTypedN(full.length); setTypedDone(true); return; }
    if (isLast) { if (signDone) finish(); return; }
    busy.current = true;
    sfx('tap');
    setDark(true);
    window.setTimeout(() => { setCut(cut + 1); setDark(false); busy.current = false; }, FADE_MS);
  };
  const onPointerDown = () => { unlockAudio(); if (!replay) void bgm(cut >= 3 ? 'title' : 'intro'); };
  const shown = full.slice(0, typedN);
  const btnLabel = !typedDone ? '▶ 다음' : isLast ? (signDone ? '☕ 시작' : '…') : '▶ 다음';

  return (
    <div data-testid="intro" data-cut={cut + 1} onPointerDownCapture={onPointerDown} onClick={next}
      style={{ position: 'absolute', inset: 0, background: '#000', color: PALETTE.ink, fontFamily: "'Galmuri11', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'calc(56px + env(safe-area-inset-top)) 0 calc(16px + env(safe-area-inset-bottom))', overflow: 'hidden' }}>
      <button data-testid="intro-skip" aria-label="건너뛰기" style={skipStyle} onClick={(e) => { e.stopPropagation(); finish(); }}>건너뛰기</button>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
          <img className="px" data-testid="intro-image" src={introImageUrl(cut, signOn)} alt="" draggable={false}
            style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', userSelect: 'none' }} />
          <div style={captionStyle}>{c.caption}</div>
        </div>
        <div style={{ margin: '0 8px' }}>
          <div style={{ ...frame, minHeight: 112, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {c.speaker && <div style={{ fontSize: 14, fontWeight: 700, color: PALETTE.inkSoft }}>{SPEAKER_NAME[c.speaker]}</div>}
            <div data-testid="intro-text" style={{ whiteSpace: 'pre-wrap', fontSize: 17, lineHeight: 1.5, flex: 1, minHeight: '3em' }}>{shown}</div>
            <button data-testid="intro-next" aria-label={isLast && signDone ? '시작' : '다음'} disabled={isLast && typedDone && !signDone}
              style={{ ...(isLast && signDone ? brownBtnOn : brownBtn), width: '100%', margin: 0, minHeight: 46, fontSize: 17 }}
              onClick={(e) => { e.stopPropagation(); next(); }}>{btnLabel}</button>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#fff5dc88' }}>{cut + 1} / {INTRO_CUTS.length}</div>
      </div>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none', opacity: dark ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }} />
    </div>
  );
}
