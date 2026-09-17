"""GDD v2 시설(facilities.json) 중 아직 없던 아이소 스프라이트 `iso_obj_<id>` — 쉼·편의·먹거리·즐길거리·농사·경관·랜드마크.
발자국 크기는 facilities.json의 w×h. 가게는 차양·간판·카운터, 건물은 기단·창·문·지붕, 좌석은 의자."""
from __future__ import annotations
import math
from px import Canvas, OUT, hexc, Color
from iso import IsoCanvas, paste_face, texture_where
from sprites_objects import tangerine
from sprites_iso_objects import (cv, billboard, chair, cup, window_sprite, door_sprite, stone_texture, stone_rows,
                                 tree2d, cedar2d, field, PLASTER, SLATE, STONE3, DARKLEAF, GLASS, VINYL, STEEL)
from sprites_iso_env import dolhareubang_sprite, rock, blob_canopy
from iso_parts import *  # noqa: F401,F403
from iso_parts import (building, flat_roof, awning, stall, wall_segment, sign, text_lines, glass_box, translucent,
                       fence, deck, asphalt, lawn, car, scooter, horse, dog, cat2d, big_tree2d, smoke, lantern_red,
                       string_lights, plant_in_pot, room, table_set, chair_z, stool, counter_block, espresso_machine,
                       shelf_face, picture, bottle_row, standing_sign, wall_sign, tile_floor,
                       icon_cup, icon_cake, icon_tart, icon_fish, icon_pig, icon_bowl, icon_mug, icon_book, icon_camera,
                       icon_note, icon_paw, icon_letter, icon_wifi, icon_tangerine, icon_shell, icon_icecream, icon_mic,
                       icon_dice, icon_pot, icon_jar, icon_scooter, icon_horse, icon_tshirt, icon_heart, icon_stroller,
                       icon_bike, bicycle2d,
                       LEAF, ORANGE, WOOD, BASALT, SOIL, SKY, WHITE, RED, YELLOW, GRASS, SNOW, PINK, ROAD, MINT, CREAM,
                       TERRA, NAVY, PURPLE, CLAY, TAN, PALEWOOD, DARKWOOD, BLACK, SAND, BROWN, FOAM)

TILE_A = (hexc('b8ae9c'), hexc('e8e2d6'), hexc('f6f2ea'))
TILE_B = hexc('cfc6b6')
PALEBLUE = (hexc('9fbfd0'), hexc('cfe3ec'), hexc('eef7fb'))


def tiled_room(c, rect, wall_h, wall_pal, tile=TILE_A, alt=TILE_B, base_h=6, n=0.25):
    """타일 바닥 방: 바닥 타일을 벽 안쪽에 다시 깔아 벽 밑이 덮이지 않게."""
    tile_floor(c, rect, 3, tile, alt, n)
    r = room(c, rect, wall_h, wall_pal, PALEWOOD, 'x', base_h=base_h)
    tile_floor(c, (rect[0] + 0.12, rect[1] + 0.12, rect[2], rect[3]), 3, tile, alt, n)
    return r


# ================================================================ 쉼
def terrace_seat() -> IsoCanvas:
    c = cv(30, shadow=0.45)
    deck(c, (0.02, 0.02, 0.98, 0.98), 4, PALEWOOD, 'x', 0.16)
    chair(c, 0.3, 0.68, 'left'); chair(c, 0.68, 0.3, 'right')
    c.pillar(0.5, 0.5, 2, 10, STEEL, z0=4)
    c.disc(0.5, 0.5, 0.22, 2, WHITE, z0=14)
    cup(c, 0.44, 0.46, 16); cup(c, 0.58, 0.56, 16, ORANGE[1])
    plant_in_pot(c, 0.18, 0.18, 0.1, 5, CLAY, LEAF, 4)
    c.outline()
    return c


def toenmaru() -> IsoCanvas:
    c = cv(34, pad=4, shadow=0.45)
    wall_segment(c, (0, 0, 1, 0.2), 30)
    lat = Canvas(14, 18); lat.rect(0, 0, 14, 18, WOOD[1])
    for x in range(1, 14, 3): lat.vline(x, 1, 16, CREAM[2])
    for y in range(1, 18, 3): lat.hline(1, 12, y, CREAM[2])
    paste_face(c, 'left', lat, 8, 6)
    c.box(3, SLATE, (0.0, 0.0, 1.0, 0.3), z0=30)
    deck(c, (0.02, 0.2, 0.98, 0.92), 9, PALEWOOD, 'x', 0.14)
    c.box(2, (hexc('2f5fa0'), hexc('4a86d0'), hexc('8ec1f0')), (0.3, 0.42, 0.52, 0.64), z0=9, edge=False)   # 방석
    c.box(2, (RED[0], RED[1], hexc('ff9a9a')), (0.56, 0.36, 0.78, 0.58), z0=9, edge=False)
    cup(c, 0.62, 0.72, 9, WHITE[1])
    sx, sy = c.spx(0.36, 0.78, 9); c.rect(sx - 3, sy - 3, 6, 3, WOOD[2]); c.hline(sx - 3, sx + 2, sy - 3, WOOD[1])   # 소반
    c.pillar(0.05, 0.92, 2, 9, WOOD); c.pillar(0.95, 0.92, 2, 9, WOOD)
    c.outline()
    return c


