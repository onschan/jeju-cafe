"""아이소 오브젝트 스프라이트 `iso_obj_<id>`. 1×1칸 캔버스 64×(32+높이), 바닥 앞 꼭짓점 = 하단 중앙.
상자형(건물·가구)은 iso.IsoCanvas.box, 나무·사람 같은 것은 빌보드(정면 2D 스프라이트를 셀 중심 그림자 위에).
본관·증축·화장실·창고(지붕 없는 방)는 sprites_iso_rooms, GDD v2 시설은 sprites_iso_facilities, 장식은 sprites_iso_decor."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color
from iso import IsoCanvas, iso_tile, tile_mask, texture_where, paste_face, fill_mask, diamond_mask
from sprites_objects import trunk, canopy, tangerine, stone as stone2d, STONE
from sprites_iso_tiles import clip

LEAF, ORANGE, WOOD, BASALT = PAL['leaf'], PAL['orange'], PAL['wood'], PAL['basalt']
SOIL, SKY, WHITE, RED, YELLOW, GRASS, SNOW, PINK = (PAL['soil'], PAL['sky'], PAL['white'], PAL['red'],
                                                    PAL['yellow'], PAL['grass'], PAL['snow'], PAL['pink'])
PLASTER = (hexc('cfcac0'), hexc('ebe6da'), hexc('faf7f0'))
SLATE = (hexc('3a3a42'), hexc('55555e'), hexc('80808a'))
STONE3 = (BASALT[1], BASALT[2], hexc('9a9aa3'))
DARKLEAF = (hexc('1f5a22'), hexc('2f7a2a'), hexc('4fae3a'))
GLASS = (hexc('7fb0d8'), hexc('a9d3f0'), hexc('dff1ff'))
VINYL = (hexc('9fbfd0'), hexc('cfe3ec'), hexc('eef7fb'))
STEEL = (hexc('4a4a52'), hexc('7a7a84'), hexc('b0b0b8'))


def cv(height: int, cw: int = 1, ch: int = 1, pad: int = 0, shadow: float | None = None) -> IsoCanvas:
    c = IsoCanvas(cw, ch, height, pad)
    if shadow:
        c.ground_shadow(cw / 2, ch / 2, shadow)
    return c


def billboard(sprite: Canvas, shadow_rx: float = 0.4, cw: int = 1, ch: int = 1, cx: float | None = None,
              cy: float | None = None, lift: int = 0, outline: bool = True) -> IsoCanvas:
    """정면 스프라이트를 셀 중심(기본) 그림자 위에 세운 1칸 캔버스."""
    if outline:
        sprite = sprite.copy(); sprite.outline()
    cx = cw / 2 if cx is None else cx
    cy = ch / 2 if cy is None else cy
    c = cv(max(0, sprite.h - 12), cw, ch)
    c.ground_shadow(cx, cy, shadow_rx)
    c.billboard(sprite, cx, cy, lift)
    return c


def chair(c: IsoCanvas, x: float, y: float, back: str = 'left') -> None:
    """작은 나무 의자: 좌판 상자 + 등받이(뒤쪽 변)."""
    s = 0.22
    c.box(7, WOOD, (x - s / 2, y - s / 2, x + s / 2, y + s / 2))
    if back == 'left':      # 등받이가 x 작은 쪽(화면 좌상)
        c.box(9, WOOD, (x - s / 2, y - s / 2, x - s / 2 + 0.06, y + s / 2), z0=7, edge=False)
    elif back == 'right':   # y 작은 쪽(화면 우상)
        c.box(9, WOOD, (x - s / 2, y - s / 2, x + s / 2, y - s / 2 + 0.06), z0=7, edge=False)
    elif back == 'front':   # y 큰 쪽
        c.box(9, WOOD, (x - s / 2, y + s / 2 - 0.06, x + s / 2, y + s / 2), z0=7, edge=False)
    elif back == 'frontr':  # x 큰 쪽
        c.box(9, WOOD, (x + s / 2 - 0.06, y - s / 2, x + s / 2, y + s / 2), z0=7, edge=False)


def cup(c: IsoCanvas, x: float, y: float, z: int, col: Color = WHITE[1]) -> None:
    sx, sy = c.spx(x, y, z)
    c.rect(sx - 1, sy - 3, 3, 3, col); c.put(sx - 1, sy - 3, WHITE[2]); c.put(sx + 1, sy - 1, WHITE[0])


def window_sprite(w: int, h: int) -> Canvas:
    s = Canvas(w, h)
    s.rect(0, 0, w, h, WOOD[0])
    s.rect(1, 1, w - 2, h - 2, SKY[2])
    s.vline(w // 2, 1, h - 2, WOOD[0]); s.hline(1, w - 2, h // 2, WOOD[0])
    s.put(1, 1, WHITE[2]); s.put(2, 1, WHITE[2])
    return s


def door_sprite(w: int, h: int, col=WOOD) -> Canvas:
    s = Canvas(w, h)
    s.rect(0, 0, w, h, col[0])
    for x in range(1, w - 1, 3):
        s.vline(x, 1, h - 1, col[1])
    s.hline(0, w - 1, 0, col[2])
    s.rect(w - 3, h // 2, 1, 2, BASALT[2])
    return s


def sign_sprite() -> Canvas:
    """감귤 간판 30×8."""
    s = Canvas(30, 8)
    s.shade_rect(0, 0, 30, 8, (WOOD[1], WOOD[2], hexc('e0a866')))
    for ox in (6, 23):
        s.shade_ellipse(ox, 4.5, 2.6, 2.4, ORANGE)
        s.put(ox + 1, 1, LEAF[1]); s.put(ox + 2, 1, LEAF[2])
    s.rect(12, 3, 6, 1, OUT); s.rect(12, 5, 6, 1, OUT)
    return s


def stone_texture(c: IsoCanvas, keys: set[Color], rx: float = 3.6, ry: float = 2.6, sx: int = 9, sy: int = 6) -> None:
    """캔버스 전체에 벽돌 배열로 돌을 깔고 면 색(keys) 위에만 남긴다."""
    tmp = Canvas(c.w, c.h)
    for j, cy in enumerate(range(3, c.h + sy, sy)):
        for cx in range(3 + (sx // 2 if j % 2 else 0), c.w + sx, sx):
            stone2d(tmp, cx, cy, rx, ry)
    texture_where(c, tmp, keys)


def stone_rows(c: IsoCanvas, keys: set[Color], rows: list[tuple[int, list[tuple[int, float, float]]]]) -> None:
    """면 색(keys) 위에만 현무암 돌 무늬."""
    tmp = Canvas(c.w, c.h)
    for cy, stones in rows:
        for cx, rx, ry in stones:
            stone2d(tmp, cx, cy, rx, ry)
    texture_where(c, tmp, keys)


# ================================================================ 좌석
def table_out() -> IsoCanvas:
    c = cv(50, shadow=0.42)
    chair(c, 0.3, 0.72, 'left'); chair(c, 0.72, 0.3, 'right')
    c.pillar(0.5, 0.5, 2, 12, BASALT)
    c.disc(0.5, 0.5, 0.26, 3, WOOD, z0=12)
    cup(c, 0.42, 0.42, 15); cup(c, 0.6, 0.58, 15, RED[1])
    # 파라솔: 기둥 + 빨강/흰 줄무늬 캐노피
    c.pillar(0.5, 0.5, 2, 24, BASALT, z0=15)
    sx, sy = c.spx(0.5, 0.5, 39)
    for y in range(sy - 8, sy + 1):
        for x in range(sx - 22, sx + 22):
            if ((x - sx + 0.5) / 22) ** 2 + ((y - sy) / 8.5) ** 2 <= 1:
                stripe = ((x - sx + 30) // 6) % 2 == 0
                tones = RED if stripe else WHITE
                shade = 2 if (y <= sy - 6 or x <= sx - 12) and y < sy - 1 else 0 if y >= sy - 1 else 1
                c.put(x, y, tones[shade])
    c.hline(sx - 21, sx + 20, sy, BASALT[0])
    c.rect(sx - 1, sy - 11, 2, 3, BASALT[0]); c.put(sx - 1, sy - 11, BASALT[2])
    c.outline()
    return c


def table_parasol() -> IsoCanvas:
    """파라솔 테이블 (v3 §5 시작 시설): 야외 테이블보다 큰 빨강/흰 파라솔 + 흰 원탁 + 의자 2. 1×1."""
    c = cv(58, shadow=0.48)
    chair(c, 0.28, 0.74, 'left'); chair(c, 0.74, 0.28, 'right')
    c.pillar(0.5, 0.5, 2, 11, STEEL)
    c.disc(0.5, 0.5, 0.3, 3, WHITE, z0=11)
    cup(c, 0.4, 0.42, 14, ORANGE[1]); cup(c, 0.6, 0.58, 14, WHITE[1])
    c.pillar(0.5, 0.5, 2, 32, STEEL, z0=14)
    sx, sy = c.spx(0.5, 0.5, 47)
    rx, ry = 26, 10
    for y in range(sy - ry, sy + 1):
        for x in range(sx - rx, sx + rx):
            if ((x - sx + 0.5) / rx) ** 2 + ((y - sy) / (ry + 0.5)) ** 2 <= 1:
                stripe = ((x - sx + 40) // 8) % 2 == 0
                tones = RED if stripe else WHITE
                shade = 2 if (y <= sy - 7 or x <= sx - 14) and y < sy - 1 else 0 if y >= sy - 1 else 1
                c.put(x, y, tones[shade])
    c.hline(sx - rx + 1, sx + rx - 2, sy, BASALT[0])
    for x in range(sx - rx + 3, sx + rx - 2, 8):
        c.put(x, sy + 1, RED[0])
    c.rect(sx - 1, sy - ry - 3, 2, 4, STEEL[0]); c.put(sx - 1, sy - ry - 3, STEEL[2])
    c.outline()
    return c


def carrot_field() -> IsoCanvas:
    """당근밭 (v3 §3 농원 시설): 갈색 이랑 3줄 + 초록 잎 다발, 이랑 사이로 주황 당근 어깨. 1×1."""
    c = cv(6, pad=10)
    dk, md, lt = SOIL
    c.box(3, SOIL, (0.05, 0.05, 0.95, 0.95))
    for y in (0.22, 0.5, 0.78):
        c.line((0.08, y - 0.08, 3), (0.92, y - 0.08, 3), lt)
        c.line((0.08, y + 0.08, 3), (0.92, y + 0.08, 3), dk)
    for y in (0.22, 0.5, 0.78):
        for x in (0.2, 0.45, 0.7):
            sx, sy = c.spx(x, y, 3)
            # 당근 어깨(주황) — 흙 위로 살짝
            c.rect(sx - 2, sy - 2, 5, 2, ORANGE[1]); c.put(sx - 2, sy - 2, ORANGE[2]); c.put(sx + 2, sy - 1, ORANGE[0])
            # 잎 다발: 가운데 줄기 + 양옆 깃털잎
            c.vline(sx, sy - 10, sy - 3, LEAF[1])
            c.vline(sx - 2, sy - 8, sy - 4, LEAF[0]); c.vline(sx + 2, sy - 9, sy - 4, LEAF[2])
            c.put(sx - 1, sy - 9, LEAF[2]); c.put(sx + 1, sy - 7, LEAF[1]); c.put(sx - 3, sy - 6, LEAF[1]); c.put(sx + 3, sy - 7, LEAF[0])
            c.put(sx - 1, sy - 5, LEAF[2]); c.put(sx + 1, sy - 5, LEAF[0]); c.put(sx, sy - 11, LEAF[2])
    c.outline()
    return c


def bench() -> IsoCanvas:
    c = cv(14, 2, 1, shadow=0.7)
    c.box(4, WOOD, (0.12, 0.15, 1.88, 0.85))                                 # 다리 단
    c.box(6, (WOOD[0], WOOD[1], hexc('d9a05e')), (0.06, 0.1, 1.94, 0.9), z0=4)  # 상판
    for y in (0.3, 0.5, 0.7):
        c.line((0.08, y, 10), (1.92, y, 10), WOOD[1])
    cup(c, 1.5, 0.35, 10); cup(c, 0.6, 0.6, 10, YELLOW[1])
    c.outline()
    return c


def table_in() -> IsoCanvas:
    c = cv(26, shadow=0.4)
    chair(c, 0.3, 0.72, 'left'); chair(c, 0.72, 0.3, 'right')
    c.box(12, WOOD, (0.3, 0.3, 0.7, 0.7))
    c.box(4, (RED[0], RED[1], hexc('ff9a9a')), (0.24, 0.24, 0.76, 0.76), z0=12)   # 빨간 식탁보
    cup(c, 0.5, 0.5, 16)
    c.outline()
    return c


def counter() -> IsoCanvas:
    c = cv(32, 2, 1, shadow=0.7)
    c.box(18, BASALT, (0, 0, 2, 0.55))
    stone_rows(c, {BASALT[1], BASALT[0]},
               [(c.h - 26, [(20, 4, 2.6), (34, 4.5, 2.8), (48, 4, 2.6), (62, 4.5, 2.8), (76, 4, 2.6), (90, 4.5, 2.8)]),
                (c.h - 19, [(26, 4.5, 2.8), (40, 4, 2.6), (54, 4.5, 2.8), (68, 4, 2.6), (82, 4.5, 2.8), (96, 4, 2.6)])])
    c.box(4, WOOD, (-0.04, -0.04, 2.04, 0.62), z0=18)
    for x, col in ((0.4, WHITE[1]), (1.0, RED[1]), (1.6, WHITE[1])):
        cup(c, x, 0.3, 22, col)
    for x in (0.35, 1.0, 1.65):
        c.pillar(x, 0.82, 2, 8, BASALT)
        c.disc(x, 0.82, 0.12, 3, WOOD, z0=8)
    c.outline()
    return c


def table_big() -> IsoCanvas:
    c = cv(28, 2, 2, shadow=0.9)
    chair(c, 0.22, 0.7, 'left'); chair(c, 0.7, 0.22, 'right')
    chair(c, 0.22, 1.3, 'left'); chair(c, 1.3, 0.22, 'right')
    c.box(12, WOOD, (0.42, 0.42, 1.58, 1.58))
    c.box(3, (WOOD[0], hexc('d9a05e'), hexc('f0c080')), (0.36, 0.36, 1.64, 1.64), z0=12)
    for x, y, col in ((0.7, 0.7, WHITE[1]), (1.3, 0.7, YELLOW[1]), (0.7, 1.3, RED[1]), (1.3, 1.3, WHITE[1])):
        cup(c, x, y, 15, col)
    chair(c, 0.7, 1.78, 'front'); chair(c, 1.78, 0.7, 'frontr')
    c.outline()
    return c


def window_seat() -> IsoCanvas:
    c = cv(36, shadow=0.42)
    c.box(32, PLASTER, (0, 0, 1, 0.22))            # 뒤쪽 벽 조각
    paste_face(c, 'left', window_sprite(18, 14), 7, 4)
    c.box(3, WOOD, (0, 0.18, 1, 0.34), z0=14)      # 창턱
    c.box(10, WOOD, (0.28, 0.42, 0.72, 0.7))
    cup(c, 0.5, 0.56, 10)
    chair(c, 0.5, 0.86, 'front')
    c.outline()
    return c


# ================================================================ 시설
def roaster() -> IsoCanvas:
    c = cv(40, shadow=0.4)
    c.box(14, BASALT, (0.25, 0.25, 0.75, 0.75))
    c.disc(0.5, 0.5, 0.24, 12, (RED[0], RED[1], hexc('ff8a8a')), z0=14)       # 드럼
    sx, sy = c.spx(0.5, 0.5, 26)
    c.ellipse(sx, sy - 3, 5, 2.5, BASALT[0]); c.ellipse(sx, sy - 3.5, 4, 1.8, hexc('3f2a1a'))   # 드럼 위 호퍼 입구
    c.pillar(0.66, 0.34, 3, 16, STEEL, z0=22)                                              # 굴뚝
    sx, sy = c.spx(0.66, 0.34, 38); c.rect(sx - 2, sy - 1, 5, 2, STEEL[0])
    sx, sy = c.spx(0.35, 0.72, 20); c.rect(sx - 4, sy - 2, 8, 6, hexc('3f2a1a')); c.rect(sx - 3, sy - 1, 6, 4, hexc('7a4a1f'))  # 원두 트레이
    c.outline()
    return c


def souvenir() -> IsoCanvas:
    c = cv(40, shadow=0.45)
    c.pillar(0.12, 0.12, 2, 34, WOOD); c.pillar(0.88, 0.12, 2, 34, WOOD)
    c.box(12, WOOD, (0.1, 0.25, 0.9, 0.85))
    for x, y, col in ((0.3, 0.45, ORANGE), (0.55, 0.42, WHITE), (0.75, 0.5, PINK), (0.4, 0.7, YELLOW), (0.68, 0.72, SKY)):
        c.box(4, col, (x - 0.08, y - 0.08, x + 0.08, y + 0.08), z0=12, edge=False)
    c.pillar(0.12, 0.88, 2, 34, WOOD); c.pillar(0.88, 0.88, 2, 34, WOOD)
    c.box(3, (RED[0], RED[1], hexc('ff9a9a')), (0, 0, 1, 1), z0=34, edge=False)   # 차양
    for y in (0.25, 0.5, 0.75):
        c.line((0.02, y, 37), (0.98, y, 37), WHITE[1])
    c.outline()
    return c


def photo_spot() -> IsoCanvas:
    s = Canvas(30, 30)
    s.rect(2, 2, 26, 22, WOOD[1])
    s.rect(5, 5, 20, 16, (0, 0, 0, 0))
    s.hline(2, 27, 2, WOOD[2]); s.vline(2, 2, 23, WOOD[2]); s.hline(2, 27, 23, WOOD[0]); s.vline(27, 2, 23, WOOD[0])
    for x, y in ((3, 1), (26, 1)):   # 하트
        s.rect(x - 1, y, 2, 2, RED[1]); s.rect(x + 1, y, 2, 2, RED[1]); s.rect(x - 1, y + 2, 4, 1, RED[1]); s.put(x, y + 3, RED[0])
    s.rect(13, 24, 4, 6, WOOD[0])
    c = billboard(s, 0.4, lift=0)
    return c


def vending() -> IsoCanvas:
    c = cv(40, shadow=0.38)
    c.box(36, (SKY[0], SKY[1], hexc('a8d0f0')), (0.3, 0.3, 0.75, 0.75))
    g = Canvas(9, 18); g.rect(0, 0, 9, 18, GLASS[1]); g.hline(0, 8, 0, GLASS[2])
    for i, col in enumerate((RED[1], ORANGE[1], WHITE[1], SKY[2], YELLOW[1], LEAF[1])):
        g.rect(1 + (i % 3) * 3, 2 + (i // 3) * 5, 2, 3, col)
    g.rect(0, 12, 9, 6, SKY[0]); g.rect(2, 14, 5, 2, BASALT[0])   # 배출구
    paste_face(c, 'left', g, 2, 3)
    coin = Canvas(4, 6); coin.rect(0, 0, 4, 6, BASALT[0]); coin.rect(1, 1, 2, 2, YELLOW[1])
    paste_face(c, 'right', coin, 3, 4)
    c.outline()
    return c


def greenhouse() -> IsoCanvas:
    """비닐하우스: y 방향 반타원 아치(높이 22px), x=2 끝면은 DK, 골조 선."""
    import math
    c = cv(24, 2, 2, shadow=1.0)
    dk, md, lt = VINYL
    H, ry = 22.0, 0.98

    def z_at(y: float) -> float:
        t = (y - 1) / ry
        return H * math.sqrt(max(0.0, 1 - t * t))

    # 끝면(x=2): 아치 단면 DK
    y = 0.02
    while y < 1.98:
        z = 0.0
        while z <= z_at(y):
            sx, sy = c.screen(2, y, z); c.put(int(sx), int(sy), dk)
            z += 0.5
        y += 0.01
    # 아치 표면
    x = 0.0
    while x <= 2.0:
        y = 0.02
        while y < 1.98:
            sx, sy = c.screen(x, y, z_at(y))
            c.put(int(sx), int(sy), dk if y < 0.55 else lt if y < 1.25 else md)
            y += 0.01
        x += 0.02
    for k in range(0, 7):                       # 골조: x 일정 아치 선
        x = k * 2 / 6
        pts = []
        y = 0.02
        while y < 1.98:
            pts.append(c.screen(x, y, z_at(y))); y += 0.01
        for sx, sy in pts:
            c.put(int(sx), int(sy), dk)
    c.line((0, 1, H), (2, 1, H), lt); c.line((0, 1, H + 1), (2, 1, H + 1), lt)   # 용마루 하이라이트
    tmp = Canvas(c.w, c.h)                                                       # 안쪽 초록 비침
    for x, y in ((0.4, 1.2), (0.9, 1.35), (1.4, 1.2), (0.7, 1.6), (1.2, 1.7), (1.7, 1.5)):
        sx, sy = c.spx(x, y, z_at(y) - 4); tmp.ellipse(sx, sy, 4, 2, LEAF[1])
    texture_where(c, tmp, {md, lt})
    c.outline()
    return c


# ================================================================ 농사
def field(state: str) -> IsoCanvas:
    c = cv(4, pad=10)
    dk, md, lt = SOIL
    c.box(3, SOIL, (0.05, 0.05, 0.95, 0.95))
    for y in (0.25, 0.5, 0.75):
        c.line((0.08, y, 3), (0.92, y, 3), dk); c.line((0.08, y + 0.08, 3), (0.92, y + 0.08, 3), lt)
    spots = [(x, y) for y in (0.22, 0.47, 0.72) for x in (0.25, 0.5, 0.75)]
    for x, y in spots:
        sx, sy = c.spx(x, y, 3)
        if state == 'planted':
            c.vline(sx, sy - 3, sy - 1, LEAF[2]); c.put(sx - 1, sy - 3, LEAF[1]); c.put(sx + 1, sy - 3, LEAF[1])
        elif state == 'ready':
            c.rect(sx - 1, sy - 5, 3, 4, LEAF[1]); c.put(sx - 2, sy - 4, LEAF[1]); c.put(sx + 2, sy - 4, LEAF[1])
            c.put(sx - 1, sy - 5, LEAF[2]); c.put(sx, sy - 6, LEAF[2]); c.put(sx + 1, sy - 2, LEAF[0])
            c.rect(sx - 1, sy - 1, 3, 1, ORANGE[1]); c.put(sx + 1, sy - 1, ORANGE[0])
    c.outline()
    return c


def tree2d(kind: str) -> Canvas:
    """감귤·한라봉·묘목 정면 스프라이트(그림자 없음)."""
    if kind == 'young':
        s = Canvas(32, 40); trunk(s, 15, 27, 39, 2)
        canopy(s, 16, 23, 6.5, 5, [(12, 20, 3), (20, 20.5, 3), (16, 18, 3)])
        return s
    s = Canvas(32, 44); trunk(s, 14, 26, 43, 4)
    canopy(s, 16, 17, 11.5, 9, [(9, 12, 4.5), (23, 13, 4.2), (16, 8, 4.2)])
    if kind == 'ready':
        for x, y in [(9, 15), (14, 11), (20, 10), (24, 16), (17, 19), (11, 21), (22, 22)]:
            tangerine(s, x, y)
    elif kind == 'hallabong':
        for x, y in [(9, 15), (18, 10), (23, 18), (13, 21)]:
            s.rect(x, y, 3, 3, ORANGE[1]); s.put(x + 2, y + 2, ORANGE[0]); s.put(x, y, ORANGE[2]); s.put(x + 1, y - 1, ORANGE[0])
    return s


def tree_bb(kind: str) -> IsoCanvas:
    return billboard(tree2d(kind), 0.42 if kind != 'young' else 0.28)


def tea_bush() -> IsoCanvas:
    s = Canvas(32, 22)
    tones = (hexc('3f7f2f'), hexc('62b043'), hexc('a3e06a'))
    dk, md, lt = tones
    for y in range(22):
        for x in range(32):
            inside = ((x - 15.5) / 15) ** 2 + ((y - 14) / 8) ** 2 <= 1 or (x - 9) ** 2 + (y - 9) ** 2 <= 25 or (x - 22) ** 2 + (y - 9) ** 2 <= 25
            if inside:
                d = ((x - 8) / 13) ** 2 + ((y - 6) / 8) ** 2
                s.put(x, y, lt if d < 0.5 else md if d < 1.4 else dk)
    for x, y in ((6, 12), (14, 8), (23, 11), (18, 15)):
        s.put(x, y, hexc('d5f0a0'))
    return billboard(s, 0.45)


def chicken_coop() -> IsoCanvas:
    c = cv(22, pad=10, shadow=0.45)
    c.box(16, WOOD, (0.1, 0.1, 0.9, 0.9))
    mesh = Canvas(20, 10)
    for y in range(10):
        for x in range(20):
            if (x + y) % 3 == 0:
                mesh.put(x, y, BASALT[2])
    paste_face(c, 'left', mesh, 3, 4)
    paste_face(c, 'left', door_sprite(6, 8), 22, 7)
    c.gable_roof((-0.05, -0.05, 1.05, 1.05), 15, 6, SLATE, axis='x', slates=2)
    # 닭 1마리
    sx, sy = c.spx(0.82, 0.86)
    c.ellipse(sx, sy - 3, 3, 2.2, WHITE[1]); c.put(sx - 3, sy - 4, WHITE[2])
    c.rect(sx + 2, sy - 6, 2, 3, WHITE[1]); c.put(sx + 3, sy - 7, RED[1]); c.put(sx + 4, sy - 5, YELLOW[1])
    c.put(sx - 1, sy, ORANGE[0]); c.put(sx + 1, sy, ORANGE[0])
    c.outline()
    return c


def beehive() -> IsoCanvas:
    c = cv(26, shadow=0.35)
    hive = (hexc('c9a227'), hexc('f0d78a'), hexc('fff3c8'))
    c.box(3, WOOD, (0.32, 0.32, 0.68, 0.68))
    c.box(7, hive, (0.32, 0.32, 0.68, 0.68), z0=3)
    c.box(7, hive, (0.3, 0.3, 0.66, 0.66), z0=10)
    c.box(3, SLATE, (0.26, 0.26, 0.7, 0.7), z0=17)
    sx, sy = c.spx(0.5, 0.68, 6); c.rect(sx - 2, sy - 1, 4, 1, BASALT[0])   # 입구
    for dx, dy in ((-12, -30), (14, -24), (-8, -16), (10, -34)):
        c.rect(c.mid + dx, c.h - 16 + dy, 2, 1, YELLOW[1]); c.put(c.mid + dx + 1, c.h - 16 + dy, BASALT[0])
    c.outline()
    return c


# ================================================================ 길·담·문
def path() -> Canvas:
    """현무암 판석 다이아몬드. 흙 타일과 구분되게 바탕을 밝은 모르타르 톤으로, 위 두 변은 밝은 테두리·아래 두 변은 어두운 테두리 (QA 1차 P2 #27)."""
    base = hexc('76767f')
    c = iso_tile(base, BASALT[0])
    tmp = Canvas(64, 32)
    mortar, body, shade, hi = BASALT[0], BASALT[2], BASALT[1], hexc('a4a4ad')
    for cx, cy, rx, ry in ((22, 11, 7, 3.6), (38, 9, 6, 3), (30, 19, 8, 3.8), (46, 17, 6, 3.2), (16, 18, 5, 2.8), (36, 26, 6, 2.8)):
        tmp.ellipse(cx, cy, rx + 1, ry + 1, mortar)
        tmp.shade_ellipse(cx, cy, rx, ry, (shade, body, hi))
    for x, y in ((10, 15), (52, 14), (30, 5), (32, 28)):
        tmp.put(x, y, GRASS[1])
    clip(c, tmp)
    # 위 두 변 1px 밝은 테두리 (흙과의 경계가 또렷하게)
    light = hexc('b9b9c2')
    for px, (lo, hi_y) in diamond_mask((0, 0, 1, 1), 32, 0).items():
        if lo < 16:
            c.put(px, lo, light)
    return c


def gate(bars: int) -> IsoCanvas:
    c = cv(30, shadow=0.42)
    for x, y in ((0.2, 0.88), (0.88, 0.2)):
        c.box(26, BASALT, (x - 0.09, y - 0.09, x + 0.09, y + 0.09))
        sx, sy = c.spx(x, y, 26); c.hline(sx - 2, sx + 1, sy - 1, BASALT[2])
    lx, ly = c.spx(0.2, 0.88, 0); rx_, ry_ = c.spx(0.88, 0.2, 0)
    for i in range(bars):
        z = (8, 14, 20)[i]
        y = ly - z
        c.hline(lx + 4, rx_ - 4, y - 1, WOOD[2]); c.hline(lx + 4, rx_ - 4, y, WOOD[1]); c.hline(lx + 4, rx_ - 4, y + 1, WOOD[0])
    c.outline()
    return c


def stonewall() -> IsoCanvas:
    c = cv(12, shadow=0.5)
    corner = c.sx_of(0.28, 0.28)
    left_end = c.sx_of(0.28, 1)
    c.boxes([(0, 0, 1, 0.28), (0, 0, 0.28, 1)], 12, BASALT, side_fn=lambda px: px >= corner or px < left_end)
    stone_texture(c, {BASALT[0], BASALT[1], BASALT[2]}, 3.4, 2.4, 8, 5)
    for x, y in ((30, 8), (44, 12), (20, 14), (52, 18)):
        c.put(x, y, GRASS[1])
    c.outline()
    return c


def cedar2d(h: int = 40) -> Canvas:
    s = Canvas(22, h)
    dk, md, lt = DARKLEAF
    trunk(s, 10, h - 8, h - 1, 2)
    for i, (cy, r) in enumerate(((h - 12, 10), (h - 20, 8.5), (h - 27, 7), (h - 33, 5), (h - 37, 3))):
        for y in range(int(cy - r * 0.7), int(cy + 3)):
            for x in range(22):
                hw = r * (y - (cy - r * 0.7)) / (r * 0.7 + 3)
                if abs(x - 10.5) <= hw:
                    d = (x - 6) ** 2 / (r * r) + (y - cy + r * 0.5) ** 2 / (r * r)
                    s.put(x, y, lt if d < 0.25 else md if d < 0.9 else dk)
    return s


def windbreak() -> IsoCanvas:
    c = cv(36)
    a, b = cedar2d(44), cedar2d(38)
    a.outline(); b.outline()
    c.ground_shadow(0.3, 0.3, 0.3); c.ground_shadow(0.7, 0.7, 0.3)
    c.billboard(b, 0.3, 0.3); c.billboard(a, 0.7, 0.7)
    return c


def stone_floor() -> Canvas:
    c = iso_tile(BASALT[0], BASALT[0])
    for x0, y0 in ((0, 0), (0.5, 0), (0, 0.5), (0.5, 0.5)):
        m = __import__('iso').diamond_mask((x0 + 0.04, y0 + 0.04, x0 + 0.46, y0 + 0.46), 32, 0)
        fill_mask(c, m, BASALT[2])
        for px, (lo, hi) in m.items():
            c.put(px, hi, BASALT[1]); c.put(px, lo, hexc('9a9aa3'))
    return c


def lantern_path() -> IsoCanvas:
    c = cv(30)
    c.blit(path(), 0, c.h - 32)
    c.pillar(0.14, 0.14, 2, 26, WOOD)
    sx, sy = c.spx(0.14, 0.14, 26)
    c.hline(sx, sx + 6, sy, WOOD[1])
    lan = Canvas(7, 9)
    lan.rect(1, 1, 5, 7, YELLOW[1]); lan.rect(2, 2, 3, 5, hexc('ffe9a3')); lan.rect(1, 0, 5, 1, RED[0]); lan.rect(1, 8, 5, 1, RED[0])
    lan.vline(0, 1, 7, RED[1]); lan.vline(6, 1, 7, RED[1]); lan.outline()
    c.blit(lan, sx + 3, sy + 1)
    return c


def busstop() -> IsoCanvas:
    c = cv(40, shadow=0.45)
    c.box(4, WOOD, (0.3, 0.6, 0.94, 0.86))
    c.box(4, WOOD, (0.28, 0.58, 0.96, 0.88), z0=4)
    c.pillar(0.22, 0.22, 2, 30, BASALT)
    sign = Canvas(12, 10)
    sign.shade_rect(0, 0, 12, 10, SKY)
    sign.rect(3, 3, 6, 4, WHITE[1]); sign.hline(3, 8, 3, WHITE[2])
    sign.put(4, 4, SKY[1]); sign.put(7, 4, SKY[1]); sign.put(4, 7, BASALT[0]); sign.put(7, 7, BASALT[0])
    sx, sy = c.spx(0.22, 0.22, 30)
    c.blit(sign, sx - 5, sy - 8)
    c.outline()
    return c


def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {
        'iso_obj_table_out': table_out(), 'iso_obj_table_parasol': table_parasol(), 'iso_obj_bench': bench(), 'iso_obj_table_in': table_in(),
        'iso_obj_carrot_field': carrot_field(),
        'iso_obj_counter': counter(), 'iso_obj_table_big': table_big(), 'iso_obj_window_seat': window_seat(),
        'iso_obj_roaster': roaster(),
        'iso_obj_souvenir': souvenir(), 'iso_obj_photo_spot': photo_spot(), 'iso_obj_vending': vending(),
        'iso_obj_greenhouse': greenhouse(),
        'iso_obj_field_empty': field('empty'), 'iso_obj_field_planted': field('planted'), 'iso_obj_field_ready': field('ready'),
        'iso_obj_tangerine_tree_young': tree_bb('young'), 'iso_obj_tangerine_tree': tree_bb('normal'),
        'iso_obj_tangerine_tree_ready': tree_bb('ready'), 'iso_obj_hallabong_tree': tree_bb('hallabong'),
        'iso_obj_tea_bush': tea_bush(), 'iso_obj_chicken_coop': chicken_coop(), 'iso_obj_beehive': beehive(),
        'iso_obj_path': path(), 'iso_obj_stonewall': stonewall(), 'iso_obj_windbreak': windbreak(),
        'iso_obj_stone_floor': stone_floor(), 'iso_obj_lantern_path': lantern_path(), 'iso_obj_busstop': busstop(),
    }
    for n in range(4):
        s[f'iso_obj_gate_{n}'] = gate(n)
    s['iso_obj_gate'] = s['iso_obj_gate_0']
    return s
