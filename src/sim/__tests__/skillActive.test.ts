/** 직원 액티브 스킬 (skillActive.ts, 스펙 §3) — 데이터·효과·레벨/칭호 보정·쿨다운·2번째 스킬 해금·결정성. */
import { describe, test, expect } from 'vitest';
import type { GameState, RoleId, Staff } from '../types.ts';
import { bareState } from './helpers.ts';
import { initRush } from '../rush.ts';
import { apply } from '../actions.ts';
import { serialize, deserialize } from '../save.ts';
import { ACTIVE_SKILLS, activeSkillDef, ROLES } from '../../data/index.ts';
import {
  gameMs, skillSlots, rushTrained, skillOfRole, skillsOfStaff, skillPreview,
  cooldownMs, durationMs, skillPower, skillSat, skillEffectText, skillLine,
  cooldownLeft, skillOn, canUseSkill, useStaffSkill, instantOf, clearInstant,
  activePrepCut, activeTipMult, activeSatisfaction, skillCards,
  secToMs, SKILL_COOLDOWN_CUT, RUSH_TRAINING, MAX_SKILL_SLOTS, PREP_CUT_CAP, INSTANT_WINDOW_MS,
} from '../skillActive.ts';
import { grantReward, goalRewardText } from '../goals.ts';
import { titleChances, titleChanceBonus, TITLE_CHANCE_BONUS_MAX, TITLE_CHANCE_CAP } from '../titles.ts';
import { canTrain } from '../training.ts';
import { TRAINING_RANK } from '../training.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { CLEAN_MAX } from '../cleanliness.ts';

function hired(role: RoleId = 'barista', seed = 1): { s: GameState; st: Staff } {
  const s = bareState(seed);
  apply(s, { type: 'postJob', tier: 'flyer' });
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role });
  return { s, st: s.staff[0]! };
}
/** 러시가 도는 중으로 만든다 (줄·점수는 이 파일의 관심사가 아니라 phase만 세운다) */
function rushOn(s: GameState): void {
  s.rush = { ...initRush(), phase: 'run' };
}

describe('데이터', () => {
  test('직종 4 × 칸 2 = 8개, 쿨다운 25~40초, id·이름이 겹치지 않는다', () => {
    expect(ACTIVE_SKILLS.length).toBe(8);
    for (const r of ROLES) {
      expect(skillOfRole(r.id, 1), r.id).not.toBeNull();
      expect(skillOfRole(r.id, 2), r.id).not.toBeNull();
    }
    for (const d of ACTIVE_SKILLS) {
      expect(d.cooldownSec, d.id).toBeGreaterThanOrEqual(25);
      expect(d.cooldownSec, d.id).toBeLessThanOrEqual(40);
      expect(activeSkillDef(d.id).id).toBe(d.id);
      expect(d.desc.length, d.id).toBeLessThanOrEqual(22); // 문구 규칙 §6
    }
    expect(new Set(ACTIVE_SKILLS.map((d) => d.id)).size).toBe(8);
    expect(new Set(ACTIVE_SKILLS.map((d) => d.name)).size).toBe(8);
  });

  test('스펙 §3 표 그대로: 속사 커피 −60% 12초 · 오늘의 특선 팁 ×2 10초 · 능숙한 안내 3명 · 번개 청소 +15·만족 +3 8초', () => {
    const brew = skillOfRole('barista', 1)!;
    expect(brew.effect).toEqual({ type: 'prepCut', value: 0.6 });
    expect(brew.durationSec).toBe(12);
    const cook = skillOfRole('cook', 1)!;
    expect(cook.effect).toEqual({ type: 'tipMult', value: 2 });
    expect(cook.durationSec).toBe(10);
    expect(skillOfRole('hall', 1)!.effect).toEqual({ type: 'seatFront', value: 3 });
    expect(skillOfRole('clean', 1)!.effect).toEqual({ type: 'cleanBurst', value: 15, sat: 3 });
    expect(skillOfRole('clean', 1)!.durationSec).toBe(8);
  });

  test('패시브 특기와 역할이 안 겹친다 — 액티브 효과 종류는 조리 시간·팁·착석·청결·인내·만족뿐', () => {
    const kinds = new Set(ACTIVE_SKILLS.map((d) => d.effect.type));
    expect([...kinds].sort()).toEqual(['cleanBurst', 'patience', 'prepCut', 'satBoost', 'seatFront', 'tipMult']);
  });
});

