"""아이소 스프라이트 공용 부품: 건물 벽·지붕·차양·매대·간판 아이콘·유리·울타리·차·동물.
모든 부품은 IsoCanvas 위에 셀 좌표로 그린다(광원 좌상단, 윗면 LT·왼쪽 MD·오른쪽 DK)."""
from __future__ import annotations
from typing import Callable
from px import Canvas, PAL, OUT, hexc, Color
from iso import IsoCanvas, paste_face
from sprites_objects import tangerine, trunk
from sprites_iso_objects import (cv, chair, cup, window_sprite, door_sprite, stone_texture,
                                 PLASTER, SLATE, STONE3, DARKLEAF, GLASS, VINYL, STEEL)

LEAF, ORANGE, WOOD, BASALT = PAL['leaf'], PAL['orange'], PAL['wood'], PAL['basalt']
SOIL, SKY, WHITE, RED, YELLOW, GRASS, SNOW, PINK, ROAD = (PAL['soil'], PAL['sky'], PAL['white'], PAL['red'],
                                                          PAL['yellow'], PAL['grass'], PAL['snow'], PAL['pink'],
                                                          PAL['road'])
MINT = (hexc('2f8a72'), hexc('4fbf9f'), hexc('a6e8d4'))
CREAM = (hexc('d8c8a0'), hexc('f2e6c8'), hexc('fff8e8'))
TERRA = (hexc('8a4a2a'), hexc('c4703f'), hexc('e8a070'))
NAVY = (hexc('1f3557'), hexc('2f5486'), hexc('5a86c0'))
PURPLE = (hexc('4a2f7a'), hexc('6e4aae'), hexc('a98ae0'))
CLAY = (hexc('5a3a22'), hexc('8a5a34'), hexc('b8804e'))
TAN = (hexc('a8894a'), hexc('d4b56a'), hexc('f0dea0'))
PALEWOOD = (hexc('8a6a3a'), hexc('c9a366'), hexc('e8cc92'))
DARKWOOD = (hexc('3a2412'), hexc('5e3a1c'), hexc('96602c'))
BLACK = (hexc('1a1a1e'), hexc('2a2a2e'), hexc('4a4a52'))
SAND = (hexc('b89a5a'), hexc('d9bf80'), hexc('f0dcaa'))
BROWN = (hexc('4a2e16'), hexc('7a4f2a'), hexc('a8763f'))
FOAM = hexc('fff8d0')


# ---------------------------------------------------------------- 건물
def building(c: IsoCanvas, rect, base_h: int, wall_h: int, wall_pal=PLASTER, base_pal=BASALT, stones: bool = True) -> None:
    """현무암 기단 + 벽. 두 단을 한 벽으로 취급해 paste_face가 되도록 last_box를 고친다."""
    c.box(base_h, base_pal, rect)
    if stones and base_h >= 6:
        stone_texture(c, {base_pal[0], base_pal[1]}, 3.2, 2.2, 8, 5)
    c.box(wall_h, wall_pal, rect, z0=base_h, edge=False)
    c.last_box['height'] = base_h + wall_h; c.last_box['z0'] = 0


def flat_roof(c: IsoCanvas, rect, z: int, pal=SLATE, over: float = 0.08, h: int = 3) -> None:
    x0, y0, x1, y1 = rect
    c.box(h, pal, (x0 - over, y0 - over, x1 + over, y1 + over), z0=z)


def awning(c: IsoCanvas, rect, z: int, pal, stripe=WHITE, axis: str = 'x', h: int = 3, scallop: bool = True) -> None:
    """줄무늬 차양. axis='x'면 줄이 x 방향으로 달린다(y마다 한 줄)."""
    c.box(h, pal, rect, z0=z, edge=False)
    x0, y0, x1, y1 = rect
    if axis == 'x':
        n = max(2, int((y1 - y0) * 4))
        for k in range(1, n, 2):
            y = y0 + (y1 - y0) * (k + 0.5) / n
            c.line((x0 + 0.02, y, z + h), (x1 - 0.02, y, z + h), stripe[1])
    else:
        n = max(2, int((x1 - x0) * 4))
        for k in range(1, n, 2):
            x = x0 + (x1 - x0) * (k + 0.5) / n
            c.line((x, y0 + 0.02, z + h), (x, y1 - 0.02, z + h), stripe[1])
    if scallop:   # 앞 두 변 아래 1px 점선(늘어진 천)
        for t in range(0, 100, 12):
            u = t / 100
            sx, sy = c.spx(x0 + (x1 - x0) * u, y1, z); c.put(sx, sy + 1, pal[0])
            sx, sy = c.spx(x1, y0 + (y1 - y0) * u, z); c.put(sx, sy + 1, pal[0])


def stall(c: IsoCanvas, rect, pal, stripe=WHITE, post_h: int = 32, counter: bool = True, counter_pal=WOOD) -> None:
    """네 기둥 + 앞쪽 카운터 + 차양(기념품 매대와 같은 문법)."""
    x0, y0, x1, y1 = rect
    c.pillar(x0 + 0.1, y0 + 0.1, 2, post_h, WOOD); c.pillar(x1 - 0.1, y0 + 0.1, 2, post_h, WOOD)
    if counter:
        c.box(12, counter_pal, (x0 + 0.1, y0 + 0.3, x1 - 0.1, y1 - 0.12))
    c.pillar(x0 + 0.1, y1 - 0.1, 2, post_h, WOOD); c.pillar(x1 - 0.1, y1 - 0.1, 2, post_h, WOOD)
    awning(c, rect, post_h, pal, stripe)


