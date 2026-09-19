import { useRef } from 'react';
import { useGame, dispatch } from './store';
import { goalDef, goalRewardText, currentGoal, goalConditionText, menuOf, type MonthCard as MonthCardData } from '../sim/index.ts';
import { label } from '../data/labels.ts';
import { Window } from './Window';
import { ReportWindow } from './windows/ReportWindow.tsx';

/** 월말 결산 (스펙 §2.1): sim의 lastMonthCard를 ReportWindow(트랙 B)로. 하이라이트 3줄 = 최다 판매 · 최고 만족 손님층 · 이달 새로 열린 것, 팁 = 현재 목표. */
export function MonthCard() {
  const s = useGame();
  const c = s.lastMonthCard;
  /** 지난 결산을 닫은 시점의 이룬 목표 수 → 그 뒤에 이룬 목표의 보상이 "새로 열린 것" */
  const claimedMark = useRef<number | null>(null);
  const shownCard = useRef<MonthCardData | null>(null);
  const opened = useRef<string[]>([]);
  if (claimedMark.current === null || s.goals.claimed.length < claimedMark.current) claimedMark.current = claimedMark.current === null ? s.goals.claimed.length : 0; // 새 게임이면 처음부터
  if (!c) return null;
  if (shownCard.current !== c) {
    shownCard.current = c;
    opened.current = s.goals.claimed.slice(Math.min(claimedMark.current, s.goals.claimed.length))
      .flatMap((id) => goalDef(id).reward.filter((r) => r.type === 'unlockFacility' || r.type === 'unlockMenu' || r.type === 'unlockRole' || r.type === 'unlockFeature').map(goalRewardText));
  }
  const close = () => { claimedMark.current = s.goals.claimed.length; dispatch({ type: 'dismissMonthCard' }); };

  const highlights: string[] = [];
  if (c.topMenu) { let name = label('menu', c.topMenu); try { name = menuOf(s, c.topMenu).name; } catch { /* 표에 없는 메뉴면 label */ } highlights.push(`최다 판매: ${name}`); } // 개발한 메뉴(m_custom_N)는 이름이 state에 있다
  let bestType: string | null = null;
  let best = 0;
  for (const [id, gt] of Object.entries(s.guestTypes)) if (gt.unlocked && gt.satisfaction > best) { best = gt.satisfaction; bestType = id; }
  if (bestType) highlights.push(`가장 만족한 손님층: ${label('guest', bestType)} (${best})`);
  if (opened.current.length > 0) highlights.push(`새로 열림: ${opened.current.join(' · ')}`);

  const g = currentGoal(s);
  const tip = g ? `다음 목표는 「${g.title}」 — ${g.desc || goalConditionText(g.condition)}` : '목표를 다 이뤘어요. 마음껏 카페를 키워 보세요.';
  const harvested = Object.values(c.harvested ?? {}).reduce((a, b) => a + b, 0);
  return (
    <Window title={`${c.year}년 ${c.month}월 결산`} onClose={close} testId="window-report">
      <ReportWindow
        card={{ ...c, harvested, ingredientSaved: c.ingredientSaved, highlights, tip }}
        star={s.star}
        onClose={close}
      />
    </Window>
  );
}
