import { useState } from 'react';
import { useGame, dispatch } from './store';
import { parcelPrice, canBuyParcel, parcelFeature, featureOpen, goalForFeature, josa, type Parcel } from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { brownBtn, brownBtnOn, brownBtnOff, PALETTE } from './frame';

/** 필지 3×3 지도 (fun-rank, 스펙 §5): 장부 › 투자 맨 위. 칸마다 이름·특징 아이콘·가격·소유 표시, 고르면 아래에 "사면 생기는 것" 한 줄 + 사기 버튼.
 *  격자는 sim 좌표(p.x, p.y)를 필지 크기로 나눈 열·행 그대로라 맵과 같은 배치다. */
export function ParcelMap() {
  const s = useGame();
  const [picked, setPicked] = useState<string | null>(null);
  const parcels = [...s.parcels].sort((a, b) => a.y - b.y || a.x - b.x);
  const cols = new Set(parcels.map((p) => p.x)).size || 3;
  const open = featureOpen(s, 'parcel');
  const opener = goalForFeature('parcel');
  const sel = parcels.find((p) => p.id === picked) ?? null;
  const owned = parcels.filter((p) => p.owned).length;
  return (
    <div data-testid="parcel-map" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <b style={{ fontSize: 16 }}><Icon name="map" /> 우리 땅 {owned}/{parcels.length}</b>
        <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>{open ? '땅마다 생기는 것이 다르다' : opener ? `「${opener.title}」 뒤에 살 수 있다` : '아직 살 수 없다'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
        {parcels.map((p) => <ParcelCell key={p.id} p={p} picked={picked === p.id} onPick={() => setPicked(picked === p.id ? null : p.id)} />)}
      </div>
      {sel && <ParcelDetail p={sel} onDone={() => setPicked(null)} />}
    </div>
  );
}

function ParcelCell({ p, picked, onPick }: { p: Parcel; picked: boolean; onPick: () => void }) {
  const s = useGame();
  const f = parcelFeature(p);
  const can = p.owned ? null : canBuyParcel(s, p.id);
  const bg = p.owned ? '#e6f0d8' : can?.ok ? '#fff6dc' : '#e9e2d4';
  return (
    <button data-testid={`parcel-cell-${p.id}`} aria-label={`${p.name} ${p.owned ? '우리 땅' : wonText(parcelPrice(s, p))}`} onClick={onPick}
      style={{ ...brownBtn, margin: 0, padding: '6px 4px', minHeight: 64, height: 'auto', background: bg, color: PALETTE.ink, border: `2px solid ${picked ? PALETTE.btnOn : PALETTE.woodLight}`, boxShadow: picked ? `0 0 0 2px ${PALETTE.btnOn}` : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <Icon name={f.icon} size={20} alt={f.feature} />
      <b style={{ fontSize: 13, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
      <span style={{ fontSize: 12, color: p.owned ? PALETTE.ok : PALETTE.inkSoft }}>{p.owned ? '우리 땅' : wonText(parcelPrice(s, p), true)}</span>
    </button>
  );
}

function ParcelDetail({ p, onDone }: { p: Parcel; onDone: () => void }) {
  const s = useGame();
  const f = parcelFeature(p);
  const can = canBuyParcel(s, p.id);
  const price = parcelPrice(s, p);
  const buy = () => Confirm(`${josa(p.name, '을/를')} ${wonText(price)}에 산다. ${f.gain}`, () => { if (dispatch({ type: 'buyParcel', id: p.id }).ok) onDone(); }, { title: '땅 사기' });
  return (
    <div data-testid="parcel-detail" style={{ marginTop: 6, background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, padding: '8px 10px', fontSize: 14, lineHeight: 1.4 }}>
      <div><Icon name={f.icon} size={18} alt="" /> <b>{p.name}</b> <span style={{ color: PALETTE.inkSoft }}>· {f.feature} · {p.w}×{p.h}칸</span></div>
      <div>{f.gain}</div>
      {p.owned
        ? <div style={{ color: PALETTE.ok }}>우리 땅이다. {josa(f.landmark, '이/가')} 마당에 보인다</div>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ flex: 1, color: can.ok ? PALETTE.ink : PALETTE.inkSoft }}>{wonText(price)}{!can.ok && can.reason ? ` · ${can.reason}` : ''}</span>
            <button data-testid="parcel-buy" style={{ ...(can.ok ? brownBtnOn : brownBtnOff), margin: 0, padding: '0 14px' }} disabled={!can.ok} onClick={buy}><Icon name="money" /> 사기</button>
          </div>}
    </div>
  );
}
