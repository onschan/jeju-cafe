"""맵 둘레 장식 타일 `iso_ring_<kind>` — 2×2칸 매크로 타일(128×(64+높이)). Background.ts가 맵 밖 8칸 링에 깐다.
북쪽(y<0) 바다(파도 2프레임)·물가(sea/shore) · 서쪽(x<0) 마을(초가·감귤 창고·전봇대·돌담) · 동쪽(x≥30) 감귤밭 줄 ·
남쪽(y≥24) 오름 기슭 풀밭(억새·바위·조랑말). 길은 마을 길(x 방향)·해안 도로(y 방향)·교차·올레 흙길.
렌더는 스프라이트 하단 중앙을 footAnchor(x, y, 2, 2)에 맞춘다(iso 오브젝트와 같은 규약)."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color
from iso import IsoCanvas, ISO_W, ISO_H
from sprites_tiles import grass_tuft
from sprites_iso_objects import stone_texture

GRASS, LEAF, ORANGE, WOOD, BASALT, ROAD, SOIL = PAL['grass'], PAL['leaf'], PAL['orange'], PAL['wood'], PAL['basalt'], PAL['road'], PAL['soil']
WHITE, SKY, YELLOW, RED = PAL['white'], PAL['sky'], PAL['yellow'], PAL['red']
SEA = (hexc('2a5f9e'), hexc('3b7fc4'), hexc('6fb0e6'))
FOAM = hexc('e8f4ff')
SAND = (hexc('c9b27f'), hexc('e6d5a3'), hexc('f3e8c4'))
STRAW = (hexc('9a7a3a'), hexc('c9a458'), hexc('e6cf8a'))
CLAY = (hexc('5a3a22'), hexc('8a5a34'), hexc('b8804e'))
DARKLEAF = (hexc('1f5a22'), hexc('2f7a2a'), hexc('4fae3a'))
PAMPAS = (hexc('b89a5a'), hexc('d9c07a'), hexc('f0e2a8'))
PONY = (hexc('5a3a22'), hexc('8a5a34'), hexc('b8804e'))

CW = 2


class Rng:
    def __init__(self, seed: int):
        self.s = seed & 0xffffffff

    def next(self) -> float:
        self.s = (self.s * 1664525 + 1013904223) & 0xffffffff
        return self.s / 0x100000000

    def between(self, a: int, b: int) -> int:
        return a + int(self.next() * (b - a + 1))


def ring(height: int = 0) -> IsoCanvas:
    return IsoCanvas(CW, CW, height)


def merge(base: IsoCanvas, props: IsoCanvas) -> IsoCanvas:
    """소품 레이어(투명 바탕)에만 외곽선을 넣고 바닥 위에 얹는다 — 바닥 다이아몬드 가장자리엔 선이 생기지 않아 이어 붙여도 격자가 안 보인다."""
    props.outline()
    base.blit(props, 0, 0)
    return base


def flat(c: IsoCanvas, col: Color, rect: tuple[float, float, float, float] | None = None) -> None:
    for px, (lo, hi) in c.footprint(rect).items():
        c.vline(px, lo, hi, col)


def speckle(c: IsoCanvas, cols: list[Color], n: int, seed: int, rect: tuple[float, float, float, float] | None = None) -> None:
    """발자국 안쪽에 점 무늬."""
    m = c.footprint(rect)
    rng = Rng(seed)
    keys = list(m)
    for _ in range(n):
        px = keys[rng.between(0, len(keys) - 1)]
        lo, hi = m[px]
        c.put(px, rng.between(lo, hi), cols[rng.between(0, len(cols) - 1)])


def grass_base(c: IsoCanvas, seed: int = 1) -> None:
    flat(c, GRASS[1])
    speckle(c, [GRASS[0], GRASS[2]], 60, seed)


# ---------------------------------------------------------------- 바다
def sea_base(c: IsoCanvas, frame: int, seed: int = 3) -> None:
    flat(c, SEA[1])
    m = c.footprint()
    rng = Rng(seed)
    for _ in range(26):
        px = rng.between(min(m), max(m) - 8)
        lo, hi = m[px]
        y = rng.between(lo, hi)
        x = px + 3 * frame
        col = SEA[2] if rng.next() < 0.7 else FOAM
        for i in range(rng.between(3, 7)):
            xx = x + i
            if xx in m and m[xx][0] <= y <= m[xx][1]:
                c.put(xx, y, col)
    for px, (lo, hi) in m.items():                      # 어두운 물결 줄
        for y in range(lo, hi + 1):
            if (y + frame * 2) % 7 == 0 and (px // 5) % 2 == 0:
                c.put(px, y, SEA[0])


def sea(frame: int) -> IsoCanvas:
    c = ring()
    sea_base(c, frame)
    return c


def shore(frame: int) -> IsoCanvas:
    """육지(y=2 변, 화면 왼쪽 아래 변)와 맞닿는 물가: 모래 띠 + 거품 줄."""
    c = ring()
    sea_base(c, frame, seed=5)
    flat(c, SEA[2], (0, 1.45 + 0.05 * frame, CW, 1.7))
    for px, (lo, hi) in c.footprint((0, 1.55 + 0.05 * frame, CW, 1.62 + 0.05 * frame)).items():
        for y in range(lo, hi + 1):
            if (px // 3) % 3 != frame:
                c.put(px, y, FOAM)
    flat(c, SAND[1], (0, 1.7, CW, CW))
    flat(c, SAND[2], (0, 1.7, CW, 1.78))
    speckle(c, [SAND[0], SAND[2]], 24, 9, (0, 1.75, CW, CW))
    return c


# ---------------------------------------------------------------- 마을
def stone_wall(c: IsoCanvas, rect: tuple[float, float, float, float], h: int = 7) -> None:
    c.box(h, BASALT, rect)
    stone_texture(c, {BASALT[0], BASALT[1], BASALT[2]}, 3.0, 2.0, 7, 4)


def thatched_house(c: IsoCanvas, rect: tuple[float, float, float, float], wall_h: int = 12) -> None:
    """초가: 낮은 흙벽 상자 + 둥근 짚 지붕(가로 줄로 엮은 줄).

    지붕은 벽 위에 화면 타원으로 얹는다(카이로식 단순화)."""
    x0, y0, x1, y1 = rect
    c.box(wall_h, CLAY, rect)
    stone_texture(c, {CLAY[0], CLAY[1]}, 2.8, 1.8, 7, 4)
    sx, sy = c.screen((x0 + x1) / 2, (y0 + y1) / 2, wall_h)
    rx = (x1 - x0 + y1 - y0) / 2 * ISO_W / 2 * 0.98
    ry = rx * 0.5
    c.shade_ellipse(sx - 0.5, sy - ry * 0.7, rx, ry, STRAW, light=(-0.35, -0.7))
    for k in range(-2, 3):                                   # 지붕 위 새끼줄
        yy = int(sy - ry * 0.7 + k * ry * 0.38)
        for x in range(int(sx - rx) + 2, int(sx + rx) - 1):
            if c.get(x, yy) in (STRAW[1], STRAW[2]) and (x + k) % 2 == 0:
                c.put(x, yy, STRAW[0])
    # 문(앞면 = x1 변 쪽)
    dx, dy = c.spx(x1, (y0 + y1) / 2, 0)
    c.rect(dx - 5, dy - 8, 4, 8, WOOD[0]); c.put(dx - 4, dy - 7, WOOD[1])


def village_a() -> IsoCanvas:
    """초가 한 채 + 앞마당 돌담."""
    base = ring(44); grass_base(base, 11)
    c = ring(44)
    stone_wall(c, (0.05, 1.7, 1.95, 1.95), 6)
    thatched_house(c, (0.35, 0.35, 1.45, 1.35))
    sx, sy = c.spx(1.7, 0.4); c.rect(sx - 2, sy - 6, 4, 6, CLAY[1]); c.put(sx - 1, sy - 6, CLAY[2])   # 물허벅
    return merge(base, c)


def village_b() -> IsoCanvas:
    """감귤 창고: 흰 벽 + 주황 박공 지붕 + 문 앞 감귤 상자."""
    base = ring(48); grass_base(base, 12)
    c = ring(48)
    c.box(16, WHITE, (0.3, 0.25, 1.7, 1.35))
    c.gable_roof((0.2, 0.15, 1.8, 1.45), 16, 10, (ORANGE[0], ORANGE[1], ORANGE[2]), axis='x', slates=4)
    dx, dy = c.spx(1.7, 0.8, 0)
    c.rect(dx - 8, dy - 12, 7, 12, WOOD[0]); c.vline(dx - 5, dy - 12, dy - 1, WOOD[1])        # 큰 미닫이 문
    for (x, y) in ((0.55, 1.6), (0.85, 1.7)):
        c.box(5, WOOD, (x - 0.14, y - 0.14, x + 0.14, y + 0.14))
        sx, sy = c.spx(x, y, 5); c.put(sx - 1, sy - 1, ORANGE[1]); c.put(sx + 1, sy - 2, ORANGE[1]); c.put(sx, sy - 1, ORANGE[2])
    return merge(base, c)


def utility_pole(c: IsoCanvas, x: float, y: float, h: int = 40) -> None:
    c.pillar(x, y, 2, h, (hexc('4a4a52'), hexc('7a7a84'), hexc('a8a8b0')))
    sx, sy = c.spx(x, y, h)
    c.hline(sx - 7, sx + 7, sy + 2, hexc('4a4a52'))
    c.put(sx - 7, sy + 1, WHITE[2]); c.put(sx + 7, sy + 1, WHITE[2]); c.put(sx, sy + 1, WHITE[2])
    c.hline(sx - 7, sx + 7, sy + 5, hexc('4a4a52'))


def small_tree(c: IsoCanvas, x: float, y: float, tones=LEAF, r: float = 9, h: int = 10, fruit: Color | None = None, seed: int = 1) -> None:
    sx, sy = c.spx(x, y)
    c.ground_shadow(x, y, 0.22)
    c.rect(sx - 1, sy - h, 2, h, WOOD[0])
    c.shade_ellipse(sx - 0.5, sy - h - r * 0.55, r, r * 0.8, tones, light=(-0.4, -0.6))
    if fruit:
        rng = Rng(seed)
        for _ in range(5):
            fx, fy = sx + rng.between(-int(r * 0.7), int(r * 0.7)), sy - h - int(r * 0.55) + rng.between(-int(r * 0.5), int(r * 0.5))
            c.put(fx, fy, fruit); c.put(fx + 1, fy, ORANGE[0])


def village_c() -> IsoCanvas:
    """전봇대 + 돌담 모퉁이 + 팽나무 한 그루."""
    base = ring(52); grass_base(base, 13)
    c = ring(52)
    stone_wall(c, (0.05, 0.05, 1.95, 0.3), 7)
    stone_wall(c, (0.05, 0.05, 0.3, 1.95), 7)
    small_tree(c, 1.3, 1.3, DARKLEAF, 13, 14)
    utility_pole(c, 0.6, 1.7)
    return merge(base, c)


# ---------------------------------------------------------------- 감귤밭
def orchard_a() -> IsoCanvas:
    base = ring(30); grass_base(base, 21); speckle(base, [SOIL[1], SOIL[0]], 40, 22)
    c = ring(30)
    for i, (x, y) in enumerate(((0.5, 0.5), (1.5, 0.5), (0.5, 1.5), (1.5, 1.5))):
        small_tree(c, x, y, DARKLEAF, 8, 7, ORANGE[1], seed=i + 1)
    return merge(base, c)


def orchard_b() -> IsoCanvas:
    """감귤나무 3그루 + 밭담 + 상자."""
    base = ring(30); grass_base(base, 23); speckle(base, [SOIL[1], SOIL[0]], 40, 24)
    c = ring(30)
    stone_wall(c, (0.05, 0.05, 1.95, 0.28), 6)
    for i, (x, y) in enumerate(((0.5, 0.75), (1.5, 0.75), (1.0, 1.55))):
        small_tree(c, x, y, DARKLEAF, 8, 7, ORANGE[1], seed=i + 7)
    c.box(5, WOOD, (0.15, 1.5, 0.45, 1.8))
    sx, sy = c.spx(0.3, 1.65, 5); c.put(sx, sy - 1, ORANGE[1]); c.put(sx - 2, sy - 2, ORANGE[2]); c.put(sx + 1, sy - 2, ORANGE[1])
    return merge(base, c)


# ---------------------------------------------------------------- 오름 기슭 풀밭
def pampas_tuft(c: IsoCanvas, x: float, y: float, seed: int = 1) -> None:
    sx, sy = c.spx(x, y)
    rng = Rng(seed)
    for i in range(-3, 4):
        h = rng.between(5, 10)
        col = PAMPAS[1] if i % 2 else PAMPAS[0]
        c.vline(sx + i, sy - h, sy, col)
        c.put(sx + i, sy - h, PAMPAS[2])


def pony(c: IsoCanvas, x: float, y: float) -> None:
    """풀 뜯는 조랑말(옆모습, 화면 왼쪽 향함)."""
    s = Canvas(22, 16)
    s.shade_ellipse(12, 8, 7, 4, PONY)                       # 몸통
    s.rect(7, 11, 2, 5, PONY[0]); s.rect(15, 11, 2, 5, PONY[0])   # 다리
    s.rect(10, 11, 2, 4, PONY[1]); s.rect(13, 11, 2, 4, PONY[1])
    s.shade_rect(3, 5, 5, 4, PONY); s.rect(1, 7, 3, 3, PONY[1])   # 목·머리(숙임)
    s.hline(4, 12, 4, hexc('2b2118')); s.put(3, 5, hexc('2b2118'))  # 갈기
    s.vline(19, 6, 12, hexc('2b2118'))                            # 꼬리
    s.put(1, 8, hexc('2b2118'))
    s.outline()
    c.ground_shadow(x, y, 0.3)
    c.billboard(s, x, y)


def grass_a() -> IsoCanvas:
    c = ring(14)
    grass_base(c, 31)
    for i, (x, y) in enumerate(((0.4, 0.5), (1.2, 0.3), (1.7, 1.1), (0.7, 1.4), (1.4, 1.7))):
        pampas_tuft(c, x, y, i + 1)
    sx, sy = c.spx(0.3, 1.1); c.shade_ellipse(sx, sy - 2, 4, 2.4, (BASALT[1], BASALT[2], hexc('9a9aa3')))
    return c


def grass_b() -> IsoCanvas:
    c = ring(18)
    grass_base(c, 33)
    pampas_tuft(c, 0.35, 0.4, 5); pampas_tuft(c, 1.7, 1.6, 6)
    for x, y in ((0.9, 0.9), (1.5, 0.5), (0.6, 1.5)):
        sx, sy = c.spx(x, y); grass_tuft(c, sx, sy)
    pony(c, 1.2, 1.15)
    return c


# ---------------------------------------------------------------- 길
def road_strip(c: IsoCanvas, rect: tuple[float, float, float, float], axis: str) -> None:
    flat(c, ROAD[1], rect)
    x0, y0, x1, y1 = rect
    if axis == 'x':
        flat(c, ROAD[0], (x0, y0, x1, y0 + 0.06)); flat(c, ROAD[0], (x0, y1 - 0.06, x1, y1))
        my = (y0 + y1) / 2
        for k in range(4):
            flat(c, ROAD[2], (x0 + 0.1 + k * 0.5, my - 0.03, x0 + 0.3 + k * 0.5, my + 0.03))
    else:
        flat(c, ROAD[0], (x0, y0, x0 + 0.06, y1)); flat(c, ROAD[0], (x1 - 0.06, y0, x1, y1))
        mx = (x0 + x1) / 2
        for k in range(4):
            flat(c, ROAD[2], (mx - 0.03, y0 + 0.1 + k * 0.5, mx + 0.03, y0 + 0.3 + k * 0.5))


def road_x() -> IsoCanvas:
    """마을 길이 x 방향으로 이어지는 타일(길은 둘째 줄 y∈[1,2)). 전봇대 하나."""
    base = ring(44); grass_base(base, 41); road_strip(base, (0, 1, CW, 2), 'x')
    c = ring(44)
    utility_pole(c, 0.5, 0.5, 38)
    return merge(base, c)


def road_y() -> IsoCanvas:
    """해안 도로(y 방향, 둘째 열 x∈[1,2))."""
    base = ring(30); grass_base(base, 42); road_strip(base, (1, 0, 2, CW), 'y')
    c = ring(30)
    small_tree(c, 0.5, 0.5, DARKLEAF, 8, 7, ORANGE[1], seed=42)
    small_tree(c, 0.5, 1.5, DARKLEAF, 8, 7, ORANGE[1], seed=43)
    return merge(base, c)


def road_xy() -> IsoCanvas:
    c = ring(4)
    grass_base(c, 43)
    road_strip(c, (0, 1, CW, 2), 'x')
    road_strip(c, (1, 0, 2, CW), 'y')
    flat(c, ROAD[1], (1.06, 1.06, 1.94, 1.94))
    return c


def path_x() -> IsoCanvas:
    """올레 흙길(둘째 줄) + 리본 말뚝."""
    base = ring(26); grass_base(base, 44)
    flat(base, SOIL[1], (0, 1.2, CW, 1.8))
    speckle(base, [SOIL[0], SOIL[2]], 30, 45, (0, 1.2, CW, 1.8))
    pampas_tuft(base, 0.5, 0.5, 8); pampas_tuft(base, 1.5, 0.4, 9)
    c = ring(26)
    sx, sy = c.spx(1.6, 1.1)
    c.rect(sx - 1, sy - 16, 2, 16, WOOD[0]); c.put(sx - 1, sy - 16, WOOD[1])
    for y in range(sy - 15, sy - 6):
        c.put(sx + 1 + (y % 2), y, hexc('3b8ad9')); c.put(sx + 3 + (y % 2), y, hexc('f28c28'))
    return merge(base, c)


# ---------------------------------------------------------------- 링 밖 먼 땅·바다 (64×32 직사각형, TilingSprite로 이어 붙인다)
def far_grass() -> Canvas:
    c = Canvas(ISO_W, ISO_H)
    c.rect(0, 0, ISO_W, ISO_H, GRASS[1])
    rng = Rng(77)
    for _ in range(40):
        c.put(rng.between(0, ISO_W - 1), rng.between(0, ISO_H - 1), GRASS[0] if rng.next() < 0.6 else GRASS[2])
    return c


def far_sea() -> Canvas:
    c = Canvas(ISO_W, ISO_H)
    c.rect(0, 0, ISO_W, ISO_H, SEA[1])
    rng = Rng(78)
    for _ in range(14):
        x, y = rng.between(0, ISO_W - 6), rng.between(0, ISO_H - 1)
        c.hline(x, x + rng.between(2, 5), y, SEA[2] if rng.next() < 0.75 else FOAM)
    for y in range(0, ISO_H, 8):
        for x in range(0, ISO_W):
            if (x // 6) % 2 == 0:
                c.put(x, y, SEA[0])
    return c


def sprites() -> dict[str, Canvas]:
    return {
        'iso_far_grass': far_grass(), 'iso_far_sea': far_sea(),
        'iso_ring_sea_0': sea(0), 'iso_ring_sea_1': sea(1), 'iso_ring_shore_0': shore(0), 'iso_ring_shore_1': shore(1),
        'iso_ring_village_a': village_a(), 'iso_ring_village_b': village_b(), 'iso_ring_village_c': village_c(),
        'iso_ring_orchard_a': orchard_a(), 'iso_ring_orchard_b': orchard_b(),
        'iso_ring_grass_a': grass_a(), 'iso_ring_grass_b': grass_b(),
        'iso_ring_road_x': road_x(), 'iso_ring_road_y': road_y(), 'iso_ring_road_xy': road_xy(), 'iso_ring_path_x': path_x(),
    }
