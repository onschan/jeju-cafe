/** 새 조작 (2단계). 창은 넷: 건축 · 손님층 · 정보 · 시스템. 그 밖엔 시설 카드(손익계산서)와 하단 띠(목표 한 줄 · 영수증 · 손님/자리/인기)뿐. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { View, ghostOf, WALL_SPRITE, type Ghost } from './View';
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
import { FACILITIES, GUEST_TYPES, MENUS, INVESTS, facilityDef, isFloorDef, isUsable, sheetOf, usables, popularitySum, dailyGuests, unlockables, canUnlock, canLevelUp, LEVEL_COST, levelMoney, currentObjective, OBJECTIVES, seasonOf, canHire, upkeepTotal, wagesTotal, myScore, rivalScore, RIVALS, lineCells, canLayFloor, parcelAt, cellAt, parcelAdjacent, type GameState, type Tab, type Facility, type Pt, type Parcel, type Objective, type Guest, previewPlace, AMENITY_TEXT, cellEdges, getWall, edgeOf, nearestSide, type Side4, needsSummary, SKILLS, SKILL_KO, SKILL_DESC, DUTY_KO, gradeOf, effSkill, skillSum, staffSkill, CHANNELS, canRecruit, channelDef, STAFF_MAX, type Grade, type Staff, type Skill } from '../game/index.ts';

type Win = 'build' | 'guests' | 'ops' | 'cafe' | 'system' | null;
/** 하단 띠(영수증 2줄 + 요약 + 메뉴) 높이 */
const BOTTOM_H = 22 + 24 + 58 + 3;
const ABOVE_BOTTOM = BOTTOM_H + MESSAGE_LINE_H + 4;
const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' } as const;
const TAB_KO: Record<Tab, string> = { env: '환경', seat: '시설', shop: '가게' };
/** 줄로 놓는 것: 바닥·벽 (탭·드래그로 줄을 잡는다) */
const isLine = (id: string) => { const d = facilityDef(id); return isFloorDef(d) || d.sub === 'wall'; };

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
  /** 벽 세우기 방식: 네모 둘레 / 한 변씩(방향: 자동=탭한 지점에 가까운 변) */
  const [wallMode, setWallMode] = useState<'rect' | 'edge'>('edge');
  const [wallSide, setWallSide] = useState<'auto' | Side4>('auto');
  const wallModeRef = useRef(wallMode); wallModeRef.current = wallMode;
  const wallSideRef = useRef(wallSide); wallSideRef.current = wallSide;
  const dragSide = useRef<Side4>('n');
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
      onTap: (x, y, fx = 0.5, fy = 0.5) => {
        const st = getState();
        sfx('tap');
        const id = placingRef.current;
        if (id) {
          // 탭은 자리만 잡는다 — 놓는 건 띠의 「놓기/깔기」로 (탭마다 놓이면 실수가 잦다)
          let g: Ghost;
          if (facilityDef(id).sub === 'wall' && wallModeRef.current === 'edge') {
            const side = wallSideRef.current === 'auto' ? nearestSide(fx, fy) : wallSideRef.current;
            g = ghostOf(st, id, x, y, undefined, [edgeOf(x, y, side)]);
          } else g = isLine(id) ? ghostOf(st, id, x, y, { from: { x, y }, to: { x, y } }) : ghostOf(st, id, x, y);
          setGhost(g);
          if (!g.ok && g.reason) { viewRef.current?.say(x, y, g.reason); sfx('error'); } // 안 되는 자리는 그 자리에 이유를
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
      dragCapture: (x, y, fx = 0.5, fy = 0.5) => {
        const id = placingRef.current; if (!id || !isLine(id)) return false;
        lineFrom.current = { x, y };
        if (facilityDef(id).sub === 'wall' && wallModeRef.current === 'edge') { dragSide.current = wallSideRef.current === 'auto' ? nearestSide(fx, fy) : wallSideRef.current; setGhost(ghostOf(getState(), id, x, y, undefined, [edgeOf(x, y, dragSide.current)])); return true; }
        setGhost(ghostOf(getState(), id, x, y, { from: { x, y }, to: { x, y } })); return true;
      },
      onDragCell: (x, y) => {
        const id = placingRef.current; const from = lineFrom.current; if (!id || !from) return;
        if (facilityDef(id).sub === 'wall' && wallModeRef.current === 'edge') { setGhost(ghostOf(getState(), id, x, y, { from, to: { x, y } }, lineCells(from, { x, y }).map((c) => edgeOf(c.x, c.y, dragSide.current)))); return; } // 드래그한 칸마다 같은 방향 변에
        setGhost(ghostOf(getState(), id, x, y, { from, to: { x, y } }));
      },
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
  const opsBadge = canResearch || s.candidates.length > 0 || (s.staff.length === 0 && usables(s).length >= 3);
  const sel = selected ? s.facilities[selected] ?? null : null;
  const fontStyle: CSSProperties = { fontFamily: 'Galmuri11, system-ui, sans-serif' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#15110c', display: 'flex', justifyContent: 'center', ...fontStyle, userSelect: 'none' }}>
    {/* 폰 한 판 폭으로 가운데 고정 — 넓은 화면에서 창이 끝까지 늘어나지 않게 */}
    <div style={{ position: 'relative', width: 'min(100vw, 520px)', height: '100%', background: C.dark, overflow: 'hidden', boxShadow: '0 0 0 2px #4a2f16' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {/* 상단 바 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30, background: C.paper, borderBottom: `3px solid ${C.wood}`, display: 'flex', alignItems: 'center', gap: 5, padding: '0 5px', fontSize: 12, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box' }}>
        <Ico name={seasonOf(s.clock.month)} size={14} /><b>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</b><span style={{ ...small, fontSize: 11 }}>{String(s.clock.hour).padStart(2, '0')}시</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, transition: 'transform .12s ease-out', transform: moneyBump ? 'scale(1.15)' : 'none' }}><Ico name="money" size={12} /><b style={{ color: s.money < 0 ? C.red : moneyBump ? C.gold : C.ink }}>{wonShort(s.money)}</b></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Ico name="star" size={12} /><b>{s.fame}</b></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Ico name="research" size={12} /><b>{s.research}</b></span>
        <button onClick={() => { setWin(win === 'system' ? null : 'system'); setSelected(null); }} style={{ ...(win === 'system' ? btnGold : btnOff), padding: 1, width: 22, height: 20, lineHeight: 0, display: 'grid', placeItems: 'center' }} title="시스템"><Ico name="settings" size={14} /></button>
        <span style={{ display: 'inline-flex', gap: 2, marginLeft: 2 }}>{([0, 1, 3] as const).map((sp) => <button key={sp} onClick={() => dispatch({ type: 'setSpeed', speed: sp })} style={{ ...(s.clock.speed === sp ? btnGold : btnOff), padding: 1, width: 22, height: 20, lineHeight: 0, display: 'grid', placeItems: 'center' }}><Ico name={sp === 0 ? 'speed_pause' : `speed_${sp}`} size={14} /></button>)}</span>
      </div>
      {/* 목표 한 줄 */}
      {obj && !placing && <div style={{ position: 'absolute', top: 36, left: 8, right: 8, ...panel, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }} onClick={() => setWin('cafe')}><Ico name="flag" /> {obj.text} <span style={small}>· 상금 {wonShort(obj.reward)}</span></div>}
      {/* 배치 모드 띠 */}
      {placing && <PlacingBar id={placing} ghost={ghost} wallMode={wallMode} wallSide={wallSide} onWallMode={(m) => { setWallMode(m); setGhost(null); }} onWallSide={(sd) => { setWallSide(sd); setGhost((g) => g && g.edges ? ghostOf(getState(), g.id, g.x, g.y, g.line, (g.line ? lineCells(g.line.from, g.line.to) : [{ x: g.x, y: g.y }]).map((c) => edgeOf(c.x, c.y, sd === 'auto' ? 'n' : sd))) : g); }} onDone={() => { setPlacing(null); setGhost(null); }} onConfirm={() => {
        const g = ghost; if (!g) return; const d = facilityDef(placing);
        const r = d.sub === 'wall' && g.edges ? dispatch({ type: 'wallEdges', id: placing, edges: g.edges }) : d.sub === 'wall' ? dispatch({ type: 'wallRect', id: placing, from: g.line?.from ?? { x: g.x, y: g.y }, to: g.line?.to ?? { x: g.x, y: g.y } }) : isLine(placing) && g.line ? dispatch({ type: 'placeLine', id: placing, from: g.line.from, to: g.line.to }) : dispatch({ type: 'place', id: placing, x: g.x, y: g.y });
        if (!r.ok) { flash(r.reason); return; }
        sfx(isFloorDef(d) || d.sub === 'wall' ? 'plant' : 'place');
        setGhost(g.edges ? ghostOf(getState(), placing, g.x, g.y, g.line, g.edges) : isLine(placing) ? ghostOf(getState(), placing, g.x, g.y, g.line) : ghostOf(getState(), placing, g.x, g.y)); // 같은 자리는 이제 막히니 빨갛게 — 다음 탭으로 옮긴다
      }} />}
      {/* 삼춘 메시지 줄 (알림·신발매·거절 이유) */}
      {ready && <MessageLine bottom={BOTTOM_H} flash={toast} />}
      {daySum && !win && !dlg && <DaySummary today={daySum.today} prev={daySum.prev} bottom={BOTTOM_H + MESSAGE_LINE_H + 8} />}
      {/* 하단: 영수증 띠 · 요약 띠 · 메뉴 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: C.paper, borderTop: `3px solid ${C.wood}`, color: C.ink }}>
        <Receipts s={s} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 0 8px', height: 24, fontSize: 12, color: C.soft, borderTop: `1px solid #d8c9a8`, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span>손님 <b style={{ color: C.ink }}>{s.guests.length}</b></span><span>오늘 <b style={{ color: C.ink }}>{s.todayGuests}</b>/{dailyGuests(s)}</span><span>자리 <b style={{ color: C.ink }}>{usables(s).length}</b></span><span>인기 <b style={{ color: C.ink }}>{popularitySum(s)}</b></span><span>직원 <b style={{ color: C.ink }}>{s.staff.length}</b></span>
          <span style={{ flex: 1 }} />
          {ready && <button style={{ ...btnOff, padding: '1px 6px', fontSize: 11, lineHeight: '16px' }} onClick={() => viewRef.current?.centerOn(getState())}><Ico name="home" size={11} /> 마당</button>}
        </div>
        <div style={{ display: 'flex', gap: 5, padding: 5 }}>
          {([['build', '건축', 'build'], ['guests', '손님', 'guest'], ['ops', '운영', 'hire'], ['cafe', '카페', 'home_cafe']] as const).map(([k, name, ico]) => <button key={k} style={{ ...(win === k ? btnGold : btn), flex: 1, padding: '6px 0', fontSize: 14, position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} onClick={() => { setWin(win === k ? null : k); setSelected(null); setFloorSel(null); setGuestSel(null); }}><Ico name={ico} size={18} />{name}{k === 'ops' && opsBadge && <span style={{ position: 'absolute', top: 4, right: 8, width: 10, height: 10, borderRadius: 5, background: C.red, border: '2px solid #fff8e8' }} />}</button>)}
        </div>
      </div>
      {!ready && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>불러오는 중…</div>}
      {win === 'build' && <BuildWindow s={s} onPick={(id) => { setPlacing(id); setWin(null); setGhost(null); }} onClose={() => setWin(null)} />}
      {win === 'guests' && <GuestsWindow s={s} onClose={() => setWin(null)} />}
      {win === 'ops' && <OpsWindow s={s} onClose={() => setWin(null)} />}
      {win === 'cafe' && <CafeWindow s={s} onClose={() => setWin(null)} />}
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
    </div>
  );
}

function PlacingBar({ id, ghost, wallMode, wallSide, onWallMode, onWallSide, onDone, onConfirm }: { id: string; ghost: Ghost | null; wallMode: 'rect' | 'edge'; wallSide: 'auto' | Side4; onWallMode: (m: 'rect' | 'edge') => void; onWallSide: (s: 'auto' | Side4) => void; onDone: () => void; onConfirm: () => void }) {
  const d = facilityDef(id);
  const floor = isFloorDef(d);
  const n = ghost?.line ? lineCells(ghost.line.from, ghost.line.to).filter((p) => canLayFloor(getState(), d.floor!, p.x, p.y).ok).length : 1;
  const wall = d.sub === 'wall';
  const pv = ghost && !floor ? previewPlace(getState(), id, ghost.x, ghost.y, wall ? ghost.line : undefined, ghost.edges) : null;
  const count = floor ? n : pv?.cells ?? 1;
  const short = !!ghost && (floor ? n > 0 : ghost.ok) && getState().money < d.cost * count;
  const can = !!ghost && (floor ? n > 0 : ghost.ok) && !short;
  // 기대효과 한 줄 — 그 자리에 놓으면 어떻게 되나
  const effect = (() => {
    if (!ghost || !ghost.ok) return null;
    if (floor) return `${n}칸 · 그 위에 자리·가게를 놓을 수 있어요`;
    if (!pv) return null;
    const bits: string[] = [];
    if (pv.total !== undefined) {
      const parts = [`기본 ${pv.base}`]; if (pv.bonus) parts.push(`상성 +${pv.bonus}`); if (pv.scenery) parts.push(`경치 +${pv.scenery}`); if (pv.comfort) parts.push(`아늑함 +${pv.comfort}`); if (pv.season) parts.push(pv.indoor ? `실내 +${pv.season}` : `겨울 ${pv.season}`);
      bits.push(`인기 ${pv.total} (${parts.join(' ')})${pv.fee ? ` · 요금 ${won(pv.fee)}` : ''}${pv.indoor ? ' · 실내' : ''}`);
    }
    if (d.comfort) bits.push(pv.comfortTouched > 0 ? `아늑함 +${d.comfort} → 자리·가게 ${pv.comfortTouched}곳 인기 합 +${pv.popDelta}` : `아늑함 +${d.comfort} · 반경 3에 실내 자리·가게가 없어요`);
    if (pv.amenity) bits.push(pv.amenity);
    if (d.scenery) bits.push(pv.sceneryTouched > 0 ? `경치 +${d.scenery} → 자리·가게 ${pv.sceneryTouched}곳 인기 합 +${pv.popDelta}` : `경치 +${d.scenery} · 반경 2에 자리·가게가 없어요`);
    if (wall) bits.push(pv.indoorGain > 0 ? `실내가 되는 자리·가게 ${pv.indoorGain}곳 (실내 +2 · 겨울 −6 면함)${pv.popDelta ? ` · 인기 합 ${pv.popDelta > 0 ? '+' : ''}${pv.popDelta}` : ''}` : `벽 ${pv.cells}변 · 아직 안 둘러싸여요 (올렛길 쪽은 문으로 비워요)`);
    if (pv.pairs.length) bits.push(`상성 UP: ${pv.pairs.join('·')}`);
    if (pv.guestsDelta > 0) bits.push(`하루 손님 +${pv.guestsDelta}`);
    return bits.join('  ·  ');
  })();
  return (
    <div style={{ position: 'absolute', top: 36, left: 8, right: 8, ...panel, padding: '6px 8px', fontSize: 13, display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sprite id={id} size={28} /><b>{d.name}</b>
        <span style={{ flex: 1, minWidth: 0 }}>{floor || wall ? (ghost?.line || ghost?.edges ? `${count}${wall ? '변' : '칸'} · ${won(d.cost * count)}` : wall ? (wallMode === 'rect' ? '바닥 위를 드래그해 네모를 잡아요' : '칸의 변 가까이를 탭해요 · 드래그하면 줄로') : '탭하거나 드래그해서 줄을 잡아요') : !ghost ? `탭해서 자리를 잡아요 · ${won(d.cost)}` : !ghost.ok ? <span style={{ color: C.red }}>{ghost.reason}</span> : won(d.cost)}</span>
        <span style={{ ...small, color: short ? C.red : C.soft, fontWeight: short ? 700 : 400 }}>{short ? `${wonShort(d.cost * count - getState().money)} 모자라요` : wonShort(getState().money)}</span>
        <button style={can ? btnGold : btnOff} disabled={!can} onClick={onConfirm}>{floor ? '깔기' : wall ? (wallMode === 'edge' ? '세우기' : '두르기') : '놓기'}</button>
        <button style={btnOff} onClick={onDone}>끝</button>
      </div>
      {wall && <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderTop: '1px solid #d8c9a8', paddingTop: 4, flexWrap: 'wrap' }}>
        <button style={{ ...(wallMode === 'edge' ? btnGold : btnOff), padding: '2px 8px', fontSize: 12 }} onClick={() => onWallMode('edge')}>한 변씩</button>
        <button style={{ ...(wallMode === 'rect' ? btnGold : btnOff), padding: '2px 8px', fontSize: 12 }} onClick={() => onWallMode('rect')}>네모 두르기</button>
        {wallMode === 'edge' && <>
          <span style={{ ...small, marginLeft: 4 }}>방향</span>
          {(['auto', 'n', 'e', 's', 'w'] as const).map((sd) => <button key={sd} title={SIDE_KO[sd]} style={{ ...(wallSide === sd ? btnGold : btnOff), padding: '2px 5px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }} onClick={() => onWallSide(sd)}>{sd !== 'auto' && <SideIcon side={sd} />}{SIDE_KO[sd]}</button>)}
        </>}
      </div>}
      {effect && <div style={{ fontSize: 12, color: C.green, borderTop: '1px solid #d8c9a8', paddingTop: 4 }}>{effect}</div>}
    </div>
  );
}

const SIDE_KO: Record<'auto' | Side4, string> = { auto: '자동', n: '뒤쪽', e: '오른쪽', s: '앞쪽', w: '왼쪽' };
/** 칸 다이아몬드에서 그 변만 굵게: n=우상, e=우하, s=좌하, w=좌상 */
function SideIcon({ side }: { side: Side4 }) {
  const T = [11, 1], R = [21, 6], B = [11, 11], L = [1, 6];
  const seg = side === 'n' ? [T, R] : side === 'e' ? [R, B] : side === 's' ? [B, L] : [L, T];
  return <svg width={22} height={12} viewBox="0 0 22 12" style={{ display: 'block' }}><polygon points="11,1 21,6 11,11 1,6" fill="none" stroke="#9a8468" strokeWidth={1} /><line x1={seg[0]![0]} y1={seg[0]![1]} x2={seg[1]![0]} y2={seg[1]![1]} stroke="#2b2118" strokeWidth={3} strokeLinecap="round" /></svg>;
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
      {cellEdges(p.x, p.y).some((e) => getWall(s, e)) && <button style={btnOff} onClick={() => { const r = dispatch({ type: 'removeWalls', x: p.x, y: p.y }); if (!r.ok) alert(r.reason); else sfx('remove'); }}>벽 걷어내기 <span style={{ fontSize: 11 }}>(반값)</span></button>}
      <button style={{ ...btnOff, background: C.red, color: '#fff' }} onClick={() => { const r = dispatch({ type: 'removeFloor', x: p.x, y: p.y }); if (!r.ok) alert(r.reason); else onClose(); }}>걷어내기</button>
      <button style={btnOff} onClick={onClose}>닫기</button>
    </div>
  );
}
/** 영수증 한 줄: 마지막 손님 (영상의 하단 띠) */
function Receipts({ s }: { s: GameState }) {
  const r = s.receipts[s.receipts.length - 1];
  const t = r ? GUEST_TYPES.find((g) => g.id === r.type) : null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px', height: 22, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {!r || !t ? <span style={small}>손님이 다녀가면 여기에 영수증이 찍혀요</span> : <>
        <Ico name={`mood_${r.mood}`} /><b>{t.name}</b>
        <span style={{ color: C.wood }}>+{won(r.money)}</span>
        <span style={{ color: r.fame > 0 ? C.green : r.fame < 0 ? C.red : C.soft }}>명성 {r.fame > 0 ? '+' : ''}{r.fame}</span>
        <span style={{ ...small, marginLeft: 'auto' }}>오늘 {s.todayGuests}명 · {wonShort(s.todayIncome)}</span>
      </>}
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
  const url = useThumb(d.sub === 'floor' ? (d.floor === 'path' ? 'iso_obj_path' : `iso_tile_floor_${d.floor}`) : d.sub === 'wall' ? `iso_obj_w_${WALL_SPRITE[id] ?? 'wood'}_ne` : `iso_obj_${id}`, size);
  return url ? <img className="px" src={url} width={size} height={size} alt="" style={{ imageRendering: 'pixelated' }} /> : <div style={{ width: size, height: size }} />;
}
function Ico({ name, size = 14 }: { name: string; size?: number }) { return <img className="px" src={assetUrl(`assets/icons/icon_${name}.png`)} width={size} height={size} alt="" style={{ imageRendering: 'pixelated', verticalAlign: 'middle' }} />; }
/** 카탈로그 = 3열 그림 격자 (영상 12:20). 잠긴 칸은 까맣게. 고른 것의 이름·값은 아래 한 줄. */
function BuildWindow({ s, onPick, onClose }: { s: GameState; onPick: (id: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab | 'ground' | 'indoor'>('seat');
  const [pick, setPick] = useState<string | null>(null);
  const items = FACILITIES.filter((d) => tab === 'ground' ? d.sub === 'floor' || d.sub === 'wall' : tab === 'indoor' ? !!d.indoor : d.tab === tab && d.sub !== 'floor' && d.sub !== 'wall' && !d.indoor);
  const d = pick ? facilityDef(pick) : null;
  const open = d ? s.unlocked.facilities.includes(d.id) : false;
  return (
    <Window title="건축" onClose={onClose} tabs={(['ground', 'env', 'seat', 'shop', 'indoor'] as (Tab | 'ground' | 'indoor')[]).map((t) => <button key={t} style={{ ...(tab === t ? btnGold : btnOff), padding: '2px 5px', fontSize: 12 }} onClick={() => { setTab(t); setPick(null); }}>{t === 'ground' ? '바닥·벽' : t === 'indoor' ? '실내' : TAB_KO[t]}</button>)}>
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
          <div style={small}>{open ? `${won(d.cost)} · 유지 ${won(d.upkeep)}/월${d.pop !== undefined ? ` · 인기 ${d.pop}` : ''}${d.scenery ? ` · 경치 +${d.scenery}` : ''}${d.fee ? ` · 요금 ${won(d.fee)}` : ''}${d.sub === 'wall' ? ' (변마다) · 칸의 변을 탭하거나 네모를 둘러서 · 둘러싸면 실내 +2, 겨울 −6 면함' : ''}${d.comfort ? ` · 아늑함 +${d.comfort}` : ''}${d.amenity ? ` · ${AMENITY_TEXT[d.amenity]}` : ''}${d.indoor ? ' · 실내 전용' : ''}` : `연구 ${d.unlock}로 열린다 (운영 › 연구)`}</div>
          {open && tab === 'indoor' && <div style={small}>벽으로 둘러싸인 바닥 위에만 놓입니다. 아늑함은 실내 반경 3 자리·가게의 인기를 올려요.</div>}
          {open && d.tags && <div style={small}>{d.tags.map((t) => GUEST_TYPES.find((g) => g.id === t)?.name).join('·')}에게 인기</div>}
        </div>
        {open && <button style={s.money >= d.cost ? btnGold : btnOff} onClick={() => { if (s.money >= d.cost) onPick(d.id); }}>{d.sub === 'floor' ? '깔기' : d.sub === 'wall' ? '두르기' : '놓기'}</button>}
      </div>}
    </Window>
  );
}
function GuestsWindow({ s, onClose }: { s: GameState; onClose: () => void }) {
  return (
    <Window title="손님" onClose={onClose}>
      <NeedsPanel s={s} />
      <div style={{ ...small, margin: '8px 0 6px' }}>손님층 — 타깃을 고르면 그 손님층이 두 배로 온다. 손님층마다 지갑과 눈높이가 다르다.</div>
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
/** 손님 니즈: 최근 영수증에서 「만족 못 한 까닭」을 모아 많은 순으로. 지금 손님의 만족률과 함께. */
function NeedsPanel({ s }: { s: GameState }) {
  const needs = needsSummary(s);
  const recent = s.receipts.slice(-30);
  const happy = recent.filter((r) => r.mood === 'happy').length;
  const rate = recent.length ? Math.round((happy / recent.length) * 100) : null;
  const FIX: Record<string, string> = { liked: '손님층이 좋아하는 시설을 놓아요 (아래 「좋아함」)', scenery: '나무·꽃·바위를 자리 옆에', comfort: '실내에 벽난로·책장·그림을', service: '운영 › 직원에서 채용', restroom: '건축 › 실내 › 화장실', synergy: '어울리는 것끼리 옆에 (상성 UP)', level: '시설 카드에서 Lv업', winter: '벽으로 둘러싸 실내로' };
  return (
    <div style={{ ...panel, padding: 8, background: '#fff7e6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><Ico name="bulb" /><b>손님 니즈</b><span style={small}>최근 {recent.length}명 · 만족 {rate === null ? '—' : `${rate}%`}</span></div>
      {needs.length === 0 ? <div style={small}>{recent.length ? '요즘 손님은 다 만족하고 가요.' : '손님이 다녀가면 여기에 쌓여요.'}</div> :
        needs.slice(0, 4).map((n) => <div key={n.need} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={{ ...small, minWidth: 28 }}>{n.n}명</span><b style={{ color: C.red }}>{n.text}</b><span style={small}>→ {FIX[n.need]}</span></div>)}
    </div>
  );
}
const GRADE_COLOR: Record<Grade, string> = { S: '#c8402e', A: '#d4a13c', B: '#3f8f3a', C: '#3a6fb0', D: '#7a6650', E: '#9a8f80' };
/** 능력 4칸: 접객 A · 손놀림 B … 글자 등급으로 */
function Skills({ st, duty }: { st: Pick<Staff, 'service' | 'speed' | 'clean' | 'charm'>; duty?: Skill }) {
  return <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{SKILLS.map((k) => { const g = gradeOf(st[k]); const on = duty === k; return <span key={k} title={`${SKILL_KO[k]} ${st[k]} — ${SKILL_DESC[k]}`} style={{ fontSize: 12, color: on ? C.ink : C.soft, background: on ? '#ffe9a8' : 'transparent', borderRadius: 3, padding: on ? '0 3px' : 0 }}>{SKILL_KO[k]} <b style={{ color: GRADE_COLOR[g], fontSize: 14 }}>{g}</b></span>; })}</span>;
}
/** 팀 효율: 담당별 합과 그 효과 — 「누가 뭘 맡아 얼마를 내고 있나」 */
function TeamPanel({ s }: { s: GameState }) {
  const rows: { k: Skill; v: number; eff: string }[] = [
    { k: 'service', v: staffSkill(s, 'service'), eff: `손님 만족 +${(Math.min(30, staffSkill(s, 'service') * 1.2) / 3).toFixed(1)}` },
    { k: 'speed', v: staffSkill(s, 'speed'), eff: `자리 회전 ${Math.round(Math.min(40, staffSkill(s, 'speed') * 1.5))}% 빨라짐` },
    { k: 'clean', v: staffSkill(s, 'clean'), eff: `깔끔 점수 +${Math.min(6, staffSkill(s, 'clean') * 0.3).toFixed(1)}` },
    { k: 'charm', v: staffSkill(s, 'charm'), eff: `입소문 ${Math.round(Math.min(0.8, 0.5 + staffSkill(s, 'charm') * 0.015) * 100)}%` },
  ];
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div style={{ ...panel, padding: 8, background: '#fff7e6', display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Ico name="staff" /><b>우리 팀</b><span style={small}>담당한 능력만 제값, 나머지는 1/4</span></div>
      {rows.map((r) => <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ minWidth: 44, color: C.soft }}>{SKILL_KO[r.k]}</span>
        <span style={{ flex: 1, height: 8, background: '#e6d9bd', border: `1px solid ${C.wood}`, borderRadius: 2, overflow: 'hidden' }}><span style={{ display: 'block', width: `${(r.v / max) * 100}%`, height: '100%', background: C.wood }} /></span>
        <b style={{ minWidth: 26, textAlign: 'right' }}>{r.v.toFixed(1)}</b><span style={{ ...small, minWidth: 128 }}>{r.eff}</span>
      </div>)}
    </div>
  );
}
/** 직원 탭: 채용 루트 → 후보 → 우리 직원(담당·실적) */
function StaffTab({ s }: { s: GameState }) {
  const [open, setOpen] = useState(s.staff.length === 0);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <TeamPanel s={s} />
      {/* 채용 */}
      {s.hiring ? (() => { const ch = channelDef(s.hiring!.channel); return (
        <div style={{ ...panel, padding: 8, background: '#fff0c0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ico name="mail" size={18} /><span style={{ flex: 1 }}><b>{ch.name}</b> 진행 중<div style={small}>{s.hiring!.daysLeft}일 뒤 후보 {ch.n}명이 와요</div></span>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.wood }}>{s.hiring!.daysLeft}일</span>
        </div>); })() : (
        <div style={{ ...panel, padding: 8, background: '#fff7e6', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ico name="hire" /><b style={{ flex: 1 }}>사람 구하기</b><button style={btnOff} onClick={() => setOpen((v) => !v)}>{open ? '접기' : '펼치기'}</button></div>
          {open && CHANNELS.map((ch) => { const r = canRecruit(s, ch.id); const locked = !!ch.needFame && s.fame < ch.needFame; return (
            <div key={ch.id} style={{ ...panel, padding: 6, background: locked ? '#efe6d2' : '#fffdf6', display: 'flex', gap: 8, alignItems: 'center', opacity: locked ? 0.6 : 1 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{ch.name}</b> <span style={small}>{won(ch.cost)} · {ch.days}일 · 후보 {ch.n}명</span>
                <div style={small}>{ch.desc}</div>
                <div style={{ fontSize: 12 }}><span style={{ color: C.soft }}>기대 </span><b style={{ color: GRADE_COLOR[gradeOf(ch.hi)] }}>{gradeOf(ch.lo)}~{gradeOf(ch.hi)}</b>
                  <span style={{ color: C.soft }}> · S급 {ch.sChance > 0 ? `${(ch.sChance * 100).toFixed(1)}%` : '없음'}</span>
                  {ch.fame ? <span style={{ color: C.green }}> · 명성 +{ch.fame}</span> : null}
                  {locked && <span style={{ color: C.red }}> · 명성 {ch.needFame} 필요</span>}
                </div>
              </div>
              <button style={r.ok ? btnGold : btnOff} onClick={() => { const q = dispatch({ type: 'recruit', channel: ch.id }); if (!q.ok) alert(q.reason); else sfx('unlock'); }}>공고</button>
            </div>); })}
        </div>)}
      {/* 후보 */}
      {s.candidates.length > 0 && <div style={{ display: 'grid', gap: 4 }}>
        <div style={small}>후보 {s.candidates.length}명 — {channelDef(s.candidates[0]!.from).name}으로 왔어요. 뽑지 않으면 {s.candidates[0]!.until}일 뒤 돌아가요.</div>
        {s.candidates.map((c) => { const bs = SKILLS.reduce((a, k) => (c[k] > c[a] ? k : a), 'service' as Skill); return (
          <div key={c.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Portrait face={c.face} size={44} />
            <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b> <span style={small}>월급 {won(c.wage)}</span>
              <div><Skills st={c} /></div>
              <div style={small}>{DUTY_KO[bs]} 자리에 어울려요 (합 {skillSum(c)})</div>
            </span>
            <button style={canHire(s, c.id).ok ? btnGold : btnOff} onClick={() => { const r = dispatch({ type: 'hire', candidateId: c.id }); if (!r.ok) alert(r.reason); else sfx('fanfare'); }}>채용</button>
          </div>); })}
      </div>}
      {/* 우리 직원 */}
      <div style={small}>우리 직원 {s.staff.length}/{STAFF_MAX} — 담당을 바꿔 잘하는 자리에 앉혀요</div>
      {s.staff.length === 0 && <div style={{ ...small, color: C.red }}>아직 직원이 없어요. 위에서 공고를 내 보세요.</div>}
      {s.staff.map((st) => { const rate = st.month.served ? Math.round((st.month.happy / st.month.served) * 100) : null; const fit = st.duty === SKILLS.reduce((a, k) => (st[k] > st[a] ? k : a), 'service' as Skill); return (
        <div key={st.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Portrait face={st.face} accs={['apron']} size={44} />
            <span style={{ flex: 1, minWidth: 0 }}><b>{st.name}</b> <span style={small}>월급 {won(st.wage)}</span><div><Skills st={st} duty={st.duty} /></div></span>
            <button style={btnOff} onClick={() => { if (confirm(`${st.name}을 내보낼까요?`)) dispatch({ type: 'fire', staffId: st.id }); }}>내보내기</button>
          </div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...small, minWidth: 34 }}>담당</span>
            {SKILLS.map((k) => <button key={k} style={{ ...(st.duty === k ? btnGold : btnOff), padding: '2px 6px', fontSize: 12 }} onClick={() => dispatch({ type: 'setDuty', staffId: st.id, duty: k })}>{DUTY_KO[k]} <b>{gradeOf(st[k])}</b></button>)}
          </div>
          <div style={{ fontSize: 12, color: C.soft, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>이달 {st.duty === 'service' ? `${st.month.served}명 응대${rate === null ? '' : ` · 만족 ${rate}%`}` : `${DUTY_KO[st.duty]} 담당`}</span>
            <span>누적 {st.served}명</span>
            <span style={{ color: fit ? C.green : C.red }}>{fit ? '잘 맞는 자리' : '다른 자리가 더 나아요'}</span>
            <span>기여 {effSkill(st, st.duty).toFixed(0)} / 능력합 {skillSum(st)}</span>
          </div>
        </div>); })}
    </div>
  );
}
/** 운영: 연구 · 직원 · 투자 · 땅 */
function OpsWindow({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<'research' | 'staff' | 'invest'>(s.candidates.length > 0 || (s.staff.length === 0 && usables(s).length >= 3) ? 'staff' : 'research');
  const tabs = ([['research', '연구'], ['staff', '직원'], ['invest', '투자·땅']] as const).map(([k, n]) => <button key={k} style={{ ...(tab === k ? btnGold : btnOff), padding: '4px 8px', fontSize: 12 }} onClick={() => setTab(k)}>{n}</button>);
  return (
    <Window title="운영" onClose={onClose} tabs={tabs}>
      {tab === 'research' && <div style={{ display: 'grid', gap: 4 }}>
        <div style={small}>손님이 쓸 때마다 연구가 쌓인다 (만족하면 2). 연구 <b style={{ color: C.ink }}>{s.research}</b></div>
        {unlockables(s).map((u) => <div key={u.id} style={{ ...panel, padding: 6, background: u.done ? '#efe6d2' : '#fff7e6', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1, fontSize: 13 }}>{u.kind === 'facility' ? '시설' : u.kind === 'menu' ? '메뉴' : '손님층'} · <b>{u.name}</b></span><span style={small}>{u.cost}</span>{!u.done && <button style={canUnlock(s, u.id).ok ? btn : btnOff} onClick={() => { const r = dispatch({ type: 'unlock', id: u.id }); if (!r.ok) alert(r.reason); }}>열기</button>}{u.done && <span style={small}>열림</span>}</div>)}
      </div>}
      {tab === 'staff' && <StaffTab s={s} />}
      {tab === 'invest' && <div style={{ display: 'grid', gap: 4 }}>
        <div style={small}>내 땅 밖(동네)에 돈을 쓴다. 각 한 번. {s.invested.length}개 완료</div>
        {INVESTS.map((i) => <div key={i.id} style={{ ...panel, padding: 6, background: s.invested.includes(i.id) ? '#efe6d2' : '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ flex: 1 }}><b>{i.name}</b>{!s.invested.includes(i.id) && <span style={{ ...small, color: C.red }}> NEW</span>}<div style={small}>{i.desc} · {won(i.cost)}</div></span>{!s.invested.includes(i.id) && <button style={s.money >= i.cost ? btn : btnOff} onClick={() => { const r = dispatch({ type: 'invest', id: i.id }); if (!r.ok) alert(r.reason); }}>시행</button>}</div>)}
        <div style={{ ...small, marginTop: 6 }}>땅 (내 땅과 붙은 것만 · 맵의 팻말을 탭해도 된다)</div>
        {s.parcels.filter((p) => !p.owned).map((p) => <div key={p.id} style={{ ...panel, padding: 6, background: '#fff7e6', display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ flex: 1 }}><b>{p.name}</b> <span style={small}>{won(p.price)}</span></span><button style={btn} onClick={() => { const r = dispatch({ type: 'buyParcel', id: p.id }); if (!r.ok) alert(r.reason); }}>사기</button></div>)}
      </div>}
    </Window>
  );
}
/** 카페: 현황 · 목표 · 랭킹 */
function CafeWindow({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<'status' | 'goals' | 'rank'>('status');
  const tabs = ([['status', '현황'], ['goals', '목표'], ['rank', '랭킹']] as const).map(([k, n]) => <button key={k} style={{ ...(tab === k ? btnGold : btnOff), padding: '4px 8px', fontSize: 12 }} onClick={() => setTab(k)}>{n}</button>);
  return (
    <Window title={s.cafeName} onClose={onClose} tabs={tabs}>
      {tab === 'status' && <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
        <Row k="자금" v={won(s.money)} /><Row k="명성" v={String(s.fame)} /><Row k="연구" v={String(s.research)} />
        <Row k="시설 인기 합" v={String(popularitySum(s))} /><Row k="하루 손님" v={String(dailyGuests(s))} />
        <Row k="지난달" v={s.lastMonth ? `수입 ${won(s.lastMonth.income)} · 지출 ${won(s.lastMonth.spent)} · 손님 ${s.lastMonth.guests}` : '—'} />
        <Row k="이달 유지비 예정" v={`${won(upkeepTotal(s))} + 월급 ${won(wagesTotal(s))}`} />
        <Row k="누적 손님" v={`${s.stats.guests} (만족 ${s.stats.happy} · 돌아감 ${s.stats.turnedAway})`} />
        <Row k="직원" v={s.staff.length ? s.staff.map((st) => st.name).join('·') : '없음'} />
      </div>}
      {tab === 'goals' && <div style={{ display: 'grid', gap: 3 }}>
        <div style={small}>이루면 상금. 순서대로 하나씩.</div>
        {OBJECTIVES.map((o) => <div key={o.id} style={{ fontSize: 13, color: s.objectivesDone.includes(o.id) ? C.soft : C.ink, fontWeight: currentObjective(s)?.id === o.id ? 700 : 400 }}>{s.objectivesDone.includes(o.id) ? '✓' : currentObjective(s)?.id === o.id ? '▶' : '·'} {o.text} <span style={small}>{wonShort(o.reward)}</span></div>)}
      </div>}
      {tab === 'rank' && <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        <div style={small}>매년 12월 말 발표. 점수 = 명성 + 시설 인기 합. 지금 점수 <b style={{ color: C.ink }}>{myScore(s)}</b></div>
        {[{ id: 'me', name: s.cafeName, score: myScore(s) }, ...RIVALS.map((r) => ({ id: r.id, name: r.name, score: rivalScore(r.id, s.clock.year) }))].sort((a, b) => b.score - a.score).map((r, i) => <div key={r.id} style={{ display: 'flex', gap: 8, fontWeight: r.id === 'me' ? 700 : 400 }}><span>{i + 1}위</span><span style={{ flex: 1 }}>{r.name}</span><span>{r.score}</span></div>)}
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
          {sh.indoor && <tr><td>아늑함 <span style={small}>실내 반경 3</span></td><td style={{ textAlign: 'right' }}>{sh.comfort}</td><td /></tr>}
          <tr><td>{sh.indoor ? '실내' : '바깥'} <span style={small}>{sh.indoor ? '벽으로 둘러싸임' : '겨울엔 −6'}</span></td><td style={{ textAlign: 'right' }}>{sh.season}</td><td /></tr>
          <tr style={{ fontWeight: 700, borderTop: `1px solid ${C.wood}` }}><td>합계</td><td style={{ textAlign: 'right' }}>{sh.total}</td><td style={{ textAlign: 'right' }}>{won(sh.fee)}</td></tr>
        </tbody></table>
      ) : <div style={{ marginTop: 4 }}>{d.comfort ? <>아늑함 <b>+{d.comfort}</b> <span style={small}>실내 반경 3 자리·가게의 인기를 올린다</span></> : d.amenity ? <>{AMENITY_TEXT[d.amenity]} <span style={small}>(같은 종류는 하나만 셈)</span></> : <>경치 <b>+{d.scenery ?? 0}</b> <span style={small}>반경 2 자리·가게의 인기를 올린다</span></>}{sh.pairs.length > 0 && <div style={small}>상성: {sh.pairs.map((p) => p.name).join('·')}</div>}</div>}
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
