"""HSS2 확장 시설 44종(facilities_x.json, 스펙 §3.2.1)의 아이소 스프라이트 `iso_obj_<id>`.
족욕·찜질·라운지(쉼), ATM·자판기·도구실·보관함(편의), 카트·사탕 가게·차실·식당(먹거리), 오락·운동·공방·상점·공연장(즐길거리).
발자국은 facilities_x.json의 w×h. 문법은 sprites_iso_facilities와 같다(가게 = 지붕 없는 방 + 간판, 카트 = 차양 매대)."""
from __future__ import annotations
from px import Canvas, OUT, hexc, Color
from iso import IsoCanvas, paste_face
from sprites_iso_objects import (cv, chair, cup, window_sprite, door_sprite, stone_texture, PLASTER, SLATE, STONE3, GLASS, STEEL)
from sprites_iso_facilities import shop_2x1, restaurant_2x2, tiled_room, PALEBLUE
from sprites_iso_env import dolhareubang_sprite, rock
from iso_parts import (building, flat_roof, awning, stall, wall_segment, sign, text_lines, glass_box, fence, deck, lawn,
                       smoke, lantern_red, string_lights, plant_in_pot, room, table_set, chair_z, stool, counter_block,
                       shelf_face, picture, bottle_row, standing_sign, wall_sign, tile_floor,
                       icon_cup, icon_cake, icon_mug, icon_book, icon_note, icon_letter, icon_wifi, icon_tangerine,
                       icon_icecream, icon_mic, icon_dice, icon_pot, icon_heart, icon_tshirt,
                       LEAF, ORANGE, WOOD, BASALT, SOIL, SKY, WHITE, RED, YELLOW, GRASS, PINK, MINT, CREAM,
                       TERRA, NAVY, PURPLE, CLAY, TAN, PALEWOOD, DARKWOOD, BLACK, SAND, BROWN, FOAM)

WATER = (hexc('3f8fb8'), hexc('6fc0e0'), hexc('b8ecf8'))
HOTWATER = (hexc('c07a3a'), hexc('f0a860'), hexc('ffd8a0'))
IRON = (hexc('2a2a2e'), hexc('4a4a50'), hexc('7a7a80'))
COOL = (hexc('2f7fa0'), hexc('58b4d8'), hexc('a8e4f4'))
LILAC = (hexc('6a4f9a'), hexc('9a7fd0'), hexc('d0c0f0'))
MAT = (hexc('7a4f8a'), hexc('b070c0'), hexc('e0b0f0'))
GOLD = (hexc('a07a20'), hexc('e0b040'), hexc('ffe890'))
VELVET = (hexc('7a1f2a'), hexc('b83040'), hexc('e07080'))
GREEN_FELT = (hexc('1f5f3a'), hexc('2f8a52'), hexc('5fb87a'))


def bubbles(c: IsoCanvas, pts, z: int, col=WHITE[2]) -> None:
    for x, y in pts:
        sx, sy = c.spx(x, y, z)
        c.put(sx, sy, col)


def icon_foot() -> Canvas:
    s = Canvas(8, 8)
    s.rect(2, 3, 4, 5, WHITE[2]); s.rect(1, 1, 2, 2, WHITE[2]); s.put(4, 0, WHITE[2]); s.put(6, 1, WHITE[2])
    return s


def icon_coin() -> Canvas:
    s = Canvas(8, 8)
    s.shade_ellipse(3.5, 3.5, 3.5, 3.5, YELLOW); s.put(3, 3, YELLOW[0]); s.put(4, 3, YELLOW[0])
    return s


def icon_flower(col=PINK) -> Canvas:
    s = Canvas(8, 8)
    for dx, dy in ((0, -2), (2, 0), (0, 2), (-2, 0)):
        s.put(3 + dx, 3 + dy, col[1]); s.put(3 + dx + (1 if dx == 0 else 0), 3 + dy, col[1])
    s.put(3, 3, YELLOW[2]); s.put(4, 3, YELLOW[2]); s.put(3, 7, LEAF[1]); s.put(4, 6, LEAF[1])
    return s


def icon_scissors() -> Canvas:
    s = Canvas(8, 8)
    s.put(0, 0, STEEL[2]); s.put(1, 1, STEEL[2]); s.put(2, 2, STEEL[2]); s.put(3, 3, STEEL[2])
    s.put(6, 0, STEEL[2]); s.put(5, 1, STEEL[2]); s.put(4, 2, STEEL[2])
    s.rect(1, 5, 2, 2, RED[1]); s.rect(5, 5, 2, 2, RED[1])
    return s


def icon_star() -> Canvas:
    s = Canvas(8, 8)
    s.put(3, 0, YELLOW[2]); s.rect(2, 1, 3, 2, YELLOW[2]); s.rect(0, 3, 7, 1, YELLOW[2]); s.rect(1, 4, 5, 1, YELLOW[2]); s.rect(2, 5, 3, 1, YELLOW[2]); s.put(1, 6, YELLOW[2]); s.put(5, 6, YELLOW[2])
    return s


def icon_target() -> Canvas:
    s = Canvas(8, 8)
    s.ellipse(3.5, 3.5, 3.5, 3.5, RED[1]); s.ellipse(3.5, 3.5, 2.2, 2.2, WHITE[2]); s.ellipse(3.5, 3.5, 1, 1, RED[1])
    return s


def icon_film() -> Canvas:
    s = Canvas(8, 8)
    s.rect(0, 1, 8, 6, BLACK[0]); s.rect(2, 2, 4, 4, SKY[2])
    for x in (0, 7):
        for y in (1, 3, 5):
            s.put(x, y, WHITE[2])
    return s


def icon_bowl_pin() -> Canvas:
    s = Canvas(8, 8)
    s.rect(3, 0, 2, 2, WHITE[2]); s.rect(2, 2, 4, 1, RED[1]); s.rect(2, 3, 4, 5, WHITE[2]); s.put(1, 5, WHITE[2]); s.put(6, 5, WHITE[2])
    return s


# ================================================================ 쉼 — 족욕
def footbath() -> IsoCanvas:
    c = cv(22, shadow=0.45)
    c.box(8, BASALT, (0.1, 0.1, 0.9, 0.9))
    stone_texture(c, {BASALT[0], BASALT[1]}, 2.8, 2.0, 7, 4)
    c.box(1, HOTWATER, (0.2, 0.2, 0.8, 0.8), z0=8, edge=False)
    bubbles(c, ((0.35, 0.4), (0.6, 0.3), (0.5, 0.65)), 9, HOTWATER[2])
    sx, sy = c.spx(0.5, 0.35, 9); smoke(c, sx, sy - 4, 2)
    c.box(3, WOOD, (0.1, 0.86, 0.9, 0.98), z0=8, edge=False)   # 걸터앉는 판
    sx, sy = c.spx(0.75, 0.75, 9); c.put(sx, sy, ORANGE[1]); c.put(sx - 1, sy - 1, ORANGE[2])   # 귤 한 알
    c.outline()
    return c


def drum_footbath() -> IsoCanvas:
    c = cv(28, shadow=0.42)
    c.disc(0.5, 0.5, 0.36, 16, IRON)
    sx, sy = c.spx(0.5, 0.5, 4); c.hline(sx - 9, sx + 8, sy, IRON[2]); sx, sy = c.spx(0.5, 0.5, 11); c.hline(sx - 9, sx + 8, sy, IRON[2])
    c.disc(0.5, 0.5, 0.3, 1, HOTWATER, z0=16)
    bubbles(c, ((0.4, 0.42), (0.62, 0.5), (0.48, 0.62)), 17, HOTWATER[2])
    sx, sy = c.spx(0.5, 0.4, 17); smoke(c, sx, sy - 4, 2)
    for x, y in ((0.2, 0.85), (0.35, 0.92)):
        c.box(2, WOOD, (x - 0.08, y - 0.04, x + 0.08, y + 0.04), edge=False)   # 장작
    sx, sy = c.spx(0.3, 0.9, 2); c.put(sx, sy - 1, RED[1]); c.put(sx + 1, sy - 2, YELLOW[1])
    c.outline()
    return c


def cauldron_footbath() -> IsoCanvas:
    c = cv(30, shadow=0.45)
    c.box(6, BASALT, (0.15, 0.15, 0.85, 0.85))
    stone_texture(c, {BASALT[0], BASALT[1]}, 2.8, 2.0, 6, 4)
    c.disc(0.5, 0.5, 0.34, 12, IRON, z0=6)
    sx, sy = c.spx(0.5, 0.5, 18); c.ellipse(sx, sy, 9, 4.5, IRON[0])
    c.disc(0.5, 0.5, 0.26, 1, HOTWATER, z0=18)
    bubbles(c, ((0.42, 0.45), (0.58, 0.55), (0.5, 0.38)), 19, HOTWATER[2])
    sx, sy = c.spx(0.5, 0.42, 19); smoke(c, sx, sy - 5, 3)
    sx, sy = c.spx(0.85, 0.5, 14); c.rect(sx - 1, sy - 2, 3, 2, IRON[2])   # 손잡이
    sx, sy = c.spx(0.5, 0.86, 6); c.put(sx, sy, RED[1]); c.put(sx + 1, sy - 1, YELLOW[1]); c.put(sx - 1, sy, ORANGE[1])   # 불
    c.outline()
    return c


