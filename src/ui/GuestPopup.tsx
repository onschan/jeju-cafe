import { useEffect, useRef } from 'react';
import { useGame } from './store';
import { guestFace, walletOf, canAcceptQuest, type Guest, type GuestTypeState } from '../sim/index.ts';
import { guestTypeDef, questDef } from '../data/index.ts';
import { guestParts, staffParts, type CharacterParts } from '../render/character';
import { drawPortrait, PORTRAIT_SIZE } from '../render/portrait';
import { Popup } from './Popup';
import { Bar, Face } from './StaffPanel';
import { brownBtn, brownBtnOn, PALETTE, won } from './frame';
import type { Face as FaceParts, RoleId } from '../sim/index.ts';

const MOOD_TEXT: Record<string, string> = { happy: '기분 좋음 😊', meh: '그저 그럼 😐', angry: '화남 😠' };
const REASON_TEXT: Record<string, string> = { no_menu: '먹을 게 없어요', scenery: '경치가 아쉬워요', wait: '오래 기다렸어요', price: '너무 비싸요' };

/** 파츠 초상(캔버스). 시트가 없으면 색 사각형 얼굴로. */
export function Portrait({ parts, size = PORTRAIT_SIZE, face }: { parts: CharacterParts; size?: number; face: FaceParts }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const okRef = useRef(true);
  useEffect(() => {
    if (ref.current) okRef.current = drawPortrait(ref.current, parts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.skin, parts.hairStyle, parts.hairColor, parts.top, parts.accs.join(',')]);
  return (
    <span style={{ display: 'inline-block', width: size, height: size, background: PALETTE.paperDark, border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, overflow: 'hidden', flex: 'none' }}>
      <canvas ref={ref} width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} style={{ width: size, height: size, imageRendering: 'pixelated', display: okRef.current ? 'block' : 'none' }} aria-label="초상" />
      {!okRef.current && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Face face={face} /></span>}
    </span>
  );
}

export function guestPortraitParts(typeId: string): CharacterParts {
  const def = guestTypeDef(typeId);
  return guestParts(guestFace(typeId), def.tags, def.wants);
}
export function staffPortraitParts(face: FaceParts, role: RoleId | null): CharacterParts {
  return staffParts(face, role);
}

/** 손님 이름: 타입명 + 번호 (id g123 → 123호) */
export function guestName(g: Guest): string {
  return `${guestTypeDef(g.type).name} ${g.id.replace(/^g/, '')}호`;
}

/** 이 손님 타입이 지금 제안 중인 부탁 */
function offeredQuestFor(quests: Record<string, { id: string; status: string }>, typeId: string): string | null {
  const def = guestTypeDef(typeId);
  const id = def.questId;
  if (id && quests[id]?.status === 'offered') return id;
  return null;
}

/** 손님을 누르면: 초상·이름·기분·대사·지갑·만족 게이지·부탁(도전하기) */
export function GuestPopup({ guestId, onClose, onQuest }: { guestId: string; onClose: () => void; onQuest: (questId: string) => void }) {
  const s = useGame();
  const g = s.guests.find((x) => x.id === guestId);
  if (!g) return null;
  const def = guestTypeDef(g.type);
  const st: GuestTypeState | undefined = s.guestTypes[def.id];
  const quest = offeredQuestFor(s.board.quests, def.id);
  const line = g.say ?? def.line ?? '';
  const mood = g.mood ? MOOD_TEXT[g.mood] : g.phase === 'walking' ? '자리로 가는 중' : g.phase === 'visiting' ? '구경 중' : g.phase === 'leaving' ? '집에 가는 중' : '주문 기다리는 중';
  return (
    <Popup title={guestName(g)} onBackdrop={onClose}
      buttons={<>
        {quest && (
          <button style={brownBtnOn} onClick={() => { onQuest(quest); onClose(); }} disabled={!canAcceptQuest(s, quest).ok}>
            ! 도전하기
          </button>
        )}
        <button style={brownBtn} onClick={onClose}>닫기</button>
      </>}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Portrait parts={guestPortraitParts(g.type)} face={guestFace(g.type)} />
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.6 }}>
          <div><b>{def.name}</b>{quest && <span style={{ color: PALETTE.bad, fontWeight: 700 }}> !</span>} <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{def.tags.age === 'senior' ? '삼춘' : def.tags.age === 'youth' ? '청년' : def.tags.age === 'adult' ? '어른' : ''}{def.tags.group ? ' · 단체' : ''}</span></div>
          <div>기분: {mood}{g.moodReason && g.mood !== 'happy' ? ` (${REASON_TEXT[g.moodReason]})` : ''}</div>
          <div>지갑: {def.wallet > 0 ? won(walletOf(s, g.type)) : '없음'}</div>
          <div style={{ whiteSpace: 'nowrap' }}>만족 <Bar value={st?.satisfaction ?? 0} max={100} width={90} /> {st?.satisfaction ?? 0}{st?.regular === 'vip' ? ' · VIP' : st?.regular === 'regular' ? ' · 단골' : ''}</div>
        </div>
      </div>
      {line && <div style={{ marginTop: 8, fontStyle: 'italic', color: PALETTE.inkSoft, fontSize: 14 }}>“{line}”</div>}
      {quest && <div style={{ marginTop: 6, fontSize: 13 }}><b style={{ color: PALETTE.bad }}>!</b> 부탁: {questDef(quest).description}</div>}
    </Popup>
  );
}
