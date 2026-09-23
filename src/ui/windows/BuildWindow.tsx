/** 짓기 창 (스펙 §4.2). 카테고리 탭(쉼·편의·먹거리·즐길거리·농원·경관·길·담) → 2열 카드(아이소 스프라이트·이름·가격·입소문/경관).
 *  카드 탭 → 아래 설명 2줄 + `짓기`(onPickBuild). 잠긴 것은 반투명 + 조건 한글. 철거·이동은 미니카드(트랙 C) 몫. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../Icon';
import type { GameState, ObjectDef } from '../../sim/index.ts';
import { placeCost, constructions, canStartBuild, goalForFacility, isUpgradable, tierOf, mainBuilding, MAIN_TYPE, BUILD_TILES, TILE_TYPES, tileBadges, seatUseRate, STREET_BONUS_PCT, totalSeats, cafeScenery, treeOf, sceneryGainText, routeTakesGuests, ROUTE_IDS, gradeOf, type BuildTileId } from '../../sim/index.ts';
import { OBJECTS, objectDef } from '../../data/index.ts';
import { unlockText, wonText } from '../../data/labels.ts';
import { loadSheet, drawFrame, type Sheet } from '../sheetCanvas';
import { PALETTE, brownBtn, brownBtnOff } from '../frame';
import { josa } from '../../sim/josa.ts';
import { useWindowState, body, TabBar, soft, Empty, type WindowProps } from './shared.tsx';
import { SiteToggle } from '../SiteToggle.tsx';
import { showFirstTip } from '../firstTip';
import { CornerTab } from './CornerTab.tsx'; // fun-corner 「명당」 탭

export type BuildTab = 'building' | 'corner' | 'indoor' | 'rest' | 'convenience' | 'food' | 'fun' | 'farm' | 'scenery' | 'path' | 'wall';
/** fun: 짓기 창 첫 화면(6타일) · 타일 하위 목록 · 전체 목록(탭) */
export type BuildView = { kind: 'tiles' } | { kind: 'tile'; tile: BuildTileId } | { kind: 'all' };
/** 탭 순서 (§8.4): [건물 — 본관이 없을 때만(w-start)] · 명당(fun-corner) · 실내 · 쉼 · 편의 · 먹거리 · 즐길거리 · 농원 · 경관 · 길 · 담 */
export const BUILD_TABS: { key: BuildTab; label: string }[] = [
  { key: 'building', label: '건물' }, { key: 'corner', label: '명당' }, { key: 'indoor', label: '실내' }, { key: 'rest', label: '쉼' }, { key: 'convenience', label: '편의' }, { key: 'food', label: '먹거리' }, { key: 'fun', label: '즐길거리' },
  { key: 'farm', label: '농원' }, { key: 'scenery', label: '경관' }, { key: 'path', label: '길' }, { key: 'wall', label: '담' },
];
/** 본관 카드 「실내 꾸미기」처럼 창을 여는 쪽이 첫 탭을 지정한다 (App 창 매핑을 안 건드리고 — y-indoor). 한 번 읽으면 지워진다. */
let requestedTab: BuildTab | null = null;
export function requestBuildTab(tab: BuildTab): void { requestedTab = tab; }
let requestedTabWas = false;
function takeRequestedTab(): BuildTab | null { const t = requestedTab; requestedTabWas = t !== null; requestedTab = null; return t; }
/** fun: 짓기 창 첫 화면 기억 (세션) */
let lastView: BuildView | null = null;
/** ease: 짓기 창은 마지막 탭·스크롤 위치를 기억한다 (세션, 창을 여는 쪽이 탭을 지정하면 그게 우선) */
let lastTab: BuildTab | null = null;
let lastScrollTop = 0;
/** 테스트·새 게임용 초기화 */
export function resetBuildWindowMemory(): void { lastTab = null; lastScrollTop = 0; lastView = null; requestedTabWas = false; }
/** 「최근」 줄 개수 */
export const RECENT_N = 3;
/** ease 「최근」: 최근에 지은 시설 종류 (액션 로그의 place·placeLine 뒤에서부터, 중복 없이 최대 n) — 열려 있고 목록에 나오는 것만 */
export function recentBuildTypes(s: GameState, n = RECENT_N): string[] {
  const out: string[] = [];
  for (let i = s.actionLog.length - 1; i >= 0 && out.length < n; i--) {
    const a = s.actionLog[i]!.action;
    if (a.type !== 'place' && a.type !== 'placeLine') continue;
    const t = a.objectType;
    if (out.includes(t) || HIDDEN_IDS.has(t) || t === MAIN_TYPE || !s.unlocked.objects.includes(t)) continue;
    out.push(t);
  }
  return out;
}
/** 처음부터 맵에 있는 것·지형 — 짓기 목록에 안 나온다 (본관은 「건물」 탭에서 따로, 없을 때만) */
const HIDDEN_IDS = new Set(['busstop', 'warehouse', 'spring']);
/** 「건물」 탭 안내 (w-start 맨땅 튜토리얼 2단계) */
export const MAIN_CARD_HINT = '첫 본관은 무료·바로 완성 · 문은 앞쪽 왼쪽에 생겨요';

