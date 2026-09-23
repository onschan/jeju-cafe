/** 명당 도감 (fun-corner, 스펙 §3): 만든 명당은 이름·효과, 미완성은 힌트("돌담 근처에 감귤나무")만. 도감 탭(CodexPanel) 한 줄로 붙는다. */
import { useGame } from './store';
import { PALETTE } from './frame';
import { Icon } from './Icon';
import { CORNERS, completedCorners } from '../sim/corners.ts';

export function CornerCodex() {
  const s = useGame();
  const made = new Set(s.codex.corners ?? []);
  const now = new Set(completedCorners(s).map((c) => c.id));
  return (
    <div data-testid="corner-codex" style={{ fontSize: 14 }}>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '8px 0 4px' }}>
        명당 도감 {made.size}/{CORNERS.length} · 서로 다른 시설을 2칸 안에 모으면 이름이 붙어요
      </div>
      {CORNERS.map((c) => {
        const done = made.has(c.id);
        return (
          <div key={c.id} data-testid={`corner-codex-${c.id}`} style={{ display: 'flex', gap: 6, alignItems: 'baseline', opacity: done ? 1 : 0.7 }}>
            <span style={{ width: 18, textAlign: 'center' }}>{done ? <Icon name="check" size={12} /> : ' '}</span>
            <span style={{ fontWeight: done ? 700 : 400 }}>{c.name}</span>
            <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>
              {done ? `요금 +${c.effect.feePct}% · 입소문 +${c.effect.popularity}${now.has(c.id) ? '' : ' · 지금은 흩어짐'}` : c.hint}
            </span>
          </div>
        );
      })}
    </div>
  );
}
