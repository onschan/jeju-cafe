"""카페 등급 5단계 「5년 뒤 우리 카페」 미리보기 일러스트 (fun-rank, 재미 리셋 스펙 §5).

인트로 컷(sprites_intro.py)과 같은 문법: 160×90에 그려 ×2로 저장(320×180). 배경·건물·인물 도우미를 sprites_intro에서 그대로 쓴다.
1 올레길 노점: 길가 파라솔 매대 하나 · 2 동네 카페: 창고를 고친 작은 카페 · 3 소문난 카페: 감귤 간판·사진 찍는 손님
4 제주 명소: 2층 건물·알전구·버스 · 5 전설의 카페: 밤, 네온 간판, 손님 가득.

출력: public/assets/grade/grade1.png … grade5.png, tools/assets/out/grade_contact.png(검토용). GradeWindow.tsx가 <img>로 읽는다."""
from __future__ import annotations
import os
from px import Canvas, PAL, hexc, Color
from sprites_chars import compose_character, HAIR_RGB, TOP_RGB
from sprites_bg import Rng
from sprites_intro import (W, H, INK, PAPER_LT, YEL_MD, YEL_LT, PINK, RED, GRASS_DK, GRASS_LT, GRASS_MD, SKY_LT, NIGHT, NIGHT_LT, OR_MD, OR_DK, LEAF_MD, LEAF_LT,
                           NEW_WALL, NEW_WALL_DK, TRIM, CLOUD, CLOUD_DK, OREUM, OREUM_NEAR, SILHOUETTE, SEA_MID, SEA_LT, FOAM, SAND,
                           outdoors, warehouse, stonewall, tangerine_tree, hero, halmang, samchun, chibi_at, sparkle, outline_rect, text, scaled, silhouette, wave_arm,
                           G_JE, G_JU, G_KA, G_PE)

BUS = hexc('4a90d9'); BUS_DK = hexc('2f6fb5'); NEON = hexc('ff7ad9'); NEON_LT = hexc('ffd3f2'); CYAN = hexc('7af0ff')
WOOD_DK, WOOD_MD, WOOD_LT = PAL['wood']


def guest(hair: str, top: str, direction: str, accs: tuple[str, ...] = (), frame: int = 1) -> Canvas:
    return compose_character(1, 2, HAIR_RGB[hair], TOP_RGB[top], accs, direction, frame)