def hammock() -> IsoCanvas:
    c = cv(34, shadow=0.42)
    c.pillar(0.14, 0.86, 3, 30, WOOD); c.pillar(0.86, 0.14, 3, 30, WOOD)
    lx, ly = c.spx(0.14, 0.86, 26); rx, ry = c.spx(0.86, 0.14, 26)
    n = rx - lx
    for i in range(n + 1):
        t = i / n
        sag = 12 * 4 * t * (1 - t)
        yc = ly + (ry - ly) * t + sag
        th = 1 + int(5 * 4 * t * (1 - t))
        stripe = (i // 4) % 2 == 0
        col = (hexc('2f8a72'), hexc('4fbf9f'), hexc('a6e8d4')) if stripe else WHITE
        for k in range(th):
            c.put(lx + i, int(yc) - k, col[2] if k == th - 1 else col[1] if k > 0 else col[0])
    sx, sy = c.spx(0.5, 0.5, 26); c.rect(sx - 4, sy + 4, 8, 3, YELLOW[1]); c.put(sx - 4, sy + 4, YELLOW[2])   # 베개
    c.outline()
    return c


def bench_stonewall() -> IsoCanvas:
    c = cv(22, shadow=0.5)
    corner = c.sx_of(0.28, 0.28); left_end = c.sx_of(0.28, 1)
    c.boxes([(0, 0, 1, 0.28), (0, 0, 0.28, 1)], 14, BASALT, side_fn=lambda px: px >= corner or px < left_end)
    stone_texture(c, {BASALT[0], BASALT[1], BASALT[2]}, 3.4, 2.4, 8, 5)
    deck(c, (0.34, 0.34, 0.96, 0.96), 8, PALEWOOD, 'x', 0.16)
    c.pillar(0.38, 0.94, 2, 8, WOOD); c.pillar(0.94, 0.38, 2, 8, WOOD)
    c.box(2, (RED[0], RED[1], hexc('ff9a9a')), (0.5, 0.5, 0.7, 0.7), z0=8, edge=False)
    cup(c, 0.82, 0.5, 8, WHITE[1])
    for x, y in ((14, 10), (26, 8), (40, 14)):
        c.put(x, y + 6, GRASS[1])
    c.outline()
    return c


def kids_table() -> IsoCanvas:
    c = cv(22, shadow=0.42)
    for x, y, col in ((0.28, 0.68, RED), (0.68, 0.28, SKY), (0.72, 0.72, YELLOW)):
        c.box(5, col, (x - 0.09, y - 0.09, x + 0.09, y + 0.09), edge=False)
    c.pillar(0.5, 0.5, 2, 8, WHITE)
    c.disc(0.5, 0.5, 0.26, 3, (YELLOW[0], YELLOW[1], YELLOW[2]), z0=8)
    sx, sy = c.spx(0.44, 0.44, 11); c.rect(sx - 2, sy - 3, 3, 3, RED[1]); c.put(sx - 2, sy - 3, RED[2])    # 블록
    sx, sy = c.spx(0.6, 0.56, 11); c.rect(sx - 1, sy - 3, 3, 3, SKY[1]); c.put(sx - 1, sy - 3, SKY[2])
    cup(c, 0.52, 0.66, 11, PINK[1])
    c.outline()
    return c


def fire_pit() -> IsoCanvas:
    c = cv(24, shadow=0.45)
    for x, y in ((0.22, 0.72), (0.72, 0.22), (0.78, 0.78)):
        c.disc(x, y, 0.13, 6, WOOD)
        sx, sy = c.spx(x, y, 6); c.put(sx, sy, WOOD[0]); c.put(sx - 1, sy - 1, hexc('e0a866'))
    c.disc(0.5, 0.5, 0.3, 4, STONE3)
    stone_texture(c, {STONE3[0], STONE3[1]}, 2.6, 2, 6, 4)
    c.disc(0.5, 0.5, 0.2, 1, BLACK, z0=4)
    sx, sy = c.spx(0.5, 0.5, 5)
    c.rect(sx - 3, sy - 1, 7, 2, WOOD[0]); c.rect(sx - 2, sy - 3, 5, 2, WOOD[1])                    # 장작
    fire = ((sx - 2, sy - 6, 5, 4, RED[1]), (sx - 1, sy - 9, 3, 4, ORANGE[1]), (sx, sy - 11, 1, 3, YELLOW[1]))
    for x, y, w, h, col in fire:
        c.rect(x, y, w, h, col)
    c.put(sx, sy - 7, YELLOW[2]); c.put(sx - 3, sy - 4, RED[0]); c.put(sx + 3, sy - 4, RED[0])
    c.outline()
    return c


def oreum_bench() -> IsoCanvas:
    c = cv(30, 2, 1, shadow=0.75)
    c.pillar(0.12, 0.12, 2, 22, WOOD); c.pillar(1.88, 0.12, 2, 22, WOOD)
    c.line((0.12, 0.12, 20), (1.88, 0.12, 20), WOOD[2]); c.line((0.12, 0.12, 19), (1.88, 0.12, 19), WOOD[1])
    c.line((0.12, 0.12, 12), (1.88, 0.12, 12), WOOD[1]); c.line((0.12, 0.12, 11), (1.88, 0.12, 11), WOOD[0])
    c.box(4, WOOD, (0.15, 0.3, 1.85, 0.7))
    c.box(5, (WOOD[0], WOOD[1], hexc('d9a05e')), (0.1, 0.26, 1.9, 0.74), z0=4)
    c.box(10, (WOOD[0], WOOD[1], hexc('d9a05e')), (0.1, 0.26, 1.9, 0.32), z0=9, edge=False)   # 등받이
    for y in (0.4, 0.55):
        c.line((0.12, y, 9), (1.88, y, 9), WOOD[1])
    cup(c, 1.4, 0.5, 9, WHITE[1])
    sx, sy = c.spx(0.6, 0.5, 9); c.rect(sx - 3, sy - 4, 6, 3, hexc('e0e0e0')); c.put(sx - 3, sy - 4, WHITE[2])   # 쌍안경
    c.rect(sx - 4, sy - 3, 2, 2, BASALT[0]); c.rect(sx + 2, sy - 3, 2, 2, BASALT[0])
    c.outline()
    return c


def greenhouse_seat() -> IsoCanvas:
    c = cv(30, 2, 1, pad=4, shadow=0.75)
    deck(c, (0.02, 0.02, 1.98, 0.98), 3, PALEWOOD, 'y', 0.2)
    chair(c, 0.5, 0.3, 'right'); chair(c, 1.5, 0.3, 'right')
    c.box(10, WOOD, (0.7, 0.35, 1.3, 0.65), z0=3)
    cup(c, 0.9, 0.5, 13); cup(c, 1.1, 0.5, 13, RED[1])
    plant_in_pot(c, 0.25, 0.75, 0.1, 5, CLAY, LEAF, 4); plant_in_pot(c, 1.75, 0.75, 0.1, 5, CLAY, PINK, 4)
    chair(c, 0.5, 0.7, 'front'); chair(c, 1.5, 0.7, 'front')
    glass_box(c, (0.03, 0.03, 1.97, 0.97), 24, z0=3, alpha=110)
    c.line((0.03, 0.5, 27), (1.97, 0.5, 27), STEEL[1])
    c.outline()
    return c


def sofa() -> IsoCanvas:
    c = cv(26, 2, 1, shadow=0.75)
    SOFA = (hexc('2f5f4a'), hexc('3f8a68'), hexc('6fbf98'))
    c.box(6, SOFA, (0.1, 0.1, 1.9, 0.6))                                    # 좌석
    c.box(10, SOFA, (0.1, 0.1, 1.9, 0.22), z0=6, edge=False)                 # 등받이
    c.box(8, SOFA, (0.1, 0.1, 0.24, 0.6), z0=6, edge=False)                  # 팔걸이
    c.box(8, SOFA, (1.76, 0.1, 1.9, 0.6), z0=6, edge=False)
    c.line((0.3, 0.14, 15), (0.3, 0.58, 6), SOFA[0]); c.line((1.0, 0.14, 15), (1.0, 0.58, 6), SOFA[0])   # 쿠션 나눔
    c.box(2, (YELLOW[0], YELLOW[1], YELLOW[2]), (0.36, 0.26, 0.6, 0.5), z0=6, edge=False)                # 쿠션
    c.box(2, (PINK[0], PINK[1], PINK[2]), (1.3, 0.26, 1.54, 0.5), z0=6, edge=False)
    c.box(8, WOOD, (0.6, 0.66, 1.4, 0.94))                                   # 낮은 탁자
    cup(c, 0.8, 0.8, 8); cup(c, 1.2, 0.8, 8, RED[1])
    c.outline()
    return c


def picnic() -> IsoCanvas:
    c = cv(20, 2, 2, shadow=None)
    lawn(c, (0, 0, 2, 2), [(0.2, 0.3), (1.7, 0.4), (0.4, 1.7), (1.8, 1.7)])
    c.box(1, (RED[0], RED[1], hexc('ff9a9a')), (0.4, 0.4, 1.6, 1.6), z0=1, edge=False)
    tmp = Canvas(c.w, c.h)
    for x in range(0, 10):
        for y in range(0, 10):
            if (x + y) % 2 == 0:
                sx, sy = c.spx(0.4 + x * 0.12 + 0.06, 0.4 + y * 0.12 + 0.06, 2)
                tmp.rect(sx - 2, sy - 1, 4, 2, WHITE[1])
    texture_where(c, tmp, {RED[1], hexc('ff9a9a'), RED[0]})
    c.box(6, WOOD, (0.6, 0.6, 0.9, 0.9), z0=2)                                          # 바구니
    sx, sy = c.spx(0.75, 0.75, 8); c.hline(sx - 4, sx + 3, sy - 4, WOOD[0]); c.put(sx - 4, sy - 3, WOOD[0]); c.put(sx + 3, sy - 3, WOOD[0])
    for dx, dy in ((-2, -1), (1, -2), (3, 0)):
        tangerine(c, sx + dx, sy + dy)
    c.box(2, (YELLOW[0], YELLOW[1], YELLOW[2]), (1.2, 0.5, 1.5, 0.8), z0=2, edge=False)  # 방석
    c.box(2, (SKY[0], SKY[1], SKY[2]), (0.5, 1.2, 0.8, 1.5), z0=2, edge=False)
    cup(c, 1.2, 1.2, 2); cup(c, 1.4, 1.35, 2, PINK[1])
    sx, sy = c.spx(1.0, 1.05, 2); c.rect(sx - 4, sy - 3, 8, 3, WHITE[1]); c.hline(sx - 4, sx + 3, sy - 3, WHITE[2]); c.rect(sx - 2, sy - 2, 4, 1, PINK[1])   # 도시락
    c.outline()
    return c


def rooftop() -> IsoCanvas:
    c = cv(56, 2, 2, pad=12, shadow=1.0)
    building(c, (0.05, 0.05, 1.95, 1.95), 10, 26, CREAM)
    paste_face(c, 'left', window_sprite(12, 10), 8, 12); paste_face(c, 'left', door_sprite(12, 18), 34, 18)
    paste_face(c, 'right', window_sprite(12, 10), 10, 12); paste_face(c, 'right', window_sprite(12, 10), 36, 12)
    c.box(3, PALEWOOD, (0.0, 0.0, 2.0, 2.0), z0=36)                                    # 옥상 데크
    for y in (0.3, 0.6, 0.9, 1.2, 1.5, 1.8):
        c.line((0.02, y, 39), (1.98, y, 39), PALEWOOD[1])
    for x, y in ((0.05, 0.05), (1.0, 0.05), (0.05, 1.0)):
        c.pillar(x, y, 1, 9, STEEL, z0=39)
    chair(c, 0.5, 1.4, 'left'); chair(c, 1.4, 0.5, 'right')
    c.pillar(1.0, 1.0, 2, 8, STEEL, z0=39); c.disc(1.0, 1.0, 0.24, 2, WHITE, z0=47)
    cup(c, 0.9, 0.9, 49); cup(c, 1.1, 1.1, 49, ORANGE[1])
    plant_in_pot(c, 1.7, 1.7, 0.1, 5, CLAY, LEAF, 4)
    for (a, b) in (((0.05, 1.95), (1.95, 1.95)), ((1.95, 1.95), (1.95, 0.05)), ((0.05, 0.05), (0.05, 1.95)), ((0.05, 0.05), (1.95, 0.05))):
        for z in (43, 47):
            c.line((a[0], a[1], z), (b[0], b[1], z), STEEL[2]); c.line((a[0], a[1], z - 1), (b[0], b[1], z - 1), STEEL[0])
    for x, y in ((0.05, 1.95), (1.95, 1.95), (1.95, 0.05), (1.0, 1.95), (1.95, 1.0)):
        c.pillar(x, y, 1, 14 if (x, y) in ((0.05, 1.95), (1.95, 1.95), (1.95, 0.05)) else 9, STEEL, z0=39)
    string_lights(c, (0.05, 1.95, 53), (1.95, 1.95, 53), 4, 6); string_lights(c, (1.95, 1.95, 53), (1.95, 0.05, 53), 4, 6)
    c.outline()
    return c


def arch_house(cw: int, ch: int, H: float, door: bool = True, inside: str = 'leaf', pal=VINYL) -> IsoCanvas:
    """비닐하우스 아치(greenhouse 일반화). y 방향 반타원, x=cw 끝면 DK, 안쪽 초록/감귤 비침."""
    c = cv(int(H) + 2, cw, ch, shadow=max(cw, ch) * 0.5)
    dk, md, lt = pal
    ry = ch / 2 - 0.02

    def z_at(y: float) -> float:
        t = (y - ch / 2) / ry
        return H * math.sqrt(max(0.0, 1 - t * t))

    y = 0.02
    while y < ch - 0.02:
        z = 0.0
        while z <= z_at(y):
            sx, sy = c.screen(cw, y, z); c.put(int(sx), int(sy), dk); z += 0.5
        y += 0.01
    x = 0.0
    while x <= cw:
        y = 0.02
        while y < ch - 0.02:
            sx, sy = c.screen(x, y, z_at(y))
            c.put(int(sx), int(sy), dk if y < ch * 0.27 else lt if y < ch * 0.62 else md)
            y += 0.01
        x += 0.02
    for k in range(0, cw * 3 + 1):
        x = k * cw / (cw * 3)
        y = 0.02
        while y < ch - 0.02:
            sx, sy = c.screen(x, y, z_at(y)); c.put(int(sx), int(sy), dk); y += 0.01
    c.line((0, ch / 2, H), (cw, ch / 2, H), lt); c.line((0, ch / 2, H + 1), (cw, ch / 2, H + 1), lt)
    tmp = Canvas(c.w, c.h)
    for i in range(cw * 3):
        for j in range(2):
            x = (i + 0.5) / 3 * 1.0; y = ch * (0.6 + j * 0.2)
            sx, sy = c.spx(x, y, z_at(y) - 4); tmp.ellipse(sx, sy, 4, 2, LEAF[1])
            if inside == 'orange':
                tmp.put(sx - 1, sy, ORANGE[1]); tmp.put(sx + 2, sy - 1, ORANGE[1])
    texture_where(c, tmp, {md, lt})
    if door:
        d = door_sprite(8, 12, (STEEL[0], STEEL[1], STEEL[2]))
        sx, sy = c.spx(cw, ch * 0.62, 0); c.blit(d, sx - 8, sy - 12)
    return c


def vinyl_house_room() -> IsoCanvas:
    """비닐하우스 카페룸: 지붕 없이 바닥 + 뒤쪽 두 비닐 벽(골조 선) + 테이블."""
    c = cv(36, 3, 2, pad=2, shadow=1.4)
    r = room(c, (0, 0, 3, 2), 26, VINYL, PALEWOOD, 'x', base_h=0, step=0.25)
    for u in range(6, 62, 12):
        f = Canvas(1, 24); f.rect(0, 0, 1, 24, STEEL[1]); r.on_left(f, u, 1)
    for u in range(10, 94, 12):
        f = Canvas(1, 24); f.rect(0, 0, 1, 24, STEEL[1]); r.on_right(f, u, 1)
    r.on_right(wall_sign(icon_cup(), 26, (hexc('e8f4f8'), hexc('f4fafc'), WHITE[2])), 34, 3)
    z = r.z
    for x, y, cups in ((0.8, 0.8, (WHITE[1],)), (1.8, 0.8, (RED[1], WHITE[1])), (0.8, 1.6, (YELLOW[1],)), (1.8, 1.6, (WHITE[1],))):
        table_set(c, x, y, z, cups)
    for x, y, col in ((2.6, 0.5, LEAF), (2.6, 1.2, PINK), (2.7, 1.8, LEAF)):
        plant_in_pot(c, x, y, 0.1, 6, CLAY, col, 5)
    c.outline()
    return c


def tangerine_hall() -> IsoCanvas:
    """감귤 온실 카페홀: 유리 뒤벽(철골) + 안의 감귤나무·테이블, 지붕 없음."""
    c = cv(50, 3, 2, pad=2, shadow=1.4)
    r = room(c, (0, 0, 3, 2), 30, GLASS, PALEWOOD, 'x', base_h=4, step=0.25)
    for u in range(4, 62, 10):
        f = Canvas(1, 28); f.rect(0, 0, 1, 28, STEEL[0]); r.on_left(f, u, 1)
    for u in range(8, 94, 10):
        f = Canvas(1, 28); f.rect(0, 0, 1, 28, STEEL[0]); r.on_right(f, u, 1)
    h = Canvas(60, 1); h.rect(0, 0, 60, 1, STEEL[1]); r.on_left(h, 2, 14)
    h = Canvas(88, 1); h.rect(0, 0, 88, 1, STEEL[1]); r.on_right(h, 6, 14)
    r.on_right(sign(26, 9, (ORANGE[0], ORANGE[1], ORANGE[2]), icon_tangerine()), 34, 2)
    z = r.z
    for x, y in ((0.55, 0.55), (1.5, 0.45), (2.5, 0.55)):
        t = tree2d('ready'); t.outline(); c.ground_shadow(x, y, 0.3); c.billboard(t, x, y, z)
    table_set(c, 0.9, 1.4, z, (WHITE[1],), round_top=True); table_set(c, 1.9, 1.4, z, (ORANGE[1], WHITE[1]), round_top=True)
    c.box(6, WOOD, (2.55, 1.5, 2.9, 1.85), z0=z); sx, sy = c.spx(2.72, 1.67, z + 6)
    for dx, dy in ((-3, -2), (0, -3), (3, -2), (-1, -1), (2, 0)):
        tangerine(c, sx + dx, sy + dy)
    c.outline()
    return c


def stroller_park() -> IsoCanvas:
    c = cv(24, shadow=0.42)
    fence(c, [(0.1, 0.1), (0.9, 0.1)], 12, STEEL, rails=(6, 11), post_w=1)
    for x, y in ((0.3, 0.55), (0.68, 0.55)):
        c.box(2, BLACK, (x - 0.1, y - 0.06, x - 0.04, y + 0.06), edge=False); c.box(2, BLACK, (x + 0.04, y - 0.06, x + 0.1, y + 0.06), edge=False)
        c.box(5, SKY, (x - 0.13, y - 0.1, x + 0.13, y + 0.1), z0=3)
        c.box(4, (SKY[0], SKY[0], SKY[1]), (x - 0.13, y - 0.1, x - 0.02, y + 0.1), z0=8, edge=False)   # 후드
        c.pillar(x + 0.12, y, 1, 8, STEEL, z0=8); sx, sy = c.spx(x + 0.12, y, 16); c.hline(sx - 2, sx + 2, sy, STEEL[0])
    sg = sign(14, 10, WHITE, icon_stroller(), text=False); sx, sy = c.spx(0.5, 0.1, 12); c.blit(sg, sx - 7, sy - 9)
    c.outline()
    return c


def bike_rack() -> IsoCanvas:
    c = cv(26, shadow=0.42)
    for y in (0.3, 0.55, 0.8):
        c.pillar(0.2, y, 1, 10, STEEL); c.pillar(0.8, y, 1, 10, STEEL)
        c.line((0.2, y, 10), (0.8, y, 10), STEEL[2]); c.line((0.2, y, 9), (0.8, y, 9), STEEL[0])
    b = bicycle2d(RED, basket=False); b.outline()
    c.billboard(b, 0.5, 0.55, 0)
    c.outline()
    return c


def translator() -> IsoCanvas:
    c = cv(30, shadow=0.36)
    c.box(3, STEEL, (0.34, 0.34, 0.66, 0.66))
    c.pillar(0.5, 0.5, 3, 18, STEEL, z0=3)
    tab = Canvas(14, 10); tab.rect(0, 0, 14, 10, BLACK[0]); tab.rect(1, 1, 12, 8, SKY[2]); tab.hline(1, 12, 1, WHITE[2])
    tab.rect(3, 3, 5, 3, WHITE[1]); tab.put(4, 6, WHITE[1]); tab.rect(8, 4, 3, 1, OUT); tab.rect(8, 6, 4, 1, OUT)
    sx, sy = c.spx(0.5, 0.5, 21); c.blit(tab, sx - 7, sy - 8)
    c.outline()
    return c


def cat_house() -> IsoCanvas:
    c = cv(26, pad=6, shadow=0.42)
    c.box(14, WOOD, (0.15, 0.15, 0.85, 0.85))
    d = Canvas(7, 8); d.rect(0, 0, 7, 8, BASALT[0]); d.rect(1, 1, 5, 7, hexc('2b1c10')); d.hline(2, 4, 0, BASALT[0]); d.put(0, 0, (0, 0, 0, 0)); d.put(6, 0, (0, 0, 0, 0))
    paste_face(c, 'left', d, 6, 6)
    paste_face(c, 'right', window_sprite(6, 5), 6, 4)
    c.gable_roof((0.08, 0.08, 0.92, 0.92), 13, 7, (RED[0], RED[1], hexc('f28080')), axis='x', slates=2)
    cat = cat2d(ORANGE); cat.outline()
    c.ground_shadow(0.8, 0.85, 0.16); c.billboard(cat, 0.8, 0.85)
    c.outline()
    return c


def parking() -> IsoCanvas:
    c = cv(20, 2, 2, shadow=None)
    asphalt(c, (0, 0, 2, 2), 'x', 2)
    c.line((1.0, 0.05, 2), (1.0, 1.95, 2), WHITE[1])
    car(c, 0.5, 0.5, (RED[0], RED[1], hexc('f28080')), 'x')
    car(c, 1.5, 1.5, (SKY[0], SKY[1], SKY[2]), 'y')
    c.pillar(1.9, 0.1, 2, 18, STEEL)
    sg = sign(9, 11, NAVY, icon_letter('P'), text=False); sx, sy = c.spx(1.9, 0.1, 18); c.blit(sg, sx - 4, sy - 10)
    c.outline()
    return c


def parking_large() -> IsoCanvas:
    c = cv(22, 3, 2, shadow=None)
    asphalt(c, (0, 0, 3, 2), 'x', 2)
    for x in (1.0, 2.0):
        c.line((x, 0.05, 2), (x, 1.95, 2), WHITE[1])
    car(c, 0.5, 0.5, (RED[0], RED[1], hexc('f28080')), 'y')
    car(c, 1.5, 0.5, (YELLOW[0], YELLOW[1], YELLOW[2]), 'y')
    car(c, 2.5, 1.5, (SKY[0], SKY[1], SKY[2]), 'y')
    c.pillar(2.9, 0.1, 2, 20, STEEL)
    sg = sign(9, 11, NAVY, icon_letter('P'), text=False); sx, sy = c.spx(2.9, 0.1, 20); c.blit(sg, sx - 4, sy - 10)
    c.pillar(0.1, 1.9, 2, 20, STEEL); sx, sy = c.spx(0.1, 1.9, 20); c.rect(sx - 3, sy - 3, 6, 3, YELLOW[1]); c.hline(sx - 3, sx + 2, sy - 3, YELLOW[2])   # 가로등
    c.outline()
    return c


def staff_room() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.8)
    r = room(c, (0, 0, 2, 1), 22, (hexc('b8b0a0'), hexc('d8d0c0'), hexc('f0ebe0')), PALEWOOD, 'x', base_h=6)
    lock = Canvas(20, 18); lock.rect(0, 0, 20, 18, STEEL[1])
    for x in range(0, 20, 5):
        lock.vline(x, 0, 17, STEEL[0]); lock.rect(x + 3, 6, 1, 2, BLACK[0])
    lock.hline(0, 19, 0, STEEL[2])
    r.on_right(lock, 44, 4)
    tag = Canvas(12, 7); tag.shade_rect(0, 0, 12, 7, NAVY); tag.blit(icon_letter('S', WHITE[2]), 4, 0); r.on_right(tag, 8, 3)
    r.on_right(window_sprite(12, 9), 22, 8)
    clock = Canvas(7, 7); clock.shade_ellipse(3, 3, 3.4, 3.4, WHITE); clock.put(3, 3, OUT); clock.put(3, 2, OUT); clock.put(4, 3, OUT); r.on_left(clock, 20, 4)
    z = r.z
    SOFA = (hexc('2f5f4a'), hexc('3f8a68'), hexc('6fbf98'))
    c.box(6, SOFA, (0.2, 0.55, 0.9, 0.85), z0=z); c.box(7, SOFA, (0.2, 0.55, 0.9, 0.62), z0=z + 6, edge=False)
    c.box(8, WOOD, (1.1, 0.5, 1.6, 0.8), z0=z); cup(c, 1.25, 0.65, z + 8); cup(c, 1.45, 0.62, z + 8, RED[1])
    c.box(10, STEEL, (1.65, 0.2, 1.9, 0.42), z0=z); sx, sy = c.spx(1.78, 0.31, z + 10); c.rect(sx - 2, sy - 3, 4, 3, BLACK[0]); c.put(sx - 2, sy - 3, RED[1])   # 커피포트
    c.outline()
    return c


