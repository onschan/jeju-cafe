"""맵 밖 배경 띠 4장 (512×96): 숲·오름·바다·마을. 위쪽은 투명(하늘은 렌더가 깐다), 아랫줄은 잔디.
Background.ts가 지평선에 겹쳐 놓는다: 바다(가장 멀리) → 오름 → 숲 → 마을(가장 가까이)."""
from __future__ import annotations
import math
from px import Canvas, PAL, hexc, Color

W, H = 512, 96
GRASS_DK, GRASS_MD, GRASS_LT = PAL['grass']
LEAF_DK, LEAF_MD, LEAF_LT = PAL['leaf']
BASALT_DK, BASALT_MD, BASALT_LT = PAL['basalt']
WOOD_DK, WOOD_MD, WOOD_LT = PAL['wood']
SKY_DK, SKY_MD, SKY_LT = PAL['sky']
WHITE_DK, WHITE_MD, WHITE_LT = PAL['white']
ORANGE_DK, ORANGE_MD, ORANGE_LT = PAL['orange']
# 먼 숲·오름은 푸르스름하게 가라앉힌 톤
FAR_TREE = hexc('1f4a33')
FAR_TREE_LT = hexc('2a5c3d')
NEAR_TREE = hexc('2f7a2a')
NEAR_TREE_LT = hexc('3f9433')
TRUNK = hexc('3b2a1a')
OREUM_FAR = hexc('5b7f7a')
OREUM_MID = hexc('466b57')
OREUM_NEAR = hexc('3a5a3a')
SEA_DEEP = hexc('2a5f9e')
SEA_MID = hexc('3b7fc4')
SEA_LT = hexc('6fb0e6')
FOAM = hexc('e8f4ff')
SAND = hexc('e6d5a3')
SAND_DK = hexc('c9b27f')


class Rng:
    """결정적 LCG. 빌드마다 같은 그림이 나오도록."""
    def __init__(self, seed: int):
        self.s = seed & 0xffffffff

    def next(self) -> float:
        self.s = (self.s * 1664525 + 1013904223) & 0xffffffff
        return self.s / 0x100000000

    def between(self, a: int, b: int) -> int:
        return a + int(self.next() * (b - a + 1))


def grass(c: Canvas, y0: int) -> None:
    """y0부터 바닥까지 잔디. 위 2줄은 밝게, 군데군데 풀 점."""
    c.rect(0, y0, W, H - y0, GRASS_MD)
    c.hline(0, W - 1, y0, GRASS_LT)
    rng = Rng(7)
    for _ in range(140):
        x, y = rng.between(0, W - 1), rng.between(y0 + 1, H - 1)
        c.put(x, y, GRASS_DK if rng.next() < 0.6 else GRASS_LT)


def round_tree(c: Canvas, x: int, base: int, r: int, dk: Color, lt: Color) -> None:
    c.ellipse(x, base - r, r, r * 0.9, dk)
    c.ellipse(x - r * 0.3, base - r - r * 0.3, r * 0.5, r * 0.4, lt)