describe('레벨·칭호 보정', () => {
  test('레벨 5에서 지속 ×1.25·효과 ×1.15, 레벨 10에서 ×1.5·×1.3', () => {
    const { st } = hired('barista');
    const def = skillOfRole('barista', 1)!;
    st.level = 1;
    const d1 = durationMs(st, def);
    const p1 = skillPower(st, def);
    st.level = 5;
    expect(durationMs(st, def)).toBe(Math.round(d1 * 1.25));
    expect(skillPower(st, def)).toBeCloseTo(p1 * 1.15, 3);
    st.level = 10;
    expect(durationMs(st, def)).toBe(Math.round(d1 * 1.5));
    expect(skillPower(st, def)).toBeCloseTo(Math.min(0.9, p1 * 1.3), 3);
    st.level = 4;
    expect(durationMs(st, def)).toBe(d1); // 문턱 아래는 그대로
  });

  test('칭호 프로는 쿨다운 −20%, 전설은 −35%, 숙련·무칭호는 그대로', () => {
    const { st } = hired('cook');
    const def = skillOfRole('cook', 1)!;
    const base = cooldownMs({ title: undefined }, def);
    expect(base).toBe(secToMs(def.cooldownSec));
    expect(cooldownMs({ title: 'tt_quick_hands' }, def)).toBe(base); // 숙련
    expect(SKILL_COOLDOWN_CUT.pro).toBe(0.2);
    expect(SKILL_COOLDOWN_CUT.legend).toBe(0.35);
    st.title = undefined;
    expect(cooldownMs(st, def)).toBe(base);
  });

  test('청소 스킬의 만족 값도 레벨을 탄다', () => {
    const { st } = hired('clean');
    const def = skillOfRole('clean', 1)!;
    st.level = 1;
    expect(skillSat(st, def)).toBe(3);
    st.level = 10;
    expect(skillSat(st, def)).toBeCloseTo(3 * 1.3, 3);
  });
});

describe('2번째 스킬 해금', () => {
  test('칸이 열리고 러시 연수를 마쳐야 두 번째 재주를 쓴다', () => {
    const { s, st } = hired('hall');
    expect(skillSlots(s)).toBe(1);
    expect(skillsOfStaff(s, st).length).toBe(1);
    grantReward(s, { type: 'activeSkillSlot', n: 1 });
    expect(skillSlots(s)).toBe(MAX_SKILL_SLOTS);
    expect(skillsOfStaff(s, st).length).toBe(1); // 아직 연수 전
    st.trainingLog = { [RUSH_TRAINING]: 1 };
    expect(rushTrained(st)).toBe(true);
    expect(skillsOfStaff(s, st).map((d) => d.slot)).toEqual([1, 2]);
    grantReward(s, { type: 'activeSkillSlot', n: 5 }); // 상한을 안 넘는다
    expect(skillSlots(s)).toBe(MAX_SKILL_SLOTS);
  });

  test('러시 연수는 칸이 열려야 갈 수 있고, 한 번 다녀오면 또 못 간다', () => {
    const { s, st } = hired('hall');
    s.rank = TRAINING_RANK;
    s.money = 1e8;
    expect(canTrain(s, st.id, RUSH_TRAINING).ok).toBe(false);
    grantReward(s, { type: 'activeSkillSlot', n: 1 });
    expect(canTrain(s, st.id, RUSH_TRAINING).ok).toBe(true);
    expect(apply(s, { type: 'train', staffId: st.id, trainingId: RUSH_TRAINING }).ok).toBe(true);
    for (let d = 0; d < 3; d++) tick(s, DAY_MS);
    expect(st.training).toBeNull();
    expect(rushTrained(st)).toBe(true);
    expect(canTrain(s, st.id, RUSH_TRAINING).ok).toBe(false);
  });

  test('쉬는 직원·연수 중인 직원은 재주가 없다', () => {
    const { s, st } = hired('barista');
    expect(skillsOfStaff(s, st).length).toBe(1);
    st.role = null;
    expect(skillsOfStaff(s, st)).toEqual([]);
  });
});

