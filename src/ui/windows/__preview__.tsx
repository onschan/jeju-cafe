/** DEV 전용 창 미리보기. `pnpm dev --port 5175` 뒤 http://localhost:5175/src/ui/windows/__preview__.html
 *  store를 안 쓰고(자동 저장을 덮어쓰지 않게) 로컬 상태 + apply()로 돈다. main.tsx는 건드리지 않는다 — 통합 때 트랙 C의 Window 셸에 끼운다. */
import { useEffect, useMemo, useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createInitialState, apply, tick, DAY_MS, type GameState, type Action } from '../../sim/index.ts';
import { loadAssets } from '../../render/assets';
import { PALETTE, frame, frameTitle, brownBtn, brownBtnOn } from '../frame';
import { MenuWindow } from './MenuWindow.tsx';
import { BuildWindow } from './BuildWindow.tsx';
import { StaffWindow } from './StaffWindow.tsx';
import { GoalWindow } from './GoalWindow.tsx';
import { ReportWindow } from './ReportWindow.tsx';

type Win = 'menu' | 'build' | 'staff' | 'goal' | 'report';
const WINS: { key: Win; title: string }[] = [
  { key: 'menu', title: '메뉴판' }, { key: 'build', title: '짓기' }, { key: 'staff', title: '사람' }, { key: 'goal', title: '목표' }, { key: 'report', title: '결산' },
];


function Preview() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const s = useMemo(() => createInitialState(7, 'preview', 0), []);
  const [w, setW] = useState<Win>('menu');
  const [assets, setAssets] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => { loadAssets().then((ok) => setAssets(ok)); }, []);
  const dispatch = (a: Action) => {
    const r = apply(s, a);
    setLog((l) => [`${a.type} ${r.ok ? '✓' : `✗ ${r.reason ?? ''}`}`, ...l].slice(0, 4));
    bump();
    return r;
  };
  const day = () => { s.clock.speed = 1; tick(s, DAY_MS); bump(); };
  const card = s.lastMonthCard ?? { income: 1_830_000, guests: 96, month: s.clock.month, year: s.clock.year, costs: { ingredients: 310_000, salary: 600_000, upkeep: 82_500, ads: 0, recruit: 0, tax: 0, loanRepay: 0, tourBus: 0 }, net: 837_500 };
  const win = (state: GameState) => {
    switch (w) {
      case 'menu': return <MenuWindow state={state} dispatch={dispatch} onClose={() => {}} />;
      case 'build': return <BuildWindow state={state} dispatch={dispatch} onClose={() => {}} onPickBuild={(id) => setLog((l) => [`짓기 → ${id}`, ...l].slice(0, 4))} />;
      case 'staff': return <StaffWindow state={state} dispatch={dispatch} onClose={() => {}} />;
      case 'goal': return <GoalWindow state={state} dispatch={dispatch} onClose={() => {}} />;
      case 'report': return <ReportWindow card={{ ...card, harvested: 12, ingredientSaved: 42_000, highlights: ['최다 판매: 아메리카노 41잔', '가장 만족한 손님: 대학생', '새로 열림: 감귤주스'], tip: '손님 20명을 맞이하면 감귤주스가 열려요' }} star={state.star} prevStar={state.star} starProgress={0.4} monthRecord onClose={() => setW('menu')} />;
    }
  };
  return (
    <div style={{ width: 375, height: 812, margin: '12px auto', background: '#2a4d3a', position: 'relative', overflow: 'hidden', borderRadius: 12, fontFamily: 'Galmuri11, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, padding: 6, background: '#1e1e1e', flexWrap: 'wrap' }}>
        {WINS.map((x) => <button key={x.key} style={{ ...(x.key === w ? brownBtnOn : brownBtn), margin: 0, padding: '0 8px', fontSize: 13, minHeight: 36 }} onClick={() => setW(x.key)}>{x.title}</button>)}
        <button style={{ ...brownBtn, margin: 0, padding: '0 8px', fontSize: 13, minHeight: 36 }} onClick={day}>⏩ 하루</button>
        <span style={{ color: '#ddd', fontSize: 12, alignSelf: 'center' }}>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일 · ₩{s.money.toLocaleString()} · 🔬{s.research} · 시트 {assets ? '✓' : '…'}</span>
      </div>
      {/* 트랙 C의 전체 화면 창 셸 흉내: 제목 바 + ✕, 내용 스크롤 */}
      <div style={{ ...frame, flex: 1, margin: 6, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ ...frameTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{WINS.find((x) => x.key === w)?.title}</span>
          <button aria-label="닫기" style={{ background: 'none', border: 0, color: PALETTE.titleText, fontSize: 20, minWidth: 44, minHeight: 36, fontFamily: 'inherit' }} onClick={() => setW('menu')}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{win(s)}</div>
      </div>
      <div style={{ color: '#ddd', fontSize: 11, padding: '0 8px 6px', minHeight: 14 }}>{log.join(' | ')}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
