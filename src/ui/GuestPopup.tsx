import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { useTutorialNote } from './tutorialDialogue';
import { wonText } from '../data/labels.ts';
import { useGame } from './store';
import { guestFace, walletOf, canAcceptQuest, namedGuestFace, regularFace, AFFINITY_MAX, type Guest, type GuestTypeState } from '../sim/index.ts';
import { guestTypeDef, questDef, namedGuestDef, regionDef, NAMES } from '../data/index.ts';
import { guestParts, staffParts, namedGuestParts, type CharacterParts } from '../render/character';
import { drawPortrait, PORTRAIT_SIZE, PORTRAIT_DISPLAY, type PortraitExpr } from '../render/portrait';
import { Popup } from './Popup';
import { Bar, Face } from './Bars';
import { brownBtn, brownBtnOn, PALETTE } from './frame';
import type { Face as FaceParts, RoleId } from '../sim/index.ts';

const MOOD_TEXT: Record<string, string> = { happy: '기분 좋음', meh: '그저 그럼', angry: '화남' };
const MOOD_ICON: Record<string, string> = { happy: 'mood_happy', meh: 'mood_meh', angry: 'mood_angry' };
const REASON_TEXT: Record<string, string> = { no_menu: '먹을 게 없어요', scenery: '경치가 아쉬워요', wait: '오래 기다렸어요', price: '너무 비싸요' };

