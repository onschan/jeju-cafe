import { useState, useMemo, type ReactNode } from 'react';
import { useGame, dispatch } from './store';
import {
  menuOf, menuMod, menuStatsOf, menuSkills, skillEffects, skillTier, priceOf, activeIngredientCombos, comboBonus, matchHiddenRecipe,
  normalizeParams, successRate, bonusWidth, developStaffStat, developCost, canDevelop, developDaysLeft, autoMenuName, qualityOf, countIngredients,
  canAddTopping, canRemoveTopping, canLevelUpMenu, levelUpMenuCost, maxSlots, isStaffBusy, isCustomMenu, hasMenuStaff, menuRequirementText, isMenuAvailable,
  DEVELOP_DAYS, DEVELOP_RESEARCH, BASE_NAME, BASE_MIN, PARAM_AXES, PARAM_LABEL, PARAM_DEFAULT, BASE_STAT, MENU_SKILLS, TIER_NAMES, MAX_TOPPINGS, MAX_MENU_LEVEL, SIGNATURE_STAR, P_GREAT,
  josa, type MenuBase, type BrewParams, type ParamAxis, type MenuStats, type MenuSkill,
} from '../sim/index.ts';
import { INGREDIENTS, TOPPINGS, HIDDEN_RECIPES, INGREDIENT_COMBOS, ingredientDef, toppingDef, ingredientComboDef, ingredientStats, addStats, MENU_STAT_KEYS, MENU_STAT_LABEL, INGREDIENT_CATEGORY_NAME } from '../data/index.ts';
import { Icon } from './Icon';
import { Confirm, Popup } from './Popup';
import { Bar } from './StaffPanel';
import { card, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, brownSelect, PALETTE, won } from './frame';

const BASES: MenuBase[] = ['drink', 'dessert', 'meal', 'signature'];
const STAT_MAX = 40;
const STAT_COLOR: Record<keyof MenuStats, string> = { taste: '#e0713a', aroma: '#9b59b6', look: '#e0a24c', health: '#4c9a2a', volume: '#5a7fbf', jeju: '#f28e2b' };
const STAFF_STAT_NAME = { sense: '감각', cooking: '요리' } as const;

/** 스탯 6줄 막대 */
export function StatBars({ stats, max = STAT_MAX, compact }: { stats: MenuStats; max?: number; compact?: boolean }) {
  return (
    <div data-testid="stat-bars" style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, auto 1fr auto)' : 'auto 1fr auto', columnGap: 6, rowGap: 2, alignItems: 'center', fontSize: 13 }}>
      {MENU_STAT_KEYS.map((k) => (
        <span key={k} style={{ display: 'contents' }}>
          <span>{MENU_STAT_LABEL[k]}</span>
          <Bar value={stats[k]} max={max} color={STAT_COLOR[k]} width={compact ? 50 : 100} />
          <b style={{ color: stats[k] < 0 ? PALETTE.bad : PALETTE.ink }}>{stats[k]}</b>
        </span>
      ))}
    </div>
  );
}

function statText(stats: Partial<MenuStats>): string {
  return MENU_STAT_KEYS.filter((k) => (stats[k] ?? 0) !== 0).map((k) => `${MENU_STAT_LABEL[k]} ${stats[k]! > 0 ? '+' : ''}${stats[k]}`).join(' ');
}

