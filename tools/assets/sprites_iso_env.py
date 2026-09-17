"""환경 오브젝트 14종 `iso_obj_<id>` (데이터 표 §1.5). 나무·꽃·석상은 빌보드, 돌·석등·연못·꽃밭은 상자/원판."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color
from iso import IsoCanvas, texture_where
from sprites_objects import trunk, canopy, stone as stone2d
from sprites_iso_objects import cv, billboard, STONE3, DARKLEAF

LEAF, ORANGE, WOOD, BASALT = PAL['leaf'], PAL['orange'], PAL['wood'], PAL['basalt']
SKY, WHITE, RED, YELLOW, GRASS, PINK = PAL['sky'], PAL['white'], PAL['red'], PAL['yellow'], PAL['grass'], PAL['pink']
TAN = (hexc('a8894a'), hexc('d4b56a'), hexc('f0dea0'))
CLAY = (hexc('5a3a22'), hexc('8a5a34'), hexc('b8804e'))
PURPLE = (hexc('6a5aa8'), hexc('9a8ad8'), hexc('c9bff2'))


def blob_canopy(s: Canvas, cx: float, cy: float, rx: float, ry: float, bumps, tones) -> None:
    dk, md, lt = tones
    lx, ly = cx - 0.45 * rx, cy - 0.6 * ry
    for y in range(s.h):
        for x in range(s.w):
            inside = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
            if not inside:
                for bx, by, r in bumps:
                    if (x - bx) ** 2 + (y - by) ** 2 <= r * r:
                        inside = True; break
            if inside:
                d = ((x - lx) / (rx * 0.9)) ** 2 + ((y - ly) / (ry * 0.85)) ** 2
                s.put(x, y, lt if d < 0.45 else md if d < 1.15 else dk)


# ---------------------------------------------------------------- 돌
def rock(c: IsoCanvas, x: float, y: float, r: float, h: int) -> None:
    """현무암 바위: 원기둥 + 둥근 윗면(좌상단 하이라이트)."""
    c.disc(x, y, r, h, BASALT)
    sx, sy = c.screen(x, y, h)
    rx, ry = r * 32 * 1.4142, r * 16 * 1.4142
    c.shade_ellipse(sx - 0.5, sy - 0.5, rx, ry, (BASALT[1], BASALT[2], hexc('9a9aa3')), light=(-0.4, -0.5))


def basalt_rock() -> IsoCanvas:
    c = cv(14, shadow=0.4)
    rock(c, 0.42, 0.42, 0.3, 8)
    rock(c, 0.74, 0.7, 0.16, 5)
    for x, y in ((0.22, 0.78), (0.8, 0.3)):
        sx, sy = c.spx(x, y); c.put(sx, sy, GRASS[1]); c.put(sx + 1, sy - 1, GRASS[2])
    c.outline()
    return c


def dolhareubang_sprite(w: int = 20, h: int = 34) -> Canvas:
    s = Canvas(w, h)
    dk, md, lt = STONE3
    s.shade_rect(4, 22, 12, 12, STONE3)                      # 몸통 하단
    s.shade_ellipse(10, 20, 7, 7, STONE3)                    # 몸통
    s.shade_ellipse(10, 9, 6, 6, STONE3)                     # 머리
    s.shade_ellipse(10, 3.5, 7, 2.6, STONE3)                 # 모자 챙
    s.shade_rect(6, 0, 8, 3, STONE3)
    s.rect(6, 7, 3, 3, dk); s.rect(11, 7, 3, 3, dk)          # 왕눈
    s.put(7, 8, hexc('b4b4bc')); s.put(12, 8, hexc('b4b4bc'))
    s.rect(9, 10, 2, 4, dk)                                  # 코
    s.hline(7, 12, 15, dk)                                   # 입(다문)
    s.rect(3, 18, 4, 6, md); s.rect(13, 20, 4, 6, md)        # 손
    s.hline(3, 6, 18, lt); s.hline(13, 16, 20, lt)
    s.hline(4, 15, 22, dk)
    return s


def dolhareubang() -> IsoCanvas:
    return billboard(dolhareubang_sprite(), 0.36)


def stone_lantern() -> IsoCanvas:
    c = cv(34, shadow=0.36)
    c.box(4, STONE3, (0.3, 0.3, 0.7, 0.7))
    c.box(12, STONE3, (0.42, 0.42, 0.58, 0.58), z0=4)
    c.box(3, STONE3, (0.34, 0.34, 0.66, 0.66), z0=16)
    c.box(8, STONE3, (0.37, 0.37, 0.63, 0.63), z0=19)
    sx, sy = c.spx(0.5, 0.63, 23); c.rect(sx - 4, sy - 3, 4, 4, YELLOW[1]); c.put(sx - 3, sy - 2, YELLOW[2])
    sx, sy = c.spx(0.63, 0.5, 23); c.rect(sx, sy - 3, 4, 4, YELLOW[0]); c.put(sx + 1, sy - 2, YELLOW[1])
    c.box(3, STONE3, (0.28, 0.28, 0.72, 0.72), z0=27)
    c.box(3, STONE3, (0.44, 0.44, 0.56, 0.56), z0=30)
    c.outline()
    return c


def water_jar() -> IsoCanvas:
    s = Canvas(16, 18)
    dk, md, lt = CLAY
    s.shade_ellipse(8, 11, 7, 6.5, CLAY)
    s.rect(5, 2, 6, 4, md); s.hline(5, 10, 2, lt); s.hline(4, 11, 1, dk); s.hline(5, 10, 0, md)
    s.vline(5, 3, 5, lt); s.vline(10, 3, 5, dk)
    s.hline(2, 13, 17, dk)
    s.rect(6, 5, 4, 3, dk)
    return billboard(s, 0.25)


# ---------------------------------------------------------------- 풀·꽃
def pampas() -> IsoCanvas:
    s = Canvas(24, 30)
    dk, md, lt = TAN
    for i, (x0, top, lean) in enumerate(((11, 6, -3), (7, 9, -5), (15, 8, 3), (4, 13, -6), (19, 12, 5), (12, 12, 1))):
        for y in range(top, 30):
            t = (y - top) / (30 - top)
            x = x0 + int(lean * (1 - t))
            s.put(x, y, md if i % 2 else dk)
        for dy in range(0, 6):
            w = 1 if dy in (0, 5) else 2
            s.rect(x0 + int(lean) - w // 2, top - 6 + dy, w + 1, 1, lt if dy < 3 else WHITE[1])
    return billboard(s, 0.32)


def canola() -> IsoCanvas:
    s = Canvas(26, 16)
    for y in range(6, 16):
        for x in range(26):
            if ((x - 12.5) / 12.5) ** 2 + ((y - 12) / 5) ** 2 <= 1:
                s.put(x, y, GRASS[1] if (x + y) % 3 else GRASS[0])
    for x, y in ((3, 8), (8, 5), (13, 3), (18, 5), (22, 8), (6, 11), (16, 9), (11, 8), (20, 12)):
        s.rect(x, y, 2, 2, YELLOW[1]); s.put(x, y, YELLOW[2]); s.put(x + 1, y + 2, GRASS[0])
    return billboard(s, 0.4)


def hydrangea() -> IsoCanvas:
    s = Canvas(28, 24)
    blob_canopy(s, 14, 15, 13, 8, [(7, 9, 5), (20, 8, 5), (14, 6, 5)], DARKLEAF)
    for cx, cy, tones in ((7, 9, SKY), (20, 8, PURPLE), (14, 6, SKY), (12, 14, PURPLE), (22, 15, SKY)):
        s.shade_ellipse(cx, cy, 4, 3.4, (tones[0], tones[1], tones[2]))
        s.put(cx, cy, tones[2]); s.put(cx - 2, cy + 1, tones[0]); s.put(cx + 2, cy - 1, tones[2])
    return billboard(s, 0.42)


def flower_bed() -> IsoCanvas:
    c = cv(10, pad=6, shadow=None)
    c.box(3, STONE3, (0.06, 0.06, 0.94, 0.94))
    c.box(2, PAL['soil'], (0.14, 0.14, 0.86, 0.86), z0=3, edge=False)
    tmp = Canvas(c.w, c.h)
    for x, y, tones in ((0.28, 0.3, PINK), (0.5, 0.25, YELLOW), (0.72, 0.3, RED), (0.3, 0.55, YELLOW), (0.52, 0.5, RED),
                        (0.74, 0.56, PINK), (0.3, 0.78, RED), (0.52, 0.76, PINK), (0.74, 0.8, YELLOW)):
        sx, sy = c.spx(x, y, 5)
        c.rect(sx - 1, sy - 1, 2, 1, GRASS[1]); c.put(sx - 2, sy - 2, GRASS[0])
        c.rect(sx - 1, sy - 4, 3, 3, tones[1]); c.put(sx - 1, sy - 4, tones[2]); c.put(sx + 1, sy - 2, tones[0])
    c.outline()
    return c


# ---------------------------------------------------------------- 나무
def camellia() -> IsoCanvas:
    s = Canvas(30, 40)
    trunk(s, 14, 26, 39, 3)
    blob_canopy(s, 15, 15, 12, 10.5, [(8, 9, 5), (22, 10, 5), (15, 5, 5)], DARKLEAF)
    for x, y in ((7, 12), (17, 7), (23, 15), (12, 20), (20, 22)):
        s.rect(x, y, 3, 3, RED[1]); s.put(x + 1, y + 1, YELLOW[1]); s.put(x, y, RED[2]); s.put(x + 2, y + 2, RED[0])
    return billboard(s, 0.42)


def pine() -> IsoCanvas:
    s = Canvas(32, 48)
    dk, md, lt = DARKLEAF
    trunk(s, 14, 24, 47, 3)
    s.put(12, 30, WOOD[0]); s.put(11, 31, WOOD[0]); s.put(18, 33, WOOD[0]); s.put(19, 34, WOOD[0])   # 가지
    for cx, cy, rx, ry in ((9, 22, 8, 4.5), (23, 24, 8, 4.2), (16, 14, 9, 5), (10, 10, 6, 3.5), (21, 8, 6, 3.5), (16, 4, 5, 3)):
        blob_canopy(s, cx, cy, rx, ry, [], DARKLEAF)
    return billboard(s, 0.42)


def palm() -> IsoCanvas:
    s = Canvas(36, 52)
    dk, md, lt = WOOD
    for y in range(16, 52):
        t = (y - 16) / 36
        x = int(17 + 5 * (1 - t) ** 2)
        s.put(x, y, lt if y % 4 else md); s.put(x + 1, y, md); s.put(x + 2, y, dk)
    ldk, lmd, llt = LEAF
    x0, y0 = 19, 14
    for (ex, ey, arc) in ((1, 20, 9), (5, 8, 6), (13, 2, 3), (25, 2, 3), (33, 8, 6), (35, 20, 9), (10, 26, 4), (29, 26, 4)):
        n = 14
        for i in range(n + 1):
            t = i / n
            x = int(x0 + (ex - x0) * t + 0.5)
            y = int(y0 + (ey - y0) * t - arc * 4 * t * (1 - t) + 0.5)
            w = 3 if i < 10 else 2
            s.rect(x - w // 2, y - 1, w, 2, lmd if (i // 2) % 2 else ldk)
            if i < 8:
                s.put(x - w // 2, y - 1, llt)
    for x, y in ((17, 13), (20, 14), (18, 16)):
        s.rect(x, y, 2, 2, ORANGE[0])                            # 열매
    return billboard(s, 0.36)


# ---------------------------------------------------------------- 연못·허수아비·간판
def pond() -> IsoCanvas:
    c = cv(6, 2, 1, pad=4)
    c.box(4, STONE3, (0, 0, 2, 1))
    water = (SKY[0], SKY[1], hexc('9fd0f4'))
    c.box(2, water, (0.1, 0.1, 1.9, 0.9), z0=2, edge=False)
    tmp = Canvas(c.w, c.h)
    for x, y in ((0.5, 0.35), (1.2, 0.6), (1.6, 0.3)):
        sx, sy = c.spx(x, y, 4); tmp.hline(sx - 3, sx + 3, sy, water[2]); tmp.hline(sx - 1, sx + 4, sy + 1, water[2])
    texture_where(c, tmp, {water[2], water[1]})
    sx, sy = c.spx(0.8, 0.75, 4); c.ellipse(sx, sy, 3, 1.6, LEAF[1]); c.put(sx - 2, sy, LEAF[2]); c.put(sx + 1, sy, PINK[1])
    sx, sy = c.spx(1.5, 0.8, 4); c.ellipse(sx, sy, 2.4, 1.3, LEAF[1])
    c.outline()
    return c


def scarecrow() -> IsoCanvas:
    s = Canvas(26, 40)
    s.rect(12, 14, 2, 26, WOOD[0]); s.put(12, 14, WOOD[1])
    s.rect(3, 18, 20, 2, WOOD[0])
    s.rect(7, 16, 12, 12, SKY[1]); s.hline(7, 18, 16, SKY[2]); s.vline(18, 16, 27, SKY[0])   # 셔츠
    s.rect(3, 17, 5, 4, SKY[1]); s.rect(18, 17, 5, 4, SKY[1])
    for x in (3, 8, 19, 23):
        s.rect(x, 21, 1, 3, YELLOW[1])                                   # 소매 밖 짚
    s.shade_ellipse(13, 10, 5, 5, TAN)                                    # 얼굴(자루)
    s.put(11, 9, OUT); s.put(15, 9, OUT); s.hline(11, 15, 12, OUT)
    s.shade_ellipse(13, 3.5, 8, 2.4, TAN); s.shade_rect(9, 0, 8, 4, TAN)  # 밀짚모자
    s.rect(10, 28, 6, 4, YELLOW[1])                                      # 아래 짚
    return billboard(s, 0.3)


def signboard() -> IsoCanvas:
    s = Canvas(28, 30)
    s.rect(12, 14, 4, 16, WOOD[0]); s.vline(12, 14, 29, WOOD[1])
    s.shade_rect(2, 4, 24, 12, (WOOD[1], WOOD[2], hexc('e0a866')))
    s.rect(6, 7, 12, 2, OUT); s.rect(6, 11, 16, 2, OUT)
    s.shade_ellipse(22, 8, 2.4, 2.2, ORANGE); s.put(23, 5, LEAF[1])
    s.put(2, 4, OUT); s.put(25, 4, OUT); s.put(2, 15, OUT); s.put(25, 15, OUT)
    return billboard(s, 0.28)


def sprites() -> dict[str, Canvas]:
    return {
        'iso_obj_basalt_rock': basalt_rock(), 'iso_obj_dolhareubang': dolhareubang(), 'iso_obj_pampas': pampas(),
        'iso_obj_canola': canola(), 'iso_obj_camellia': camellia(), 'iso_obj_hydrangea': hydrangea(),
        'iso_obj_pine': pine(), 'iso_obj_palm': palm(), 'iso_obj_stone_lantern': stone_lantern(),
        'iso_obj_water_jar': water_jar(), 'iso_obj_flower_bed': flower_bed(), 'iso_obj_pond': pond(),
        'iso_obj_scarecrow': scarecrow(), 'iso_obj_signboard': signboard(),
    }
