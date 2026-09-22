import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { FinalScore, GameState } from '../sim/index.ts';
import { computeScore, makeCarry, carryText, VILLAGE_GRADE_NAME, isChiefCandidate, MILLENNIUM_TREE } from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { ENDING_DIALOGUES, SPEAKER_NAME, type SpokenLine } from '../data/dialogue/index.ts';
import { useGame, dispatch, newGame, recordEnding, pauseGame, autosaveNow } from './store';
import { frame, frameTitle, brownBtn, brownBtnOn, PALETTE } from './frame';
import { Confirm } from './Popup';
import { loadSheet, drawFrame, type Sheet } from './sheetCanvas';
import { HAIR_RGB, TOP_RGB, staffParts, type CharacterParts } from '../render/character';
import { sfx } from './audio';
import { assetUrl } from './assetUrl';

/** 엔딩 장면 (z-ending): state.alerts 맨 앞이 { type: 'ending' }(10년차 3월 1일) 또는 { type: 'centennial', success: true }(20년차 100주년)면 전체 화면.
 *  ① 컷: 카페 스프라이트 + 직원 파츠 캐릭터 줄지어 + 할망·삼춘·나 대사 3줄(탭해서 넘김) → ② 최종 점수 카드(항목 9·총점·칭호·최고 점수 갱신) →
 *  버튼 「계속하기」(그대로 이어서, 4배속 해금) / 「이월해서 새로 시작」(이월 6종) / 「타이틀로」. 100주년 컷은 「확인」만.
 *  결산 카드(lastMonthCard)·가이드북 발표가 떠 있는 동안은 미룬다 (결산 → 발표 → 엔딩). */

export const SCENE_W = 320;
export const SCENE_H = 150;
const FEET_Y = 142;
const MAX_CHARS = 6;

/** 본관 스프라이트 이름 (증축 Lv·2층 반영, GameView와 같은 규칙) */
function mainSprite(s: GameState): string {
  const lv = s.main?.level ?? 1;
  if (lv <= 1) return 'iso_obj_warehouse';
  return s.main?.floor2 && lv >= 3 ? `iso_obj_warehouse_floor2_lv${Math.min(4, lv)}` : `iso_obj_warehouse_lv${lv}`;
}

export function drawEnding(canvas: HTMLCanvasElement, sheet: Sheet | null, s: GameState, variant: 'ending' | 'centennial') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = variant === 'centennial' ? '#f4b860' : '#8ec1f0';
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const oy = 78;
  ctx.fillStyle = '#5aa63f';
  ctx.fillRect(0, oy, SCENE_W, SCENE_H - oy);
  if (!sheet) return;
  const band = (name: string, y: number) => { for (let x = -256; x < SCENE_W; x += 512) drawFrame(ctx, sheet, name, x, y); };
  band('bg_sea', oy - 150);
  band('bg_oreum', oy - 120);
  band('bg_forest', oy - 96);
  // 카페(본관)와 100주년이면 천년 팽나무
  const main = mainSprite(s);
  drawFrame(ctx, sheet, sheet.frames[main] ? main : 'iso_obj_warehouse', SCENE_W / 2 + (variant === 'centennial' ? 50 : 0), oy + 34, { anchorX: 0.5, anchorY: 1 });
  if (variant === 'centennial') drawFrame(ctx, sheet, `iso_obj_${MILLENNIUM_TREE}`, SCENE_W / 2 - 60, oy + 40, { anchorX: 0.5, anchorY: 1 });
  // 직원 줄지어 (없으면 앞치마 인물 1)
  const chars: CharacterParts[] = s.staff.slice(0, MAX_CHARS).map((st) => staffParts(st.face, st.role, s.uniform ?? null));
  if (chars.length === 0) chars.push({ skin: 0, hairStyle: 1, hairColor: 1, top: 3, accs: ['apron'] });
  const n = chars.length;
  chars.forEach((p, i) => {
    const x = Math.round((SCENE_W * (i + 1)) / (n + 1));
    drawFrame(ctx, sheet, `body_${p.skin}_down_1`, x, FEET_Y, { anchorX: 0.5, anchorY: 1 });
    drawFrame(ctx, sheet, 'top_down_1', x, FEET_Y, { anchorX: 0.5, anchorY: 1, tint: TOP_RGB[p.top] });
    drawFrame(ctx, sheet, `hair_${p.hairStyle}_down`, x, FEET_Y, { anchorX: 0.5, anchorY: 1, tint: HAIR_RGB[p.hairColor] });
    for (const acc of p.accs) drawFrame(ctx, sheet, `acc_${acc}_down`, x, FEET_Y, { anchorX: 0.5, anchorY: 1 });
  });
}

