"""지붕 없는 방(Hot Springs Story 문법)으로 그린 본관·증축·화장실·창고: 바닥 + 뒤쪽 두 벽 + 실내 가구.
카페 본관 `iso_obj_warehouse`(Lv1 3×2) / `_lv2`(4×3) / `_lv3`(5×3) / `_lv4`(6×4) — 증축 스펙 §8.1, 렌더는 state.main.level로 고른다.
2층 띠 `iso_obj_warehouse_floor2_lv3`/`_lv4`(본관 벽 위 오버레이), 별관 `annex_cafe`(4×3)·`greenhouse_cafe`(3×3), 실내 가구 7종(§8.3)."""
from __future__ import annotations
from px import Canvas, hexc
from iso import IsoCanvas, paste_face
from sprites_objects import tangerine
from sprites_iso_objects import cv, cup, window_sprite, door_sprite, sign_sprite, PLASTER, SLATE, STONE3, GLASS, STEEL
from sprites_iso_facilities import books_face
from iso_parts import (room, Room, table_set, chair_z, stool, counter_block, espresso_machine, shelf_face, picture, bottle_row, glass_box,
                       standing_sign, wall_sign, tile_floor, plant_in_pot, string_lights, icon_cup, icon_cake, icon_tart, translucent,
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


# ---------------------------------------------------------------- 본관 증축 Lv2~4 (§8.1) · 2층 띠 · 별관 · 실내 가구 (y-indoor)
MAIN_SIZES = {2: (4, 3), 3: (5, 3), 4: (6, 4)}
MAIN_WALL_H = {2: 28, 3: 34, 4: 40}
FLOOR2_BAND_H = 22


def _hall_walls(c: IsoCanvas, w: int, h: int, wall_h: int, wall, sign_w: int) -> Room:
    """타일 바닥 + 두 벽 + 문(정면 왼쪽 칸) + 창 + 간판. 왼쪽 벽은 h칸(앞에서 뒤로), 오른쪽 벽은 w칸(모서리에서 오른쪽으로), 칸당 32px."""
    tile_floor(c, (0, 0, w, h), 3, TILE_A, TILE_B, 0.25)
    r = room(c, (0, 0, w, h), wall_h, wall, PALEWOOD, 'x', base_h=10, step=0.25)
    tile_floor(c, (0.12, 0.12, w, h), 3, TILE_A, TILE_B, 0.25)
    r.on_left(door_sprite(20, 21), 6, wall_h + 10 - 21)                     # 문: 정면 왼쪽 칸(앞쪽 첫 32px)
    for k in range(1, h):
        r.on_left(window_sprite(14, 11), 8 + k * 32, 8)
    r.on_right(big_sign(sign_w), int(w * 32 / 2 - sign_w / 2) + 6, 2)     # 간판: 오른쪽 벽 가운데 위
    for k in range(w):
        u = 12 + k * 32
        r.on_right(window_sprite(14, 11), u, 14 if wall_h >= 30 else 13)
    awning(c, (0.12, h - 1.15, 0.5, h - 0.45), r.top - 9, MINT, WHITE, 'y', 3)  # 문 위 차양
    return r


def _hall_interior(c: IsoCanvas, r: Room, w: int, h: int, level: int) -> None:
    """뒤-오른쪽 벽 앞 에스프레소 카운터(왼쪽 위 벽에 붙음) + 원탁들 + 화분 + 케이크 진열장. Lv4는 알전구."""
    z = r.z
    top = counter_block(c, (0.5, 0.3, min(2.3, w - 0.9), 0.62), z)
    espresso_machine(c, 0.85, 0.4, top)
    c.pillar(1.25, 0.4, 3, 8, BLACK, z0=top); c.disc(1.25, 0.4, 0.06, 2, STEEL, z0=top + 8)
    for x, col in ((1.55, WHITE[1]), (1.75, RED[1]), (1.95, WHITE[1])):
        cup(c, x, 0.4, top, col)
    for x in (0.9, 1.4, 1.9):
        stool(c, x, 0.82, z)
    # 케이크 진열장 (카운터 오른쪽)
    cx0 = min(2.5, w - 0.9)
    c.box(9, WHITE, (cx0, 0.28, cx0 + 0.38, 0.6), z0=z); c.box(1, STEEL, (cx0 - 0.02, 0.26, cx0 + 0.4, 0.62), z0=z + 9, edge=False)
    for dx, dy, col in ((0.08, 0.4, PINK), (0.22, 0.36, YELLOW), (0.3, 0.5, RED)):
        c.disc(cx0 + dx, dy, 0.06, 3, col, z0=z + 10)
    # 장식 원탁은 오른쪽 벽가 한 줄만 — 나머지 바닥은 플레이어가 실내 가구(§8.3)를 놓는 자리
    cups = ((WHITE[1],), (RED[1], WHITE[1]), (YELLOW[1],), (WHITE[1], SKY[2]))
    for i, ty in enumerate(range(1, h - 1)):
        table_set(c, w - 0.45, ty + 0.5, z, cups[i % 4], round_top=True)
    plant_in_pot(c, w - 0.3, h - 0.3, 0.1, 6, CLAY, LEAF, 5); plant_in_pot(c, 0.3, h - 0.25, 0.1, 6, CLAY, PINK, 5)
    if level >= 4:
        string_lights(c, (0.4, h - 0.4, r.top - 2), (w - 0.4, 0.4, r.top - 2), 10, 14)


def main_hall(level: int) -> IsoCanvas:
    w, h = MAIN_SIZES[level]
    wall_h = MAIN_WALL_H[level]
    c = cv(wall_h + 34, w, h, pad=8, shadow=1.6 + 0.4 * (w - 3))
    r = _hall_walls(c, w, h, wall_h, CREAM if level < 4 else (hexc('c8b8d8'), hexc('e6dcf0'), hexc('f6f0fb')), 44 + (w - 3) * 8)
    _hall_interior(c, r, w, h, level)
    c.outline()
    return c


def floor2_band(level: int) -> IsoCanvas:
    """본관 벽 위에 얹는 2층 띠 오버레이 — 같은 발자국(w×h)이라 하단 중앙 앵커가 본관 스프라이트와 맞는다. 벽 위쪽 띠 + 창 + 지붕 난간선만 그린다."""
    w, h = MAIN_SIZES[level]
    wall_h = MAIN_WALL_H[level]
    c = cv(wall_h + 34 + FLOOR2_BAND_H, w, h, pad=8)
    t = 0.12
    r = Room(c, (0, 0, w, h), FLOOR2_BAND_H, t, 3, 10 + wall_h)
    corner = c.sx_of(t, t); left_end = c.sx_of(t, h)
    side = lambda px: px >= corner or px < left_end
    wall = (hexc('b8a890'), hexc('e8dcc4'), hexc('f8f2e6'))
    c.boxes([r.r_left, r.r_right], FLOOR2_BAND_H, wall, z0=3 + 10 + wall_h, side_fn=side)
    c.line((t, t, 3 + 10 + wall_h), (t, t, 3 + 10 + wall_h + FLOOR2_BAND_H), wall[0])
    for k in range(h):
        r.on_left(window_sprite(14, 11), 8 + k * 32, 5)
    for k in range(w):
        r.on_right(window_sprite(14, 11), 12 + k * 32, 5)
    r.on_right(books_face(22, 12, 2), int(w * 32 / 2 - 11) + 6, 6) if w >= 5 else None
    z2 = r.top
    c.line((t, t, z2), (t, h, z2), WOOD[0]); c.line((t, t, z2), (w, t, z2), WOOD[0])
    c.outline()
    return c


def annex_cafe() -> IsoCanvas:
    """카페 별관 4×3: 흰 벽·초록 차양, 안에 원탁 6."""
    w, h = 4, 3
    c = cv(60, w, h, pad=8, shadow=1.8)
    tile_floor(c, (0, 0, w, h), 3, TILE_A, TILE_B, 0.25)
    r = room(c, (0, 0, w, h), 26, PLASTER, PALEWOOD, 'x', base_h=8, step=0.25)
    tile_floor(c, (0.12, 0.12, w, h), 3, TILE_A, TILE_B, 0.25)
    r.on_left(door_sprite(20, 21), 6, 26 + 8 - 21)
    for k in range(1, h):
        r.on_left(window_sprite(14, 11), 8 + k * 32, 7)
    r.on_right(wall_sign(icon_cup(), 26), 52, 3)
    for k in range(w):
        r.on_right(window_sprite(14, 11), 12 + k * 32, 12)
    awning(c, (0.12, h - 1.15, 0.5, h - 0.45), r.top - 9, LEAF, WHITE, 'y', 3)
    z = r.z
    cups = ((WHITE[1],), (RED[1], WHITE[1]), (YELLOW[1],))
    i = 0
    for ty in range(h):
        for tx in range(w):
            if (tx == 0 and ty == h - 1) or ty == 1:
                continue
            table_set(c, tx + 0.55, ty + 0.5, z, cups[i % 3], round_top=True); i += 1
    plant_in_pot(c, w - 0.3, h - 0.3, 0.1, 6, CLAY, LEAF, 5)
    c.outline()
    return c


def greenhouse_cafe() -> IsoCanvas:
    """온실 카페 3×3: 낮은 돌 기단 + 유리 벽(반투명) + 안에 화분·테이블. 지붕 없음(방 문법)."""
    w, h = 3, 3
    c = cv(52, w, h, pad=8, shadow=1.5)
    r = room(c, (0, 0, w, h), 4, STONE3, PALEWOOD, 'y', base_h=4, step=0.3)
    glass_box(c, (0, 0, w, 0.12), 24, z0=r.top, alpha=120)
    glass_box(c, (0, 0, 0.12, h), 24, z0=r.top, alpha=120)
    r.on_left(door_sprite(18, 19), 7, 8 - 19 + 4)
    z = r.z
    for x, y, leaf in ((0.5, 0.5, LEAF), (1.5, 0.45, PINK), (2.5, 0.5, YELLOW), (2.6, 1.5, LEAF), (0.4, 1.6, LEAF)):
        plant_in_pot(c, x, y, 0.13, 7, CLAY, leaf, 6)
    table_set(c, 1.55, 1.5, z, (WHITE[1],), round_top=True); table_set(c, 2.5, 2.4, z, (SKY[2], WHITE[1]), round_top=True); table_set(c, 1.5, 2.45, z, (RED[1],), round_top=True)
    c.outline()
    return c


def sofa_seat() -> IsoCanvas:
    """푹신 소파석 2×1 (테라코타 소파 + 쿠션 3 + 낮은 탁자)."""
    c = cv(26, 2, 1, shadow=0.75)
    SOFA = (hexc('7a3a2a'), hexc('b8563a'), hexc('e0906a'))
    c.box(6, SOFA, (0.1, 0.1, 1.9, 0.6))
    c.box(10, SOFA, (0.1, 0.1, 1.9, 0.22), z0=6, edge=False)
    c.box(8, SOFA, (0.1, 0.1, 0.24, 0.6), z0=6, edge=False); c.box(8, SOFA, (1.76, 0.1, 1.9, 0.6), z0=6, edge=False)
    for x, col in ((0.36, YELLOW), (0.88, MINT), (1.4, SKY)):
        c.box(2, col, (x, 0.26, x + 0.24, 0.5), z0=6, edge=False)
    c.box(8, WOOD, (0.6, 0.66, 1.4, 0.94))
    cup(c, 0.8, 0.8, 8); cup(c, 1.2, 0.8, 8, RED[1])
    c.outline()
    return c


def bar_counter() -> IsoCanvas:
    """바 카운터 2×1: 긴 카운터 + 병 선반 + 스툴 3."""
    c = cv(30, 2, 1, pad=2, shadow=0.8)
    top = counter_block(c, (0.1, 0.1, 1.9, 0.42), 0, 14, DARKWOOD)
    for x, col in ((0.35, MINT), (0.6, ORANGE), (0.85, SKY), (1.1, YELLOW), (1.35, RED), (1.6, PINK)):
        c.pillar(x, 0.25, 2, 6, col, z0=top); sx, sy = c.spx(x, 0.25, top + 6); c.put(sx, sy - 1, col[2])
    cup(c, 0.5, 0.36, top, WHITE[1]); cup(c, 1.5, 0.36, top, WHITE[1])
    for x in (0.4, 1.0, 1.6):
        stool(c, x, 0.75, 0, WOOD, 9)
    c.outline()
    return c


def fireplace() -> IsoCanvas:
    """난로 1×1: 무쇠 난로 + 불꽃 + 연통."""
    c = cv(34, pad=2, shadow=0.5)
    c.box(14, BLACK, (0.25, 0.3, 0.75, 0.75))
    sx, sy = c.spx(0.5, 0.75, 7)
    c.rect(sx - 4, sy - 4, 8, 6, hexc('ff8a2a')); c.rect(sx - 2, sy - 5, 4, 4, YELLOW[2]); c.put(sx, sy - 6, YELLOW[2]); c.put(sx - 3, sy - 3, RED[1])
    c.pillar(0.5, 0.45, 3, 16, BASALT, z0=14)
    sx, sy = c.spx(0.5, 0.45, 30); c.rect(sx - 3, sy - 2, 6, 2, BASALT[0])
    smoke(c, sx, sy - 5, 2)
    c.disc(0.5, 0.52, 0.32, 1, STONE3)
    c.outline()
    return c


def piano() -> IsoCanvas:
    """피아노 2×1: 검은 업라이트 + 건반 + 의자."""
    c = cv(32, 2, 1, pad=2, shadow=0.8)
    c.box(22, BLACK, (0.15, 0.12, 1.85, 0.5))
    keys = Canvas(46, 5); keys.rect(0, 0, 46, 5, WHITE[2])
    for x in range(2, 46, 4):
        keys.rect(x, 0, 2, 3, BLACK[0])
    c.last_box = c.last_box; paste_face(c, 'left', keys, 3, 12)
    c.box(3, BLACK, (0.1, 0.5, 1.9, 0.6), z0=12, edge=False)  # 건반 받침
    sx, sy = c.spx(1.0, 0.3, 22); c.rect(sx - 8, sy - 3, 16, 2, WHITE[2])   # 악보
    stool(c, 1.0, 0.82, 0, BLACK, 7)
    c.outline()
    return c


def aquarium() -> IsoCanvas:
    """수족관 1×1: 나무 받침 + 유리 수조 + 물고기."""
    c = cv(30, pad=2, shadow=0.5)
    c.box(8, WOOD, (0.15, 0.2, 0.85, 0.8))
    translucent(c, lambda t: t.box(14, (hexc('2f7fa8'), hexc('4fb0e0'), hexc('a8e0f8')), (0.18, 0.22, 0.82, 0.78), z0=8, edge=False), 170)
    for dx, dy, col in ((-5, -6, ORANGE[1]), (2, -9, YELLOW[1]), (5, -4, RED[1])):
        sx, sy = c.spx(0.5, 0.5, 8); c.rect(sx + dx, sy + dy, 3, 2, col); c.put(sx + dx - 1, sy + dy + 1, col)
    sx, sy = c.spx(0.5, 0.5, 8); c.rect(sx - 6, sy - 1, 3, 2, LEAF[1]); c.rect(sx + 4, sy - 2, 2, 3, LEAF[2])
    glass_box(c, (0.18, 0.22, 0.82, 0.78), 14, z0=8, alpha=90)
    c.outline()
    return c


def kids_corner() -> IsoCanvas:
    """키즈 코너 2×2: 알록달록 매트 + 블록 + 미니 미끄럼틀."""
    c = cv(26, 2, 2, pad=2, shadow=1.1)
    tile_floor(c, (0.1, 0.1, 1.9, 1.9), 2, (SKY[0], SKY[1], SKY[2]), YELLOW[1], 0.45)
    for x, y, col, hh in ((0.4, 0.4, RED, 6), (0.62, 0.4, YELLOW, 6), (0.51, 0.4, MINT, 12), (1.5, 0.45, PINK, 5), (1.7, 0.6, LEAF, 5)):
        c.box(hh, col, (x - 0.1, y - 0.1, x + 0.1, y + 0.1), z0=2)
    # 미끄럼틀: 사다리 기둥 + 경사판
    c.pillar(1.55, 1.2, 2, 14, WOOD, z0=2); c.pillar(1.75, 1.2, 2, 14, WOOD, z0=2)
    c.box(2, YELLOW, (1.5, 1.15, 1.8, 1.3), z0=16, edge=False)
    p0 = c.screen(1.65, 1.3, 16); p1 = c.screen(1.65, 1.85, 2)
    for i in range(6):
        t = i / 5
        sx, sy = int(p0[0] + (p1[0] - p0[0]) * t), int(p0[1] + (p1[1] - p0[1]) * t)
        c.rect(sx - 4, sy, 8, 2, YELLOW[1]); c.hline(sx - 4, sx + 3, sy, YELLOW[2])
    c.disc(0.5, 1.5, 0.22, 3, (hexc('8a4a7a'), hexc('c070b0'), hexc('f0a8e0')), z0=2)  # 공 웅덩이
    for dx, dy, col in ((-3, -3, RED[1]), (2, -4, SKY[2]), (0, -1, YELLOW[1]), (4, -1, MINT[1])):
        sx, sy = c.spx(0.5, 1.5, 5); c.rect(sx + dx, sy + dy, 2, 2, col)
    c.outline()
    return c


def counter_ext() -> IsoCanvas:
    """카운터 확장 1×1: 카운터 한 칸 + 포스 + 컵."""
    c = cv(24, pad=2, shadow=0.5)
    top = counter_block(c, (0.1, 0.2, 0.9, 0.55), 0)
    sx, sy = c.spx(0.35, 0.38, top); c.rect(sx - 3, sy - 6, 7, 5, BLACK[0]); c.rect(sx - 2, sy - 5, 5, 3, SKY[2])
    cup(c, 0.65, 0.35, top, WHITE[1]); cup(c, 0.8, 0.4, top, RED[1])
    c.box(3, WOOD, (0.15, 0.62, 0.85, 0.85))
    c.outline()
    return c


def sprites() -> dict[str, Canvas]:
    return {
        'iso_obj_warehouse': warehouse(1), 'iso_obj_warehouse_lv2': main_hall(2), 'iso_obj_warehouse_lv3': main_hall(3), 'iso_obj_warehouse_lv4': main_hall(4),
        'iso_obj_warehouse_floor2_lv3': floor2_band(3), 'iso_obj_warehouse_floor2_lv4': floor2_band(4),
        'iso_obj_kitchen_ext': kitchen_ext(), 'iso_obj_restroom': restroom(), 'iso_obj_storage': storage(),
        'iso_obj_annex_cafe': annex_cafe(), 'iso_obj_greenhouse_cafe': greenhouse_cafe(),
        'iso_obj_sofa_seat': sofa_seat(), 'iso_obj_bar_counter': bar_counter(), 'iso_obj_fireplace': fireplace(), 'iso_obj_piano': piano(),
        'iso_obj_aquarium': aquarium(), 'iso_obj_kids_corner': kids_corner(), 'iso_obj_counter_ext': counter_ext(),
    }
