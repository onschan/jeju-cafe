"""상점 설계도·명소 상품 시설 4종 (src/data/facilities_shop.json): 활력 화분 3종 + 황금 감귤나무.
1×1. 활력 화분은 큰 화분(deco_planter) 계열에 꽃 색을 달리하고, 황금 감귤나무는 감귤나무 빌보드에 금빛 열매."""
from __future__ import annotations
from px import Canvas, hexc
from iso import IsoCanvas
from sprites_iso_objects import cv, billboard, tree2d
from iso_parts import LEAF, YELLOW, PINK, ORANGE, CLAY

GOLD = (hexc('b8860b'), hexc('e6b422'), hexc('fff2a0'))


def _plant(size: int, pot, blooms, extra: int) -> IsoCanvas:
    c = cv(30, shadow=0.36)
    c.box(10 + extra, pot, (0.28, 0.28, 0.72, 0.72))
    sx, sy = c.spx(0.5, 0.5, 10 + extra)
    dk, md, lt = LEAF
    for dx, dy, r in ((-5, -6, 4), (5, -7, 4), (0, -12, 4.5 + extra * 0.3), (-2, -4, 3), (3, -3, 3), (-6, -10, 2.5), (6, -11, 2.5)):
        c.ellipse(sx + dx, sy + dy, r, r * 0.8, md)
    c.ellipse(sx - 4, sy - 12, 3, 2.2, lt); c.ellipse(sx + 2, sy - 15, 2, 1.6, lt)
    c.put(sx + 6, sy - 4, dk); c.put(sx + 4, sy - 9, dk); c.put(sx - 6, sy - 3, dk)
    for i, (dx, dy) in enumerate(((-5, -9), (5, -10), (0, -16), (-2, -6), (4, -5))[:size]):
        col = blooms[i % len(blooms)]
        c.put(sx + dx, sy + dy, col[1]); c.put(sx + dx + 1, sy + dy, col[2]); c.put(sx + dx, sy + dy - 1, col[2]); c.put(sx + dx - 1, sy + dy, col[0])
    c.outline()
    return c


def plant_speed() -> IsoCanvas:
    return _plant(3, CLAY, [YELLOW], 0)


def plant_speed_large() -> IsoCanvas:
    return _plant(5, (hexc('5a5a62'), hexc('7a7a82'), hexc('a8a8b0')), [YELLOW, PINK], 3)


def plant_speed_season() -> IsoCanvas:
    return _plant(5, (hexc('7a4a2a'), hexc('a06a3a'), hexc('d0a070')), [PINK, ORANGE, YELLOW], 3)


def golden_tangerine_tree() -> IsoCanvas:
    s = tree2d('ready')
    # 잎 가장자리와 열매를 금빛으로
    for y in range(s.h):
        for x in range(s.w):
            p = s.get(x, y)
            if p[3] == 0:
                continue
            if p == ORANGE[1] or p == ORANGE[0] or p == ORANGE[2]:
                s.put(x, y, GOLD[1] if p == ORANGE[1] else GOLD[0] if p == ORANGE[0] else GOLD[2])
            elif p == LEAF[2]:
                s.put(x, y, hexc('d8e890'))
    for x, y in ((6, 9), (26, 12), (16, 4)):
        s.put(x, y, GOLD[2])
    return billboard(s, 0.42)


def sprites() -> dict[str, Canvas]:
    s = {'plant_speed': plant_speed(), 'plant_speed_large': plant_speed_large(), 'plant_speed_season': plant_speed_season(), 'golden_tangerine_tree': golden_tangerine_tree()}
    return {f'iso_obj_{k}': v for k, v in s.items()}