function EndingCanvas({ s, variant }: { s: GameState; variant: 'ending' | 'centennial' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    const c = ref.current;
    if (!c) return;
    drawEnding(c, null, s, variant);
    void loadSheet().then((sheet) => { if (!disposed && ref.current) drawEnding(ref.current, sheet, s, variant); });
    return () => { disposed = true; };
    // 장면은 열릴 때 한 번만 그린다 (직원·유니폼은 엔딩 시점 것)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);
  return <canvas ref={ref} width={SCENE_W} height={SCENE_H} data-testid="ending-scene" style={{ display: 'block', width: '100%', aspectRatio: `${SCENE_W} / ${SCENE_H}`, imageRendering: 'pixelated', border: `3px solid ${PALETTE.wood}`, borderRadius: 6, background: PALETTE.paperDark }} />;
}

const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: `1px dashed ${PALETTE.woodLight}`, fontSize: 14 };
const fullBtn: CSSProperties = { ...brownBtn, width: '100%', marginRight: 0, minHeight: 48, fontSize: 17 };

/** 항목 값 표기 */
function valueText(key: FinalScore['items'][number]['key'], v: number): string {
  switch (key) {
    case 'money': return wonText(v);
    case 'guests': return `${v.toLocaleString('en-US')}명`;
    case 'star': return `★${v}`;
    case 'rank': return `${v}`;
    case 'reputation': return `${Math.round(v)}`;
    case 'goals': return `${v}개`;
    case 'corners': return `${v}개`;
    case 'spots': return `${v}`;
    case 'regulars': return `${v}명`;
  }
}

/** 최종 점수 카드 본문 (EndingScreen·TitleScreen 「최고 점수」가 같이 쓴다) */
export function ScoreCard({ score, record, cafeName }: { score: FinalScore; record?: boolean; cafeName?: string }) {
  return (
    <div data-testid="score-card">
      {cafeName && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>{cafeName} · {score.year}년차 {score.month}월</div>}
      {score.items.map((it) => (
        <div key={it.key} style={row}><span>{it.label} <span style={{ color: PALETTE.inkSoft }}>{valueText(it.key, it.value)}</span></span><b>{it.points}점</b></div>
      ))}
      {score.villageGrade >= 5 && <div style={row}><span>촌장 후보 보너스</span><b>+50점</b></div>}
      <div style={{ ...row, borderBottom: 'none', marginTop: 6, fontSize: 18 }}><span>총점</span><b data-testid="score-total">{score.total}점</b></div>
      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginTop: 6, padding: '6px 8px', background: PALETTE.btnOn, borderRadius: 6 }} data-testid="score-title">「{score.title}」</div>
      {record && <div data-testid="score-record" style={{ textAlign: 'center', marginTop: 6, fontWeight: 700, color: PALETTE.bad }}>🏆 최고 점수 갱신!</div>}
      <div style={{ fontSize: 12, color: PALETTE.inkSoft, marginTop: 6 }}>정착 등급 「{VILLAGE_GRADE_NAME[score.villageGrade]}」</div>
    </div>
  );
}

function SpeakerLine({ l }: { l: SpokenLine }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <img className="px" src={assetUrl(`assets/icons/portrait_${l.speaker}.png`)} width={48} height={48} alt="" style={{ imageRendering: 'pixelated', flex: 'none', border: `2px solid ${PALETTE.wood}`, borderRadius: 4 }} />
      <div style={{ fontSize: 15, lineHeight: 1.35 }}><b>{SPEAKER_NAME[l.speaker]}</b> {l.line}</div>
    </div>
  );
}

