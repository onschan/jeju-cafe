/** 새 조작 (2단계). 창은 넷: 건축 · 손님층 · 정보 · 시스템. 그 밖엔 시설 카드(손익계산서)와 하단 띠(목표 한 줄 · 영수증 · 손님/자리/인기)뿐. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { View, ghostOf, type Ghost } from './View';
import { useGame, useRev, dispatch, startLoop, getState, save, restart, toasts, hadSave, setPaused } from './store';
import { C, panel, titleBar, tile, tileLocked, btn, btnOff, btnGold, small, won, wonShort } from './theme';
import { useThumb } from './thumbs';
import { assetUrl } from './assetUrl';
import { DialogueHost } from './Dialogue';
import { showDialogue, clearDialogues, useDialogue, SPEAKER } from './dialogueStore';
import { RewardChest, MonthCard, DaySummary, MessageLine, Portrait, guestTypeFace, DAY_CARD_MS, MESSAGE_LINE_H } from './cards';
import { nextHint } from './hints';
import { EndingScreen } from './Ending';
import { unlockAudio, audioReady, sfx, bgm, setBgmLayer, isMuted, setMuted, getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume } from './audio';
import { guestAccs } from './guestLook';
import { FACILITIES, GUEST_TYPES, MENUS, INVESTS, facilityDef, isFloorDef, isUsable, sheetOf, usables, popularitySum, dailyGuests, unlockables, canUnlock, canLevelUp, LEVEL_COST, levelMoney, currentObjective, OBJECTIVES, seasonOf, canHire, upkeepTotal, wagesTotal, myScore, rivalScore, RIVALS, lineCells, canLayFloor, parcelAt, cellAt, parcelAdjacent, type GameState, type Tab, type Facility, type Pt, type Parcel, type Objective, type Guest } from '../game/index.ts';

type Win = 'build' | 'guests' | 'info' | 'system' | null;
/** 하단 띠(영수증 2줄 + 요약 + 메뉴) 높이 */
const BOTTOM_H = 118;
const ABOVE_BOTTOM = BOTTOM_H + MESSAGE_LINE_H + 4;
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
  const [title, setTitle] = useState(true);
  const [buyAsk, setBuyAsk] = useState<Parcel | null>(null);
  const [floorSel, setFloorSel] = useState<Pt | null>(null);
  const [chest, setChest] = useState<Objective | null>(null);
  const [monthCard, setMonthCard] = useState(false);
  const [daySum, setDaySum] = useState<{ today: { guests: number; income: number }; prev: { guests: number; income: number } | null } | null>(null);
  const [moneyBump, setMoneyBump] = useState(false);
  const [ending, setEnding] = useState(false);
  const [guestSel, setGuestSel] = useState<string | null>(null);
  const dlg = useDialogue().req;
  // 타이틀·대화·상자·결산이 떠 있는 동안 시계를 멈춘다
  useEffect(() => { setPaused(title || !!dlg || !!chest || monthCard || ending); }, [title, dlg, chest, monthCard, ending]);
  // 목표 달성 → 보물상자 → 삼춘 한마디 (이어하기 직후 옛 목표가 다시 튀지 않게 처음 개수는 「본 것」으로)
  const seenObj = useRef(s.objectivesDone.length);
  useEffect(() => {
    if (s.objectivesDone.length <= seenObj.current) { seenObj.current = s.objectivesDone.length; return; }
    const id = s.objectivesDone[s.objectivesDone.length - 1]!; seenObj.current = s.objectivesDone.length;
    const o = OBJECTIVES.find((x) => x.id === id); if (o) pendingChest.current.push(o);
  }, [s.objectivesDone.length]);
  // 상자는 대화가 안 떠 있을 때 하나씩 (대사 위에 겹치지 않게)
  const pendingChest = useRef<Objective[]>([]);
  useEffect(() => { if (dlg || chest || title) return; const o = pendingChest.current.shift(); if (o) setChest(o); }, [dlg, chest, title, s.objectivesDone.length]);
  // 연말 랭킹 발표
  const seenEval = useRef(s.evaluations.length);
  useEffect(() => {
    if (s.evaluations.length <= seenEval.current) { seenEval.current = s.evaluations.length; return; }
    seenEval.current = s.evaluations.length;
    const e = s.evaluations[s.evaluations.length - 1]!;
    const top = e.rows.slice().sort((a, b) => b.score - a.score)[0]!;
    showDialogue({ speaker: { name: SPEAKER.jangnim, portrait: 'jangnim', expr: e.rank <= 2 ? 'happy' : 'normal' }, lines: [`${e.year}년 제주 카페 랭킹 발표! ${s.cafeName}은 ${e.rank}위.`, e.prize ? `상금 ${wonShort(e.prize)}을 드립니다. 내년에도 기대하겠습니다.` : `1위는 ${top.name}(${top.score}점). 내년엔 더 올라와 보세요.`] });
  }, [s.evaluations.length]);
  // 월말 결산 카드
  const seenMonth = useRef(s.lastMonth ? `${s.lastMonth.year}-${s.lastMonth.month}` : '');
  useEffect(() => {
    const k = s.lastMonth ? `${s.lastMonth.year}-${s.lastMonth.month}` : '';
    if (k && k !== seenMonth.current) { seenMonth.current = k; if (!title) setMonthCard(true); }
  }, [s.lastMonth]);
  // 하루 요약 (3초)
  const seenDay = useRef(s.lastDay);
  useEffect(() => {
    if (!s.lastDay || s.lastDay === seenDay.current) return;
    const prev = seenDay.current; seenDay.current = s.lastDay;
    if (title || s.lastDay.guests === 0) return;
    setDaySum({ today: s.lastDay, prev });
    const t = setTimeout(() => setDaySum(null), DAY_CARD_MS); return () => clearTimeout(t);
  }, [s.lastDay]);
  // 첫 5분 안내: 상황이 처음 맞으면 한 번 (아무것도 안 떠 있을 때만)
  const hintTick = Math.floor(s.tick / 10);
  useEffect(() => {
    if (title || dlg || chest || monthCard || win || placing) return; // 배치 중엔 끼어들지 않는다
    const h = nextHint(s); if (!h) return;
    dispatch({ type: 'hint', id: h.id });
    showDialogue({ speaker: { name: SPEAKER[h.speaker], portrait: h.speaker, expr: h.expr }, lines: h.lines });
  }, [hintTick, title, !!dlg, !!chest, monthCard, win, placing]);
  // 소리: 첫 터치에서 풀고, 타이틀/계절 BGM, 명성 300부터 타악
  const season = seasonOf(s.clock.month);
  useEffect(() => { if (!ready) return; const on = () => { unlockAudio(); void bgm(title ? 'title' : season); }; window.addEventListener('pointerdown', on, { passive: true }); return () => window.removeEventListener('pointerdown', on); }, [ready, title, season]);
  useEffect(() => { if (audioReady()) void bgm(title ? 'title' : season); }, [title, season]);
  useEffect(() => { setBgmLayer(s.fame >= 300); }, [s.fame >= 300]);
  useEffect(() => { if (s.receiptSeq === 0) return; const r = s.receipts[s.receipts.length - 1]; if (!r) return; sfx('coin'); if (r.mood === 'happy') sfx('happy'); else if (r.mood === 'angry') sfx('meh'); }, [s.receiptSeq]);
  useEffect(() => { if (chest) sfx('fanfare'); }, [chest]);
  useEffect(() => { if (monthCard) sfx('month'); }, [monthCard]);
  const unlockedCount = s.unlocked.facilities.length + s.unlocked.menus.length + s.unlocked.guests.length;
  const seenUnlock = useRef(unlockedCount);
  useEffect(() => { if (unlockedCount > seenUnlock.current) sfx('unlock'); seenUnlock.current = unlockedCount; }, [unlockedCount]);
  // 3년 엔딩: 4년차 1월 1일에 한 번
  useEffect(() => { if (!title && !dlg && !chest && !monthCard && s.clock.year >= 4 && !s.hints.includes('ending')) { dispatch({ type: 'hint', id: 'ending' }); setEnding(true); sfx('fanfare'); } }, [s.clock.year, title, !!dlg, !!chest, monthCard]);
  // 돈이 늘면 숫자가 살짝 튄다
  const prevMoney = useRef(s.money);
  useEffect(() => { const up = s.money > prevMoney.current; prevMoney.current = s.money; if (!up) return; setMoneyBump(true); const t = setTimeout(() => setMoneyBump(false), 160); return () => clearTimeout(t); }, [s.money]);
  const lineFrom = useRef<Pt | null>(null);
  const placingRef = useRef<string | null>(null); placingRef.current = placing;
  const ghostRef = useRef<Ghost | null>(null); ghostRef.current = ghost;

  useEffect(() => {
    const v = new View(); viewRef.current = v;
    let stop = () => {};
    v.init(hostRef.current!, {
      onTap: (x, y) => {
        const st = getState();
        sfx('tap');
        const id = placingRef.current;
        if (id) {
          // 탭은 자리만 잡는다 — 놓는 건 띠의 「놓기/깔기」로 (탭마다 놓이면 실수가 잦다)
          const d = facilityDef(id);
          setGhost(isFloorDef(d) ? ghostOf(st, id, x, y, { from: { x, y }, to: { x, y } }) : ghostOf(st, id, x, y));
          return;
        }
        const p = parcelAt(st, x, y);
        if (p && !p.owned) { setBuyAsk(p); setSelected(null); setFloorSel(null); return; } // 미소유 땅을 탭하면 산다
        const cell = st.grid.cells[y * st.grid.w + x];
        const g = !cell?.objectId ? st.guests.find((q) => Math.round(q.x) === x && Math.round(q.y) === y) : null;
        setGuestSel(g ? g.id : null);
        setSelected(cell?.objectId ?? null);
        setFloorSel(cell && !cell.objectId && cell.floor && !g ? { x, y } : null); // 손님이 서 있으면 손님 팝업이 먼저
      },
      dragCapture: (x, y) => { const id = placingRef.current; if (!id || !isFloorDef(facilityDef(id))) return false; lineFrom.current = { x, y }; setGhost(ghostOf(getState(), id, x, y, { from: { x, y }, to: { x, y } })); return true; },
      onDragCell: (x, y) => { const id = placingRef.current; const from = lineFrom.current; if (!id || !from) return; setGhost(ghostOf(getState(), id, x, y, { from, to: { x, y } })); },
      onBusStop: () => { if (!getState().clock.speed) return; sfx('bus'); },
      onDragEnd: () => { lineFrom.current = null; }, // 드래그는 줄 미리보기까지만, 깔기는 띠에서
    }).then(() => { v.centerOn(getState()); setReady(true); stop = startLoop(); raf = requestAnimationFrame(tick); }); // 시트가 다 실린 뒤에야 그린다 — 먼저 그리면 자리 표시 도형이 캐시에 남는다(폰에서 그렇게 보였다)
    (window as unknown as { __view: View; __game: unknown }).__view = v; // 디버그·자동 검증용 (봇·브라우저 스크립트)
    (window as unknown as { __game: unknown }).__game = { getState, dispatch };
    const tick = () => { v.sync(getState(), ghostRef.current, performance.now()); raf = requestAnimationFrame(tick); };
    let raf = 0;
    return () => { cancelAnimationFrame(raf); stop(); v.destroy(); };
  }, []);
  function flash(text?: string) { if (!text) return; sfx('error'); setToast(text); window.setTimeout(() => setToast((t) => (t === text ? null : t)), 1800); }

  const obj = currentObjective(s);
  const canResearch = unlockables(s).some((u) => !u.done && s.research >= u.cost);
  const sel = selected ? s.facilities[selected] ?? null : null;
  const fontStyle: CSSProperties = { fontFamily: 'Galmuri11, system-ui, sans-serif' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.dark, ...fontStyle, userSelect: 'none' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {/* 상단 바 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30, background: C.paper, borderBottom: `3px solid ${C.wood}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', fontSize: 12, color: C.ink, whiteSpace: 'nowrap' }}>
        <Ico name={seasonOf(s.clock.month)} size={16} /><b>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일 {String(s.clock.hour).padStart(2, '0')}시</b>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, transition: 'transform .12s ease-out', transform: moneyBump ? 'scale(1.18)' : 'none' }}><Ico name="money" /><b style={{ color: s.money < 0 ? C.red : moneyBump ? C.gold : C.ink }}>{wonShort(s.money)}</b></span>
        <Ico name="star" /><b>{s.fame}</b>
        <Ico name="research" /><b>{s.research}</b>
        {([0, 1, 3] as const).map((sp) => <button key={sp} onClick={() => dispatch({ type: 'setSpeed', speed: sp })} style={{ ...(s.clock.speed === sp ? btnGold : btnOff), padding: '1px 3px', lineHeight: 0 }}><Ico name={sp === 0 ? 'speed_pause' : `speed_${sp}`} size={18} /></button>)}
      </div>
      {/* 내 마당으로 */}
      {ready && !win && <button style={{ ...btnOff, position: 'absolute', right: 8, top: 70, padding: '4px 8px', fontSize: 12 }} onClick={() => viewRef.current?.centerOn(getState())}><Ico name="home" /> 마당</button>}
      {/* 목표 한 줄 */}
      {obj && !placing && <div style={{ position: 'absolute', top: 36, left: 8, right: 8, ...panel, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }} onClick={() => setWin('info')}><Ico name="flag" /> {obj.text} <span style={small}>· 상금 {wonShort(obj.reward)}</span></div>}
      {/* 배치 모드 띠 */}
      {placing && <PlacingBar id={placing} ghost={ghost} onDone={() => { setPlacing(null); setGhost(null); }} onConfirm={() => {
        const g = ghost; if (!g) return; const d = facilityDef(placing);
        const r = isFloorDef(d) && g.line ? dispatch({ type: 'placeLine', id: placing, from: g.line.from, to: g.line.to }) : dispatch({ type: 'place', id: placing, x: g.x, y: g.y });
        if (!r.ok) { flash(r.reason); return; }
        sfx(isFloorDef(d) ? 'plant' : 'place');
        setGhost(isFloorDef(d) ? ghostOf(getState(), placing, g.x, g.y, g.line) : ghostOf(getState(), placing, g.x, g.y)); // 같은 자리는 이제 막히니 빨갛게 — 다음 탭으로 옮긴다
      }} />}
      {/* 삼춘 메시지 줄 (알림·신발매·거절 이유) */}
      {ready && <MessageLine bottom={BOTTOM_H} flash={toast} />}
      {daySum && !win && !dlg && <DaySummary today={daySum.today} prev={daySum.prev} bottom={BOTTOM_H + MESSAGE_LINE_H + 8} />}
      {/* 하단: 영수증 띠 · 요약 띠 · 메뉴 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: C.paper, borderTop: `3px solid ${C.wood}`, color: C.ink }}>
        <Receipts s={s} />
        <div style={{ display: 'flex', gap: 10, padding: '2px 8px', fontSize: 12, color: C.soft, borderTop: `1px solid #d8c9a8` }}>
          <span>손님 <b style={{ color: C.ink }}>{s.guests.length}</b></span><span>오늘 <b style={{ color: C.ink }}>{s.todayGuests}</b>/{dailyGuests(s)}</span><span>자리·가게 <b style={{ color: C.ink }}>{usables(s).length}</b></span><span>인기 합 <b style={{ color: C.ink }}>{popularitySum(s)}</b></span><span>직원 <b style={{ color: C.ink }}>{s.staff.length}</b></span>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: 6 }}>
          {([['build', '건축', 'build'], ['guests', '손님층', 'guest'], ['info', '정보', 'report'], ['system', '시스템', 'settings']] as const).map(([k, name, ico]) => <button key={k} style={{ ...(win === k ? btnGold : btn), flex: 1, padding: '6px 0', fontSize: 14, position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} onClick={() => { setWin(win === k ? null : k); setSelected(null); setFloorSel(null); setGuestSel(null); }}><Ico name={ico} size={18} />{name}{k === 'info' && canResearch && <span style={{ position: 'absolute', top: 4, right: 8, width: 10, height: 10, borderRadius: 5, background: C.red, border: '2px solid #fff8e8' }} />}</button>)}
        </div>
      </div>
      {!ready && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>불러오는 중…</div>}
      {win === 'build' && <BuildWindow s={s} onPick={(id) => { setPlacing(id); setWin(null); setGhost(null); }} onClose={() => setWin(null)} />}
      {win === 'guests' && <GuestsWindow s={s} onClose={() => setWin(null)} />}
      {win === 'info' && <InfoWindow s={s} onClose={() => setWin(null)} />}
      {win === 'system' && <SystemWindow onClose={() => setWin(null)} />}
      {sel && !placing && !win && !guestSel && <FacilityCard s={s} f={sel} onSelect={setSelected} onClose={() => setSelected(null)} onMore={(id) => { setSelected(null); setPlacing(id); }} onGuest={setGuestSel} />}
      {guestSel && !placing && !win && (s.guests.find((g) => g.id === guestSel) ? <GuestPopup s={s} g={s.guests.find((g) => g.id === guestSel)!} onClose={() => setGuestSel(null)} /> : null)}
      {!sel && !guestSel && floorSel && !placing && !win && <FloorCard s={s} p={floorSel} onClose={() => setFloorSel(null)} onMore={(id) => { setFloorSel(null); setPlacing(id); }} />}
      {buyAsk && <Ask text={`${buyAsk.name}을 ${won(buyAsk.price)}에 살까요?`} sub={!parcelAdjacent(s, buyAsk) ? '내 땅과 붙어 있어야 살 수 있어요' : s.money < buyAsk.price ? `돈이 모자라요 (지금 ${wonShort(s.money)})` : `사면 ${wonShort(s.money - buyAsk.price)} 남아요`} yesOff={!parcelAdjacent(s, buyAsk) || s.money < buyAsk.price} onYes={() => { const r = dispatch({ type: 'buyParcel', id: buyAsk.id }); if (!r.ok) flash(r.reason); setBuyAsk(null); }} onNo={() => setBuyAsk(null)} />}
      {ending && <EndingScreen s={s} onContinue={() => setEnding(false)} onTitle={() => { setEnding(false); save(); setTitle(true); }} />}
      <DialogueHost />
      {chest && <RewardChest objective={chest} onClose={() => { const o = chest; setChest(null); const next = currentObjective(getState()); showDialogue({ speaker: { name: SPEAKER.samchun, portrait: 'samchun', expr: 'happy' }, lines: [`${o.text} — 해냈네! 상금 ${wonShort(o.reward)}은 통장에 넣어 뒀어.`, next ? `다음은 「${next.text}」. 상금은 ${wonShort(next.reward)}.` : '목표는 다 이뤘어. 이제 마음껏 키워 봐.'] }); }} />}
      {monthCard && s.lastMonth && <MonthCard s={s} onClose={() => setMonthCard(false)} />}
      {title && ready && <Title onStart={(fresh) => { setTitle(false); clearDialogues(); if (fresh) intro(getState().cafeName); else showDialogue({ speaker: { name: SPEAKER.samchun, portrait: 'samchun' }, lines: [`어서 와. ${getState().cafeName}, 오늘도 잘 부탁해.`] }); }} />}
    </div>
  );
}

function PlacingBar({ id, ghost, onDone, onConfirm }: { id: string; ghost: Ghost | null; onDone: () => void; onConfirm: () => void }) {
  const d = facilityDef(id);
  const floor = isFloorDef(d);
  const n = ghost?.line ? lineCells(ghost.line.from, ghost.line.to).filter((p) => canLayFloor(getState(), d.floor!, p.x, p.y).ok).length : 1;
  const can = !!ghost && (floor ? n > 0 : ghost.ok) && getState().money >= d.cost * (floor ? n : 1);
  return (
    <div style={{ position: 'absolute', top: 36, left: 8, right: 8, ...panel, padding: '6px 8px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Sprite id={id} size={28} /><b>{d.name}</b>
      <span style={{ flex: 1, minWidth: 0 }}>{floor ? (ghost?.line ? `${n}칸 · ${won(d.cost * n)}` : '탭하거나 드래그해서 자리를 잡아요') : !ghost ? `탭해서 자리를 잡아요 · ${won(d.cost)}` : !ghost.ok ? <span style={{ color: C.red }}>{ghost.reason}</span> : won(d.cost)}</span>
      <span style={small}>{wonShort(getState().money)}</span>
      <button style={can ? btnGold : btnOff} disabled={!can} onClick={onConfirm}>{floor ? '깔기' : '놓기'}</button>
      <button style={btnOff} onClick={onDone}>끝</button>
    </div>
  );
}

/** 예/아니오 한 장 */
function Ask({ text, sub, yesOff, onYes, onNo }: { text: string; sub?: string; yesOff?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center' }} onClick={onNo}>
      <div style={{ ...panel, width: 280 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, marginBottom: 4 }}>{text}</div>
        {sub && <div style={{ ...small, marginBottom: 8 }}>{sub}</div>}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><button style={btnOff} onClick={onNo}>아니요</button><button style={yesOff ? btnOff : btnGold} disabled={yesOff} onClick={onYes}>네</button></div>
      </div>
    </div>
  );
}
/** 타이틀: 이어하기 / 새 게임(카페 이름) — 탭 두 번이면 게임 */
/** 새 게임 첫 대사: 할망이 마당을 맡긴다 */
function intro(name: string) {
  showDialogue({ speaker: { name: SPEAKER.halmang, portrait: 'halmang' }, lines: ['이 마당, 이제 네가 맡아라. 바닷바람 좋고 손님도 곧 올 거다.', '바닥을 깔고 그 위에 자리를 놓아. 나무·꽃을 옆에 두면 경치가 올라간다.'] });
  showDialogue({ speaker: { name: SPEAKER.samchun, portrait: 'samchun', expr: 'happy' }, lines: [`${name}라… 이름 좋네. 나는 옆집 삼춘이야.`, '손님이 나갈 때마다 아래 줄에 영수증이 찍혀. 첫 목표는 자리 3개 놓기!'] });
}
function Title({ onStart }: { onStart: (fresh: boolean) => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('우리 카페');
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,8,0.78)', display: 'grid', placeItems: 'center', color: '#fff8e8' }}>
      <div style={{ textAlign: 'center', display: 'grid', gap: 10, width: 260 }}>
        <div style={{ fontSize: 30, fontWeight: 700, textShadow: '2px 2px 0 #4a2f16' }}>제주 카페 이야기</div>
        <div style={small}>바닥을 깔고, 자리를 놓고, 손님을 맞는다</div>
        {!naming ? <>
          {hadSave && <button style={{ ...btnGold, fontSize: 16 }} onClick={() => onStart(false)}>이어하기</button>}
          <button style={{ ...btn, fontSize: 16 }} onClick={() => setNaming(true)}>새 게임</button>
        </> : <>
          <div style={{ fontSize: 13 }}>카페 이름</div>
          <input autoFocus value={name} maxLength={12} onChange={(e) => setName(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 16, padding: 6, textAlign: 'center' }} />
          <div style={{ display: 'flex', gap: 6 }}><button style={{ ...btnOff, flex: 1 }} onClick={() => setNaming(false)}>뒤로</button><button style={{ ...btnGold, flex: 1 }} onClick={() => { restart(); dispatch({ type: 'setName', name }); onStart(true); }}>결정</button></div>
        </>}
      </div>
    </div>
  );
}
/** 바닥 칸 카드: 걷어내기 · 같은 바닥 더 깔기 */
function FloorCard({ s, p, onClose, onMore }: { s: GameState; p: Pt; onClose: () => void; onMore: (id: string) => void }) {
  const c = cellAt(s, p.x, p.y);
  const id = c.floor === 'path' ? 'path' : `floor_${c.floor}`;
  const d = facilityDef(id);
  return (
    <div style={{ position: 'absolute', left: 6, right: 6, bottom: ABOVE_BOTTOM, ...panel, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Sprite id={id} size={36} /><b style={{ flex: 1 }}>{d.name}</b>
      <button style={btn} onClick={() => onMore(id)}>더 깔기</button>
      <button style={{ ...btnOff, background: C.red, color: '#fff' }} onClick={() => { const r = dispatch({ type: 'removeFloor', x: p.x, y: p.y }); if (!r.ok) alert(r.reason); else onClose(); }}>걷어내기</button>
      <button style={btnOff} onClick={onClose}>닫기</button>
    </div>
  );
}
function Receipts({ s }: { s: GameState }) {
  const rs = s.receipts.slice(-2).reverse();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '3px 8px', minHeight: 18 }}>
      {rs.length === 0 && <span style={small}>손님이 오면 여기에 한 줄씩</span>}
      {rs.map((r) => { const t = GUEST_TYPES.find((g) => g.id === r.type)!; return <div key={r.id} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Ico name={`mood_${r.mood}`} /><b>{t.name}</b><span style={{ color: r.fame > 0 ? C.green : r.fame < 0 ? C.red : C.soft }}>명성 {r.fame > 0 ? '+' : ''}{r.fame}</span><span style={{ color: C.gold }}>소지금 +{won(r.money)}</span></div>; })}
    </div>
  );
}
function Window({ title, onClose, children, tabs }: { title: string; onClose: () => void; children: React.ReactNode; tabs?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 6, right: 6, top: 36, bottom: ABOVE_BOTTOM, ...panel, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
      <div style={titleBar}><span style={{ flex: 1 }}>{title}</span>{tabs}<button style={{ ...btnOff, padding: '2px 8px' }} onClick={onClose}>뒤로</button></div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</div>
    </div>
  );
}
/** 시트에서 잘라 낸 시설 그림 */
function Sprite({ id, size = 56 }: { id: string; size?: number }) {
  const d = facilityDef(id);
  const url = useThumb(d.sub === 'floor' ? (d.floor === 'path' ? 'iso_obj_path' : `iso_tile_floor_${d.floor}`) : id === 'wall' ? 'iso_obj_wall_nw' : `iso_obj_${id}`, size);
  return url ? <img className="px" src={url} width={size} height={size} alt="" style={{ imageRendering: 'pixelated' }} /> : <div style={{ width: size, height: size }} />;
}
function Ico({ name, size = 14 }: { name: string; size?: number }) { return <img className="px" src={assetUrl(`assets/icons/icon_${name}.png`)} width={size} height={size} alt="" style={{ imageRendering: 'pixelated', verticalAlign: 'middle' }} />; }
/** 카탈로그 = 3열 그림 격자 (영상 12:20). 잠긴 칸은 까맣게. 고른 것의 이름·값은 아래 한 줄. */
function BuildWindow({ s, onPick, onClose }: { s: GameState; onPick: (id: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('seat');
  const [pick, setPick] = useState<string | null>(null);
  const items = FACILITIES.filter((d) => d.tab === tab);
  const d = pick ? facilityDef(pick) : null;
  const open = d ? s.unlocked.facilities.includes(d.id) : false;
  return (
    <Window title="건축" onClose={onClose} tabs={(['env', 'seat', 'shop'] as Tab[]).map((t) => <button key={t} style={{ ...(tab === t ? btnGold : btnOff), padding: '2px 8px', fontSize: 13 }} onClick={() => { setTab(t); setPick(null); }}>{TAB_KO[t]}</button>)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {items.map((it) => { const isOpen = s.unlocked.facilities.includes(it.id); const on = pick === it.id; return (
          <div key={it.id} onClick={() => setPick(it.id)} style={{ ...(isOpen ? tile : tileLocked), outline: on ? `3px solid ${C.gold}` : 'none' }}>
            {isOpen ? <Sprite id={it.id} /> : <div style={{ width: 56, height: 56, display: 'grid', placeItems: 'center' }}><Ico name="lock" size={20} /></div>}
            <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.1 }}>{isOpen ? it.name : '???'}</div>
          </div>); })}
      </div>
      {d && <div style={{ ...panel, marginTop: 8, padding: 6, display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', bottom: 0 }}>
        <Sprite id={d.id} size={48} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
          <b>{open ? d.name : '???'}</b> <span style={small}>{d.w}×{d.h}</span>
          <div style={small}>{open ? `${won(d.cost)} · 유지 ${won(d.upkeep)}/월${d.pop !== undefined ? ` · 인기 ${d.pop}` : ''}${d.scenery ? ` · 경치 +${d.scenery}` : ''}${d.fee ? ` · 요금 ${won(d.fee)}` : ''}${d.sub === 'wall' ? ' · 둘러싸면 실내' : ''}` : `연구 ${d.unlock}로 열린다 (정보 › 연구)`}</div>
          {open && d.tags && <div style={small}>{d.tags.map((t) => GUEST_TYPES.find((g) => g.id === t)?.name).join('·')}에게 인기</div>}
        </div>
        {open && <button style={s.money >= d.cost ? btnGold : btnOff} onClick={() => { if (s.money >= d.cost) onPick(d.id); }}>{d.sub === 'floor' ? '깔기' : '놓기'}</button>}
      </div>}
    </Window>
  );
}
function GuestsWindow({ s, onClose }: { s: GameState; onClose: () => void }) {
  return (
    <Window title="손님층" onClose={onClose}>
      <div style={{ ...small, marginBottom: 6 }}>타깃을 고르면 그 손님층이 두 배로 온다. 손님층마다 지갑과 눈높이가 다르다.</div>
      {GUEST_TYPES.map((g) => { const open = s.unlocked.guests.includes(g.id); const liked = FACILITIES.filter((d) => d.tags?.includes(g.id) && s.unlocked.facilities.includes(d.id)).map((d) => d.name).slice(0, 4).join('·'); return (
        <div key={g.id} style={{ ...panel, padding: 6, marginBottom: 6, background: s.target === g.id ? '#fff0c0' : '#fff7e6', display: 'flex', alignItems: 'center', gap: 8, opacity: open ? 1 : 0.5 }}>
          <Portrait {...guestTypeFace(g.id)} size={44} />
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
        {s.staff.map((st) => <div key={st.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><Portrait face={st.face} accs={['apron']} size={40} /><span style={{ flex: 1 }}><b>{st.name}</b> <span style={small}>서비스 {'★'.repeat(st.service)} · 월급 {won(st.wage)}</span></span><button style={btnOff} onClick={() => dispatch({ type: 'fire', staffId: st.id })}>내보내기</button></div>)}
        <div style={{ ...small, marginTop: 6 }}>이달 후보</div>
        {s.candidates.map((c) => <div key={c.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><Portrait face={c.face} size={40} /><span style={{ flex: 1 }}><b>{c.name}</b> <span style={small}>서비스 {'★'.repeat(c.service)} · 월급 {won(c.wage)}</span></span><button style={canHire(s, c.id).ok ? btn : btnOff} onClick={() => { const r = dispatch({ type: 'hire', candidateId: c.id }); if (!r.ok) alert(r.reason); }}>채용</button></div>)}
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
        <RankChart s={s} />
      </div>}
    </Window>
  );
}
/** 경쟁 카페별 연도 점수 선 그래프 + 내 점수(평가 기록 · 지금). 5년치. */
function RankChart({ s }: { s: GameState }) {
  const YEARS = 5, W = 300, H = 120, PL = 34, PB = 16;
  const colors = ['#c8402e', '#d4a13c', '#3a6fb0', '#3f8f3a', '#8b5a2b'];
  const mine = [...s.evaluations.map((e) => ({ y: e.year, v: e.score })), { y: s.clock.year, v: myScore(s) }];
  const max = Math.max(100, ...RIVALS.map((r) => rivalScore(r.id, YEARS)), ...mine.map((m) => m.v)) * 1.05;
  const X = (y: number) => PL + ((y - 1) / (YEARS - 1)) * (W - PL - 6);
  const Y = (v: number) => H - PB - (v / max) * (H - PB - 6);
  return (
    <div style={{ ...panel, padding: 6, background: '#fff7e6', marginTop: 4 }}>
      <div style={small}>해마다 점수 — 굵은 선이 우리 카페</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.5, 1].map((k) => <g key={k}><line x1={PL} x2={W - 6} y1={Y(max * k)} y2={Y(max * k)} stroke="#d8c9a8" strokeWidth={1} /><text x={PL - 4} y={Y(max * k) + 4} fontSize={9} textAnchor="end" fill="#7a6650">{Math.round(max * k)}</text></g>)}
        {Array.from({ length: YEARS }, (_, i) => <text key={i} x={X(i + 1)} y={H - 4} fontSize={9} textAnchor="middle" fill="#7a6650">{i + 1}년</text>)}
        {RIVALS.map((r, i) => <polyline key={r.id} fill="none" stroke={colors[i]} strokeWidth={1.5} strokeDasharray="3 2" points={Array.from({ length: YEARS }, (_, k) => `${X(k + 1)},${Y(rivalScore(r.id, k + 1))}`).join(' ')} />)}
        <polyline fill="none" stroke="#2b2118" strokeWidth={3} points={mine.map((m) => `${X(Math.min(YEARS, m.y))},${Y(m.v)}`).join(' ')} />
        {mine.map((m, i) => <circle key={i} cx={X(Math.min(YEARS, m.y))} cy={Y(m.v)} r={3} fill="#d4a13c" stroke="#2b2118" />)}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 11 }}>{RIVALS.map((r, i) => <span key={r.id} style={{ color: colors[i] }}>— {r.name}</span>)}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) { return <div style={{ display: 'flex', gap: 8 }}><span style={{ ...small, minWidth: 96 }}>{k}</span><span>{v}</span></div>; }
function SoundRow() {
  const [, bump] = useState(0);
  const r = () => bump((n) => n + 1);
  return (
    <div style={{ ...panel, padding: 6, background: '#fff7e6', display: 'grid', gap: 4, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1 }}>소리</span><button style={isMuted() ? btnOff : btnGold} onClick={() => { unlockAudio(); setMuted(!isMuted()); r(); }}>{isMuted() ? '꺼짐' : '켜짐'}</button></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...small, minWidth: 48 }}>음악</span><input type="range" min={0} max={100} value={getBgmVolume()} style={{ flex: 1 }} onChange={(e) => { setBgmVolume(Number(e.target.value)); r(); }} /><span style={small}>{getBgmVolume()}</span></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...small, minWidth: 48 }}>효과음</span><input type="range" min={0} max={100} value={getSfxVolume()} style={{ flex: 1 }} onChange={(e) => { setSfxVolume(Number(e.target.value)); r(); }} onPointerUp={() => sfx('coin')} /><span style={small}>{getSfxVolume()}</span></label>
    </div>
  );
}
function SystemWindow({ onClose }: { onClose: () => void }) {
  return (
    <Window title="시스템" onClose={onClose}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ ...small }}>카페 이름</div>
        <input defaultValue={getState().cafeName} maxLength={12} style={{ fontFamily: 'inherit', fontSize: 15, padding: 6 }} onBlur={(e) => dispatch({ type: 'setName', name: e.target.value })} />
        <SoundRow />
        <button style={btn} onClick={() => { save(); alert('저장했어요'); }}>저장</button>
        <button style={btnOff} onClick={() => { if (confirm('새로 시작할까요? 지금 게임은 사라져요.')) { restart(); onClose(); } }}>새 게임</button>
        <div style={small}>하루가 끝날 때마다 자동 저장. 적자는 빨간 숫자일 뿐 게임 오버는 없다 — 잔고가 −200만 아래면 삼춘이 300만을 꿔 준다(연 1회, 3번까지).</div>
      </div>
    </Window>
  );
}
/** 시설 카드 = 손익계산서 한 장 (영상 15:00) */
/** 손님 팝업: 누구인지·지갑·눈높이·지금 뭐 하는지 */
function GuestPopup({ s, g, onClose }: { s: GameState; g: Guest; onClose: () => void }) {
  const t = GUEST_TYPES.find((x) => x.id === g.type)!;
  const tf = g.target ? s.facilities[g.target] ?? null : null;
  const tname = tf ? (tf.name ?? facilityDef(tf.type).name) : null;
  const doing = g.phase === 'in' ? (tname ? `${tname}(으)로 가는 중` : '들어오는 중') : g.phase === 'use' ? `${tname ?? '자리'} 이용 중 (${Math.ceil(g.timerMs / 1500 * 60)}분 남음)` : g.mood === 'happy' ? '만족하며 돌아가는 중' : g.mood === 'angry' ? '실망해서 돌아가는 중' : '그럭저럭 돌아가는 중';
  const liked = FACILITIES.filter((d) => d.tags?.includes(g.type) && s.unlocked.facilities.includes(d.id)).map((d) => d.name).slice(0, 4).join('·');
  return (
    <div style={{ position: 'absolute', left: 6, right: 6, bottom: ABOVE_BOTTOM, ...panel, fontSize: 13, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Portrait face={g.face} accs={guestAccs(g.type)} size={64} />
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <div><b style={{ fontSize: 15 }}>{t.name}</b> {g.mood && <Ico name={`mood_${g.mood}`} />}</div>
        <div style={small}>지갑 {won(t.wallet)} · 눈높이 {t.expect}{s.target === g.type ? ' · 타깃' : ''}</div>
        <div>{doing}</div>
        <div style={small}>{liked ? `좋아함: ${liked}` : '좋아하는 시설이 아직 없다'}</div>
      </div>
      <button style={btnOff} onClick={onClose}>닫기</button>
    </div>
  );
}
function FacilityCard({ s, f, onSelect, onClose, onMore, onGuest }: { s: GameState; f: Facility; onSelect: (id: string) => void; onClose: () => void; onMore: (id: string) => void; onGuest: (id: string) => void }) {
  const d = facilityDef(f.type);
  const sh = sheetOf(s, f);
  const list = Object.values(s.facilities);
  const i = list.findIndex((x) => x.id === f.id);
  const go = (k: number) => onSelect(list[(i + k + list.length) % list.length]!.id);
  const lv = canLevelUp(s, f.id);
  const [renaming, setRenaming] = useState(false);
  return (
    <div style={{ position: 'absolute', left: 6, right: 6, bottom: ABOVE_BOTTOM, ...panel, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={{ ...btnOff, padding: '2px 8px' }} onClick={() => go(-1)}>◀</button>
        <Sprite id={f.type} size={32} /><b style={{ flex: 1, fontSize: 15 }}>{f.name ?? d.name}{f.level > 1 ? ` Lv${f.level}` : ''} <span style={small}>{i + 1}/{list.length}</span></b>
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
          <tr><td>{sh.indoor ? '실내' : '바깥'} <span style={small}>{sh.indoor ? '벽으로 둘러싸임' : '겨울엔 −6'}</span></td><td style={{ textAlign: 'right' }}>{sh.season}</td><td /></tr>
          <tr style={{ fontWeight: 700, borderTop: `1px solid ${C.wood}` }}><td>합계</td><td style={{ textAlign: 'right' }}>{sh.total}</td><td style={{ textAlign: 'right' }}>{won(sh.fee)}</td></tr>
        </tbody></table>
      ) : <div style={{ marginTop: 4 }}>경치 <b>+{d.scenery ?? 0}</b> <span style={small}>반경 2 자리·가게의 인기를 올린다</span>{sh.pairs.length > 0 && <div style={small}>상성: {sh.pairs.map((p) => p.name).join('·')}</div>}</div>}
      {sh.likedBy.length > 0 && <div style={small}>{sh.likedBy.map((t) => GUEST_TYPES.find((g) => g.id === t)?.name).join('·')}에게 인기</div>}
      {(() => { const here = s.guests.filter((g) => g.target === f.id && g.phase === 'use'); return here.length > 0 && <div style={{ ...small, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>지금 손님: {here.map((g) => <button key={g.id} style={{ ...btnOff, padding: '1px 6px', fontSize: 12 }} onClick={() => onGuest(g.id)}>{GUEST_TYPES.find((t) => t.id === g.type)?.name} 보기</button>)}</div>; })()}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {isUsable(d) && <button style={lv.ok ? btn : btnOff} title={lv.reason} onClick={() => { const r = dispatch({ type: 'levelUp', facilityId: f.id }); if (!r.ok) alert(r.reason); }}>Lv업 <span style={{ fontSize: 11 }}>{LEVEL_COST[f.level] !== undefined ? `(연구 ${LEVEL_COST[f.level]} · ${wonShort(levelMoney(s, f.id))})` : '(최고)'}</span></button>}
        <button style={btn} onClick={() => onMore(f.type)}>같은 것 더</button>
        {isUsable(d) && (() => { const same = Object.values(s.facilities).filter((x) => x.type === f.type && canLevelUp(s, x.id).ok); return same.length >= 2 && <button style={btn} onClick={() => { let n = 0; for (const x of same) if (dispatch({ type: 'levelUp', facilityId: x.id }).ok) n++; if (n) sfx('unlock'); }}>{d.name} 전부 Lv업 <span style={{ fontSize: 11 }}>({same.length}개 · {wonShort(same.reduce((a, x) => a + levelMoney(s, x.id), 0))})</span></button>; })()}
        <button style={btnOff} onClick={() => setRenaming(true)}>이름</button>
        <button style={{ ...btnOff, background: C.red, color: '#fff' }} onClick={() => { const r = dispatch({ type: 'remove', facilityId: f.id }); if (!r.ok) alert(r.reason); else onClose(); }}>치우기 <span style={{ fontSize: 11 }}>(반값 환불)</span></button>
      </div>
      {renaming && <div style={{ display: 'flex', gap: 4, marginTop: 6 }}><input autoFocus defaultValue={f.name ?? d.name} maxLength={12} style={{ flex: 1, fontFamily: 'inherit' }} onKeyDown={(e) => { if (e.key === 'Enter') { dispatch({ type: 'rename', facilityId: f.id, name: (e.target as HTMLInputElement).value }); setRenaming(false); } }} /><button style={btnOff} onClick={() => setRenaming(false)}>취소</button></div>}
    </div>
  );
}
