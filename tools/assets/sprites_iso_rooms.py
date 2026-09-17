"""지붕 없는 방(Hot Springs Story 문법)으로 그린 본관·증축·화장실·창고: 바닥 + 뒤쪽 두 벽 + 실내 가구.
카페 본관 `iso_obj_warehouse`(lv1) / `_lv2`(새 페인트·큰 간판·차양) / `_lv3`(2층 난간·알전구)."""
from __future__ import annotations
from px import Canvas, hexc
from iso import IsoCanvas, paste_face
from sprites_objects import tangerine
from sprites_iso_objects import cv, cup, window_sprite, door_sprite, sign_sprite, PLASTER, SLATE, STONE3, GLASS, STEEL
from sprites_iso_facilities import books_face
from iso_parts import (room, table_set, chair_z, stool, counter_block, espresso_machine, shelf_face, picture, bottle_row,
                       standing_sign, wall_sign, tile_floor, plant_in_pot, string_lights, icon_cup, icon_cake, icon_tart,
                       icon_letter, sign, text_lines, awning, smoke,
                       LEAF, ORANGE, WOOD, BASALT, SKY, WHITE, RED, YELLOW, PINK, MINT, CREAM, CLAY, PALEWOOD, DARKWOOD,
                       BLACK, TAN, BROWN, NAVY)

TILE_A = (hexc('b8ae9c'), hexc('e8e2d6'), hexc('f6f2ea'))
TILE_B = hexc('cfc6b6')


def big_sign(w: int = 40) -> Canvas:
    """감귤 간판(sign_sprite 확장판)."""
    s = Canvas(w, 10)
    s.shade_rect(0, 0, w, 10, (WOOD[1], WOOD[2], hexc('e0a866')))
    for ox in (6, w - 7):
        s.shade_ellipse(ox, 5.5, 3, 2.8, ORANGE); s.put(ox + 1, 1, LEAF[1]); s.put(ox + 2, 1, LEAF[2])
    s.blit(icon_cup(), 12, 2)
    s.rect(21, 3, w - 34, 1, hexc('2b2118')); s.rect(21, 6, w - 36, 1, hexc('2b2118'))
    return s