/** 메뉴 개발 (더보기 → 메뉴 개발): 베이스 → 재료 4칸 → 파라미터 → 직원 → 개발 시작. 진행 중이면 진행 카드. */
export function CraftPanel() {
  const s = useGame();
  const [base, setBase] = useState<MenuBase>('drink');
  const [picked, setPicked] = useState<string[]>([]);
  const [params, setParams] = useState<BrewParams>({});
  const [staffId, setStaffId] = useState<string>(s.staff.find((st) => !isStaffBusy(s, st.id))?.id ?? '');
  const slots = maxSlots(s);
  const ingredients = picked.slice(0, slots);
  const norm = normalizeParams(base, params);
  const staff = s.staff.find((st) => st.id === staffId);
  const stat = developStaffStat(staff, base);
  const rate = successRate(base, norm, stat);
  const width = bonusWidth(base, norm);
  const combos = useMemo(() => activeIngredientCombos(ingredients), [ingredients.join(',')]);
  const preview = useMemo(() => addStats(ingredientStats(countIngredients(ingredients)), comboBonus(combos).stats), [ingredients.join(','), combos.join(',')]);
  const hidden = matchHiddenRecipe(ingredients);
  const can = canDevelop(s, base, ingredients, staffId);
  const cost = developCost(ingredients);
  const available = INGREDIENTS.filter((i) => i.kind === 'bought' || (s.storage[i.id] ?? 0) > 0);

  if (s.developing) {
    const d = s.developing;
    const left = developDaysLeft(s);
    return (
      <div data-testid="craft-progress" style={{ ...card }}>
        <div><b>{BASE_NAME[d.base]} 개발 중</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>{d.ingredients.map((i) => ingredientDef(i).name).join(' + ')}</span></div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          <Bar value={DEVELOP_DAYS - left} max={DEVELOP_DAYS} width={140} /> {left > 0 ? `${left}일 남음` : '오늘 완성!'}
        </div>
        <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 4 }}>담당 {s.staff.find((st) => st.id === d.staffId)?.name ?? '?'} · 그동안 자리를 비워요</div>
      </div>
    );
  }

  const addIngredient = (id: string) => { if (ingredients.length < slots) setPicked([...ingredients, id]); };
  const removeAt = (i: number) => setPicked(ingredients.filter((_, j) => j !== i));
  const start = () => {
    const name = hidden ? '???' : autoMenuName(base, ingredients);
    Confirm(`${josa(name, '을/를')} ${DEVELOP_DAYS}일 동안 개발할까요? 연구 ${DEVELOP_RESEARCH} · 재료비 ${won(cost)} · 성공 ${Math.round(rate)}%`, () => {
      if (dispatch({ type: 'develop', base, ingredients, params: norm, staffId }).ok) setPicked([]);
    }, { title: '메뉴 개발' });
  };

  return (
    <div data-testid="craft-panel">
      <div style={{ marginBottom: 4 }}><b>베이스</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>재료 {BASE_MIN[base]}~{slots}개 · 연구 {DEVELOP_RESEARCH}</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {BASES.map((b) => {
          const locked = b === 'signature' && s.star < SIGNATURE_STAR;
          return (
            <button key={b} aria-label={`베이스 ${BASE_NAME[b]}`} disabled={locked} style={{ ...(base === b ? brownBtnOn : locked ? brownBtnOff : brownBtn), padding: '0 10px' }} onClick={() => { setBase(b); setParams({}); }}>
              {BASE_NAME[b]}{locked ? ` ★${SIGNATURE_STAR}` : ''}
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 4 }}><b>재료</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>칸을 누르면 빼요</span></div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }} data-testid="craft-slots">
        {Array.from({ length: slots }, (_, i) => {
          const id = ingredients[i];
          return (
            <button key={i} aria-label={`재료 칸 ${i + 1}`} onClick={() => id && removeAt(i)}
              style={{ ...(id ? brownBtnOn : brownBtnOff), minWidth: 60, marginRight: 0, marginBottom: 0, padding: '0 8px' }}>
              {id ? ingredientDef(id).name : `${i + 1}`}
            </button>
          );
        })}
      </div>
      <div style={{ maxHeight: 160, overflowY: 'auto', ...card, padding: 4 }}>
        {available.map((i) => {
          const disabled = ingredients.length >= slots;
          const stock = i.kind === 'farm' ? ` 창고 ${s.storage[i.id] ?? 0}` : ` ${won(i.cost)}`;
          return (
            <button key={i.id} aria-label={`재료 ${i.name}`} disabled={disabled} title={statText(i.stats)}
              style={{ ...(disabled ? brownBtnOff : brownBtn), fontSize: 13, padding: '0 8px', minHeight: 36, marginRight: 4, marginBottom: 4 }} onClick={() => addIngredient(i.id)}>
              {i.name} <span style={{ fontSize: 11, opacity: 0.85 }}>{INGREDIENT_CATEGORY_NAME[i.category]}{stock}</span>
            </button>
          );
        })}
        <div style={{ fontSize: 12, color: PALETTE.inkSoft }}>밭·해녀·투자로 얻는 재료는 창고에 있어야 골라져요</div>
      </div>

      {ingredients.length > 0 && (
        <div style={{ ...card, padding: 6 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            <b>{hidden ? '??? (뭔가 특별한 조합!)' : autoMenuName(base, ingredients)}</b> · 재료비 {won(cost)} · 예상 {qualityOf(preview)}
          </div>
          <StatBars stats={preview} compact />
          <div style={{ fontSize: 13, marginTop: 4 }}>
            콤보: {combos.length > 0 ? combos.map((c) => { const d = ingredientComboDef(c); return `${d.name}(${d.bonusText})`; }).join(' · ') : <span style={{ color: PALETTE.inkSoft }}>없음 — 다른 분류끼리 섞어 보세요</span>}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 4 }}><b>파라미터</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>기본에서 벗어나면 성공률 ↓ 보너스 ↑</span></div>
      {PARAM_AXES[base].map((ax: ParamAxis) => (
        <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <span style={{ width: 52, fontSize: 13 }}>{PARAM_LABEL[ax].name}</span>
          {PARAM_LABEL[ax].levels.map((label, lv) => (
            <button key={lv} aria-label={`${PARAM_LABEL[ax].name} ${label}`} onClick={() => setParams({ ...params, [ax]: lv })}
              style={{ ...((norm[ax] ?? PARAM_DEFAULT) === lv ? brownBtnOn : brownBtn), minHeight: 36, padding: '0 10px', marginBottom: 0, marginRight: 4, fontSize: 13, outline: lv === PARAM_DEFAULT ? `2px dashed ${PALETTE.woodLight}` : undefined }}>
              {label}
            </button>
          ))}
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
        <b>담당</b>
        <select aria-label="담당 직원" value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...brownSelect, marginBottom: 0, flex: 1 }}>
          <option value="">(직원을 고르세요)</option>
          {s.staff.map((st) => <option key={st.id} value={st.id} disabled={isStaffBusy(s, st.id)}>{st.name} · {STAFF_STAT_NAME[BASE_STAT[base]]} {st.stats[BASE_STAT[base]]}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        성공 <b style={{ color: PALETTE.ok }}>{Math.round(rate)}%</b> · 대성공 <b>{P_GREAT}%</b> · 실패 <b style={{ color: PALETTE.bad }}>{Math.round(100 - P_GREAT - rate)}%</b> · 보너스 폭 +{width}
      </div>
      <button data-testid="craft-start" style={can.ok ? brownBtnOn : brownBtnOff} disabled={!can.ok} onClick={start}><Icon name="research" /> 개발 시작</button>
      {!can.ok && <span style={{ fontSize: 13, color: PALETTE.bad }}>{can.reason}</span>}
    </div>
  );
}

/** 개발 결과 팝업 (App에 한 번 둔다). state.lastDevelop이 있으면 뜬다. */
export function DevelopResultPopup() {
  const s = useGame();
  const r = s.lastDevelop;
  if (!r) return null;
  const close = () => dispatch({ type: 'dismissDevelop' });
  const title = r.outcome === 'great' ? '대성공!' : r.outcome === 'success' ? '개발 성공' : '개발 실패…';
  return (
    <Popup title={title} onBackdrop={close} buttons={<button style={brownBtn} onClick={close} data-testid="develop-close">확인</button>}>
      <div data-testid="develop-result">
        <div style={{ fontSize: 18, fontWeight: 700 }}>{r.hidden ? '★ ' : ''}{r.name}</div>
        <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 6 }}>
          {BASE_NAME[r.base]}{r.quality ? ` · ${r.quality}` : ''}{r.hidden ? ' · 히든 레시피 발견!' : ''}
        </div>
        <StatBars stats={r.stats} />
        {r.combos.length > 0 && <div style={{ fontSize: 13, marginTop: 6 }}>콤보: {r.combos.map((c) => ingredientComboDef(c).name).join(' · ')}</div>}
        {r.outcome === 'fail' && <div style={{ fontSize: 13, marginTop: 6, color: PALETTE.bad }}>재료는 못 건졌어요. 파라미터를 기본에 가깝게 하면 성공률이 올라요.</div>}
        {r.menuId && <div style={{ fontSize: 13, marginTop: 6 }}>메뉴판에 올리면 팔 수 있어요 (판매가 {won(priceOf(s, r.menuId))})</div>}
      </div>
    </Popup>
  );
}

/** 메뉴 상세 (메뉴판 아래): 스탯·스킬·토핑 추가/제거·레벨업 */
export function MenuDetail({ menuId }: { menuId: string }) {
  const s = useGame();
  const def = menuOf(s, menuId);
  const mod = menuMod(s, menuId);
  const stats = menuStatsOf(s, menuId);
  const skills = menuSkills(s, menuId);
  const eff = skillEffects(s, menuId);
  const lvCost = levelUpMenuCost(s, menuId);
  const canLv = canLevelUpMenu(s, menuId);
  const req = hasMenuStaff(s, menuId) ? null : menuRequirementText(menuId, s);
  const effectLines: string[] = [];
  if (eff.pricePct) effectLines.push(`판매가 +${eff.pricePct}%`);
  if (eff.costPct) effectLines.push(`재료비 −${eff.costPct}%`);
  if (eff.seatPct) effectLines.push(`식사 시간 −${eff.seatPct}%`);
  if (eff.dignityPct) effectLines.push(`손님 방문 +${eff.dignityPct}%`);
  if (eff.photoPct) effectLines.push(`사진 확률 +${eff.photoPct}%`);
  if (eff.healthEval) effectLines.push(`한 달 살기·가족 평가 +${eff.healthEval}`);
  if (eff.heartyEval) effectLines.push(`올레꾼·삼춘 평가 +${eff.heartyEval}`);
  return (
    <div data-testid="menu-detail" style={{ ...card, padding: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 16 }}>{def.name}</b>
        <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>Lv{mod.level} · {won(priceOf(s, menuId))}{def.quality ? ` · ${def.quality}` : ''}{isCustomMenu(s, menuId) ? ' · 개발 메뉴' : ''}</span>
        {req && <span style={{ fontSize: 13, color: PALETTE.bad }}>{req}</span>}
      </div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>
        재료: {Object.entries(def.ingredients).map(([id, n]) => `${ingredientDef(id).name}${n > 1 ? ` ×${n}` : ''}`).join(' · ')}
      </div>
      <StatBars stats={stats} compact />
      <div style={{ fontSize: 13, marginTop: 4 }}>
        스킬: {MENU_SKILLS.filter((k) => (skills[k] ?? 0) > 0).map((k: MenuSkill) => `${k} ${skills[k]} (${TIER_NAMES[skillTier(skills[k]!)]})`).join(' · ') || <span style={{ color: PALETTE.inkSoft }}>없음 — 토핑으로 쌓아요</span>}
        {effectLines.length > 0 && <div style={{ color: PALETTE.ok }}>{effectLines.join(' · ')}</div>}
      </div>

      <div style={{ marginTop: 6, fontSize: 13 }}><b>토핑</b> {mod.toppings.length}/{MAX_TOPPINGS} <span style={{ color: PALETTE.inkSoft }}>원가는 팔 때마다 재료비에 더해져요</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {mod.toppings.map((t) => (
          <button key={t} aria-label={`토핑 빼기 ${toppingDef(t).name}`} style={{ ...dangerBtn, minHeight: 36, fontSize: 13, padding: '0 8px' }} disabled={!canRemoveTopping(s, menuId, t).ok}
            onClick={() => dispatch({ type: 'removeTopping', menuId, toppingId: t })}>✗ {toppingDef(t).name}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {TOPPINGS.filter((t) => !mod.toppings.includes(t.id)).map((t) => {
          const ok = canAddTopping(s, menuId, t.id).ok;
          return (
            <button key={t.id} aria-label={`토핑 추가 ${t.name}`} disabled={!ok} title={`${statText(t.stats)} · ${t.skillText}`}
              style={{ ...(ok ? brownBtn : brownBtnOff), minHeight: 36, fontSize: 13, padding: '0 8px', marginRight: 4, marginBottom: 4 }}
              onClick={() => dispatch({ type: 'addTopping', menuId, toppingId: t.id })}>
              + {t.name} <span style={{ fontSize: 11, opacity: 0.85 }}>{t.cost > 0 ? won(t.cost) : '밭'} · {t.skillText}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        <button aria-label="메뉴 레벨업" style={canLv.ok ? brownBtnOn : brownBtnOff} disabled={!canLv.ok}
          onClick={() => Confirm(`${josa(def.name, '을/를')} Lv${mod.level + 1}로 올릴까요? 판매가 +10%, 더 잘 팔려요. 비용 ${won(lvCost.money)}${Object.keys(lvCost.ingredients).length > 0 ? ' + ' + Object.entries(lvCost.ingredients).map(([id, n]) => `${ingredientDef(id).name} ${n}`).join('·') : ''}`, () => dispatch({ type: 'levelUpMenu', menuId }), { title: '메뉴 레벨업' })}>
          <Icon name="unlock" /> 레벨업 {mod.level >= MAX_MENU_LEVEL ? '(최고)' : won(lvCost.money)}
        </button>
        {!canLv.ok && mod.level < MAX_MENU_LEVEL && <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>{canLv.reason}</span>}
      </div>
    </div>
  );
}

/** 메뉴 도감: 재료 콤보 20 + 히든 레시피 10 (찾기 전엔 ???) */
export function RecipeCodex() {
  const s = useGame();
  const found = new Set(s.codex.recipes);
  const combos = new Set(s.codex.ingredientCombos);
  return (
    <div style={{ fontSize: 14 }}>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '8px 0 4px' }}>
        히든 레시피 {found.size}/{HIDDEN_RECIPES.length} · 딱 맞는 재료 조합으로 개발하면 발견돼요
      </div>
      {HIDDEN_RECIPES.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', opacity: found.has(r.id) ? 1 : 0.6 }} data-testid={`recipe-${r.id}`}>
          <span style={{ width: 18, textAlign: 'center' }}>{found.has(r.id) ? '★' : ' '}</span>
          <span>{found.has(r.id) ? r.name : '???'}</span>
          <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{found.has(r.id) ? r.ingredients.map((i) => ingredientDef(i).name).join(' + ') : `재료 ${r.ingredients.length}개`}</span>
        </div>
      ))}
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '8px 0 4px' }}>
        재료 콤보 {combos.size}/{INGREDIENT_COMBOS.length} · 다른 분류의 재료를 섞으면 발동 (같은 재료끼리는 안 돼요)
      </div>
      {INGREDIENT_COMBOS.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ width: 18, textAlign: 'center' }}>{combos.has(c.id) ? '✓' : ' '}</span>
          <span>{c.name}</span>
          <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{c.pairText} → {c.bonusText}</span>
        </div>
      ))}
    </div>
  );
}

/** 메뉴판 슬롯 아래에 두는 상세 선택 줄 */
export function MenuDetailPicker({ children }: { children?: ReactNode }) {
  const s = useGame();
  const [sel, setSel] = useState<string>(s.menuSlots.find((m): m is string => m !== null) ?? s.unlocked.menus[0] ?? '');
  const menus = s.unlocked.menus;
  const cur = menus.includes(sel) ? sel : menus[0] ?? '';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <b>메뉴 상세</b>
        <select aria-label="상세 메뉴" value={cur} onChange={(e) => setSel(e.target.value)} style={{ ...brownSelect, marginBottom: 0, flex: 1 }}>
          {menus.map((m) => <option key={m} value={m}>{menuOf(s, m).name} {isMenuAvailable(s, m) ? '' : '·'}</option>)}
        </select>
        {children}
      </div>
      {cur && <MenuDetail menuId={cur} />}
    </div>
  );
}