/** 오브젝트가 어느 탭에 속하나. 길·담·정낭은 kind로, 나무·농사 시설은 농원, 좌석은 쉼, 나머지는 시설 분류. */
export function buildTabOf(def: ObjectDef): BuildTab {
  if (def.indoor) return 'indoor'; // y-indoor §8.3: 실내 가구는 「실내」 탭 (방 안 칸에만 놓인다)
  if (def.kind === 'path') return 'path';
  if (def.kind === 'wall' || def.kind === 'gate') return 'wall';
  if (def.kind === 'tree' || def.yield || def.category === 'farm') return 'farm';
  if (def.category === 'rest' || def.category === 'convenience' || def.category === 'food' || def.category === 'fun') return def.category;
  if (def.kind === 'seat') return 'rest';
  return 'scenery';
}

/** 아이소 스프라이트를 2D 캔버스에. 시트가 없거나 프레임이 없으면 색 상자. */
function SpriteBox({ sheet, id, kind, w = 64, h = 48 }: { sheet: Sheet | null; id: string; kind: ObjectDef['kind']; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c || !sheet) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const name = `iso_obj_${id}`;
    const f = sheet.frames[name] ?? sheet.frames[`${name}_0`];
    if (!f) { setDrawn(false); return; }
    const scale = Math.min(w / f.w, h / f.h, 2);
    setDrawn(drawFrame(ctx, sheet, sheet.frames[name] ? name : `${name}_0`, w / 2, h, { anchorX: 0.5, anchorY: 1, scale }));
  }, [sheet, id, w, h]);
  const tint: Record<ObjectDef['kind'], string> = { seat: '#c99a5b', facility: '#8fb3d9', deco: '#8fcf8f', tree: '#6aa84f', wall: '#9a9a9a', path: '#d9c2a0', building: '#b07a4a', busstop: '#999', gate: '#8a6a4a', landmark: '#d4a13c' };
  return (
    <div style={{ position: 'relative', width: w, height: h, margin: '0 auto 4px' }}>
      {!drawn && <div aria-hidden style={{ position: 'absolute', inset: 8, background: tint[kind], border: `2px solid ${PALETTE.wood}`, borderRadius: 4 }} />}
      <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', inset: 0, imageRendering: 'pixelated' }} aria-hidden />
    </div>
  );
}

const cardBase: CSSProperties = { background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, padding: 6, textAlign: 'center', fontFamily: 'inherit', color: PALETTE.ink, minHeight: 44 };

export interface BuildWindowProps extends WindowProps { initialTab?: BuildTab }