def pine(c: Canvas, x: int, base: int, h: int, dk: Color, lt: Color) -> None:
    w = max(3, h // 2)
    for i in range(h):
        hw = int(w * i / h)
        c.hline(x - hw, x + hw, base - h + i, dk)
    for i in range(0, h, 3):
        hw = int(w * i / h)
        c.hline(x - hw, x - hw + max(1, hw // 2), base - h + i, lt)
    c.rect(x - 1, base, 2, 3, TRUNK)


def forest() -> Canvas:
    c = Canvas(W, H)
    grass(c, 76)
    rng = Rng(11)
    # 먼 줄: 둥근 나무들이 빽빽하게
    x = -6
    while x < W + 8:
        round_tree(c, x, 62, rng.between(9, 13), FAR_TREE, FAR_TREE_LT)
        x += rng.between(9, 14)
    # 가까운 줄: 소나무·둥근 나무 섞어서
    x = 4
    while x < W + 8:
        if rng.next() < 0.55:
            pine(c, x, 76, rng.between(18, 30), NEAR_TREE, NEAR_TREE_LT)
        else:
            round_tree(c, x, 78, rng.between(8, 11), LEAF_DK, LEAF_MD)
        x += rng.between(12, 20)
    return c


def hills(c: Canvas, base: int, amp: int, period: float, phase: float, top_min: int, col: Color, seed: int) -> None:
    """부드러운 능선: sin 두 개 합으로 높이. base 아래를 채운다."""
    for x in range(W):
        t = x / W * math.tau
        h = amp * (0.6 * math.sin(t * period + phase) + 0.4 * math.sin(t * period * 2.3 + phase * 1.7))
        top = max(top_min, int(base - amp - h))
        c.vline(x, top, H - 1, col)


def oreum() -> Canvas:
    c = Canvas(W, H)
    hills(c, 40, 10, 1.0, 0.4, 18, OREUM_FAR, 1)
    hills(c, 56, 12, 1.6, 2.1, 30, OREUM_MID, 2)
    hills(c, 72, 10, 2.4, 4.0, 48, OREUM_NEAR, 3)
    # 능선 위 억새·작은 나무 점
    rng = Rng(23)
    for _ in range(90):
        x = rng.between(0, W - 1)
        for y in range(H):
            if c.get(x, y)[3] == 255:
                c.put(x, y - 1, GRASS_LT if rng.next() < 0.5 else OREUM_FAR)
                break
    grass(c, 84)
    return c


def sea() -> Canvas:
    c = Canvas(W, H)
    horizon = 40
    c.rect(0, horizon, W, 84 - horizon, SEA_MID)
    c.hline(0, W - 1, horizon, FOAM)
    c.hline(0, W - 1, horizon + 1, SEA_LT)
    for y in range(horizon + 2, 84):
        if y % 6 == 0:
            c.hline(0, W - 1, y, SEA_DEEP)
    rng = Rng(31)
    for _ in range(120):
        x, y = rng.between(0, W - 8), rng.between(horizon + 3, 82)
        c.hline(x, x + rng.between(2, 6), y, SEA_LT if rng.next() < 0.7 else FOAM)
    # 모래톱과 잔디
    c.rect(0, 84, W, 4, SAND)
    c.hline(0, W - 1, 84, FOAM)
    c.hline(0, W - 1, 87, SAND_DK)
    grass(c, 88)
    return c


def house(c: Canvas, x: int, base: int, w: int, h: int, roof: tuple[Color, Color, Color], wall: tuple[Color, Color, Color]) -> None:
    wdk, wmd, wlt = wall
    rdk, rmd, rlt = roof
    c.rect(x, base - h, w, h, wmd)
    c.vline(x, base - h, base - 1, wlt); c.vline(x + w - 1, base - h, base - 1, wdk)
    # 지붕: 벽보다 양옆 2px 넓고 위로 h//2 올라간다
    rh = max(4, h // 2)
    for i in range(rh):
        span = int((w + 4) * (i + 1) / rh / 2)
        c.hline(x + w // 2 - span, x + w // 2 + span, base - h - rh + i, rlt if i % 3 == 0 else rmd)
    c.hline(x - 2, x + w + 1, base - h, rdk)
    # 문·창
    c.rect(x + w // 2 - 1, base - 5, 3, 5, WOOD_DK)
    if w >= 12:
        c.rect(x + 2, base - h + 3, 3, 3, SKY_LT); c.rect(x + w - 5, base - h + 3, 3, 3, SKY_LT)


def village() -> Canvas:
    c = Canvas(W, H)
    grass(c, 76)
    rng = Rng(41)
    roofs = (PAL['orange'], PAL['basalt'], (hexc('7a3b2a'), hexc('a54a35'), hexc('d16b4e')))
    walls = (PAL['white'], (hexc('bfb8a8'), hexc('e6dfcf'), hexc('fff8ec')), PAL['soil'])
    x = 6
    while x < W - 10:
        w, h = rng.between(10, 18), rng.between(9, 14)
        house(c, x, 76, w, h, roofs[rng.between(0, 2)], walls[rng.between(0, 2)])
        x += w + 4
        if rng.next() < 0.35:
            # 집 사이 돌담
            gap = rng.between(6, 12)
            for i in range(gap):
                c.put(x + i, 75, BASALT_MD if i % 2 == 0 else BASALT_DK)
                c.put(x + i, 74, BASALT_LT if i % 3 == 0 else BASALT_MD)
            x += gap + 3
        if rng.next() < 0.3:
            round_tree(c, x + 2, 76, rng.between(5, 7), LEAF_DK, LEAF_MD)
            x += 10
    # 먼 산 실루엣 살짝
    for xx in range(W):
        t = xx / W * math.tau
        top = int(52 - 6 * math.sin(t * 1.3 + 0.7) - 4 * math.sin(t * 3.1))
        for y in range(top, 62):
            if c.get(xx, y)[3] == 0:
                c.put(xx, y, OREUM_FAR)
    return c


def sprites() -> dict[str, Canvas]:
    return {'bg_forest': forest(), 'bg_oreum': oreum(), 'bg_sea': sea(), 'bg_village': village()}
