import type { GameState, Alert, Action } from '../sim/index.ts';
import { goalDef, goalRewardText, josa, riskDef, eventChoiceDef, breakdownRepairCost, coachAdvice, GROUP_SEATS, totalSeats } from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { bigEventDef } from '../data/index.ts';
import { goalLine, failureDialogue, SPEAKER_NAME, ENDING_DIALOGUES } from '../data/dialogue/index.ts';
import { gradeName, GRADE_CAPTION } from '../sim/index.ts'; // fun-rank
import { showDialogue, getDialogue, queuedCount, type DialogueReq, type DialogueChoice } from './dialogue.ts';
import { eventStartDialogue, eventEndDialogue } from './eventText.ts';

/** sim 알림 큐(state.alerts) → 대화창. 앞의 것 하나를 띄우고, 닫히면 dismissAlert로 빼고 다음 것을 띄운다.
 *  한 tick에 여러 개가 쌓여도 순서대로 하나씩. { type: 'reward' }는 대화창이 아니라 보상 상자(RewardPopup)가 맡는다 — 여기서는 건너뛰지 않고 기다린다(순서 보존). */

/** 지금 대화창으로 띄운 알림 (객체 동일성). 새 게임으로 상태가 통째로 바뀌면 자연히 어긋나 다시 띄운다. */
let showingFor: Alert | null = null;

/** 보상 상자가 맡는 알림인가 */
export function isPopupAlert(a: Alert): boolean {
  return a.type === 'reward' || a.type === 'ending'; // z-ending: 엔딩은 EndingScreen
}

/** stakes: 선택지가 붙은 알림(돌발 사고·빅 이벤트)의 버튼. act로 sim 액션을 보낸다. */
export function alertChoices(a: Alert, s: GameState, act: (x: Action) => void): DialogueChoice[] | undefined {
  if (a.type === 'risk') {
    const def = riskDef(a.id);
    const cost = a.id === 'breakdown' ? breakdownRepairCost(s) : 0;
    return def.choices.map((c, i) => ({
      label: a.id === 'breakdown' && i === 1 ? `바로 고친다 (${wonText(cost)})` : c.label,
      onPick: () => act({ type: 'resolveRisk', choice: i }),
    }));
  }
  if (a.type === 'eventChoice') {
    const def = eventChoiceDef(a.id);
    if (!def) return undefined;
    return def.options.map((o, i) => ({ label: o.label, onPick: () => act({ type: 'resolveEventChoice', choice: i }) }));
  }
  return undefined;
}

export function alertToDialogue(a: Alert, s?: GameState): Omit<DialogueReq, 'onClose'> {
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
    case 'reputation': return { speaker: { name: SPEAKER_NAME.samchun, portrait: 'samchun' }, lines: ['【평판 경고】', a.text] }; // 트랙 E reputation.ts
    case 'reward': {
      // 보상 상자를 닫은 뒤 이어지는 축하 대사 (월간 과제). 목표는 뒤에 { type: 'goal' }이 따로 온다.
      const speaker = a.speaker ?? 'halmang';
      return { speaker: { name: SPEAKER_NAME[speaker], portrait: speaker }, lines: a.line ? [a.line] : [] };
    }
    case 'monthlyFailed': return { speaker: { name: SPEAKER_NAME.halmang, portrait: 'halmang' }, lines: [`이달의 과제 「${a.title}」는 아쉽게 못 채웠져. 괜찮아, 달은 또 오는 거니까.`, `다음 과제는 「${a.next}」 — 이번엔 보름 안에 끝내 보자!`] };
    case 'failure': {
      const f = failureDialogue(a.stage);
      return { speaker: { name: SPEAKER_NAME[f.speaker], portrait: f.speaker }, lines: [...f.lines, f.tip] };
    }
    // ---- z-ending ----
    case 'ending':
      return { speaker: { name: SPEAKER_NAME.halmang, portrait: 'halmang' }, lines: [] }; // EndingScreen이 맡는다
    case 'grade': // fun-rank: 등급 승급 축하 (보상 상자 뒤)
      return { speaker: { name: SPEAKER_NAME.halmang, portrait: 'halmang' }, lines: [`이제 「${gradeName(a.grade)}」이여. ${GRADE_CAPTION[a.grade] ?? ''}`, '간판을 새로 달았져. 마당에 손님도 더 들어온다.'] };
    // ---- stakes ----
    case 'risk': { // 돌발 사고 — 고른 것이 바로 결과
      const def = riskDef(a.id);
      const lines = [`【${def.title}】`, ...def.lines];
      if (a.id === 'group_booking' && s) lines.push(totalSeats(s) >= GROUP_SEATS ? `자리는 ${totalSeats(s)}개 — 받을 수 있어.` : `자리가 ${totalSeats(s)}개뿐이라 빠듯해.`);
      if (a.id === 'breakdown' && s?.pendingRisk?.targetName) lines.push(`멈춘 건 ${josa(s.pendingRisk.targetName, '이/가')}예요.`);
      return { speaker: { name: SPEAKER_NAME[def.speaker], portrait: def.speaker }, lines };
    }
    case 'eventChoice': { // 빅 이벤트 선택지
      const def = eventChoiceDef(a.id);
      return { speaker: { name: SPEAKER_NAME.samchun, portrait: 'samchun' }, lines: [`【${bigEventDef(a.id).title}】`, ...(def?.lines ?? [])] };
    }
    case 'coach': // 3달 연속 C — 삼춘이 찾아와 제안 하나
      return { speaker: { name: SPEAKER_NAME.samchun, portrait: 'samchun' }, lines: ['석 달째 힘든 달이 이어졌져.', s ? `${coachAdvice(s)}. 하나만 고쳐도 달라진다.` : '하나만 고쳐도 달라진다.'] };
  }
}

/** 알림이 있고 지금 띄운 것이 없으면 맨 앞 알림을 대화창으로. 띄웠으면 true.
 *  dismiss = 대화가 닫힐 때 알림을 빼는 콜백 (App: dispatch({ type: 'dismissAlert' })). store를 여기서 안 끌어와 vitest에서도 돈다.
 *  맨 앞이 보상 상자 알림이면 RewardPopup이 처리하므로 false. */
export function checkAlerts(s: GameState, dismiss: () => void, act?: (x: Action) => void): boolean {
  const a = s.alerts[0];
  if (!a) { showingFor = null; return false; }
  if (isPopupAlert(a)) return false;
  // 같은 알림을 이미 띄웠고 그 대화가 아직 살아 있으면 기다린다 (clearDialogues로 사라졌으면 다시 띄운다)
  if (a === showingFor && (getDialogue() !== null || queuedCount() > 0)) return false;
  showingFor = a;
  const req = alertToDialogue(a, s);
  if (req.lines.length === 0) { showingFor = null; dismiss(); return true; }
  const choices = act ? alertChoices(a, s, act) : undefined;
  showDialogue({
    ...req,
    ...(choices ? { choices } : {}),
    onClose: () => { if (showingFor === a) showingFor = null; dismiss(); },
  });
  return true;
}