def wifi_zone() -> IsoCanvas:
    c = cv(44, 2, 1, shadow=0.8)
    deck(c, (0.02, 0.02, 1.98, 0.98), 4, PALEWOOD, 'y', 0.22)
    c.pillar(0.15, 0.15, 2, 30, STEEL, z0=4)
    sg = sign(13, 10, NAVY, icon_wifi(), text=False); sx, sy = c.spx(0.15, 0.15, 34); c.blit(sg, sx - 6, sy - 8)
    for x in (0.55, 1.05, 1.55):
        c.pillar(x, 0.3, 2, 9, STEEL, z0=4); c.disc(x, 0.3, 0.1, 2, WOOD, z0=13)
    c.box(10, WOOD, (0.35, 0.45, 1.75, 0.75), z0=4)
    lap = Canvas(9, 5); lap.rect(0, 0, 9, 5, STEEL[1]); lap.rect(1, 0, 7, 3, SKY[2]); lap.hline(0, 8, 4, STEEL[0])
    sx, sy = c.spx(0.7, 0.6, 14); c.blit(lap, sx - 4, sy - 5)
    cup(c, 1.1, 0.6, 14); cup(c, 1.45, 0.62, 14, RED[1])
    c.outline()
    return c


def dog_park() -> IsoCanvas:
    c = cv(22, 2, 2, shadow=None)
    lawn(c, (0, 0, 2, 2), [(0.3, 0.3), (1.6, 0.35), (0.35, 1.6), (1.7, 1.7), (1.0, 0.8)])
    fence(c, [(0.12, 1.88), (0.12, 0.12), (1.88, 0.12)], 9, WOOD, rails=(3, 7))
    fence(c, [(1.88, 0.12), (1.88, 1.88)], 9, WOOD, rails=(3, 7))
    c.pillar(0.5, 1.5, 1, 14, STEEL); c.pillar(0.9, 1.5, 1, 14, STEEL)    # 허들
    c.line((0.5, 1.5, 12), (0.9, 1.5, 12), RED[1]); c.line((0.5, 1.5, 11), (0.9, 1.5, 11), WHITE[1])
    dog(c, 1.3, 1.1, TAN); dog(c, 0.7, 0.6, BROWN)
    c.disc(1.6, 1.6, 0.1, 3, SKY); sx, sy = c.spx(1.6, 1.6, 3); c.put(sx, sy - 1, SKY[2])                 # 물그릇
    sx, sy = c.spx(1.2, 0.5, 1); c.rect(sx - 2, sy - 1, 5, 1, WHITE[1]); c.put(sx - 3, sy - 2, WHITE[1]); c.put(sx + 3, sy - 2, WHITE[1]); c.put(sx - 3, sy, WHITE[1]); c.put(sx + 3, sy, WHITE[1])   # 뼈
    fence(c, [(0.12, 1.88), (1.88, 1.88)], 9, WOOD, rails=(3, 7))
    sg = sign(12, 10, WHITE, icon_paw(), text=False); sx, sy = c.spx(0.12, 1.88, 9); c.blit(sg, sx - 5, sy - 10)
    c.outline()
    return c


