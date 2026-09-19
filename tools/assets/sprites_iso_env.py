"""환경 오브젝트 14종 `iso_obj_<id>` (데이터 표 §1.5). 나무·꽃·석상은 빌보드, 돌·석등·연못·꽃밭은 상자/원판.
트랙 H 손님 유입 경로: 경로 시설 5종(렌터카 주차장 2×2·넓은 주차장 3×2·셔틀 정류장·선착장 2×1·올레 표식)과 진입점 표지 5종 `iso_obj_route_<bus|car|plane|ship|ribbon>`(잠김은 렌더가 회색 tint)."""
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


# ---------------------------------------------------------------- 트랙 H: 손님 유입 경로 시설·진입점 표지
ASPHALT = (hexc('3a3a40'), hexc('55555c'), hexc('76767e'))
PLANK = (hexc('6a4a2a'), hexc('a07a48'), hexc('c9a06a'))
OLLE_BLUE = (hexc('1f5fa8'), hexc('3b8ad9'), hexc('8ec1f0'))
OLLE_ORANGE = (hexc('c8601a'), hexc('f28c28'), hexc('ffc27a'))


def car(c: IsoCanvas, x: float, y: float, z0: int, body: tuple[Color, Color, Color]) -> None:
    """작은 렌터카: 차체 상자 + 유리 캐빈 + 앞 유리 하이라이트 (셀 좌표 중심 x,y)."""
    c.box(5, body, (x - 0.32, y - 0.2, x + 0.32, y + 0.2), z0=z0)
    c.box(3, (SKY[0], SKY[1], SKY[2]), (x - 0.16, y - 0.16, x + 0.14, y + 0.16), z0=z0 + 5, edge=False)
    sx, sy = c.spx(x + 0.32, y + 0.2, z0 + 2); c.put(sx, sy, YELLOW[2]); c.put(sx - 1, sy, YELLOW[1])   # 전조등


def parking(cw: int, cars: list[tuple[float, float, tuple[Color, Color, Color]]]) -> IsoCanvas:
    """아스팔트 판 + 흰 주차선 + 차 몇 대."""
    c = cv(14, cw, 2, pad=2, shadow=1.0)
    c.box(2, ASPHALT)
    for i in range(1, cw):                                                      # 세로 주차선
        c.line((i, 0.08, 2), (i, 1.92, 2), WHITE[1])
    c.line((0.08, 1.0, 2), (cw - 0.08, 1.0, 2), WHITE[0])                       # 가운데 통로선
    for (x, y, col) in cars:
        car(c, x, y, 2, col)
    sx, sy = c.spx(cw - 0.25, 1.75, 2)
    sign = Canvas(9, 12)
    sign.rect(4, 4, 1, 8, BASALT[1]); sign.shade_rect(1, 0, 7, 5, (SKY[0], SKY[1], SKY[2])); sign.rect(3, 1, 3, 3, WHITE[2]); sign.put(4, 2, SKY[1])
    c.blit(sign, sx - 4, sy - 12)                                               # P 표지판
    c.outline()
    return c


def parking_lot() -> IsoCanvas:
    return parking(2, [(0.5, 0.5, RED), (1.5, 1.5, WHITE)])


def parking_big() -> IsoCanvas:
    return parking(3, [(0.5, 0.5, RED), (1.5, 0.5, SKY), (2.5, 1.5, WHITE)])


def shuttle_stop() -> IsoCanvas:
    """공항 셔틀 정류장: 정류장 기둥 + 흰 바탕 비행기 표지 + 벤치."""
    c = cv(40, shadow=0.45)
    c.box(4, PLANK, (0.3, 0.6, 0.94, 0.86))
    c.box(4, PLANK, (0.28, 0.58, 0.96, 0.88), z0=4)
    c.pillar(0.22, 0.22, 2, 30, BASALT)
    sign = Canvas(14, 11)
    sign.shade_rect(0, 0, 14, 11, WHITE)
    sign.hline(3, 10, 5, SKY[0]); sign.hline(4, 9, 4, SKY[1]); sign.vline(7, 2, 8, SKY[0]); sign.put(6, 3, SKY[1]); sign.put(8, 3, SKY[1])  # 비행기
    sign.outline()
    sx, sy = c.spx(0.22, 0.22, 30)
    c.blit(sign, sx - 6, sy - 9)
    c.outline()
    return c


def pier() -> IsoCanvas:
    """선착장 2×1: 널판 데크 + 계선주 + 구명 튜브. 북쪽 끝(y=0)에 붙여 바다 쪽으로 낸다."""
    c = cv(18, 2, 1, pad=2, shadow=0.8)
    c.box(3, PLANK)
    for i in range(1, 8):                                                        # 널판 이음새
        c.line((i / 4, 0.05, 3), (i / 4, 0.95, 3), PLANK[0])
    for (x, y) in ((0.25, 0.25), (1.75, 0.25)):
        c.disc(x, y, 0.1, 9, BASALT, z0=3, edge=True)                            # 계선주
    ring = Canvas(9, 9)
    ring.ellipse(4, 4, 4, 4, RED[1]); ring.ellipse(4, 4, 1.6, 1.6, (0, 0, 0, 0)); ring.put(1, 4, WHITE[1]); ring.put(7, 4, WHITE[1]); ring.put(4, 1, WHITE[1]); ring.put(4, 7, WHITE[1])
    sx, sy = c.spx(1.1, 0.7, 3)
    c.blit(ring, sx - 4, sy - 10)
    c.outline()
    return c


