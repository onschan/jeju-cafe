/**
 * 안내 한 줄 (teardown §3 「합친다」).
 *
 * 1일차에 같은 말이 세 군데서 나왔다 — 튜토리얼 대사 「테이블 하나 놓아 보라」, 문 열기 막힘
 * 「앉을 자리가 없어요 — 테이블을 놓아 보세요」, 막 「그늘지고 조용한 자리를 만들어요」.
 * 셋이 나란히 뜨면 셋 다 안 읽힌다.
 *
 * 그래서 **줄은 하나**고, 그 자리를 누가 쓸지 우선순위로 정한다.
 *   ① 튜토리얼 단계가 있으면 그 단계의 할 일 (대사는 닫으면 사라지니 줄은 남아야 한다)
 *   ② 문이 안 열리면 그 까닭 (손님이 아예 안 오는 상태가 제일 급하다)
 *   ③ 그 밖엔 이번 막 (한 판 전체의 과제)
 * 셋 다 없으면 줄도 없다 — 할 말이 없으면 안 띄운다.
 */
import type { GameState } from '../sim/index.ts';
import { chapterBlocker, chapterLine, currentTutorialStep, tutorialStepReady, openBlocker } from '../sim/index.ts';
import { TUTORIAL_STEPS as STEP_TEXTS } from '../data/dialogue/index.ts';
import { PALETTE } from './frame';
import { Icon } from './Icon';

export interface Guide {
  kind: 'tutorial' | 'blocker' | 'chapter';
  icon: string;
  /** 굵게 나가는 윗줄 (없으면 한 줄짜리) */
  title?: string;
  text: string;
  /** 오른쪽 진행 표시 (「0/2」·「A」) */
  tail?: string;
  /** 테두리를 눈에 띄게 — 지금 막힌 것 */
  urgent?: boolean;
}

/** 지금 이 줄이 무엇을 말해야 하나. 없으면 null. */
export function guideOf(s: GameState): Guide | null {
  // 튜토리얼은 **지금 해 볼 수 있는 단계일 때만** 이 줄을 쓴다.
  // 러시 착석 단계는 토요일 낮 45초 말고는 할 수가 없는데, 그때도 「줄에서 손님 앉히기」를 띄우면
  // 줄도 없는 마당을 보며 엿새 내내 그 말을 읽게 된다 — 그 동안은 다음 할 일에 줄을 넘긴다.
  const step = tutorialStepReady(s) ? currentTutorialStep(s) : null;
  if (step) {
    const text = STEP_TEXTS.find((t) => t.id === step.id);
    if (text?.done) return { kind: 'tutorial', icon: 'book', title: '할망의 가르침', text: text.done, urgent: true };
  }
  const blocked = openBlocker(s);
  if (blocked) return { kind: 'blocker', icon: 'bulb', text: blocked, urgent: true };
  const ch = chapterLine(s);
  if (!ch) return null;
  // 막이 막혔으면(그 손님을 앉힐 자리가 아예 없으면) 할 일 대신 그 까닭을 — 숫자만 안 오르는 절벽을 막는다
  const stuck = chapterBlocker(s);
  const tail = ch.need > 0 ? `${ch.have}/${ch.need}` : `${ch.gradesHave}/${ch.gradesNeed}`;
  return { kind: 'chapter', icon: 'flag', title: ch.name, text: stuck ?? ch.todo, tail, urgent: !!stuck };
  return null;
}

export function GuideLine({ s, bottom }: { s: GameState; bottom: number }) {
  const g = guideOf(s);
  if (!g) return null;
  return (
    <div data-testid="guide-line" data-kind={g.kind} style={{
      position: 'absolute', left: 8, right: 8, bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`, zIndex: 12,
      background: PALETTE.paper, border: `3px solid ${g.urgent ? PALETTE.btnOn : PALETTE.wood}`, borderRadius: 8, padding: '6px 10px',
      fontSize: 13, fontWeight: 700, color: PALETTE.ink, lineHeight: 1.35, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <Icon name={g.icon} size={14} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {g.title && <><span style={{ color: PALETTE.title }}>{g.title}</span><br /></>}
        {g.text}
      </span>
      {g.tail && <span style={{ flex: 'none', color: PALETTE.inkSoft, fontSize: 13 }}>{g.tail}</span>}
    </div>
  );
}
