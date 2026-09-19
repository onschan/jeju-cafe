import { useGame, dispatch } from './store';
import { wonText } from '../data/labels.ts';
import { villageReview, nextGradeScore, canDonate, canHoldFestival, VILLAGE_GRADE_NAME, VILLAGE_GRADE_MAX, VILLAGE_REVIEW_MONTH, FESTIVAL_MONTH, FESTIVAL_GRADE, FESTIVAL_COST, FESTIVAL_GUEST_MULT, FESTIVAL_REPUTATION, FESTIVAL_TICKETS, VILLAGE_DONATION, LOCAL_GUEST_MULT, PARCEL_DISCOUNT } from '../sim/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { Bar } from './Bars';
import { card, brownBtn, brownBtnOff, PALETTE } from './frame';

/** 등급별 보상 문구 (village.ts 표) */
const GRADE_REWARD: Record<number, string> = {
  2: `동네 손님 +${Math.round((LOCAL_GUEST_MULT - 1) * 100)}%`,
  3: '삼춘 부탁 해금',
  4: `필지 ${PARCEL_DISCOUNT * 100}% 할인 · 마을제 개최권`,
  5: '촌장 엔딩',
};

/** 장부 › 지역 「마을」 카드 (z-ending): 현재 정착 등급·다음 등급 조건(항목 5)·기부·마을제 버튼.
 *  심사는 매년 9월 1일 반상회, 등급은 한 번에 1단계씩 오른다. */
export function VillageCard() {
  const s = useGame();
  const v = s.village;
  const r = villageReview(s);
  const need = nextGradeScore(s);
  const donate = canDonate(s);
  const fest = canHoldFestival(s);
  const festWindow = v.grade >= FESTIVAL_GRADE;
  return (
    <div style={{ ...card, borderColor: PALETTE.btnOn }} data-testid="village-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>마을 · 정착 등급 「{VILLAGE_GRADE_NAME[v.grade]}」 {v.grade}/{VILLAGE_GRADE_MAX}</b>
        <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>심사 매년 {VILLAGE_REVIEW_MONTH}월 1일</span>
      </div>
      <div style={{ fontSize: 12, color: PALETTE.inkSoft, margin: '2px 0 4px' }}>
        {need === null ? '최고 등급이에요. 10년차 결산 때 촌장 엔딩.' : `다음 「${VILLAGE_GRADE_NAME[v.grade + 1]}」: ${r.total}/${need}점 (${GRADE_REWARD[v.grade + 1]})`}
      </div>
      <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
        {r.items.map((it) => (
          <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-testid={`village-${it.key}`}>
            <span style={{ width: 96, flex: 'none' }}>{it.label}</span>
            <Bar value={it.points} max={20} width={70} color={it.key === 'noise' ? PALETTE.bar : PALETTE.ok} />
            <span style={{ whiteSpace: 'nowrap' }}>{it.points}/20 <span style={{ color: PALETTE.inkSoft }}>· {it.hint}</span></span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        <button style={{ ...(donate.ok ? brownBtn : brownBtnOff), marginBottom: 0 }} disabled={!donate.ok} aria-label="마을 기부"
          onClick={() => Confirm(`마을에 ${wonText(VILLAGE_DONATION)} 기부할까요? 정착 등급 「기부」 항목 +1점 (누적 ${wonText(v.donated)})`, () => dispatch({ type: 'donateVillage' }), { title: '마을 기부' })}>
          <Icon name="money" /> 기부 {wonText(VILLAGE_DONATION, true)}
        </button>
        {festWindow && (
          <button style={{ ...(fest.ok ? brownBtn : brownBtnOff), marginBottom: 0 }} disabled={!fest.ok} aria-label="마을제 개최"
            onClick={() => Confirm(`마을제를 열까요? ${wonText(FESTIVAL_COST)} — 오늘 손님 ×${FESTIVAL_GUEST_MULT}·평판 +${FESTIVAL_REPUTATION}·응모권 +${FESTIVAL_TICKETS}`, () => dispatch({ type: 'holdFestival' }), { title: '마을제' })}>
            🎉 마을제 {fest.ok ? wonText(FESTIVAL_COST, true) : `· ${fest.reason}`}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: PALETTE.inkSoft, marginTop: 4 }}>
        마을제 {v.festivals}회{festWindow ? ` · ${FESTIVAL_MONTH}월에 열 수 있어요` : ` · 「${VILLAGE_GRADE_NAME[FESTIVAL_GRADE]}」부터`}
      </div>
    </div>
  );
}
