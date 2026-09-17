import { useGame, dispatch } from './store';
import { objectStats, sceneryScore, canUseItem, itemEffect, PROTECTED_TYPES, canPlant, clearCost, canClearRock, hasPickaxe, cellAt, type ObjectKind, type ComboStrength } from '../sim/index.ts';
import { objectDef, cropDef, itemDef, CROPS, COMBOS, SETS } from '../data/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { RecipeCodex } from './CraftPanel';
import { brownBtn, brownBtnOn, brownBtnOff, dangerBtn, card, PALETTE, won } from './frame';

/** 계열 이름 (아이 눈높이) */
const KIND_LABEL: Record<ObjectKind, string> = {
  seat: '자리', field: '농사', tree: '농사', wall: '담', path: '길', building: '건물', deco: '꾸미기', busstop: '정류장', gate: '대문', landmark: '랜드마크', facility: '시설',
};
const ARROW: Record<ComboStrength, string> = { up: '↑', upup: '↑↑', down: '↓', none: '✦' };
const TARGET_LABEL: Record<string, string> = { all: '모두', female: '여성 손님', male: '남성 손님', youth: '젊은 손님', adult: '어른 손님', senior: '삼춘', group: '단체 손님' };

function Stat({ icon, label, value, good }: { icon?: string; label: string; value: string; good?: boolean }) {
  return (
    <span style={{ display: 'inline-block', marginRight: 10, whiteSpace: 'nowrap' }}>
      {icon && <Icon name={icon} />} {label} <b style={{ color: good === undefined ? PALETTE.ink : good ? PALETTE.ok : PALETTE.bad }}>{value}</b>
    </span>
  );
}