describe('발동·쿨다운', () => {
  test('러시 중에만 쓸 수 있고, 쿨다운이 끝나야 또 쓴다', () => {
    const { s, st } = hired('barista');
    expect(canUseSkill(s, st.id).ok).toBe(false); // 러시가 아니다
    rushOn(s);
    expect(canUseSkill(s, st.id).ok).toBe(true);
    const def = skillOfRole('barista', 1)!;
    const u = useStaffSkill(s, st.id)!;
    expect(u.skillId).toBe(def.id);
    expect(cooldownLeft(s, st.id)).toBe(cooldownMs(st, def));
    expect(canUseSkill(s, st.id).ok).toBe(false);
    expect(canUseSkill(s, st.id).reason).toMatch(/초 뒤에/);
    s.clock.accMs += cooldownMs(st, def); // 쿨다운만큼 흐르면
    expect(cooldownLeft(s, st.id)).toBe(0);
    expect(canUseSkill(s, st.id).ok).toBe(true);
  });

  test('액션 useStaffSkill은 러시가 아니면 막히고, 러시 중이면 통한다', () => {
    const { s, st } = hired('cook');
    expect(apply(s, { type: 'useStaffSkill', staffId: st.id }).ok).toBe(false);
    rushOn(s);
    expect(apply(s, { type: 'useStaffSkill', staffId: st.id }).ok).toBe(true);
    expect(skillOn(s, st.id)).not.toBeNull();
  });

  test('지속이 끝나면 효과가 사라진다 (게임 시간 절대 시각 — 따로 줄이지 않는다)', () => {
    const { s, st } = hired('cook');
    rushOn(s);
    useStaffSkill(s, st.id);
    expect(activeTipMult(s)).toBe(2);
    s.clock.accMs += durationMs(st, skillOfRole('cook', 1)!) + 1;
    expect(activeTipMult(s)).toBe(1);
    expect(skillOn(s, st.id)).toBeNull();
  });
});

describe('효과 훅', () => {
  test('속사 커피는 그 직종 조리 시간만 줄이고, 겹쳐도 상한을 안 넘는다', () => {
    const { s, st } = hired('barista');
    rushOn(s);
    expect(activePrepCut(s, 'barista')).toBe(0);
    useStaffSkill(s, st.id);
    expect(activePrepCut(s, 'barista')).toBeCloseTo(0.6, 3);
    expect(activePrepCut(s, 'cook')).toBe(0); // 요리사 조리는 그대로
    expect(activePrepCut(s, 'barista')).toBeLessThanOrEqual(PREP_CUT_CAP);
  });

  test('오늘의 특선은 팁 ×2 — 겹쳐도 제일 큰 것 하나만', () => {
    const s = bareState(1);
    apply(s, { type: 'postJob', tier: 'flyer' });
    apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'cook' });
    rushOn(s);
    expect(activeTipMult(s)).toBe(1);
    useStaffSkill(s, s.staff[0]!.id);
    expect(activeTipMult(s)).toBe(2);
  });

  test('번개 청소는 청결을 바로 올리고 지속 동안 만족을 더한다', () => {
    const { s, st } = hired('clean');
    rushOn(s);
    s.clean.value = 50;
    useStaffSkill(s, st.id);
    expect(s.clean.value).toBe(65);
    expect(activeSatisfaction(s)).toBe(3);
    s.clean.value = CLEAN_MAX;
    st.title = undefined;
    s.clock.accMs += cooldownMs(st, skillOfRole('clean', 1)!);
    useStaffSkill(s, st.id);
    expect(s.clean.value).toBe(CLEAN_MAX); // 100을 안 넘는다
  });

  test('즉발(능숙한 안내·줄 달래기)은 방금 쓴 것만 세고, 러시가 먹으면 지워진다', () => {
    const { s, st } = hired('hall');
    rushOn(s);
    expect(instantOf(s, 'seatFront')).toBe(0);
    useStaffSkill(s, st.id);
    expect(instantOf(s, 'seatFront')).toBe(3);
    clearInstant(s, 'seatFront');
    expect(instantOf(s, 'seatFront')).toBe(0);
    s.clock.accMs += cooldownMs(st, skillOfRole('hall', 1)!);
    useStaffSkill(s, st.id);
    expect(instantOf(s, 'seatFront')).toBe(3);
    s.clock.accMs += INSTANT_WINDOW_MS + 1; // 한 스텝이 지나면 「방금」이 아니다
    expect(instantOf(s, 'seatFront')).toBe(0);
  });
});

