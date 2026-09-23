import { useGame, dispatch } from './store';
import { wonText } from '../data/labels.ts';
import { objectStats, sceneryScore, canUseItem, itemEffect, PROTECTED_TYPES, type ObjectKind, buildDaysLeft, josa } from '../sim/index.ts';
import { objectDef, itemDef, SETS } from '../data/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { RecipeCodex } from './CraftPanel';
import { TitleCodex } from './TitleCodex'; // staff-luck 칭호 도감
import { CornerCodex } from './CornerCodex';
import { brownBtn, brownBtnOn, brownBtnOff, dangerBtn, card, PALETTE } from './frame';

/** 계열 이름 (아이 눈높이) */
const KIND_LABEL: Record<ObjectKind, string> = {
  seat: '자리', tree: '농원', wall: '담', path: '길', building: '건물', deco: '꾸미기', busstop: '정류장', gate: '대문', landmark: '랜드마크', facility: '시설',
};
const TARGET_LABEL: Record<string, string> = { all: '모두', female: '여성 손님', male: '남성 손님', youth: '젊은 손님', adult: '어른 손님', senior: '삼춘', group: '단체 손님' };

function Stat({ icon, label, value, good }: { icon?: string; label: string; value: string; good?: boolean }) {
  return (
    <span style={{ display: 'inline-block', marginRight: 10, whiteSpace: 'nowrap' }}>
      {icon && <Icon name={icon} />} {label} <b style={{ color: good === undefined ? PALETTE.ink : good ? PALETTE.ok : PALETTE.bad }}>{value}</b>
    </span>
  );
}

/** 칸을 눌렀을 때 보이는 오브젝트 정보: 인기·경치·요금·유지비·계열·설명·상성·세트·아이템 사용·심기/치우기 (수확은 자동) */
export function ObjectInfoPanel({ objectId }: { objectId: string }) {
  const s = useGame();
  const o = s.objects[objectId];
  if (!o) return null;
  const d = objectDef(o.type);
  const st = objectStats(s, o.id);
  const around = sceneryScore(s, o.x, o.y);
  const usable = Object.entries(s.inventory).filter(([id, n]) => n > 0 && canUseItem(s, id, o.type).ok);
  const useIt = (itemId: string) => {
    const it = itemDef(itemId);
    const eff = itemEffect(it, d);
    Confirm(`${josa(it.name, '을/를')} 써서 모든 ${d.name}의 ${josa(it.stat === 'popularity' ? '인기' : it.stat === 'scenery' ? '경관' : '요금', '을/를')} +${eff}${it.stat === 'feePct' ? '%' : ''} 올릴까요? (아이템 1개를 써요)`, () => dispatch({ type: 'useItem', itemId, objectType: o.type }), { title: '아이템 사용' });
  };
  return (
    <div>
      <div style={{ marginBottom: 2 }}>
        <b>{d.name}</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>· {KIND_LABEL[d.kind]}</span>
      </div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>{d.desc ?? d.effectText ?? josa(d.name, '이에요/예요')}</div>
      {o.build && <div style={{ fontSize: 14, color: PALETTE.title, marginBottom: 4 }} data-testid="building"><Icon name="build" size={14} /> 짓는 중 — 완공까지 {buildDaysLeft(s, o)}일 (일꾼 삼춘이 일하고 있어요)</div>}
      <div style={{ fontSize: 14, marginBottom: 4, lineHeight: 1.7 }}>
        <Stat icon="tourist" label="인기" value={`${st.popularity}`} good={st.popularity > 10 ? true : st.popularity < 10 ? false : undefined} />
        <Stat label="경치" value={`${st.scenery > 0 ? '+' : ''}${st.scenery}`} />
        <Stat label="주변 경치" value={`${around}`} />
        <Stat icon="money" label="요금" value={`${st.feePct}%`} good={st.feePct > 100 ? true : st.feePct < 100 ? false : undefined} />
        <Stat label="유지비" value={`${wonText(st.upkeep)}/달`} />
        {st.noise > 0 && <Stat label="소음" value={`${st.noise}`} good={false} />}
      </div>

      {(st.corner.pop > 0 || st.corner.feePct > 0) && (
        <div style={{ ...card, padding: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>가까운 명당 덕</div>
          <div style={{ fontSize: 14 }}><b style={{ color: PALETTE.ok }}>인기 +{st.corner.pop}</b> · 요금 +{st.corner.feePct}%</div>
        </div>
      )}
      {st.sets.length > 0 && (
        <div style={{ ...card, padding: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>세트 효과</div>
          {st.sets.map((x) => (
            <div key={x.id} style={{ fontSize: 14 }}>★ {x.name} <b>Lv{x.level}</b> <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>· {TARGET_LABEL[x.target]} 인기 ×{x.mult}</span></div>
          ))}
        </div>
      )}
      {s.itemBonus[o.type] && (s.itemBonus[o.type]!.popularity > 0 || s.itemBonus[o.type]!.feePct > 0) && (
        <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>
          아이템 보너스: 인기 +{s.itemBonus[o.type]!.popularity}{s.itemBonus[o.type]!.feePct > 0 && ` · 요금 +${s.itemBonus[o.type]!.feePct}%`}
        </div>
      )}
      {!PROTECTED_TYPES.has(o.type) && (
        <button style={dangerBtn} onClick={() => dispatch({ type: 'remove', objectId: o.id })}><Icon name="remove" /> 치우기 ({d.removeCost ? `${wonText(d.removeCost)} 들어요` : `${wonText(d.cost)} 돌려받음`})</button>
      )}
      {/* 아이템은 심기·치우기 아래에 — 아이템이 10개를 넘으면 기본 동작이 화면 밖으로 밀려난다 */}
      {usable.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 2 }}>강화 아이템 쓰기</div>
          {usable.map(([id, n]) => (
            <button key={id} style={brownBtnOn} onClick={() => useIt(id)}>
              <Icon name="unlock" /> {itemDef(id).name} 쓰기 ({n}개)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 이름을 모르는 오브젝트 id도 안전하게 (v2 표에는 아직 없는 시설이 섞일 수 있다) */
function nameOf(objectId: string): string {
  try { return objectDef(objectId).name; } catch { return objectId; }
}

/** 세트·명당·레시피 도감 */
export function CodexPanel() {
  const s = useGame();
  const doneSets = new Set(s.codex.sets);
  return (
    <div style={{ fontSize: 14 }}>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '0 0 4px' }}>
        세트 도감 {doneSets.size}/{SETS.length} · 반경 3칸 안에 다 모으면 완성, 2배·3배면 레벨 업
      </div>
      {SETS.map((x) => (
        <div key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ width: 18, textAlign: 'center' }}>{doneSets.has(x.id) ? '★' : ' '}</span>
          <span>{x.name}</span>
          <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{x.requires.map((r) => `${nameOf(r.objectId)} ${r.count}`).join(' · ')} → {TARGET_LABEL[x.target]}</span>
        </div>
      ))}
      <CornerCodex />
      <RecipeCodex />
      <TitleCodex />
    </div>
  );
}