def warehouse(level: int = 1) -> IsoCanvas:
    c = cv(50 if level < 3 else 66, 3, 2, pad=8, shadow=1.5)
    wall_h = 26 if level < 3 else 44
    wall = PLASTER if level == 1 else CREAM
    if level == 1:
        r = room(c, (0, 0, 3, 2), wall_h, wall, PALEWOOD, 'x', base_h=10, step=0.25)
    else:
        tile_floor(c, (0, 0, 3, 2), 3, TILE_A, TILE_B, 0.25)
        r = room(c, (0, 0, 3, 2), wall_h, wall, PALEWOOD, 'x', base_h=10, step=0.25)
        tile_floor(c, (0.12, 0.12, 3, 2), 3, TILE_A, TILE_B, 0.25)
    # 뒤-왼쪽 벽: 미닫이 문 + 창 / 뒤-오른쪽 벽: 창 2 + 간판
    r.on_left(door_sprite(20, 21), 18, wall_h + 10 - 21)
    r.on_left(window_sprite(12, 10), 44, 8)
    r.on_right(window_sprite(12, 10), 10, 9)
    r.on_right(window_sprite(12, 10), 76, 9)
    r.on_right(sign_sprite() if level == 1 else big_sign(44), 30 if level == 1 else 24, 2)
    if level >= 2:
        awning(c, (0.12, 0.85, 0.5, 1.55), r.top - 9, MINT, WHITE, 'y', 3)                   # 문 위 차양
    if level == 3:
        # 2층 난간(벽 위쪽 띠 + 난간)
        z2 = r.z + 10 + 26
        c.line((0.12, 0.12, z2), (0.12, 2, z2), wall[0]); c.line((0.12, 0.12, z2), (3, 0.12, z2), wall[0])
        c.line((0.12, 0.12, z2 - 1), (0.12, 2, z2 - 1), wall[2]); c.line((0.12, 0.12, z2 - 1), (3, 0.12, z2 - 1), wall[2])
        r.on_left(window_sprite(12, 9), 20, 4); r.on_left(window_sprite(12, 9), 44, 4)
        r.on_right(window_sprite(12, 9), 10, 4); r.on_right(window_sprite(12, 9), 76, 4)
        r.on_right(books_face(26, 14, 2), 36, 22)
        for x, y in ((0.2, 0.2), (0.2, 0.8), (0.2, 1.4), (0.2, 1.95), (0.8, 0.2), (1.4, 0.2), (2.0, 0.2), (2.6, 0.2), (2.95, 0.2)):
            c.pillar(x, y, 1, 9, WOOD, z0=z2)
        for z in (z2 + 4, z2 + 8):
            c.line((0.2, 0.2, z), (0.2, 1.95, z), WOOD[2]); c.line((0.2, 0.2, z), (2.95, 0.2, z), WOOD[2])
            c.line((0.2, 0.2, z - 1), (0.2, 1.95, z - 1), WOOD[0]); c.line((0.2, 0.2, z - 1), (2.95, 0.2, z - 1), WOOD[0])
    # 실내: 에스프레소 카운터(뒤-오른쪽 벽 앞) + 선반 + 테이블
    z = r.z
    top = counter_block(c, (0.5, 0.3, 2.3, 0.62), z)
    espresso_machine(c, 0.85, 0.4, top)
    c.pillar(1.25, 0.4, 3, 8, BLACK, z0=top); c.disc(1.25, 0.4, 0.06, 2, STEEL, z0=top + 8)
    for x, col in ((1.55, WHITE[1]), (1.75, RED[1]), (1.95, WHITE[1]), (2.15, YELLOW[1])):
        cup(c, x, 0.4, top, col)
    sx, sy = c.spx(2.1, 0.55, top); c.rect(sx - 3, sy - 5, 7, 4, BLACK[0]); c.rect(sx - 2, sy - 4, 5, 2, SKY[2])   # 포스
    for x in (0.9, 1.4, 1.9):
        stool(c, x, 0.82, z)
    if level == 1:
        table_set(c, 1.0, 1.4, z, (WHITE[1],)); table_set(c, 2.1, 1.4, z, (RED[1], WHITE[1]))
        plant_in_pot(c, 2.75, 1.75, 0.1, 6, CLAY, LEAF, 5)
        c.box(6, WOOD, (2.5, 0.25, 2.85, 0.6), z0=z); sx, sy = c.spx(2.68, 0.42, z + 6)
        for dx, dy in ((-3, -2), (0, -3), (3, -2), (-1, -1), (2, 0)):
            tangerine(c, sx + dx, sy + dy)
    else:
        table_set(c, 0.8, 1.35, z, (WHITE[1],), round_top=True); table_set(c, 1.6, 1.35, z, (RED[1], WHITE[1]), round_top=True)
        table_set(c, 2.4, 1.35, z, (YELLOW[1],), round_top=True)
        # 케이크 진열장
        c.box(9, WHITE, (2.5, 0.28, 2.88, 0.6), z0=z); c.box(1, STEEL, (2.48, 0.26, 2.9, 0.62), z0=z + 9, edge=False)
        for x, y, col in ((2.58, 0.4, PINK), (2.72, 0.36, YELLOW), (2.8, 0.5, RED)):
            c.disc(x, y, 0.06, 3, col, z0=z + 10)
        plant_in_pot(c, 2.75, 1.8, 0.1, 6, CLAY, LEAF, 5); plant_in_pot(c, 0.3, 1.8, 0.1, 6, CLAY, PINK, 5)
        if level == 3:
            string_lights(c, (0.12, 2.0, r.top - 2), (3.0, 0.12, r.top - 2), 10, 12)
            sx, sy = c.spx(1.9, 1.85, z); lp = Canvas(12, 10); lp.rect(0, 0, 12, 10, WOOD[0])
            for i, col in enumerate((RED, SKY, YELLOW, MINT)):
                lp.rect(1 + i * 3, 2, 2, 7, col[1]); lp.put(1 + i * 3, 2, col[2])
            c.box(9, WOOD, (1.75, 1.75, 2.05, 1.95), z0=z); c.blit(lp, sx - 6, sy - 18)
    c.outline()
    return c


def kitchen_ext() -> IsoCanvas:
    c = cv(34, 2, 1, pad=4, shadow=0.9)
    tile_floor(c, (0, 0, 2, 1), 3, TILE_A, TILE_B, 0.25)
    r = room(c, (0, 0, 2, 1), 22, PLASTER, PALEWOOD, 'x', base_h=6)
    tile_floor(c, (0.12, 0.12, 2, 1), 3, TILE_A, TILE_B, 0.25)
    r.on_right(window_sprite(14, 10), 12, 6)
    hood = Canvas(16, 6); hood.rect(0, 0, 16, 6, STEEL[1]); hood.hline(0, 15, 0, STEEL[2]); hood.rect(6, 6, 4, 0, STEEL[0]); r.on_right(hood, 36, 2)
    r.on_left(window_sprite(10, 9), 8, 6)
    z = r.z
    # 조리대 + 화구 + 냉장고
    top = counter_block(c, (0.2, 0.15, 1.5, 0.45), z, 12, STEEL, (STEEL[0], STEEL[1], STEEL[2]))
    for x in (0.5, 0.8):
        c.disc(x, 0.3, 0.07, 1, BLACK, z0=top)
    sx, sy = c.spx(0.5, 0.3, top + 1); c.rect(sx - 3, sy - 4, 6, 4, STEEL[1]); c.hline(sx - 3, sx + 2, sy - 4, STEEL[2]); smoke(c, sx, sy - 7, 2)   # 냄비
    sx, sy = c.spx(1.15, 0.3, top); c.rect(sx - 4, sy - 2, 8, 2, WOOD[2]); c.rect(sx - 2, sy - 3, 3, 1, RED[1])   # 도마
    c.box(24, STEEL, (1.62, 0.15, 1.92, 0.42), z0=z); sx, sy = c.spx(1.92, 0.3, z + 14); c.put(sx - 1, sy, STEEL[0]); c.put(sx - 1, sy + 1, STEEL[0])   # 냉장고
    for x in (0.4, 0.9, 1.4):
        cup(c, x, 0.75, z, WHITE[1])
    c.box(8, WOOD, (0.3, 0.6, 1.5, 0.85), z0=z)
    c.outline()
    return c