describe('문구·카드', () => {
  test('카드 한 줄에 이름·효과·쿨다운이 다 있고 영문 id가 없다', () => {
    const { s, st } = hired('barista');
    const def = skillOfRole('barista', 1)!;
    const line = skillLine(st, def);
    expect(line).toContain(def.name);
    expect(line).toMatch(/쿨 \d+초/);
    expect(line).not.toMatch(/[A-Za-z_]{2,}/);
    expect(skillEffectText(st, def)).toMatch(/조리/);
    const cards = skillCards(s);
    expect(cards.length).toBe(1);
    expect(cards[0]!.staffId).toBe(st.id);
    expect(cards[0]!.ready).toBe(true);
    expect(cards[0]!.cooldownSec).toBe(def.cooldownSec);
  });

  test('채용 비교표용 미리보기는 직종만으로 나온다', () => {
    for (const r of ROLES) expect(skillPreview(r.id)!.role).toBe(r.id);
  });
});

describe('중반 해금 보상 (§5 — 조건은 rush1의 goals.json이 건다)', () => {
  test('titleChance는 숙련·프로·전설 확률을 함께 올리고 상한에서 멈춘다', () => {
    const s = bareState(1);
    s.rank = 5;
    s.star = 3;
    const before = titleChances(s, 'magazine');
    grantReward(s, { type: 'titleChance', pct: 20 });
    expect(titleChanceBonus(s)).toBeCloseTo(0.2, 5);
    const after = titleChances(s, 'magazine');
    expect(after.skilled).toBeCloseTo(before.skilled * 1.2, 3);
    expect(after.pro).toBeCloseTo(before.pro * 1.2, 3);
    grantReward(s, { type: 'titleChance', pct: 500 });
    expect(titleChanceBonus(s)).toBeLessThanOrEqual(TITLE_CHANCE_BONUS_MAX);
    expect(titleChances(s, 'magazine').skilled).toBeLessThanOrEqual(TITLE_CHANCE_CAP);
  });

  test('보상 문구에 영문 id가 없다', () => {
    for (const r of [{ type: 'activeSkillSlot', n: 1 }, { type: 'titleChance', pct: 15 }] as const) {
      const t = goalRewardText(r);
      expect(t.length).toBeGreaterThan(0);
      expect(t).not.toMatch(/[A-Za-z_]{2,}/);
    }
  });
});

describe('결정성·세이브', () => {
  test('같은 상태면 쿨다운·효과가 같고, 저장했다 열어도 이어진다', () => {
    const { s, st } = hired('barista');
    rushOn(s);
    useStaffSkill(s, st.id);
    const before = { left: cooldownLeft(s, st.id), cut: activePrepCut(s, 'barista'), now: gameMs(s) };
    const t = deserialize(serialize(s));
    expect(gameMs(t)).toBe(before.now);
    expect(cooldownLeft(t, st.id)).toBe(before.left);
    expect(activePrepCut(t, 'barista')).toBe(before.cut);
  });

  test('옛 세이브(스킬 필드 없음)도 열리고 기본값이 채워진다', () => {
    const s = bareState(1);
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete raw.activeSkills;
    delete raw.activeSkillSlots;
    delete raw.titleChanceBonus;
    const t = deserialize(JSON.stringify(raw));
    expect(skillSlots(t)).toBe(1);
    expect(t.activeSkills).toEqual({});
    expect(t.titleChanceBonus).toBe(0);
  });
});
