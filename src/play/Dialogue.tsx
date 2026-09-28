import { useEffect, useRef, useState } from 'react';
import { useDialogue, nextPage, closeDialogue, pageLines, pageCount, type DialogueReq } from './dialogueStore';
import { assetUrl } from './assetUrl';
import { C, panel, btn, btnGold, small } from './theme';

/** 타자 효과: 글자당 ms */
const TYPE_MS = 18;
const PORTRAIT_PX = 80;

/** 고정 인물 초상 (assets/icons/portrait_<key>[_<expr>].png, 48 원본을 96으로) */
export function FixedPortrait({ id, expr = 'normal', size = PORTRAIT_PX }: { id: string; expr?: 'normal' | 'happy' | 'surprised'; size?: number }) {
  const name = expr === 'normal' ? `portrait_${id}` : `portrait_${id}_${expr}`;
  return <img className="px" src={assetUrl(`assets/icons/${name}.png`)} width={size} height={size} alt="" style={{ flex: 'none', imageRendering: 'pixelated', border: `2px solid #b07a48`, borderRadius: 6, background: '#efe6d2' }} />;
}

function TypedLines({ lines, done, onDone }: { lines: string[]; done: boolean; onDone: () => void }) {
  const full = lines.join('\n');
  const [n, setN] = useState(done ? full.length : 0);
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone;
  useEffect(() => {
    if (done) { setN(full.length); return; }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => { i++; setN(i); if (i >= full.length) { window.clearInterval(id); onDoneRef.current(); } }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [full, done]);
  return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all', minHeight: '2.9em', lineHeight: 1.4, fontSize: 14 }}>{full.slice(0, n)}</div>;
}

function DialogueBox({ req, page }: { req: DialogueReq; page: number }) {
  const [typed, setTyped] = useState(false);
  const pages = pageCount(req);
  const last = page >= pages - 1;
  useEffect(() => { setTyped(false); }, [page, req]);
  const tap = () => { if (!typed) { setTyped(true); return; } if (!last) nextPage(); };
  const choices = req.choices && req.choices.length > 0 ? req.choices : null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: '#0004' }} onClick={tap}>
      <div style={{ ...panel, margin: '0 8px', marginBottom: 'calc(124px + env(safe-area-inset-bottom))', maxHeight: '46vh', display: 'flex', flexDirection: 'column', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1, minHeight: 0, overflow: 'hidden' }} onClick={tap}>
          <FixedPortrait id={req.speaker.portrait} expr={req.speaker.expr} />
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, color: C.wood, marginBottom: 4, fontSize: 15 }}>{req.speaker.name}{pages > 1 && <span style={small}> {page + 1}/{pages}</span>}</div>
            <TypedLines lines={pageLines(req, page)} done={typed} onDone={() => setTyped(true)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
          {!typed || !last
            ? <button style={btn} onClick={tap}>{typed ? '다음 ▶' : '▶'}</button>
            : choices
              ? choices.map((c) => <button key={c.label} style={btnGold} onClick={() => closeDialogue(c)}>{c.label}</button>)
              : <button style={btnGold} onClick={() => closeDialogue()}>알겠다</button>}
        </div>
      </div>
    </div>
  );
}
/** App에 한 번 둔다. 큐 맨 앞 대화를 그린다. 열려 있는 동안 게임은 App이 멈춘다. */
export function DialogueHost() {
  const { req, page } = useDialogue();
  if (!req) return null;
  return <DialogueBox key={req.lines.join('|')} req={req} page={page} />;
}
