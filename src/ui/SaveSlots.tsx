import { useCallback, useEffect, useState } from 'react';
import { wonText } from '../data/labels.ts';
import { josa } from '../sim/josa.ts';
import { Popup, Confirm } from './Popup';
import { card, brownBtn, brownBtnOff, dangerBtn, PALETTE } from './frame';
import { slotSummaries, loadSlot, saveSlot, deleteSlot, AUTO_SLOT, SLOT_COUNT, type SlotSummary } from './store';

const smallBtn = { ...brownBtn, minHeight: 44, fontSize: 14, padding: '0 10px', marginBottom: 0 } as const;

function slotName(n: number) { return n === AUTO_SLOT ? '자동 저장' : `슬롯 ${n}`; }

function Stars({ n }: { n: number }) {
  return <span style={{ color: '#e0a24c', letterSpacing: -1 }} aria-label={`★${n}`}>{'★'.repeat(n)}<span style={{ color: PALETTE.paperDark }}>{'★'.repeat(5 - n)}</span></span>;
}

function Row({ n, sum, mode, onLoad, onSave, onDelete }: { n: number; sum: SlotSummary | null; mode: 'load' | 'save'; onLoad: () => void; onSave: () => void; onDelete: () => void }) {
  const canSave = mode === 'save' && n !== AUTO_SLOT;
  return (
    <div style={{ ...card, marginBottom: 6 }} data-testid={`slot-${n}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <b>{slotName(n)}</b>
        {sum && <Stars n={sum.stars} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 13, color: PALETTE.inkSoft, whiteSpace: 'nowrap' }}>
          {sum ? `${sum.year}년 ${sum.month}월 ${sum.day}일 · ${wonText(sum.money, true)}` : '비어 있음'}
        </span>
        <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
          {mode === 'load' && <button style={sum ? smallBtn : { ...brownBtnOff, ...smallBtn, opacity: 0.45 }} disabled={!sum} onClick={onLoad}>불러오기</button>}
          {canSave && <button style={smallBtn} onClick={onSave}>저장</button>}
          {sum && <button style={{ ...dangerBtn, ...smallBtn, background: '#8a2a2a' }} onClick={onDelete}>삭제</button>}
        </span>
      </div>
    </div>
  );
}

/** 자동 저장 + 슬롯 3. load 모드는 타이틀(이어하기), save 모드는 게임 안 메뉴에서 쓴다. */
export function SaveSlots({ mode, onClose, onLoaded }: { mode: 'load' | 'save'; onClose: () => void; onLoaded?: () => void }) {
  const [sums, setSums] = useState<(SlotSummary | null)[] | null>(null);
  const refresh = useCallback(() => { void slotSummaries().then(setSums); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const load = (n: number) => { void loadSlot(n).then((ok) => { if (ok) { onClose(); onLoaded?.(); } else refresh(); }); };
  const save = (n: number, exists: boolean) => {
    const go = () => { void saveSlot(n).then(refresh); };
    if (exists) Confirm(`${slotName(n)}에 덮어쓸까요?`, go, { title: '저장' });
    else go();
  };
  const del = (n: number) => Confirm(`${josa(slotName(n), '을/를')} 지울까요? 되돌릴 수 없어요.`, () => { deleteSlot(n); refresh(); }, { title: '삭제' });
  return (
    <Popup title={mode === 'load' ? '이어하기' : '슬롯에 저장'} onBackdrop={onClose}
      buttons={<button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={onClose}>닫기</button>}>
      {!sums && <div style={{ color: PALETTE.inkSoft }}>불러오는 중…</div>}
      {sums && Array.from({ length: SLOT_COUNT + 1 }, (_, n) => (
        <Row key={n} n={n} sum={sums[n] ?? null} mode={mode} onLoad={() => load(n)} onSave={() => save(n, !!sums[n])} onDelete={() => del(n)} />
      ))}
    </Popup>
  );
}
