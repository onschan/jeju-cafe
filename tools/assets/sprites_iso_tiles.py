"""아이소 타일: iso_tile_{soil,rock,road}_{season} 64×32 + iso_tile_locked.
탑다운 타일과 같은 팔레트·계절 힌트(점무늬·유채·낙엽·눈). 외곽선 없음, 장식은 다이아몬드 안쪽에만."""
from __future__ import annotations
from px import Canvas, PAL, hexc, Color
from iso import ISO_W, ISO_H, iso_tile, tile_mask, Mask
from sprites_tiles import SEASONS, STONE, rapeseed, fallen_leaf, grass_tuft, snow_dot

SOIL, ROCK, ROAD = PAL['soil'], PAL['basalt'], PAL['road']
GRASS, SNOW = PAL['grass'], PAL['snow']
MASK = tile_mask()


def clip(c: Canvas, tmp: Canvas, m: Mask = MASK) -> None:
    """tmp의 픽셀 중 마스크 안쪽만 c에 옮긴다."""
    for px, (lo, hi) in m.items():
        for py in range(lo, hi + 1):
            col = tmp.px[py][px]
            if col[3]:
                c.put(px, py, col)


def dots(c: Canvas, pts: list[tuple[int, int]], col: Color, w: int = 1, h: int = 1) -> None:
    for x, y in pts:
        c.rect(x, y, w, h, col)


def stone(tmp: Canvas, cx: float, cy: float, rx: float, ry: float, snow: bool = False) -> None:
    tmp.ellipse(cx, cy, rx + 1, ry + 1, ROCK[0])
    tmp.shade_ellipse(cx, cy, rx, ry, STONE)
    if snow:
        for y in range(tmp.h):
            for x in range(tmp.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 and y < cy - ry * 0.2:
                    tmp.put(x, y, SNOW[1] if x > cx else SNOW[2])


# ---------------------------------------------------------------- soil
def tile_soil(season: str) -> Canvas:
    dk, md, lt = SOIL
    if season == 'winter':
        c = iso_tile(SNOW[1], SNOW[0])
        tmp = Canvas(ISO_W, ISO_H)
        dots(tmp, [(20, 12), (40, 18), (30, 24), (44, 10)], SNOW[2], 2, 1)
        dots(tmp, [(14, 16), (36, 13), (26, 20), (48, 17)], SNOW[0], 2, 1)   # 눈 밑 흙 비침
        dots(tmp, [(15, 17), (37, 14)], dk)
        clip(c, tmp)
        return c
    c = iso_tile(md, dk)
    tmp = Canvas(ISO_W, ISO_H)
    dots(tmp, [(18, 12), (40, 9), (28, 20), (46, 18), (34, 26), (12, 16)], dk, 2, 1)
    dots(tmp, [(19, 13), (41, 10), (35, 27)], dk)
    dots(tmp, [(26, 8), (50, 14), (22, 22), (38, 17)], lt, 2, 1)
    if season == 'spring':
        rapeseed(tmp, 20, 15); rapeseed(tmp, 42, 19); rapeseed(tmp, 31, 9)
    elif season == 'summer':
        grass_tuft(tmp, 16, 16); grass_tuft(tmp, 44, 13); grass_tuft(tmp, 31, 24)
    elif season == 'autumn':
        fallen_leaf(tmp, 22, 17); fallen_leaf(tmp, 43, 20)
    clip(c, tmp)
    return c


# ---------------------------------------------------------------- rock
def tile_rock(season: str) -> Canvas:
    dk, md, lt = ROCK
    c = iso_tile(md, dk)
    tmp = Canvas(ISO_W, ISO_H)
    dots(tmp, [(14, 15), (48, 17), (30, 26), (33, 5)], dk)
    snow = season == 'winter'
    stone(tmp, 24, 12, 7, 3.6, snow)
    stone(tmp, 40, 20, 8, 4, snow)
    stone(tmp, 46, 11, 4.2, 2.2, snow)
    if season == 'summer':
        grass_tuft(tmp, 14, 19); grass_tuft(tmp, 50, 14)
    elif season == 'spring':
        rapeseed(tmp, 14, 17)
    elif season == 'autumn':
        fallen_leaf(tmp, 15, 18)
    elif season == 'winter':
        snow_dot(tmp, 15, 18); snow_dot(tmp, 31, 27)
    clip(c, tmp)
    return c


# ---------------------------------------------------------------- road
def tile_road(season: str) -> Canvas:
    dk, md, lt = ROAD
    c = iso_tile(md, dk)
    tmp = Canvas(ISO_W, ISO_H)
    for x, y in [(20, 10), (38, 8), (26, 18), (46, 16), (32, 24), (14, 15)]:
        tmp.rect(x, y, 2, 1, lt); tmp.put(x + 1, y + 1, dk)
    if season == 'winter':
        snow_dot(tmp, 24, 13); snow_dot(tmp, 42, 20); snow_dot(tmp, 34, 6)
    elif season == 'autumn':
        fallen_leaf(tmp, 40, 13)
    clip(c, tmp)
    return c


def tile_locked() -> Canvas:
    c = iso_tile((0, 0, 0, 110), None)
    for px, (lo, hi) in MASK.items():
        for py in range(lo, hi + 1):
            if (px + 2 * py) % 8 == 0:
                c.blend(px, py, (255, 255, 255, 40))
    return c


def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    for season in SEASONS:
        s[f'iso_tile_soil_{season}'] = tile_soil(season)
        s[f'iso_tile_rock_{season}'] = tile_rock(season)
        s[f'iso_tile_road_{season}'] = tile_road(season)
    s['iso_tile_locked'] = tile_locked()
    return s