def lie_footbath() -> IsoCanvas:
    c = cv(22, 2, 1, shadow=0.8)
    deck(c, (0.02, 0.02, 1.98, 0.98), 4, PALEWOOD, 'x', 0.16)
    c.box(6, WOOD, (0.15, 0.2, 1.1, 0.8), z0=4)                                   # 긴 눕는 판
    c.box(5, WOOD, (0.15, 0.2, 0.4, 0.8), z0=10, edge=False)                        # 머리 쪽 경사
    c.box(2, (RED[0], RED[1], hexc('ff9a9a')), (0.5, 0.3, 0.95, 0.7), z0=10, edge=False)   # 방석
    c.box(8, BASALT, (1.2, 0.15, 1.9, 0.85), z0=4)
    stone_texture(c, {BASALT[0], BASALT[1]}, 2.6, 2.0, 6, 4)
    c.box(1, HOTWATER, (1.3, 0.25, 1.8, 0.75), z0=12, edge=False)
    bubbles(c, ((1.45, 0.4), (1.65, 0.55)), 13, HOTWATER[2])
    sx, sy = c.spx(1.55, 0.4, 13); smoke(c, sx, sy - 3, 2)
    c.outline()
    return c


def hot_tub_terrace() -> IsoCanvas:
    c = cv(26, 2, 2, shadow=1.0)
    deck(c, (0.02, 0.02, 1.98, 1.98), 5, PALEWOOD, 'y', 0.2)
    c.box(10, WOOD, (0.3, 0.3, 1.7, 1.7), z0=5)
    for y in (0.5, 0.9, 1.3):
        c.line((0.3, y, 9), (1.7, y, 9), WOOD[0])
    c.box(1, HOTWATER, (0.42, 0.42, 1.58, 1.58), z0=15, edge=False)
    bubbles(c, ((0.7, 0.7), (1.2, 0.6), (0.9, 1.2), (1.3, 1.3), (0.6, 1.1)), 16, HOTWATER[2])
    sx, sy = c.spx(1.0, 0.9, 16); smoke(c, sx, sy - 5, 3)
    c.box(4, WOOD, (0.05, 1.75, 0.5, 1.95), z0=5, edge=False)   # 계단
    c.box(4, WOOD, (0.05, 1.55, 0.3, 1.75), z0=9, edge=False)
    plant_in_pot(c, 1.85, 0.15, 0.1, 5, CLAY, LEAF, 4)
    cup(c, 1.6, 1.85, 5, ORANGE[1])
    c.outline()
    return c


def cool_footbath() -> IsoCanvas:
    c = cv(22, shadow=0.45)
    c.box(8, STONE3, (0.1, 0.1, 0.9, 0.9))
    stone_texture(c, {STONE3[0], STONE3[1]}, 2.8, 2.0, 7, 4)
    c.box(1, COOL, (0.2, 0.2, 0.8, 0.8), z0=8, edge=False)
    bubbles(c, ((0.35, 0.5), (0.6, 0.35), (0.55, 0.65)), 9, COOL[2])
    c.pillar(0.2, 0.2, 2, 14, STEEL, z0=8); sx, sy = c.spx(0.2, 0.2, 22); c.hline(sx, sx + 4, sy, STEEL[1]); c.put(sx + 4, sy + 1, COOL[1]); c.put(sx + 4, sy + 3, COOL[1])   # 물 나오는 관
    sx, sy = c.spx(0.7, 0.8, 9); c.rect(sx - 2, sy - 2, 4, 2, WHITE[2])   # 얼음
    c.outline()
    return c


def open_air_footbath() -> IsoCanvas:
    c = cv(34, 2, 2, shadow=1.0)
    lawn(c, (0, 0, 2, 2), [(0.15, 1.85), (1.85, 0.15)])
    # 뒤쪽 돌담(ㄱ자)
    c.boxes([(0, 0, 2, 0.22), (0, 0, 0.22, 2)], 16, BASALT)
    stone_texture(c, {BASALT[0], BASALT[1], BASALT[2]}, 3.4, 2.4, 8, 5)
    c.box(8, STONE3, (0.35, 0.35, 1.85, 1.85), z0=0)
    stone_texture(c, {STONE3[0], STONE3[1]}, 2.8, 2.0, 7, 4)
    c.box(1, HOTWATER, (0.5, 0.5, 1.7, 1.7), z0=8, edge=False)
    bubbles(c, ((0.7, 0.8), (1.2, 0.7), (0.9, 1.3), (1.4, 1.4), (1.5, 0.9)), 9, HOTWATER[2])
    sx, sy = c.spx(1.1, 1.0, 9); smoke(c, sx, sy - 5, 3)
    for x, y, r in ((0.6, 1.9, 0.1), (1.9, 0.6, 0.1)):
        rock(c, x, y, r, 4)
    c.pillar(1.85, 1.85, 2, 20, WOOD); sg = sign(16, 9, (WOOD[1], WOOD[2], hexc('e0a866')), icon_foot()); sx, sy = c.spx(1.85, 1.85, 20); c.blit(sg, sx - 8, sy - 8)
    c.outline()
    return c


def waterfall_shower() -> IsoCanvas:
    c = cv(44, pad=4, shadow=0.45)
    c.box(6, STONE3, (0.1, 0.1, 0.9, 0.9))
    stone_texture(c, {STONE3[0], STONE3[1]}, 2.8, 2.0, 6, 4)
    c.box(1, COOL, (0.2, 0.2, 0.8, 0.8), z0=6, edge=False)
    # 뒤쪽 바위 벽
    c.box(34, BASALT, (0.1, 0.1, 0.9, 0.36), z0=6)
    stone_texture(c, {BASALT[0], BASALT[1]}, 3.0, 2.2, 7, 5)
    for x in (0.4, 0.55, 0.7):
        for z in range(10, 40, 2):
            sx, sy = c.spx(x, 0.38, z); c.put(sx, sy, COOL[2] if z % 4 == 0 else COOL[1])
    sx, sy = c.spx(0.55, 0.6, 7); c.ellipse(sx, sy, 5, 2.5, COOL[2]); c.put(sx - 6, sy - 1, WHITE[2]); c.put(sx + 6, sy - 1, WHITE[2])
    for x, y in ((0.2, 0.85), (0.85, 0.5)):
        sx, sy = c.spx(x, y, 6); c.put(sx, sy - 1, GRASS[1]); c.put(sx + 1, sy - 2, GRASS[2])
    c.outline()
    return c


def sauna_hut() -> IsoCanvas:
    c = cv(40, 2, 2, pad=4, shadow=1.0)
    # 현무암 돔 움막: 층층이 줄어드는 상자
    for i, (inset, h) in enumerate(((0.1, 12), (0.25, 10), (0.42, 8), (0.62, 6))):
        c.box(h, BASALT, (inset, inset, 2 - inset, 2 - inset), z0=sum(hh for _, hh in ((0.1, 12), (0.25, 10), (0.42, 8), (0.62, 6))[:i]))
    stone_texture(c, {BASALT[0], BASALT[1]}, 3.2, 2.2, 8, 5)
    d = door_sprite(12, 14, DARKWOOD); paste_face(c, 'right', d, 12, 2)
    c.last_box = {'rect': (0.1, 0.1, 1.9, 1.9), 'height': 12, 'z0': 0, 'split': int(c.screen(1.9, 1.9)[0]), 'x0': 0, 'x1': c.w, 'ymax': {}}
    sx, sy = c.spx(1.0, 1.0, 36); c.rect(sx - 2, sy - 6, 4, 6, IRON[1]); smoke(c, sx, sy - 8, 3)   # 굴뚝
    c.pillar(1.9, 1.9, 2, 18, WOOD); sg = sign(16, 9, RED, icon_foot()); sx, sy = c.spx(1.9, 1.9, 18); c.blit(sg, sx - 8, sy - 8)
    c.outline()
    return c