# ================================================================ 먹거리
def handdrip_bar() -> IsoCanvas:
    c = cv(30, shadow=0.45)
    c.box(14, DARKWOOD, (0.1, 0.1, 0.9, 0.6))
    c.box(2, WOOD, (0.06, 0.06, 0.94, 0.64), z0=14, edge=False)
    # 드리퍼 스탠드 + 주전자 + 잔
    c.pillar(0.35, 0.3, 1, 8, STEEL, z0=16); sx, sy = c.spx(0.35, 0.3, 24); c.hline(sx - 3, sx + 3, sy, STEEL[0])
    c.rect(sx - 2, sy + 1, 4, 3, WHITE[1]); c.put(sx - 2, sy + 1, WHITE[2]); c.rect(sx - 1, sy + 5, 3, 2, hexc('6b4a2a'))
    sx, sy = c.spx(0.7, 0.3, 16); c.rect(sx - 3, sy - 6, 6, 5, STEEL[1]); c.hline(sx - 3, sx + 2, sy - 6, STEEL[2]); c.put(sx + 3, sy - 4, STEEL[0]); c.put(sx + 4, sy - 5, STEEL[0]); c.put(sx - 1, sy - 7, STEEL[0])
    cup(c, 0.55, 0.5, 16); cup(c, 0.8, 0.52, 16, WHITE[1])
    for x in (0.3, 0.7):
        c.pillar(x, 0.85, 2, 8, STEEL); c.disc(x, 0.85, 0.1, 2, WOOD, z0=8)
    c.outline()
    return c


def hallabong_stand() -> IsoCanvas:
    c = cv(40, shadow=0.45)
    stall(c, (0.05, 0.05, 0.95, 0.95), ORANGE, WHITE, 32)
    for x, y in ((0.32, 0.5), (0.5, 0.45), (0.68, 0.5)):
        sx, sy = c.spx(x, y, 12); c.rect(sx - 1, sy - 5, 3, 5, hexc('ffb347')); c.put(sx - 1, sy - 5, ORANGE[2]); c.put(sx + 1, sy - 1, ORANGE[0]); c.put(sx, sy - 6, WHITE[1])
    sx, sy = c.spx(0.5, 0.95, 32); s = icon_tangerine(); s2 = Canvas(9, 9); s2.shade_ellipse(4, 5, 4, 3.6, ORANGE); s2.rect(3, 0, 3, 2, ORANGE[0]); s2.put(5, 0, LEAF[1])
    c.blit(s2, sx - 4, sy - 12)
    c.outline()
    return c


def omegi_stall() -> IsoCanvas:
    c = cv(40, shadow=0.45)
    MUG = (hexc('3f6a3a'), hexc('5f9a52'), hexc('a8d48a'))
    stall(c, (0.05, 0.05, 0.95, 0.95), MUG, WHITE, 32)
    for x, y in ((0.3, 0.45), (0.55, 0.42), (0.75, 0.5), (0.42, 0.62), (0.65, 0.66)):
        sx, sy = c.spx(x, y, 12); c.ellipse(sx, sy - 2, 2.4, 1.6, hexc('4f6a30')); c.put(sx - 1, sy - 3, hexc('7f9a50')); c.put(sx, sy - 2, hexc('7a4a3a'))
    sx, sy = c.spx(0.5, 0.95, 32); c.rect(sx - 6, sy - 10, 12, 7, WHITE[1]); c.hline(sx - 6, sx + 5, sy - 10, WHITE[2]); c.ellipse(sx - 2, sy - 6, 2.4, 1.6, hexc('4f6a30')); text_lines(c, sx + 1, sy - 8, 4, 2)
    c.outline()
    return c


def peanut_icecream() -> IsoCanvas:
    c = cv(44, shadow=0.42)
    for wx, wy in ((0.25, 0.7), (0.75, 0.7)):
        c.box(4, BLACK, (wx - 0.06, wy - 0.05, wx + 0.06, wy + 0.05), edge=False)
    c.box(14, WHITE, (0.15, 0.25, 0.85, 0.75), z0=3)
    c.box(2, SKY, (0.12, 0.22, 0.88, 0.78), z0=17, edge=False)
    ic = icon_icecream(); paste_face(c, 'left', ic, 5, 3)
    t = Canvas(10, 3); t.rect(0, 0, 10, 3, SKY[1]); t.hline(0, 9, 0, SKY[2]); paste_face(c, 'left', t, 13, 9)
    c.pillar(0.5, 0.5, 2, 20, STEEL, z0=19)
    sx, sy = c.spx(0.5, 0.5, 39)
    for y in range(sy - 7, sy + 1):
        for x in range(sx - 18, sx + 18):
            if ((x - sx + 0.5) / 18) ** 2 + ((y - sy) / 7.5) ** 2 <= 1:
                stripe = ((x - sx + 30) // 6) % 2 == 0
                tones = YELLOW if stripe else WHITE
                shade = 2 if (y <= sy - 5 or x <= sx - 10) and y < sy - 1 else 0 if y >= sy - 1 else 1
                c.put(x, y, tones[shade])
    c.hline(sx - 17, sx + 16, sy, YELLOW[0])
    sx, sy = c.spx(0.5, 0.78, 19); big = Canvas(6, 8); big.shade_ellipse(2.5, 2.5, 2.8, 2.5, CREAM); big.put(1, 1, hexc('b8803a')); big.put(3, 2, hexc('b8803a')); big.rect(1, 5, 4, 1, TAN[1]); big.rect(2, 6, 2, 1, TAN[1]); big.put(2, 7, TAN[0])
    c.blit(big, sx - 3, sy - 8)
    c.outline()
    return c


def shop_2x1(c: IsoCanvas, wall_pal, floor: str, icon: Canvas, shelf_items: list[Canvas], noren=None,
             wall_h: int = 22) -> tuple:
    """2×1 가게 공통(지붕 없음): 바닥 + 뒤 두 벽(간판·선반·창) + 앞 모서리 입간판. 방(r)과 실내 z를 돌려준다."""
    if floor == 'tile':
        r = tiled_room(c, (0, 0, 2, 1), wall_h, wall_pal)
    else:
        r = room(c, (0, 0, 2, 1), wall_h, wall_pal, PALEWOOD if floor == 'wood' else DARKWOOD, 'x', base_h=6)
    r.on_right(wall_sign(icon, 26), 8, 2)
    r.on_right(shelf_face(24, 14, shelf_items, 2), 36, 6)
    r.on_left(window_sprite(12, 10), 6, 5)
    if noren:
        n = Canvas(12, 9); n.rect(0, 0, 12, 9, noren[1]); n.hline(0, 11, 0, noren[2]); n.vline(4, 1, 8, noren[0]); n.vline(8, 1, 8, noren[0])
        r.on_left(door_sprite(12, 16), 20, 6); r.on_left(n, 20, 6)
    else:
        r.on_left(door_sprite(12, 16), 20, 6)
    standing_sign(c, 1.9, 1.02, 0, icon)
    return r, r.z


def tart_bakery() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.85)
    r, z = shop_2x1(c, CREAM, 'tile', icon_tart(), [icon_tart(), icon_cake(), icon_tart()])
    top = counter_block(c, (0.3, 0.55, 1.5, 0.85), z, 12, WHITE, (STEEL[0], STEEL[1], STEEL[2]))    # 진열 카운터
    for x, y, col in ((0.5, 0.7, ORANGE), (0.8, 0.66, PINK), (1.1, 0.7, YELLOW), (1.35, 0.68, ORANGE)):
        c.disc(x, y, 0.07, 3, col, z0=top); sx, sy = c.spx(x, y, top + 3); c.put(sx, sy - 1, col[2])
    c.box(16, STEEL, (1.62, 0.2, 1.92, 0.5), z0=z); sx, sy = c.spx(1.92, 0.35, z + 8); c.rect(sx - 6, sy - 3, 6, 4, BLACK[0]); c.rect(sx - 5, sy - 2, 4, 2, ORANGE[1])   # 오븐
    sx, sy = c.spx(0.5, 0.3, z); c.rect(sx - 4, sy - 12, 8, 12, WOOD[1]); c.hline(sx - 4, sx + 3, sy - 12, WOOD[2])
    for k in range(3):
        c.hline(sx - 3, sx + 2, sy - 10 + k * 4, WOOD[0]); c.rect(sx - 2, sy - 12 + k * 4, 2, 2, TAN[1]); c.rect(sx + 1, sy - 12 + k * 4, 2, 2, TAN[1])   # 빵 선반
    c.outline()
    return c


def noodle_shop() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.85)
    r, z = shop_2x1(c, PLASTER, 'wood', icon_bowl(), [icon_bowl(), icon_pig(), icon_bowl()], noren=NAVY)
    sx, sy = c.spx(1.95, 0.12, r.top - 2); lantern_red(c, sx - 2, sy)
    top = counter_block(c, (0.25, 0.2, 1.1, 0.48), z, 12, DARKWOOD)
    for x in (0.45, 0.8):
        c.pillar(x, 0.34, 4, 4, STEEL, z0=top); sx, sy = c.spx(x, 0.34, top + 4); c.hline(sx - 3, sx + 2, sy, STEEL[2]); smoke(c, sx, sy - 3, 2)   # 솥
    table_set(c, 0.6, 0.78, z, (YELLOW[1], WHITE[1])); table_set(c, 1.45, 0.72, z, (YELLOW[1],))
    c.outline()
    return c


