import { useSyncExternalStore, type ReactNode } from 'react';
import { frame, frameTitle, brownBtn, PALETTE } from './frame';

/** 갈색 프레임 모달. 제목 띠 + 본문 + (선택) 초상 + 버튼 줄. */
export function Popup({ title, portrait, children, buttons, onBackdrop, z = 50 }: {
  title?: string;
  portrait?: string;
  children: ReactNode;
  buttons?: ReactNode;
  onBackdrop?: () => void;
  /** 겹치는 모달끼리의 순서. 기본 50, 확인 팝업(PopupHost)은 60 — 같은 50이면 나중에 붙은 포털이 확인 팝업을 덮는다 */
  z?: number;
}) {
  return (
    // 전체 화면 창(30)·대화창(40) 안에서 띄운 팝업이 그 위에 오도록 50, 확인 팝업은 60
    <div style={{ position: 'absolute', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: z, padding: 16 }} onClick={onBackdrop}>
      <div style={{ ...frame, minWidth: 240, maxWidth: 340, width: '100%', maxHeight: '80vh', overflowY: 'auto', fontSize: 16 }} onClick={(e) => e.stopPropagation()}>
        {title && <div style={frameTitle}>{title}</div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {portrait && <img className="px" src={portrait} width={64} height={64} alt="" style={{ flex: 'none', imageRendering: 'pixelated' }} />}
          <div style={{ flex: 1, lineHeight: 1.5 }}>{children}</div>
        </div>
        {buttons && <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>{buttons}</div>}
      </div>
    </div>
  );
}

// ---------- 확인 팝업 (모듈 스토어) ----------

interface ConfirmReq { text: string; title?: string; portrait?: string; yes: string; no: string; resolve: (ok: boolean) => void }
let current: ConfirmReq | null = null;
let version = 0;
const listeners = new Set<() => void>();
function emit() { version++; for (const l of listeners) l(); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

/** "네/아니요" 확인. 이미 떠 있는 팝업이 있으면 그것을 먼저 취소한다. */
export function confirm(text: string, opts: { title?: string; portrait?: string; yes?: string; no?: string } = {}): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { text, title: opts.title, portrait: opts.portrait, yes: opts.yes ?? '네', no: opts.no ?? '아니요', resolve };
    emit();
  });
}

/** 콜백 스타일 도우미: 네를 누르면 onYes 실행 */
export function Confirm(text: string, onYes: () => void, opts?: { title?: string; portrait?: string }): void {
  void confirm(text, opts).then((ok) => { if (ok) onYes(); });
}

function answer(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}

/** App에 한 번만 둔다. confirm()이 요청한 팝업을 그린다. */
export function PopupHost() {
  useSyncExternalStore(subscribe, () => version, () => version);
  if (!current) return null;
  return (
    <Popup title={current.title ?? '확인'} portrait={current.portrait} z={60} onBackdrop={() => answer(false)}
      buttons={<>
        <button style={{ ...brownBtn, background: '#fffaf0', color: PALETTE.ink }} onClick={() => answer(false)}>{current.no}</button>
        <button style={brownBtn} onClick={() => answer(true)}>{current.yes}</button>
      </>}>
      {current.text}
    </Popup>
  );
}