def massage_chair() -> IsoCanvas:
    c = cv(26, shadow=0.4)
    CH = (hexc('2a2a3e'), hexc('4a4a68'), hexc('7a7a98'))
    c.box(8, CH, (0.2, 0.25, 0.8, 0.85))
    c.box(14, CH, (0.2, 0.25, 0.8, 0.42), z0=8, edge=False)      # 등받이
    c.box(6, CH, (0.2, 0.25, 0.32, 0.85), z0=8, edge=False)      # 팔걸이
    c.box(6, CH, (0.68, 0.25, 0.8, 0.85), z0=8, edge=False)
    c.box(3, CH, (0.32, 0.85, 0.68, 0.98), z0=4, edge=False)     # 발 받침
    sx, sy = c.spx(0.5, 0.33, 22); c.rect(sx - 4, sy - 1, 8, 2, hexc('8a8ab0'))   # 머리 쿠션
    c.pillar(0.8, 0.85, 1, 12, STEEL, z0=8); sx, sy = c.spx(0.8, 0.85, 20); c.rect(sx - 2, sy - 3, 4, 3, WHITE[1]); c.put(sx - 1, sy - 2, RED[1])   # 조작판
    c.outline()
    return c


def rest_pavilion() -> IsoCanvas:
    c = cv(40, pad=4, shadow=0.5)
    deck(c, (0.08, 0.08, 0.92, 0.92), 6, PALEWOOD, 'x', 0.16)
    for x, y in ((0.14, 0.14), (0.86, 0.14), (0.14, 0.86), (0.86, 0.86)):
        c.pillar(x, y, 2, 24, WOOD, z0=6)
    c.line((0.14, 0.86, 14), (0.86, 0.86, 14), WOOD[0]); c.line((0.86, 0.14, 14), (0.86, 0.86, 14), WOOD[0])   # 난간
    c.gable_roof((0.02, 0.02, 0.98, 0.98), 30, 9, SLATE, 'x', slates=3)
    c.box(2, (RED[0], RED[1], hexc('ff9a9a')), (0.4, 0.4, 0.6, 0.6), z0=6, edge=False)
    cup(c, 0.7, 0.5, 6, WHITE[1])
    c.outline()
    return c


def lounge() -> IsoCanvas:
    c = cv(40, 2, 2, pad=2, shadow=1.0)
    r, z = restaurant_2x2(c, CREAM, 'wood', icon_cup(), [icon_cup(), icon_tangerine(), icon_cup()], wall_h=26)
    SOFA = (hexc('b8602a'), hexc('e08a48'), hexc('f8c088'))
    c.box(6, SOFA, (0.4, 0.4, 1.7, 0.75), z0=z); c.box(8, SOFA, (0.4, 0.4, 1.7, 0.52), z0=z + 6, edge=False)
    c.box(6, SOFA, (0.4, 0.9, 0.75, 1.7), z0=z); c.box(8, SOFA, (0.4, 0.9, 0.52, 1.7), z0=z + 6, edge=False)
    c.box(2, YELLOW, (0.7, 0.55, 0.95, 0.72), z0=z + 6, edge=False); c.box(2, MINT, (1.3, 0.55, 1.55, 0.72), z0=z + 6, edge=False)
    c.box(8, WOOD, (0.95, 0.95, 1.55, 1.45), z0=z); cup(c, 1.1, 1.1, z + 8, ORANGE[1]); cup(c, 1.35, 1.25, z + 8)
    sx, sy = c.spx(1.25, 1.2, z + 8); c.rect(sx - 4, sy - 3, 5, 2, ORANGE[1]); c.put(sx - 3, sy - 4, ORANGE[2])   # 귤 접시
    plant_in_pot(c, 1.8, 1.8, 0.12, 6, CLAY, LEAF, 6)
    c.pillar(1.7, 0.4, 1, 18, STEEL, z0=z); sx, sy = c.spx(1.7, 0.4, z + 18); c.rect(sx - 3, sy - 4, 6, 4, YELLOW[1]); c.hline(sx - 3, sx + 2, sy - 4, YELLOW[2])
    c.outline()
    return c


# ================================================================ 편의
def atm() -> IsoCanvas:
    c = cv(34, shadow=0.36)
    c.box(30, STEEL, (0.28, 0.28, 0.72, 0.72))
    scr = Canvas(10, 8); scr.rect(0, 0, 10, 8, BLACK[0]); scr.rect(1, 1, 8, 6, SKY[1]); scr.rect(2, 2, 5, 1, WHITE[2]); scr.rect(2, 4, 3, 1, YELLOW[1])
    paste_face(c, 'right', scr, 2, 6)
    kp = Canvas(10, 6); kp.rect(0, 0, 10, 6, STEEL[0])
    for x in range(1, 9, 3):
        for y in range(1, 5, 2):
            kp.put(x, y, WHITE[2])
    paste_face(c, 'right', kp, 2, 16)
    slot = Canvas(10, 3); slot.rect(0, 0, 10, 3, STEEL[0]); slot.hline(1, 8, 1, BLACK[0]); paste_face(c, 'right', slot, 2, 24)
    sx, sy = c.spx(0.5, 0.5, 30); c.rect(sx - 5, sy - 3, 10, 3, NAVY[1]); c.blit(icon_coin(), sx - 3, sy - 11)
    c.outline()
    return c


