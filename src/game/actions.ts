import type { GameState, Action, ApplyResult } from './types.ts';
import { facilityDef, isFloorDef } from './data.ts';
import { placeAndBurst, removeFacility } from './facility.ts';
import { canLayFloor, layFloor, clearFloor, lineCells, cellAt, inBounds } from './world.ts';
import { canUnlock, unlock } from './research.ts';
import { canHire, hire } from './staff.ts';
import { canInvest, invest } from './invest.ts';
import { checkObjectives } from './objectives.ts';

export function apply(s: GameState, a: Action): ApplyResult {
  const r = applyInner(s, a);
  if (r.ok) { if (a.type !== 'setSpeed') s.log.push({ tick: s.tick, action: a }); checkObjectives(s); }
  return r;
}
function applyInner(s: GameState, a: Action): ApplyResult {
  switch (a.type) {
    case 'place': {
      if (!s.unlocked.facilities.includes(a.id)) return { ok: false, reason: '아직 연구가 안 됐어요' };
      return placeAndBurst(s, a.id, a.x, a.y);
    }
    case 'placeLine': {
      const d = facilityDef(a.id);
      if (!isFloorDef(d)) return { ok: false, reason: '바닥만 줄로 깔아요' };
      const cells = lineCells(a.from, a.to).filter((p) => canLayFloor(s, d.floor!, p.x, p.y).ok);
      if (cells.length === 0) return { ok: false, reason: '깔 칸이 없어요' };
      const cost = cells.length * d.cost;
      if (s.money < cost) return { ok: false, reason: `₩${cost.toLocaleString('en-US')} 필요` };
      s.money -= cost; s.month.spent += cost;
      for (const p of cells) layFloor(s, d.floor!, p.x, p.y);
      return { ok: true };
    }
    case 'remove': {
      const f = s.facilities[a.facilityId];
      if (!f) return { ok: false, reason: '없어진 시설이에요' };
      const r = removeFacility(s, a.facilityId);
      if (r.ok) s.money += Math.round(facilityDef(f.type).cost / 2); // 반값 환불
      return r;
    }
    case 'removeFloor': {
      if (!inBounds(s, a.x, a.y) || s.guests.some((g) => Math.round(g.x) === a.x && Math.round(g.y) === a.y)) return { ok: false, reason: '손님이 서 있어요' };
      const c = cellAt(s, a.x, a.y);
      const r = clearFloor(s, a.x, a.y);
      if (r.ok) s.money += c.floor === null ? 0 : 5000;
      return r;
    }
    case 'rename': { const f = s.facilities[a.facilityId]; if (!f) return { ok: false, reason: '없어진 시설이에요' }; f.name = a.name.slice(0, 12); return { ok: true }; }
    case 'unlock': { const c = canUnlock(s, a.id); if (!c.ok) return c; unlock(s, a.id); return { ok: true }; }
    case 'setMenu': {
      if (!s.unlocked.menus.includes(a.menuId)) return { ok: false, reason: '아직 연구가 안 됐어요' };
      if (a.on && !s.menu.includes(a.menuId)) { if (s.menu.length >= 5) return { ok: false, reason: '메뉴판은 5칸이에요' }; s.menu.push(a.menuId); }
      if (!a.on) { if (s.menu.length <= 1) return { ok: false, reason: '메뉴 하나는 있어야 해요' }; s.menu = s.menu.filter((m) => m !== a.menuId); }
      return { ok: true };
    }
    case 'setTarget': { if (a.guestType && !s.unlocked.guests.includes(a.guestType)) return { ok: false, reason: '아직 안 오는 손님층이에요' }; s.target = a.guestType; return { ok: true }; }
    case 'hire': { const c = canHire(s, a.candidateId); if (!c.ok) return c; hire(s, a.candidateId); return { ok: true }; }
    case 'fire': { if (!s.staff.some((x) => x.id === a.staffId)) return { ok: false, reason: '없는 직원이에요' }; s.staff = s.staff.filter((x) => x.id !== a.staffId); return { ok: true }; }
    case 'invest': { const c = canInvest(s, a.id); if (!c.ok) return c; invest(s, a.id); return { ok: true }; }
    case 'buyParcel': {
      const p = s.parcels.find((x) => x.id === a.id);
      if (!p) return { ok: false, reason: '없는 땅이에요' };
      if (p.owned) return { ok: false, reason: '이미 내 땅이에요' };
      const adjacent = s.parcels.some((q) => q.owned && ((Math.abs(q.x - p.x) === p.w && q.y === p.y) || (Math.abs(q.y - p.y) === p.h && q.x === p.x)));
      if (!adjacent) return { ok: false, reason: '내 땅과 붙어 있어야 해요' };
      if (s.money < p.price) return { ok: false, reason: '돈이 모자라요' };
      s.money -= p.price; s.month.spent += p.price; p.owned = true;
      s.fx.push({ kind: 'notice', text: `${p.name}을 샀어요` });
      return { ok: true };
    }
    case 'setSpeed': s.clock.speed = a.speed; return { ok: true };
  }
}
