/** 짓기 창 「테마」 탭 (fun-corner, 스펙 §3): 테마 카드(이름·효과 한 줄·조각 ✓/✗) + 「다음에 놓을 것」 버튼 → 그 시설 고스트(onPickBuild).
 *  완성된 테마는 체크, 미완성은 "벤치 하나만 더"처럼 모자란 것 한 줄. 조각이 아직 안 열렸으면 자물쇠 + 여는 조건. */
import { useEffect } from 'react';
import type { GameState } from '../../sim/index.ts';
import { canStartBuild, placeCost } from '../../sim/index.ts';
import { cornerProgress, type CornerProgress } from '../../sim/corners.ts';
import { showFirstTip } from '../firstTip';
import { objectDef } from '../../data/index.ts';
import { wonText } from '../../data/labels.ts';
import { Icon } from '../Icon';
import { PALETTE } from '../frame';
import { josa } from '../../sim/josa.ts';
import { rowCard, rowBtn, rowBtnOff, soft } from './shared.tsx';
import { lockedText } from './BuildWindow.tsx';

const TARGET_TEXT: Record<string, string> = { all: '모든 손님', female: '여성 손님', male: '남성 손님', youth: '젊은 손님', adult: '어른 손님', senior: '삼춘', group: '단체 손님' };

/** 효과 한 줄: "요금 +5% · 인기 +5 · 여성 손님이 더 온다" */
export function cornerEffectText(p: CornerProgress): string {
  const e = p.def.effect;
  const who = e.target === 'all' ? '손님이 더 온다' : `${josa(TARGET_TEXT[e.target] ?? '손님', '이/가')} 더 온다`;
  return `요금 +${e.feePct}% · 인기 +${e.popularity} · ${who}`;
}
/** 미완성 한 줄: "벤치 하나만 더" / "돌담 2개, 올렛길 하나 더" */
export function cornerMissingText(p: CornerProgress): string {
  if (p.done) return '완성! 손님이 사진 찍으러 와요';
  if (p.missing.length === 0) return '짓는 중 — 완공되면 완성';
  const parts = p.missing.map((m) => `${objectDef(m.type).name} ${m.count === 1 ? '하나' : `${m.count}개`}`);
  return parts.length === 1 ? `${parts[0]}만 더` : `${parts.join(', ')} 더`;
}

export function CornerTab({ s, onPickBuild }: { s: GameState; onPickBuild?: (id: string) => void }) {
  useEffect(() => { showFirstTip('build:corner'); }, []); // fun-start 첫 열기 팁
  const unlocked = new Set(s.unlocked.objects);
  const list = cornerProgress(s);
  const doneN = list.filter((p) => p.done).length;
  // 완성 가까운 것(모자란 조각 적은 순) → 완성된 것은 뒤로
  const sorted = [...list].sort((a, b) => Number(a.done) - Number(b.done) || a.missing.length - b.missing.length);
  return (
    <div data-testid="corner-tab">
      <div style={{ ...soft, marginBottom: 6 }}><Icon name="sparkle" size={14} /> 테마 {doneN}/{list.length} · 서로 다른 시설을 2칸 안에 모으면 이름이 붙어요</div>
      {sorted.map((p) => {
        const next = p.missing[0];
        const nextDef = next ? objectDef(next.type) : null;
        const nextLocked = nextDef ? !unlocked.has(nextDef.id) : false;
        const cost = nextDef && !nextLocked ? placeCost(s, nextDef.id) : 0;
        const start = nextDef && !nextLocked ? canStartBuild(s, nextDef.id) : { ok: false, reason: '' };
        const ok = !!nextDef && !nextLocked && start.ok && s.money >= cost && !!onPickBuild;
        return (
          <div key={p.def.id} data-testid={`corner-card-${p.def.id}`} style={{ ...rowCard, opacity: p.done ? 0.85 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{p.done ? <Icon name="check" size={14} /> : <Icon name="sparkle" size={14} />} {p.def.name}</span>
              <span style={{ ...soft, fontSize: 13 }}>{cornerEffectText(p)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0' }}>
              {p.pieces.map((pc) => {
                const d = objectDef(pc.type);
                const have = pc.have >= pc.need;
                const locked = !unlocked.has(pc.type) && !have;
                return (
                  <span key={pc.type} data-testid={`corner-piece-${p.def.id}-${pc.type}`} style={{ fontSize: 14, color: have ? PALETTE.ok : locked ? PALETTE.inkSoft : PALETTE.bad }}>
                    {have ? <Icon name="check" size={13} /> : locked ? <Icon name="lock" size={13} /> : <Icon name="close" size={13} />} {d.name}{pc.need > 1 ? ` ${pc.have}/${pc.need}` : ''}
                  </span>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {!p.done && nextDef && (
                <button data-testid={`corner-next-${p.def.id}`} data-tut={`corner-next:${p.def.id}`} style={ok ? rowBtn : rowBtnOff} disabled={!ok} onClick={() => onPickBuild?.(nextDef.id)}>
                  <Icon name="build" size={14} /> {nextDef.name} 놓기 {cost > 0 ? wonText(cost) : ''}
                </button>
              )}
              <span style={{ ...soft, color: p.done ? PALETTE.ok : nextLocked ? PALETTE.inkSoft : PALETTE.ink }}>
                {p.done ? cornerMissingText(p) : nextLocked && nextDef ? `${nextDef.name}: ${lockedText(nextDef)}` : cornerMissingText(p)}
              </span>
            </div>
            {!p.done && <div style={{ ...soft, fontSize: 13, marginTop: 2 }}>{p.def.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}