def olle_sign() -> IsoCanvas:
    """올레 표식: 나무 말뚝에 파랑·주황 리본 두 가닥 + 화살표 조랑말 판."""
    s = Canvas(22, 32)
    s.rect(10, 8, 3, 24, WOOD[0]); s.vline(10, 8, 31, WOOD[1])
    s.shade_rect(6, 4, 11, 6, (OLLE_BLUE[0], OLLE_BLUE[1], OLLE_BLUE[2]))       # 파란 화살표 판
    s.hline(8, 13, 7, WHITE[2]); s.put(14, 7, WHITE[2]); s.put(13, 6, WHITE[2]); s.put(13, 8, WHITE[2])
    for i, (dx, col) in enumerate(((0, OLLE_BLUE), (3, OLLE_ORANGE))):           # 리본 두 가닥
        x0 = 13 + dx
        for y in range(11, 24):
            s.put(x0 + (1 if (y // 3) % 2 == 0 else 0) + (1 if i else 0), y, col[1] if y % 4 else col[2])
    return billboard(s, 0.28)


def route_marker(icon: Canvas) -> IsoCanvas:
    """진입점 표지: 짧은 말뚝 위 흰 판에 아이콘. 렌더가 잠긴 경로엔 회색 tint를 건다."""
    s = Canvas(16, 22)
    s.rect(7, 12, 2, 10, WOOD[0]); s.put(7, 12, WOOD[1])
    s.shade_rect(1, 0, 14, 13, WHITE)
    s.blit(icon, 3, 2)
    return billboard(s, 0.22, outline=True)


def icon_bus() -> Canvas:
    i = Canvas(10, 9); i.shade_rect(0, 1, 10, 7, YELLOW); i.rect(1, 2, 3, 3, SKY[2]); i.rect(5, 2, 3, 3, SKY[2]); i.put(1, 8, BASALT[0]); i.put(8, 8, BASALT[0]); return i


def icon_car() -> Canvas:
    i = Canvas(10, 9); i.rect(0, 4, 10, 4, RED[1]); i.rect(2, 1, 6, 3, RED[0]); i.rect(3, 2, 4, 2, SKY[2]); i.put(1, 8, BASALT[0]); i.put(8, 8, BASALT[0]); i.put(9, 5, YELLOW[2]); return i


def icon_plane() -> Canvas:
    i = Canvas(10, 9); i.hline(0, 9, 4, SKY[0]); i.hline(1, 8, 3, SKY[1]); i.vline(5, 0, 8, SKY[0]); i.put(4, 1, SKY[1]); i.put(6, 1, SKY[1]); i.put(4, 7, SKY[1]); i.put(6, 7, SKY[1]); return i


def icon_ship() -> Canvas:
    i = Canvas(10, 9); i.rect(0, 5, 10, 3, SKY[0]); i.hline(1, 8, 8, SKY[1]); i.rect(2, 2, 6, 3, WHITE[1]); i.rect(3, 3, 1, 1, SKY[2]); i.rect(5, 3, 1, 1, SKY[2]); i.rect(4, 0, 2, 2, RED[1]); return i


def icon_ribbon() -> Canvas:
    i = Canvas(10, 9)
    for y in range(9):
        i.put(2 + (y % 2), y, OLLE_BLUE[1]); i.put(6 + (y % 2), y, OLLE_ORANGE[1])
    i.put(3, 0, OLLE_BLUE[2]); i.put(7, 0, OLLE_ORANGE[2])
    return i


def sprites() -> dict[str, Canvas]:
    return {
        'iso_obj_basalt_rock': basalt_rock(), 'iso_obj_dolhareubang': dolhareubang(), 'iso_obj_pampas': pampas(),
        'iso_obj_canola': canola(), 'iso_obj_camellia': camellia(), 'iso_obj_hydrangea': hydrangea(),
        'iso_obj_pine': pine(), 'iso_obj_palm': palm(), 'iso_obj_stone_lantern': stone_lantern(),
        'iso_obj_water_jar': water_jar(), 'iso_obj_flower_bed': flower_bed(), 'iso_obj_pond': pond(),
        'iso_obj_scarecrow': scarecrow(), 'iso_obj_signboard': signboard(),
        # 트랙 H 손님 유입 경로
        'iso_obj_parking_lot': parking_lot(), 'iso_obj_parking_big': parking_big(), 'iso_obj_shuttle_stop': shuttle_stop(), 'iso_obj_pier': pier(), 'iso_obj_olle_sign': olle_sign(),
        'iso_obj_route_bus': route_marker(icon_bus()), 'iso_obj_route_car': route_marker(icon_car()), 'iso_obj_route_plane': route_marker(icon_plane()),
        'iso_obj_route_ship': route_marker(icon_ship()), 'iso_obj_route_ribbon': route_marker(icon_ribbon()),
    }
