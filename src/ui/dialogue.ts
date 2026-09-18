import { useSyncExternalStore } from 'react';

/** 카이로식 대화창 큐 (UI 전용 모듈 스토어). showDialogue()로 넣고 Dialogue.tsx가 순서대로 그린다.
 *  React·DOM에 의존하지 않아 vitest에서 큐 순서·닫힘·선택지를 그대로 검증할 수 있다. */

/** 초상: 고정 인물 아이콘(portrait_*.png) 또는 직원·손님 id(파츠 초상) */
export type PortraitId = 'halmang' | 'samchun' | 'hero' | 'haenyeo' | 'jangnim' | (string & {});

export interface DialogueChoice { label: string; onPick: () => void }

export interface DialogueReq {
  speaker: { name: string; portrait: PortraitId };
  lines: string[];
  /** 마지막 페이지의 버튼. 없으면 '알겠다' 하나 */
  choices?: DialogueChoice[];
  /** 첫 페이지에 '건너뛰기' 버튼을 보여 준다 (튜토리얼) */
  onSkip?: () => void;
  /** 닫힐 때(선택지 포함) */
  onClose?: () => void;
}

/** 한 페이지에 보여 주는 대사 줄 수 */
export const LINES_PER_PAGE = 2;

let current: DialogueReq | null = null;
const queue: DialogueReq[] = [];
let page = 0;
let version = 0;
const listeners = new Set<() => void>();
function emit() { version++; for (const l of listeners) l(); }

/** 대화를 띄운다. 이미 떠 있으면 뒤에 줄을 선다. */
export function showDialogue(req: DialogueReq): void {
  if (req.lines.length === 0) return;
  if (current) { queue.push(req); return; }
  current = req;
  page = 0;
  emit();
}

export function getDialogue(): DialogueReq | null { return current; }
export function getDialoguePage(): number { return page; }
export function pageCount(req: DialogueReq): number { return Math.max(1, Math.ceil(req.lines.length / LINES_PER_PAGE)); }
export function pageLines(req: DialogueReq, p: number): string[] { return req.lines.slice(p * LINES_PER_PAGE, (p + 1) * LINES_PER_PAGE); }
export function isLastPage(): boolean { return current !== null && page >= pageCount(current) - 1; }
export function queuedCount(): number { return queue.length; }

/** 다음 페이지로. 마지막 페이지면 아무것도 안 한다 (버튼으로 닫는다). */
export function nextPage(): boolean {
  if (!current || isLastPage()) return false;
  page++;
  emit();
  return true;
}

/** 현재 대화를 닫고 큐의 다음 것을 띄운다. 선택지를 골랐으면 그 콜백을 먼저 부른다. */
export function closeDialogue(choice?: DialogueChoice): void {
  const c = current;
  if (!c) return;
  current = null;
  page = 0;
  // 콜백이 새 대화를 띄우면(후속 대화) 그것이 먼저 오고, 줄 서 있던 것은 그 뒤에 온다
  choice?.onPick();
  c.onClose?.();
  if (!current) {
    const next = queue.shift();
    if (next) { current = next; page = 0; }
  }
  emit();
}

/** 큐까지 전부 비운다 (새 게임·타이틀로 나갈 때) */
export function clearDialogues(): void {
  current = null;
  queue.length = 0;
  page = 0;
  emit();
}

export function subscribeDialogue(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
export function getDialogueVersion(): number { return version; }

export function useDialogue(): { req: DialogueReq | null; page: number } {
  useSyncExternalStore(subscribeDialogue, getDialogueVersion, getDialogueVersion);
  return { req: current, page };
}
