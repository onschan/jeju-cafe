import { useEffect, useState, type CSSProperties } from 'react';
import { useGame, dispatch } from './store';
import { canBuyMileage, canBuyTicket, canDrawTicket, canUseItem, canUseGuestItem, hasFreeDraw, hasUniform, itemEffect, constructions, unlockedTypeIds, MAX_BUILDERS } from '../sim/index.ts';
import { MILEAGE_SHOP, TICKET_SHOP, UNIFORMS, DRAW_PRIZES, itemDef, objectDef, uniformDef, guestTypeDef, POPULARITY_FRUIT } from '../data/index.ts';
import { Popup, Confirm } from './Popup';
import { Icon } from './Icon';
import { sfx } from './audio';
import { card, brownBtn, brownBtnOn, brownBtnOff, brownSelect, PALETTE } from './frame';

type Tab = 'mileage' | 'draw' | 'ticket';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mileage', label: '마일리지' },
  { id: 'draw', label: '인형뽑기' },
  { id: 'ticket', label: '응모권 상점' },
];
/** 인형뽑기 연출 길이 (ms) */
export const DRAW_ANIM_MS = 2000;

const row: CSSProperties = { ...card, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };
const price: CSSProperties = { fontWeight: 700, whiteSpace: 'nowrap' };
const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft };

function statLabel(stat: 'popularity' | 'feePct' | 'scenery'): string {
  return stat === 'popularity' ? '인기' : stat === 'feePct' ? '요금' : '경관';
}

/** 상점 탭: 마일리지 상점 / 인형뽑기 / 응모권 상점 + 아래 인벤토리 */
export function ShopPanel() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('mileage');
  return (
    <div data-testid="shop-panel">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span data-testid="shop-wallet"><Icon name="money" /> 마일리지 <b>{s.mileage}</b> · 응모권 <b>{s.tickets}</b>{hasFreeDraw(s) ? ' · 무료 뽑기 1회!' : ''}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: 6 }}>
        {TABS.map((t) => <button key={t.id} style={{ ...(tab === t.id ? brownBtnOn : brownBtn), padding: '0 10px' }} onClick={() => setTab(t.id)} data-testid={`shop-tab-${t.id}`}>{t.label}</button>)}
      </div>
      {tab === 'mileage' && <MileageShop />}
      {tab === 'draw' && <DrawMachine />}
      {tab === 'ticket' && <TicketShop />}
      <Inventory />
    </div>
  );
}

