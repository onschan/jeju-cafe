/** 메시지 줄 24px (UX §5.5): 하단 바 바로 위. 왼쪽 마스코트(삼춘) 초상 20px + 한 줄 텍스트.
 *  3초 뒤 회색으로 남고 새 메시지가 오면 교체. 탭하면 최근 10개가 위로 펼쳐진다(다시 탭하면 접힘). */
import { useState } from 'react';
import { useGame, getMessages, isMessageFresh } from './store';
import { assetUrl } from './assetUrl';
import { PALETTE } from './frame';

export const MESSAGE_LINE_H = 24;

export function MessageLine({ bottom }: { bottom: number }) {
  useGame();
  const [open, setOpen] = useState(false);
  const list = getMessages();
  const head = list[0];
  const fresh = head ? isMessageFresh(head) : false;
  return (
    <div data-testid="message-line" style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`, zIndex: 11, pointerEvents: head ? 'auto' : 'none' }}>
      {open && list.length > 1 && (
        <div data-testid="message-list" style={{ position: 'absolute', left: 6, right: 6, bottom: MESSAGE_LINE_H + 4, background: PALETTE.paper, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '4px 8px', fontSize: 13, color: PALETTE.inkSoft, maxHeight: '40vh', overflowY: 'auto' }}>
          {list.map((m) => <div key={m.id} style={{ lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {m.text}</div>)}
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)} aria-label="최근 메시지" aria-expanded={open}
        style={{ width: '100%', height: MESSAGE_LINE_H, padding: '0 8px', border: 0, borderTop: `1px solid ${PALETTE.woodLight}`, background: fresh ? PALETTE.paper : PALETTE.paperDark, color: fresh ? PALETTE.ink : PALETTE.inkSoft, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box', transition: 'background .3s, color .3s' }}>
        <img className="px" src={assetUrl('assets/icons/portrait_samchun.png')} width={20} height={20} alt="" style={{ flex: 'none', imageRendering: 'pixelated', borderRadius: 3, opacity: head ? 1 : 0.4 }} />
        <span data-testid="message-text" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{head?.text ?? ''}</span>
      </button>
    </div>
  );
}
