import type { GameState, Action, ApplyResult } from './types.ts';
import { facilityDef, isFloorDef } from './data.ts';
import { placeAndBurst, removeFacility, moveFacility } from './facility.ts';
import { canLayFloor, layFloor, clearFloor, lineCells, cellAt, inBounds, parcelAdjacent, cellEdges, getWall, setWall, wallRect, wallEdges } from './world.ts';
import { canUnlock, unlock, canLevelUp, levelUp } from './research.ts';
import { canHire, hire, canRecruit, recruit } from './staff.ts';
import { canInvest, invest } from './invest.ts';
import { checkObjectives } from './objectives.ts';
import { rooms, ROOM_KO } from './rooms.ts';

/** 배치로 방이 달라졌나 — 별이 오른 방·새로 생긴 방을 맵 위에 띄운다 */
const LAYOUT_ACTIONS = new Set(['place', 'placeLine', 'wallRect', 'wallEdges', 'removeWall', 'removeWalls', 'move', 'remove', 'clearFloor', 'levelUp']);
function roomSnapshot(s: GameState): Map<string, { stars: number; kind: string }> {
  const m = new Map<string, { stars: number; kind: string }>();
  for (const r of rooms(s)) for (const c of r.cells) m.set(`${c.x},${c.y}`, { stars: r.stars, kind: r.kind });
  return m;
}
function noteRoomChange(s: GameState, before: Map<string, { stars: number; kind: string }>): void {
  let order = 0;
  for (const r of rooms(s)) {
    const mid = r.cells[Math.floor(r.cells.length / 2)]!;
    const old = r.cells.map((c) => before.get(`${c.x},${c.y}`)).find(Boolean);
    if (!old) { s.fx.push({ kind: 'roomup', x: mid.x, y: mid.y, text: `새 방 — ${ROOM_KO[r.kind]} ${'★'.repeat(r.stars)}`, order: order++ }); continue; }
    if (old.kind !== r.kind) { s.fx.push({ kind: 'roomup', x: mid.x, y: mid.y, text: `${ROOM_KO[r.kind]}가 됐다 ${'★'.repeat(r.stars)}`, order: order++ }); continue; }
    if (r.stars > old.stars) s.fx.push({ kind: 'roomup', x: mid.x, y: mid.y, text: `${ROOM_KO[r.kind]} ★${old.stars} → ★${r.stars}`, order: order++ });
  }
}
export function apply(s: GameState, a: Action): ApplyResult {
  const watch = LAYOUT_ACTIONS.has(a.type);
  const before = watch ? roomSnapshot(s) : null;
  const r = applyInner(s, a);
  if (r.ok) {
    if (before) noteRoomChange(s, before);
    if (a.type !== 'setSpeed') s.log.push({ tick: s.tick, action: a });
    checkObjectives(s);
  }
  return r;
}
function applyInner(s: GameState, a: Action): ApplyResult {
  switch (a.type) {
    case 'place': {
      if (!s.unlocked.facilities.includes(a.id)) return { ok: false, reason: '연구 필요' };
      return placeAndBurst(s, a.id, a.x, a.y);
    }
    case 'placeLine': {
      const d = facilityDef(a.id);
      if (!isFloorDef(d)) return { ok: false, reason: '바닥만 줄로' };
      const cells = lineCells(a.from, a.to).filter((p) => canLayFloor(s, d.floor!, p.x, p.y).ok);
      if (cells.length === 0) return { ok: false, reason: '깔 칸 없음' };
      const cost = cells.length * d.cost;
      if (s.money < cost) return { ok: false, reason: `₩${cost.toLocaleString('en-US')} 필요` };
      s.money -= cost; s.month.spent += cost;
      for (const p of cells) layFloor(s, d.floor!, p.x, p.y);
      return { ok: true };
    }
    case 'wallRect': return wallRect(s, a.id, a.from, a.to);
    case 'wallEdges': return wallEdges(s, a.id, a.edges);
    case 'removeWall': {
      const e = { x: a.x, y: a.y, side: a.side } as const;
      const k = getWall(s, e);
      if (!k) return { ok: false, reason: '벽 없음' };
      setWall(s, e, null);
      s.money += Math.round(facilityDef(k).cost / 2);
      return { ok: true };
    }
    case 'removeWalls': {
      let n = 0;
      for (const e of cellEdges(a.x, a.y)) { const k = getWall(s, e); if (!k) continue; setWall(s, e, null); s.money += Math.round(facilityDef(k).cost / 2); n++; }
      return n > 0 ? { ok: true } : { ok: false, reason: '걷을 벽 없음' };
    }
    case 'move': return moveFacility(s, a.facilityId, a.x, a.y);
    case 'remove': {
      const f = s.facilities[a.facilityId];
      if (!f) return { ok: false, reason: '없는 시설' };
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
    case 'rename': { const f = s.facilities[a.facilityId]; if (!f) return { ok: false, reason: '없는 시설' }; f.name = a.name.slice(0, 12); return { ok: true }; }
    case 'levelUp': { const c = canLevelUp(s, a.facilityId); if (!c.ok) return c; levelUp(s, a.facilityId); return { ok: true }; }
    case 'unlock': { const c = canUnlock(s, a.id); if (!c.ok) return c; unlock(s, a.id); return { ok: true }; }
    case 'setMenu': {
      if (!s.unlocked.menus.includes(a.menuId)) return { ok: false, reason: '연구 필요' };
      if (a.on && !s.menu.includes(a.menuId)) { if (s.menu.length >= 5) return { ok: false, reason: '메뉴판은 5칸이에요' }; s.menu.push(a.menuId); }
      if (!a.on) { if (s.menu.length <= 1) return { ok: false, reason: '메뉴 하나는 있어야 해요' }; s.menu = s.menu.filter((m) => m !== a.menuId); }
      return { ok: true };
    }
    case 'setTarget': { if (a.guestType && !s.unlocked.guests.includes(a.guestType)) return { ok: false, reason: '아직 안 오는 손님층이에요' }; s.target = a.guestType; return { ok: true }; }
    case 'recruit': { const c = canRecruit(s, a.channel); if (!c.ok) return c; recruit(s, a.channel); return { ok: true }; }
    case 'setDuty': { const st = s.staff.find((x) => x.id === a.staffId); if (!st) return { ok: false, reason: '없는 직원' }; st.duty = a.duty; return { ok: true }; }
    case 'hire': { const c = canHire(s, a.candidateId); if (!c.ok) return c; hire(s, a.candidateId); return { ok: true }; }
    case 'fire': { if (!s.staff.some((x) => x.id === a.staffId)) return { ok: false, reason: '없는 직원' }; s.staff = s.staff.filter((x) => x.id !== a.staffId); return { ok: true }; }
    case 'invest': { const c = canInvest(s, a.id); if (!c.ok) return c; invest(s, a.id); return { ok: true }; }
    case 'buyParcel': {
      const p = s.parcels.find((x) => x.id === a.id);
      if (!p) return { ok: false, reason: '없는 땅' };
      if (p.owned) return { ok: false, reason: '이미 내 땅' };
      if (!parcelAdjacent(s, p)) return { ok: false, reason: '붙은 땅만' };
      if (s.money < p.price) return { ok: false, reason: '돈 부족' };
      s.money -= p.price; s.month.spent += p.price; p.owned = true;
      s.fx.push({ kind: 'notice', text: `${p.name}을 샀어요` });
      return { ok: true };
    }
    case 'setSpeed': s.clock.speed = a.speed; return { ok: true };
    case 'tutorialStep': { if (s.tutorial < 0) return { ok: false, reason: '따라 하기 아님' }; s.tutorial++; s.money += a.reward; return { ok: true }; }
    case 'hint': { if (!s.hints.includes(a.id)) s.hints.push(a.id); return { ok: true }; }
    case 'setName': { const n = a.name.trim().slice(0, 12); if (!n) return { ok: false, reason: '이름 필요' }; s.cafeName = n; return { ok: true }; }
  }
}
