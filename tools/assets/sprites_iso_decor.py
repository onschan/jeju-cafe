"""카페 장식 20종 `iso_obj_deco_*`(decor_list.DECOR) + 실내 바닥 3종 `iso_tile_floor_*` + 에스프레소 카운터·메뉴판.
장식은 1×1(알전구 줄·빨래줄은 2×1). 바닥 타일은 계절 없음, 외곽선 없음."""
from __future__ import annotations
from px import Canvas, OUT, hexc, Color
from iso import IsoCanvas, iso_tile, paste_face, diamond_mask, fill_mask, texture_where
from sprites_objects import tangerine
from sprites_iso_tiles import clip
from sprites_iso_objects import cv, billboard, chair, cup, window_sprite, PLASTER, SLATE, STONE3, GLASS, STEEL
from sprites_iso_env import dolhareubang_sprite
from sprites_iso_facilities import books_face
from iso_parts import (plant_in_pot, string_lights, cat2d, bicycle2d, icon_cup, icon_cake, icon_tart, text_lines, sign, fence,
                       LEAF, ORANGE, WOOD, BASALT, SKY, WHITE, RED, YELLOW, GRASS, PINK, MINT, CREAM, CLAY, TAN,
                       PALEWOOD, DARKWOOD, BLACK, BROWN, PURPLE, NAVY)
from decor_list import DECOR_IDS


# ================================================================ 장식
def deco_planter() -> IsoCanvas:
    c = cv(30, shadow=0.36)
    c.box(10, (hexc('6a6a72'), hexc('8a8a92'), hexc('b8b8c0')), (0.3, 0.3, 0.7, 0.7))
    sx, sy = c.spx(0.5, 0.5, 10)
    dk, md, lt = LEAF
    for dx, dy, r in ((-5, -6, 4), (5, -7, 4), (0, -12, 4.5), (-2, -4, 3), (3, -3, 3)):
        c.ellipse(sx + dx, sy + dy, r, r * 0.8, md)
    c.ellipse(sx - 4, sy - 12, 3, 2.2, lt); c.ellipse(sx + 2, sy - 15, 2, 1.6, lt)
    c.put(sx + 6, sy - 4, dk); c.put(sx + 4, sy - 9, dk); c.put(sx - 6, sy - 3, dk)
    c.outline()
    return c


def deco_lamp_post() -> IsoCanvas:
    c = cv(40, shadow=0.24)
    c.box(3, BLACK, (0.4, 0.4, 0.6, 0.6))
    c.pillar(0.5, 0.5, 2, 30, BLACK, z0=3)
    sx, sy = c.spx(0.5, 0.5, 33)
    c.rect(sx - 3, sy - 6, 6, 6, YELLOW[1]); c.rect(sx - 2, sy - 5, 3, 3, YELLOW[2]); c.hline(sx - 4, sx + 3, sy - 7, BLACK[0]); c.put(sx - 1, sy - 8, BLACK[0]); c.put(sx, sy - 8, BLACK[0])
    c.hline(sx - 3, sx + 2, sy, BLACK[0])
    c.outline()
    return c


def deco_string_lights() -> IsoCanvas:
    c = cv(36, 2, 1, shadow=None)
    c.ground_shadow(0.15, 0.85, 0.16); c.ground_shadow(1.85, 0.15, 0.16)
    c.pillar(0.15, 0.85, 2, 32, WOOD); c.pillar(1.85, 0.15, 2, 32, WOOD)
    string_lights(c, (0.15, 0.85, 31), (1.85, 0.15, 31), 7, 9)
    c.outline()
    return c


def deco_chalkboard() -> IsoCanvas:
    s = Canvas(20, 28)
    s.rect(2, 22, 3, 6, WOOD[0]); s.rect(15, 22, 3, 6, WOOD[0]); s.hline(4, 15, 25, WOOD[1])
    s.rect(1, 1, 18, 22, WOOD[1]); s.hline(1, 18, 1, WOOD[2]); s.vline(1, 1, 22, WOOD[2])
    s.rect(3, 3, 14, 18, hexc('2f4a3a'))
    s.rect(5, 5, 8, 1, WHITE[2]); s.rect(5, 8, 10, 1, WHITE[1]); s.rect(5, 11, 6, 1, YELLOW[1]); s.rect(5, 14, 9, 1, WHITE[1]); s.rect(5, 17, 7, 1, PINK[1])
    s.blit(icon_cup(), 12, 12)
    return billboard(s, 0.28)