function MileageShop() {
  const s = useGame();
  const busy = constructions(s).length;
  return (
    <div>
      <div style={small}>농협 마일리지로 사요. 마일리지는 부탁 완료·가이드북 순위·도감 10개마다 받아요.</div>
      <div style={{ ...small, marginBottom: 6 }}>일꾼 삼춘 {s.builders}명 (동시에 {s.builders}개까지 지을 수 있어요, 지금 {busy}개 짓는 중)</div>
      {MILEAGE_SHOP.map((m) => {
        const can = canBuyMileage(s, m.id);
        const soldOut = m.id.startsWith('ms_worker_') && (s.builders >= MAX_BUILDERS || s.builders >= Number(m.id.slice(-1)));
        if (soldOut) return null;
        return (
          <div key={m.id} style={row}>
            <div style={{ flex: 1 }}>
              <div><b>{m.name}</b></div>
              <div style={small}>{m.description}</div>
            </div>
            <span style={price}>{m.price}M</span>
            <button style={{ ...(can.ok ? brownBtn : brownBtnOff), marginBottom: 0, marginRight: 0 }} data-testid={`buy-${m.id}`}
              onClick={() => { if (!can.ok) { dispatch({ type: 'buyMileage', id: m.id }); return; } Confirm(`${m.name}을(를) 마일리지 ${m.price}로 살까요?`, () => dispatch({ type: 'buyMileage', id: m.id }), { title: '마일리지 상점' }); }}>
              사기
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TicketShop() {
  const s = useGame();
  const owned = UNIFORMS.filter((u) => hasUniform(s, u.id));
  return (
    <div>
      <div style={{ ...small, marginBottom: 6 }}>응모권으로 사요. 응모권은 매달 1장, 손님이 주고 가기도 해요.</div>
      {owned.length > 0 && (
        <div style={{ ...row }}>
          <span>입은 유니폼</span>
          <select value={s.uniform ?? ''} style={{ ...brownSelect, marginBottom: 0 }} data-testid="uniform-select" onChange={(e) => dispatch({ type: 'setUniform', id: e.target.value || null })}>
            <option value="">(평상복)</option>
            {owned.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}
      {TICKET_SHOP.map((t) => {
        const can = canBuyTicket(s, t.id);
        const has = t.uniformId ? hasUniform(s, t.uniformId) : false;
        const eff = t.uniformId ? uniformDef(t.uniformId).effectText : t.description;
        return (
          <div key={t.id} style={row}>
            <div style={{ flex: 1 }}>
              <div><b>{t.name}</b>{has ? ' ✓' : ''}</div>
              <div style={small}>{eff}</div>
            </div>
            <span style={price}>🎫{t.price}</span>
            <button style={{ ...(can.ok ? brownBtn : brownBtnOff), marginBottom: 0, marginRight: 0 }} data-testid={`buy-${t.id}`}
              onClick={() => { if (!can.ok) { dispatch({ type: 'buyTicket', id: t.id }); return; } Confirm(`${t.name}을(를) 응모권 ${t.price}장으로 살까요?`, () => dispatch({ type: 'buyTicket', id: t.id }), { title: '응모권 상점' }); }}>
              {has ? '있음' : '사기'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** 인형뽑기: 버튼 → sim이 결과를 정하고(lastDraw) → 집게 애니메이션 2초 → 결과 팝업 */
function DrawMachine() {
  const s = useGame();
  const can = canDrawTicket(s);
  const free = hasFreeDraw(s);
  return (
    <div>
      <div style={{ ...small, marginBottom: 6 }}>응모권 1장으로 한 번! 매달 첫 뽑기는 무료예요.</div>
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 13 }}>
        {DRAW_PRIZES.map((p) => <span key={p.kind} style={{ background: PALETTE.paperDark, borderRadius: 4, padding: '2px 6px' }}>{p.label} {p.pct}%</span>)}
      </div>
      <button style={{ ...(can.ok ? brownBtnOn : brownBtnOff), fontSize: 18, width: '100%', marginRight: 0 }} data-testid="draw-btn"
        onClick={() => dispatch({ type: 'drawTicket' })} disabled={s.lastDraw !== null}>
        🕹️ 뽑기 {free ? '(무료!)' : '(응모권 1장)'}
      </button>
    </div>
  );
}

/** 인벤토리: 아이템 목록 + 사용(시설 종류 고르기 / 손님층 고르기) */
function Inventory() {
  const s = useGame();
  const items = Object.entries(s.inventory).filter(([, n]) => n > 0);
  const [picking, setPicking] = useState<string | null>(null);
  if (items.length === 0) return <div style={{ ...small, marginTop: 6 }}>가진 아이템이 없어요. 부탁·인형뽑기·상점에서 모아요.</div>;
  return (
    <div style={{ marginTop: 8 }} data-testid="inventory">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>인벤토리</div>
      {items.map(([id, n]) => {
        let it;
        try { it = itemDef(id); } catch { return null; }
        const usable = it.value > 0 || id === POPULARITY_FRUIT;
        return (
          <div key={id} style={row}>
            <div style={{ flex: 1 }}>
              <div><b>{it.name}</b> ×{n}</div>
              <div style={small}>{usable ? id === POPULARITY_FRUIT ? '손님 1종 인기 +10' : `${statLabel(it.stat)} +${it.value}${it.stat === 'feePct' ? '%' : ''} (잘 맞는 시설 ×2)` : it.sourceText || '특별한 아이템'}</div>
            </div>
            {usable && <button style={{ ...brownBtn, marginBottom: 0, marginRight: 0 }} data-testid={`use-${id}`} onClick={() => setPicking(id)}>사용</button>}
          </div>
        );
      })}
      {picking && (picking === POPULARITY_FRUIT ? <GuestPicker itemId={picking} onClose={() => setPicking(null)} /> : <TargetPicker itemId={picking} onClose={() => setPicking(null)} />)}
    </div>
  );
}

/** 아이템을 쓸 시설 종류 고르기: 지은 적 있는 종류 중 쓸 수 있는 것 */
function TargetPicker({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const s = useGame();
  const it = itemDef(itemId);
  const types = [...new Set(Object.values(s.objects).map((o) => o.type))].filter((t) => canUseItem(s, itemId, t).ok);
  const pick = (t: string) => {
    const d = objectDef(t);
    const eff = itemEffect(it, d);
    onClose();
    Confirm(`${it.name}을(를) 모든 ${d.name}에 써서 ${statLabel(it.stat)} +${eff}${it.stat === 'feePct' ? '%' : ''}? (1개를 써요)`, () => dispatch({ type: 'useItem', itemId, objectType: t }), { title: '아이템 사용' });
  };
  return (
    <Popup title={`${it.name} — 어디에 쓸까요?`} onBackdrop={onClose} buttons={<button style={brownBtn} onClick={onClose}>닫기</button>}>
      {types.length === 0 && <div style={small}>이 아이템을 쓸 수 있는 시설이 아직 없어요.</div>}
      {types.map((t) => {
        const d = objectDef(t);
        const eff = itemEffect(it, d);
        const best = it.fitIds.includes(t);
        return <button key={t} style={{ ...brownBtn, width: '100%', marginRight: 0, textAlign: 'left' }} data-testid={`target-${t}`} onClick={() => pick(t)}>{d.name} {best ? '★ 잘 맞아요' : ''} · {statLabel(it.stat)} +{eff}{it.stat === 'feePct' ? '%' : ''}</button>;
      })}
    </Popup>
  );
}

function GuestPicker({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const s = useGame();
  const ids = unlockedTypeIds(s).filter((id) => canUseGuestItem(s, itemId, id).ok);
  return (
    <Popup title="인기 열매 — 어느 손님에게?" onBackdrop={onClose} buttons={<button style={brownBtn} onClick={onClose}>닫기</button>}>
      {ids.map((id) => (
        <button key={id} style={{ ...brownBtn, width: '100%', marginRight: 0, textAlign: 'left' }} data-testid={`guest-${id}`}
          onClick={() => { onClose(); dispatch({ type: 'useGuestItem', itemId, guestId: id }); }}>
          {guestTypeDef(id).name} · 인기 {Math.floor(s.segmentPopularity[id] ?? 0)} → +10
        </button>
      ))}
    </Popup>
  );
}

/** 인형뽑기 결과 팝업 (App에 한 번 둔다): lastDraw가 생기면 집게가 2초 내려갔다 올라온 뒤 결과를 보여 준다 */
export function DrawPopup() {
  const s = useGame();
  const r = s.lastDraw;
  const [phase, setPhase] = useState<'anim' | 'result'>('anim');
  useEffect(() => {
    if (!r) return;
    setPhase('anim');
    const t = setTimeout(() => { setPhase('result'); sfx(r.kind === 'miss' ? 'meh' : 'fanfare'); }, DRAW_ANIM_MS);
    return () => clearTimeout(t);
  }, [r]);
  if (!r) return null;
  const close = () => dispatch({ type: 'dismissDraw' });
  return (
    <Popup title="인형뽑기" onBackdrop={phase === 'result' ? close : undefined} buttons={phase === 'result' ? <button style={brownBtn} onClick={close} data-testid="draw-close">받기</button> : undefined}>
      <style>{`
        @keyframes claw-drop { 0% { transform: translateY(0) } 40% { transform: translateY(58px) } 60% { transform: translateY(58px) } 100% { transform: translateY(0) } }
        @keyframes prize-rise { 0%, 55% { transform: translateY(0); opacity: .35 } 100% { transform: translateY(-58px); opacity: 1 } }
        @keyframes prize-pop { 0% { transform: scale(.6) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }
      `}</style>
      <div data-testid="draw-anim" data-phase={phase} style={{ position: 'relative', height: 120, background: `linear-gradient(#bfe3ff, ${PALETTE.paperDark})`, border: `3px solid ${PALETTE.wood}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, background: PALETTE.wood }} />
        <div style={{ position: 'absolute', left: '50%', top: 10, width: 2, height: 24, marginLeft: -1, background: '#444', animation: phase === 'anim' ? `claw-drop ${DRAW_ANIM_MS}ms ease-in-out forwards` : undefined }} />
        <div style={{ position: 'absolute', left: '50%', top: 30, marginLeft: -14, fontSize: 24, lineHeight: 1, animation: phase === 'anim' ? `claw-drop ${DRAW_ANIM_MS}ms ease-in-out forwards` : undefined }}>🤏</div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 6, textAlign: 'center', fontSize: 22, letterSpacing: 6, opacity: 0.55 }}>🧸🎁🍬🎁🧸</div>
        <div style={{ position: 'absolute', left: '50%', bottom: 8, marginLeft: -14, fontSize: 26, lineHeight: 1, animation: phase === 'anim' ? `prize-rise ${DRAW_ANIM_MS}ms ease-in-out forwards` : `prize-pop 400ms ease-out` }}>{prizeEmoji(r.kind)}</div>
      </div>
      {phase === 'result' ? (
        <div data-testid="draw-result">
          <div style={{ fontSize: 18, fontWeight: 700 }}>{r.kind === 'miss' ? '꽝!' : `${r.label}!`}</div>
          <div>{r.text}</div>
          {r.free && <div style={small}>이달 무료 뽑기였어요</div>}
        </div>
      ) : <div style={small}>집게가 내려가요…</div>}
    </Popup>
  );
}

function prizeEmoji(kind: string): string {
  switch (kind) {
    case 'money': return '💰';
    case 'research': return '📘';
    case 'ingredient_box': return '📦';
    case 'mileage': return '🏅';
    case 'item': return '🎁';
    case 'seed': return '🌱';
    case 'uniform_piece': return '🧵';
    default: return '🫧';
  }
}

