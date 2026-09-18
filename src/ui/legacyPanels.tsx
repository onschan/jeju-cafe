import { useState } from 'react';
import { useGame, dispatch } from './store';
import { isMenuAvailable, hasMenuStaff, menuRequirementText, placeCost, menuOf, priceOf, MENU_SLOT_COUNT } from '../sim/index.ts';
import { objectDef, cropDef, ingredientDef, BUILD_GROUPS, buildGroupOf, FACILITIES, type BuildGroup } from '../data/index.ts';
import { brownBtn, brownBtnOn, brownBtnOff, brownSelect, PALETTE, won } from './frame';

/** 옛 하단 시트(BottomSheet)에서 떼어 온 내용 컴포넌트. 전체 화면 창 안에 임시로 끼워 둔다.
 *  TODO(v3-content): 트랙 B의 src/ui/windows/{BuildWindow,MenuWindow}.tsx로 교체하고 이 파일은 지운다. */

/** 재료 있음/없음 색점 (leaf / red) */
function Dot({ ok }: { ok: boolean }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: ok ? '#6abe30' : '#e63946', marginRight: 4, verticalAlign: 'middle' }} />;
}

/** 메뉴 상태 문구: 재료 있음 / 재료 없음 / 바리스타 필요 */
function menuStatus(s: ReturnType<typeof useGame>, id: string): { ok: boolean; text: string } {
  if (!hasMenuStaff(s, id)) return { ok: false, text: menuRequirementText(id, s) ?? '직원 필요' };
  const ok = isMenuAvailable(s, id);
  return { ok, text: ok ? '재료 있음' : '재료 없음' };
}

/** 창고 항목 이름: 작물이면 작물 이름, 아니면(해녀·투자 재료) 재료 이름 */
function storageName(id: string): string {
  try { return cropDef(id).name; } catch { try { return ingredientDef(id).name; } catch { return id; } }
}

/** 메뉴판: 슬롯별 select + 재료 상태 + 창고 요약 */
export function MenuSlotsPanel({ onCraft }: { onCraft: () => void }) {
  const s = useGame();
  return (
    <div data-testid="menu-slots">
      {Array.from({ length: MENU_SLOT_COUNT }, (_, i) => {
        const cur = s.menuSlots[i] ?? null;
        const st = cur ? menuStatus(s, cur) : null;
        return (
          <div key={i} style={{ marginBottom: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', width: 28 }}>{i + 1}.</span>
            <select value={cur ?? ''} onChange={(e) => dispatch({ type: 'setSlot', slot: i, menuId: e.target.value || null })} style={brownSelect} aria-label={`메뉴 슬롯 ${i + 1}`}>
              <option value="">(비움)</option>
              {s.unlocked.menus.map((m) => {
                const req = hasMenuStaff(s, m) ? null : menuRequirementText(m, s);
                return <option key={m} value={m}>{menuOf(s, m).name} {won(priceOf(s, m))}{req ? ` · ${req}` : ''}</option>;
              })}
            </select>
            {st && <span style={{ fontSize: 13, marginBottom: 6 }}><Dot ok={st.ok} />{st.text}</span>}
          </div>
        );
      })}
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 8 }}>창고: {Object.entries(s.storage).map(([c, n]) => `${storageName(c)} ${n}`).join(' · ') || '비어 있음'}</div>
      <button style={brownBtn} onClick={onCraft} aria-label="연구 개발로">새 메뉴 개발하러 가기</button>
    </div>
  );
}

/** 짓기 카드: 누르면 고른다 (창이 닫히고 맵에 고스트) */
function BuildCard({ type, on, onPick }: { type: string; on: boolean; onPick: () => void }) {
  const s = useGame();
  const d = objectDef(type);
  const cost = placeCost(s, type);
  return (
    <button style={on ? brownBtnOn : brownBtn} onClick={onPick} data-testid={`build-${type}`}>
      {d.name} {cost > 0 ? won(cost) : ''}{d.indoor ? ' 🏠' : ''}
    </button>
  );
}

/** 짓기 목록: 카테고리 하위 탭(쉼/편의/먹거리/즐길거리/농사/경관·장식/길·담)으로 묶고, 잠긴 시설은 해금 문구와 함께 흐리게.
 *  groups로 보여 줄 카테고리를 제한한다 (시설/장식/길담 창 탭). */
export function BuildTabs({ selected, groups, onPick }: { selected: string | null; groups?: BuildGroup[]; onPick: (type: string) => void }) {
  const s = useGame();
  const [group, setGroup] = useState<BuildGroup | null>(null);
  const allowed = groups ? new Set(groups) : null;
  const unlockedByGroup: Partial<Record<BuildGroup, string[]>> = {};
  for (const t of s.unlocked.objects) (unlockedByGroup[buildGroupOf(t)] ??= []).push(t);
  const lockedByGroup: Partial<Record<BuildGroup, (typeof FACILITIES)[number][]>> = {};
  for (const f of FACILITIES) {
    if (!f.unlockText || s.unlocked.objects.includes(f.id)) continue;
    (lockedByGroup[buildGroupOf(f.id)] ??= []).push(f);
  }
  const visible = BUILD_GROUPS.filter((g) => (!allowed || allowed.has(g.key)) && (unlockedByGroup[g.key]?.length ?? 0) + (lockedByGroup[g.key]?.length ?? 0) > 0);
  const active = visible.some((g) => g.key === group) ? group! : (visible[0]?.key ?? null);
  const cards = active ? (unlockedByGroup[active] ?? []) : [];
  const locked = active ? (lockedByGroup[active] ?? []) : [];
  return (
    <div>
      {visible.length > 1 && (
        <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap' }} data-testid="build-tabs">
          {visible.map((g) => (
            <button key={g.key} style={{ ...(active === g.key ? brownBtnOn : brownBtn), padding: '0 10px', fontSize: 14 }} onClick={() => setGroup(g.key)} data-testid={`build-tab-${g.key}`}>{g.label}</button>
          ))}
        </div>
      )}
      {cards.map((t) => <BuildCard key={t} type={t} on={selected === t} onPick={() => onPick(t)} />)}
      {locked.map((f) => (
        <div key={f.id} data-testid={`build-locked-${f.id}`} style={{ ...brownBtnOff, cursor: 'default', pointerEvents: 'none', display: 'inline-block' }} aria-disabled="true">
          🔒 {f.name} · 해금: {f.unlockText}
        </div>
      ))}
      {cards.length === 0 && locked.length === 0 && <div style={{ fontSize: 14, color: PALETTE.inkSoft }}>아직 지을 수 있는 게 없어요</div>}
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 6 }}>고르면 창이 닫히고 맵에 자리가 보여요. 끌어서 옮기고 ✓로 확정해요. 🏠 = 실내(본관 안)에만</div>
    </div>
  );
}
