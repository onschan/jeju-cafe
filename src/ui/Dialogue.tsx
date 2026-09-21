import { useEffect, useRef, useState } from 'react';
import { useDialogue, nextPage, closeDialogue, pageLines, pageCount, type DialogueReq } from './dialogue.ts';
import { useGame, pauseGame } from './store';
import { assetUrl } from './assetUrl';
import { guestFace, namedGuestFace } from '../sim/index.ts';
import { namedGuestDef } from '../data/index.ts';
import { staffParts } from '../render/character';
import { Portrait, guestPortraitParts, namedPortraitParts } from './GuestPopup';
import { brownBtn, brownBtnOn, PALETTE } from './frame';

/** 타자 효과: 글자당 ms */
export const TYPE_MS = 20;
const FIXED_PORTRAITS = new Set(['halmang', 'samchun', 'hero', 'haenyeo', 'jangnim', 'pro']); // pro-guide: 프로 삼춘

/** 초상 96×96 (48 원본 2배): 고정 인물은 아이콘 png(portrait_<key>[_<expr>]), 직원·손님 id는 파츠 초상 */
const PORTRAIT_PX = 96;
function Speaker({ portrait }: { portrait: string }) {
  const s = useGame();
  if (FIXED_PORTRAITS.has(portrait)) {
    return <img className="px" src={assetUrl(`assets/icons/portrait_${portrait}.png`)} width={PORTRAIT_PX} height={PORTRAIT_PX} alt="" style={{ flex: 'none', imageRendering: 'pixelated', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, background: PALETTE.paperDark }} />;
  }
  const st = s.staff.find((x) => x.id === portrait) ?? s.candidates.find((x) => x.id === portrait);
  if (st) return <Portrait parts={staffParts(st.face, 'role' in st ? st.role : null, s.uniform ?? null)} face={st.face} />;
  const g = s.guests.find((x) => x.id === portrait);
  if (g?.namedId) { const nd = namedGuestDef(g.namedId); return <Portrait parts={namedPortraitParts(nd.id)} face={namedGuestFace(nd)} />; }
  if (g) return <Portrait parts={guestPortraitParts(g.type)} face={guestFace(g.type)} />;
  return <img className="px" src={assetUrl('assets/icons/portrait_halmang.png')} width={PORTRAIT_PX} height={PORTRAIT_PX} alt="" style={{ flex: 'none', imageRendering: 'pixelated' }} />;
}

/** 한 페이지(최대 2줄)를 타자 효과로. 탭하면 즉시 전부. */
function TypedLines({ lines, done, onDone }: { lines: string[]; done: boolean; onDone: () => void }) {
  const full = lines.join('\n');
  const [n, setN] = useState(done ? full.length : 0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (done) { setN(full.length); return; }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setN(i);
      if (i >= full.length) { window.clearInterval(id); onDoneRef.current(); }
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [full, done]);
  const shown = full.slice(0, n);
  return (
    <div data-testid="dialogue-text" style={{ whiteSpace: 'pre-wrap', minHeight: '2.9em', lineHeight: 1.45, fontSize: 16 }}>
      {shown}
    </div>
  );
}

function DialogueBox({ req, page }: { req: DialogueReq; page: number }) {
  const [typed, setTyped] = useState(false);
  const pages = pageCount(req);
  const last = page >= pages - 1;
  // 페이지가 바뀌면 다시 타자
  useEffect(() => { setTyped(false); }, [page, req]);
  useEffect(() => pauseGame('dialogue'), []);
  const tap = () => {
    if (!typed) { setTyped(true); return; }
    if (!last) nextPage();
  };
  const choices = req.choices && req.choices.length > 0 ? req.choices : null;
  return (
    <div data-testid="dialogue" data-page={page} style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: '#0004' }} onClick={tap}>
      <div style={{ margin: '0 8px calc(8px + env(safe-area-inset-bottom))', minHeight: '30vh', background: PALETTE.paper, color: PALETTE.ink, border: `4px solid ${PALETTE.wood}`, boxShadow: `inset 0 0 0 2px ${PALETTE.woodLight}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }} onClick={tap}>
          <Speaker portrait={req.speaker.portrait} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: PALETTE.title, marginBottom: 4, fontSize: 15 }}>{req.speaker.name}{pages > 1 && <span style={{ color: PALETTE.inkSoft, fontWeight: 400, fontSize: 13 }}> {page + 1}/{pages}</span>}</div>
            <TypedLines lines={pageLines(req, page)} done={typed} onDone={() => setTyped(true)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap', minHeight: 44 }}>
          {(req.onSkipStep || (page === 0 && req.onSkip)) && (
            <span style={{ display: 'flex', gap: 6, marginRight: 'auto' }}>
              {req.onSkipStep && <button aria-label="이미 알아요" data-testid="tutorial-skip-step" style={{ ...brownBtn, margin: 0, background: '#fffaf0', color: PALETTE.inkSoft }} onClick={() => { const skip = req.onSkipStep!; closeDialogue(); skip(); }}>이미 알아요</button>}
              {page === 0 && req.onSkip && <button aria-label="건너뛰기" style={{ ...brownBtn, margin: 0, background: '#fffaf0', color: PALETTE.inkSoft }} onClick={() => { const skip = req.onSkip!; closeDialogue(); skip(); }}>건너뛰기</button>}
            </span>
          )}
          {!typed || !last
            ? <button aria-label="다음" style={{ ...brownBtn, margin: 0 }} onClick={tap}>{typed ? '다음 ▶' : '▶'}</button>
            : choices
              ? choices.map((c) => <button key={c.label} style={{ ...brownBtnOn, margin: 0 }} onClick={() => closeDialogue(c)}>{c.label}</button>)
              : <button aria-label="알겠다" data-testid="dialogue-ok" style={{ ...brownBtnOn, margin: 0 }} onClick={() => closeDialogue()}>알겠다</button>}
        </div>
      </div>
    </div>
  );
}

/** App에 한 번 둔다. showDialogue() 큐의 맨 앞 대화를 그린다. 열려 있는 동안 게임이 멈춘다. */
export function DialogueHost() {
  const { req, page } = useDialogue();
  const s = useGame();
  // 결산 카드·랭킹 발표가 떠 있는 동안은 대화창을 미룬다 (겹치지 않게; SceneHost와 같은 규칙)
  if (!req || s.lastMonthCard || s.lastAnnouncement) return null;
  return <DialogueBox key={req.lines.join('|')} req={req} page={page} />;
}