def bomal_kalguksu() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.85)
    r, z = shop_2x1(c, PALEBLUE, 'tile', icon_shell(), [icon_shell(), icon_bowl(), icon_shell()], noren=(WHITE[0], WHITE[1], WHITE[2]))
    top = counter_block(c, (0.25, 0.2, 1.2, 0.48), z, 12, DARKWOOD)
    c.pillar(0.5, 0.34, 6, 6, STEEL, z0=top); sx, sy = c.spx(0.5, 0.34, top + 6); c.hline(sx - 3, sx + 2, sy, STEEL[2]); smoke(c, sx, sy - 3, 3)   # 큰 솥
    for x, col in ((0.85, WHITE[1]), (1.05, WHITE[1])):
        sx, sy = c.spx(x, 0.34, top); c.rect(sx - 2, sy - 2, 5, 2, col); c.hline(sx - 2, sx + 2, sy - 3, YELLOW[2])   # 그릇
    table_set(c, 0.65, 0.78, z, (WHITE[1],)); table_set(c, 1.5, 0.72, z, (WHITE[1], WHITE[1]))
    c.outline()
    return c


def restaurant_2x2(c: IsoCanvas, wall_pal, floor: str, icon: Canvas, shelf_items=(), lanterns: bool = False, wall_h: int = 24):
    if floor == 'tile':
        r = tiled_room(c, (0, 0, 2, 2), wall_h, wall_pal, base_h=8)
    else:
        r = room(c, (0, 0, 2, 2), wall_h, wall_pal, PALEWOOD if floor == 'wood' else DARKWOOD, 'x', base_h=8)
    r.on_right(wall_sign(icon, 30), 8, 2)
    r.on_right(window_sprite(14, 11), 44, 8)
    if shelf_items:
        r.on_left(shelf_face(26, 14, list(shelf_items), 2), 30, 4)
    r.on_left(door_sprite(14, 18), 8, 6)
    if not shelf_items:
        r.on_left(window_sprite(12, 11), 40, 8)
    if lanterns:
        for u in (6, 40, 70):
            sx, sy = c.spx(0.12 + u / 32, 0.14, r.top - 2); lantern_red(c, sx, sy)
    standing_sign(c, 1.9, 2.02, 0, icon)
    return r, r.z


def black_pork_grill() -> IsoCanvas:
    c = cv(36, 2, 2, pad=2, shadow=1.0)
    r, z = restaurant_2x2(c, PLASTER, 'dark', icon_pig(), [icon_pig(), icon_mug(), icon_pig()], lanterns=True)
    for x, y in ((0.7, 0.7), (1.5, 0.7), (0.7, 1.5), (1.5, 1.5)):
        c.box(10, DARKWOOD, (x - 0.22, y - 0.22, x + 0.22, y + 0.22), z0=z)
        c.disc(x, y, 0.12, 2, BLACK, z0=z + 10); sx, sy = c.spx(x, y, z + 12); c.rect(sx - 2, sy - 1, 2, 1, RED[1]); c.put(sx + 1, sy - 1, PINK[1]); smoke(c, sx, sy - 4, 2)
        stool(c, x - 0.34, y, z); stool(c, x, y - 0.34, z)
    c.outline()
    return c


def haenyeo_mulhoe() -> IsoCanvas:
    c = cv(36, 2, 2, pad=2, shadow=1.0)
    r, z = restaurant_2x2(c, PALEBLUE, 'tile', icon_fish(), [icon_fish(), icon_bowl(), icon_fish()])
    net = Canvas(14, 12)
    for y in range(12):
        for x in range(14):
            if (x + y) % 3 == 0: net.put(x, y, TAN[1])
    r.on_right(net, 26, 6)
    # 수조(유리 상자) + 테이블 + 테왁
    c.box(8, STEEL, (0.25, 0.25, 0.75, 0.6), z0=z)
    glass_box(c, (0.25, 0.25, 0.75, 0.6), 10, z0=z + 8, alpha=120)
    sx, sy = c.spx(0.5, 0.42, z + 12); c.blit(icon_fish(), sx - 4, sy - 3)
    table_set(c, 1.4, 0.8, z, (WHITE[1], SKY[2])); table_set(c, 0.8, 1.5, z, (WHITE[1],)); table_set(c, 1.5, 1.5, z, (SKY[2],))
    c.disc(1.85, 0.3, 0.12, 7, ORANGE, z0=z); sx, sy = c.spx(1.85, 0.3, z + 7); c.put(sx, sy - 1, ORANGE[2]); c.hline(sx - 3, sx + 2, sy + 1, OUT)
    c.outline()
    return c


def barley_pub() -> IsoCanvas:
    c = cv(36, 2, 2, pad=2, shadow=1.0)
    r, z = restaurant_2x2(c, DARKWOOD, 'dark', icon_mug(), [])
    r.on_right(bottle_row(40), 40, 4); r.on_right(bottle_row(40), 40, 12)
    r.on_left(bottle_row(30), 28, 4)
    top = counter_block(c, (0.3, 0.25, 1.7, 0.55), z, 14, DARKWOOD)
    for x in (0.6, 0.85):
        c.pillar(x, 0.32, 2, 6, STEEL, z0=top); sx, sy = c.spx(x, 0.32, top + 6); c.put(sx - 1, sy, YELLOW[1]); c.put(sx, sy, YELLOW[1])   # 탭
    for x, col in ((1.1, YELLOW[1]), (1.3, YELLOW[1]), (1.5, YELLOW[1])):
        cup(c, x, 0.42, top, col)
    for x in (0.5, 0.9, 1.3):
        stool(c, x, 0.78, z)
    c.disc(1.7, 1.7, 0.16, 12, WOOD, z0=z); sx, sy = c.spx(1.7, 1.7, z + 12); c.hline(sx - 5, sx + 4, sy + 3, STEEL[0]); c.hline(sx - 5, sx + 4, sy + 8, STEEL[0])
    table_set(c, 0.7, 1.4, z, (YELLOW[1], YELLOW[1]), round_top=True)
    string_lights(c, (0.12, 2.0, r.top - 1), (2.0, 0.12, r.top - 1), 8, 9)
    c.outline()
    return c


def prop_shop() -> IsoCanvas:
    c = cv(30, pad=2, shadow=0.45)
    r = tiled_room(c, (0, 0, 1, 1), 20, CREAM, base_h=4)
    items = [icon_heart(), icon_jar(PINK), icon_pot(), icon_jar(SKY)]
    r.on_right(shelf_face(22, 16, items, 2), 6, 3)
    r.on_left(shelf_face(18, 16, items[::-1], 2), 8, 3)
    z = r.z
    c.box(8, WOOD, (0.35, 0.35, 0.8, 0.8), z0=z)
    for x, y, col in ((0.48, 0.48, PINK), (0.68, 0.45, YELLOW), (0.5, 0.7, SKY), (0.7, 0.7, MINT)):
        c.box(3, col, (x - 0.06, y - 0.06, x + 0.06, y + 0.06), z0=z + 8, edge=False)
    standing_sign(c, 0.9, 1.02, 0, icon_heart(), PINK, 16)
    c.outline()
    return c


def boardgame_room() -> IsoCanvas:
    c = cv(34, pad=2, shadow=0.45)
    wall_segment(c, (0, 0, 1, 0.2), 30, (hexc('b8a888'), hexc('d8c8a8'), hexc('f0e4cc')))
    shelf = Canvas(18, 16); shelf.rect(0, 0, 18, 16, WOOD[0])
    for i, col in enumerate((RED, SKY, YELLOW, MINT, PINK, PURPLE)):
        shelf.rect(1 + (i % 3) * 6, 1 + (i // 3) * 8, 5, 6, col[1]); shelf.hline(1 + (i % 3) * 6, 5 + (i % 3) * 6, 1 + (i // 3) * 8, col[2])
    paste_face(c, 'left', shelf, 6, 6)
    chair(c, 0.32, 0.72, 'left'); chair(c, 0.72, 0.32, 'right')
    c.box(11, WOOD, (0.3, 0.3, 0.72, 0.72))
    c.box(1, (hexc('2f6a3a'), hexc('3f8a4a'), hexc('6fbf78')), (0.34, 0.34, 0.68, 0.68), z0=11, edge=False)
    sx, sy = c.spx(0.45, 0.45, 12); c.blit(icon_dice(), sx - 3, sy - 6)
    sx, sy = c.spx(0.62, 0.55, 12); c.rect(sx - 2, sy - 3, 4, 3, WHITE[1]); c.put(sx - 2, sy - 3, WHITE[2]); c.put(sx - 1, sy - 2, RED[1])   # 카드
    sx, sy = c.spx(0.5, 0.62, 12); c.rect(sx - 1, sy - 2, 2, 2, RED[1]); c.rect(sx + 2, sy - 3, 2, 2, SKY[1])
    c.outline()
    return c


def snap_studio() -> IsoCanvas:
    c = cv(36, shadow=0.45)
    c.box(2, STEEL, (0.02, 0.02, 0.98, 0.16)); c.box(30, WHITE, (0.02, 0.02, 0.98, 0.14), z0=2, edge=False)    # 배경막
    c.pillar(0.05, 0.05, 2, 34, STEEL); c.pillar(0.95, 0.05, 2, 34, STEEL)
    c.pillar(0.25, 0.8, 1, 16, STEEL); c.line((0.25, 0.8, 0), (0.18, 0.9, 0), STEEL[0]); c.line((0.25, 0.8, 0), (0.34, 0.86, 0), STEEL[0])   # 삼각대
    sx, sy = c.spx(0.25, 0.8, 16); c.blit(icon_camera(), sx - 4, sy - 5)
    c.pillar(0.8, 0.8, 1, 24, STEEL)
    sx, sy = c.spx(0.8, 0.8, 24); c.rect(sx - 4, sy - 6, 8, 7, WHITE[2]); c.rect(sx - 3, sy - 5, 6, 5, YELLOW[2]); c.hline(sx - 4, sx + 3, sy - 6, STEEL[0])   # 소프트박스
    c.box(2, (RED[0], RED[1], hexc('ff9a9a')), (0.3, 0.3, 0.7, 0.6), z0=0, edge=False)                   # 깔개
    plant_in_pot(c, 0.7, 0.35, 0.1, 5, CLAY, LEAF, 4)
    c.outline()
    return c


def gallery() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.85)
    r = tiled_room(c, (0, 0, 2, 1), 24, WHITE, (hexc('c8c8d0'), hexc('ececf0'), hexc('fafafc')), hexc('dcdce2'), base_h=0, n=0.5)
    for u, (a, b) in zip((12, 34, 56), ((SKY, YELLOW), (ORANGE, LEAF), (PINK, PURPLE))):
        r.on_right(picture(12, 11, a, b), u, 6)
    r.on_left(picture(14, 12, MINT, RED), 8, 5); r.on_left(picture(10, 9, PURPLE, YELLOW), 32, 6)
    banner = Canvas(8, 16); banner.rect(0, 0, 8, 16, RED[1]); banner.hline(0, 7, 0, RED[2]); banner.rect(2, 3, 4, 1, WHITE[2]); banner.rect(2, 6, 4, 1, WHITE[2]); banner.rect(2, 9, 4, 1, WHITE[2])
    r.on_right(banner, 80, 2)
    z = r.z
    c.box(10, WHITE, (0.7, 0.55, 0.95, 0.8), z0=z); sx, sy = c.spx(0.82, 0.67, z + 10); c.shade_ellipse(sx, sy - 4, 3, 4, STONE3)   # 좌대+조각
    c.box(5, (hexc('2f2a26'), hexc('4a423a'), hexc('6a6058')), (1.2, 0.6, 1.8, 0.8), z0=z)                                      # 벤치
    c.pillar(0.3, 0.3, 1, 18, STEEL, z0=z); sx, sy = c.spx(0.3, 0.3, z + 18); c.rect(sx - 2, sy - 2, 4, 2, YELLOW[1])        # 스포트라이트
    c.outline()
    return c


def pottery_studio() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.85)
    r = room(c, (0, 0, 2, 1), 22, PLASTER, (hexc('6a6a72'), hexc('8a8a92'), hexc('b0b0b8')), 'x', base_h=8, step=0.3)
    r.on_right(shelf_face(30, 16, [icon_pot(), icon_jar(CLAY), icon_pot()], 2), 8, 4)
    r.on_right(window_sprite(12, 10), 46, 6)
    kiln = Canvas(14, 16); kiln.shade_rect(0, 0, 14, 16, BASALT); kiln.rect(4, 8, 6, 6, BLACK[0]); kiln.rect(5, 10, 4, 3, ORANGE[1]); kiln.put(6, 9, YELLOW[1])
    r.on_left(kiln, 8, 8)
    z = r.z
    c.disc(1.3, 0.55, 0.16, 6, WOOD, z0=z); c.disc(1.3, 0.55, 0.12, 2, STEEL, z0=z + 6)
    sx, sy = c.spx(1.3, 0.55, z + 8); c.blit(icon_pot(), sx - 3, sy - 7)
    stool(c, 1.3, 0.85, z)
    for x, y in ((0.5, 0.65), (0.7, 0.8)):
        sx, sy = c.spx(x, y, z); c.blit(icon_pot(), sx - 3, sy - 7)
    c.box(8, WOOD, (1.6, 0.25, 1.9, 0.55), z0=z); sx, sy = c.spx(1.75, 0.4, z + 8); c.rect(sx - 3, sy - 3, 6, 3, CLAY[1]); c.put(sx - 3, sy - 3, CLAY[2])   # 흙덩이
    c.outline()
    return c


