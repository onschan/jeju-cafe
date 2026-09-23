import { useState } from 'react';
import { wonText } from '../data/labels.ts';
import { josa } from '../sim/josa.ts';
import { useGame, dispatch } from './store';
import { canPromote, effectivePopularity, MAX_ACTIVE_PROMOTIONS, PARTTIME_MONEY, APOLOGY_REPUTATION, promoChances, chanceText, outcomeChances, bestStaffFor, type PromotionDef } from '../sim/index.ts';
import { TitleRibbon } from './TitleBadge'; // staff-luck
import { PROMOTIONS, GUEST_TYPES, promotionDef } from '../data/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { Face, Bar, EnergyBar } from './Bars';
import { card, brownBtn, brownBtnOn, brownBtnOff, PALETTE } from './frame';

/** 활동 효과 한 줄. 아직 게임에 없는 손님층(guests.json에 없음)은 sim도 안 쓰므로 숨긴다. */
function effectText(d: PromotionDef): string {
  if (d.special === 'youtuber') return '60% 확률로 3달 동안 관광객이 2배 와요';
  if (d.special === 'parttime') return `돈 ${josa(wonText(PARTTIME_MONEY), '을/를')} 바로 벌어요`;
  if (d.special === 'apology') return `평판 +${APOLOGY_REPUTATION} (한 달에 한 번)`;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d.segmentDelta)) {
    const t = GUEST_TYPES.find((x) => x.id === k);
    if (t) parts.push(`${t.name} +${v}`);
  }
  if (d.allDelta) parts.push(`모든 손님 +${d.allDelta}`);
  if (d.popularityShift) parts.push(`손님 색깔이 관광객 쪽으로 ${d.popularityShift}`);
  const when = d.months > 0 ? `${d.months}달 동안 ` : '';
  return `${when}${parts.join(' · ')}`;
}

function costText(d: PromotionDef) {
  return (
    <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
      {d.costResearch > 0 && <span style={{ marginRight: 6 }}><Icon name="research" /> {d.costResearch}</span>}
      {d.costMoney > 0 && <span style={{ marginRight: 6 }}><Icon name="money" /> {wonText(d.costMoney)}</span>}
      <span>기력 -{d.energy}</span>
    </span>
  );
}

export function PromoPanel() {
  const s = useGame();
  const [picked, setPicked] = useState<string | null>(null);
  const staff = s.staff.find((st) => st.id === picked) ?? s.staff[0] ?? null;

  const run = (d: PromotionDef) => {
    if (!staff) return;
    const act = () => dispatch({ type: 'promote', staffId: staff.id, promotionId: d.id });
    if (d.costMoney > 0) Confirm(`${d.name}에 ${josa(wonText(d.costMoney), '을/를')} 씁니다. ${staff.name} 씨가 다녀와요`, act, { title: '홍보' });
    else act();
  };

  return (
    <div>
      {/* 손님층 인지도 */}
      <div style={{ marginBottom: 4 }}><b>손님층 인지도</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>타깃(최대 3)을 정하면 홍보 효과 1.5배·만족 +3</span></div>
      <div style={card}>
        {GUEST_TYPES.filter((t) => s.guestTypes[t.id]?.unlocked).map((t) => {
          const v = effectivePopularity(s, t.id);
          const on = s.targets.includes(t.id);
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 13 }}>
              <Icon name={t.tags.age === 'senior' ? 'local' : 'tourist'} size={20} />
              <span style={{ width: 64 }}>{t.name}</span>
              <span style={{ fontSize: 11, color: PALETTE.inkSoft, width: 34 }}>{s.guestTypes[t.id]?.regular === 'vip' ? 'VIP' : s.guestTypes[t.id]?.regular === 'regular' ? '단골' : <><Icon name="mood_happy" size={11} />{s.guestTypes[t.id]?.satisfaction ?? 0}</>}</span>
              <Bar value={v} max={99} width={90} />
              <span style={{ width: 24 }}>{Math.round(v)}</span>
              <button style={{ ...(on ? brownBtnOn : brownBtn), marginBottom: 0, padding: '0 8px', fontSize: 13 }} onClick={() => dispatch({ type: 'setTarget', segment: t.id })}>
                {on ? '타깃 ★' : '타깃'}
              </button>
            </div>
          );
        })}
        {s.youtuberBoostMonths > 0 && <div style={{ fontSize: 13, color: PALETTE.ok }}>유튜버 효과 {s.youtuberBoostMonths}달 남음 (관광객 2배)</div>}
      </div>

      {/* 진행 중 */}
      {s.activePromotions.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          진행 중 ({s.activePromotions.length}/{MAX_ACTIVE_PROMOTIONS}): {s.activePromotions.map((a) => `${promotionDef(a.promotionId).name} ${a.remainingMonths}달 남음`).join(' · ')}
        </div>
      )}

      {/* 직원 고르기 */}
      <div style={{ marginBottom: 4 }}><b>누가 갈까?</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>홍보는 대박·성공·쪽박이 갈려요 — 미소가 높고 기력이 남은 직원일수록 대박{(() => { const b = bestStaffFor(s, 'promo'); return b ? ` · 추천 ${b.name}` : ''; })()}</span></div>
      {s.staff.length === 0 && <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 6 }}>홍보는 직원이 해요. 먼저 직원을 뽑아요.</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {s.staff.map((st) => (
          <button key={st.id} style={{ ...(staff?.id === st.id ? brownBtnOn : brownBtn), fontSize: 13, textAlign: 'left' }} onClick={() => setPicked(st.id)}>
            <Face face={st.face} />{st.name}<br /><EnergyBar energy={st.energy} /><br /><TitleRibbon titleId={st.title} size="sm" /><span style={{ fontSize: 12 }} data-testid={`promo-luck-${st.id}`}>대박 {Math.round(outcomeChances(s, 'promo', st).great * 100)}%</span>
          </button>
        ))}
      </div>

      {/* 활동 목록 */}
      <div style={{ marginBottom: 4 }}><b>홍보 활동</b></div>
      {PROMOTIONS.map((d) => {
        const ok = staff !== null && canPromote(s, staff.id, d.id).ok;
        const luck = staff ? promoChances(s, staff.id, d.id) : null; // staff-luck: 시키기 전에 확률 미리 보기
        return (
          <div key={d.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div><b>{d.name}</b></div>
              <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>{effectText(d)}</div>
              {costText(d)}
              {luck && <div style={{ fontSize: 13, color: PALETTE.inkSoft }} data-testid={`promo-chance-${d.id}`}>{chanceText(luck)}</div>}
            </div>
            <button data-tut={d.id === 'flyer' ? 'promote' : undefined} style={{ ...(ok ? brownBtn : brownBtnOff), marginBottom: 0, marginRight: 0 }} disabled={!ok} onClick={() => run(d)} aria-label={`${d.name} 실행`}>실행</button>
          </div>
        );
      })}
    </div>
  );
}
