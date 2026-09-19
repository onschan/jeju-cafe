/** 대화 데이터 타입·로더 (스펙 §1.3·§2·§5). 텍스트만 — 조건 판정·효과는 트랙 A(sim)·표시는 트랙 C(Dialogue.tsx)가 맡는다. */
import tutorialJson from './tutorial.json' with { type: 'json' };
import goalsLinesJson from './goals_lines.json' with { type: 'json' };
import eventsJson from './events.json' with { type: 'json' };
import samchunJson from './samchun.json' with { type: 'json' };
import failureJson from './failure.json' with { type: 'json' };

/** 화자 키 = public/assets/icons/portrait_<key>.png */
export type Speaker = 'halmang' | 'samchun' | 'hero' | 'haenyeo' | 'jangnim';
export const SPEAKER_NAME: Record<Speaker, string> = { halmang: '할망', samchun: '삼춘', hero: '나', haenyeo: '해녀 삼춘', jangnim: '이장님' };

export interface TutorialStep { id: number; key: string; chapter: number; title: string; speaker: Speaker; lines: string[]; done: string | null; button: string }
/** 튜토리얼 장(章) 제목·한 줄 소개 (z-tutorial 5장) */
export interface TutorialChapterText { id: number; title: string; intro: string }
export interface GoalLine { id: string; speaker: Speaker; line: string }
export interface EventDialogue { id: string; title: string; speaker: Speaker; season: 'spring' | 'summer' | 'autumn' | 'winter' | 'any'; lines: string[]; endLine: string }
export interface SamchunStep { step: number; ask: string; lines: string[]; doneLine: string }
export interface FailureDialogue { stage: 'warn' | 'loan' | 'crisis' | 'demote'; title: string; speaker: Speaker; lines: string[]; tip: string }
export interface SamchunDef { id: string; name: string; job: string; portrait: Speaker; intro: string; chain: SamchunStep[]; rewardText: string }

export const TUTORIAL_STEPS: TutorialStep[] = (tutorialJson as { steps: TutorialStep[] }).steps;
export const TUTORIAL_CHAPTER_TEXTS: TutorialChapterText[] = (tutorialJson as { chapters: TutorialChapterText[] }).chapters;
export const GOAL_LINES: GoalLine[] = (goalsLinesJson as { lines: GoalLine[] }).lines;
export const EVENT_DIALOGUES: EventDialogue[] = (eventsJson as { events: EventDialogue[] }).events;
export const SAMCHUN: SamchunDef[] = (samchunJson as { samchun: SamchunDef[] }).samchun;
/** 실패 상태 대화 4단계 (§4.4) */
export const FAILURE_DIALOGUES: FailureDialogue[] = (failureJson as { stages: FailureDialogue[] }).stages;
export const failureDialogue = (stage: FailureDialogue['stage']): FailureDialogue => FAILURE_DIALOGUES.find((f) => f.stage === stage)!;

const GOAL_LINE = new Map(GOAL_LINES.map((g) => [g.id, g]));
const EVENT_DIALOGUE = new Map(EVENT_DIALOGUES.map((e) => [e.id, e]));
const SAMCHUN_BY_ID = new Map(SAMCHUN.map((s) => [s.id, s]));

/** 목표 n번째(0부터) 축하 대사. goals.json id와 맞으면 id로, 아니면 순서로 돌려쓴다. */
export function goalLine(idOrIndex: string | number): GoalLine {
  if (typeof idOrIndex === 'string') {
    const hit = GOAL_LINE.get(idOrIndex);
    if (hit) return hit;
    const n = Number(/(\d+)$/.exec(idOrIndex)?.[1]);
    if (Number.isFinite(n) && n > 0) return GOAL_LINES[(n - 1) % GOAL_LINES.length]!;
    return GOAL_LINES[0]!;
  }
  return GOAL_LINES[Math.max(0, idOrIndex) % GOAL_LINES.length]!;
}
export const eventDialogue = (id: string): EventDialogue | undefined => EVENT_DIALOGUE.get(id);
export const samchunDef = (id: string): SamchunDef | undefined => SAMCHUN_BY_ID.get(id);
