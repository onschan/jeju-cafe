/** 손님 목소리 피드 (trim의 ★ 추가): 메시지 줄 바로 위에 최근 후기 3줄.
 *  한 줄을 탭하면 원인으로 카메라가 가고 해결 버튼이 펼쳐진다 — 자리 없음 → 가장 붐비는 좌석 + 「자리 늘리기」,
 *  더러움 → 가장 낡은 시설 + 「치우러 가기」, 비쌈 → 메뉴판, 기다림 → 직원 창. 좋은 말은 카메라만. */
import { useEffect, useState, type CSSProperties } from 'react';
import { useGame } from './store';
import { recentVoices, voiceText, receiptText, RECEIPT_MS, VOICE_FIX, VOICE_FIX_LABEL, type VoiceLine, type VoiceFix, type Receipt } from '../sim/voice.ts';
import { guestFace } from '../sim/index.ts';
import { Face } from './Bars';
import { PALETTE } from './frame';
import { Icon } from './Icon';

export const VOICE_FEED_MAX = 3;
/** 줄 하나 높이 */
export const VOICE_ROW_H = 22;

const ICON: Record<VoiceLine['reason'], string> = {
  no_seat: 'chair', wait_long: 'clock', expensive: 'money', dirty: 'warn', view: 'view', corner: 'sparkle',
};
const GOOD = new Set<VoiceLine['reason']>(['view', 'corner']);

const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: VOICE_ROW_H, padding: '0 8px',
  border: 0, borderRadius: 4, fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
  whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box',
};

export interface VoiceFeedProps {
  bottom: number;
  /** 원인 칸으로 카메라 이동 */
  onFocus(x: number, y: number): void;
  /** 해결 버튼 */
  onFix(fix: VoiceFix): void;
}

/** video P0-5 영수증 한 줄: 손님이 나갈 때마다 〈얼굴 · 손님층 · 인기 +N · ₩N〉. RECEIPT_MS 뒤에 사라지고 다음 손님 줄로 교체된다. */
function ReceiptLine({ receipt }: { receipt: Receipt | undefined }) {
  const [shown, setShown] = useState<Receipt | null>(null);
  const id = receipt?.id;
  useEffect(() => {
    if (!receipt) return;
    setShown(receipt);
    const t = window.setTimeout(() => setShown((cur) => (cur?.id === receipt.id ? null : cur)), RECEIPT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!shown) return null;
  return (
    <div data-testid="receipt-line" data-guest={shown.typeId} style={{ ...row, background: PALETTE.btnOn, color: PALETTE.ink, border: `1px solid ${PALETTE.wood}`, fontWeight: 700 }}>
      <Face face={guestFace(shown.typeId)} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{receiptText(shown)}</span>
    </div>
  );
}

export function VoiceFeed({ bottom, onFocus, onFix }: VoiceFeedProps) {
  const s = useGame();
  const [openId, setOpenId] = useState<string | null>(null);
  const lines = recentVoices(s, VOICE_FEED_MAX);
  if (lines.length === 0 && !s.receipt) return null;
  const pick = (v: VoiceLine) => {
    if (v.cell) onFocus(v.cell.x, v.cell.y);
    setOpenId((id) => (id === v.id ? null : v.id));
  };
  return (
    <div data-testid="voice-feed" style={{ position: 'absolute', left: 6, right: 6, bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`, zIndex: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <ReceiptLine receipt={s.receipt} />
      {lines.map((v, i) => {
        const fix = VOICE_FIX[v.reason];
        const good = GOOD.has(v.reason);
        const open = openId === v.id;
        return (
          <div key={v.id}>
            <button data-testid="voice-line" data-reason={v.reason} onClick={() => pick(v)} aria-label={voiceText(v)}
              style={{ ...row, background: good ? PALETTE.btnOn : PALETTE.paper, color: good ? PALETTE.ink : PALETTE.bad, opacity: 1 - i * 0.25, border: `1px solid ${PALETTE.woodLight}` }}>
              <Icon name={ICON[v.reason]} size={14} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', color: PALETTE.ink }}>{voiceText(v)}</span>
              {v.count > 1 && <b style={{ color: good ? PALETTE.ok : PALETTE.bad }}>{v.count}</b>}
            </button>
            {open && fix !== 'none' && (
              <button data-testid="voice-fix" data-fix={fix} onClick={() => { onFix(fix); setOpenId(null); }}
                style={{ ...row, marginTop: 2, height: 44, background: PALETTE.btn, color: PALETTE.ink, fontWeight: 700, border: `2px solid ${PALETTE.wood}` }}>
                <Icon name="check" size={14} /> {VOICE_FIX_LABEL[fix]}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