def class_2x1(c: IsoCanvas, jar_col, board_pal, extra: str) -> None:
    deck(c, (0.02, 0.02, 1.98, 0.98), 3, PALEWOOD, 'y', 0.25)
    c.box(24, WOOD, (0.05, 0.05, 0.6, 0.15), z0=3)                                  # 칠판 뒤판
    board = Canvas(16, 12); board.rect(0, 0, 16, 12, WOOD[0]); board.rect(1, 1, 14, 10, hexc('2f4a3a')); board.rect(3, 3, 6, 1, WHITE[2]); board.rect(3, 6, 9, 1, WHITE[2]); board.blit(icon_tangerine(), 10, 2)
    paste_face(c, 'left', board, 1, 2)
    for x in (0.9, 1.3, 1.7):
        c.pillar(x, 0.28, 2, 8, WOOD, z0=3); c.disc(x, 0.28, 0.1, 2, WOOD, z0=11)
    c.box(11, WOOD, (0.7, 0.42, 1.9, 0.72), z0=3)
    for i, x in enumerate((0.85, 1.1, 1.35, 1.6)):
        sx, sy = c.spx(x, 0.5, 14); c.blit(icon_jar(jar_col), sx - 2, sy - 6)
    sx, sy = c.spx(1.2, 0.64, 14)
    if extra == 'tangerine':
        for dx, dy in ((-4, -1), (-1, -2), (2, -1), (0, 0), (4, 0)):
            tangerine(c, sx + dx, sy + dy)
    else:
        c.rect(sx - 4, sy - 5, 8, 5, STEEL[1]); c.hline(sx - 4, sx + 3, sy - 5, STEEL[2]); c.rect(sx - 3, sy - 6, 6, 1, RED[1]); smoke(c, sx, sy - 9, 2)   # 잼 냄비
    for x in (0.9, 1.3, 1.7):
        c.pillar(x, 0.86, 2, 8, WOOD, z0=3); c.disc(x, 0.86, 0.1, 2, WOOD, z0=11)


def syrup_class() -> IsoCanvas:
    c = cv(30, 2, 1, shadow=0.8)
    class_2x1(c, ORANGE, None, 'tangerine')
    c.outline()
    return c


def jam_workshop() -> IsoCanvas:
    c = cv(30, 2, 1, shadow=0.8)
    class_2x1(c, (RED[0], hexc('e0552a'), hexc('ff9a6a')), None, 'pot')
    c.outline()
    return c


def books_face(w: int, h: int, rows: int) -> Canvas:
    s = Canvas(w, h); s.rect(0, 0, w, h, WOOD[0])
    cols = (RED, SKY, YELLOW, MINT, PINK, PURPLE, ORANGE, LEAF)
    rh = h // rows
    for r in range(rows):
        x = 1
        i = r * 3
        while x < w - 2:
            bw = 2 + (i % 2); col = cols[i % len(cols)]
            s.rect(x, r * rh + 1 + (i % 3 == 0), bw, rh - 2 - (i % 3 == 0), col[1]); s.put(x, r * rh + 1 + (i % 3 == 0), col[2])
            x += bw + 1; i += 1
        s.hline(0, w - 1, (r + 1) * rh - 1, WOOD[1])
    return s


def bookshelf() -> IsoCanvas:
    c = cv(38, 2, 1, pad=2, shadow=0.8)
    c.box(36, WOOD, (0.05, 0.05, 1.95, 0.35))
    paste_face(c, 'left', books_face(56, 30, 3), 2, 3)
    paste_face(c, 'right', books_face(14, 30, 3), 2, 3)
    c.box(6, (hexc('2f5f4a'), hexc('3f8a68'), hexc('6fbf98')), (1.3, 0.5, 1.8, 0.9))                  # 안락의자
    c.box(9, (hexc('2f5f4a'), hexc('3f8a68'), hexc('6fbf98')), (1.3, 0.5, 1.8, 0.6), z0=6, edge=False)
    c.pillar(0.5, 0.75, 1, 14, STEEL); sx, sy = c.spx(0.5, 0.75, 14); c.rect(sx - 3, sy - 4, 6, 4, YELLOW[1]); c.hline(sx - 3, sx + 2, sy - 4, YELLOW[2])   # 스탠드
    sx, sy = c.spx(0.9, 0.7, 0); c.blit(icon_book(), sx - 3, sy - 4)
    c.outline()
    return c


def goods_shop() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.85)
    r, z = shop_2x1(c, WHITE, 'tile', icon_tshirt(ORANGE), [icon_tshirt(SKY), icon_tshirt(PINK), icon_tshirt(YELLOW)])
    c.box(8, WOOD, (0.4, 0.55, 1.1, 0.85), z0=z)
    for x, y, col in ((0.55, 0.65, ORANGE), (0.75, 0.62, MINT), (0.95, 0.66, SKY), (0.6, 0.78, PINK), (0.9, 0.8, YELLOW)):
        c.box(3, col, (x - 0.06, y - 0.05, x + 0.06, y + 0.05), z0=z + 8, edge=False)
    c.pillar(1.5, 0.7, 1, 16, STEEL, z0=z); sx, sy = c.spx(1.5, 0.7, z + 16); c.hline(sx - 6, sx + 5, sy, STEEL[0])
    for i, col in enumerate((SKY, RED, YELLOW, MINT)):
        s2 = icon_tshirt(col); c.blit(s2, sx - 6 + i * 3, sy + 1)
    top = counter_block(c, (1.4, 0.2, 1.9, 0.45), z, 12, DARKWOOD); sx, sy = c.spx(1.7, 0.35, top); c.rect(sx - 3, sy - 5, 7, 4, BLACK[0]); c.rect(sx - 2, sy - 4, 5, 2, SKY[2])
    c.outline()
    return c


def karaoke() -> IsoCanvas:
    c = cv(32, 2, 1, pad=2, shadow=0.85)
    r = room(c, (0, 0, 2, 1), 24, PURPLE, (hexc('3a2a5a'), hexc('4a3a70'), hexc('6a5a90')), 'x', base_h=0, step=0.3)
    tv = Canvas(20, 13); tv.rect(0, 0, 20, 13, BLACK[0]); tv.rect(1, 1, 18, 11, SKY[1]); tv.rect(3, 3, 8, 1, WHITE[2]); tv.rect(3, 6, 12, 1, YELLOW[1]); tv.rect(3, 9, 6, 1, WHITE[2])
    r.on_right(tv, 24, 4)
    neon = Canvas(22, 10); neon.rect(0, 0, 22, 10, BLACK[0]); neon.blit(icon_mic(), 2, 1); neon.rect(9, 3, 10, 1, PINK[1]); neon.rect(9, 6, 7, 1, SKY[2]); neon.hline(0, 21, 0, PINK[1]); neon.hline(0, 21, 9, PINK[1])
    r.on_right(neon, 60, 4)
    r.on_left(door_sprite(12, 16, BLACK), 8, 6)
    for i, (u, v) in enumerate(((36, 4), (46, 10), (52, 3))):
        r.on_left(icon_note(), u, v)
    z = r.z
    SOFA = (hexc('7a1f3a'), hexc('b83358'), hexc('e07090'))
    c.box(6, SOFA, (0.3, 0.6, 1.7, 0.9), z0=z); c.box(7, SOFA, (0.3, 0.84, 1.7, 0.9), z0=z + 6, edge=False)
    c.box(8, BLACK, (0.7, 0.28, 1.3, 0.5), z0=z)
    sx, sy = c.spx(0.9, 0.39, z + 8); c.blit(icon_mic(), sx - 2, sy - 8); sx, sy = c.spx(1.1, 0.39, z + 8); c.blit(icon_mic(), sx - 2, sy - 8)
    cup(c, 1.25, 0.45, z + 8, YELLOW[1])
    c.pillar(1.0, 0.7, 1, 22, STEEL, z0=z); sx, sy = c.spx(1.0, 0.7, z + 22); c.shade_ellipse(sx, sy - 3, 3.4, 3.4, (STEEL[0], STEEL[2], WHITE[2]))   # 미러볼
    c.outline()
    return c