export function BuildWindow(props: BuildWindowProps) {
  const { s } = useWindowState(props);
  const noMain = !mainBuilding(s); // w-start: 맨땅이면 「건물」 탭(카페 본관 카드)이 맨 앞에, 본관을 지으면 사라진다
  const [picked, setPicked] = useState<string | null>(null);
  const [tab, setTabState] = useState<BuildTab>(() => props.initialTab ?? takeRequestedTab() ?? (mainBuilding(s) ? (lastTab ?? 'rest') : 'building'));
  const setTab = (t: BuildTab) => { lastTab = t; lastScrollTop = 0; setTabState(t); };
  // fun: 첫 화면은 6타일 — 여는 쪽이 탭을 지정했거나(본관 카드 「실내 꾸미기」·명당 탭 글로우) 맨땅(건물 탭)이면 바로 전체 목록
  const [view, setView] = useState<BuildView>(() => (props.initialTab || requestedTabWas || !mainBuilding(s) ? { kind: 'all' } : (lastView ?? { kind: 'tiles' })));
  const goView = (v: BuildView) => { lastView = v.kind === 'all' ? v : null; lastScrollTop = 0; setView(v); setPicked(null); showFirstTip(null); }; // 창을 다시 열면 늘 6타일 첫 화면 (전체 목록만 기억) · 팁이 아래 「짓기」 줄을 가리지 않게 내린다
  const rootRef = useRef<HTMLDivElement>(null);
  // 스크롤 위치 기억: 셸의 스크롤 컨테이너(window-body)에 붙여, 열 때 되돌리고 닫힐 때 저장 (ease)
  useEffect(() => {
    const el = rootRef.current?.closest<HTMLElement>('[data-testid="window-body"]');
    if (!el) return;
    if (!props.initialTab && lastScrollTop > 0) el.scrollTop = lastScrollTop;
    const onScroll = () => { lastScrollTop = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [props.initialTab]);
  const recent = view.kind === 'all' && activeTabIsList(tab, noMain) && tab !== 'corner' ? recentBuildTypes(s) : [];
  const tabs = noMain ? BUILD_TABS : BUILD_TABS.filter((t) => t.key !== 'building');
  const activeTab: BuildTab = tab === 'building' && !noMain ? 'rest' : tab;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  useEffect(() => { let on = true; loadSheet().then((sh) => { if (on) setSheet(sh); }); return () => { on = false; }; }, []);

  const unlocked = new Set(s.unlocked.objects);
  const tileMode = view.kind === 'tile' && view.tile !== 'building' && view.tile !== 'all' ? view.tile : null;
  const items = tileMode
    ? TILE_TYPES[tileMode].map((id) => objectDef(id)).filter((d) => unlocked.has(d.id) || treeOf(d.id)).map((def) => ({ def, locked: (treeOf(def.id)?.index ?? 0) > 0 || !unlocked.has(def.id) })) // 트리 2단계부터는 짓지 않고 「업그레이드 ▲」로만
    : activeTab === 'building'
    ? (noMain ? [{ def: objectDef(MAIN_TYPE), locked: false }] : [])
    : activeTab === 'corner' ? [] // fun-corner: 명당 탭은 카드가 아니라 CornerTab
    : OBJECTS.filter((d) => !HIDDEN_IDS.has(d.id) && buildTabOf(d) === activeTab)
      .map((def) => ({ def, locked: !unlocked.has(def.id) }))
      .sort((a, b) => Number(a.locked) - Number(b.locked) || a.def.cost - b.def.cost);
  const counts: Partial<Record<BuildTab, number>> = { building: noMain ? 1 : 0 };
  for (const d of OBJECTS) if (!HIDDEN_IDS.has(d.id) && unlocked.has(d.id)) counts[buildTabOf(d)] = (counts[buildTabOf(d)] ?? 0) + 1;
  const busy = constructions(s).length;
  const sel = picked ? items.find((i) => i.def.id === picked) : undefined;

  if (view.kind === 'tiles') {
    return (
      <div ref={rootRef} style={body} data-testid="build-window">
        <TilesScreen s={s} onTile={(t) => {
          const tile = BUILD_TILES.find((x) => x.id === t)!;
          if (t === 'all') { goView({ kind: 'all' }); return; }
          if (t === 'building') { goView({ kind: 'all' }); setTab(noMain ? 'building' : 'indoor'); return; }
          goView({ kind: 'tile', tile: t });
          if (tile.base) setPicked(tile.base);
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0 8px', marginTop: 6 }}>
          <span style={soft}>자금 {wonText(s.money)}</span>
          <span style={{ ...soft, color: busy >= s.builders ? PALETTE.bad : PALETTE.inkSoft }} data-testid="builders">건축가 {busy}/{s.builders} 작업 중</span>
          <SiteToggle />
        </div>
      </div>
    );
  }
  const tileDef = tileMode ? BUILD_TILES.find((t) => t.id === tileMode) : null;
  return (
    <div ref={rootRef} style={body} data-testid="build-window">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <button data-testid="build-back" style={{ ...brownBtn, margin: 0, padding: '0 10px', fontSize: 14, minHeight: 40 }} onClick={() => goView({ kind: 'tiles' })}>◀ 짓기</button>
        {tileDef && <span style={{ fontSize: 15, fontWeight: 700 }}><Icon name={tileDef.icon} size={16} /> {tileDef.name} <span style={{ ...soft, fontWeight: 400 }}>{tileDef.purpose}</span></span>}
        {tileMode === 'charm' && <button data-testid="build-corner-tab" data-tut="tab:corner" style={{ ...brownBtn, margin: 0, padding: '0 10px', fontSize: 14, minHeight: 40 }} onClick={() => { goView({ kind: 'all' }); setTab('corner'); }}><Icon name="sparkle" size={14} /> 명당</button>}
      </div>
      {!tileMode && <TabBar tabs={tabs.map((t) => ({ ...t, badge: undefined }))} active={activeTab} onPick={(k) => { setTab(k); setPicked(null); }} testId="build-tab" />}
      {recent.length > 0 && (
        <div data-testid="build-recent" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ ...soft, whiteSpace: 'nowrap' }}><Icon name="undo" size={13} /> 최근</span>
          {recent.map((id) => {
            const def = objectDef(id);
            const cost = placeCost(s, id);
            const ok = canStartBuild(s, id).ok && s.money >= cost && !!props.onPickBuild;
            return <button key={id} data-testid={`build-recent-${id}`} style={{ ...(ok ? brownBtn : brownBtnOff), margin: 0, padding: '0 8px', fontSize: 14, minHeight: 40 }} disabled={!ok} onClick={() => props.onPickBuild?.(id)}>{def.name} <span style={{ fontWeight: 400 }}>{cost > 0 ? wonText(cost) : '무료'}</span></button>;
          })}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0 8px', marginBottom: 6 }}>
        <span style={soft}>{activeTab === 'corner' ? '' : `열린 것 ${counts[activeTab] ?? 0} · `}자금 {wonText(s.money)}</span>
        <span style={{ ...soft, color: busy >= s.builders ? PALETTE.bad : PALETTE.inkSoft }} data-testid="builders">건축가 {busy}/{s.builders} 작업 중</span>
        <SiteToggle />{/* ease: 입지 보기는 처음부터 */}
      </div>
      {!tileMode && activeTab === 'building' && <div style={{ ...soft, marginBottom: 6 }} data-testid="build-main-hint"><Icon name="home" size={14} /> {MAIN_CARD_HINT}</div>}
      {!tileMode && activeTab === 'indoor' && <div style={{ ...soft, marginBottom: 6 }}><Icon name="home" size={14} /> 실내 가구는 건물(본관·별관) 안 바닥에만 놓아요 — 문 칸은 비워 둬요</div>}
      {!tileMode && activeTab === 'corner' && <CornerTab s={s} onPickBuild={props.onPickBuild} />}
      {tileMode && <div style={{ ...soft, marginBottom: 6 }}><Icon name="bulb" size={14} /> 기본을 놓고, 시설 카드에서 같은 자리 「업그레이드 ▲」로 키워요{tileMode === 'seat' ? ` · 파라솔 이상 3개를 이으면 테라스 거리 +${STREET_BONUS_PCT}%` : ''}</div>}
      {(tileMode || activeTab !== 'corner') && items.length === 0 && <Empty>아직 여기엔 지을 게 없어요</Empty>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {items.map(({ def, locked }) => {
          const cost = locked ? def.cost : placeCost(s, def.id);
          const on = picked === def.id;
          return (
            <button key={def.id} data-testid={`build-card-${def.id}`} data-tut={`build:${def.id}`} aria-pressed={on} aria-disabled={locked || undefined}
              onClick={() => { setPicked(on ? null : def.id); if (!on) showFirstTip(null); }}
              style={{ ...cardBase, opacity: locked ? 0.5 : 1, boxShadow: on ? `0 0 0 3px ${PALETTE.btnOn}` : undefined }}>
              <SpriteBox sheet={sheet} id={def.id} kind={def.kind} />
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{locked ? <><Icon name="lock" size={14} /> </> : ''}{def.name}{def.indoor ? <> <Icon name="home" size={14} /></> : ''}</div>
              {tileMode && treeOf(def.id) && <div style={{ ...soft, fontSize: 12 }}>{treeOf(def.id)!.tree.name} {treeOf(def.id)!.index + 1}단계{treeOf(def.id)!.index > 0 ? ' · 업그레이드로' : ' · 기본'}</div>}
              <div style={{ fontSize: 14 }}>{cost > 0 ? wonText(cost) : '무료'}{def.fee !== undefined && def.fee > 0 ? ` · 요금 ${wonText(def.fee)}` : ''}</div>
              <div style={{ ...soft, fontSize: 13 }}>
                {def.id === MAIN_TYPE ? <><Icon name="home" size={13} /> {def.w}×{def.h}칸 · 1회</> : <>{def.kind === 'seat' ? <><Icon name="chair" size={13} /> {def.seats ?? 2}</> : <><Icon name="thumb" size={13} /> {def.popularity ?? 10}</>} · <Icon name="plant" size={13} /> {def.scenery}</>}
              </div>
            </button>
          );
        })}
      </div>
      {sel && <PickedDetail s={sel.def} locked={sel.locked} state={s} onPick={props.onPickBuild} />}
    </div>
  );
}

/** fun: 짓기 첫 화면 6타일 (중요도 순: 자리 → 서비스 → 매력 → 유입 → 실내·건물 → 전체 목록). 타일마다 "무엇에 좋은가" 한 줄 + 지금 병목 배지.
 *  등급 1~2에선 실내·건물 타일이 안 보인다(점진 공개 — 본관이 없으면 보인다). */
export function TilesScreen({ s, onTile }: { s: GameState; onTile: (t: BuildTileId) => void }) {
  const seatUse = seatUseRate(s, totalSeats(s));
  const scenery = cafeScenery(s);
  const routesN = ROUTE_IDS.filter((r) => routeTakesGuests(s, r, 12)).length;
  const badges = tileBadges(s, seatUse, scenery, s.staff.length, routesN);
  const grade = gradeOf(s);
  const tiles = BUILD_TILES.filter((t) => t.id !== 'building' || grade >= BUILDING_TILE_GRADE || !mainBuilding(s));
  return (
    <div data-testid="build-tiles" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {tiles.map((t) => {
        const badge = badges.find((b) => b.tile === t.id);
        return (
          <button key={t.id} data-testid={`build-tile-${t.id}`} data-tut={`tile:${t.id}`} onClick={() => onTile(t.id)}
            style={{ ...cardBase, minHeight: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative', cursor: 'pointer' }}>
            <Icon name={t.icon} size={28} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</div>
            <div style={{ ...soft, fontSize: 13, lineHeight: 1.25 }}>{t.purpose}</div>
            {badge && <div data-testid={`build-tile-badge-${t.id}`} style={{ position: 'absolute', top: 4, right: 4, background: PALETTE.bad, color: '#fff', borderRadius: 8, fontSize: 12, padding: '1px 6px', fontWeight: 700 }}>{badge.text}</div>}
          </button>
        );
      })}
    </div>
  );
}
/** 실내·건물 타일이 보이는 등급 (점진 공개) */
export const BUILDING_TILE_GRADE = 3;

/** 「최근」 줄은 시설 목록 탭에서만 (「건물」 탭엔 본관 카드 하나뿐) */
function activeTabIsList(tab: BuildTab, noMain: boolean): boolean {
  return !(tab === 'building' && noMain);
}

/** 잠긴 카드 문구: 여는 목표가 있으면 "「제목」 목표를 이루면 열려요", 아니면 해금 조건(labels.unlockText) */
export function lockedText(def: ObjectDef): string {
  const t = treeOf(def.id);
  if (t && t.index > 0) return `${josa(objectDef(t.tree.steps[t.index - 1]!.type).name, '을/를')} 놓고 「업그레이드 ▲」로 올려요`; // fun: 트리 단계는 짓지 않고 올린다
  const g = goalForFacility(def.id);
  if (g) return `「${g.title}」 목표를 이루면 열려요`;
  if (def.unlock?.type === 'all' && def.unlock.conditions.length === 0 && def.unlockText) return `${def.unlockText}면 열려요`; // 카운터 확장: 본관 Lv2 증축이 연다 (y-indoor)
  return unlockText(def);
}

function PickedDetail({ s: def, locked, state, onPick }: { s: ObjectDef; locked: boolean; state: GameState; onPick?: (id: string) => void }) {
  useEffect(() => { showFirstTip(null); }, [def.id]); // 고른 카드의 「짓기」 줄이 팁에 가리지 않게
  const cost = locked ? def.cost : placeCost(state, def.id);
  const start = locked ? { ok: false, reason: lockedText(def) } : canStartBuild(state, def.id);
  const poor = !locked && state.money < cost;
  const ok = !locked && start.ok && !poor && !!onPick;
  const days = def.buildDays ?? 0;
  const facts = [
    def.id === MAIN_TYPE ? '카운터·주방·실내 자리' : def.kind === 'seat' ? `좌석 ${def.seats ?? 2}` : `입소문 ${def.popularity ?? 10}`,
    def.id === MAIN_TYPE ? '문은 앞쪽 왼쪽' : `경관 ${def.scenery}`,
    def.upkeep > 0 ? `유지비 ${wonText(def.upkeep)}/월` : null,
    days > 0 ? `공사 ${days}일` : '바로 완성',
    `${def.w}×${def.h}칸`,
    def.indoor ? '실내(본관·별관 안)' : null,
    treeOf(def.id) ? `${treeOf(def.id)!.tree.name} 트리 ${treeOf(def.id)!.index + 1}/${treeOf(def.id)!.tree.steps.length}단계` : isUpgradable(def) ? `증축 Lv1~3 (${{ small: '소', medium: '중', large: '대' }[tierOf(def)]}형)` : null,
    def.scenery !== 0 && !def.indoor ? sceneryGainText(state, def.id, -99, -99).replace(' · 자리 옆이면 관광객이 는다', '') : null, // fun: 경관 시설 「관광객 +n%/일」은 놓을 자리에서 (고스트 배지)
  ].filter(Boolean).join(' · ');
  return (
    <div data-testid="build-detail" style={{ position: 'sticky', bottom: 0, marginTop: 8, background: PALETTE.paper, borderTop: `3px solid ${PALETTE.wood}`, padding: '8px 0 4px' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{def.name} <span style={{ fontWeight: 400, fontSize: 14 }}>{cost > 0 ? wonText(cost) : '무료'}</span></div>
      <div style={{ fontSize: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{def.desc ?? def.name}</div>
      <div style={{ ...soft, marginBottom: 6 }}>{facts}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={{ ...(ok ? brownBtn : brownBtnOff), margin: 0, flex: '0 0 auto' }} disabled={!ok} onClick={() => onPick?.(def.id)} data-testid="build-go" data-tut="build-go"><Icon name="build" /> 짓기</button>
        <span style={{ ...soft, color: ok ? PALETTE.inkSoft : PALETTE.bad }}>
          {locked ? lockedText(def) : poor ? '돈이 모자라요' : !start.ok ? start.reason : '누르면 맵에 놓을 자리를 골라요'}
        </span>
      </div>
    </div>
  );
}