def food_vending() -> IsoCanvas:
    c = cv(36, shadow=0.36)
    c.box(32, RED, (0.28, 0.24, 0.74, 0.76))
    face = Canvas(11, 20); face.rect(0, 0, 11, 20, RED[0]); face.rect(1, 1, 9, 12, BLACK[0])
    for i, col in enumerate((YELLOW[1], ORANGE[1], TAN[1], YELLOW[1], ORANGE[1], TAN[1])):
        face.rect(2 + (i % 3) * 3, 2 + (i // 3) * 5, 2, 3, col)
    face.rect(1, 15, 9, 3, STEEL[1]); face.hline(2, 8, 16, BLACK[0])
    paste_face(c, 'right', face, 2, 3)
    sx, sy = c.spx(0.5, 0.5, 32); c.rect(sx - 4, sy - 2, 8, 2, YELLOW[1]); smoke(c, sx, sy - 5, 2)
    c.outline()
    return c


def cleaning_room() -> IsoCanvas:
    c = cv(36, pad=4, shadow=0.45)
    building(c, (0.08, 0.08, 0.92, 0.92), 6, 20, PLASTER)
    paste_face(c, 'right', door_sprite(10, 14), 3, 6)
    paste_face(c, 'left', window_sprite(8, 7), 4, 5)
    c.gable_roof((0.02, 0.02, 0.98, 0.98), 26, 7, SLATE, 'x', slates=3)
    # 문 옆 빗자루·양동이
    sx, sy = c.spx(0.94, 0.7, 0); c.vline(sx, sy - 16, sy - 2, WOOD[1]); c.rect(sx - 2, sy - 3, 5, 3, TAN[1]); c.hline(sx - 2, sx + 2, sy - 3, TAN[2])
    c.disc(0.7, 0.96, 0.09, 5, SKY); sx, sy = c.spx(0.7, 0.96, 5); c.hline(sx - 2, sx + 1, sy - 2, STEEL[1])
    c.outline()
    return c


def locker() -> IsoCanvas:
    c = cv(30, shadow=0.4)
    c.box(26, (hexc('2f5f8a'), hexc('4a8ac0'), hexc('8ec0e8')), (0.12, 0.3, 0.88, 0.7))
    face = Canvas(22, 20); face.rect(0, 0, 22, 20, hexc('4a8ac0'))
    for i in range(3):
        for j in range(2):
            x, y = 1 + i * 7, 1 + j * 9
            face.rect(x, y, 6, 8, hexc('5a9ad0')); face.hline(x, x + 5, y, hexc('8ec0e8')); face.vline(x, y, y + 7, hexc('8ec0e8')); face.put(x + 4, y + 4, YELLOW[1]); face.rect(x + 1, y + 1, 3, 1, hexc('2f5f8a'))
    paste_face(c, 'right', face, 2, 3)
    sx, sy = c.spx(0.5, 0.5, 26); c.rect(sx - 4, sy - 5, 6, 5, RED[1]); c.hline(sx - 4, sx + 1, sy - 5, RED[2]); c.rect(sx - 2, sy - 6, 2, 1, RED[0])   # 위에 놓인 가방
    c.outline()
    return c


# ================================================================ 먹거리
def cart(c: IsoCanvas, pal, stripe=WHITE, wheels: bool = True) -> None:
    """바퀴 달린 카트: 낮은 상자 + 차양."""
    c.box(11, pal, (0.15, 0.25, 0.85, 0.85))
    c.box(2, WOOD, (0.12, 0.22, 0.88, 0.88), z0=11, edge=False)
    if wheels:
        for x, y in ((0.2, 0.9), (0.8, 0.9)):
            c.disc(x, y, 0.07, 4, BLACK); sx, sy = c.spx(x, y, 4); c.put(sx, sy - 1, STEEL[2])
    c.pillar(0.18, 0.28, 2, 28, STEEL); c.pillar(0.82, 0.28, 2, 28, STEEL); c.pillar(0.18, 0.82, 2, 28, STEEL); c.pillar(0.82, 0.82, 2, 28, STEEL)
    awning(c, (0.08, 0.15, 0.92, 0.92), 28, pal, stripe)


def lemonade_cart() -> IsoCanvas:
    c = cv(36, shadow=0.45)
    cart(c, YELLOW, WHITE)
    c.disc(0.4, 0.5, 0.12, 9, GLASS, z0=13); c.disc(0.4, 0.5, 0.1, 7, YELLOW, z0=13)
    sx, sy = c.spx(0.4, 0.5, 22); c.hline(sx - 3, sx + 2, sy, STEEL[1]); c.put(sx + 4, sy + 2, STEEL[1])   # 디스펜서 꼭지
    for x, y in ((0.65, 0.4), (0.72, 0.62)):
        cup(c, x, y, 13, YELLOW[2])
    sx, sy = c.spx(0.6, 0.75, 13); c.put(sx, sy - 1, YELLOW[1]); c.put(sx + 1, sy - 2, YELLOW[2]); c.put(sx - 1, sy - 2, YELLOW[1])   # 레몬
    c.outline()
    return c


def sweet_potato_cart() -> IsoCanvas:
    c = cv(36, shadow=0.45)
    cart(c, (hexc('6a3a2a'), hexc('9a5a3a'), hexc('d09060')), TAN, wheels=True)
    c.disc(0.5, 0.5, 0.2, 10, IRON, z0=13)
    sx, sy = c.spx(0.5, 0.5, 23); c.ellipse(sx, sy, 5, 2.5, IRON[0]); c.put(sx - 1, sy - 1, RED[1]); c.put(sx + 1, sy, ORANGE[1])
    smoke(c, sx, sy - 4, 3)
    for x, y in ((0.75, 0.4), (0.72, 0.66)):
        sx, sy = c.spx(x, y, 13); c.ellipse(sx, sy - 1, 2.5, 1.5, hexc('7a3a6a')); c.put(sx - 1, sy - 2, hexc('b06090'))   # 고구마
    c.outline()
    return c


def hanchi_cart() -> IsoCanvas:
    c = cv(36, shadow=0.45)
    cart(c, NAVY, WHITE)
    c.box(6, STEEL, (0.3, 0.35, 0.7, 0.65), z0=13)
    sx, sy = c.spx(0.5, 0.5, 19); c.ellipse(sx, sy, 5, 2.5, YELLOW[1]); c.put(sx - 2, sy - 1, TAN[1]); c.put(sx + 2, sy, TAN[1]); smoke(c, sx, sy - 4, 2)
    sx, sy = c.spx(0.75, 0.7, 13); c.rect(sx - 2, sy - 4, 4, 4, WHITE[1]); c.put(sx - 1, sy - 5, TAN[1]); c.put(sx + 1, sy - 5, TAN[2])   # 튀김 컵
    sx, sy = c.spx(0.5, 0.92, 28); sg = Canvas(12, 7); sg.rect(0, 0, 12, 7, WHITE[1]); sg.rect(2, 1, 8, 5, TAN[1]); sg.put(3, 2, BLACK[0]); sg.put(8, 2, BLACK[0]); sg.rect(4, 5, 4, 1, TAN[0]); c.blit(sg, sx - 6, sy - 10)
    c.outline()
    return c


def candy_shop() -> IsoCanvas:
    c = cv(40, pad=4, shadow=0.45)
    building(c, (0.06, 0.06, 0.94, 0.94), 5, 22, (hexc('c05070'), hexc('f080a0'), hexc('ffc0d0')))
    paste_face(c, 'right', door_sprite(10, 14, WHITE), 3, 7)
    paste_face(c, 'right', window_sprite(9, 8), 15, 5)
    paste_face(c, 'left', sign(20, 8, WHITE, icon_star()), 2, 4)
    awning(c, (0.06, 0.6, 0.94, 1.02), 20, PINK, WHITE, 'y')
    flat_roof(c, (0.06, 0.06, 0.94, 0.94), 27, (hexc('a03858'), hexc('d06080'), hexc('f8a8c0')))
    for x, y, col in ((0.3, 0.3, RED), (0.55, 0.28, YELLOW), (0.75, 0.4, MINT)):
        c.disc(x, y, 0.08, 4, col, z0=30); sx, sy = c.spx(x, y, 34); c.put(sx, sy - 1, col[2])   # 지붕 위 사탕
    c.outline()
    return c


def tea_house() -> IsoCanvas:
    c = cv(40, pad=4, shadow=0.45)
    r = room(c, (0, 0, 1, 1), 22, (hexc('7a6a4a'), hexc('a08a60'), hexc('d0c0a0')), PALEWOOD, 'x', base_h=6, step=0.25)
    r.on_right(wall_sign(icon_mug(), 20), 6, 2)
    lat = Canvas(12, 10); lat.rect(0, 0, 12, 10, WOOD[1])
    for x in range(1, 12, 3): lat.vline(x, 1, 8, CREAM[2])
    for y in range(1, 10, 3): lat.hline(1, 10, y, CREAM[2])
    r.on_left(lat, 4, 4)
    z = r.z
    c.box(2, (hexc('6a8a4a'), hexc('90b070'), hexc('c8e0a8')), (0.2, 0.2, 0.95, 0.95), z0=z, edge=False)   # 다다미
    c.box(5, DARKWOOD, (0.35, 0.4, 0.8, 0.8), z0=z + 2)
    cup(c, 0.45, 0.5, z + 7, hexc('90b070')); cup(c, 0.68, 0.68, z + 7, hexc('90b070'))
    sx, sy = c.spx(0.6, 0.55, z + 7); c.rect(sx - 2, sy - 3, 4, 3, hexc('3f6a3a')); c.put(sx - 2, sy - 3, hexc('5f9a52')); c.put(sx + 1, sy - 4, hexc('3f6a3a'))   # 찻주전자
    c.box(2, (RED[0], RED[1], hexc('ff9a9a')), (0.25, 0.7, 0.4, 0.85), z0=z + 2, edge=False)
    plant_in_pot(c, 0.9, 0.25, 0.08, 4, CLAY, LEAF, 4)
    c.outline()
    return c


def brunch_house() -> IsoCanvas:
    c = cv(36, 2, 2, pad=2, shadow=1.0)
    r, z = restaurant_2x2(c, WHITE, 'wood', icon_cake(), [icon_cake(), icon_cup(), icon_cake()], wall_h=24)
    for x, y in ((0.7, 0.7), (1.5, 0.7), (0.7, 1.5)):
        table_set(c, x, y, z, (YELLOW[1], WHITE[1]), round_top=True)
    sx, sy = c.spx(1.5, 1.4, z); c.rect(sx - 4, sy - 12, 8, 12, WOOD[1]); c.hline(sx - 4, sx + 3, sy - 12, WOOD[2])
    for k in range(3):
        c.hline(sx - 3, sx + 2, sy - 10 + k * 4, WOOD[0]); c.rect(sx - 2, sy - 12 + k * 4, 2, 2, LEAF[1]); c.rect(sx + 1, sy - 12 + k * 4, 2, 2, ORANGE[1])   # 선반
    string_lights(c, (0.12, 0.12, r.top), (1.95, 0.12, r.top), 3, 6)
    c.outline()
    return c


def fine_dining() -> IsoCanvas:
    c = cv(40, 2, 2, pad=2, shadow=1.0)
    r, z = restaurant_2x2(c, (hexc('2a2a3e'), hexc('3e3e58'), hexc('6a6a88')), 'dark', icon_star(), [icon_star(), icon_mug(), icon_star()], wall_h=26)
    for x, y in ((0.7, 0.7), (1.5, 0.7), (0.7, 1.5), (1.5, 1.5)):
        chair_z(c, x - 0.22, y, z, 'left', DARKWOOD); chair_z(c, x, y - 0.22, z, 'right', DARKWOOD)
        c.pillar(x, y, 2, 9, STEEL, z0=z); c.disc(x, y, 0.16, 2, WHITE, z0=z + 9)
        sx, sy = c.spx(x, y, z + 11); c.put(sx, sy - 2, YELLOW[2]); c.put(sx, sy - 3, YELLOW[1]); c.vline(sx, sy - 1, sy, WHITE[1])   # 촛불
    sx, sy = c.spx(1.0, 1.0, r.top - 4); c.shade_ellipse(sx, sy, 4, 3, GOLD); c.put(sx, sy - 4, GOLD[0]); c.vline(sx, sy - 8, sy - 4, GOLD[0])   # 샹들리에
    c.outline()
    return c


# ================================================================ 즐길거리
def capsule_machine() -> IsoCanvas:
    c = cv(30, shadow=0.34)
    c.box(12, RED, (0.32, 0.32, 0.68, 0.68))
    sx, sy = c.spx(0.5, 0.5, 6); c.rect(sx - 3, sy - 2, 6, 3, BLACK[0]); c.put(sx - 2, sy - 1, YELLOW[1])   # 동전 투입·배출구
    c.disc(0.5, 0.5, 0.2, 10, GLASS, z0=12)
    sx, sy = c.spx(0.5, 0.5, 17)
    for dx, dy, col in ((-3, -1, YELLOW[1]), (0, -3, SKY[1]), (3, -1, PINK[1]), (-1, 1, MINT[1]), (2, 2, ORANGE[1])):
        c.put(sx + dx, sy + dy, col); c.put(sx + dx + 1, sy + dy, col)
    c.disc(0.5, 0.5, 0.2, 2, RED, z0=22)
    c.outline()
    return c


def pinball() -> IsoCanvas:
    c = cv(34, shadow=0.36)
    c.box(14, NAVY, (0.2, 0.3, 0.8, 0.8))
    c.box(3, (hexc('2f5f4a'), hexc('3f8a68'), hexc('6fbf98')), (0.24, 0.34, 0.76, 0.76), z0=14, edge=False)
    for x, y, col in ((0.4, 0.45, RED), (0.6, 0.4, YELLOW), (0.5, 0.6, PINK)):
        c.disc(x, y, 0.05, 2, col, z0=17); sx, sy = c.spx(x, y, 19); c.put(sx, sy - 1, col[2])
    sx, sy = c.spx(0.5, 0.7, 17); c.put(sx, sy, STEEL[2])   # 공
    c.box(16, NAVY, (0.2, 0.3, 0.8, 0.42), z0=14, edge=False)   # 백글라스
    bg = Canvas(14, 12); bg.rect(0, 0, 14, 12, BLACK[0]); bg.blit(icon_star(), 3, 1); bg.rect(2, 9, 10, 1, PINK[1]); bg.hline(0, 13, 0, YELLOW[1])
    paste_face(c, 'left', bg, 3, 2)
    c.outline()
    return c


def marble_game() -> IsoCanvas:
    c = cv(34, shadow=0.36)
    c.box(30, (hexc('8a4a2a'), hexc('c07040'), hexc('f0a870')), (0.3, 0.3, 0.7, 0.7))
    face = Canvas(12, 22); face.rect(0, 0, 12, 22, hexc('c07040')); face.rect(1, 1, 10, 14, BLACK[0])
    for y in range(3, 14, 3):
        for x in range(2 + (y // 3) % 2, 10, 2):
            face.put(x, y, STEEL[2])
    face.put(5, 5, SKY[2]); face.put(7, 9, PINK[1]); face.rect(2, 17, 8, 3, STEEL[1]); face.put(9, 18, RED[1])
    paste_face(c, 'right', face, 1, 3)
    sx, sy = c.spx(0.5, 0.5, 30); c.rect(sx - 5, sy - 3, 10, 3, YELLOW[1]); c.put(sx - 4, sy - 2, RED[1]); c.put(sx + 3, sy - 2, RED[1])
    c.outline()
    return c


def arcade_cabinet(c: IsoCanvas, x: float, y: float, z: int, col) -> None:
    c.box(16, col, (x - 0.12, y - 0.12, x + 0.12, y + 0.12), z0=z)
    sx, sy = c.spx(x, y, z + 16); c.rect(sx - 3, sy - 1, 6, 2, BLACK[0])
    sx, sy = c.spx(x + 0.12, y, z + 8); c.rect(sx - 4, sy - 5, 5, 4, BLACK[0]); c.put(sx - 3, sy - 4, SKY[2]); c.put(sx - 1, sy - 3, YELLOW[1])


def retro_arcade() -> IsoCanvas:
    c = cv(34, 2, 1, pad=2, shadow=0.85)
    r = room(c, (0, 0, 2, 1), 24, (hexc('2a1f4a'), hexc('3f2f70'), hexc('6a5aa0')), (hexc('2a2a3e'), hexc('3e3e58'), hexc('6a6a88')), 'x', base_h=0, step=0.3)
    neon = Canvas(24, 10); neon.rect(0, 0, 24, 10, BLACK[0]); neon.blit(icon_dice(), 2, 1); neon.rect(11, 2, 10, 1, PINK[1]); neon.rect(11, 5, 7, 1, SKY[2]); neon.hline(0, 23, 0, MINT[1]); neon.hline(0, 23, 9, MINT[1])
    r.on_right(neon, 8, 3); r.on_left(door_sprite(12, 16, BLACK), 8, 6)
    z = r.z
    for x, col in ((0.45, RED), (0.85, YELLOW), (1.25, SKY), (1.65, PINK)):
        arcade_cabinet(c, x, 0.32, z, col)
    stool(c, 0.6, 0.72, z, DARKWOOD); stool(c, 1.4, 0.72, z, DARKWOOD)
    c.outline()
    return c


def shooting_booth() -> IsoCanvas:
    c = cv(36, 2, 1, pad=2, shadow=0.85)
    stall(c, (0.05, 0.05, 1.95, 0.95), RED, WHITE, 30)
    wall_segment(c, (0.05, 0.05, 1.95, 0.25), 22, (hexc('6a2a1a'), hexc('a04a2a'), hexc('e08050')))
    for i in range(4):
        sx, sy = c.spx(0.3 + i * 0.45, 0.25, 14); c.rect(sx - 2, sy - 5, 4, 5, (YELLOW, SKY, PINK, MINT)[i][1]); c.put(sx - 1, sy - 6, (YELLOW, SKY, PINK, MINT)[i][2]); c.put(sx, sy - 6, (YELLOW, SKY, PINK, MINT)[i][2])   # 인형
    sx, sy = c.spx(1.0, 0.25, 22); c.blit(icon_target(), sx - 4, sy - 6)
    sx, sy = c.spx(0.6, 0.6, 12); c.rect(sx - 5, sy - 1, 8, 2, WOOD[0]); c.rect(sx + 2, sy - 2, 3, 3, WOOD[1])   # 코르크 총
    sx, sy = c.spx(1.4, 0.6, 12); c.rect(sx - 5, sy - 1, 8, 2, WOOD[0]); c.rect(sx + 2, sy - 2, 3, 3, WOOD[1])
    c.outline()
    return c


def archery_range() -> IsoCanvas:
    c = cv(30, 2, 1, shadow=0.85)
    lawn(c, (0, 0, 2, 1), [(0.3, 0.8), (1.2, 0.2)])
    fence(c, [(0.08, 0.92), (0.08, 0.08), (1.92, 0.08)], 8, WOOD, rails=(3, 6))
    c.box(6, TAN, (1.5, 0.25, 1.85, 0.75))   # 짚단
    c.pillar(1.68, 0.5, 2, 18, WOOD, z0=6); sx, sy = c.spx(1.68, 0.5, 18); c.blit(icon_target(), sx - 4, sy - 6)
    c.pillar(0.35, 0.5, 2, 16, WOOD); sx, sy = c.spx(0.35, 0.5, 16)
    for k in range(10):
        c.put(sx + int(3 * (1 - abs(k - 5) / 5)) + 1, sy + k - 2, WOOD[1])   # 활
    c.vline(sx + 1, sy - 2, sy + 7, WHITE[1])
    sx, sy = c.spx(0.6, 0.8, 0); c.rect(sx - 4, sy - 1, 9, 1, WOOD[1]); c.put(sx + 5, sy - 1, STEEL[2])   # 화살
    c.outline()
    return c


def pingpong() -> IsoCanvas:
    c = cv(22, 2, 1, shadow=0.85)
    c.box(10, GREEN_FELT, (0.15, 0.2, 1.85, 0.8))
    c.line((0.15, 0.5, 10), (1.85, 0.5, 10), WHITE[1]); c.line((0.15, 0.2, 10), (0.15, 0.8, 10), WHITE[1]); c.line((1.85, 0.2, 10), (1.85, 0.8, 10), WHITE[1])
    c.line((0.15, 0.22, 10), (1.85, 0.22, 10), WHITE[1]); c.line((0.15, 0.78, 10), (1.85, 0.78, 10), WHITE[1])
    for t in range(0, 11):
        sx, sy = c.spx(1.0, 0.2 + 0.06 * t, 10); c.vline(sx, sy - 5, sy, WHITE[1] if t % 2 == 0 else STEEL[2])   # 네트
    for x, y in ((0.3, 0.5), (1.7, 0.5)):
        sx, sy = c.spx(x, y, 10); c.ellipse(sx, sy - 2, 2.5, 2, RED[1]); c.rect(sx - 1, sy, 2, 2, WOOD[1])   # 라켓
    sx, sy = c.spx(1.15, 0.4, 12); c.put(sx, sy, WHITE[2]); c.put(sx + 1, sy, WHITE[1])
    for x, y in ((0.2, 0.25), (1.8, 0.25), (0.2, 0.75), (1.8, 0.75)):
        c.pillar(x, y, 1, 10, STEEL)
    c.outline()
    return c


def mini_bowling() -> IsoCanvas:
    c = cv(30, 3, 2, pad=2, shadow=1.2)
    r = room(c, (0, 0, 3, 2), 20, NAVY, PALEWOOD, 'x', base_h=0, step=0.3)
    r.on_right(wall_sign(icon_bowl_pin(), 26), 10, 2)
    r.on_left(door_sprite(12, 14, BLACK), 8, 5)
    z = r.z
    for y0 in (0.35, 1.15):
        c.box(2, (hexc('c0904a'), hexc('e8b870'), hexc('ffe0a8')), (0.35, y0, 2.85, y0 + 0.5), z0=z, edge=False)
        c.line((0.35, y0 + 0.02, z + 2), (2.85, y0 + 0.02, z + 2), WOOD[0]); c.line((0.35, y0 + 0.48, z + 2), (2.85, y0 + 0.48, z + 2), WOOD[0])
        for i, (dx, dy) in enumerate(((0, 0), (-0.1, -0.12), (-0.1, 0.12), (-0.2, 0))):
            c.pillar(2.7 + dx, y0 + 0.25 + dy, 2, 7, WHITE, z0=z + 2); sx, sy = c.spx(2.7 + dx, y0 + 0.25 + dy, z + 6); c.put(sx - 1, sy, RED[1]); c.put(sx, sy, RED[1])
        c.disc(0.7, y0 + 0.25, 0.07, 4, (RED if y0 < 1 else SKY), z0=z + 2)
    c.box(8, DARKWOOD, (0.15, 0.85, 0.55, 1.15), z0=z); sx, sy = c.spx(0.35, 1.0, z + 8); c.rect(sx - 3, sy - 3, 6, 3, BLACK[0]); c.put(sx - 2, sy - 2, MINT[1])   # 점수판
    c.outline()
    return c


def yoga_class() -> IsoCanvas:
    c = cv(30, 2, 1, shadow=0.85)
    deck(c, (0.02, 0.02, 1.98, 0.98), 4, PALEWOOD, 'y', 0.2)
    wall_segment(c, (0.02, 0.02, 1.98, 0.18), 22, (hexc('7a8a6a'), hexc('a8b890'), hexc('d8e8c8')))
    mirror = Canvas(40, 12); mirror.rect(0, 0, 40, 12, STEEL[2]); mirror.rect(1, 1, 38, 10, SKY[2]); mirror.hline(3, 20, 3, WHITE[2])
    paste_face(c, 'left', mirror, 6, 4)
    for x, col in ((0.45, MAT), (1.0, MINT), (1.55, PINK)):
        c.box(1, col, (x - 0.2, 0.35, x + 0.2, 0.9), z0=4, edge=False)
    sx, sy = c.spx(1.0, 0.62, 5); c.ellipse(sx, sy - 5, 2.5, 2.5, TAN[2]); c.rect(sx - 4, sy - 3, 8, 3, MAT[1]); c.put(sx - 5, sy - 2, TAN[2]); c.put(sx + 4, sy - 2, TAN[2])   # 앉은 사람
    plant_in_pot(c, 1.85, 0.3, 0.1, 5, CLAY, LEAF, 5)
    c.outline()
    return c


def fitness_corner() -> IsoCanvas:
    c = cv(30, shadow=0.45)
    c.box(2, (hexc('2a2a2e'), hexc('4a4a50'), hexc('6a6a70')), (0.02, 0.02, 0.98, 0.98), edge=False)
    c.box(3, BLACK, (0.15, 0.3, 0.55, 0.9), z0=2)                                     # 러닝머신
    c.box(1, STEEL, (0.2, 0.36, 0.5, 0.84), z0=5, edge=False)
    c.pillar(0.2, 0.32, 1, 16, STEEL, z0=5); c.pillar(0.5, 0.32, 1, 16, STEEL, z0=5)
    sx, sy = c.spx(0.35, 0.32, 21); c.rect(sx - 4, sy - 3, 8, 3, BLACK[0]); c.put(sx - 2, sy - 2, MINT[1]); c.put(sx + 1, sy - 2, RED[1])
    c.box(4, WOOD, (0.65, 0.2, 0.92, 0.5), z0=2)                                       # 덤벨 랙
    for y, col in ((0.26, RED), (0.36, SKY), (0.46, YELLOW)):
        sx, sy = c.spx(0.78, y, 6); c.hline(sx - 3, sx + 2, sy, STEEL[1]); c.rect(sx - 4, sy - 1, 2, 3, col[1]); c.rect(sx + 2, sy - 1, 2, 3, col[1])
    c.disc(0.78, 0.78, 0.12, 8, (hexc('6a2a8a'), hexc('9a50c0'), hexc('d0a0f0')), z0=2)   # 짐볼
    c.outline()
    return c


def flower_workshop() -> IsoCanvas:
    c = cv(38, pad=4, shadow=0.45)
    r = room(c, (0, 0, 1, 1), 22, CREAM, PALEWOOD, 'x', base_h=6, step=0.25)
    r.on_right(wall_sign(icon_flower(PINK), 20), 6, 2)
    r.on_left(shelf_face(14, 12, [icon_flower(RED), icon_flower(YELLOW)], 2), 3, 4)
    z = r.z
    c.box(9, WOOD, (0.3, 0.4, 0.9, 0.9), z0=z)
    for x, y, col in ((0.45, 0.55, RED), (0.65, 0.5, PINK), (0.8, 0.75, YELLOW)):
        plant_in_pot(c, x, y, 0.06, 4, CLAY, (col[0], col[1], col[2]), 3)
        sx, sy = c.spx(x, y, z + 13); c.put(sx, sy - 5, col[2])
    for x, y in ((0.2, 0.25), (0.9, 0.25)):
        c.disc(x, y, 0.08, 6, GLASS, z0=z); sx, sy = c.spx(x, y, z + 6); c.rect(sx - 1, sy - 5, 3, 5, LEAF[1]); c.put(sx, sy - 6, PINK[1]); c.put(sx + 1, sy - 7, PINK[2])
    c.outline()
    return c


def hair_salon() -> IsoCanvas:
    c = cv(38, pad=4, shadow=0.45)
    r = room(c, (0, 0, 1, 1), 24, (hexc('7a4f8a'), hexc('b080c0'), hexc('e0c0f0')), (hexc('b8ae9c'), hexc('e8e2d6'), hexc('f6f2ea')), 'x', base_h=4, step=0.25)
    mirror = Canvas(18, 12); mirror.rect(0, 0, 18, 12, GOLD[1]); mirror.rect(1, 1, 16, 10, SKY[2]); mirror.hline(3, 9, 3, WHITE[2])
    r.on_right(mirror, 8, 5)
    r.on_left(sign(14, 8, WHITE, icon_scissors()), 3, 3)
    z = r.z
    c.box(3, GLASS, (0.2, 0.15, 0.95, 0.4), z0=z + 8); c.pillar(0.35, 0.28, 1, 8, STEEL, z0=z); c.pillar(0.8, 0.28, 1, 8, STEEL, z0=z)   # 선반
    for x in (0.35, 0.6, 0.85):
        sx, sy = c.spx(x, 0.28, z + 11); c.rect(sx - 1, sy - 4, 2, 4, (PINK, SKY, YELLOW)[int(x * 4) % 3][1])   # 병
    CH = (hexc('8a2a3a'), hexc('c04050'), hexc('f08090'))
    c.pillar(0.5, 0.65, 3, 6, STEEL, z0=z); c.box(6, CH, (0.35, 0.5, 0.65, 0.8), z0=z + 6); c.box(8, CH, (0.35, 0.5, 0.42, 0.8), z0=z + 12, edge=False)
    sx, sy = c.spx(0.5, 0.65, z + 14); c.ellipse(sx, sy - 3, 3, 3, TAN[2]); c.rect(sx - 3, sy - 6, 6, 2, BROWN[1])   # 손님 머리
    c.pillar(0.88, 0.88, 1, 22, STEEL, z0=z); sx, sy = c.spx(0.88, 0.88, z + 22); c.rect(sx - 2, sy - 6, 4, 6, BLACK[0])   # 드라이어 스탠드
    c.outline()
    return c


def tarot_booth() -> IsoCanvas:
    c = cv(40, pad=6, shadow=0.45)
    c.box(3, PALEWOOD, (0.1, 0.1, 0.9, 0.9), edge=False)
    for x, y in ((0.14, 0.14), (0.86, 0.14), (0.14, 0.86), (0.86, 0.86)):
        c.pillar(x, y, 2, 24, WOOD, z0=3)
    c.box(24, LILAC, (0.1, 0.1, 0.9, 0.3), z0=3, edge=False)       # 뒤 휘장
    c.box(24, LILAC, (0.1, 0.1, 0.3, 0.9), z0=3, edge=False)
    sx, sy = c.spx(0.5, 0.2, 20); c.blit(icon_star(), sx - 4, sy - 3); sx, sy = c.spx(0.2, 0.55, 18); c.put(sx, sy, YELLOW[2]); c.put(sx - 2, sy + 3, YELLOW[2])
    # 원뿔 지붕
    for i, h in enumerate((0.42, 0.34, 0.26, 0.18, 0.1)):
        c.box(3, PURPLE, (0.5 - h, 0.5 - h, 0.5 + h, 0.5 + h), z0=27 + i * 3, edge=False)
    sx, sy = c.spx(0.5, 0.5, 42); c.put(sx, sy, YELLOW[2]); c.put(sx, sy - 1, YELLOW[1])
    c.disc(0.55, 0.6, 0.18, 8, VELVET, z0=3)
    sx, sy = c.spx(0.55, 0.6, 11); c.shade_ellipse(sx - 2, sy - 3, 2.5, 2.5, (hexc('4a6fa0'), hexc('8ab0e0'), hexc('d0e8ff')))   # 수정 구슬
    for dx in (2, 5):
        c.rect(sx + dx, sy - 1, 2, 3, WHITE[1]); c.put(sx + dx, sy - 1, PURPLE[1])   # 카드
    c.outline()
    return c


def magic_stage() -> IsoCanvas:
    c = cv(40, pad=6, shadow=0.45)
    deck(c, (0.05, 0.05, 0.95, 0.95), 8, DARKWOOD, 'x', 0.16)
    c.box(26, VELVET, (0.05, 0.05, 0.95, 0.22), z0=8, edge=False)     # 뒤 커튼
    c.box(26, VELVET, (0.05, 0.05, 0.22, 0.95), z0=8, edge=False)
    for u in range(4, 28, 6):
        c.line((0.22, 0.05 + u / 32, 8), (0.22, 0.05 + u / 32, 34), VELVET[0])
    c.pillar(0.85, 0.85, 1, 22, GOLD, z0=8); c.pillar(0.85, 0.15, 1, 22, GOLD, z0=8)
    c.line((0.85, 0.15, 30), (0.85, 0.85, 30), GOLD[1])
    for t in range(0, 6):
        sx, sy = c.spx(0.85, 0.2 + t * 0.13, 30); c.put(sx, sy + 1, YELLOW[2])   # 전구
    c.box(6, BLACK, (0.4, 0.45, 0.7, 0.7), z0=8); sx, sy = c.spx(0.55, 0.58, 14); c.rect(sx - 3, sy - 2, 6, 2, WHITE[1])   # 마술 상자
    sx, sy = c.spx(0.45, 0.4, 14); c.rect(sx - 3, sy - 3, 6, 3, BLACK[0]); c.rect(sx - 2, sy - 7, 4, 4, BLACK[0])   # 모자
    sx, sy = c.spx(0.65, 0.35, 22); c.put(sx, sy, WHITE[2]); c.put(sx + 1, sy - 1, WHITE[2]); c.put(sx + 2, sy, WHITE[2])   # 비둘기
    sx, sy = c.spx(0.6, 0.8, 14); c.hline(sx - 4, sx + 3, sy, BLACK[0]); c.put(sx + 3, sy, WHITE[2]); c.put(sx - 4, sy, WHITE[2])   # 지팡이
    c.outline()
    return c


def vintage_shop() -> IsoCanvas:
    c = cv(38, pad=4, shadow=0.45)
    r = room(c, (0, 0, 1, 1), 22, (hexc('6a5a4a'), hexc('9a8060'), hexc('c8b090')), DARKWOOD, 'x', base_h=6, step=0.25)
    r.on_right(shelf_face(20, 14, [icon_pot(), icon_note(), icon_pot()], 2), 5, 3)
    r.on_left(picture(9, 8, TERRA, YELLOW), 3, 4)
    r.on_left(picture(7, 7, NAVY, SKY), 14, 6)
    z = r.z
    c.box(10, WOOD, (0.3, 0.45, 0.8, 0.9), z0=z)
    sx, sy = c.spx(0.45, 0.6, z + 10); c.rect(sx - 3, sy - 4, 6, 4, BROWN[1]); c.rect(sx - 2, sy - 3, 2, 2, STEEL[2]); c.put(sx + 1, sy - 3, YELLOW[1])   # 라디오
    sx, sy = c.spx(0.68, 0.78, z + 10); c.ellipse(sx, sy - 1, 3, 1.5, WHITE[1]); c.ellipse(sx, sy - 1, 1.5, 0.8, SKY[1])   # 접시
    c.pillar(0.85, 0.3, 1, 14, STEEL, z0=z); sx, sy = c.spx(0.85, 0.3, z + 14); c.rect(sx - 3, sy - 4, 6, 4, CREAM[1]); c.hline(sx - 3, sx + 2, sy - 4, CREAM[2])   # 스탠드
    c.outline()
    return c


def clothing_shop() -> IsoCanvas:
    c = cv(34, 2, 1, pad=2, shadow=0.85)
    r, z = shop_2x1(c, CREAM, 'wood', icon_tshirt(SKY), [icon_tshirt(PINK), icon_tshirt(MINT), icon_tshirt(YELLOW)])
    # 옷걸이 랙 2
    for x0 in (0.35, 1.2):
        c.pillar(x0, 0.75, 1, 20, STEEL, z0=z); c.pillar(x0 + 0.45, 0.75, 1, 20, STEEL, z0=z)
        c.line((x0, 0.75, z + 20), (x0 + 0.45, 0.75, z + 20), STEEL[1])
        for i, col in enumerate((PINK, SKY, YELLOW, MINT)):
            sx, sy = c.spx(x0 + 0.08 + i * 0.1, 0.75, z + 19); c.rect(sx - 2, sy, 4, 8, col[1]); c.put(sx - 2, sy, col[2])
    sx, sy = c.spx(1.75, 0.5, z); c.rect(sx - 2, sy - 16, 4, 6, TAN[1]); c.rect(sx - 3, sy - 10, 6, 7, SKY[1]); c.vline(sx, sy - 3, sy, STEEL[1])   # 마네킹
    c.outline()
    return c


def flower_shop() -> IsoCanvas:
    c = cv(36, pad=4, shadow=0.45)
    building(c, (0.06, 0.06, 0.94, 0.94), 5, 18, (hexc('4f7a5a'), hexc('7fb08a'), hexc('c0e0c8')))
    paste_face(c, 'right', door_sprite(10, 13, WHITE), 3, 5)
    paste_face(c, 'left', sign(20, 8, WHITE, icon_flower(PINK)), 2, 3)
    awning(c, (0.06, 0.62, 0.94, 1.02), 16, MINT, WHITE, 'y')
    flat_roof(c, (0.06, 0.06, 0.94, 0.94), 23, SLATE)
    for x, y, col in ((0.98, 0.35, RED), (0.98, 0.6, YELLOW), (0.98, 0.85, PINK)):
        c.disc(x, y, 0.07, 5, CLAY); sx, sy = c.spx(x, y, 5); c.rect(sx - 1, sy - 4, 3, 4, LEAF[1]); c.put(sx, sy - 5, col[1]); c.put(sx + 1, sy - 6, col[2]); c.put(sx - 1, sy - 5, col[1])
    c.outline()
    return c


def home_theater() -> IsoCanvas:
    c = cv(38, pad=4, shadow=0.45)
    r = room(c, (0, 0, 1, 1), 24, (hexc('2a2a3e'), hexc('3e3e58'), hexc('6a6a88')), (hexc('3a2a4a'), hexc('4a3a60'), hexc('6a5a80')), 'x', base_h=0, step=0.25)
    scr = Canvas(22, 14); scr.rect(0, 0, 22, 14, BLACK[0]); scr.rect(1, 1, 20, 12, SKY[1]); scr.rect(3, 3, 6, 4, ORANGE[1]); scr.rect(12, 5, 7, 2, LEAF[1]); scr.rect(3, 9, 15, 1, WHITE[2])
    r.on_right(scr, 4, 3)
    r.on_left(sign(12, 8, BLACK, icon_film(), text=False), 3, 3)
    z = r.z
    SOFA = (hexc('5a1f2a'), hexc('8a3040'), hexc('b86070'))
    c.box(6, SOFA, (0.35, 0.45, 0.9, 0.7), z0=z); c.box(7, SOFA, (0.35, 0.64, 0.9, 0.7), z0=z + 6, edge=False)
    c.box(6, SOFA, (0.35, 0.75, 0.9, 0.95), z0=z); c.box(7, SOFA, (0.35, 0.9, 0.9, 0.95), z0=z + 6, edge=False)
    sx, sy = c.spx(0.6, 0.55, z + 6); c.rect(sx - 2, sy - 3, 4, 3, RED[1]); c.put(sx - 1, sy - 4, WHITE[2]); c.put(sx + 1, sy - 4, WHITE[2])   # 팝콘
    c.outline()
    return c


def concert_hall() -> IsoCanvas:
    c = cv(44, 2, 2, pad=4, shadow=1.0)
    r = room(c, (0, 0, 2, 2), 30, (hexc('3a1f2a'), hexc('6a2f40'), hexc('a05068')), DARKWOOD, 'x', base_h=6, step=0.3)
    ban = Canvas(30, 12); ban.rect(0, 0, 30, 12, VELVET[1]); ban.blit(icon_note(), 3, 2); ban.rect(13, 3, 12, 1, GOLD[2]); ban.rect(13, 7, 8, 1, GOLD[2]); ban.hline(0, 29, 0, GOLD[1]); ban.hline(0, 29, 11, GOLD[1])
    r.on_right(ban, 10, 4)
    r.on_left(door_sprite(14, 18, BLACK), 8, 8)
    z = r.z
    deck(c, (0.25, 0.25, 1.1, 0.9), 8, DARKWOOD, 'x', 0.2)   # 무대
    c.pillar(0.5, 0.5, 1, 14, STEEL, z0=z + 8); sx, sy = c.spx(0.5, 0.5, z + 22); c.blit(icon_mic(), sx - 2, sy - 6)
    sx, sy = c.spx(0.85, 0.55, z + 8); c.rect(sx - 5, sy - 6, 10, 6, hexc('c08040')); c.hline(sx - 4, sx + 3, sy - 3, BLACK[0]); c.rect(sx - 2, sy - 9, 3, 3, hexc('c08040'))   # 드럼
    c.box(8, BLACK, (1.2, 0.3, 1.5, 0.5), z0=z); sx, sy = c.spx(1.35, 0.4, z + 8); c.rect(sx - 2, sy - 2, 4, 2, STEEL[1])   # 스피커
    for y in (1.2, 1.55, 1.9):
        for x in (0.45, 0.85, 1.25, 1.65):
            c.box(5, VELVET, (x - 0.12, y - 0.1, x + 0.12, y + 0.1), z0=z); c.box(4, VELVET, (x - 0.12, y - 0.1, x + 0.12, y - 0.04), z0=z + 5, edge=False)
    for x in (0.4, 1.0, 1.6):
        sx, sy = c.spx(x, 0.32, r.top - 3); c.rect(sx - 2, sy - 2, 4, 3, BLACK[0]); c.put(sx - 1, sy + 1, YELLOW[2]); c.put(sx, sy + 1, YELLOW[2])   # 조명
    c.outline()
    return c


def pc_zone() -> IsoCanvas:
    c = cv(30, shadow=0.42)
    c.box(2, (hexc('2a2a3e'), hexc('3e3e58'), hexc('6a6a88')), (0.02, 0.02, 0.98, 0.98), edge=False)
    c.box(10, DARKWOOD, (0.15, 0.15, 0.9, 0.55), z0=2)
    for x in (0.35, 0.7):
        sx, sy = c.spx(x, 0.3, 12); c.rect(sx - 5, sy - 9, 10, 8, BLACK[0]); c.rect(sx - 4, sy - 8, 8, 6, SKY[1]); c.rect(sx - 3, sy - 7, 4, 1, WHITE[2]); c.rect(sx - 3, sy - 5, 6, 1, MINT[1]); c.rect(sx - 1, sy - 1, 2, 1, BLACK[0])   # 모니터
        sx, sy = c.spx(x, 0.46, 12); c.rect(sx - 3, sy - 1, 6, 2, STEEL[1])   # 키보드
    for x in (0.35, 0.7):
        chair_z(c, x, 0.78, 2, 'front', (hexc('2a2a2e'), hexc('4a4a50'), hexc('7a7a80')))
    sx, sy = c.spx(0.9, 0.15, 12); c.blit(icon_wifi(MINT[1]), sx - 4, sy - 8)
    c.outline()
    return c


def massage_booth() -> IsoCanvas:
    c = cv(36, pad=4, shadow=0.45)
    deck(c, (0.05, 0.05, 0.95, 0.95), 3, PALEWOOD, 'x', 0.16)
    for x, y in ((0.1, 0.1), (0.9, 0.1), (0.1, 0.9), (0.9, 0.9)):
        c.pillar(x, y, 2, 26, STEEL, z0=3)
    c.box(24, (hexc('2f6a5a'), hexc('4f9a80'), hexc('a0d0c0')), (0.1, 0.1, 0.9, 0.2), z0=3, edge=False)   # 뒤 커튼
    c.box(24, (hexc('2f6a5a'), hexc('4f9a80'), hexc('a0d0c0')), (0.1, 0.1, 0.2, 0.9), z0=3, edge=False)
    for u in range(3, 26, 5):
        c.line((0.2, 0.1 + u / 32, 3), (0.2, 0.1 + u / 32, 27), hexc('2f6a5a'))
    c.line((0.1, 0.1, 29), (0.9, 0.1, 29), STEEL[1]); c.line((0.1, 0.1, 29), (0.1, 0.9, 29), STEEL[1]); c.line((0.9, 0.1, 29), (0.9, 0.9, 29), STEEL[1]); c.line((0.1, 0.9, 29), (0.9, 0.9, 29), STEEL[1])
    c.box(8, WHITE, (0.3, 0.3, 0.85, 0.75), z0=3)                                                     # 안마 침대
    c.box(2, (hexc('2f6a5a'), hexc('4f9a80'), hexc('a0d0c0')), (0.32, 0.32, 0.83, 0.73), z0=11, edge=False)
    sx, sy = c.spx(0.4, 0.4, 13); c.rect(sx - 3, sy - 2, 6, 2, WHITE[2])   # 베개
    sx, sy = c.spx(0.78, 0.68, 13); c.put(sx, sy, TAN[2]); c.put(sx + 1, sy, TAN[2]); c.put(sx - 2, sy - 1, TAN[2])   # 발
    c.disc(0.85, 0.88, 0.07, 6, CLAY); sx, sy = c.spx(0.85, 0.88, 6); c.put(sx, sy - 1, LEAF[1])   # 오일 병
    c.outline()
    return c


def sprites() -> dict[str, Canvas]:
    s = {
        # 쉼
        'footbath': footbath(), 'drum_footbath': drum_footbath(), 'cauldron_footbath': cauldron_footbath(), 'lie_footbath': lie_footbath(),
        'hot_tub_terrace': hot_tub_terrace(), 'cool_footbath': cool_footbath(), 'open_air_footbath': open_air_footbath(),
        'waterfall_shower': waterfall_shower(), 'sauna_hut': sauna_hut(), 'massage_chair': massage_chair(), 'rest_pavilion': rest_pavilion(), 'lounge': lounge(),
        # 편의
        'atm': atm(), 'food_vending': food_vending(), 'cleaning_room': cleaning_room(), 'locker': locker(),
        # 먹거리
        'lemonade_cart': lemonade_cart(), 'sweet_potato_cart': sweet_potato_cart(), 'hanchi_cart': hanchi_cart(), 'candy_shop': candy_shop(),
        'tea_house': tea_house(), 'brunch_house': brunch_house(), 'fine_dining': fine_dining(),
        # 즐길거리
        'capsule_machine': capsule_machine(), 'pinball': pinball(), 'marble_game': marble_game(), 'retro_arcade': retro_arcade(),
        'shooting_booth': shooting_booth(), 'archery_range': archery_range(), 'pingpong': pingpong(), 'mini_bowling': mini_bowling(),
        'yoga_class': yoga_class(), 'fitness_corner': fitness_corner(), 'flower_workshop': flower_workshop(), 'hair_salon': hair_salon(),
        'tarot_booth': tarot_booth(), 'magic_stage': magic_stage(), 'vintage_shop': vintage_shop(), 'clothing_shop': clothing_shop(),
        'flower_shop': flower_shop(), 'home_theater': home_theater(), 'concert_hall': concert_hall(), 'pc_zone': pc_zone(), 'massage_booth': massage_booth(),
    }
    assert len(s) == 44, len(s)
    return {f'iso_obj_{k}': v for k, v in s.items()}
