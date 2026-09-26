/** 새 조작 (2단계). 창은 넷: 건축 · 손님층 · 정보 · 시스템. 그 밖엔 시설 카드(손익계산서)와 하단 띠(목표 한 줄 · 영수증 · 손님/자리/인기)뿐. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { View, ghostOf, type Ghost } from './View';
import { useGame, useRev, dispatch, startLoop, getState, save, restart, toasts } from './store';
import { C, panel, btn, btnOff, btnGold, small, won, wonShort } from './theme';
import { FACILITIES, GUEST_TYPES, MENUS, INVESTS, facilityDef, isFloorDef, isUsable, sheetOf, usables, popularitySum, dailyGuests, unlockables, canUnlock, canLevelUp, levelUp, LEVEL_COST, currentObjective, OBJECTIVES, seasonOf, canHire, upkeepTotal, wagesTotal, myScore, rivalScore, RIVALS, lineCells, canLayFloor, type GameState, type Tab, type Facility, type Pt } from '../game/index.ts';

type Win = 'build' | 'guests' | 'info' | 'system' | null;
const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' } as const;
const TAB_KO: Record<Tab, string> = { env: '환경', seat: '시설', shop: '가게' };

export function App() {
  const s = useGame(); useRev();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const [ready, setReady] = useState(false);
  const [win, setWin] = useState<Win>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lineFrom = useRef<Pt | null>(null);
  const placingRef = useRef<string | null>(null); placingRef.current = placing;
  const ghostRef = useRef<Ghost | null>(null); ghostRef.current = ghost;

  useEffect(() => {
    const v = new View(); viewRef.current = v;
    let stop = () => {};
    v.init(hostRef.current!, {
      onTap: (x, y) => {
        const st = getState();
        const id = placingRef.current;
        if (id) {
          const d = facilityDef(id);
          if (isFloorDef(d)) { const r = dispatch({ type: 'placeLine', id, from: { x, y }, to: { x, y } }); if (!r.ok) flash(r.reason); setGhost(ghostOf(st, id, x, y)); return; }
          const g = ghostOf(st, id, x, y);
          if (g.ok) { const r = dispatch({ type: 'place', id, x, y }); if (!r.ok) flash(r.reason); } // 안 되는 까닭은 배치 띠가 말한다
          setGhost(ghostOf(getState(), id, x, y));
          return;
        }
        const cell = st.grid.cells[y * st.grid.w + x];
        setSelected(cell?.objectId ?? null);
      },
      dragCapture: (x, y) => { const id = placingRef.current; if (!id || !isFloorDef(facilityDef(id))) return false; lineFrom.current = { x, y }; setGhost(ghostOf(getState(), id, x, y, { from: { x, y }, to: { x, y } })); return true; },
      onDragCell: (x, y) => { const id = placingRef.current; const from = lineFrom.current; if (!id || !from) return; setGhost(ghostOf(getState(), id, x, y, { from, to: { x, y } })); },
      onDragEnd: () => { const id = placingRef.current; const from = lineFrom.current; const g = ghostRef.current; lineFrom.current = null; if (!id || !from || !g?.line) return; const r = dispatch({ type: 'placeLine', id, from: g.line.from, to: g.line.to }); if (!r.ok) flash(r.reason); setGhost(ghostOf(getState(), id, g.line.to.x, g.line.to.y)); },
    }).then(() => { v.centerOn(getState()); setReady(true); stop = startLoop(); });
    (window as unknown as { __view: View; __game: unknown }).__view = v; // 디버그·자동 검증용 (봇·브라우저 스크립트)
    (window as unknown as { __game: unknown }).__game = { getState, dispatch };
    const tick = () => { v.sync(getState(), ghostRef.current, performance.now()); raf = requestAnimationFrame(tick); };
    let raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); stop(); v.destroy(); };
  }, []);
  function flash(text?: string) { if (!text) return; setToast(text); window.setTimeout(() => setToast((t) => (t === text ? null : t)), 1800); }

  const obj = currentObjective(s);
  const sel = selected ? s.facilities[selected] ?? null : null;
  const fontStyle: CSSProperties = { fontFamily: 'Galmuri11, system-ui, sans-serif' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.dark, ...fontStyle, userSelect: 'none' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {/* 상단 바 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30, background: C.paper, borderBottom: `3px solid ${C.wood}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', fontSize: 12, color: C.ink, whiteSpace: 'nowrap' }}>
        <b>{s.clock.year}년 {s.clock.month}월 {String(s.clock.hour).padStart(2, '0')}시</b>
        <span style={{ flex: 1 }} />
        <b style={{ color: s.money < 0 ? C.red : C.ink }}>{wonShort(s.money)}</b>
        <span style={small}>명성 <b style={{ color: C.ink }}>{s.fame}</b></span>
        <span style={small}>연구 <b style={{ color: C.ink }}>{s.research}</b></span>
        {([0, 1, 3] as const).map((sp) => <button key={sp} onClick={() => dispatch({ type: 'setSpeed', speed: sp })} style={{ ...(s.clock.speed === sp ? btnGold : btnOff), padding: '2px 5px', fontSize: 11 }}>{sp === 0 ? '∥' : `${sp}×`}</button>)}
      </div>
      {/* 목표 한 줄 */}
      {obj && !placing && <div style={{ position: 'absolute', top: 36, left: 8, right: 8, ...panel, padding: '4px 8px', fontSize: 13, pointerEvents: 'none' }}>▶ {obj.text} <span style={small}>· 상금 {wonShort(obj.reward)}</span></div>}
      {/* 배치 모드 띠 */}
      {placing && <PlacingBar id={placing} ghost={ghost} onDone={() => { setPlacing(null); setGhost(null); }} />}
      {/* 알림 */}
      {(toast || toasts.length > 0) && <div style={{ position: 'absolute', left: 8, right: 8, bottom: 150, display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none' }}>
        {toasts.slice(-2).filter((t) => performance.now() - t.at < 5000).map((t) => <div key={t.id} style={{ ...panel, padding: '4px 8px', fontSize: 13, background: '#fff7e6' }}>{t.text}</div>)}
        {toast && <div style={{ ...panel, padding: '4px 8px', fontSize: 13, borderColor: C.red }}>{toast}</div>}
      </div>}
      {/* 하단: 영수증 띠 · 요약 띠 · 메뉴 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: C.paper, borderTop: `3px solid ${C.wood}`, color: C.ink }}>
        <Receipts s={s} />
        <div style={{ display: 'flex', gap: 10, padding: '2px 8px', fontSize: 12, color: C.soft, borderTop: `1px solid #d8c9a8` }}>
          <span>손님 <b style={{ color: C.ink }}>{s.guests.length}</b></span><span>오늘 <b style={{ color: C.ink }}>{s.todayGuests}</b>/{dailyGuests(s)}</span><span>자리·가게 <b style={{ color: C.ink }}>{usables(s).length}</b></span><span>인기 합 <b style={{ color: C.ink }}>{popularitySum(s)}</b></span><span>직원 <b style={{ color: C.ink }}>{s.staff.length}</b></span>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: 6 }}>
          {([['build', '건축'], ['guests', '손님층'], ['info', '정보'], ['system', '시스템']] as const).map(([k, name]) => <button key={k} style={{ ...(win === k ? btnGold : btn), flex: 1, padding: '10px 0', fontSize: 15 }} onClick={() => { setWin(win === k ? null : k); setSelected(null); }}>{name}</button>)}
        </div>
      </div>
      {!ready && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>불러오는 중…</div>}
      {win === 'build' && <BuildWindow s={s} onPick={(id) => { setPlacing(id); setWin(null); setGhost(null); }} onClose={() => setWin(null)} />}
      {win === 'guests' && <GuestsWindow s={s} onClose={() => setWin(null)} />}
      {win === 'info' && <InfoWindow s={s} onClose={() => setWin(null)} />}
      {win === 'system' && <SystemWindow onClose={() => setWin(null)} />}
      {sel && !placing && !win && <FacilityCard s={s} f={sel} onSelect={setSelected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PlacingBar({ id, ghost, onDone }: { id: string; ghost: Ghost | null; onDone: () => void }) {
  const d = facilityDef(id);
  const floor = isFloorDef(d);
  const n = ghost?.line ? lineCells(ghost.line.from, ghost.line.to).filter((p) => canLayFloor(getState(), d.floor!, p.x, p.y).ok).length : 1;
  return (
    <div style={{ position: 'absolute', top: 36, left: 8, right: 8, ...panel, padding: '6px 8px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      <b>{d.name}</b>
      <span style={{ flex: 1 }}>{floor ? (ghost?.line ? `어디까지 까시겠습니까? · ${won(d.cost * n)}` : '어디서부터 까시겠습니까? (드래그)') : ghost && !ghost.ok ? <span style={{ color: C.red }}>{ghost.reason}</span> : `탭해서 놓기 · ${won(d.cost)}`}</span>
      <button style={btnOff} onClick={onDone}>끝</button>
    </div>
  );
}
function Receipts({ s }: { s: GameState }) {
  const rs = s.receipts.slice(-3).reverse();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '3px 8px', minHeight: 18 }}>
      {rs.length === 0 && <span style={small}>손님이 오면 여기에 한 줄씩</span>}
      {rs.map((r) => { const t = GUEST_TYPES.find((g) => g.id === r.type)!; return <div key={r.id} style={{ fontSize: 12, display: 'flex', gap: 8 }}><span>{r.mood === 'happy' ? '😊' : r.mood === 'angry' ? '😠' : '😐'}</span><b>{t.name}</b><span style={{ color: r.fame > 0 ? C.green : r.fame < 0 ? C.red : C.soft }}>명성 {r.fame > 0 ? '+' : ''}{r.fame}</span><span style={{ color: C.gold }}>소지금 +{won(r.money)}</span></div>; })}
    </div>
  );
}
function Window({ title, onClose, children, tabs }: { title: string; onClose: () => void; children: React.ReactNode; tabs?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 6, right: 6, top: 36, bottom: 116, ...panel, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><b style={{ fontSize: 16, flex: 1 }}>{title}</b>{tabs}<button style={btnOff} onClick={onClose}>뒤로</button></div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Sprite({ id, size = 48 }: { id: string; size?: number }) {
  // 시트에서 잘라 보여 주기엔 무거우니 아이콘 폴더의 png가 있으면 그것, 없으면 글자
  return <div style={{ width: size, height: size, display: 'grid', placeItems: 'center', fontSize: 20 }}>{TAB_ICON[facilityDef(id).tab]}</div>;
}
const TAB_ICON: Record<Tab, string> = { env: '🌳', seat: '🪑', shop: '🏪' };
function BuildWindow({ s, onPick, onClose }: { s: GameState; onPick: (id: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('seat');
  const items = FACILITIES.filter((d) => d.tab === tab);
  return (
    <Window title="건축" onClose={onClose} tabs={(['env', 'seat', 'shop'] as Tab[]).map((t) => <button key={t} style={{ ...(tab === t ? btnGold : btnOff), padding: '4px 8px' }} onClick={() => setTab(t)}>{TAB_KO[t]}</button>)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {items.map((d) => { const open = s.unlocked.facilities.includes(d.id); const can = open && s.money >= d.cost; return (
          <button key={d.id} disabled={!open} onClick={() => can ? onPick(d.id) : undefined} style={{ ...panel, padding: 6, textAlign: 'left', background: open ? '#fff7e6' : '#3a3128', color: open ? C.ink : '#8a7a68', display: 'flex', gap: 6, alignItems: 'center', cursor: open ? 'pointer' : 'default', opacity: can || !open ? 1 : 0.6 }}>
            <Sprite id={d.id} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}><b>{open ? d.name : '???'}</b> <span style={small}>{d.w}×{d.h}</span></div>
              {open ? <div style={small}>{won(d.cost)} · 유지 {won(d.upkeep)}/월{d.pop !== undefined ? ` · 인기 ${d.pop}` : ''}{d.scenery ? ` · 경치 +${d.scenery}` : ''}{d.fee ? ` · 요금 ${won(d.fee)}` : ''}</div> : <div style={small}>연구 {d.unlock}로 열린다</div>}
              {open && d.tags && <div style={small}>{d.tags.map((t) => GUEST_TYPES.find((g) => g.id === t)?.name).join('·')}에게 인기</div>}
            </div>
          </button>); })}
      </div>
    </Window>
  );
}
function GuestsWindow({ s, onClose }: { s: GameState; onClose: () => void }) {
  return (
    <Window title="손님층" onClose={onClose}>
      <div style={{ ...small, marginBottom: 6 }}>타깃을 고르면 그 손님층이 두 배로 온다. 손님층마다 지갑과 눈높이가 다르다.</div>
      {GUEST_TYPES.map((g) => { const open = s.unlocked.guests.includes(g.id); const liked = FACILITIES.filter((d) => d.tags?.includes(g.id) && s.unlocked.facilities.includes(d.id)).map((d) => d.name).slice(0, 4).join('·'); return (
        <div key={g.id} style={{ ...panel, padding: 6, marginBottom: 6, background: s.target === g.id ? '#fff0c0' : '#fff7e6', display: 'flex', alignItems: 'center', gap: 8, opacity: open ? 1 : 0.5 }}>
          <div style={{ flex: 1 }}><b>{g.name}</b> <span style={small}>지갑 {won(g.wallet)} · 눈높이 {g.expect}</span><div style={small}>{open ? (liked ? `좋아함: ${liked}` : '좋아하는 시설이 아직 없다') : `연구 ${g.unlock}로 온다`}</div></div>
          {open && <button style={s.target === g.id ? btnGold : btn} onClick={() => dispatch({ type: 'setTarget', guestType: s.target === g.id ? null : g.id })}>{s.target === g.id ? '타깃' : '타깃으로'}</button>}
        </div>); })}
      <div style={{ ...small, marginTop: 8 }}>메뉴판 (자리 손님이 산다, 5칸)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{MENUS.map((m) => { const open = s.unlocked.menus.includes(m.id); const on = s.menu.includes(m.id); return <button key={m.id} disabled={!open} style={{ ...(on ? btnGold : btnOff), padding: '4px 8px', opacity: open ? 1 : 0.4 }} onClick={() => { const r = dispatch({ type: 'setMenu', menuId: m.id, on: !on }); if (!r.ok) alert(r.reason); }}>{open ? `${m.name} ${won(m.price)}` : '???'}</button>; })}</div>
    </Window>
  );
}
function InfoWindow({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<'cafe' | 'research' | 'staff' | 'invest' | 'rank'>('cafe');
  const tabs = ([['cafe', '카페'], ['research', '연구'], ['staff', '직원'], ['invest', '투자'], ['rank', '랭킹']] as const).map(([k, n]) => <button key={k} style={{ ...(tab === k ? btnGold : btnOff), padding: '4px 6px', fontSize: 12 }} onClick={() => setTab(k)}>{n}</button>);
  return (
    <Window title="정보" onClose={onClose} tabs={tabs}>
      {tab === 'cafe' && <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
        <Row k="자금" v={won(s.money)} /><Row k="명성" v={String(s.fame)} /><Row k="연구" v={String(s.research)} />
        <Row k="시설 인기 합" v={String(popularitySum(s))} /><Row k="하루 손님" v={String(dailyGuests(s))} />
        <Row k="지난달" v={s.lastMonth ? `수입 ${won(s.lastMonth.income)} · 지출 ${won(s.lastMonth.spent)} · 손님 ${s.lastMonth.guests}` : '—'} />
        <Row k="이달 유지비 예정" v={`${won(upkeepTotal(s))} + 월급 ${won(wagesTotal(s))}`} />
        <Row k="누적 손님" v={`${s.stats.guests} (만족 ${s.stats.happy} · 돌아감 ${s.stats.turnedAway})`} />
        <div style={{ ...small, marginTop: 6 }}>목표</div>
        {OBJECTIVES.map((o) => <div key={o.id} style={{ fontSize: 13, color: s.objectivesDone.includes(o.id) ? C.soft : C.ink }}>{s.objectivesDone.includes(o.id) ? '✓' : currentObjective(s)?.id === o.id ? '▶' : '·'} {o.text}</div>)}
      </div>}
      {tab === 'research' && <div style={{ display: 'grid', gap: 4 }}>
        <div style={small}>손님이 쓸 때마다 연구가 쌓인다 (만족하면 2). 연구 {s.research}</div>
        {unlockables(s).map((u) => <div key={u.id} style={{ ...panel, padding: 6, background: u.done ? '#efe6d2' : '#fff7e6', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1, fontSize: 13 }}>{u.kind === 'facility' ? '시설' : u.kind === 'menu' ? '메뉴' : '손님층'} · <b>{u.name}</b></span><span style={small}>{u.cost}</span>{!u.done && <button style={canUnlock(s, u.id).ok ? btn : btnOff} onClick={() => { const r = dispatch({ type: 'unlock', id: u.id }); if (!r.ok) alert(r.reason); }}>열기</button>}{u.done && <span style={small}>열림</span>}</div>)}
      </div>}
      {tab === 'staff' && <div style={{ display: 'grid', gap: 4 }}>
        <div style={small}>서비스 합이 손님 회전과 만족을 올린다. 월급은 월말에.</div>
        {s.staff.map((st) => <div key={st.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ flex: 1 }}><b>{st.name}</b> <span style={small}>서비스 {'★'.repeat(st.service)} · 월급 {won(st.wage)}</span></span><button style={btnOff} onClick={() => dispatch({ type: 'fire', staffId: st.id })}>내보내기</button></div>)}
        <div style={{ ...small, marginTop: 6 }}>이달 후보</div>
        {s.candidates.map((c) => <div key={c.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ flex: 1 }}><b>{c.name}</b> <span style={small}>서비스 {'★'.repeat(c.service)} · 월급 {won(c.wage)}</span></span><button style={canHire(s, c.id).ok ? btn : btnOff} onClick={() => { const r = dispatch({ type: 'hire', candidateId: c.id }); if (!r.ok) alert(r.reason); }}>채용</button></div>)}
      </div>}
      {tab === 'invest' && <div style={{ display: 'grid', gap: 4 }}>
        <div style={small}>내 땅 밖(동네)에 돈을 쓴다. 각 한 번. {s.invested.length}개 완료</div>
        {INVESTS.map((i) => <div key={i.id} style={{ ...panel, padding: 6, background: s.invested.includes(i.id) ? '#efe6d2' : '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ flex: 1 }}><b>{i.name}</b>{!s.invested.includes(i.id) && <span style={{ ...small, color: C.red }}> NEW</span>}<div style={small}>{i.desc} · {won(i.cost)}</div></span>{!s.invested.includes(i.id) && <button style={s.money >= i.cost ? btn : btnOff} onClick={() => { const r = dispatch({ type: 'invest', id: i.id }); if (!r.ok) alert(r.reason); }}>시행</button>}</div>)}
        <div style={{ ...small, marginTop: 6 }}>땅 (내 땅과 붙은 것만)</div>
        {s.parcels.filter((p) => !p.owned).map((p) => <div key={p.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ flex: 1 }}><b>{p.name}</b> <span style={small}>{won(p.price)}</span></span><button style={btn} onClick={() => { const r = dispatch({ type: 'buyParcel', id: p.id }); if (!r.ok) alert(r.reason); }}>사기</button></div>)}
      </div>}
      {tab === 'rank' && <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        <div style={small}>매년 12월 말 발표. 점수 = 명성 + 시설 인기 합. 지금 점수 <b style={{ color: C.ink }}>{myScore(s)}</b></div>
        {[{ id: 'me', name: '우리 카페', score: myScore(s) }, ...RIVALS.map((r) => ({ id: r.id, name: r.name, score: rivalScore(r.id, s.clock.year) }))].sort((a, b) => b.score - a.score).map((r, i) => <div key={r.id} style={{ display: 'flex', gap: 8, fontWeight: r.id === 'me' ? 700 : 400 }}><span>{i + 1}위</span><span style={{ flex: 1 }}>{r.name}</span><span>{r.score}</span></div>)}
        {s.evaluations.slice(-3).reverse().map((e) => <div key={e.year} style={small}>{e.year}년 {e.rank}위 · {won(e.prize)}</div>)}
      </div>}
    </Window>
  );
}
function Row({ k, v }: { k: string; v: string }) { return <div style={{ display: 'flex', gap: 8 }}><span style={{ ...small, minWidth: 96 }}>{k}</span><span>{v}</span></div>; }
function SystemWindow({ onClose }: { onClose: () => void }) {
  return (
    <Window title="시스템" onClose={onClose}>
      <div style={{ display: 'grid', gap: 6 }}>
        <button style={btn} onClick={() => { save(); alert('저장했어요'); }}>저장</button>
        <button style={btnOff} onClick={() => { if (confirm('새로 시작할까요? 지금 게임은 사라져요.')) { restart(); onClose(); } }}>새 게임</button>
        <div style={small}>하루가 끝날 때마다 자동 저장. 적자는 빨간 숫자일 뿐 게임 오버는 없다 — 잔고가 −200만 아래면 삼춘이 300만을 꿔 준다(연 1회, 3번까지).</div>
      </div>
    </Window>
  );
}
/** 시설 카드 = 손익계산서 한 장 (영상 15:00) */
function FacilityCard({ s, f, onSelect, onClose }: { s: GameState; f: Facility; onSelect: (id: string) => void; onClose: () => void }) {
  const d = facilityDef(f.type);
  const sh = sheetOf(s, f);
  const list = Object.values(s.facilities);
  const i = list.findIndex((x) => x.id === f.id);
  const go = (k: number) => onSelect(list[(i + k + list.length) % list.length]!.id);
  const lv = canLevelUp(s, f.id);
  const [renaming, setRenaming] = useState(false);
  return (
    <div style={{ position: 'absolute', left: 6, right: 6, bottom: 116, ...panel, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={{ ...btnOff, padding: '2px 8px' }} onClick={() => go(-1)}>◀</button>
        <b style={{ flex: 1, fontSize: 15 }}>{f.name ?? d.name}{f.level > 1 ? ` Lv${f.level}` : ''} <span style={small}>{i + 1}/{list.length}</span></b>
        <button style={{ ...btnOff, padding: '2px 8px' }} onClick={() => go(1)}>▶</button>
        <button style={btnOff} onClick={onClose}>닫기</button>
      </div>
      <div style={small}>유지/월 {won(sh.upkeep)}{isUsable(d) ? ` · 이용 ${f.uses}회 · 매출 ${won(f.sales)}` : ''}</div>
      {isUsable(d) ? (
        <table style={{ width: '100%', marginTop: 4, borderCollapse: 'collapse' }}><tbody>
          <tr style={small}><td /><td style={{ textAlign: 'right' }}>인기</td><td style={{ textAlign: 'right' }}>요금</td></tr>
          <tr><td>기본</td><td style={{ textAlign: 'right' }}>{sh.base}</td><td style={{ textAlign: 'right' }}>{won(d.fee ?? 0)}</td></tr>
          <tr><td>보너스 <span style={small}>{sh.pairs.map((p) => p.name).join('·') || '상성 없음'}</span></td><td style={{ textAlign: 'right' }}>{sh.bonus}</td><td style={{ textAlign: 'right' }}>{won(sh.fee - (d.fee ?? 0))}</td></tr>
          <tr><td>경치 <span style={small}>반경 2</span></td><td style={{ textAlign: 'right' }}>{sh.scenery}</td><td /></tr>
          <tr style={{ fontWeight: 700, borderTop: `1px solid ${C.wood}` }}><td>합계</td><td style={{ textAlign: 'right' }}>{sh.total}</td><td style={{ textAlign: 'right' }}>{won(sh.fee)}</td></tr>
        </tbody></table>
      ) : <div style={{ marginTop: 4 }}>경치 <b>+{d.scenery ?? 0}</b> <span style={small}>반경 2 자리·가게의 인기를 올린다</span>{sh.pairs.length > 0 && <div style={small}>상성: {sh.pairs.map((p) => p.name).join('·')}</div>}</div>}
      {sh.likedBy.length > 0 && <div style={small}>{sh.likedBy.map((t) => GUEST_TYPES.find((g) => g.id === t)?.name).join('·')}에게 인기</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {isUsable(d) && <button style={lv.ok ? btn : btnOff} title={lv.reason} onClick={() => { if (lv.ok) { levelUp(getState(), f.id); dispatch({ type: 'setSpeed', speed: getState().clock.speed }); } else alert(lv.reason); }}>Lv업 <span style={{ fontSize: 11 }}>(연구 {LEVEL_COST[f.level] ?? '-'})</span></button>}
        <button style={btnOff} onClick={() => setRenaming(true)}>이름</button>
        <button style={{ ...btnOff, background: C.red, color: '#fff' }} onClick={() => { const r = dispatch({ type: 'remove', facilityId: f.id }); if (!r.ok) alert(r.reason); else onClose(); }}>치우기 <span style={{ fontSize: 11 }}>(반값 환불)</span></button>
      </div>
      {renaming && <div style={{ display: 'flex', gap: 4, marginTop: 6 }}><input autoFocus defaultValue={f.name ?? d.name} maxLength={12} style={{ flex: 1, fontFamily: 'inherit' }} onKeyDown={(e) => { if (e.key === 'Enter') { dispatch({ type: 'rename', facilityId: f.id, name: (e.target as HTMLInputElement).value }); setRenaming(false); } }} /><button style={btnOff} onClick={() => setRenaming(false)}>취소</button></div>}
    </div>
  );
}
