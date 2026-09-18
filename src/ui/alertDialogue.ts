import type { GameState, Alert } from '../sim/index.ts';
import { goalDef, goalRewardText } from '../sim/index.ts';
import { goalLine, SPEAKER_NAME } from '../data/dialogue/index.ts';
import { showDialogue, getDialogue, queuedCount, type DialogueReq } from './dialogue.ts';
import { eventStartDialogue, eventEndDialogue } from './eventText.ts';

/** sim 알림 큐(state.alerts) → 대화창. 앞의 것 하나를 띄우고, 닫히면 dismissAlert로 빼고 다음 것을 띄운다.
 *  한 tick에 여러 개가 쌓여도 순서대로 하나씩. */

/** 지금 대화창으로 띄운 알림 (객체 동일성). 새 게임으로 상태가 통째로 바뀌면 자연히 어긋나 다시 띄운다. */
let showingFor: Alert | null = null;

export function alertToDialogue(a: Alert): Omit<DialogueReq, 'onClose'> {
  switch (a.type) {
    case 'goal': {
      const g = goalDef(a.goalId);
      // 축하 대사는 goals.json(line·speaker, 목표와 1:1)이 우선. 없으면 dialogue/goals_lines.json.
      const b = goalLine(a.goalId);
      const speaker = g.speaker ?? b.speaker;
      const line = g.line ?? b.line;
      const reward = g.reward.length > 0 ? g.reward.map(goalRewardText).join(' · ') : '없음';
      return { speaker: { name: SPEAKER_NAME[speaker], portrait: speaker }, lines: [`목표 달성! 「${g.title}」 ${line}`, `보상: ${reward}`] };
    }
    case 'event': return eventStartDialogue(a.id);
    case 'eventEnd': return eventEndDialogue(a.id);
  }
}

/** 알림이 있고 지금 띄운 것이 없으면 맨 앞 알림을 대화창으로. 띄웠으면 true.
 *  dismiss = 대화가 닫힐 때 알림을 빼는 콜백 (App: dispatch({ type: 'dismissAlert' })). store를 여기서 안 끌어와 vitest에서도 돈다. */
export function checkAlerts(s: GameState, dismiss: () => void): boolean {
  const a = s.alerts[0];
  if (!a) { showingFor = null; return false; }
  // 같은 알림을 이미 띄웠고 그 대화가 아직 살아 있으면 기다린다 (clearDialogues로 사라졌으면 다시 띄운다)
  if (a === showingFor && (getDialogue() !== null || queuedCount() > 0)) return false;
  showingFor = a;
  showDialogue({
    ...alertToDialogue(a),
    onClose: () => { if (showingFor === a) showingFor = null; dismiss(); },
  });
  return true;
}