def picking_experience() -> IsoCanvas:
    c = cv(44, 2, 2, shadow=None)
    lawn(c, (0, 0, 2, 2), [(0.2, 1.0), (1.0, 0.2), (1.8, 1.0)])
    fence(c, [(0.12, 1.88), (0.12, 0.12), (1.88, 0.12)], 9, WOOD, rails=(3, 7))
    for x, y in ((0.5, 0.5), (1.5, 0.5), (0.5, 1.5)):
        t = tree2d('ready'); t.outline(); c.ground_shadow(x, y, 0.4); c.billboard(t, x, y, 1)
    c.box(6, WOOD, (1.3, 1.3, 1.7, 1.7), z0=1)
    sx, sy = c.spx(1.5, 1.5, 7); c.hline(sx - 5, sx + 4, sy - 5, WOOD[0]); c.put(sx - 5, sy - 4, WOOD[0]); c.put(sx + 4, sy - 4, WOOD[0])
    for dx, dy in ((-3, -2), (0, -3), (3, -2), (-1, -1), (2, 0)):
        tangerine(c, sx + dx, sy + dy)
    fence(c, [(1.88, 0.12), (1.88, 1.88)], 9, WOOD, rails=(3, 7))
    c.pillar(0.3, 1.86, 2, 20, WOOD); sg = sign(20, 9, (WOOD[1], WOOD[2], hexc('e0a866')), icon_tangerine()); sx, sy = c.spx(0.3, 1.86, 20); c.blit(sg, sx - 10, sy - 8)
    c.outline()
    return c


def horse_riding() -> IsoCanvas:
    c = cv(40, 3, 2, shadow=None)
    c.box(1, SAND, (0, 0, 3, 2), edge=False)
    for x, y in ((0.4, 0.4), (2.5, 0.6), (1.4, 1.5), (2.2, 1.7)):
        sx, sy = c.spx(x, y, 1); c.put(sx, sy, SAND[0]); c.put(sx + 2, sy - 1, SAND[0])
    fence(c, [(0.12, 1.88), (0.12, 0.12), (2.88, 0.12)], 10, WOOD, rails=(4, 8))
    c.box(6, TAN, (0.3, 0.3, 0.7, 0.6), z0=1); c.line((0.3, 0.45, 4), (0.7, 0.45, 4), TAN[0])          # 건초 더미
    horse(c, 1.5, 0.9, BROWN)
    horse(c, 2.4, 1.4, (hexc('3a3a3e'), hexc('5a5a60'), hexc('8a8a90')))
    fence(c, [(2.88, 0.12), (2.88, 1.88)], 10, WOOD, rails=(4, 8))
    fence(c, [(0.12, 1.88), (1.2, 1.88)], 10, WOOD, rails=(4, 8)); fence(c, [(1.8, 1.88), (2.88, 1.88)], 10, WOOD, rails=(4, 8))
    c.pillar(0.36, 1.86, 2, 22, WOOD); sg = sign(22, 10, (WOOD[1], WOOD[2], hexc('e0a866')), icon_horse()); sx, sy = c.spx(0.36, 1.86, 22); c.blit(sg, sx - 11, sy - 9)
    c.outline()
    return c


def scooter_rental() -> IsoCanvas:
    c = cv(30, 2, 2, pad=2, shadow=None)
    asphalt(c, (0, 0, 2, 2), 'x', 1)
    r = room(c, (0.05, 0.05, 0.95, 0.95), 18, MINT, PALEWOOD, 'x', base_h=0, step=0.3)
    r.on_right(wall_sign(icon_scooter(), 22), 6, 2)
    r.on_left(window_sprite(10, 8), 6, 4)
    z = r.z
    top = counter_block(c, (0.3, 0.55, 0.9, 0.8), z, 10, DARKWOOD)
    for x, col in ((0.45, RED), (0.7, YELLOW)):
        c.disc(x, 0.67, 0.06, 4, col, z0=top)                                                             # 헬멧
    for x, y, col in ((1.3, 0.5, RED), (1.6, 0.8, YELLOW), (1.3, 1.5, SKY), (0.5, 1.5, MINT)):
        scooter(c, x, y, col)
    c.outline()
    return c


def tea_field() -> IsoCanvas:
    c = cv(18, 2, 1, shadow=None)
    c.box(3, SOIL, (0.02, 0.02, 1.98, 0.98))
    tones = (hexc('3f7f2f'), hexc('62b043'), hexc('a3e06a'))
    for y in (0.25, 0.55, 0.85):
        c.box(7, tones, (0.08, y - 0.1, 1.92, y + 0.1), z0=3, edge=False)
        tmp = Canvas(c.w, c.h)
        for k in range(12):
            sx, sy = c.spx(0.12 + k * 0.155, y, 10); tmp.ellipse(sx, sy - 1, 3, 1.6, tones[2] if k % 2 else tones[1])
        texture_where(c, tmp, {tones[1], tones[2]})
    for x, y in ((0.4, 0.25), (1.5, 0.55), (1.0, 0.85)):
        sx, sy = c.spx(x, y, 10); c.put(sx, sy - 2, hexc('d5f0a0'))
    c.outline()
    return c


def hallabong_house() -> IsoCanvas:
    c = arch_house(2, 1, 20, door=True, inside='orange')
    sx, sy = c.spx(2.0, 0.2, 18); c.blit(icon_tangerine(), sx - 4, sy - 6)
    c.outline()
    return c


def sorting_house() -> IsoCanvas:
    c = cv(40, 2, 2, pad=10, shadow=1.0)
    deck(c, (0.05, 0.05, 1.95, 1.95), 3, ROAD, 'x', 0.5)
    for x, y in ((0.1, 0.1), (1.9, 0.1), (0.1, 1.9)):
        c.pillar(x, y, 3, 30, WOOD, z0=3)
    # 컨베이어 + 감귤 상자
    c.box(8, STEEL, (0.3, 0.7, 1.7, 1.0), z0=3)
    c.line((0.32, 0.85, 11), (1.68, 0.85, 11), BLACK[0])
    for x in (0.5, 0.8, 1.1, 1.4):
        sx, sy = c.spx(x, 0.85, 11); tangerine(c, sx - 1, sy - 2)
    for x, y in ((0.4, 1.4), (0.75, 1.55), (1.3, 1.4)):
        c.box(7, WOOD, (x - 0.15, y - 0.15, x + 0.15, y + 0.15), z0=3)
        sx, sy = c.spx(x, y, 10)
        for dx, dy in ((-3, -2), (0, -3), (3, -2), (-1, -1), (2, 0)):
            tangerine(c, sx + dx, sy + dy)
    c.pillar(1.9, 1.9, 3, 30, WOOD, z0=3)
    c.gable_roof((0.04, 0.04, 1.96, 1.96), 33, 12, SLATE, axis='y', slates=3)
    sg = sign(20, 9, (WOOD[1], WOOD[2], hexc('e0a866')), icon_tangerine()); sx, sy = c.spx(1.0, 2.0, 30); c.blit(sg, sx - 10, sy - 4)
    c.outline()
    return c


# ================================================================ 경관
def cedar() -> IsoCanvas:
    return billboard(cedar2d(46), 0.34)


def hackberry_millennium() -> IsoCanvas:
    s = big_tree2d(96, 92, 12, [(30, 46, 24, 16), (66, 44, 24, 16), (48, 30, 30, 18), (34, 20, 16, 11), (64, 18, 16, 11), (48, 12, 14, 9)], DARKLEAF)
    s.hline(38, 58, 91, WOOD[0])
    c = billboard(s, 0.7, 2, 2)
    # 뿌리 둘레 돌 테
    for x, y, r in ((0.5, 1.5, 0.12), (1.5, 0.5, 0.12), (1.6, 1.6, 0.1), (0.6, 0.5, 0.1)):
        rock(c, x, y, r, 4)
    c.outline()
    return c


# ================================================================ 랜드마크
def dolhareubang_pair() -> IsoCanvas:
    c = cv(40, 2, 1, shadow=0.8)
    for x in (0.5, 1.5):
        c.box(5, STONE3, (x - 0.24, 0.26, x + 0.24, 0.74))
        d = dolhareubang_sprite(); d.outline()
        c.ground_shadow(x, 0.5, 0.3); c.billboard(d, x, 0.5, 5)
    c.outline()
    return c


def bangsatap() -> IsoCanvas:
    c = cv(52, 2, 2, shadow=0.9)
    tiers = ((0.9, 12), (0.72, 12), (0.52, 12), (0.32, 10))
    z = 0
    for r, h in tiers:
        c.disc(1.0, 1.0, r, h, BASALT, z0=z); z += h
    stone_texture(c, {BASALT[0], BASALT[1]}, 3.2, 2.2, 8, 5)
    # 꼭대기 새(까마귀돌)
    sx, sy = c.spx(1.0, 1.0, 46)
    c.rect(sx - 3, sy - 4, 6, 4, STONE3[1]); c.rect(sx + 2, sy - 7, 3, 4, STONE3[1]); c.put(sx + 5, sy - 6, STONE3[0]); c.put(sx - 4, sy - 5, STONE3[0]); c.hline(sx - 3, sx + 2, sy - 4, STONE3[2])
    c.outline()
    return c


def stone_guardians() -> IsoCanvas:
    c = cv(30, 2, 1, shadow=None)
    lawn(c, (0.05, 0.05, 1.95, 0.95))
    c.box(8, BASALT, (0.05, 0.05, 1.95, 0.2)); c.box(8, BASALT, (0.05, 0.05, 0.15, 0.95)); c.box(8, BASALT, (1.85, 0.05, 1.95, 0.95)); c.box(8, BASALT, (0.05, 0.8, 1.95, 0.95))
    stone_texture(c, {BASALT[0], BASALT[1], BASALT[2]}, 2.8, 2.0, 7, 4)
    c.disc(1.0, 0.5, 0.42, 6, GRASS, z0=1)                       # 봉분
    sx, sy = c.spx(1.0, 0.5, 7); c.shade_ellipse(sx - 0.5, sy - 0.5, 19, 9.5, GRASS, light=(-0.4, -0.5))
    for x in (0.55, 1.45):
        s = Canvas(9, 16); s.shade_rect(2, 6, 5, 10, STONE3); s.shade_ellipse(4.5, 4, 3.5, 3.5, STONE3); s.put(3, 3, STONE3[0]); s.put(6, 3, STONE3[0]); s.hline(3, 5, 6, STONE3[0]); s.rect(3, 0, 3, 2, STONE3[1])
        s.outline(); c.ground_shadow(x, 0.85, 0.12); c.billboard(s, x, 0.86)
    c.outline()
    return c


