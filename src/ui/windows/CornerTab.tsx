/** 짓기 창 「명당」 탭 (fun-corner, 스펙 §3): 명당 카드(이름·효과 한 줄·조각 ✓/✗) + 「다음에 놓을 것」 버튼 → 그 시설 고스트(onPickBuild).
 *  완성된 명당은 체크 + 돌봐 주는 자리 수·오늘 매출, 미완성은 "벤치 하나만 더"처럼 모자란 것 한 줄. 조각이 아직 안 열렸으면 자물쇠 + 여는 조건.
 *  spot2: 조각은 시설 id가 아니라 **종류**(자리·불빛·꽃…)라 업그레이드해도 안 깨진다 — 조각 줄은 종류 이름 + 종류 아이콘으로 보여 준다. */
import { useEffect } from 'react';
import type { GameState } from '../../sim/index.ts';
import { canStartBuild, placeCost } from '../../sim/index.ts';
import { cornerProgress, pieceName, cornerBuildType, cornerServes, cornerSalesToday, completedCorners, type CornerProgress } from '../../sim/corners.ts';
import { cornerKindIcon } from '../../sim/cornerKinds.ts';
import { showFirstTip } from '../firstTip';
import { objectDef } from '../../data/index.ts';
import { wonText } from '../../data/labels.ts';
import { Icon } from '../Icon';
import { PALETTE } from '../frame';
import { josa } from '../../sim/josa.ts';
import { rowCard, rowBtn, rowBtnOff, soft } from './shared.tsx';
import { lockedText } from './BuildWindow.tsx';

const TARGET_TEXT: Record<string, string> = { all: '모든 손님', female: '여성 손님', male: '남성 손님', youth: '젊은 손님', adult: '어른 손님', senior: '삼춘', group: '단체 손님' };

/** 효과 한 줄: 무엇이 좋아지는지부터 — "옆 2칸 자리에 요금 +5% · 입소문 +5 · 여성 손님이 더 온다" */
export function cornerEffectText(p: CornerProgress): string {
  const e = p.def.effect;
  const who = e.target === 'all' ? '손님이 더 온다' : `${josa(TARGET_TEXT[e.target] ?? '손님', '이/가')} 더 온다`;
  return `옆 ${p.def.radius}칸 자리에 요금 +${e.feePct}% · 입소문 +${e.popularity} · ${who}`;
}
/** 완성 명당 한 줄: "돌봐 주는 자리 3곳 · 오늘 ₩12만" (돌보는 자리가 없으면 자리를 놓으라고) */
export function cornerServeText(s: GameState, p: CornerProgress): string {
  const c = completedCorners(s).find((x) => x.id === p.def.id);
  if (!c) return '';
  const seats = cornerServes(s, c).length;
  if (seats === 0) return '옆에 자리를 놓으면 그 자리가 좋아져요';
  return `돌봐 주는 자리 ${seats}곳 · 오늘 ${wonText(cornerSalesToday(s, c))}`;
}
/** 미완성 한 줄: "벤치 하나만 더" / "담 2개, 올렛길 하나 더" */
export function cornerMissingText(p: CornerProgress): string {
  if (p.done) return '완성! 손님이 사진 찍으러 와요';
  if (p.building) return '조각은 다 모였다 — 내일이면 완성';
  const parts = p.missing.map((m) => `${pieceName(m.type)} ${m.count === 1 ? '하나' : `${m.count}개`}`);
  return parts.length === 1 ? `${parts[0]}만 더` : `${parts.join(', ')} 더`;
}

export function CornerTab({ s, onPickBuild }: { s: GameState; onPickBuild?: (id: string) => void }) {
  useEffect(() => { showFirstTip('build:corner'); }, []); // fun-start 첫 열기 팁
  const unlocked = new Set(s.unlocked.objects);
  const list = cornerProgress(s);
  const doneN = list.filter((p) => p.done).length;
  const workN = list.filter((p) => p.building).length; // 조각은 다 모였고 공사만 남은 것
  // 완성 가까운 것(모자란 조각 적은 순) → 완성·짓는 중은 뒤로
  const sorted = [...list].sort((a, b) => Number(a.done || a.building) - Number(b.done || b.building) || a.missing.length - b.missing.length);
  return (
    <div data-testid="corner-tab">
      <div style={{ ...soft, marginBottom: 6 }}><Icon name="sparkle" size={14} /> 명당 {doneN}/{list.length}{workN > 0 ? ` · 짓는 중 ${workN}` : ''} · 서로 다른 것을 2칸 안에 모으면 이름이 붙어요</div>
      <div style={{ ...soft, marginBottom: 6 }}>조각은 종류라 업그레이드해도 안 깨져요 — 올릴수록 명당 효과가 세져요</div>
      {sorted.map((p) => {
        const next = p.missing[0];
        const nextId = next ? cornerBuildType(s, next.type) : null;
        const nextDef = nextId ? objectDef(nextId) : null;
        const nextLocked = nextDef ? !unlocked.has(nextDef.id) : false;
        const cost = nextDef && !nextLocked ? placeCost(s, nextDef.id) : 0;
        const start = nextDef && !nextLocked ? canStartBuild(s, nextDef.id) : { ok: false, reason: '' };
        const ok = !!nextDef && !nextLocked && start.ok && s.money >= cost && !!onPickBuild;
        return (
          <div key={p.def.id} data-testid={`corner-card-${p.def.id}`} style={{ ...rowCard, opacity: p.done || p.building ? 0.85 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{p.done || p.building ? <Icon name="check" size={14} /> : <Icon name="sparkle" size={14} />} {p.def.name}</span>
              <span style={{ ...soft, fontSize: 13 }}>{cornerEffectText(p)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0' }}>
              {p.pieces.map((pc) => {
                const have = pc.have >= pc.need;
                const buildId = cornerBuildType(s, pc.type);
                const locked = !have && (!buildId || !unlocked.has(buildId));
                return (
                  <span key={pc.type} data-testid={`corner-piece-${p.def.id}-${pc.type}`} style={{ fontSize: 14, color: have ? PALETTE.ok : locked ? PALETTE.inkSoft : PALETTE.bad }}>
                    {have ? <Icon name="check" size={13} /> : locked ? <Icon name="lock" size={13} /> : <Icon name="close" size={13} />} <Icon name={cornerKindIcon(pc.type)} size={13} /> {pieceName(pc.type)}{pc.need > 1 ? ` ${pc.have}/${pc.need}` : ''}
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
              <span style={{ ...soft, color: p.done || p.building ? PALETTE.ok : nextLocked ? PALETTE.inkSoft : PALETTE.ink }}>
                {p.done || p.building ? cornerMissingText(p) : nextLocked && nextDef ? `${nextDef.name}: ${lockedText(nextDef)}` : cornerMissingText(p)}
              </span>
            </div>
            {p.done
              ? <div style={{ ...soft, fontSize: 13, marginTop: 2 }} data-testid={`corner-serve-${p.def.id}`}>{cornerServeText(s, p)}</div>
              : !p.building && <div style={{ ...soft, fontSize: 13, marginTop: 2 }}>{p.def.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}
