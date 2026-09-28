import { useSyncExternalStore } from 'react';

/** 카이로식 대화창 큐 (UI 전용 모듈 스토어). showDialogue()로 넣고 Dialogue.tsx가 순서대로 그린다. 옛 ui/dialogue.ts를 줄인 것. */
export type PortraitId = 'halmang' | 'samchun' | 'hero' | 'haenyeo' | 'jangnim' | 'yori' | 'baek' | 'ai';
export type PortraitExpr = 'normal' | 'happy' | 'surprised';
export interface DialogueChoice { label: string; onPick: () => void }
export interface DialogueReq {
  speaker: { name: string; portrait: PortraitId; expr?: PortraitExpr };
  lines: string[];
  choices?: DialogueChoice[];
  onClose?: () => void;
}
export const LINES_PER_PAGE = 2;

let current: DialogueReq | null = null;
const queue: DialogueReq[] = [];
let page = 0;
let version = 0;
const listeners = new Set<() => void>();
function emit() { version++; for (const l of listeners) l(); }

export function showDialogue(req: DialogueReq): void {
  if (req.lines.length === 0) return;
  if (current) { queue.push(req); return; }
  current = req; page = 0; emit();
}
export function pageCount(req: DialogueReq): number { return Math.max(1, Math.ceil(req.lines.length / LINES_PER_PAGE)); }
export function pageLines(req: DialogueReq, p: number): string[] { return req.lines.slice(p * LINES_PER_PAGE, (p + 1) * LINES_PER_PAGE); }
export function nextPage(): void { if (!current || page >= pageCount(current) - 1) return; page++; emit(); }
export function closeDialogue(choice?: DialogueChoice): void {
  const c = current; if (!c) return;
  current = null; page = 0;
  choice?.onPick(); c.onClose?.();
  if (!current) { const next = queue.shift(); if (next) { current = next; page = 0; } }
  emit();
}
export function clearDialogues(): void { current = null; queue.length = 0; page = 0; emit(); }
export function useDialogue(): { req: DialogueReq | null; page: number } {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => version);
  return { req: current, page };
}
/** 고정 인물 이름 */
export const SPEAKER: Record<PortraitId, string> = { halmang: '할망', samchun: '삼춘', hero: '나', haenyeo: '해녀 이모', jangnim: '면장님', yori: '요리사', baek: '백 사장', ai: '알바생' };