/** 바위·큰 바위·곶자왈 덤불 칸: 치우기 + 비용 (곡괭이가 있으면 무료) */
export function RockPanel({ x, y }: { x: number; y: number }) {
  const s = useGame();
  const cost = clearCost(s, x, y);
  if (cost === null) return null;
  const terrain = cellAt(s, x, y).terrain;
  const name = terrain === 'rock_big' ? '큰 바위' : terrain === 'rock' ? '바위' : '곶자왈 덤불';
  const can = canClearRock(s, x, y);
  const free = hasPickaxe(s);
  const desc = terrain === 'rock_big' ? '오름 능선의 큰 바위예요. 치우려면 힘이 많이 들어요.' : terrain === 'rock' ? '길을 막는 돌멩이. 치우면 흙 칸이 돼요.' : '가시덤불이에요. 치우면 흙 칸이 돼요.';
  return (
    <div data-testid="rock-panel">
      <div style={{ marginBottom: 2 }}><b>{name}</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>· 지형 ({x},{y})</span></div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 6 }}>{desc}</div>
      <button style={can.ok ? brownBtnOn : brownBtnOff} disabled={!can.ok} onClick={() => dispatch({ type: 'clearRock', x, y })}>
        <Icon name="remove" /> 치우기 ({free ? '곡괭이 1개' : won(cost)}){!can.ok && can.reason && ` · ${can.reason}`}
      </button>
    </div>
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
    Confirm(`${it.name}을(를) 써서 모든 ${d.name}의 ${it.stat === 'popularity' ? '인기' : '요금'}을 +${eff}${it.stat === 'feePct' ? '%' : ''} 올릴까요? (아이템 1개를 써요)`, () => dispatch({ type: 'useItem', itemId, objectType: o.type }), { title: '아이템 사용' });
  };
  return (
    <div>
      <div style={{ marginBottom: 2 }}>
        <b>{d.name}</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>· {KIND_LABEL[d.kind]}</span>
        {o.crop && ` · ${cropDef(o.crop.cropId).name} ${o.crop.daysGrown}일째 (익으면 창고로)`}
      </div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>{d.desc ?? d.effectText ?? `${d.name}이에요`}</div>
      <div style={{ fontSize: 14, marginBottom: 4, lineHeight: 1.7 }}>
        <Stat icon="tourist" label="인기" value={`${st.popularity}`} good={st.popularity > 10 ? true : st.popularity < 10 ? false : undefined} />
        <Stat label="경치" value={`${st.scenery > 0 ? '+' : ''}${st.scenery}`} />
        <Stat label="주변 경치" value={`${around}`} />
        <Stat icon="money" label="요금" value={`${st.feePct}%`} good={st.feePct > 100 ? true : st.feePct < 100 ? false : undefined} />
        <Stat label="유지비" value={`${won(st.upkeep)}/달`} />
        {st.noise > 0 && <Stat label="소음" value={`${st.noise}`} good={false} />}
      </div>

      {st.combos.length > 0 && (
        <div style={{ ...card, padding: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>발동 중인 상성</div>
          {st.combos.map((c) => (
            <div key={c.id} style={{ fontSize: 14 }}>
              <b style={{ color: c.strength === 'down' ? PALETTE.bad : PALETTE.ok }}>{ARROW[c.strength]}</b> {c.name}
              {c.target !== 'all' && <span style={{ fontSize: 12, color: PALETTE.inkSoft }}> · {TARGET_LABEL[c.target]}</span>}
              {c.hidden && <span style={{ fontSize: 12, color: PALETTE.title }}> · 숨은 상성!</span>}
            </div>
          ))}
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
      {usable.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {usable.map(([id, n]) => (
            <button key={id} style={brownBtnOn} onClick={() => useIt(id)}>
              <Icon name="unlock" /> {itemDef(id).name} 쓰기 ({n}개)
            </button>
          ))}
        </div>
      )}

      {d.kind === 'field' && !o.crop && CROPS.filter((c) => s.unlocked.crops.includes(c.id) && c.plantMonths.length > 0).map((c) => {
        const can = canPlant(s, o.id, c.id);
        return (
          <button key={c.id} style={can.ok ? brownBtn : brownBtnOff} disabled={!can.ok} onClick={() => dispatch({ type: 'plant', objectId: o.id, cropId: c.id })}>
            <Icon name="plant" /> {c.name} 심기{!can.ok && can.reason && ` (${can.reason})`}
          </button>
        );
      })}
      {o.type === 'bush_wild' && <RockPanel x={o.x} y={o.y} />}
      {!PROTECTED_TYPES.has(o.type) && o.type !== 'bush_wild' && (
        <button style={dangerBtn} onClick={() => dispatch({ type: 'remove', objectId: o.id })}><Icon name="remove" /> 치우기 ({d.removeCost ? `${won(d.removeCost)} 들어요` : `${won(d.cost)} 돌려받음`})</button>
      )}
    </div>
  );
}

/** 이름을 모르는 오브젝트 id도 안전하게 (v2 표에는 아직 없는 시설이 섞일 수 있다) */
function nameOf(objectId: string): string {
  try { return objectDef(objectId).name; } catch { return objectId; }
}

/** 상성·세트 도감: 찾은 것은 이름, 숨은 상성은 발견 전까지 ??? */
export function CodexPanel() {
  const s = useGame();
  const found = new Set(s.codex.combos);
  const doneSets = new Set(s.codex.sets);
  return (
    <div style={{ fontSize: 14 }}>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>
        상성 도감 {found.size}/{COMBOS.length} · 시설을 2칸 안에 나란히 두면 발동해요
      </div>
      {COMBOS.map((c) => {
        const known = !c.hidden || found.has(c.id);
        return (
          <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', opacity: known ? 1 : 0.6 }}>
            <span style={{ width: 18, textAlign: 'center' }}>{found.has(c.id) ? '✓' : ' '}</span>
            <b style={{ color: c.strength === 'down' ? PALETTE.bad : PALETTE.ok }}>{ARROW[c.strength]}</b>
            <span>{known ? c.name : '???'}</span>
            <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>
              {known ? `${nameOf(c.a)} + ${c.bIds.map(nameOf).join('/')}${c.bCount > 1 ? ` ×${c.bCount}` : ''}` : '숨은 상성'}
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '8px 0 4px' }}>
        세트 도감 {doneSets.size}/{SETS.length} · 반경 3칸 안에 다 모으면 완성, 2배·3배면 레벨 업
      </div>
      {SETS.map((x) => (
        <div key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ width: 18, textAlign: 'center' }}>{doneSets.has(x.id) ? '★' : ' '}</span>
          <span>{x.name}</span>
          <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{x.requires.map((r) => `${nameOf(r.objectId)} ${r.count}`).join(' · ')} → {TARGET_LABEL[x.target]}</span>
        </div>
      ))}
      <RecipeCodex />
    </div>
  );
}