def deco_cake_case() -> IsoCanvas:
    c = cv(30, shadow=0.42)
    c.box(10, WHITE, (0.15, 0.25, 0.85, 0.75))
    c.box(2, STEEL, (0.12, 0.22, 0.88, 0.78), z0=10, edge=False)
    face = Canvas(24, 8); face.rect(0, 0, 24, 8, GLASS[1]); face.hline(0, 23, 0, WHITE[2])
    for i, ic in enumerate((icon_cake(), icon_tart(), icon_cake())):
        face.blit(ic, 1 + i * 8, 8 - ic.h)
    paste_face(c, 'left', face, 3, 1)
    for x, y, col in ((0.35, 0.42, PINK), (0.55, 0.38, YELLOW), (0.72, 0.46, (hexc('5a3a2a'), hexc('7a4a34'), hexc('a8705a')))):
        c.disc(x, y, 0.09, 4, col, z0=12); sx, sy = c.spx(x, y, 16); c.put(sx, sy - 1, RED[1])
    from iso_parts import glass_box
    glass_box(c, (0.15, 0.25, 0.85, 0.75), 12, z0=12, alpha=70)
    c.outline()
    return c


def deco_coffee_machine() -> IsoCanvas:
    c = cv(30, shadow=0.4)
    c.box(12, DARKWOOD, (0.2, 0.25, 0.8, 0.75))
    c.box(2, WOOD, (0.16, 0.21, 0.84, 0.79), z0=12, edge=False)
    c.box(12, STEEL, (0.3, 0.3, 0.7, 0.62), z0=14)
    face = Canvas(10, 8); face.rect(0, 0, 10, 8, STEEL[0]); face.rect(1, 1, 3, 2, RED[1]); face.rect(5, 1, 4, 2, BLACK[0]); face.rect(2, 5, 6, 1, STEEL[2])
    paste_face(c, 'left', face, 2, 2)
    sx, sy = c.spx(0.5, 0.46, 26); c.rect(sx - 4, sy - 3, 8, 3, STEEL[2]); c.hline(sx - 4, sx + 3, sy - 3, WHITE[2])
    c.pillar(0.64, 0.4, 1, 8, STEEL, z0=26); sx, sy = c.spx(0.64, 0.4, 34); c.put(sx, sy, BLACK[0])   # 스팀 완드
    cup(c, 0.42, 0.7, 14); cup(c, 0.62, 0.7, 14, WHITE[1])
    for dx, dy in ((-3, -30), (-1, -34)):
        c.put(c.mid + dx, c.h - 16 + dy, WHITE[1])
    c.outline()
    return c


