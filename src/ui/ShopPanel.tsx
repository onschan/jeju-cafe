import { useEffect, useState, type CSSProperties } from 'react';
import { ButtonGroup } from './ButtonGroup';
import { useGame, dispatch } from './store';
import { canBuyMileage, canBuyTicket, canDrawTicket, canUseItem, canUseGuestItem, canCraftGift, hasFreeDraw, hasUniform, itemEffect, constructions, unlockedTypeIds, MAX_BUILDERS, josa } from '../sim/index.ts';
import { MILEAGE_SHOP, TICKET_SHOP, UNIFORMS, DRAW_PRIZES, ITEMS, GIFTS, SPECIAL_ITEM_IDS, SPECIAL_ITEM_EFFECT, itemDef, objectDef, uniformDef, guestTypeDef, giftDef, isGiftId, ingredientDef, POPULARITY_FRUIT } from '../data/index.ts';
import { label } from '../data/labels.ts';
import { Popup, Confirm } from './Popup';
import { Icon } from './Icon';
import { sfx } from './audio';
import { card, brownBtn, brownBtnOn, brownBtnOff, PALETTE } from './frame';

type Tab = 'mileage' | 'draw' | 'ticket' | 'codex';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mileage', label: '마일리지' },
  { id: 'draw', label: '인형뽑기' },
  { id: 'ticket', label: '응모권 상점' },
  { id: 'codex', label: '아이템 도감' },
];
/** 인형뽑기 연출 길이 (ms) */
export const DRAW_ANIM_MS = 2000;

const row: CSSProperties = { ...card, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };
const price: CSSProperties = { fontWeight: 700, whiteSpace: 'nowrap' };
const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft };

function statLabel(stat: 'popularity' | 'feePct' | 'scenery'): string {
  return stat === 'popularity' ? '인기' : stat === 'feePct' ? '요금' : '경관';
}
const TAG_LABEL: Record<string, string> = { female: '여성', male: '남성', youth: '청년', adult: '어른', senior: '시니어', group: '단체' };