def millstone() -> IsoCanvas:
    c = cv(34, 2, 2, shadow=0.9)
    c.disc(1.0, 1.0, 0.8, 5, STONE3)
    stone_texture(c, {STONE3[0], STONE3[1]}, 3.4, 2.2, 9, 5)
    c.disc(1.0, 1.0, 0.72, 4, STONE3, z0=5)
    sx, sy = c.spx(1.0, 1.0, 9); c.ellipse(sx - 0.5, sy - 0.5, 42, 21, STONE3[0]); c.ellipse(sx - 0.5, sy - 0.5, 40, 20, STONE3[2])
    c.pillar(1.0, 1.0, 4, 18, WOOD, z0=9)
    # 세워 놓은 둥근 웃돌: 정면 타원(3톤) + 축 구멍, 굴대(빔)
    cx, cy = c.spx(1.35, 1.0, 9)
    s2 = Canvas(24, 24)
    s2.shade_ellipse(11.5, 11.5, 10.5, 11.5, (STONE3[1], hexc('b4b4bc'), hexc('d8d8de')))
    for y in range(24):
        for x in range(18, 24):
            if s2.px[y][x][3] == 0 and ((x - 11.5 - 4) / 10.5) ** 2 + ((y - 11.5) / 11.5) ** 2 <= 1:
                s2.put(x, y, STONE3[0])
    s2.rect(10, 10, 4, 4, WOOD[0]); s2.put(11, 11, WOOD[1])
    s2.outline()
    c.blit(s2, cx - 12, cy - 24)
    c.line((1.0, 1.0, 22), (1.4, 1.0, 21), WOOD[1]); c.line((1.0, 1.0, 23), (1.4, 1.0, 22), WOOD[2])
    c.line((1.4, 1.0, 21), (1.95, 1.0, 14), WOOD[1]); c.line((1.4, 1.0, 22), (1.95, 1.0, 15), WOOD[2])
    c.outline()
    return c


def haenyeo_hut() -> IsoCanvas:
    c = cv(24, 2, 1, shadow=0.8)
    c.box(2, SAND, (0.02, 0.02, 1.98, 0.98), edge=False)
    # 반원 돌담(뒤쪽) — 돌 무더기 배열
    for x, y, r, h in ((0.15, 0.2, 0.14, 10), (0.4, 0.1, 0.15, 12), (0.75, 0.06, 0.15, 13), (1.1, 0.06, 0.15, 13), (1.45, 0.1, 0.15, 12), (1.75, 0.2, 0.14, 10), (1.9, 0.45, 0.12, 8), (0.08, 0.45, 0.12, 8)):
        rock(c, x, y, r, h)
    c.disc(1.0, 0.55, 0.22, 2, BLACK, z0=2)
    sx, sy = c.spx(1.0, 0.55, 4)
    c.rect(sx - 4, sy - 1, 8, 2, WOOD[0]); c.rect(sx - 2, sy - 6, 5, 5, RED[1]); c.rect(sx - 1, sy - 9, 3, 4, ORANGE[1]); c.put(sx, sy - 10, YELLOW[1]); c.put(sx, sy - 6, YELLOW[2])
    c.disc(1.6, 0.8, 0.12, 7, ORANGE); sx, sy = c.spx(1.6, 0.8, 7); c.put(sx, sy - 1, ORANGE[2]); c.hline(sx - 3, sx + 2, sy + 1, OUT)   # 테왁
    net = Canvas(10, 6)
    for y in range(6):
        for x in range(10):
            if (x + y) % 2 == 0: net.put(x, y, TAN[1])
    sx, sy = c.spx(0.4, 0.8, 0); c.blit(net, sx - 5, sy - 5)
    c.outline()
    return c


def observatory() -> IsoCanvas:
    c = cv(64, 2, 2, pad=4, shadow=1.0)
    for x, y in ((0.2, 0.2), (1.8, 0.2), (0.2, 1.8)):
        c.pillar(x, y, 3, 40, WOOD)
    for z in (14, 28):
        c.line((0.2, 0.2, z), (1.8, 0.2, z), WOOD[0]); c.line((0.2, 0.2, z), (0.2, 1.8, z), WOOD[0])
        c.line((1.8, 0.2, z), (1.8, 1.8, z), WOOD[0]); c.line((0.2, 1.8, z), (1.8, 1.8, z), WOOD[0])
    # 계단(앞 오른쪽 면)
    for i in range(8):
        c.box(3, WOOD, (1.55 + i * 0.05, 1.9 - i * 0.2 - 0.18, 1.85 + i * 0.05, 1.9 - i * 0.2), z0=i * 5, edge=False)
    c.pillar(1.8, 1.8, 3, 40, WOOD)
    c.box(4, PALEWOOD, (0.05, 0.05, 1.95, 1.95), z0=40)
    for y in (0.35, 0.65, 0.95, 1.25, 1.55, 1.85):
        c.line((0.07, y, 44), (1.93, y, 44), PALEWOOD[1])
    for (a, b) in (((0.05, 1.95), (1.95, 1.95)), ((1.95, 1.95), (1.95, 0.05)), ((0.05, 0.05), (0.05, 1.95)), ((0.05, 0.05), (1.95, 0.05))):
        for z in (49, 53):
            c.line((a[0], a[1], z), (b[0], b[1], z), WOOD[2]); c.line((a[0], a[1], z - 1), (b[0], b[1], z - 1), WOOD[0])
    for x, y in ((0.05, 0.05), (1.95, 0.05), (0.05, 1.95), (1.0, 1.95), (1.95, 1.0), (1.95, 1.95)):
        c.pillar(x, y, 2, 12, WOOD, z0=44)
    c.pillar(1.0, 1.0, 2, 10, STEEL, z0=44); sx, sy = c.spx(1.0, 1.0, 54); c.rect(sx - 4, sy - 3, 8, 3, STEEL[1]); c.hline(sx - 4, sx + 3, sy - 3, STEEL[2]); c.put(sx - 5, sy - 2, STEEL[0])   # 망원경
    c.outline()
    return c


def lighthouse() -> IsoCanvas:
    c = cv(44, pad=4, shadow=0.42)
    c.box(10, BASALT, (0.16, 0.16, 0.84, 0.84))
    c.box(10, BASALT, (0.22, 0.22, 0.78, 0.78), z0=10)
    c.box(10, BASALT, (0.28, 0.28, 0.72, 0.72), z0=20)
    stone_texture(c, {BASALT[0], BASALT[1]}, 2.8, 2.0, 7, 4)
    c.box(2, STONE3, (0.24, 0.24, 0.76, 0.76), z0=30)
    for x, y in ((0.32, 0.68), (0.68, 0.32), (0.68, 0.68)):
        c.pillar(x, y, 1, 8, WOOD, z0=32)
    sx, sy = c.spx(0.5, 0.5, 34); c.rect(sx - 3, sy - 3, 6, 5, YELLOW[1]); c.rect(sx - 2, sy - 2, 3, 3, YELLOW[2])
    c.box(3, SLATE, (0.26, 0.26, 0.74, 0.74), z0=40)
    c.outline()
    return c


def hackberry_shade() -> IsoCanvas:
    s = big_tree2d(88, 80, 9, [(28, 40, 22, 14), (60, 40, 22, 14), (44, 26, 26, 15), (30, 16, 14, 9), (58, 15, 14, 9), (44, 9, 12, 8)], LEAF)
    c = cv(76, 2, 2)
    c.ground_shadow(1.0, 0.9, 0.9)
    deck(c, (0.3, 1.2, 1.1, 1.9), 8, PALEWOOD, 'x', 0.16)
    c.pillar(0.34, 1.86, 2, 8, WOOD); c.pillar(1.06, 1.24, 2, 8, WOOD)
    s.outline()
    c.billboard(s, 1.0, 0.85, 0)
    c.box(2, (RED[0], RED[1], hexc('ff9a9a')), (0.5, 1.4, 0.7, 1.6), z0=8, edge=False)
    cup(c, 0.9, 1.5, 8, WHITE[1])
    for x, y, r in ((1.6, 1.5, 0.12), (1.75, 1.2, 0.1)):
        rock(c, x, y, r, 4)
    c.outline()
    return c


def sprites() -> dict[str, Canvas]:
    s = {
        # 쉼
        'terrace_seat': terrace_seat(), 'toenmaru': toenmaru(), 'hammock': hammock(), 'bench_stonewall': bench_stonewall(),
        'kids_table': kids_table(), 'fire_pit': fire_pit(), 'oreum_bench': oreum_bench(), 'greenhouse_seat': greenhouse_seat(),
        'sofa': sofa(), 'picnic': picnic(), 'rooftop': rooftop(), 'vinyl_house_room': vinyl_house_room(),
        'tangerine_hall': tangerine_hall(),
        # 편의
        'stroller_park': stroller_park(), 'bike_rack': bike_rack(), 'translator': translator(), 'cat_house': cat_house(),
        'parking': parking(), 'staff_room': staff_room(), 'wifi_zone': wifi_zone(), 'dog_park': dog_park(),
        'parking_large': parking_large(),
        # 먹거리
        'handdrip_bar': handdrip_bar(), 'hallabong_stand': hallabong_stand(), 'omegi_stall': omegi_stall(),
        'peanut_icecream': peanut_icecream(), 'tart_bakery': tart_bakery(), 'noodle_shop': noodle_shop(),
        'bomal_kalguksu': bomal_kalguksu(), 'black_pork_grill': black_pork_grill(), 'haenyeo_mulhoe': haenyeo_mulhoe(),
        'barley_pub': barley_pub(),
        # 즐길거리
        'prop_shop': prop_shop(), 'boardgame_room': boardgame_room(), 'snap_studio': snap_studio(), 'gallery': gallery(),
        'pottery_studio': pottery_studio(), 'syrup_class': syrup_class(), 'jam_workshop': jam_workshop(),
        'bookshelf': bookshelf(), 'goods_shop': goods_shop(), 'karaoke': karaoke(),
        'picking_experience': picking_experience(), 'horse_riding': horse_riding(), 'scooter_rental': scooter_rental(),
        # 농사
        'field': field('empty'), 'tea_field': tea_field(), 'hallabong_house': hallabong_house(), 'sorting_house': sorting_house(),
        # 경관
        'cedar': cedar(), 'hackberry_millennium': hackberry_millennium(),
        # 랜드마크
        'dolhareubang_pair': dolhareubang_pair(), 'bangsatap': bangsatap(), 'stone_guardians': stone_guardians(),
        'millstone': millstone(), 'haenyeo_hut': haenyeo_hut(), 'observatory': observatory(), 'lighthouse': lighthouse(),
        'hackberry_shade': hackberry_shade(),
    }
    return {f'iso_obj_{k}': v for k, v in s.items()}