def table_set(c: Canvas, x: int, base: int, parasol: bool = False, col: Color = WOOD_MD) -> None:
    """야외 테이블(+파라솔)."""
    outline_rect(c, x, base - 8, 14, 4, col, INK); c.rect(x + 2, base - 4, 2, 4, WOOD_DK); c.rect(x + 10, base - 4, 2, 4, WOOD_DK)
    if parasol:
        c.rect(x + 6, base - 24, 2, 16, WOOD_DK)
        for i in range(6):
            span = 4 + i * 2
            c.hline(x + 7 - span, x + 7 + span, base - 30 + i, (RED, PAPER_LT)[(i // 2) % 2])
        c.hline(x - 7, x + 21, base - 24, INK)


def flower_bed(c: Canvas, x: int, y: int, n: int = 5) -> None:
    for i in range(n):
        c.put(x + i * 3, y, (RED, YEL_MD, PINK)[i % 3]); c.put(x + i * 3, y + 1, LEAF_MD); c.put(x + i * 3 + 1, y + 1, LEAF_MD)


def string_lights(c: Canvas, x0: int, x1: int, y: int, sag: int = 3) -> None:
    n = x1 - x0
    for i in range(n + 1):
        t = i / n
        yy = int(y + sag * 4 * t * (1 - t))
        c.put(x0 + i, yy, INK)
        if i % 6 == 3:
            c.put(x0 + i, yy + 1, (YEL_LT, PINK, SKY_LT, YEL_MD)[(i // 6) % 4]); c.put(x0 + i, yy + 2, YEL_MD)


def bus(c: Canvas, x: int, base: int) -> None:
    outline_rect(c, x, base - 20, 44, 18, BUS, INK); c.rect(x + 2, base - 18, 40, 7, SKY_LT); c.hline(x + 2, x + 41, base - 18, FOAM)
    for vx in range(x + 10, x + 40, 10):
        c.vline(vx, base - 18, base - 12, INK)
    c.rect(x + 2, base - 9, 40, 2, BUS_DK)
    for wx in (x + 8, x + 36):
        c.circle(wx, base - 2, 3.5, INK); c.circle(wx, base - 2, 2.2, hexc('2a2a2e')); c.put(wx, base - 2, hexc('c8c8c8'))
    c.put(x + 43, base - 8, YEL_MD)


def road_sign(c: Canvas, x: int, base: int) -> None:
    """올레길 나무 팻말."""
    c.rect(x + 4, base - 12, 2, 12, WOOD_DK)
    outline_rect(c, x, base - 20, 14, 9, WOOD_MD, INK); c.hline(x + 2, x + 10, base - 17, INK); c.hline(x + 2, x + 8, base - 15, INK)
    c.put(x + 1, base - 19, WOOD_LT)


def second_floor(c: Canvas, x: int, base: int) -> None:
    """창고(x, base) 위에 얹는 2층 띠 + 지붕. warehouse()의 지붕(base−30−14) 자리에 2층 벽을 덮고 그 위에 다시 지붕."""
    w, h2 = 70, 16
    top = base - 30 - 14
    c.rect(x, top - 2, w, h2 + 2, NEW_WALL); c.vline(x, top - 2, top + h2 - 1, INK); c.vline(x + w - 1, top - 2, top + h2 - 1, INK)
    c.hline(x, x + w - 1, top + h2 - 1, TRIM); c.hline(x, x + w - 1, top + h2, INK)
    for wx in (x + 8, x + 29, x + 50):
        outline_rect(c, wx, top + 2, 12, 9, SKY_LT, INK); c.vline(wx + 6, top + 2, top + 10, INK); c.rect(wx + 1, top + 3, 4, 7, PINK)
    rh = 12
    for i in range(rh):
        span = int((w + 8) * (i + 1) / rh / 2)
        c.hline(x + w // 2 - span, x + w // 2 + span, top - 2 - rh + i, PAL['orange'][2] if i % 4 == 0 else PAL['orange'][1])
        c.put(x + w // 2 - span, top - 2 - rh + i, INK); c.put(x + w // 2 + span, top - 2 - rh + i, INK)
    c.hline(x - 4, x + w + 3, top - 2, PAL['orange'][0]); c.hline(x - 4, x + w + 3, top - 3, PAL['orange'][0])
    c.hline(x + w // 2 - 1, x + w // 2 + 1, top - 2 - rh, INK)


def night_sky(c: Canvas) -> None:
    c.rect(0, 0, W, 52, NIGHT)
    rng = Rng(77)
    for _ in range(40):
        x, y = rng.between(0, W - 1), rng.between(0, 34)
        c.put(x, y, PAPER_LT if rng.next() < 0.3 else hexc('aab4d8'))
    c.circle(132, 14, 6, YEL_LT); c.circle(129, 12, 5, NIGHT)
    for x in range(W):
        import math
        t = x / W * math.tau
        top = int(40 - 7 * math.sin(t * 1.3 + 0.7) - 4 * math.sin(t * 3.1))
        c.vline(x, top, 52, hexc('1e2b3c'))
    c.rect(0, 52, W, 38, hexc('27412e'))
    for _ in range(60):
        x, y = rng.between(0, W - 1), rng.between(58, H - 1)
        c.put(x, y, hexc('1d3324') if rng.next() < 0.6 else hexc('3a5a3e'))


# ---------------------------------------------------------------- 1. 올레길 노점
def grade1() -> Canvas:
    c = Canvas(W, H)
    outdoors(c, dawn=False)
    # 길: 마당을 가로지르는 흙길
    c.rect(0, 70, W, 8, PAL['soil'][1]); c.hline(0, W - 1, 70, PAL['soil'][0]); c.hline(0, W - 1, 77, PAL['soil'][0])
    stonewall(c, 0, 60, 62); stonewall(c, 120, 160, 62)
    tangerine_tree(c, 24, 60, 7)
    road_sign(c, 132, 68)
    # 매대: 파라솔 테이블 하나 + 나무 상자
    table_set(c, 72, 68, parasol=True)
    outline_rect(c, 56, 62, 10, 6, WOOD_MD, INK); c.put(58, 61, OR_MD); c.put(61, 61, OR_MD); c.put(63, 60, OR_DK)
    chibi_at(c, hero('down', accs=('apron',)), 100, 84)
    guest1 = guest('brown', 'sky', 'left', ('camera',))
    chibi_at(c, guest1, 40, 86)
    sparkle(c, 66, 40, PAPER_LT)
    return c


# ---------------------------------------------------------------- 2. 동네 카페
def grade2() -> Canvas:
    c = Canvas(W, H)
    outdoors(c, dawn=False)
    warehouse(c, 50, 74, renovated=True)
    stonewall(c, 0, 44, 66); stonewall(c, 126, 160, 66)
    tangerine_tree(c, 18, 66, 7)
    table_set(c, 8, 82); table_set(c, 132, 82)
    flower_bed(c, 56, 76); flower_bed(c, 96, 76, 4)
    chibi_at(c, hero('down', accs=('apron',)), 86, 88)
    chibi_at(c, halmang('right'), 24, 88)
    chibi_at(c, guest('black', 'yellow', 'left'), 142, 86)
    return c


# ---------------------------------------------------------------- 3. 소문난 카페
def grade3() -> Canvas:
    c = Canvas(W, H)
    outdoors(c, dawn=True)
    warehouse(c, 48, 72, renovated=True, sign_on=True)
    stonewall(c, 0, 40, 64); stonewall(c, 128, 160, 64)
    tangerine_tree(c, 16, 62, 8); tangerine_tree(c, 146, 64, 6)
    table_set(c, 4, 82, parasol=True); table_set(c, 128, 84, parasol=True)
    flower_bed(c, 54, 74, 6); flower_bed(c, 92, 74, 6)
    # 사진 찍는 손님들
    chibi_at(c, guest('brown', 'sky', 'down', ('camera',)), 34, 88)
    chibi_at(c, guest('blonde', 'pink', 'down'), 62, 90)
    chibi_at(c, guest('black', 'white', 'down', ('strawhat',)), 112, 88)
    chibi_at(c, wave_arm(hero('down', accs=('apron',))), 88, 90)
    for gx, gy in ((28, 60), (44, 66), (118, 62)):
        sparkle(c, gx, gy, PAPER_LT)
    return c


# ---------------------------------------------------------------- 4. 제주 명소
def grade4() -> Canvas:
    c = Canvas(W, H)
    outdoors(c, dawn=False)
    warehouse(c, 46, 74, renovated=True, sign_on=True)
    second_floor(c, 46, 74)
    # 2층 벽 위 큰 간판(알전구) — 1층 간판은 2층에 가려진다
    sx, sy, sw, sh = 59, 36, 44, 13
    outline_rect(c, sx, sy, sw, sh, YEL_MD, INK); c.hline(sx + 1, sx + sw - 2, sy + 1, YEL_LT)
    text(c, [G_JE, G_JU, G_KA, G_PE], sx + 4, sy + 2, INK)
    for bx in range(sx + 2, sx + sw - 1, 6):
        c.put(bx, sy - 1, YEL_LT); c.put(bx - 1, sy - 1, YEL_MD); c.put(bx + 1, sy - 1, YEL_MD); c.put(bx, sy - 2, YEL_MD)
    string_lights(c, 6, 46, 44); string_lights(c, 116, 156, 44)
    c.vline(6, 44, 78, WOOD_DK); c.vline(156, 44, 78, WOOD_DK)
    stonewall(c, 0, 30, 66)
    tangerine_tree(c, 14, 64, 7)
    table_set(c, 2, 84, parasol=True); table_set(c, 130, 86, parasol=True)
    bus(c, 114, 82)
    chibi_at(c, hero('down', accs=('apron',)), 84, 90)
    chibi_at(c, samchun('right'), 28, 88)
    chibi_at(c, guest('brown', 'sky', 'left', ('camera',)), 60, 90)
    chibi_at(c, guest('blonde', 'pink', 'left'), 104, 88)
    sparkle(c, 40, 34, PAPER_LT); sparkle(c, 126, 36, PAPER_LT)
    return c


# ---------------------------------------------------------------- 5. 전설의 카페
def grade5() -> Canvas:
    c = Canvas(W, H)
    night_sky(c)
    warehouse(c, 46, 74, renovated=True, sign_on=True)
    second_floor(c, 46, 74)
    # 창 불빛
    for (wx, wy) in ((55, 52), (61, 52), (97, 52), (103, 52)):
        c.rect(wx, wy, 4, 8, YEL_LT)
    for wx in (55, 76, 97):
        c.rect(wx, 32, 4, 7, YEL_LT); c.rect(wx + 6, 32, 4, 7, YEL_LT)
    # 네온 간판(창고 간판 위에 덧씌움)
    sx, sy, sw, sh = 59, 36, 44, 13
    outline_rect(c, sx, sy, sw, sh, hexc('1c1c2c'), INK)
    c.hline(sx + 2, sx + sw - 3, sy + 2, NEON); c.hline(sx + 2, sx + sw - 3, sy + sh - 3, NEON); c.vline(sx + 2, sy + 2, sy + sh - 3, NEON); c.vline(sx + sw - 3, sy + 2, sy + sh - 3, NEON)
    text(c, [G_JE, G_JU, G_KA, G_PE], sx + 5, sy + 3, CYAN)
    for x in range(sx - 4, sx + sw + 4):
        c.blend(x, sy - 1, (NEON[0], NEON[1], NEON[2], 60)); c.blend(x, sy - 2, (NEON[0], NEON[1], NEON[2], 30))
    string_lights(c, 4, 46, 42); string_lights(c, 116, 158, 42)
    c.vline(4, 42, 78, WOOD_DK); c.vline(158, 42, 78, WOOD_DK)
    table_set(c, 2, 84, parasol=True); table_set(c, 128, 86, parasol=True)
    # 손님 가득 (앞줄 실루엣 없이 정면)
    chibi_at(c, hero('down', accs=('apron',)), 84, 92)
    chibi_at(c, guest('brown', 'sky', 'down', ('camera',)), 22, 90)
    chibi_at(c, guest('blonde', 'pink', 'down'), 48, 92)
    chibi_at(c, guest('black', 'white', 'down', ('strawhat',)), 112, 90)
    chibi_at(c, guest('red', 'yellow', 'down'), 140, 92)
    chibi_at(c, wave_arm(halmang('down')), 66, 90)
    for gx, gy in ((30, 30), (130, 28), (80, 22), (20, 56), (140, 58)):
        sparkle(c, gx, gy, YEL_LT)
    return c


def cuts() -> dict[str, Canvas]:
    return {'grade1': grade1(), 'grade2': grade2(), 'grade3': grade3(), 'grade4': grade4(), 'grade5': grade5()}


def build(out_dir: str, review_dir: str) -> int:
    os.makedirs(out_dir, exist_ok=True); os.makedirs(review_dir, exist_ok=True)
    cs = cuts()
    for name, cv in cs.items():
        cv.save(os.path.join(out_dir, f'{name}.png'), scale=2)
    cols = 2
    names = list(cs)
    rows = (len(names) + cols - 1) // cols
    sheet = Canvas((W + 4) * cols + 4, (H + 4) * rows + 4)
    sheet.rect(0, 0, sheet.w, sheet.h, hexc('3b3b3b'))
    for i, n in enumerate(names):
        sheet.blit(cs[n], 4 + (i % cols) * (W + 4), 4 + (i // cols) * (H + 4))
    scaled(sheet, 2).save(os.path.join(review_dir, 'grade_contact.png'))
    return len(cs)


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, '..', '..'))
    n = build(os.path.join(root, 'public', 'assets', 'grade'), os.path.join(here, 'out'))
    print(f'{n} grade cuts')
