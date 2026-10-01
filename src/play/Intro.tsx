/** 프롤로그 11컷: 서울의 지친 밤 → 제주 회상 → 사직서 → 비행기 → 할망네 귤밭 → 개업 첫날.
 *  그림은 public/assets/intro/cut{n}.png(320×180). 자막은 타자 효과, 탭하면 즉시 → 한 번 더 탭하면 다음 컷.
 *  1~5컷 'intro'(단조) · 6컷부터 'intro_warm'(장조) · 9컷부터 'title'. 마지막 컷은 간판 불이 깜빡이다 켜진다. */
import { useEffect, useRef, useState } from 'react';
import introJson from './intro.json' with { type: 'json' };
import { assetUrl } from './assetUrl';
import { unlockAudio, bgm, sfx, type BgmName } from './audio';
import { C, btn, btnGold, btnOff, small } from './theme';

interface Cut { id: number; caption: string; speaker: string | null; lines: string[] }
export const INTRO_CUTS = (introJson as { cuts: Cut[] }).cuts;
const LAST = INTRO_CUTS.length - 1;
export const INTRO_SEEN_KEY = 'jeju-cafe:introSeen';
export function hasSeenIntro(): boolean { try { return localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch { return false; } }
export function markIntroSeen(): void { try { localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* noop */ } }
const SPEAKER_KO: Record<string, string> = { hero: '나', halmang: '할망', samchun: '삼춘' };
const FADE_MS = 400;
const TYPE_MS = 45;
const SLOW = new Set([1, 2, 3]);
function cutBgm(cut: number): BgmName { return cut >= 8 ? 'title' : cut >= 5 ? 'intro_warm' : 'intro'; }
export function introImageUrl(cut: number, signOn = false): string { return assetUrl(`assets/intro/cut${cut + 1}${cut === LAST && signOn ? '_on' : ''}.png`); }

export function IntroScreen({ onDone, replay = false }: { onDone: () => void; replay?: boolean }) {
  const [cut, setCut] = useState(0);
  const [n, setN] = useState(0);
  const [dark, setDark] = useState(true);
  const [signOn, setSignOn] = useState(false);
  const timer = useRef(0);
  const text = INTRO_CUTS[cut]!.lines.join('\n');
  const done = n >= text.length;

  useEffect(() => { unlockAudio(); }, []);
  useEffect(() => { void bgm(cutBgm(cut)); }, [cut]);
  // 컷이 바뀌면 검정에서 밝아지며 타자 시작
  useEffect(() => {
    setN(0); setDark(true); setSignOn(false);
    const t = setTimeout(() => setDark(false), FADE_MS);
    return () => clearTimeout(t);
  }, [cut]);
  useEffect(() => {
    if (dark) return;
    const ms = SLOW.has(cut) ? 60 : TYPE_MS;
    let i = 0;
    timer.current = window.setInterval(() => { i++; setN(i); if (i >= text.length) window.clearInterval(timer.current); }, ms);
    return () => window.clearInterval(timer.current);
  }, [dark, cut, text]);
  // 마지막 컷 간판 불
  useEffect(() => {
    if (cut !== LAST || !done) return;
    const ts = [220, 440, 700].map((ms, i) => setTimeout(() => setSignOn(i !== 0), ms));
    return () => ts.forEach(clearTimeout);
  }, [cut, done]);

  const next = () => {
    if (!done) { window.clearInterval(timer.current); setN(text.length); return; }
    if (cut < LAST) { sfx('tap'); setCut(cut + 1); return; }
    finish();
  };
  const finish = () => { markIntroSeen(); onDone(); };
  const c = INTRO_CUTS[cut]!;
  return (
    <div onClick={next} style={{ position: 'absolute', inset: 0, zIndex: 60, background: '#0b0a08', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
      <button style={{ ...btnOff, position: 'absolute', right: 8, top: 8, zIndex: 2, fontSize: 13 }} onClick={(e) => { e.stopPropagation(); finish(); }}>{replay ? '닫기' : '건너뛰기'}</button>
      <div style={{ position: 'relative', width: '100%' }}>
        <img className="px" src={introImageUrl(cut, signOn)} alt="" style={{ width: '100%', display: 'block', imageRendering: 'pixelated', opacity: dark ? 0 : 1, transition: `opacity ${FADE_MS}ms` }} />
        <span style={{ position: 'absolute', left: 8, top: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700, background: '#000a', color: '#fff5dc', borderRadius: 4 }}>{c.caption}</span>
      </div>
      <div style={{ margin: '0 12px', minHeight: '4.2em', color: '#fff5dc', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
        {c.speaker && <span style={{ color: C.gold, fontWeight: 700 }}>{SPEAKER_KO[c.speaker] ?? c.speaker}  </span>}
        {text.slice(0, n)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 12px' }}>
        <span style={{ ...small, color: '#8a7f6c' }}>{cut + 1} / {INTRO_CUTS.length}</span>
        {cut === LAST && done ? <button style={{ ...btnGold, fontSize: 16 }} onClick={(e) => { e.stopPropagation(); finish(); }}>시작</button>
          : <button style={{ ...btn, fontSize: 14 }} onClick={(e) => { e.stopPropagation(); next(); }}>{done ? '다음 ▶' : '▶'}</button>}
      </div>
    </div>
  );
}