def restroom() -> IsoCanvas:
    c = cv(30, pad=2, shadow=0.45)
    tile_floor(c, (0, 0, 1, 1), 3, (hexc('9fbfd0'), hexc('cfe3ec'), hexc('eef7fb')), hexc('b8d4e0'), 0.25)
    r = room(c, (0, 0, 1, 1), 20, (hexc('9fbfd0'), hexc('cfe3ec'), hexc('eef7fb')), PALEWOOD, 'x', base_h=6)
    tile_floor(c, (0.12, 0.12, 1, 1), 3, (hexc('9fbfd0'), hexc('cfe3ec'), hexc('eef7fb')), hexc('b8d4e0'), 0.25)
    tag = Canvas(9, 6); tag.rect(0, 0, 4, 6, SKY[1]); tag.rect(5, 0, 4, 6, PINK[1]); tag.put(1, 1, WHITE[2]); tag.put(2, 1, WHITE[2]); tag.put(6, 1, WHITE[2]); tag.put(7, 1, WHITE[2])
    r.on_right(tag, 8, 3)
    mirror = Canvas(10, 8); mirror.rect(0, 0, 10, 8, STEEL[0]); mirror.rect(1, 1, 8, 6, GLASS[2]); mirror.put(2, 2, WHITE[2]); r.on_right(mirror, 20, 5)
    r.on_left(door_sprite(8, 13), 6, 7)
    z = r.z
    c.box(6, WHITE, (0.5, 0.2, 0.8, 0.42), z0=z); c.disc(0.65, 0.31, 0.09, 1, (SKY[0], SKY[1], SKY[2]), z0=z + 6)             # 세면대
    c.pillar(0.72, 0.25, 1, 4, STEEL, z0=z + 6)
    c.box(7, WHITE, (0.2, 0.55, 0.42, 0.8), z0=z); c.box(8, WHITE, (0.2, 0.55, 0.26, 0.8), z0=z + 7, edge=False)             # 변기
    c.disc(0.33, 0.68, 0.08, 1, (SKY[0], SKY[1], SKY[2]), z0=z + 7)
    c.box(14, WHITE, (0.46, 0.5, 0.5, 0.9), z0=z, edge=False)                                                                # 칸막이
    c.outline()
    return c


def storage() -> IsoCanvas:
    c = cv(30, 2, 1, pad=2, shadow=0.9)
    r = room(c, (0, 0, 2, 1), 22, WOOD, (hexc('6a6a72'), hexc('8a8a92'), hexc('b0b0b8')), 'x', base_h=0, step=0.3)
    r.on_right(shelf_face(40, 18, [icon_jar_orange(), icon_sack()], 2), 8, 3)
    r.on_left(door_sprite(10, 14), 10, 8)
    z = r.z
    for x, y in ((0.5, 0.55), (0.85, 0.7), (0.5, 0.85)):
        c.box(7, WOOD, (x - 0.15, y - 0.15, x + 0.15, y + 0.15), z0=z)
        sx, sy = c.spx(x, y, z + 7)
        for dx, dy in ((-3, -2), (0, -3), (3, -2), (-1, -1), (2, 0)):
            tangerine(c, sx + dx, sy + dy)
    for x, y in ((1.4, 0.5), (1.7, 0.75)):
        c.disc(x, y, 0.12, 9, TAN); sx, sy = c.spx(x, y, z + 9); c.hline(sx - 2, sx + 1, sy - 1, TAN[0])   # 자루
    c.outline()
    return c


def icon_jar_orange() -> Canvas:
    s = Canvas(5, 6); s.rect(0, 1, 5, 5, ORANGE[1]); s.put(0, 1, ORANGE[2]); s.put(4, 5, ORANGE[0]); s.rect(1, 0, 3, 1, WOOD[0]); return s


def icon_sack() -> Canvas:
    s = Canvas(6, 6); s.shade_ellipse(2.5, 3.5, 2.8, 2.5, TAN); s.rect(2, 0, 2, 2, TAN[0]); return s


def sprites() -> dict[str, Canvas]:
    return {
        'iso_obj_warehouse': warehouse(1), 'iso_obj_warehouse_lv2': warehouse(2), 'iso_obj_warehouse_lv3': warehouse(3),
        'iso_obj_kitchen_ext': kitchen_ext(), 'iso_obj_restroom': restroom(), 'iso_obj_storage': storage(),
    }
