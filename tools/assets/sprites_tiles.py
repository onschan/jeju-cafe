"""타일 스프라이트: tile_{soil,rock,road}_{spring,summer,autumn,winter} 32×32 + tile_locked.
외곽선 없음 — 이어 붙여도 격자 무늬가 생기지 않도록 가장자리 픽셀은 모든 타일이 같은 규칙을 따른다."""
from __future__ import annotations
from px import Canvas, PAL, hexc, Color

T = 32
SEASONS = ('spring', 'summer', 'autumn', 'winter')

SOIL, ROCK, ROAD = PAL['soil'], PAL['basalt'], PAL['road']
GRASS, SNOW, YELLOW, ORANGE = PAL['grass'], PAL['snow'], PAL['yellow'], PAL['orange']
# 돌은 바탕(basalt.MD)보다 밝게 읽히도록 한 단계 밝은 3톤
STONE = (PAL['basalt'][1], PAL['basalt'][2], hexc('9a9aa3'))


def dots(c: Canvas, pts: list[tuple[int, int]], col: Color, w: int = 1, h: int = 1) -> None:
    for x, y in pts:
        c.rect(x, y, w, h, col)


def grass_tuft(c: Canvas, x: int, y: int) -> None:
    """2px 세로선 풀 3가닥(가운데 밝게)."""
    dk, md, lt = GRASS
    c.vline(x, y - 1, y, md)
    c.vline(x - 1, y, y, dk)
    c.vline(x + 1, y - 1, y, lt)


def rapeseed(c: Canvas, x: int, y: int) -> None:
    """봄 유채꽃: 노란 2×2 + 아래 초록 줄기."""
    c.rect(x, y, 2, 2, YELLOW[1])
    c.put(x, y, YELLOW[2])
    c.put(x, y + 2, GRASS[0])


def fallen_leaf(c: Canvas, x: int, y: int) -> None:
    c.rect(x, y, 2, 1, ORANGE[0])
    c.put(x + 1, y + 1, ORANGE[0])
    c.put(x, y, ORANGE[1])


def snow_dot(c: Canvas, x: int, y: int) -> None:
    c.rect(x, y, 2, 1, SNOW[1])
    c.put(x, y, SNOW[2])


def stone(c: Canvas, cx: float, cy: float, rx: float, ry: float, snow: bool = False) -> None:
    """어두운 테두리 + 3톤 돌. 겨울에는 위에 눈 캡."""
    c.ellipse(cx, cy, rx + 1, ry + 1, ROCK[0])
    c.shade_ellipse(cx, cy, rx, ry, STONE)
    if snow:
        for y in range(c.h):
            for x in range(c.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 and y < cy - ry * 0.25:
                    c.put(x, y, SNOW[1] if (y > cy - ry * 0.7 or x > cx) else SNOW[2])
        c.hline(int(cx - rx * 0.8), int(cx + rx * 0.8), int(cy - ry * 0.25), SNOW[0])


# ---------------------------------------------------------------- soil
def tile_soil(season: str) -> Canvas:
    dk, md, lt = SOIL
    c = Canvas(T, T)
    c.rect(0, 0, T, T, md)
    dots(c, [(4, 5), (13, 9), (22, 4), (8, 19), (19, 22), (27, 15)], dk, 2, 1)
    dots(c, [(5, 6), (23, 5), (20, 23), (14, 10)], dk)      # 점 두께 살짝
    dots(c, [(10, 3), (25, 10), (15, 27), (3, 28)], lt, 2, 1)
    if season == 'spring':
        rapeseed(c, 7, 12); rapeseed(c, 23, 24)
    elif season == 'summer':
        grass_tuft(c, 6, 14); grass_tuft(c, 24, 8); grass_tuft(c, 15, 26)
    elif season == 'autumn':
        fallen_leaf(c, 6, 13); fallen_leaf(c, 23, 25)
    elif season == 'winter':
        c.rect(0, 0, T, 13, SNOW[1])
        # 눈 경계는 살짝 울퉁불퉁
        for x in range(T):
            edge = 12 + (1 if (x // 5) % 2 == 0 else 0)
            c.put(x, edge, SNOW[0])
            if edge == 13:
                c.put(x, 12, SNOW[1])
        dots(c, [(5, 4), (20, 7), (27, 2)], SNOW[2])
    # 격자감: 오른쪽·아래 1px 경계
    c.vline(T - 1, 0, T - 1, dk); c.hline(0, T - 1, T - 1, dk)
    return c


# ---------------------------------------------------------------- rock
def tile_rock(season: str) -> Canvas:
    dk, md, lt = ROCK
    c = Canvas(T, T)
    c.rect(0, 0, T, T, md)
    dots(c, [(5, 25), (13, 4), (27, 27), (2, 12)], dk)
    dots(c, [(6, 25), (14, 4)], dk)
    snow = season == 'winter'
    stone(c, 10, 12, 6, 4.5, snow)
    stone(c, 22, 22, 6.5, 4, snow)
    stone(c, 25, 6, 3.5, 2.5, snow)
    if season == 'summer':
        grass_tuft(c, 4, 27); grass_tuft(c, 28, 14)
    elif season == 'spring':
        rapeseed(c, 3, 26)
    elif season == 'autumn':
        fallen_leaf(c, 3, 27)
    return c


# ---------------------------------------------------------------- road
def tile_road(season: str) -> Canvas:
    dk, md, lt = ROAD
    c = Canvas(T, T)
    c.rect(0, 0, T, T, md)
    c.hline(0, T - 1, 0, dk); c.hline(0, T - 1, T - 1, dk)
    for x, y in [(3, 6), (12, 14), (21, 8), (27, 20), (8, 24), (17, 27)]:
        c.rect(x, y, 2, 1, lt); c.put(x + 1, y + 1, dk)
    if season == 'winter':
        snow_dot(c, 6, 11); snow_dot(c, 24, 4); snow_dot(c, 14, 20); snow_dot(c, 26, 26)
    elif season == 'autumn':
        fallen_leaf(c, 24, 13)
    return c


def tile_locked() -> Canvas:
    c = Canvas(T, T)
    c.rect(0, 0, T, T, (0, 0, 0, 110))
    for y in range(T):
        for x in range(T):
            if (x + y) % 4 == 0:
                c.blend(x, y, (255, 255, 255, 40))
    return c


def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    for season in SEASONS:
        s[f'tile_soil_{season}'] = tile_soil(season)
        s[f'tile_rock_{season}'] = tile_rock(season)
        s[f'tile_road_{season}'] = tile_road(season)
    s['tile_locked'] = tile_locked()
    return s