export function EndingScreen({ onExit }: { onExit: () => void }) {
  const s = useGame();
  const a = s.alerts[0];
  const variant: 'ending' | 'centennial' | null = a?.type === 'ending' ? 'ending' : a?.type === 'centennial' && a.success ? 'centennial' : null;
  const show = variant !== null && !s.lastMonthCard && !s.lastAnnouncement; // 결산 카드·가이드북 발표 뒤에
  const [line, setLine] = useState(0);
  const [phase, setPhase] = useState<'scene' | 'score'>('scene');
  const [record, setRecord] = useState(false);
  const score = useMemo(() => (variant === 'ending' ? s.ending.score ?? computeScore(s) : null), [variant, s.ending.score]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (show) return pauseGame('dialogue'); }, [show]);
  useEffect(() => { if (show) { setLine(0); setPhase('scene'); sfx('fanfare'); } }, [show, variant]);
  useEffect(() => { if (phase === 'score' && score) setRecord(recordEnding(score)); }, [phase, score]);
  if (!show || !variant) return null;
  const lines: SpokenLine[] = variant === 'centennial' ? ENDING_DIALOGUES.centennial.success : isChiefCandidate(s) ? ENDING_DIALOGUES.ending.chief : ENDING_DIALOGUES.ending.lines;
  const title = variant === 'centennial' ? ENDING_DIALOGUES.centennial.title : ENDING_DIALOGUES.ending.title;
  const next = () => {
    if (line + 1 < lines.length) { setLine(line + 1); sfx('tap'); return; }
    if (variant === 'centennial') { dispatch({ type: 'dismissAlert' }); return; }
    setPhase('score');
  };
  const carryStart = () => {
    const carry = makeCarry(s);
    Confirm(`이월: ${carryText(carry).join(' · ')} — 자동 저장이 새 게임으로 바뀌어요. 슬롯 1~3의 저장은 남아요.`, () => { newGame(carry); }, { title: '이월해서 새로 시작' });
  };
  return (
    <div data-testid="ending-screen" style={{ position: 'absolute', inset: 0, background: '#000c', zIndex: 48, /* 보상 상자(45)·대화창(40) 위, 확인 팝업(PopupHost 50) 아래 */ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, overflowY: 'auto' }}>
      <div style={{ ...frame, width: '100%', maxWidth: 360, maxHeight: '100%', overflowY: 'auto' }}>
        <div style={frameTitle}>{title}</div>
        {phase === 'scene' ? (
          <div onClick={next} data-testid="ending-cut">
            <EndingCanvas s={s} variant={variant} />
            <div style={{ marginTop: 8, minHeight: 64 }}><SpeakerLine l={lines[line]!} /></div>
            <button style={{ ...fullBtn, marginTop: 8 }} onClick={(e) => { e.stopPropagation(); next(); }} aria-label={line + 1 < lines.length ? '다음' : variant === 'centennial' ? '확인' : '점수 보기'}>
              {line + 1 < lines.length ? '▶ 다음' : variant === 'centennial' ? '✅ 확인' : '📜 점수 보기'}
            </button>
          </div>
        ) : score && (
          <div>
            <ScoreCard score={score} record={record} cafeName={s.cafeName} />
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              <button style={{ ...brownBtnOn, ...fullBtn, background: PALETTE.btnOn, color: PALETTE.btnOnText }} onClick={() => dispatch({ type: 'continueEnding' })} aria-label="계속하기">▶ 계속하기 <span style={{ fontSize: 12, fontWeight: 400 }}>(4배속 해금)</span></button>
              <button style={fullBtn} onClick={carryStart} aria-label="이월해서 새로 시작">🔁 이월 시작</button>
              <button style={fullBtn} onClick={() => { autosaveNow(); onExit(); }} aria-label="타이틀로">🏠 타이틀로</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
