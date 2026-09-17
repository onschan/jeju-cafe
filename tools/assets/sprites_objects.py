"""오브젝트 스프라이트. 1×1칸은 32×40(바닥선 y=39), 나무·정류장은 32×48(y=47), 창고는 96×80(y=79).
그림자는 바닥선 위 2px를 중심으로 하는 반투명 타원, 마지막에 outline()."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color

LEAF, ORANGE, WOOD, BASALT = PAL['leaf'], PAL['orange'], PAL['wood'], PAL['basalt']
SOIL, SKY, WHITE, RED, YELLOW, GRASS, SNOW = (PAL['soil'], PAL['sky'], PAL['white'], PAL['red'],
                                              PAL['yellow'], PAL['grass'], PAL['snow'])


def canvas(w: int, h: int, shadow_rx: float | None = None, shadow_ry: float = 2.2) -> Canvas:
    """바닥선(h-1) 위 2px 중심에 그림자를 깐 캔버스."""
    c = Canvas(w, h)
    if shadow_rx:
        c.shadow(w / 2 - 0.5, h - 3, shadow_rx, shadow_ry)
    return c


def round_rect(c: Canvas, x: int, y: int, w: int, h: int, col: Color) -> None:
    """모서리 1px 뺀 사각형."""
    c.rect(x, y, w, h, col)
    for cx, cy in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
        c.put(cx, cy, (0, 0, 0, 0))


# ---------------------------------------------------------------- 공용 부품
def tangerine(c: Canvas, x: int, y: int) -> None:
    """2×2 감귤: MD, 우하 DK, 좌상 LT."""
    dk, md, lt = ORANGE
    c.rect(x, y, 2, 2, md)
    c.put(x + 1, y + 1, dk); c.put(x, y, lt)


def canopy(c: Canvas, cx: float, cy: float, rx: float, ry: float, bumps: list[tuple[float, float, float]],
           light=(-0.45, -0.6)) -> None:
    """잎뭉치: 타원 + 혹. 광원 좌상단 기준 거리로 3톤(assets-sample과 같은 방식)."""
    dk, md, lt = LEAF
    lx, ly = cx + light[0] * rx, cy + light[1] * ry
    for y in range(c.h):
        for x in range(c.w):
            inside = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
            if not inside:
                for bx, by, r in bumps:
                    if (x - bx) ** 2 + (y - by) ** 2 <= r * r:
                        inside = True; break
            if inside:
                d = ((x - lx) / (rx * 0.9)) ** 2 + ((y - ly) / (ry * 0.85)) ** 2
                c.put(x, y, lt if d < 0.45 else md if d < 1.15 else dk)


def trunk(c: Canvas, x: int, y0: int, y1: int, w: int) -> None:
    dk, md, lt = WOOD
    for y in range(y0, y1 + 1):
        for i in range(w):
            c.put(x + i, y, lt if i == 0 and w > 2 else md if i < w / 2 else dk)


STONE = (BASALT[1], BASALT[2], hexc('9a9aa3'))


def stone(c: Canvas, cx: float, cy: float, rx: float, ry: float, tones=STONE) -> None:
    c.shade_ellipse(cx, cy, rx, ry, tones)


# ---------------------------------------------------------------- 나무
def tree_young() -> Canvas:
    c = canvas(32, 48, shadow_rx=5)
    trunk(c, 15, 35, 44, 2)
    canopy(c, 16, 31, 6.5, 5, [(12, 28, 3), (20, 28.5, 3), (16, 26, 3)])
    c.outline()
    return c


def tree(ready: bool = False) -> Canvas:
    c = canvas(32, 48, shadow_rx=9)
    trunk(c, 14, 30, 44, 4)
    canopy(c, 16, 21, 11.5, 9, [(9, 16, 4.5), (23, 17, 4.2), (16, 12, 4.2)])
    if ready:
        for x, y in [(9, 19), (14, 15), (20, 14), (24, 20), (17, 23), (11, 25), (22, 26)]:
            tangerine(c, x, y)
    c.outline()
    return c


# ---------------------------------------------------------------- 정류장
def busstop() -> Canvas:
    c = canvas(32, 48, shadow_rx=10)
    dk, md, lt = BASALT
    # 벤치: 다리 + 상판
    c.rect(8, 40, 2, 5, WOOD[0]); c.rect(22, 40, 2, 5, WOOD[0])
    c.shade_rect(6, 36, 20, 4, WOOD)
    # 기둥
    c.vline(15, 20, 44, md); c.vline(16, 20, 44, dk)
    # 표지판 12×10 + 흰 버스 실루엣
    c.shade_rect(10, 9, 12, 10, SKY)
    c.rect(13, 12, 6, 4, WHITE[1]); c.hline(13, 18, 12, WHITE[2])
    c.put(14, 13, SKY[1]); c.put(17, 13, SKY[1])          # 창
    c.put(14, 16, BASALT[0]); c.put(17, 16, BASALT[0])    # 바퀴
    c.outline()
    return c


# ---------------------------------------------------------------- 창고(카페)
def warehouse() -> Canvas:
    c = canvas(96, 80, shadow_rx=47, shadow_ry=3)
    wdk, wmd, wlt = WHITE
    bdk, bmd, blt = BASALT
    # 벽
    c.rect(6, 30, 84, 47, wmd)
    c.vline(6, 30, 76, wlt)
    c.vline(89, 30, 76, wdk)
    c.rect(6, 75, 84, 2, wdk)
    c.hline(6, 89, 30, wdk); c.hline(6, 89, 31, wdk)          # 처마 그림자
    # 슬레이트 지붕(사다리꼴, 좌우 4px 넘침)
    for y in range(14, 30):
        t = (y - 14) / 15
        x0 = round(14 - 12 * t); x1 = round(81 + 12 * t)
        col = blt if y < 18 else bmd if y < 27 else bdk
        c.hline(x0, x1, y, col)
    for x in range(14, 82, 8):
        c.vline(x, 15, 28, bdk)
    c.hline(14, 81, 14, blt)
    # 문 14×20
    c.shade_rect(41, 56, 14, 20, WOOD)
    c.vline(48, 57, 74, WOOD[0])
    c.put(46, 66, YELLOW[1]); c.put(50, 66, YELLOW[1])       # 손잡이
    # 창 2개 10×8 + 창틀
    for wx in (16, 70):
        c.rect(wx - 1, 43, 12, 10, WOOD[0])
        c.rect(wx, 44, 10, 8, SKY[2])
        c.vline(wx + 5, 44, 51, WOOD[0]); c.hline(wx, wx + 9, 47, WOOD[0])
        c.put(wx + 1, 45, wlt); c.put(wx + 2, 45, wlt)
    # 간판 30×8 + 감귤 2개
    c.shade_rect(33, 34, 30, 8, (WOOD[1], WOOD[2], hexc('e0a866')))
    for ox in (40, 56):
        c.shade_ellipse(ox, 38.5, 2.6, 2.4, ORANGE)
        c.put(ox + 1, 35, LEAF[1]); c.put(ox + 2, 35, LEAF[2])
    c.rect(45, 37, 6, 1, OUT); c.rect(45, 39, 6, 1, OUT)     # 글자 느낌 줄 2개
    c.outline()
    return c


# ---------------------------------------------------------------- 정낭
def gate(bars: int) -> Canvas:
    c = canvas(32, 40, shadow_rx=13)
    for px_ in (4, 22):
        c.shade_rect(px_, 16, 6, 22, BASALT)
        c.put(px_, 16, (0, 0, 0, 0)); c.put(px_ + 5, 16, (0, 0, 0, 0))   # 둥근 머리
        c.put(px_ + 1, 17, BASALT[2])
        for hy in (20, 26, 32):
            c.rect(px_ + 2, hy, 2, 2, BASALT[0])
    for i in range(bars):
        y = (20, 26, 32)[i]
        c.hline(6, 25, y, WOOD[2]); c.hline(6, 25, y + 1, WOOD[1])
        c.put(6, y, WOOD[0]); c.put(6, y + 1, WOOD[0]); c.put(25, y, WOOD[0]); c.put(25, y + 1, WOOD[0])
    c.outline()
    return c


# ---------------------------------------------------------------- 올렛길
def path() -> Canvas:
    c = Canvas(32, 32)
    dk, md, lt = BASALT[1], BASALT[2], hexc('9a9aa3')
    pebbles = [(3, 3, 4, 3), (10, 2, 3, 2), (16, 4, 4, 3), (23, 2, 3, 2), (28, 5, 3, 3),
               (1, 10, 3, 3), (7, 9, 4, 3), (13, 11, 3, 2), (19, 10, 4, 3), (25, 12, 3, 2),
               (4, 17, 3, 2), (10, 16, 4, 3), (17, 17, 3, 3), (22, 19, 4, 2), (28, 18, 3, 3),
               (2, 24, 4, 3), (9, 23, 3, 2), (14, 26, 4, 3), (20, 25, 3, 2), (26, 26, 4, 3)]
    for x, y, w, h in pebbles:
        c.rect(x, y, w, h, md)
        c.hline(x, x + w - 2, y, lt); c.put(x, y + 1, lt)
        c.hline(x + 1, x + w - 1, y + h - 1, dk); c.put(x + w - 1, y + h - 2, dk)
        c.hline(x, x + w - 1, y + h, BASALT[0])   # 아래 그늘 1px
    for x, y in [(1, 1), (30, 3), (0, 17), (31, 22), (14, 0), (17, 31)]:
        c.put(x, y, GRASS[1]); c.put(x, y - 1, GRASS[2])
    return c


# ---------------------------------------------------------------- 밭
def field(state: str) -> Canvas:
    c = Canvas(32, 40)
    dk, md, lt = SOIL
    x0, y0, x1, y1 = 2, 21, 29, 38
    round_rect(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, md)
    c.hline(x0 + 1, x1 - 1, y0, lt); c.vline(x0, y0 + 1, y1 - 1, lt)
    for ry in (24, 29, 34):
        c.rect(x0 + 1, ry, x1 - x0 - 1, 2, dk)
        for x in range(x0 + 2, x1 - 1, 3):
            c.put(x, ry + 3, lt); c.put(x + 1, ry - 1, lt)
    c.hline(x0 + 1, x1 - 1, 37, dk)
    # 테두리 soil.DK
    c.hline(x0 + 1, x1 - 1, y1, dk); c.vline(x1, y0 + 1, y1 - 1, dk)
    spots = [(7, 24), (19, 24), (13, 29), (25, 29), (7, 34), (19, 34)]
    if state == 'planted':
        for x, y in spots:
            c.vline(x, y - 2, y - 1, LEAF[2])
            c.put(x - 1, y - 2, LEAF[1]); c.put(x + 1, y - 2, LEAF[1])
            c.put(x, y, LEAF[0])
    elif state == 'ready':
        for x, y in spots:
            top = y - 4
            c.rect(x - 1, top, 3, 4, LEAF[1])
            c.put(x - 2, top + 1, LEAF[1]); c.put(x + 2, top + 1, LEAF[1])
            c.put(x - 1, top, LEAF[2]); c.put(x, top - 1, LEAF[2]); c.put(x - 2, top + 1, LEAF[2])
            c.hline(x - 1, x + 1, top + 3, LEAF[0]); c.put(x + 1, top + 1, LEAF[0]); c.put(x + 2, top + 1, LEAF[0])
            c.rect(x - 1, y, 3, 1, ORANGE[1]); c.put(x + 1, y, ORANGE[0])
    c.outline()
    return c


# ---------------------------------------------------------------- 야외 테이블
def table_out() -> Canvas:
    c = canvas(32, 40, shadow_rx=12)
    bdk, bmd, blt = BASALT
    # 의자 2개
    c.rect(2, 31, 4, 3, WOOD[0]); c.rect(26, 31, 4, 3, WOOD[0])
    c.hline(2, 5, 31, WOOD[1]); c.hline(26, 29, 31, WOOD[1])
    c.vline(3, 34, 36, WOOD[0]); c.vline(28, 34, 36, WOOD[0])
    # 테이블 다리 + 상판
    c.vline(9, 30, 36, WOOD[0]); c.vline(22, 30, 36, WOOD[0])
    c.shade_ellipse(15.5, 28, 10, 4, WOOD)
    c.ellipse(15.5, 29.5, 10, 3.5, WOOD[0]); c.shade_ellipse(15.5, 28, 10, 3.2, WOOD)
    # 기둥
    c.vline(15, 15, 34, bmd); c.vline(16, 15, 34, bdk)
    # 파라솔: 빨강/흰 줄무늬 반타원 rx14 ry7, y 8~15
    for y in range(8, 16):
        for x in range(32):
            if ((x - 15.5) / 14.2) ** 2 + ((y - 15) / 7.2) ** 2 <= 1:
                stripe = ((x + 2) // 5) % 2 == 0
                tones = RED if stripe else WHITE
                shade = 2 if (y <= 9 or x <= 6) and y < 14 else 0 if y >= 14 else 1
                c.put(x, y, tones[shade])
    c.hline(2, 29, 15, bdk)                                    # 파라솔 아랫단
    for x in (8, 16, 23):                                      # 살
        c.vline(x, 12, 15, bdk)
    c.rect(15, 5, 2, 3, bdk); c.put(15, 5, blt)                # 꼭지
    c.outline()
    return c


# ---------------------------------------------------------------- 밭담
def stonewall() -> Canvas:
    c = canvas(32, 40, shadow_rx=14)
    dk, md, lt = BASALT
    round_rect(c, 1, 23, 30, 16, dk)                            # 틈(모르타르)
    for cx, cy, rx, ry in [(5, 34, 4.5, 3.5), (13, 35, 4.5, 3.2), (21, 34, 4.2, 3.4), (28, 35, 3.8, 3.2)]:
        stone(c, cx, cy, rx, ry)
    for cx, cy, rx, ry in [(4, 27, 3.8, 3), (10, 26, 4.2, 3.4), (17, 27, 4.5, 3.2), (24, 26, 4.2, 3.4), (29, 27.5, 3, 2.8)]:
        stone(c, cx, cy, rx, ry)
    for x, y in [(9, 23), (10, 23), (18, 24), (24, 23), (25, 23), (3, 25), (14, 30), (26, 31)]:
        c.put(x, y, GRASS[1])
    c.put(10, 22, GRASS[2]); c.put(24, 22, GRASS[2])
    c.outline()
    return c


def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {
        'obj_busstop': busstop(),
        'obj_warehouse': warehouse(),
        'obj_path': path(),
        'obj_field_empty': field('empty'),
        'obj_field_planted': field('planted'),
        'obj_field_ready': field('ready'),
        'obj_tangerine_tree_young': tree_young(),
        'obj_tangerine_tree': tree(),
        'obj_tangerine_tree_ready': tree(ready=True),
        'obj_table_out': table_out(),
        'obj_stonewall': stonewall(),
    }
    for n in range(4):
        s[f'obj_gate_{n}'] = gate(n)
    s['obj_gate'] = s['obj_gate_0']
    return s