/** 아이템 도감: 강화 아이템(잘 맞는 시설)·특수 아이템(효과·입수처)·손님 선물(잘 맞는 손님층·입수처). 가진 개수 표시, 제작형 선물은 여기서 만든다. */
function ItemCodex() {
  const s = useGame();
  const have = (id: string) => s.inventory[id] ?? 0;
  const enhance = ITEMS.filter((i) => i.value > 0 && i.fitIds.length > 0);
  const special = SPECIAL_ITEM_IDS.map((id) => itemDef(id));
  const owned = [...enhance, ...special, ...GIFTS].filter((i) => have(i.id) > 0).length;
  const section = (title: string, hint: string) => <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>{title} <span style={{ ...small, fontWeight: 400 }}>{hint}</span></div>;
  return (
    <div data-testid="item-codex">
      <div style={small}>가진 종류 {owned}/{enhance.length + special.length + GIFTS.length}</div>
      {section(`강화 아이템 ${enhance.length}`, '시설 1종에 써요. 잘 맞는 시설이면 ×2')}
      {enhance.map((it) => (
        <div key={it.id} style={{ ...row, opacity: have(it.id) > 0 ? 1 : 0.6 }}>
          <div style={{ flex: 1 }}>
            <div><b>{it.name}</b>{have(it.id) > 0 ? ` ×${have(it.id)}` : ''}</div>
            <div style={small}>{statLabel(it.stat)} +{it.value}{it.stat === 'feePct' ? '%' : ''} · 잘 맞는 시설: {it.fitIds.map((f) => label('facility', f)).join('·')}{it.sourceText ? ` · ${it.sourceText}` : ''}</div>
          </div>
        </div>
      ))}
      {section(`특수 아이템 ${special.length}`, '가지고 있으면 효과가 나요')}
      {special.map((it) => (
        <div key={it.id} style={{ ...row, opacity: have(it.id) > 0 ? 1 : 0.6 }}>
          <div style={{ flex: 1 }}>
            <div><b>{it.name}</b>{have(it.id) > 0 ? ` ×${have(it.id)}` : ''}</div>
            <div style={small}>{SPECIAL_ITEM_EFFECT[it.id] || ''}{it.sourceText ? ` · ${it.sourceText}` : ''}</div>
          </div>
        </div>
      ))}
      {section(`손님 선물 ${GIFTS.length}`, '손님 카드 「선물하기」 — 인기 +3 · 만족 +20, 잘 맞으면 ×2, 하루 1회')}
      {GIFTS.map((g) => {
        const craft = g.source.type === 'craft' ? g.source : null;
        const can = craft ? canCraftGift(s, g.id) : null;
        return (
          <div key={g.id} style={{ ...row, opacity: have(g.id) > 0 ? 1 : 0.6 }}>
            <div style={{ flex: 1 }}>
              <div><b>{g.name}</b>{have(g.id) > 0 ? ` ×${have(g.id)}` : ''}</div>
              <div style={small}>{TAG_LABEL[g.fitTag] ?? g.fitTag} 손님에게 잘 맞아요 · {g.sourceText}{craft ? ` (창고 ${ingredientDef(craft.ingredientId).name} ${s.storage[craft.ingredientId] ?? 0}/${craft.count})` : ''}</div>
            </div>
            {craft && can && (
              <button style={{ ...(can.ok ? brownBtn : brownBtnOff), marginBottom: 0, marginRight: 0 }} disabled={!can.ok} data-testid={`craft-${g.id}`}
                onClick={() => dispatch({ type: 'craftGift', itemId: g.id })}>만들기</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 상점 탭: 마일리지 상점 / 인형뽑기 / 응모권 상점 + 아래 인벤토리 */
export function ShopPanel({ initialTab = 'mileage' }: { initialTab?: Tab } = {}) {
  const s = useGame();
  const [tab, setTab] = useState<Tab>(initialTab);
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
      {tab === 'codex' && <ItemCodex />}
      {tab !== 'codex' && <Inventory />}
    </div>
  );
}

function MileageShop() {
  const s = useGame();
  const busy = constructions(s).length;
  return (
    <div>
      <div style={small}>농협 마일리지로 사요. 마일리지는 월 손님 300명마다·부탁 완료·가이드북 순위·도감 10개마다 받아요.</div>
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
            <span style={price}>{m.price} 마일리지</span>
            <button style={{ ...(can.ok ? brownBtn : brownBtnOff), marginBottom: 0, marginRight: 0 }} data-testid={`buy-${m.id}`}
              onClick={() => { if (!can.ok) { dispatch({ type: 'buyMileage', id: m.id }); return; } Confirm(`${josa(m.name, '을/를')} 마일리지 ${m.price}로 살까요?`, () => dispatch({ type: 'buyMileage', id: m.id }), { title: '마일리지 상점' }); }}>
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
          <ButtonGroup label="입은 유니폼" testId="uniform-select" value={s.uniform ?? ''} onPick={(v) => dispatch({ type: 'setUniform', id: v || null })}
            options={[{ value: '', label: '평상복' }, ...owned.map((u) => ({ value: u.id, label: u.name }))]} />
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
              onClick={() => { if (!can.ok) { dispatch({ type: 'buyTicket', id: t.id }); return; } Confirm(`${josa(t.name, '을/를')} 응모권 ${t.price}장으로 살까요?`, () => dispatch({ type: 'buyTicket', id: t.id }), { title: '응모권 상점' }); }}>
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
      <button style={{ ...(can.ok ? brownBtnOn : brownBtnOff), fontSize: 18, width: '100%', marginRight: 0 }} data-testid="draw-btn" data-tut="draw"
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
        const gift = isGiftId(id);
        return (
          <div key={id} style={row}>
            <div style={{ flex: 1 }}>
              <div><b>{it.name}</b> ×{n}</div>
              <div style={small}>{gift ? `손님 선물 — 손님 카드에서 「선물하기」 (${TAG_LABEL[giftDef(id).fitTag] ?? ''} 손님이면 ×2)` : usable ? id === POPULARITY_FRUIT ? '손님 1종 인기 +10' : `${statLabel(it.stat)} +${it.value}${it.stat === 'feePct' ? '%' : ''} (잘 맞는 시설 ×2)` : SPECIAL_ITEM_EFFECT[id] || it.sourceText || '특별한 아이템'}</div>
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
    Confirm(`${josa(it.name, '을/를')} 모든 ${d.name}에 써서 ${statLabel(it.stat)} +${eff}${it.stat === 'feePct' ? '%' : ''}? (1개를 써요)`, () => dispatch({ type: 'useItem', itemId, objectType: t }), { title: '아이템 사용' });
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

