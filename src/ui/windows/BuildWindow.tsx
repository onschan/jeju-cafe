/** 짓기 창 (스펙 §4.2). 카테고리 탭(쉼·편의·먹거리·즐길거리·농원·경관·길·담) → 2열 카드(아이소 스프라이트·이름·가격·인기/경관).
 *  카드 탭 → 아래 설명 2줄 + `짓기`(onPickBuild). 잠긴 것은 반투명 + 조건 한글. 철거·이동은 미니카드(트랙 C) 몫. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameState, ObjectDef } from '../../sim/index.ts';
import { placeCost, constructions, canStartBuild, goalForFacility, isUpgradable, tierOf, featureOpen } from '../../sim/index.ts';
import { OBJECTS } from '../../data/index.ts';
import { unlockText, wonText } from '../../data/labels.ts';
import { loadSheet, drawFrame, type Sheet } from '../sheetCanvas';
import { PALETTE, brownBtn, brownBtnOff } from '../frame';
import { useWindowState, body, TabBar, soft, Empty, type WindowProps } from './shared.tsx';
import { SiteToggle } from '../SiteToggle.tsx';

export type BuildTab = 'indoor' | 'rest' | 'convenience' | 'food' | 'fun' | 'farm' | 'scenery' | 'path' | 'wall';
/** 탭 순서 (§8.4): 실내 · 쉼 · 편의 · 먹거리 · 즐길거리 · 농원 · 경관 · 길 · 담 */
export const BUILD_TABS: { key: BuildTab; label: string }[] = [
  { key: 'indoor', label: '실내' }, { key: 'rest', label: '쉼' }, { key: 'convenience', label: '편의' }, { key: 'food', label: '먹거리' }, { key: 'fun', label: '즐길거리' },
  { key: 'farm', label: '농원' }, { key: 'scenery', label: '경관' }, { key: 'path', label: '길' }, { key: 'wall', label: '담' },
];
/** 본관 카드 「실내 꾸미기」처럼 창을 여는 쪽이 첫 탭을 지정한다 (App 창 매핑을 안 건드리고 — y-indoor). 한 번 읽으면 지워진다. */
let requestedTab: BuildTab | null = null;
export function requestBuildTab(tab: BuildTab): void { requestedTab = tab; }
function takeRequestedTab(): BuildTab | null { const t = requestedTab; requestedTab = null; return t; }
/** 처음부터 맵에 있는 것·지형 — 짓기 목록에 안 나온다 */
const HIDDEN_IDS = new Set(['busstop', 'warehouse', 'gate', 'bush_wild', 'spring']);

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
  const [tab, setTab] = useState<BuildTab>(() => props.initialTab ?? takeRequestedTab() ?? 'rest');
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  useEffect(() => { let on = true; loadSheet().then((sh) => { if (on) setSheet(sh); }); return () => { on = false; }; }, []);

  const unlocked = new Set(s.unlocked.objects);
  const items = OBJECTS.filter((d) => !HIDDEN_IDS.has(d.id) && buildTabOf(d) === tab)
    .map((def) => ({ def, locked: !unlocked.has(def.id) }))
    .sort((a, b) => Number(a.locked) - Number(b.locked) || a.def.cost - b.def.cost);
  const counts: Partial<Record<BuildTab, number>> = {};
  for (const d of OBJECTS) if (!HIDDEN_IDS.has(d.id) && unlocked.has(d.id)) counts[buildTabOf(d)] = (counts[buildTabOf(d)] ?? 0) + 1;
  const busy = constructions(s).length;
  const sel = picked ? items.find((i) => i.def.id === picked) : undefined;

  return (
    <div style={body} data-testid="build-window">
      <TabBar tabs={BUILD_TABS.map((t) => ({ ...t, badge: undefined }))} active={tab} onPick={(k) => { setTab(k); setPicked(null); }} testId="build-tab" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0 8px', marginBottom: 6 }}>
        <span style={soft}>열린 것 {counts[tab] ?? 0} · 자금 {wonText(s.money)}</span>
        <span style={{ ...soft, color: busy >= s.builders ? PALETTE.bad : PALETTE.inkSoft }} data-testid="builders">건축가 {busy}/{s.builders} 작업 중</span>
        {featureOpen(s, 'siteView') && <SiteToggle />}{/* 트랙 B: 튜토리얼 2단계 보상으로 열린다 */}
      </div>
      {tab === 'indoor' && <div style={{ ...soft, marginBottom: 6 }}>🏠 실내 가구는 건물(본관·별관) 안 바닥에만 놓아요 — 문 칸은 비워 둬요</div>}
      {items.length === 0 && <Empty>아직 여기엔 지을 게 없어요</Empty>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {items.map(({ def, locked }) => {
          const cost = locked ? def.cost : placeCost(s, def.id);
          const on = picked === def.id;
          return (
            <button key={def.id} data-testid={`build-card-${def.id}`} data-tut={`build:${def.id}`} aria-pressed={on} aria-disabled={locked || undefined}
              onClick={() => setPicked(on ? null : def.id)}
              style={{ ...cardBase, opacity: locked ? 0.5 : 1, boxShadow: on ? `0 0 0 3px ${PALETTE.btnOn}` : undefined }}>
              <SpriteBox sheet={sheet} id={def.id} kind={def.kind} />
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{locked ? '🔒 ' : ''}{def.name}{def.indoor ? ' 🏠' : ''}</div>
              <div style={{ fontSize: 14 }}>{cost > 0 ? wonText(cost) : '무료'}{def.fee !== undefined && def.fee > 0 ? ` · 요금 ${wonText(def.fee)}` : ''}</div>
              <div style={{ ...soft, fontSize: 13 }}>
                {def.kind === 'seat' ? `🪑 ${def.seats ?? 2}` : `👍 ${def.popularity ?? 10}`} · 🌿 {def.scenery}
              </div>
            </button>
          );
        })}
      </div>
      {sel && <PickedDetail s={sel.def} locked={sel.locked} state={s} onPick={props.onPickBuild} />}
    </div>
  );
}

