import { useEffect, useRef, useState } from 'react';
import { GameView } from '../render/GameView';
import { startLoop, dispatch, loadOrNew, getState, setViewReset } from './store';
import { unlockAudio, bgm } from './audio';
import { seasonOf } from '../sim/index.ts';
// render/·ui/는 Vite 전용이라 확장자 없는 import 허용. sim/·data/만 .ts 확장자 규칙.
import { HUD } from './HUD';
import { BottomSheet, type Mode } from './BottomSheet';
import { MonthCard } from './MonthCard';
import { Guide } from './Guide';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GameView | null>(null);
  const modeRef = useRef<Mode>({ kind: 'idle' });
  const [mode, setModeState] = useState<Mode>({ kind: 'idle' });
  // 첫 터치에서 오디오를 열고 현재 계절 BGM을 시작한다 (이후 호출은 no-op)
  const onPointerDown = () => { unlockAudio(); void bgm(seasonOf(getState().clock.month)); };
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); viewRef.current?.setSelection(m.kind === 'cell' ? { x: m.x, y: m.y } : null); };

  useEffect(() => {
    const host = hostRef.current!;
    const view = new GameView();
    viewRef.current = view;
    let stop: (() => void) | null = null;
    let disposed = false;
    (async () => {
      await loadOrNew();
      if (disposed) return; // 불러오는 사이 언마운트(Fast Refresh 등)되면 캔버스를 만들지 않는다
      await view.init(host, {
        onTap: (x, y) => {
          const m = modeRef.current;
          const s = getState();
          if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) return;
          if (m.kind === 'build') dispatch({ type: 'place', objectType: m.objectType, x, y });
          else setMode({ kind: 'cell', x, y });
        },
      });
      if (disposed) { view.destroy(); return; }
      setViewReset(() => view.reset());
      stop = startLoop((s) => view.render(s));
    })();
    return () => { disposed = true; stop?.(); setViewReset(null); view.destroy(); viewRef.current = null; };
  }, []);

  return (
    <div onPointerDownCapture={onPointerDown} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
      <HUD />
      <Guide />
      <BottomSheet mode={mode} setMode={setMode} />
      <MonthCard />
    </div>
  );
}