def deco_lp_shelf() -> IsoCanvas:
    c = cv(30, shadow=0.42)
    c.box(22, WOOD, (0.2, 0.1, 0.8, 0.35))
    lp = Canvas(18, 14); lp.rect(0, 0, 18, 14, WOOD[0])
    for i, col in enumerate((RED, SKY, YELLOW, PURPLE, MINT, ORANGE, PINK, LEAF)):
        x = 1 + (i % 4) * 4; y = 1 + (i // 4) * 7
        lp.rect(x, y, 3, 5, col[1]); lp.put(x, y, col[2]); lp.put(x + 2, y + 4, col[0])
    paste_face(c, 'left', lp, 2, 4)
    c.box(2, STEEL, (0.3, 0.12, 0.7, 0.32), z0=22, edge=False)
    sx, sy = c.spx(0.5, 0.22, 24); c.ellipse(sx, sy, 5, 2.5, BLACK[0]); c.ellipse(sx, sy, 1.5, 0.8, RED[1]); c.put(sx + 5, sy - 2, STEEL[0]); c.put(sx + 6, sy - 3, STEEL[0])   # 턴테이블
    sx, sy = c.spx(0.3, 0.7, 0); c.rect(sx - 4, sy - 6, 8, 6, RED[1]); c.hline(sx - 4, sx + 3, sy - 6, RED[2]); c.ellipse(sx, sy - 3, 2, 2, BLACK[0])   # 바닥 LP 한 장
    c.outline()
    return c


def deco_bookshelf_small() -> IsoCanvas:
    c = cv(28, shadow=0.42)
    c.box(24, WOOD, (0.15, 0.1, 0.85, 0.36))
    paste_face(c, 'left', books_face(20, 20, 2), 2, 2)
    paste_face(c, 'right', books_face(7, 20, 2), 1, 2)
    sx, sy = c.spx(0.5, 0.23, 24); c.rect(sx - 2, sy - 3, 4, 3, CLAY[1]); c.put(sx - 2, sy - 3, CLAY[2]); c.rect(sx - 2, sy - 6, 4, 3, LEAF[1]); c.put(sx - 2, sy - 6, LEAF[2])
    c.outline()
    return c


def mini_dolhareubang() -> Canvas:
    """미니 돌하르방 11×17."""
    s = Canvas(11, 17)
    dk, md, lt = STONE3
    s.shade_rect(2, 11, 7, 6, STONE3)
    s.shade_ellipse(5, 10, 4, 3.5, STONE3)
    s.shade_ellipse(5, 5, 3.5, 3.5, STONE3)
    s.shade_ellipse(5, 1.5, 4, 1.5, STONE3); s.rect(3, 0, 5, 1, md)
    s.put(3, 4, dk); s.put(6, 4, dk); s.rect(5, 5, 1, 2, dk); s.hline(4, 6, 8, dk)
    s.rect(1, 10, 2, 3, md); s.rect(8, 11, 2, 3, md); s.put(1, 10, lt); s.put(8, 11, lt)
    return s


def deco_dolhareubang_set() -> IsoCanvas:
    c = cv(24, shadow=0.42)
    c.box(3, STONE3, (0.1, 0.1, 0.9, 0.9))
    for x, y in ((0.32, 0.64), (0.66, 0.34)):
        d = mini_dolhareubang(); d.outline()
        c.billboard(d, x, y, 3)
    c.outline()
    return c


def deco_water_jar_set() -> IsoCanvas:
    c = cv(24, shadow=0.42)
    dk, md, lt = CLAY
    for x, y, r, h in ((0.34, 0.66, 0.16, 11), (0.68, 0.36, 0.14, 9), (0.72, 0.74, 0.1, 7)):
        c.disc(x, y, r, h, CLAY)
        sx, sy = c.spx(x, y, h)
        rx, ry = r * 32 * 1.4142, r * 16 * 1.4142
        c.shade_ellipse(sx - 0.5, sy - 0.5, rx, ry, CLAY, light=(-0.4, -0.5))
        c.ellipse(sx - 0.5, sy - 0.5, rx * 0.5, ry * 0.5, dk); c.ellipse(sx - 0.5, sy - 0.5, rx * 0.35, ry * 0.35, hexc('3a2412'))
    c.outline()
    return c


def deco_gate_lantern() -> IsoCanvas:
    c = cv(32, shadow=0.4)
    for x, y in ((0.2, 0.86), (0.86, 0.2)):
        c.box(26, BASALT, (x - 0.09, y - 0.09, x + 0.09, y + 0.09))
        sx, sy = c.spx(x, y, 26); c.hline(sx - 2, sx + 1, sy - 1, BASALT[2])
    lx, ly = c.spx(0.2, 0.86, 0); rx, ry = c.spx(0.86, 0.2, 0)
    y = ly - 20
    c.hline(lx + 4, rx - 4, y - 1, WOOD[2]); c.hline(lx + 4, rx - 4, y, WOOD[1]); c.hline(lx + 4, rx - 4, y + 1, WOOD[0])
    mx = (lx + rx) // 2
    c.vline(mx, y + 2, y + 4, BASALT[0])
    lan = Canvas(7, 9)
    lan.rect(1, 1, 5, 7, YELLOW[1]); lan.rect(2, 2, 3, 5, hexc('ffe9a3')); lan.rect(1, 0, 5, 1, RED[0]); lan.rect(1, 8, 5, 1, RED[0])
    lan.vline(0, 1, 7, RED[1]); lan.vline(6, 1, 7, RED[1]); lan.outline()
    c.blit(lan, mx - 3, y + 5)
    c.outline()
    return c


def deco_laundry_line() -> IsoCanvas:
    c = cv(34, 2, 1, shadow=None)
    c.ground_shadow(0.15, 0.85, 0.16); c.ground_shadow(1.85, 0.15, 0.16)
    c.pillar(0.15, 0.85, 2, 30, WOOD); c.pillar(1.85, 0.15, 2, 30, WOOD)
    x0, y0 = c.screen(0.15, 0.85, 29); x1, y1 = c.screen(1.85, 0.15, 29)
    n = int(x1 - x0)
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((int(x0 + i), int(y0 + (y1 - y0) * t + 3 * 4 * t * (1 - t))))
    for px, py in pts:
        c.put(px, py, WHITE[0])
    for k, (col, w, h, kind) in enumerate(((SKY, 8, 9, 'shirt'), (WHITE, 6, 10, 'towel'), (RED, 8, 9, 'shirt'), (YELLOW, 6, 10, 'towel'), (MINT, 8, 9, 'shirt'))):
        px, py = pts[int(len(pts) * (k + 1) / 6)]
        s = Canvas(w, h)
        if kind == 'shirt':
            s.rect(1, 1, w - 2, h - 1, col[1]); s.put(0, 2, col[1]); s.put(w - 1, 2, col[1]); s.hline(1, w - 2, 1, col[2]); s.vline(w - 2, 2, h - 1, col[0])
        else:
            s.rect(0, 1, w, h - 1, col[1]); s.hline(0, w - 1, 1, col[2]); s.vline(w - 1, 2, h - 1, col[0]); s.hline(0, w - 1, 5, col[0])
        s.put(w // 2 - 1, 0, WOOD[0]); s.put(w // 2 + 1, 0, WOOD[0])
        c.blit(s, px - w // 2, py + 1)
    c.outline()
    return c


def deco_bicycle() -> IsoCanvas:
    b = bicycle2d(MINT, basket=True)
    return billboard(b, 0.4)


def deco_cat() -> IsoCanvas:
    s = cat2d((hexc('4a4a52'), hexc('6f6f78'), hexc('9a9aa3')))
    return billboard(s, 0.2)


def deco_mailbox() -> IsoCanvas:
    c = cv(30, shadow=0.24)
    c.pillar(0.5, 0.5, 2, 12, WOOD)
    c.box(12, RED, (0.36, 0.36, 0.64, 0.64), z0=12)
    slot = Canvas(6, 2); slot.rect(0, 0, 6, 2, BASALT[0]); paste_face(c, 'left', slot, 2, 3)
    c.box(2, (RED[0], RED[0], RED[1]), (0.32, 0.32, 0.68, 0.68), z0=24, edge=False)
    sx, sy = c.spx(0.5, 0.64, 14); c.rect(sx - 4, sy + 1, 5, 4, WHITE[1]); c.put(sx - 3, sy + 2, RED[1])   # 편지
    c.outline()
    return c


def deco_wind_chime() -> IsoCanvas:
    c = cv(40, shadow=0.24)
    c.pillar(0.5, 0.5, 2, 32, WOOD)
    sx, sy = c.spx(0.5, 0.5, 32)
    c.hline(sx - 8, sx + 2, sy, WOOD[1]); c.hline(sx - 8, sx + 2, sy - 1, WOOD[2])
    c.vline(sx - 6, sy + 1, sy + 4, BASALT[0])
    b = Canvas(7, 9)
    b.shade_ellipse(3, 3.5, 3.4, 3.6, (hexc('8a6a1a'), hexc('c9a227'), hexc('ffd166'))); b.rect(1, 6, 5, 1, hexc('8a6a1a'))
    b.put(3, 7, hexc('8a6a1a')); b.put(3, 8, hexc('8a6a1a'))
    c.blit(b, sx - 9, sy + 5)
    c.rect(sx - 7, sy + 14, 3, 6, PINK[1]); c.hline(sx - 7, sx - 5, sy + 14, PINK[2]); c.put(sx - 6, sy + 20, PINK[0])   # 종이 꼬리
    c.outline()
    return c


def deco_tangerine_crates() -> IsoCanvas:
    c = cv(24, shadow=0.42)
    for rect, z in (((0.2, 0.45, 0.6, 0.85), 0), ((0.5, 0.15, 0.9, 0.55), 0), ((0.25, 0.5, 0.55, 0.8), 6)):
        c.box(6, WOOD, rect, z0=z)
        cx, cy = (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2
        sx, sy = c.spx(cx, cy, z + 6)
        for dx, dy in ((-4, -1), (-1, -3), (2, -1), (0, 0), (4, -2), (-2, 1)):
            tangerine(c, sx + dx, sy + dy)
    c.outline()
    return c


def deco_wood_bench() -> IsoCanvas:
    c = cv(18, shadow=0.42)
    c.box(3, WOOD, (0.15, 0.4, 0.85, 0.7))
    c.box(3, (WOOD[0], WOOD[1], hexc('d9a05e')), (0.1, 0.36, 0.9, 0.74), z0=3)
    c.box(8, (WOOD[0], WOOD[1], hexc('d9a05e')), (0.1, 0.36, 0.9, 0.42), z0=6, edge=False)
    c.line((0.12, 0.5, 6), (0.88, 0.5, 6), WOOD[1]); c.line((0.12, 0.62, 6), (0.88, 0.62, 6), WOOD[1])
    c.outline()
    return c


def deco_flower_pots() -> IsoCanvas:
    c = cv(20, shadow=0.42)
    for x, y, r, h, col in ((0.3, 0.65, 0.12, 6, PINK), (0.62, 0.35, 0.11, 5, YELLOW), (0.7, 0.72, 0.1, 5, RED), (0.42, 0.4, 0.08, 4, SKY)):
        c.disc(x, y, r, h, CLAY)
        sx, sy = c.spx(x, y, h)
        c.ellipse(sx, sy - 2, 3, 2, LEAF[1]); c.put(sx - 2, sy - 3, LEAF[2])
        for dx, dy in ((-2, -4), (1, -5), (3, -3)):
            c.rect(sx + dx, sy + dy, 2, 2, col[1]); c.put(sx + dx, sy + dy, col[2])
    c.outline()
    return c


def deco_umbrella_stand() -> IsoCanvas:
    c = cv(30, shadow=0.3)
    c.disc(0.5, 0.5, 0.16, 10, STEEL)
    sx, sy = c.spx(0.5, 0.5, 10)
    for dx, col, h in ((-3, RED, 14), (0, SKY, 17), (3, YELLOW, 12)):
        c.vline(sx + dx, sy - h, sy - 1, col[1]); c.vline(sx + dx + 1, sy - h + 2, sy - 1, col[0]); c.put(sx + dx, sy - h - 1, WOOD[0]); c.put(sx + dx - 1, sy - h - 2, WOOD[0])
    c.ellipse(sx, sy - 1, 4, 2, STEEL[0])
    c.outline()
    return c


# ================================================================ 코너(fun-corner) 장식 4종 + 코너 팻말·카메라 플래시 fx
def railing() -> IsoCanvas:
    """바다 쪽 나무 난간: 기둥 2 + 가로대 2 (1×1, 셀 가운데를 가로질러)."""
    c = cv(16, shadow=0.3)
    fence(c, [(0.1, 0.5), (0.9, 0.5)], h=12, pal=WOOD, rails=(5, 10), post_w=2)
    c.outline()
    return c


def shell_deco() -> IsoCanvas:
    """소라 장식: 현무암 받침 위 큰 소라 껍데기 2개."""
    c = cv(16, shadow=0.34)
    c.disc(0.5, 0.5, 0.26, 3, BASALT)
    sx, sy = c.spx(0.42, 0.55, 3)
    c.shade_ellipse(sx, sy - 4, 6, 4.5, (hexc('b06a4a'), hexc('e0956a'), hexc('ffd2b0')))
    c.rect(sx - 6, sy - 3, 3, 2, hexc('ffd2b0')); c.put(sx + 3, sy - 6, hexc('b06a4a')); c.put(sx + 4, sy - 5, hexc('b06a4a'))
    sx2, sy2 = c.spx(0.7, 0.35, 3)
    c.shade_ellipse(sx2, sy2 - 3, 4, 3, (hexc('9a5a9a'), hexc('c98ac9'), hexc('f0cff0')))
    c.put(sx2 - 3, sy2 - 2, hexc('f0cff0'))
    c.outline()
    return c


def telescope() -> IsoCanvas:
    """전망대 망원경: 검은 삼각대 + 위로 기운 노란 경통."""
    c = cv(34, shadow=0.26)
    for x, y in ((0.32, 0.68), (0.68, 0.68), (0.5, 0.28)):
        c.line((x, y, 0), (0.5, 0.5, 18), BLACK[1])
    c.pillar(0.5, 0.5, 2, 6, BLACK, z0=18)
    sx, sy = c.spx(0.5, 0.5, 24)
    for i in range(10):
        x, y = sx - 6 + i, sy - i // 2
        c.rect(x, y - 3, 1, 5, YELLOW[1]); c.put(x, y - 3, YELLOW[2]); c.put(x, y + 1, YELLOW[0])
    c.rect(sx + 3, sy - 9, 3, 6, BLACK[1]); c.put(sx + 4, sy - 8, WHITE[2])
    c.outline()
    return c


def cherry_tree() -> IsoCanvas:
    """벚나무: 갈색 줄기 + 분홍 꽃구름 캐노피 + 떨어지는 꽃잎."""
    from sprites_objects import trunk
    from sprites_iso_env import blob_canopy
    s = Canvas(32, 42)
    trunk(s, 15, 27, 41, 3)
    blob_canopy(s, 16, 14, 13, 11, [(7, 10, 6), (24, 11, 6), (16, 4, 6)], (hexc('c96a9a'), hexc('f0a0c8'), hexc('ffd6ea')))
    for x, y in ((5, 8), (12, 6), (22, 5), (27, 12), (10, 18), (20, 20), (3, 30), (28, 33)):
        s.put(x, y, hexc('ffd6ea')); s.put(x + 1, y, hexc('f0a0c8'))
    return billboard(s, 0.42)


def corner_sign() -> Canvas:
    """코너 이름표 팻말(갈색 판 + 기둥, 글자는 렌더가 라벨로 얹는다). 40×22."""
    s = Canvas(40, 22)
    s.rect(18, 14, 4, 8, WOOD[0]); s.vline(18, 14, 21, WOOD[1])
    s.shade_rect(1, 1, 38, 14, (WOOD[0], hexc('8a5a2e'), hexc('a8743e')))
    s.hline(2, 37, 2, hexc('c48f55')); s.vline(2, 2, 13, hexc('c48f55'))
    for x, y in ((3, 3), (36, 3), (3, 12), (36, 12)):
        s.put(x, y, hexc('e8c890'))
    s.outline()
    return s


def flash(frame: int) -> Canvas:
    """카메라 플래시 3프레임: 흰 원이 터졌다가 노란 테두리로 잦아든다."""
    s = Canvas(24, 24)
    r = (5, 10, 7)[frame]
    s.ellipse(11.5, 11.5, r, r, WHITE[2] if frame < 2 else YELLOW[2])
    if frame == 1:
        for dx, dy in ((0, -11), (0, 11), (-11, 0), (11, 0)):
            s.put(11 + dx, 11 + dy, YELLOW[2]); s.put(12 + dx, 11 + dy, YELLOW[2])
    s.ellipse(11.5, 11.5, max(1, r - 3), max(1, r - 3), WHITE[2])
    return s


# ================================================================ 실내 바닥
def floor_wood() -> Canvas:
    dk, md, lt = PALEWOOD
    c = iso_tile(md, dk)
    tmp = Canvas(64, 32)
    for k in range(1, 5):
        y = k / 5
        m = diamond_mask((0, y - 0.01, 1, y + 0.01), 32, 0)
        fill_mask(tmp, m, dk)
    for x, y in ((0.3, 0.1), (0.7, 0.3), (0.2, 0.5), (0.6, 0.7), (0.85, 0.9), (0.45, 0.9)):
        m = diamond_mask((x - 0.02, y - 0.06, x + 0.02, y + 0.06), 32, 0); fill_mask(tmp, m, dk)
    for x, y in ((0.5, 0.05), (0.15, 0.3), (0.5, 0.55), (0.8, 0.5)):
        m = diamond_mask((x - 0.1, y - 0.03, x + 0.1, y + 0.03), 32, 0); fill_mask(tmp, m, lt)
    clip(c, tmp)
    return c


def floor_tile() -> Canvas:
    a, b = hexc('e8e2d6'), hexc('cfc6b6')
    c = iso_tile(a, hexc('b8ae9c'))
    tmp = Canvas(64, 32)
    n = 4
    for i in range(n):
        for j in range(n):
            if (i + j) % 2:
                m = diamond_mask((i / n, j / n, (i + 1) / n, (j + 1) / n), 32, 0); fill_mask(tmp, m, b)
    for i in range(1, n):
        m = diamond_mask((i / n - 0.008, 0, i / n + 0.008, 1), 32, 0); fill_mask(tmp, m, hexc('b8ae9c'))
        m = diamond_mask((0, i / n - 0.008, 1, i / n + 0.008), 32, 0); fill_mask(tmp, m, hexc('b8ae9c'))
    clip(c, tmp)
    return c


def floor_stone() -> Canvas:
    base = hexc('8a8a92')
    c = iso_tile(base, hexc('6a6a72'))
    tmp = Canvas(64, 32)
    body = (hexc('7a7a84'), hexc('a0a0a8'), hexc('c4c4cc'))
    for cx, cy, rx, ry in ((22, 11, 7, 3.6), (38, 9, 6, 3), (30, 19, 8, 3.8), (46, 17, 6, 3.2), (16, 18, 5, 2.8), (36, 26, 6, 2.8), (50, 12, 4, 2.2)):
        tmp.ellipse(cx, cy, rx + 1, ry + 1, hexc('6a6a72'))
        tmp.shade_ellipse(cx, cy, rx, ry, body)
    clip(c, tmp)
    return c


# ================================================================ 카운터·메뉴판
def counter_bar() -> IsoCanvas:
    c = cv(40, 2, 1, shadow=0.75)
    c.box(16, DARKWOOD, (0, 0, 2, 0.55))
    face = Canvas(56, 12)
    for x in range(0, 56, 4):
        face.vline(x, 0, 11, DARKWOOD[0])
    paste_face(c, 'left', face, 2, 3)
    c.box(3, (WOOD[0], hexc('d9a05e'), hexc('f0c080')), (-0.04, -0.04, 2.04, 0.62), z0=16)
    # 에스프레소 머신(왼쪽 뒤) + 그라인더 + 잔 진열
    c.box(11, STEEL, (0.15, 0.08, 0.6, 0.42), z0=19)
    f = Canvas(9, 7); f.rect(0, 0, 9, 7, STEEL[0]); f.rect(1, 1, 2, 2, RED[1]); f.rect(4, 1, 4, 2, BLACK[0]); f.rect(2, 5, 5, 1, STEEL[2]); paste_face(c, 'left', f, 1, 2)
    sx, sy = c.spx(0.38, 0.25, 30); c.rect(sx - 4, sy - 2, 8, 2, STEEL[2]); c.hline(sx - 4, sx + 3, sy - 2, WHITE[2])
    c.pillar(0.52, 0.2, 1, 6, STEEL, z0=30)
    c.pillar(0.85, 0.2, 3, 9, BLACK, z0=19); c.disc(0.85, 0.2, 0.07, 3, STEEL, z0=28)                    # 그라인더
    for x, col in ((1.1, WHITE[1]), (1.3, RED[1]), (1.5, WHITE[1]), (1.7, YELLOW[1]), (1.2, WHITE[1]), (1.6, WHITE[1])):
        cup(c, x, 0.2 if x in (1.1, 1.3, 1.5, 1.7) else 0.42, 19, col)
    sx, sy = c.spx(0.85, 0.45, 19); c.rect(sx - 4, sy - 5, 8, 5, BLACK[0]); c.rect(sx - 3, sy - 4, 6, 3, SKY[2]); c.put(sx - 2, sy - 3, WHITE[2])   # 포스기
    for x in (0.4, 1.0, 1.6):
        c.pillar(x, 0.82, 2, 9, BLACK); c.disc(x, 0.82, 0.12, 3, WOOD, z0=9)
    c.outline()
    return c


def menu_board() -> IsoCanvas:
    c = cv(36, shadow=0.36)
    c.pillar(0.3, 0.3, 2, 30, WOOD); c.pillar(0.7, 0.3, 2, 30, WOOD)
    s = Canvas(30, 22)
    s.rect(0, 0, 30, 22, WOOD[1]); s.hline(0, 29, 0, WOOD[2]); s.vline(0, 0, 21, WOOD[2]); s.hline(0, 29, 21, WOOD[0]); s.vline(29, 0, 21, WOOD[0])
    s.rect(2, 2, 26, 18, hexc('2f2a26'))
    s.rect(4, 4, 10, 1, YELLOW[1]); s.blit(icon_cup(), 20, 3)
    s.rect(4, 8, 8, 1, WHITE[2]); s.rect(16, 8, 4, 1, WHITE[1]); s.rect(22, 8, 4, 1, WHITE[1])
    s.rect(4, 11, 10, 1, WHITE[2]); s.rect(16, 11, 4, 1, WHITE[1]); s.rect(22, 11, 4, 1, WHITE[1])
    s.rect(4, 14, 7, 1, WHITE[2]); s.rect(16, 14, 4, 1, WHITE[1]); s.rect(22, 14, 4, 1, WHITE[1])
    s.rect(4, 17, 9, 1, PINK[1]); s.blit(icon_cake(), 20, 15)
    sx, sy = c.spx(0.5, 0.3, 30); c.blit(s, sx - 15, sy - 6)
    c.outline()
    return c


def sprites() -> dict[str, Canvas]:
    fns = {
        'deco_planter': deco_planter, 'deco_lamp_post': deco_lamp_post, 'deco_string_lights': deco_string_lights,
        'deco_chalkboard': deco_chalkboard, 'deco_cake_case': deco_cake_case, 'deco_coffee_machine': deco_coffee_machine,
        'deco_lp_shelf': deco_lp_shelf, 'deco_bookshelf_small': deco_bookshelf_small,
        'deco_dolhareubang_set': deco_dolhareubang_set, 'deco_water_jar_set': deco_water_jar_set,
        'deco_gate_lantern': deco_gate_lantern, 'deco_laundry_line': deco_laundry_line, 'deco_bicycle': deco_bicycle,
        'deco_cat': deco_cat, 'deco_mailbox': deco_mailbox, 'deco_wind_chime': deco_wind_chime,
        'deco_tangerine_crates': deco_tangerine_crates, 'deco_wood_bench': deco_wood_bench,
        'deco_flower_pots': deco_flower_pots, 'deco_umbrella_stand': deco_umbrella_stand,
        'railing': railing, 'shell_deco': shell_deco, 'telescope': telescope, 'cherry_tree': cherry_tree,  # fun-corner 코너 장식
    }
    assert set(fns) == set(DECOR_IDS), set(fns) ^ set(DECOR_IDS)
    s: dict[str, Canvas] = {f'iso_obj_{k}': fn() for k, fn in fns.items()}
    s['iso_tile_floor_wood'] = floor_wood(); s['iso_tile_floor_tile'] = floor_tile(); s['iso_tile_floor_stone'] = floor_stone()
    s['iso_obj_counter_bar'] = counter_bar(); s['iso_obj_menu_board'] = menu_board()
    s['fx_corner_sign'] = corner_sign()   # fun-corner: 코너 이름표 팻말 (글자는 렌더 라벨)
    for i in range(3):
        s[f'fx_flash_{i}'] = flash(i)      # fun-corner: 손님 사진 카메라 플래시
    return s