/** 잠긴 카드 문구: 여는 목표가 있으면 "「제목」 목표를 이루면 열려요", 아니면 해금 조건(labels.unlockText) */
export function lockedText(def: ObjectDef): string {
  const g = goalForFacility(def.id);
  if (g) return `「${g.title}」 목표를 이루면 열려요`;
  if (def.unlock?.type === 'all' && def.unlock.conditions.length === 0 && def.unlockText) return `${def.unlockText}면 열려요`; // 카운터 확장: 본관 Lv2 증축이 연다 (y-indoor)
  return unlockText(def);
}

function PickedDetail({ s: def, locked, state, onPick }: { s: ObjectDef; locked: boolean; state: GameState; onPick?: (id: string) => void }) {
  const cost = locked ? def.cost : placeCost(state, def.id);
  const start = locked ? { ok: false, reason: lockedText(def) } : canStartBuild(state, def.id);
  const poor = !locked && state.money < cost;
  const ok = !locked && start.ok && !poor && !!onPick;
  const days = def.buildDays ?? 0;
  const facts = [
    def.kind === 'seat' ? `좌석 ${def.seats ?? 2}` : `인기 ${def.popularity ?? 10}`,
    `경관 ${def.scenery}`,
    def.upkeep > 0 ? `유지비 ${wonText(def.upkeep)}/월` : null,
    days > 0 ? `공사 ${days}일` : '바로 완성',
    `${def.w}×${def.h}칸`,
    def.indoor ? '실내(본관·별관 안)' : null,
    isUpgradable(def) ? `증축 Lv1~3 (${{ small: '소', medium: '중', large: '대' }[tierOf(def)]}형)` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div data-testid="build-detail" style={{ position: 'sticky', bottom: 0, marginTop: 8, background: PALETTE.paper, borderTop: `3px solid ${PALETTE.wood}`, padding: '8px 0 4px' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{def.name} <span style={{ fontWeight: 400, fontSize: 14 }}>{cost > 0 ? wonText(cost) : '무료'}</span></div>
      <div style={{ fontSize: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{def.desc ?? def.name}</div>
      <div style={{ ...soft, marginBottom: 6 }}>{facts}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={{ ...(ok ? brownBtn : brownBtnOff), margin: 0, flex: '0 0 auto' }} disabled={!ok} onClick={() => onPick?.(def.id)} data-testid="build-go">🔨 짓기</button>
        <span style={{ ...soft, color: ok ? PALETTE.inkSoft : PALETTE.bad }}>
          {locked ? lockedText(def) : poor ? '돈이 모자라요' : !start.ok ? start.reason : '누르면 맵에 놓을 자리를 골라요'}
        </span>
      </div>
    </div>
  );
}