/** 파츠 초상(캔버스, 48 원본 → size로 픽셀 확대; 기본 96). 시트가 없으면 색 사각형 얼굴로. */
export function Portrait({ parts, size = PORTRAIT_DISPLAY, face, expr = 'normal' }: { parts: CharacterParts; size?: number; face: FaceParts; expr?: PortraitExpr }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const okRef = useRef(true);
  useEffect(() => {
    if (ref.current) okRef.current = drawPortrait(ref.current, parts, expr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.skin, parts.hairStyle, parts.hairColor, parts.top, parts.accs.join(','), parts.portrait, expr]);
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
/** 이름 있는 손님(지역 손님 56) 초상 파츠 */
export function namedPortraitParts(namedId: string): CharacterParts {
  const def = namedGuestDef(namedId);
  return namedGuestParts(namedGuestFace(def), def.face.seed, def.regionId);
}
export function staffPortraitParts(face: FaceParts, role: RoleId | null): CharacterParts {
  return staffParts(face, role);
}

/** 손님 초상 파츠·얼굴·지갑 — 단골★(namedId)은 NamedGuestDef에서 */
export function guestPortraitOf(g: Guest): { parts: CharacterParts; face: FaceParts } {
  if (g.namedId) return { parts: namedPortraitParts(g.namedId), face: namedGuestFace(namedGuestDef(g.namedId)) };
  if (g.faceSeed !== undefined) { const def = guestTypeDef(g.type); const face = regularFace(g.faceSeed); return { parts: guestParts(face, def.tags, def.wants), face }; } // fun-guest: 단골 고정 얼굴
  return { parts: guestPortraitParts(g.type), face: guestFace(g.type) };
}
export function guestWallet(s: Parameters<typeof walletOf>[0], g: Guest): number {
  return g.namedId ? namedGuestDef(g.namedId).budget : walletOf(s, g.type);
}

/** 손님 이름: 이름 풀(names.json)에서 id 번호로 고른 이름 + 타입명 — "동네 삼춘 2153호" 대신 "김민준 (동네 삼춘)". 결정적(id는 세이브에 있다). */
export function guestName(g: Guest): string {
  if (g.namedId) { const d = namedGuestDef(g.namedId); return `${d.name} (${d.job})`; }
  if (g.name) return `${g.name} (${guestTypeDef(g.type).name})`; // fun-guest: 스폰 때 받은 성+이름 (단골은 고정 이름)
  const n = Number(g.id.replace(/^g/, '')) || 0;
  const name = NAMES.names[n % NAMES.names.length] ?? '손님';
  return `${name} (${guestTypeDef(g.type).name})`;
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
  useTutorialNote('guestCard'); // 튜토리얼 10단계 「손님 카드 보기」
  const g = s.guests.find((x) => x.id === guestId);
  if (!g) return null;
  const def = guestTypeDef(g.type);
  const st: GuestTypeState | undefined = s.guestTypes[def.id];
  const quest = offeredQuestFor(s.board.quests, def.id);
  const line = g.say ?? def.line ?? '';
  const mood = g.mood ? MOOD_TEXT[g.mood] : g.phase === 'walking' ? '자리로 가는 중' : g.phase === 'visiting' ? '구경 중' : g.phase === 'leaving' ? '집에 가는 중' : '주문 기다리는 중';
  if (g.namedId) {
    // 단골★(이름 있는 손님): 이름·직업·한 줄 소개·호감도
    const nd = namedGuestDef(g.namedId);
    const ns = s.namedGuests[nd.id];
    return (
      <Popup title={guestName(g)} onBackdrop={onClose} buttons={<button style={brownBtn} onClick={onClose}>닫기</button>}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }} data-testid="named-guest-popup">
          <Portrait parts={namedPortraitParts(nd.id)} face={namedGuestFace(nd)} />
          <div style={{ flex: 1, fontSize: 14, lineHeight: 1.6 }}>
            <div><b>{nd.name}</b> <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{nd.job} · {regionDef(nd.regionId).name}</span>{ns?.regular && <span style={{ color: PALETTE.btn, fontWeight: 700 }}> ★ 단골</span>}</div>
            <div>기분: {g.mood && <><Icon name={MOOD_ICON[g.mood] ?? 'mood_meh'} size={14} /> </>}{mood}{g.moodReason && g.mood !== 'happy' ? ` (${REASON_TEXT[g.moodReason]})` : ''}</div>
            <div>지갑: {wonText(nd.budget)}</div>
            <div style={{ whiteSpace: 'nowrap' }}>호감 <Bar value={ns?.affinity ?? 0} max={AFFINITY_MAX} width={90} /> {ns?.affinity ?? 0}/{AFFINITY_MAX}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontStyle: 'italic', color: PALETTE.inkSoft, fontSize: 14 }}>“{g.say ?? nd.line}”</div>
      </Popup>
    );
  }
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
        <Portrait {...guestPortraitOf(g)} />
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.6 }}>
          <div><b>{g.name ?? def.name}</b>{g.name && <span style={{ fontSize: 12, color: PALETTE.inkSoft }}> {def.name}</span>}{quest && <span style={{ color: PALETTE.bad, fontWeight: 700 }}> !</span>} <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{def.tags.age === 'senior' ? '삼춘' : def.tags.age === 'youth' ? '청년' : def.tags.age === 'adult' ? '어른' : ''}{def.tags.group ? ' · 단체' : ''}</span></div>
          <div>기분: {g.mood && <><Icon name={MOOD_ICON[g.mood] ?? 'mood_meh'} size={14} /> </>}{mood}{g.moodReason && g.mood !== 'happy' ? ` (${REASON_TEXT[g.moodReason]})` : ''}</div>
          <div>지갑: {def.wallet > 0 ? wonText(walletOf(s, g.type)) : '없음'}</div>
          <div style={{ whiteSpace: 'nowrap' }}>만족 <Bar value={st?.satisfaction ?? 0} max={100} width={90} /> {st?.satisfaction ?? 0}{st?.regular === 'vip' ? ' · VIP' : st?.regular === 'regular' ? ' · 단골' : ''}</div>
        </div>
      </div>
      {line && <div style={{ marginTop: 8, fontStyle: 'italic', color: PALETTE.inkSoft, fontSize: 14 }}>“{line}”</div>}
      {quest && <div style={{ marginTop: 6, fontSize: 13 }}><b style={{ color: PALETTE.bad }}>!</b> 부탁: {questDef(quest).description}</div>}
    </Popup>
  );
}
