"""맵 밖 배경 띠 (512×96): 바다(파도 2프레임 bg_sea_0/1, 멀리 배·등대) · 오름 곶(bg_oreum: 오름 2~3개 + 한라산, 바닥은 투명해 바다가 비친다) · 숲 · 마을.
위쪽은 투명(하늘은 렌더가 깐다). Background.ts가 지평선에 겹쳐 놓는다: 바다(가장 멀리, 항상) → 오름 곶(왼쪽 절반) → 숲·마을(옛 띠, 지금은 안 씀)."""
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
    """바다 건너 곶: 먼 한라산(넓은 봉우리) + 오름 실루엣 3개. 능선 아래는 바다색 한 줄로 끝나고 그 아래는 투명(바다 띠가 비친다)."""
    c = Canvas(W, H)
    base = 72
    # 한라산: 가운데 완만하고 넓은 봉우리
    for x in range(W):
        t = (x - 210) / 190
        top = int(base - 60 * max(0.0, 1 - t * t) ** 1.5)
        if top < base:
            c.vline(x, top, base, OREUM_FAR)
            if top < 20:
                c.vline(x, top, min(top + 3, 20), hexc('9fb3c8'))   # 정상 부근 밝은 눈/구름 띠
    hills(c, 58, 6, 1.4, 1.1, 44, OREUM_MID, 2)
    hills(c, 68, 4, 2.6, 4.0, 60, OREUM_NEAR, 3)
    # 오름 3개: 종 모양 둔덕
    for cx, r, h in ((60, 34, 18), (330, 40, 22), (455, 30, 15)):
        for x in range(cx - r, cx + r + 1):
            t = (x - cx) / r
            top = int(base - h * max(0.0, 1 - t * t) ** 0.8)
            c.vline(x, top, base, OREUM_NEAR)
    rng = Rng(23)
    for _ in range(70):
        x = rng.between(0, W - 1)
        for y in range(H):
            if c.get(x, y)[3] == 255:
                c.put(x, y - 1, GRASS_LT if rng.next() < 0.5 else OREUM_FAR)
                break
    c.hline(0, W - 1, base, SEA_LT)               # 물가 한 줄
    for y in range(base + 1, H):                    # 아래는 투명 (바다 띠가 비친다)
        for x in range(W):
            c.put(x, y, (0, 0, 0, 0))
    return c


def boat(c: Canvas, x: int, y: int) -> None:
    """수평선 위 작은 어선: 선체 + 조타실 + 돛대."""
    c.hline(x, x + 9, y, BASALT_DK)
    c.hline(x + 1, x + 8, y - 1, WHITE_MD)
    c.rect(x + 3, y - 4, 4, 3, WHITE_LT); c.put(x + 4, y - 3, SKY_DK)
    c.vline(x + 5, y - 8, y - 5, BASALT_DK); c.put(x + 6, y - 8, hexc('d62828'))


def lighthouse(c: Canvas, x: int, y: int) -> None:
    """작은 섬 위 흰 등대(빨간 띠)."""
    c.ellipse(x, y + 1, 9, 2.5, BASALT_MD); c.ellipse(x - 2, y, 6, 1.6, BASALT_LT)
    c.rect(x - 2, y - 14, 5, 14, WHITE_MD); c.vline(x - 2, y - 14, y - 1, WHITE_LT); c.vline(x + 2, y - 14, y - 1, WHITE_DK)
    c.rect(x - 2, y - 9, 5, 2, hexc('d62828'))
    c.rect(x - 3, y - 17, 7, 3, BASALT_DK); c.put(x, y - 16, hexc('fff0b3'))


def sea(frame: int = 0) -> Canvas:
    """수평선 아래는 끝까지 바다(모래·잔디 없음 — 맵 둘레 바다 타일과 색이 이어진다). frame 1은 파도 줄이 4px 밀린다."""
    c = Canvas(W, H)
    horizon = 40
    c.rect(0, horizon, W, H - horizon, SEA_MID)
    c.hline(0, W - 1, horizon, FOAM)
    c.hline(0, W - 1, horizon + 1, SEA_LT)
    for y in range(horizon + 2, H):
        if y % 6 == 0:
            c.hline(0, W - 1, y, SEA_DEEP)
    rng = Rng(31)
    for _ in range(120):
        x, y = rng.between(0, W - 8), rng.between(horizon + 3, H - 2)
        x = (x + 4 * frame) % (W - 8)
        c.hline(x, x + rng.between(2, 6), y, SEA_LT if rng.next() < 0.7 else FOAM)
    boat(c, 300 + 2 * frame, horizon + 6)
    boat(c, 420, horizon + 12)
    lighthouse(c, 470, horizon + 4)
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
    return {'bg_forest': forest(), 'bg_oreum': oreum(), 'bg_sea_0': sea(0), 'bg_sea_1': sea(1), 'bg_village': village()}