def wall_segment(c: IsoCanvas, rect, h: int, pal=PLASTER) -> None:
    """뒤쪽 벽 조각(창가석 문법)."""
    c.box(h, pal, rect, edge=True)


# ---------------------------------------------------------------- 간판·아이콘
def text_lines(s: Canvas, x: int, y: int, w: int, rows: int = 2, col: Color = OUT, gap: int = 2) -> None:
    for r in range(rows):
        ww = w if r % 2 == 0 else max(3, w - 3)
        s.rect(x, y + r * gap, ww, 1, col)


def sign(w: int, h: int, pal, icon: Canvas | None = None, rows: int = 2, text: bool = True) -> Canvas:
    """배경 상자 + 왼쪽 아이콘 + 글자 대시."""
    s = Canvas(w, h)
    s.shade_rect(0, 0, w, h, pal)
    x = 2
    if icon is not None:
        s.blit(icon, 2, (h - icon.h) // 2); x = icon.w + 4
    if text and w - x - 2 >= 4:
        text_lines(s, x, (h - rows * 2 + 1) // 2, w - x - 2, rows)
    return s


def icon_cup() -> Canvas:
    s = Canvas(7, 6); s.rect(0, 1, 5, 5, WHITE[1]); s.hline(0, 4, 1, hexc('6b4a2a')); s.put(5, 2, WHITE[1]); s.put(5, 3, WHITE[1])
    s.put(4, 5, WHITE[0]); s.put(1, 0, WHITE[2]); s.put(3, 0, WHITE[2]); return s


def icon_cake() -> Canvas:
    s = Canvas(7, 6); s.rect(1, 2, 5, 4, PINK[1]); s.hline(1, 5, 2, WHITE[2]); s.rect(2, 4, 3, 1, RED[1]); s.put(3, 0, RED[1]); s.put(3, 1, YELLOW[2]); return s


def icon_tart() -> Canvas:
    s = Canvas(7, 7); s.shade_ellipse(3, 3.5, 3.4, 3, (TAN[0], TAN[1], TAN[2])); s.shade_ellipse(3, 3.5, 2, 1.8, ORANGE); return s


def icon_fish() -> Canvas:
    s = Canvas(8, 5); s.shade_ellipse(3, 2, 3.2, 2.2, SKY); s.put(6, 1, SKY[0]); s.put(7, 0, SKY[1]); s.put(7, 4, SKY[1]); s.put(6, 3, SKY[0]); s.put(2, 1, WHITE[2]); return s


def icon_pig() -> Canvas:
    s = Canvas(7, 6); s.shade_ellipse(3, 3, 3.4, 2.8, (hexc('5a4a4a'), hexc('7a6a6a'), hexc('a09090'))); s.rect(3, 3, 3, 2, PINK[1]); s.put(4, 3, PINK[0]); s.put(1, 2, WHITE[2]); s.put(1, 0, hexc('5a4a4a')); s.put(5, 0, hexc('5a4a4a')); return s


def icon_bowl() -> Canvas:
    s = Canvas(8, 6); s.rect(1, 2, 6, 3, WHITE[1]); s.hline(2, 5, 5, WHITE[0]); s.hline(0, 7, 2, WHITE[2]); s.rect(1, 0, 6, 2, YELLOW[2]); s.put(2, 1, YELLOW[0]); s.put(5, 1, YELLOW[0]); return s


def icon_mug() -> Canvas:
    s = Canvas(7, 7); s.rect(0, 1, 5, 6, YELLOW[1]); s.hline(0, 4, 1, FOAM); s.hline(0, 4, 0, FOAM); s.put(5, 2, YELLOW[0]); s.put(5, 4, YELLOW[0]); s.put(6, 3, YELLOW[0]); s.put(4, 6, YELLOW[0]); return s


def icon_book() -> Canvas:
    s = Canvas(7, 6); s.rect(0, 0, 3, 6, RED[1]); s.rect(4, 0, 3, 6, SKY[1]); s.vline(3, 0, 5, WHITE[1]); s.hline(1, 1, 1, RED[2]); s.hline(5, 5, 1, SKY[2]); return s


def icon_camera() -> Canvas:
    s = Canvas(8, 6); s.rect(0, 1, 8, 5, BASALT[0]); s.rect(2, 0, 3, 1, BASALT[0]); s.rect(3, 2, 3, 3, SKY[1]); s.put(4, 3, WHITE[2]); s.put(6, 1, RED[1]); return s


def icon_note() -> Canvas:
    s = Canvas(6, 7); s.vline(4, 0, 5, WHITE[2]); s.rect(2, 4, 3, 3, WHITE[2]); s.hline(4, 5, 0, WHITE[2]); return s


def icon_paw() -> Canvas:
    s = Canvas(7, 6); s.shade_ellipse(3, 4, 2.2, 1.8, BROWN); s.put(0, 1, BROWN[1]); s.put(2, 0, BROWN[1]); s.put(4, 0, BROWN[1]); s.put(6, 1, BROWN[1]); return s


def icon_letter(ch: str, col: Color = WHITE[2]) -> Canvas:
    """5×7 대문자 몇 개(P, S, W, i)."""
    rows = {
        'P': ['1110', '1001', '1001', '1110', '1000', '1000', '1000'],
        'S': ['0111', '1000', '1000', '0110', '0001', '0001', '1110'],
        'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
        'i': ['0', '1', '0', '1', '1', '1', '1'],
        '!': ['1', '1', '1', '1', '1', '0', '1'],
    }[ch]
    s = Canvas(len(rows[0]), 7)
    for y, r in enumerate(rows):
        for x, v in enumerate(r):
            if v == '1':
                s.put(x, y, col)
    return s


def icon_wifi(col: Color = WHITE[2]) -> Canvas:
    s = Canvas(9, 6)
    s.hline(2, 6, 0, col); s.put(1, 1, col); s.put(7, 1, col)
    s.hline(3, 5, 2, col); s.put(2, 3, col); s.put(6, 3, col)
    s.put(4, 5, col); return s


def icon_tangerine() -> Canvas:
    s = Canvas(7, 7); s.shade_ellipse(3, 4, 3, 2.8, ORANGE); s.put(3, 1, LEAF[1]); s.put(4, 0, LEAF[2]); return s


def icon_shell() -> Canvas:
    s = Canvas(7, 6); s.shade_ellipse(3, 3, 3.2, 2.6, (hexc('3f3a4a'), hexc('6a6078'), hexc('a098b0'))); s.put(3, 3, hexc('3f3a4a')); s.put(2, 2, hexc('3f3a4a')); s.put(4, 4, hexc('3f3a4a')); return s


def icon_icecream() -> Canvas:
    s = Canvas(6, 8); s.shade_ellipse(2.5, 2.5, 2.8, 2.5, CREAM); s.put(1, 1, hexc('b8803a')); s.put(3, 2, hexc('b8803a'))
    s.rect(1, 5, 4, 1, TAN[1]); s.rect(2, 6, 2, 1, TAN[1]); s.put(2, 7, TAN[0]); return s


def icon_mic() -> Canvas:
    s = Canvas(5, 8); s.shade_ellipse(2, 2, 2.4, 2.4, STEEL); s.put(1, 1, WHITE[2]); s.rect(2, 4, 1, 3, STEEL[0]); s.hline(1, 3, 7, STEEL[0]); return s


def icon_dice() -> Canvas:
    s = Canvas(6, 6); s.shade_rect(0, 0, 6, 6, WHITE); s.put(1, 1, OUT); s.put(4, 1, OUT); s.put(1, 4, OUT); s.put(4, 4, OUT); s.put(2, 2, OUT); return s


def icon_pot() -> Canvas:
    s = Canvas(6, 7); s.shade_ellipse(2.5, 4, 2.8, 2.6, CLAY); s.rect(1, 0, 4, 2, CLAY[1]); s.hline(1, 4, 0, CLAY[2]); return s


def icon_jar(col=ORANGE) -> Canvas:
    s = Canvas(5, 6); s.rect(0, 1, 5, 5, col[1]); s.put(0, 1, col[2]); s.put(4, 5, col[0]); s.rect(1, 0, 3, 1, WOOD[0]); s.hline(0, 4, 3, col[2]); return s


def icon_scooter() -> Canvas:
    s = Canvas(8, 7); s.put(1, 5, BASALT[0]); s.put(6, 5, BASALT[0]); s.rect(1, 4, 6, 1, STEEL[1]); s.vline(6, 0, 4, STEEL[1]); s.hline(5, 7, 0, STEEL[0]); s.rect(2, 3, 2, 1, RED[1]); return s


def icon_horse() -> Canvas:
    s = Canvas(9, 7); s.rect(2, 2, 5, 3, BROWN[1]); s.rect(6, 0, 2, 3, BROWN[1]); s.put(8, 1, BROWN[0]); s.put(7, 0, BROWN[0])
    for x in (2, 6): s.rect(x, 5, 1, 2, BROWN[0])
    s.put(1, 3, BROWN[0]); return s


def icon_tshirt(col=SKY) -> Canvas:
    s = Canvas(7, 6); s.rect(1, 0, 5, 6, col[1]); s.put(0, 1, col[1]); s.put(6, 1, col[1]); s.put(3, 0, col[0]); s.hline(1, 5, 0, col[2]); return s


def icon_heart() -> Canvas:
    s = Canvas(5, 5); s.rect(0, 0, 2, 2, RED[1]); s.rect(3, 0, 2, 2, RED[1]); s.rect(0, 2, 5, 1, RED[1]); s.rect(1, 3, 3, 1, RED[1]); s.put(2, 4, RED[0]); s.put(0, 0, RED[2]); return s


def icon_stroller() -> Canvas:
    s = Canvas(8, 7); s.rect(1, 2, 5, 3, SKY[1]); s.rect(1, 0, 3, 2, SKY[0]); s.vline(6, 0, 4, STEEL[0]); s.put(7, 0, STEEL[0]); s.put(1, 5, BASALT[0]); s.put(5, 5, BASALT[0]); s.put(1, 6, BASALT[0]); s.put(5, 6, BASALT[0]); return s


def icon_bike() -> Canvas:
    s = Canvas(9, 6); s.shade_ellipse(2, 3.5, 2, 2, (BASALT[0], BASALT[1], BASALT[2])); s.shade_ellipse(7, 3.5, 2, 2, (BASALT[0], BASALT[1], BASALT[2]))
    s.hline(2, 7, 3, RED[1]); s.put(4, 2, RED[1]); s.put(4, 1, RED[1]); s.put(3, 0, BASALT[0]); s.put(5, 0, BASALT[0]); return s


# ---------------------------------------------------------------- 유리
def translucent(c: IsoCanvas, draw: Callable[[IsoCanvas], None], alpha: int = 150) -> None:
    """같은 규격의 임시 캔버스에 그린 뒤 반투명으로 얹는다. 빈 바닥 위에 얹힌 픽셀은 불투명화(외곽선이 잡히도록)."""
    pad = c.h - (c.cw + c.ch) * 16 - c.height
    tmp = IsoCanvas(c.cw, c.ch, c.height, pad)
    draw(tmp)
    for y in range(c.h):
        for x in range(c.w):
            r, g, b, a = tmp.px[y][x]
            if a == 0:
                continue
            base = c.px[y][x]
            if base[3] < 255:
                c.px[y][x] = (r, g, b, 255)
            else:
                c.blend(x, y, (r, g, b, alpha))


def glass_box(c: IsoCanvas, rect, h: int, z0: int = 0, alpha: int = 150, frame=STEEL) -> None:
    translucent(c, lambda t: t.box(h, GLASS, rect, z0=z0, edge=False), alpha)
    x0, y0, x1, y1 = rect
    for x, y in ((x0, y1), (x1, y1), (x1, y0)):
        c.line((x, y, z0), (x, y, z0 + h), frame[0])
    c.line((x0, y1, z0 + h), (x1, y1, z0 + h), frame[1]); c.line((x1, y1, z0 + h), (x1, y0, z0 + h), frame[1])
    c.line((x0, y0, z0 + h), (x0, y1, z0 + h), frame[1]); c.line((x0, y0, z0 + h), (x1, y0, z0 + h), frame[1])


# ---------------------------------------------------------------- 울타리·바닥
def fence(c: IsoCanvas, pts: list[tuple[float, float]], h: int = 9, pal=WOOD, rails=(3, 7), post_w: int = 2) -> None:
    for i, (x, y) in enumerate(pts):
        c.pillar(x, y, post_w, h, pal)
        if i + 1 < len(pts):
            x2, y2 = pts[i + 1]
            for z in rails:
                c.line((x, y, z), (x2, y2, z), pal[1]); c.line((x, y, z - 1), (x2, y2, z - 1), pal[0])


def deck(c: IsoCanvas, rect, h: int = 4, pal=WOOD, planks: str = 'x', step: float = 0.2) -> None:
    """나무 데크: 상자 + 판자 줄."""
    c.box(h, pal, rect)
    x0, y0, x1, y1 = rect
    if planks == 'x':
        y = y0 + step
        while y < y1 - 0.05:
            c.line((x0 + 0.02, y, h), (x1 - 0.02, y, h), pal[1]); y += step
    else:
        x = x0 + step
        while x < x1 - 0.05:
            c.line((x, y0 + 0.02, h), (x, y1 - 0.02, h), pal[1]); x += step


def asphalt(c: IsoCanvas, rect, lines: str = 'x', n: int = 2) -> None:
    c.box(2, ROAD, rect)
    x0, y0, x1, y1 = rect
    for k in range(1, n):
        if lines == 'x':
            y = y0 + (y1 - y0) * k / n; c.line((x0 + 0.05, y, 2), (x1 - 0.05, y, 2), WHITE[1])
        else:
            x = x0 + (x1 - x0) * k / n; c.line((x, y0 + 0.05, 2), (x, y1 - 0.05, 2), WHITE[1])


def lawn(c: IsoCanvas, rect, tufts: list[tuple[float, float]] = ()) -> None:
    c.box(1, GRASS, rect, edge=False)
    for x, y in tufts:
        sx, sy = c.spx(x, y, 1); c.put(sx, sy - 1, GRASS[2]); c.put(sx + 1, sy, GRASS[0])


# ---------------------------------------------------------------- 탈것·동물
def car(c: IsoCanvas, x: float, y: float, pal, along: str = 'x') -> None:
    L, W = (0.72, 0.4) if along == 'x' else (0.4, 0.72)
    r = (x - L / 2, y - W / 2, x + L / 2, y + W / 2)
    for wx, wy in ((r[0] + 0.12, r[1] + 0.05), (r[2] - 0.12, r[1] + 0.05), (r[0] + 0.12, r[3] - 0.05), (r[2] - 0.12, r[3] - 0.05)):
        c.box(3, BLACK, (wx - 0.06, wy - 0.06, wx + 0.06, wy + 0.06), edge=False)
    c.box(5, pal, r, z0=2)
    if along == 'x':
        cab = (r[0] + 0.18, r[1] + 0.05, r[2] - 0.2, r[3] - 0.05)
    else:
        cab = (r[0] + 0.05, r[1] + 0.18, r[2] - 0.05, r[3] - 0.2)
    c.box(5, pal, cab, z0=7, edge=False)
    c.line((cab[0], cab[3], 9), (cab[2], cab[3], 9), SKY[2]); c.line((cab[2], cab[3], 9), (cab[2], cab[1], 9), SKY[1])   # 창
    c.line((cab[0], cab[3], 10), (cab[2], cab[3], 10), SKY[2]); c.line((cab[2], cab[3], 10), (cab[2], cab[1], 10), SKY[1])
    sx, sy = c.spx(r[2], r[3], 5); c.put(sx - 1, sy - 1, YELLOW[2]); c.put(sx, sy - 1, YELLOW[2])            # 전조등


def scooter(c: IsoCanvas, x: float, y: float, pal) -> None:
    c.box(2, BLACK, (x - 0.16, y - 0.04, x - 0.08, y + 0.04), edge=False)
    c.box(2, BLACK, (x + 0.08, y - 0.04, x + 0.16, y + 0.04), edge=False)
    c.box(2, pal, (x - 0.14, y - 0.05, x + 0.1, y + 0.05), z0=2, edge=False)
    c.pillar(x + 0.12, y, 1, 14, STEEL, z0=2)
    sx, sy = c.spx(x + 0.12, y, 16); c.hline(sx - 2, sx + 2, sy, STEEL[0]); c.hline(sx - 2, sx + 2, sy - 1, STEEL[2])


def horse(c: IsoCanvas, x: float, y: float, pal=BROWN) -> None:
    for lx, ly in ((x - 0.18, y - 0.07), (x - 0.18, y + 0.07), (x + 0.16, y - 0.07), (x + 0.16, y + 0.07)):
        c.pillar(lx, ly, 2, 10, pal)
    c.box(9, pal, (x - 0.24, y - 0.11, x + 0.22, y + 0.11), z0=10)
    c.box(7, pal, (x + 0.16, y - 0.08, x + 0.34, y + 0.08), z0=17, edge=False)     # 목
    c.box(6, pal, (x + 0.26, y - 0.07, x + 0.46, y + 0.07), z0=20, edge=False)     # 머리
    sx, sy = c.spx(x + 0.4, y, 26); c.put(sx - 1, sy - 1, BLACK[0]); c.put(sx + 1, sy - 1, BLACK[0])   # 귀
    c.line((x - 0.2, y, 19), (x + 0.18, y, 19), BLACK[0]); c.line((x - 0.2, y, 20), (x + 0.16, y, 20), BLACK[0])  # 갈기
    sx, sy = c.spx(x - 0.24, y, 17); c.vline(sx, sy - 1, sy + 7, BLACK[0]); c.put(sx - 1, sy + 6, BLACK[0])   # 꼬리
    sx, sy = c.spx(x + 0.42, y + 0.07, 23); c.put(sx, sy, WHITE[2])                                        # 눈


def dog(c: IsoCanvas, x: float, y: float, pal=TAN) -> None:
    for lx, ly in ((x - 0.08, y - 0.04), (x - 0.08, y + 0.04), (x + 0.08, y - 0.04), (x + 0.08, y + 0.04)):
        c.pillar(lx, ly, 1, 4, pal)
    c.box(5, pal, (x - 0.12, y - 0.07, x + 0.12, y + 0.07), z0=4, edge=False)
    c.box(5, pal, (x + 0.08, y - 0.06, x + 0.2, y + 0.06), z0=7, edge=False)      # 머리
    sx, sy = c.spx(x + 0.16, y, 12); c.put(sx - 2, sy, BROWN[0]); c.put(sx + 2, sy, BROWN[0])   # 귀
    sx, sy = c.spx(x + 0.2, y + 0.06, 9); c.put(sx, sy, BLACK[0])                              # 코
    sx, sy = c.spx(x - 0.12, y, 8); c.put(sx, sy - 1, pal[1]); c.put(sx - 1, sy - 2, pal[1])    # 꼬리


def cat2d(col=ORANGE, sit: bool = True) -> Canvas:
    """앉은 고양이 정면 11×11(귀·줄무늬·꼬리)."""
    s = Canvas(12, 11)
    dk, md, lt = col
    s.shade_ellipse(5.5, 7.5, 4.2, 3.4, col)               # 몸
    s.shade_ellipse(5.5, 3.5, 3.4, 3, col)                 # 머리
    s.put(3, 0, md); s.put(8, 0, md); s.put(3, 1, md); s.put(8, 1, md); s.put(3, 1, PINK[1]); s.put(8, 1, PINK[1])   # 귀
    s.put(4, 3, OUT); s.put(7, 3, OUT); s.put(5, 5, PINK[1]); s.put(6, 5, PINK[1])                       # 눈·코
    s.hline(2, 3, 7, dk); s.hline(8, 9, 8, dk); s.hline(4, 7, 9, dk)                                    # 줄무늬
    s.hline(9, 11, 9, md); s.put(11, 8, md); s.put(11, 7, dk)                                            # 꼬리
    s.put(4, 10, dk); s.put(7, 10, dk)                                                                   # 발
    return s


# ---------------------------------------------------------------- 나무
def big_tree2d(w: int, h: int, trunk_w: int, canopies: list[tuple[float, float, float, float]], tones=LEAF,
               fruit: list[tuple[int, int]] = (), roots: bool = True) -> Canvas:
    """큰 나무 정면 스프라이트: 굵은 줄기 + 여러 잎뭉치(광원 좌상단 3톤)."""
    from sprites_iso_env import blob_canopy
    s = Canvas(w, h)
    dk, md, lt = WOOD
    cx = w // 2
    top = min(int(cy) for cx_, cy, rx, ry in canopies)
    trunk(s, cx - trunk_w // 2, top, h - 1, trunk_w)
    if roots:
        s.hline(cx - trunk_w // 2 - 2, cx - trunk_w // 2, h - 1, md); s.hline(cx + trunk_w // 2, cx + trunk_w // 2 + 2, h - 1, dk)
        s.put(cx - trunk_w // 2 - 1, h - 2, md); s.put(cx + trunk_w // 2 + 1, h - 2, dk)
    for bx, by, rx, ry in canopies:
        blob_canopy(s, bx, by, rx, ry, [], tones)
    for x, y in fruit:
        tangerine(s, x, y)
    return s


def smoke(c: IsoCanvas, sx: int, sy: int, n: int = 3) -> None:
    for i in range(n):
        r = 1 + i
        c.ellipse(sx + (i % 2) * 2 - 1, sy - i * 5, r + 0.5, r * 0.8 + 0.5, WHITE[1] if i % 2 else WHITE[2])


def lantern_red(c: IsoCanvas, sx: int, sy: int) -> None:
    c.rect(sx - 2, sy, 5, 6, RED[1]); c.vline(sx - 2, sy, sy + 5, RED[0]); c.put(sx - 1, sy + 1, RED[2]); c.rect(sx - 1, sy - 1, 3, 1, YELLOW[0]); c.rect(sx - 1, sy + 6, 3, 1, YELLOW[0])


def string_lights(c: IsoCanvas, p0: tuple[float, float, float], p1: tuple[float, float, float], sag: int = 4, n: int = 6) -> None:
    """두 점 사이 늘어진 전선 + 알전구."""
    x0, y0 = c.screen(p0[0], p0[1], p0[2]); x1, y1 = c.screen(p1[0], p1[1], p1[2])
    steps = max(8, int(abs(x1 - x0)))
    pts = []
    for i in range(steps + 1):
        t = i / steps
        pts.append((int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t))))
    for px, py in pts:
        c.put(px, py, BASALT[0])
    for k in range(1, n):
        px, py = pts[int(len(pts) * k / n)]
        col = (YELLOW[2], PINK[1], SKY[2], YELLOW[1])[k % 4]
        c.rect(px, py + 1, 2, 2, col); c.put(px + 1, py + 2, YELLOW[0] if col == YELLOW[2] else col)


def plant_in_pot(c: IsoCanvas, x: float, y: float, pot_r: float = 0.12, pot_h: int = 6, pot=CLAY, leaf=LEAF, size: int = 5) -> None:
    c.disc(x, y, pot_r, pot_h, pot)
    sx, sy = c.spx(x, y, pot_h)
    dk, md, lt = leaf
    c.ellipse(sx, sy - size + 1, size, size * 0.75, md)
    c.ellipse(sx - 1, sy - size, size * 0.5, size * 0.4, lt)
    c.put(sx + size - 2, sy - 1, dk); c.put(sx + 1, sy - size - 1, lt)


# ---------------------------------------------------------------- 지붕 없는 방(Hot Springs Story 문법)
# 바닥 + 뒤쪽 두 벽(x=x0 벽 = 화면 뒤-왼쪽, DK 면 / y=y0 벽 = 화면 뒤-오른쪽, MD 면). 앞 두 면은 열려 있어 실내가 보인다.
class Room:
    def __init__(self, c: IsoCanvas, rect, wall_h: int, t: float, floor_h: int, base_h: int):
        self.c, self.rect, self.wall_h, self.t, self.floor_h, self.base_h = c, rect, wall_h, t, floor_h, base_h
        x0, y0, x1, y1 = rect
        self.r_left = (x0, y0, x0 + t, y1)      # 화면 뒤-왼쪽 벽(면은 +x 방향 = 'right' 면)
        self.r_right = (x0, y0, x1, y0 + t)     # 화면 뒤-오른쪽 벽(면은 +y 방향 = 'left' 면)

    def _select(self, r) -> None:
        c = self.c
        m = c.footprint(r)
        c.last_box = {'rect': r, 'height': self.wall_h + self.base_h, 'z0': self.floor_h,
                      'split': int(c.screen(r[2], r[3])[0]), 'x0': min(m), 'x1': max(m),
                      'ymax': {px: hi for px, (lo, hi) in m.items()}}

    def on_left(self, sprite: Canvas, u: int, v: int) -> None:
        """뒤-왼쪽 벽 면에 붙인다. u는 벽 면의 앞(왼쪽 아래) 끝에서부터 px."""
        self._select(self.r_left)
        paste_face(self.c, 'right', sprite, u, v)

    def on_right(self, sprite: Canvas, u: int, v: int) -> None:
        """뒤-오른쪽 벽 면에 붙인다. u는 안쪽 모서리 근처(벽 왼쪽 끝)에서부터 px — 첫 t·32px는 왼쪽 벽에 가려진다."""
        self._select(self.r_right)
        paste_face(self.c, 'left', sprite, u, v)

    @property
    def z(self) -> int:
        """실내 바닥 높이(가구의 z0)."""
        return self.floor_h

    @property
    def top(self) -> int:
        return self.floor_h + self.base_h + self.wall_h

    def inner(self, pad: float = 0.0):
        x0, y0, x1, y1 = self.rect
        return (x0 + self.t + pad, y0 + self.t + pad, x1 - pad, y1 - pad)


def room(c: IsoCanvas, rect, wall_h: int = 22, wall_pal=PLASTER, floor=PALEWOOD, planks: str = 'x', t: float = 0.12,
         floor_h: int = 3, base_h: int = 0, base_pal=BASALT, step: float = 0.2) -> Room:
    x0, y0, x1, y1 = rect
    deck(c, rect, floor_h, floor, planks, step)
    r = Room(c, rect, wall_h, t, floor_h, base_h)
    corner = c.sx_of(x0 + t, y0 + t); left_end = c.sx_of(x0 + t, y1)
    side = lambda px: px >= corner or px < left_end
    if base_h:
        c.boxes([r.r_left, r.r_right], base_h, base_pal, z0=floor_h, side_fn=side)
        stone_texture(c, {base_pal[0], base_pal[1]}, 3.0, 2.1, 8, 5)
        c.boxes([r.r_left, r.r_right], wall_h, wall_pal, z0=floor_h + base_h, side_fn=side, edge=False)
        c.line((x0 + t, y0 + t, floor_h), (x0 + t, y0 + t, floor_h + base_h + wall_h), wall_pal[0])
    else:
        c.boxes([r.r_left, r.r_right], wall_h, wall_pal, z0=floor_h, side_fn=side)
        c.line((x0 + t, y0 + t, floor_h), (x0 + t, y0 + t, floor_h + wall_h), wall_pal[0])   # 안쪽 모서리
    return r


def table_set(c: IsoCanvas, x: float, y: float, z: int, cups=(WHITE[1],), round_top: bool = False, pal=WOOD) -> None:
    """작은 테이블 + 의자 2(왼쪽 위·오른쪽 위)."""
    chair_z(c, x - 0.22, y, z, 'left'); chair_z(c, x, y - 0.22, z, 'right')
    if round_top:
        c.pillar(x, y, 2, 9, STEEL, z0=z); c.disc(x, y, 0.16, 2, pal, z0=z + 9)
    else:
        c.box(10, pal, (x - 0.14, y - 0.14, x + 0.14, y + 0.14), z0=z)
    for i, col in enumerate(cups):
        cup(c, x - 0.05 + i * 0.1, y + 0.02 - i * 0.06, z + (11 if round_top else 10), col)


def chair_z(c: IsoCanvas, x: float, y: float, z: int, back: str = 'left', pal=WOOD) -> None:
    s = 0.2
    c.box(6, pal, (x - s / 2, y - s / 2, x + s / 2, y + s / 2), z0=z)
    if back == 'left':
        c.box(8, pal, (x - s / 2, y - s / 2, x - s / 2 + 0.06, y + s / 2), z0=z + 6, edge=False)
    elif back == 'right':
        c.box(8, pal, (x - s / 2, y - s / 2, x + s / 2, y - s / 2 + 0.06), z0=z + 6, edge=False)
    elif back == 'front':
        c.box(8, pal, (x - s / 2, y + s / 2 - 0.06, x + s / 2, y + s / 2), z0=z + 6, edge=False)
    elif back == 'frontr':
        c.box(8, pal, (x + s / 2 - 0.06, y - s / 2, x + s / 2, y + s / 2), z0=z + 6, edge=False)


def stool(c: IsoCanvas, x: float, y: float, z: int, pal=WOOD, h: int = 8) -> None:
    c.pillar(x, y, 2, h, BLACK, z0=z); c.disc(x, y, 0.1, 2, pal, z0=z + h)


def counter_block(c: IsoCanvas, rect, z: int, h: int = 14, pal=DARKWOOD, top=(WOOD[0], hexc('d9a05e'), hexc('f0c080'))) -> int:
    """카운터: 몸통 + 밝은 상판. 상판 윗면 z를 돌려준다."""
    c.box(h, pal, rect, z0=z)
    x0, y0, x1, y1 = rect
    c.box(2, top, (x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03), z0=z + h, edge=False)
    return z + h + 2


def espresso_machine(c: IsoCanvas, x: float, y: float, z: int) -> None:
    c.box(10, STEEL, (x - 0.16, y - 0.12, x + 0.16, y + 0.12), z0=z)
    sx, sy = c.spx(x, y + 0.12, z + 6); c.rect(sx - 3, sy - 2, 2, 2, RED[1]); c.rect(sx, sy - 2, 3, 2, BLACK[0])
    sx, sy = c.spx(x, y, z + 10); c.rect(sx - 4, sy - 2, 8, 2, STEEL[2]); c.hline(sx - 4, sx + 3, sy - 2, WHITE[2])
    cup(c, x, y + 0.2, z, WHITE[1])


def shelf_face(w: int, h: int, items: list[Canvas], rows: int = 2, pal=WOOD) -> Canvas:
    """벽 선반: 선반 줄 + 물건 아이콘."""
    s = Canvas(w, h); s.rect(0, 0, w, h, pal[0]); s.rect(1, 0, w - 2, h, pal[1])
    rh = h // rows
    k = 0
    for r in range(rows):
        s.hline(0, w - 1, (r + 1) * rh - 1, pal[2]); s.hline(0, w - 1, (r + 1) * rh - 2, pal[0])
        x = 2
        while x < w - 3 and items:
            it = items[k % len(items)]
            if x + it.w > w - 1:
                break
            s.blit(it, x, (r + 1) * rh - 2 - it.h); x += it.w + 2; k += 1
    return s


def picture(w: int, h: int, col, col2) -> Canvas:
    s = Canvas(w, h); s.rect(0, 0, w, h, WOOD[0]); s.rect(1, 1, w - 2, h - 2, col[1]); s.rect(2, h - 4, w - 4, 2, col2[1]); s.put(2, 1, col[2]); return s


def bottle_row(w: int) -> Canvas:
    s = Canvas(w, 7)
    cols = (LEAF, YELLOW, RED, SKY, ORANGE, PURPLE)
    for i, x in enumerate(range(1, w - 2, 3)):
        col = cols[i % len(cols)]; s.rect(x, 2, 2, 5, col[1]); s.put(x, 2, col[2]); s.put(x, 0, col[0]); s.put(x, 1, col[0])
    return s


def standing_sign(c: IsoCanvas, x: float, y: float, z: int, icon: Canvas, pal=WHITE, w: int = 18) -> None:
    """앞 모서리 근처 세워 둔 작은 입간판(빌보드)."""
    s = Canvas(w, 16)
    s.rect(w // 2 - 2, 10, 4, 6, WOOD[0])
    sg = sign(w, 10, pal, icon); s.blit(sg, 0, 0)
    s.outline()
    sx, sy = c.spx(x, y, z); c.blit(s, sx - w // 2, sy - 16)


def wall_sign(icon: Canvas, w: int = 24, pal=WHITE) -> Canvas:
    return sign(w, 9, pal, icon)


def tile_floor(c: IsoCanvas, rect, h: int, pal, alt: Color, n: float = 0.25) -> None:
    """체크무늬 타일 바닥(상자 + 윗면에 격자 칸 채우기)."""
    from iso import diamond_mask, fill_mask
    c.box(h, pal, rect)
    x0, y0, x1, y1 = rect
    i = 0
    x = x0
    while x < x1 - 1e-6:
        j = 0
        y = y0
        while y < y1 - 1e-6:
            if (i + j) % 2:
                m = diamond_mask((x, y, min(x + n, x1), min(y + n, y1)), c.ox, c.oy)
                fill_mask(c, m, alt, dy=-h)
            y += n; j += 1
        x += n; i += 1


def bicycle2d(col=MINT, basket: bool = True) -> Canvas:
    """옆모습 자전거 24×15: 바퀴 2 + 프레임 + 안장·핸들(+바구니)."""
    s = Canvas(24, 15)
    wheel = (BASALT[0], BASALT[1], BASALT[2])
    for cx in (5, 18):
        s.shade_ellipse(cx, 9.5, 4.6, 4.6, wheel); s.ellipse(cx, 9.5, 3, 3, (0, 0, 0, 0)); s.ellipse(cx, 9.5, 3, 3, hexc('7a7a84')); s.ellipse(cx, 9.5, 1.6, 1.6, (0, 0, 0, 0)); s.put(cx, 9, BASALT[0])
    s.hline(5, 12, 9, col[1]); s.hline(12, 18, 9, col[1])         # 아래 프레임
    s.hline(8, 15, 4, col[1]); s.put(7, 5, col[1]); s.put(6, 6, col[1]); s.put(5, 7, col[1]); s.put(5, 8, col[1])   # 윗 프레임
    s.vline(15, 4, 9, col[0]); s.put(16, 5, col[0]); s.put(17, 7, col[0])
    s.vline(12, 5, 9, col[2])
    s.hline(6, 9, 3, BASALT[0]); s.put(7, 2, BASALT[0])              # 안장
    s.vline(16, 1, 4, BASALT[0]); s.hline(14, 18, 1, BASALT[0])      # 핸들
    s.put(12, 10, BASALT[0]); s.put(13, 11, BASALT[0])               # 페달
    if basket:
        s.rect(18, 3, 5, 4, TAN[1]); s.hline(18, 22, 3, TAN[2]); s.vline(22, 4, 6, TAN[0])
    return s
