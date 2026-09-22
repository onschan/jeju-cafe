"""프롤로그 컷신 일러스트 6장 (서울 야근 → 사직서 → 비행기 → 제주 폐창고 → 카페 개업).

160×90 바탕에 그려 ×2로 저장한다(320×180, 화면엔 640×360 = 4배). 픽셀 격자를 한 가지로 맞추려고
배경도 인물도 같은 해상도에서 그린다 — 인물은 sprites_chars의 치비(32×48)를 그대로 써서 게임 안 얼굴(점 눈·홍조)과 같다.
글자(사직서·제주 카페)는 8×9 한글 ART 글리프.

출력: public/assets/intro/cut1.png … cut6.png, cut6_on.png(간판 불 켜진 프레임), tools/assets/out/intro_contact.png(검토용).
시트에는 넣지 않는다(320×180 7장이면 시트가 크게 늘어난다). IntroScreen.tsx가 <img>로 읽는다."""
from __future__ import annotations
import math, os
from px import Canvas, PAL, OUT, hexc, Color, CLEAR
from sprites_chars import compose_character, HAIR_RGB, TOP_RGB, HEAD_Y
from sprites_bg import Rng, round_tree

W, H = 160, 90

# ---------------------------------------------------------------- 팔레트 (컷마다 16색 안에서)
INK = hexc('2b2118')
NIGHT = hexc('141a33'); NIGHT_LT = hexc('22263a'); WALL_NIGHT = hexc('3a3f52'); WALL_NIGHT_LT = hexc('4a5068')
FLUOR = hexc('f2f6ff'); SCREEN = hexc('cfe8ff'); SCREEN_DK = hexc('6fa8dc')
DESK_DK, DESK_MD, DESK_LT = PAL['wood']
PAPER = PAL['white'][1]; PAPER_DK = PAL['white'][0]; PAPER_LT = PAL['white'][2]
GREY_DK, GREY_MD, GREY_LT = PAL['road']
STEEL = hexc('b9bec9'); STEEL_DK = hexc('7d8493')
SUBWAY_WALL = hexc('d8d5cc'); SUBWAY_WALL_DK = hexc('bdb9ad'); SUBWAY_FLOOR = hexc('8f8c84'); TUNNEL = hexc('1c1c24')
CREAM = hexc('efe6d0'); CREAM_DK = hexc('d9ccb0'); SUN = hexc('fff0b3'); SUN_LT = hexc('fff8d6')
CABIN = hexc('e4e6ea'); CABIN_DK = hexc('c3c7cf'); SEAT = hexc('2f3d63'); SEAT_LT = hexc('4a5a86')
SKY_DK, SKY_MD, SKY_LT = PAL['sky']; CLOUD = hexc('ffffff'); CLOUD_DK = hexc('dfe9f3')
SEA_DEEP = hexc('2a5f9e'); SEA_MID = hexc('3b7fc4'); SEA_LT = hexc('6fb0e6'); FOAM = hexc('e8f4ff'); SAND = hexc('e6d5a3')
LEAF_DK, LEAF_MD, LEAF_LT = PAL['leaf']; GRASS_DK, GRASS_MD, GRASS_LT = PAL['grass']
OR_DK, OR_MD, OR_LT = PAL['orange']; BAS_DK, BAS_MD, BAS_LT = PAL['basalt']
OREUM = hexc('5b7f7a'); OREUM_NEAR = hexc('466b57')
OLD_WALL = hexc('8d8272'); OLD_WALL_DK = hexc('6e655a'); OLD_WALL_LT = hexc('a89d8b'); RUST = hexc('7a3b2a'); RUST_LT = hexc('a54a35')
NEW_WALL = hexc('fff8ec'); NEW_WALL_DK = hexc('e6dfcf'); TRIM = PAL['wood'][1]
TRUCK = hexc('4a90d9'); TRUCK_DK = hexc('2f6fb5'); TIRE = hexc('2a2a2e')
YEL_DK, YEL_MD, YEL_LT = PAL['yellow']; RED = PAL['red'][1]; PINK = PAL['pink'][1]
DAWN_TOP = hexc('8ec1f0'); DAWN_MID = hexc('ffd3a6'); DAWN_LT = hexc('fff0b3')
SILHOUETTE = hexc('2f3d63')


# ---------------------------------------------------------------- 도우미
def scaled(c: Canvas, k: int) -> Canvas:
    out = Canvas(c.w * k, c.h * k)
    for y in range(out.h):
        row = c.px[y // k]
        out.px[y] = [row[x // k] for x in range(out.w)]
    return out


def alpha(c: Canvas, a: int) -> Canvas:
    """불투명 픽셀을 반투명으로 (유리창 반사용)."""
    out = Canvas(c.w, c.h)
    for y in range(c.h):
        for x in range(c.w):
            r, g, b, aa = c.px[y][x]
            if aa:
                out.px[y][x] = (r, g, b, min(aa, a))
    return out


def silhouette(c: Canvas, col: Color) -> Canvas:
    out = Canvas(c.w, c.h)
    for y in range(c.h):
        for x in range(c.w):
            if c.px[y][x][3] == 255:
                out.px[y][x] = col
    return out


def no_shadow(c: Canvas) -> Canvas:
    """치비 발밑 반투명 그림자를 뗀다(앉은 자세·창 반사)."""
    out = c.copy()
    for y in range(c.h):
        for x in range(c.w):
            if 0 < out.px[y][x][3] < 255:
                out.px[y][x] = CLEAR
    return out


def crop(c: Canvas, x: int, y: int, w: int, h: int) -> Canvas:
    out = Canvas(w, h)
    for yy in range(h):
        for xx in range(w):
            out.px[yy][xx] = c.get(x + xx, y + yy)
    return out


def dither_rect(c: Canvas, x: int, y: int, w: int, h: int, a: Color, b: Color) -> None:
    c.dither(x, y, w, h, a, b)


def vgrad(c: Canvas, x: int, y: int, w: int, h: int, stops: list[Color]) -> None:
    """세로 그라데이션: 띠 + 경계 디더."""
    n = len(stops)
    band = h / n
    for yy in range(h):
        i = int(yy / band)
        a = stops[min(n - 1, i)]
        b = stops[min(n - 1, i + 1)]
        frac = yy / band - i
        for xx in range(w):
            c.put(x + xx, y + yy, b if frac > 0.75 and (xx + yy) % 2 == 0 else a)


def glyph_rows(rows: list[str], col: Color) -> Canvas:
    return Canvas.from_art(rows, {'#': col})


def text(c: Canvas, glyphs: list[list[str]], x: int, y: int, col: Color, k: int = 1, gap: int = 1) -> None:
    for g in glyphs:
        gc = scaled(glyph_rows(g, col), k)
        c.blit(gc, x, y)
        x += gc.w + gap * k


# 한글 8×9 글리프 (사직서 / 제주 카페)
G_SA = [
'......#.', '......#.', '..#...#.', '..#...#.', '.#.#..##', '.#.#..#.', '#...#.#.', '......#.', '......#.']
G_JIK = [
'####..#.', '..#...#.', '..#...#.', '.#.#..#.', '#..#..#.', '........', '.####...', '....#...', '....#...']
G_SEO = [
'......#.', '......#.', '..#...#.', '..#...#.', '.#.#.##.', '.#.#..#.', '#...#.#.', '......#.', '......#.']
G_JE = [   # 9폭: ㅔ의 짧은 획은 첫 세로획 왼쪽에(ㅐ와 구분)
'......#.#', '......#.#', '####..#.#', '..#...#.#', '..#..##.#', '.#.#..#.#', '#..#..#.#', '......#.#', '......#.#']
G_JU = [
'.#####..', '...#....', '...#....', '..#.#...', '.#...#..', '........', '#######.', '...#....', '...#....']
G_KA = [
'......#.', '####..#.', '...#..#.', '####..##', '...#..#.', '...#..#.', '......#.', '......#.', '......#.']
G_PE = [
'......#.#', '......#.#', '####..#.#', '.#.#..#.#', '.#.#.##.#', '.#.#..#.#', '####..#.#', '......#.#', '......#.#']

# 인물 (게임 초상·파츠와 같은 조합)
def hero(direction: str, frame: int = 1, accs: tuple[str, ...] = ()) -> Canvas:
    return compose_character(0, 1, HAIR_RGB['black'], TOP_RGB['white'], accs, direction, frame)


def halmang(direction: str) -> Canvas:
    return compose_character(0, 4, hexc('f0f0f0'), TOP_RGB['purple'], (), direction, 1)


def samchun(direction: str) -> Canvas:
    return compose_character(2, 5, HAIR_RGB['grey'], TOP_RGB['orange'], ('strawhat',), direction, 1)


def tired(c: Canvas, direction: str) -> Canvas:
    """눈 밑 그늘 1줄 (피곤)."""
    out = c.copy()
    bag = hexc('c98a58')
    ys = HEAD_Y + 7 + 2
    xs = [(11, 12), (19, 20)] if direction == 'down' else [(12, 13)] if direction == 'left' else [(18, 19)]
    for x0, x1 in xs:
        out.hline(x0, x1, ys, bag)
    return out


def tie(c: Canvas) -> Canvas:
    """정면 흰 셔츠에 빨간 넥타이."""
    out = c.copy()
    out.vline(15, 30, 33, RED); out.put(16, 30, RED); out.put(15, 34, PAL['red'][0])
    return out


def glow_face(c: Canvas, tint: Color, side: str = 'right') -> Canvas:
    """모니터 빛: 얼굴 피부 절반을 푸르스름하게."""
    out = c.copy()
    skins = {PAL['skin'][0], PAL['skin'][1], PAL['skin'][2]}
    for y in range(HEAD_Y, HEAD_Y + 14):
        for x in range(c.w):
            p = out.px[y][x]
            if p in skins and ((x >= 16) if side == 'right' else (x < 16)):
                out.px[y][x] = (int((p[0] + tint[0]) / 2), int((p[1] + tint[1]) / 2), int((p[2] + tint[2]) / 2), 255)
    return out


def wave_arm(c: Canvas) -> Canvas:
    """정면 치비 오른팔을 번쩍 (손 흔들기)."""
    out = c.copy()
    sk = (hexc('84512c'), hexc('a86f45'), hexc('c98f63'))     # 삼춘 피부
    out.rect(23, 27, 2, 3, OR_MD); out.vline(24, 27, 29, OR_DK)          # 소매
    out.rect(23, 24, 3, 3, sk[1]); out.put(25, 26, sk[0])                # 손
    for (x, y) in ((22, 24), (22, 25), (22, 26), (23, 23), (24, 23), (25, 23), (26, 24), (26, 25), (26, 26), (25, 27), (22, 27), (22, 28), (22, 29), (25, 28), (25, 29)):
        out.put(x, y, OUT)
    return out


def sparkle(c: Canvas, x: int, y: int, col: Color = YEL_LT) -> None:
    c.put(x, y, col); c.put(x - 1, y, col); c.put(x + 1, y, col); c.put(x, y - 1, col); c.put(x, y + 1, col)


def outline_rect(c: Canvas, x: int, y: int, w: int, h: int, fill: Color, line: Color = INK) -> None:
    c.rect(x, y, w, h, fill)
    c.hline(x, x + w - 1, y, line); c.hline(x, x + w - 1, y + h - 1, line)
    c.vline(x, y, y + h - 1, line); c.vline(x + w - 1, y, y + h - 1, line)


def chibi_at(c: Canvas, ch: Canvas, foot_x: int, foot_y: int) -> None:
    """치비를 발 중심(15.5, 42)이 (foot_x, foot_y)에 오게."""
    c.blit(ch, foot_x - 16, foot_y - 42)


# ---------------------------------------------------------------- 1. 밤 11시 사무실
def cut1() -> Canvas:
    c = Canvas(W, H)
    c.rect(0, 0, W, H, WALL_NIGHT)
    # 형광등 + 아래로 번지는 빛
    c.rect(48, 4, 64, 3, FLUOR); c.hline(48, 111, 6, STEEL); c.hline(47, 112, 3, INK); c.hline(47, 112, 7, INK)
    c.vline(47, 3, 7, INK); c.vline(112, 3, 7, INK)
    c.dither(40, 8, 80, 8, WALL_NIGHT_LT, WALL_NIGHT); c.rect(48, 8, 64, 2, WALL_NIGHT_LT)
    # 창밖 도시 야경
    outline_rect(c, 108, 12, 46, 44, NIGHT, STEEL_DK)
    rng = Rng(101)
    bx = 110
    while bx < 152:
        bw, bh = rng.between(4, 9), rng.between(10, 34)
        c.rect(bx, 55 - bh, bw, bh, NIGHT_LT)
        for yy in range(55 - bh + 2, 54, 3):
            for xx in range(bx + 1, bx + bw - 1, 2):
                if rng.next() < 0.55:
                    c.put(xx, yy, YEL_MD if rng.next() < 0.7 else SCREEN)
        bx += bw + 1
    c.vline(131, 12, 55, STEEL_DK); c.hline(108, 153, 34, STEEL_DK)
    c.put(118, 18, PAPER_LT); c.put(140, 16, PAPER_LT)   # 별 2개
    # 벽시계 23:00
    c.circle(22, 24, 9, INK); c.circle(22, 24, 8, PAPER)
    for (x, y) in ((22, 17), (22, 31), (15, 24), (29, 24)):
        c.put(x, y, INK)
    c.vline(22, 18, 24, INK)                              # 분침 12
    c.put(21, 23, INK); c.put(20, 22, INK); c.put(19, 21, INK)   # 시침 11
    c.put(22, 24, RED)
    # 캐비닛
    outline_rect(c, 4, 44, 22, 46, GREY_DK, INK); c.rect(6, 46, 18, 8, GREY_MD); c.rect(6, 56, 18, 8, GREY_MD); c.rect(6, 66, 18, 8, GREY_MD)
    for yy in (49, 59, 69):
        c.hline(13, 16, yy, INK)
    # 의자 등받이 + 주인공 (정면, 넥타이, 피곤, 모니터 빛)
    outline_rect(c, 60, 34, 26, 30, GREY_DK, INK); c.rect(62, 36, 22, 26, GREY_MD)
    h = glow_face(tired(tie(hero('down')), 'down'), SCREEN, 'right')
    chibi_at(c, no_shadow(h), 70, 65)
    # 책상 (인물 다리를 가린다)
    c.rect(30, 62, 120, 4, DESK_LT); c.rect(30, 66, 120, 6, DESK_MD); c.hline(30, 149, 61, INK); c.hline(30, 149, 71, INK)
    c.vline(30, 61, 71, INK); c.vline(149, 61, 71, INK)
    c.rect(34, 72, 6, 18, DESK_DK); c.rect(140, 72, 6, 18, DESK_DK)
    c.rect(30, 72, 120, 6, DESK_DK)                      # 서랍 면
    c.rect(96, 73, 50, 4, DESK_MD); c.hline(118, 123, 75, INK)
    # 노트북: 뚜껑이 우리 쪽, 화면 빛이 뒤로 새어 나온다
    c.dither(84, 42, 34, 20, SCREEN_DK, WALL_NIGHT_LT)
    outline_rect(c, 90, 44, 26, 18, GREY_DK, INK); c.rect(92, 46, 22, 14, GREY_MD); c.put(102, 52, SCREEN)
    c.rect(88, 61, 30, 2, GREY_LT); c.hline(87, 118, 63, INK)
    # 서류 더미 2개
    for i in range(7):
        outline_rect(c, 132 - (i % 2), 58 - i * 2, 16, 4, PAPER_DK if i % 2 else PAPER, INK)
    outline_rect(c, 131, 42, 16, 3, PAPER_LT, INK); c.hline(134, 144, 43, GREY_LT)
    for i in range(4):
        outline_rect(c, 34 + (i % 2), 58 - i * 2, 16, 4, PAPER if i % 2 else PAPER_DK, INK)
    # 머그컵 + 김
    outline_rect(c, 122, 54, 7, 7, PAPER, INK); c.rect(123, 55, 5, 2, DESK_DK); c.put(129, 56, INK); c.put(129, 57, INK); c.put(130, 56, INK)
    c.put(124, 51, GREY_LT); c.put(126, 50, GREY_LT); c.put(125, 52, GREY_LT)
    # 땀방울
    c.put(84, 44, SCREEN); c.put(84, 45, SEA_LT); c.put(83, 45, SEA_LT)
    return c


# ---------------------------------------------------------------- 2. 만원 지하철
def cut2() -> Canvas:
    c = Canvas(W, H)
    c.rect(0, 0, W, H, SUBWAY_WALL)
    c.rect(0, 0, W, 12, SUBWAY_WALL_DK); c.hline(0, W - 1, 12, INK)
    # 광고판(글자 없이 색면)
    for i, col in enumerate((PINK, SKY_MD, YEL_MD, LEAF_MD, OR_MD)):
        outline_rect(c, 4 + i * 32, 2, 26, 8, col, INK); c.rect(6 + i * 32, 4, 12, 2, PAPER_LT)
    # 창: 터널 + 지나가는 불빛
    for wx in (6, 62, 118):
        outline_rect(c, wx, 20, 40, 32, TUNNEL, STEEL_DK)
        c.hline(wx + 1, wx + 38, 21, STEEL); c.vline(wx + 1, 21, 50, STEEL)
        for k, yy in enumerate((28, 36, 44)):
            c.hline(wx + 4 + k * 9, wx + 14 + k * 9, yy, GREY_DK); c.hline(wx + 22 + k * 5, wx + 30 + k * 5, yy + 3, GREY_DK)
        c.put(wx + 8 + (wx // 30), 26, YEL_MD); c.put(wx + 30 - (wx // 40), 40, YEL_MD)
    # 손잡이 봉과 고리
    c.hline(0, W - 1, 15, STEEL); c.hline(0, W - 1, 16, STEEL_DK)
    for gx in range(12, W, 24):
        c.vline(gx, 17, 22, INK); c.circle(gx, 26, 3, INK); c.circle(gx, 26, 2, PAPER); c.put(gx, 26, PAPER_DK)
    # 바닥
    c.rect(0, 74, W, 16, SUBWAY_FLOOR); c.hline(0, W - 1, 74, INK); c.dither(0, 84, W, 6, SUBWAY_FLOOR, GREY_DK)
    # 사람들 (뒤 → 앞): 주인공은 가운데, 양옆은 살짝 앞에 서서 겹친다
    rng = Rng(202)
    crowd = [
        (14, 84, compose_character(1, 3, HAIR_RGB['brown'], TOP_RGB['sky'], ('backpack',), 'down', 1)),
        (146, 84, compose_character(0, 0, HAIR_RGB['dark'], TOP_RGB['leaf'], (), 'down', 1)),
        (44, 87, compose_character(2, 6, HAIR_RGB['black'], TOP_RGB['red'], (), 'right', 1)),
        (112, 87, compose_character(0, 2, HAIR_RGB['blonde'], TOP_RGB['yellow'], ('cap',), 'left', 1)),
    ]
    for fx, fy, ch in crowd[:2]:
        chibi_at(c, ch, fx, fy)
    me = tired(tie(hero('down')), 'down')
    # 폰: 가슴 앞 두 손 사이, 화면은 제주 바다 사진
    me.rect(13, 32, 6, 8, INK); me.rect(14, 33, 4, 6, SEA_MID); me.hline(14, 17, 34, SKY_LT); me.hline(14, 17, 35, SEA_LT); me.put(15, 36, FOAM); me.put(16, 33, YEL_MD)
    me.rect(12, 37, 2, 2, PAL['skin'][1]); me.rect(18, 37, 2, 2, PAL['skin'][1])
    chibi_at(c, me, 80, 90)
    # 창에 비친 피곤한 얼굴 (머리만, 반투명)
    head = alpha(crop(no_shadow(me), 6, 14, 20, 16), 90)
    c.blit(head, 72, 27)
    for fx, fy, ch in crowd[2:]:
        chibi_at(c, ch, fx, fy)
    # 앞줄: 어깨·뒤통수만 보이는 사람 (화면 아래를 가려 눌린 느낌)
    for x0, col in ((52, PAL['basalt'][1]), (104, hexc('6b3f1d'))):
        c.ellipse(x0 + 9, 92, 9, 9, col); c.ellipse(x0 + 9, 92, 9, 9, INK); c.ellipse(x0 + 9, 93, 8, 8, col)
    # 눌림 표시: 주인공 머리 옆 땀 + 「!」
    c.put(92, 48, SEA_LT); c.put(93, 49, SEA_LT); c.put(92, 50, SCREEN)
    return c


# ---------------------------------------------------------------- 3. 사직서
def cut3() -> Canvas:
    c = Canvas(W, H)
    c.rect(0, 0, W, H, CREAM)
    # 창 + 아침 햇살
    outline_rect(c, 8, 6, 52, 46, SKY_LT, STEEL_DK)
    vgrad(c, 9, 7, 50, 44, [SUN_LT, SUN, SKY_LT, SKY_MD])
    for yy in range(9, 50, 4):
        c.hline(9, 58, yy, CREAM_DK)                   # 블라인드
    c.vline(34, 7, 50, STEEL_DK)
    for x0 in range(4, 100, 7):                       # 바닥에 빛줄기 디더
        c.dither(x0, 70, 3, 20, SUN_LT, CREAM)
    # 화분
    outline_rect(c, 132, 62, 14, 12, PAL['soil'][1], INK); c.rect(134, 64, 10, 2, PAL['soil'][2])
    round_tree(c, 139, 63, 9, LEAF_DK, LEAF_MD); c.ellipse(139, 54, 9, 8, INK); c.ellipse(139, 54, 8, 7, LEAF_MD); c.ellipse(136, 51, 3, 2, LEAF_LT)
    # 팀장: 책상 뒤에 앉음 (파마 갈색 머리, 안경, 남색 상의)
    boss = compose_character(1, 3, HAIR_RGB['dark'], hexc('2f3d63'), ('glasses',), 'down', 1)
    outline_rect(c, 124, 24, 28, 30, GREY_DK, INK); c.rect(126, 26, 24, 26, GREY_MD)
    chibi_at(c, no_shadow(boss), 138, 66)
    # 팀장 책상 (넓은 진갈색)
    c.rect(66, 54, 88, 4, DESK_LT); c.rect(66, 58, 88, 8, DESK_MD); c.hline(66, 153, 53, INK); c.hline(66, 153, 65, INK)
    c.vline(66, 53, 65, INK); c.vline(153, 53, 65, INK)
    c.rect(66, 66, 88, 12, DESK_DK); c.rect(70, 68, 80, 8, DESK_MD); c.hline(106, 113, 72, INK)
    c.rect(68, 78, 6, 12, DESK_DK); c.rect(146, 78, 6, 12, DESK_DK)
    # 흰 봉투 「사직서」
    outline_rect(c, 72, 44, 40, 14, PAPER_LT, INK)
    c.hline(73, 110, 45, PAPER); c.hline(73, 110, 56, PAPER_DK)
    text(c, [G_SA, G_JIK, G_SEO], 79, 47, INK)
    c.put(75, 50, RED); c.put(108, 50, RED)
    # 명패·펜꽂이
    outline_rect(c, 114, 47, 16, 6, DESK_DK, INK); c.rect(117, 49, 10, 2, YEL_MD)
    outline_rect(c, 66, 44, 8, 10, GREY_DK, INK); c.vline(69, 41, 45, RED); c.vline(71, 40, 45, SKY_MD)
    # 주인공 뒷모습, 떨리는 손 표시
    me = hero('up')
    chibi_at(c, me, 40, 88)
    for (x, y) in ((28, 74), (27, 76), (29, 78), (53, 74), (54, 76), (52, 78)):
        c.put(x, y, GREY_DK)
    c.hline(30, 31, 70, GREY_DK); c.hline(50, 51, 70, GREY_DK)
    # 땀방울
    c.put(50, 50, SEA_LT); c.put(50, 51, SCREEN); c.put(51, 51, SEA_LT)
    return c


# ---------------------------------------------------------------- 4. 비행기 창
def cut4() -> Canvas:
    c = Canvas(W, H)
    c.rect(0, 0, W, H, CABIN)
    c.dither(0, 0, W, 6, CABIN_DK, CABIN); c.hline(0, W - 1, 6, CABIN_DK)
    # 창: 둥근 사각 이중 프레임
    cx, cy, rx, ry = 104, 44, 34, 34
    c.ellipse(cx, cy, rx + 4, ry + 4, CABIN_DK); c.ellipse(cx, cy, rx + 3, ry + 3, INK); c.ellipse(cx, cy, rx + 2, ry + 2, GREY_LT)
    c.ellipse(cx, cy, rx, ry, INK)
    view = Canvas(W, H)
    view.ellipse(cx, cy, rx - 1, ry - 1, SKY_LT)
    # 창 속: 하늘 → 구름 → 바다·해안선·한라산·감귤밭
    for y in range(cy - ry, cy + ry):
        for x in range(cx - rx, cx + rx):
            if view.get(x, y)[3] == 0:
                continue
            if y < 24:
                col = SKY_MD if y < 16 else SKY_LT
            elif y < 40:
                col = SEA_DEEP if y < 30 else SEA_MID
            elif y < 43:
                col = FOAM if y == 40 else SAND
            else:
                col = GRASS_MD
            view.put(x, y, col)
    # 해안선 굴곡: 모래띠를 파도 모양으로
    rng = Rng(404)
    for x in range(cx - rx, cx + rx):
        d = rng.between(-1, 1) if x % 5 == 0 else 0
        for y in (39, 40, 41, 42):
            if view.get(x, y)[3]:
                view.put(x, y + d, FOAM if y == 40 else SAND if y > 40 else SEA_LT)
    # 한라산: 완만한 삼각, 정상 평평, 위쪽은 짙은 초록
    for i in range(14):
        hw = 6 + i * 3
        yy = 46 + i
        view.hline(cx - hw, cx + hw, yy, OREUM if i < 4 else GRASS_DK if i < 9 else GRASS_MD)
    view.hline(cx - 5, cx + 5, 46, hexc('7f9a8f'))
    # 감귤밭: 주황 점 격자 + 돌담 선
    for yy in range(58, 76, 3):
        for xx in range(cx - 30 + (yy % 6) // 3, cx + 30, 4):
            if view.get(xx, yy)[3] and view.get(xx, yy) in (GRASS_MD, GRASS_DK):
                view.put(xx, yy, OR_MD)
    for xx in range(cx - 28, cx + 28, 12):
        for yy in range(60, 76):
            if view.get(xx, yy)[3] and view.get(xx, yy) != OR_MD:
                view.put(xx, yy, BAS_MD)
    # 구름
    for (ex, ey, r) in ((80, 20, 8), (94, 17, 6), (118, 26, 9), (130, 22, 5), (108, 12, 5)):
        view.ellipse(ex, ey, r, r * 0.55, CLOUD_DK); view.ellipse(ex - 1, ey - 1, r - 1, r * 0.5, CLOUD)
    # 파도 반짝
    for (x, y) in ((84, 33), (98, 28), (112, 36), (124, 31)):
        view.hline(x, x + 2, y, SEA_LT)
    # 창 안에만
    mask = Canvas(W, H); mask.ellipse(cx, cy, rx - 1, ry - 1, INK)
    for y in range(H):
        for x in range(W):
            if mask.get(x, y)[3] == 0:
                view.px[y][x] = CLEAR
    c.blit(view, 0, 0)
    # 날개 끝 (창 아래 오른쪽)
    for i in range(6):
        c.hline(118 + i * 3, 137, 62 + i, GREY_LT if i < 5 else GREY_DK)
    c.hline(118, 137, 61, INK)
    # 좌석 + 주인공 (창을 보는 옆모습, 창 유리에 반사)
    outline_rect(c, 20, 30, 40, 60, SEAT, INK); c.rect(22, 32, 36, 4, SEAT_LT); c.rect(22, 40, 36, 20, SEAT_LT)
    me = hero('right')
    chibi_at(c, no_shadow(me), 52, 80)
    c.rect(24, 76, 34, 14, SEAT); c.hline(24, 57, 76, INK)     # 무릎 앞 좌석 등받이
    refl = alpha(crop(no_shadow(hero('right')), 6, 14, 20, 16), 70)
    c.blit(refl, 76, 38)
    # 창가 팔걸이
    c.rect(60, 70, 14, 4, SEAT_LT); c.hline(60, 73, 69, INK); c.hline(60, 73, 74, INK)
    return c


# ---------------------------------------------------------------- 5·6 공용: 돌담·감귤나무·오름 배경
def outdoors(c: Canvas, dawn: bool) -> None:
    if dawn:
        vgrad(c, 0, 0, W, 46, [DAWN_TOP, SKY_LT, DAWN_MID, DAWN_LT])
        c.circle(128, 34, 6, YEL_LT); c.circle(128, 34, 5, SUN_LT)
        # 아침 바다
        c.rect(0, 40, W, 14, SEA_MID); c.hline(0, W - 1, 40, FOAM); c.hline(0, W - 1, 41, SEA_LT)
        for x in range(0, W, 9):
            c.hline(x + (x // 9) % 4, x + 3, 45 + (x // 9) % 3 * 3, SEA_LT)
        c.hline(120, 136, 47, YEL_LT); c.hline(122, 134, 50, YEL_LT)
        c.rect(0, 54, W, 3, SAND); c.hline(0, W - 1, 54, FOAM)
        c.rect(0, 57, W, 33, GRASS_MD)
    else:
        c.rect(0, 0, W, 50, SKY_LT)
        for (ex, ey, r) in ((30, 12, 9), (42, 10, 6), (120, 16, 7), (132, 14, 5)):
            c.ellipse(ex, ey, r, r * 0.5, CLOUD_DK); c.ellipse(ex - 1, ey - 1, r - 1, r * 0.45, CLOUD)
        for x in range(W):
            t = x / W * math.tau
            top = int(40 - 7 * math.sin(t * 1.3 + 0.7) - 4 * math.sin(t * 3.1))
            c.vline(x, top, 50, OREUM)
            top2 = int(48 - 5 * math.sin(t * 2.1 + 2.0))
            c.vline(x, top2, 52, OREUM_NEAR)
        c.rect(0, 52, W, 38, GRASS_MD)
    rng = Rng(505)
    for _ in range(90):
        x, y = rng.between(0, W - 1), rng.between(58, H - 1)
        c.put(x, y, GRASS_DK if rng.next() < 0.6 else GRASS_LT)


def stonewall(c: Canvas, x0: int, x1: int, y: int) -> None:
    """제주 돌담: 검은 현무암 둥근 돌 2줄."""
    rng = Rng(x0 + y)
    for row in range(2):
        x = x0 + (row * 3)
        while x < x1:
            w = rng.between(4, 6)
            yy = y - row * 4
            c.ellipse(x + w / 2, yy, w / 2, 2.2, INK); c.ellipse(x + w / 2, yy, w / 2 - 0.6, 1.6, BAS_MD if rng.next() < 0.6 else BAS_DK)
            c.put(x + w // 2 - 1, yy - 1, BAS_LT)
            x += w + 1


def tangerine_tree(c: Canvas, x: int, base: int, r: int) -> None:
    c.rect(x - 1, base - 3, 3, 4, PAL['wood'][0])
    c.ellipse(x, base - r - 2, r + 1, r * 0.9 + 1, INK)
    c.ellipse(x, base - r - 2, r, r * 0.9, LEAF_MD); c.ellipse(x - r * 0.3, base - r - 2 - r * 0.3, r * 0.5, r * 0.4, LEAF_LT)
    rng = Rng(x * 7 + base)
    for _ in range(r + 2):
        ox, oy = rng.between(-r + 2, r - 2), rng.between(-r + 2, r - 3)
        c.put(x + ox, base - r - 2 + oy, OR_MD); c.put(x + ox + 1, base - r - 2 + oy, OR_DK)


def warehouse(c: Canvas, x: int, base: int, renovated: bool, sign_on: bool = False) -> None:
    """창고: x~x+70, 높이 44. renovated=False면 낡은 판자·녹슨 지붕, True면 흰 벽·나무 트림·간판."""
    w, h = 70, 30
    wall, wall_dk, wall_lt = (NEW_WALL, NEW_WALL_DK, PAPER_LT) if renovated else (OLD_WALL, OLD_WALL_DK, OLD_WALL_LT)
    c.rect(x, base - h, w, h, wall)
    c.vline(x, base - h, base - 1, wall_lt); c.vline(x + w - 1, base - h, base - 1, wall_dk)
    if not renovated:
        for yy in range(base - h + 3, base, 4):
            c.hline(x + 1, x + w - 2, yy, wall_dk)          # 판자 줄
        for (px_, py_) in ((x + 8, base - 12), (x + 9, base - 11), (x + 10, base - 9), (x + 60, base - 20), (x + 61, base - 19)):
            c.put(px_, py_, INK)                             # 금
        c.rect(x + 3, base - 6, 10, 6, GRASS_DK); c.rect(x + 56, base - 5, 12, 5, GRASS_DK)  # 잡초
    else:
        c.rect(x, base - 4, w, 4, TRIM); c.hline(x, x + w - 1, base - 4, INK)
    # 지붕: 벽보다 양옆 4px 넓고 14 위로
    rh = 14
    rdk, rmd, rlt = (PAL['orange'][0], PAL['orange'][1], PAL['orange'][2]) if renovated else (INK, RUST, RUST_LT)
    for i in range(rh):
        span = int((w + 8) * (i + 1) / rh / 2)
        c.hline(x + w // 2 - span, x + w // 2 + span, base - h - rh + i, rlt if (i % 4 == 0 and renovated) else rmd)
    c.hline(x - 4, x + w + 3, base - h, rdk if renovated else INK)
    c.hline(x - 4, x + w + 3, base - h - 1, rdk)
    for i in range(rh):                                     # 지붕 외곽선
        span = int((w + 8) * (i + 1) / rh / 2)
        c.put(x + w // 2 - span, base - h - rh + i, INK); c.put(x + w // 2 + span, base - h - rh + i, INK)
    c.hline(x + w // 2 - 1, x + w // 2 + 1, base - h - rh, INK)
    if not renovated:
        c.rect(x + 20, base - h - 6, 8, 3, INK)              # 지붕 구멍
        c.hline(x + 40, x + 52, base - h - 9, RUST_LT)
    c.vline(x, base - h, base - 1, INK); c.vline(x + w - 1, base - h, base - 1, INK)
    # 문
    dx = x + w // 2 - 6
    if renovated:
        outline_rect(c, dx, base - 18, 12, 18, TRIM, INK); c.rect(dx + 2, base - 16, 8, 8, SKY_LT); c.put(dx + 9, base - 8, YEL_MD)
        c.vline(dx + 6, base - 16, base - 9, INK); c.hline(dx + 2, dx + 9, base - 12, INK)
    else:
        outline_rect(c, dx, base - 18, 12, 18, OLD_WALL_DK, INK)
        for i in range(3):
            c.hline(dx + 1, dx + 10, base - 15 + i * 5, PAL['wood'][0])
        c.hline(dx + 1, dx + 10, base - 10, PAL['wood'][1]); c.hline(dx + 1, dx + 10, base - 9, INK)   # 못 박은 판자
    # 창 2개
    for wx in (x + 8, x + w - 20):
        if renovated:
            outline_rect(c, wx, base - 22, 12, 10, SKY_LT, INK); c.vline(wx + 6, base - 22, base - 13, INK)
            c.rect(wx + 1, base - 21, 4, 8, PINK); c.rect(wx + 7, base - 21, 4, 8, PINK)      # 커튼
            c.hline(wx - 1, wx + 12, base - 12, TRIM)
            outline_rect(c, wx + 1, base - 11, 10, 4, PAL['soil'][1], INK); c.put(wx + 3, base - 12, RED); c.put(wx + 6, base - 12, YEL_MD); c.put(wx + 9, base - 12, PINK)
        else:
            outline_rect(c, wx, base - 22, 12, 10, NIGHT_LT, INK); c.vline(wx + 6, base - 22, base - 13, INK)
            c.put(wx + 2, base - 19, GREY_LT); c.put(wx + 3, base - 18, GREY_LT); c.put(wx + 9, base - 16, GREY_LT)   # 깨진 유리
    # 간판
    if renovated:
        sx, sy, sw, sh = x + 13, base - h - 8, 44, 13
        fill = YEL_MD if sign_on else PAL['wood'][2]
        outline_rect(c, sx, sy, sw, sh, fill, INK)
        c.hline(sx + 1, sx + sw - 2, sy + 1, YEL_LT if sign_on else PAL['wood'][1])
        text(c, [G_JE, G_JU, G_KA, G_PE], sx + 4, sy + 2, INK)
        # 전구 줄
        for bx in range(sx + 2, sx + sw - 1, 6):
            c.put(bx, sy - 1, YEL_LT if sign_on else GREY_LT)
            if sign_on:
                c.put(bx - 1, sy - 1, YEL_MD); c.put(bx + 1, sy - 1, YEL_MD); c.put(bx, sy - 2, YEL_MD)
        if sign_on:
            for (gx, gy) in ((sx - 3, sy + 3), (sx + sw + 2, sy + 6), (sx + sw // 2, sy - 5), (sx + 6, sy - 4), (sx + sw - 6, sy - 4)):
                sparkle(c, gx, gy, YEL_LT)
    else:
        outline_rect(c, x + 16, base - h - 6, 30, 8, OLD_WALL_DK, INK)   # 떨어져 나간 옛 간판
        c.hline(x + 20, x + 38, base - h - 3, OLD_WALL_LT)
        c.put(x + 45, base - h - 1, INK); c.put(x + 45, base - h, INK)   # 기울어진 못


def truck(c: Canvas, x: int, base: int) -> None:
    """파란 소형 트럭 (오른쪽 향함)."""
    outline_rect(c, x, base - 12, 30, 9, TRUCK, INK); c.rect(x + 2, base - 10, 26, 2, hexc('6fb0e6'))
    outline_rect(c, x + 28, base - 18, 16, 15, TRUCK, INK); c.rect(x + 31, base - 16, 10, 6, SKY_LT); c.hline(x + 31, x + 40, base - 16, FOAM)
    c.rect(x + 29, base - 9, 14, 4, TRUCK_DK)
    c.hline(x + 44, x + 45, base - 8, YEL_MD)
    for wx in (x + 6, x + 34):
        c.circle(wx, base - 2, 3.5, INK); c.circle(wx, base - 2, 2.3, TIRE); c.put(wx, base - 2, GREY_LT)
    c.rect(x + 2, base - 15, 26, 3, PAL['wood'][1]); c.hline(x + 2, x + 27, base - 15, INK)   # 짐칸 감귤 상자
    for bx in range(x + 4, x + 26, 4):
        c.put(bx, base - 14, OR_MD)


def cut5() -> Canvas:
    c = Canvas(W, H)
    outdoors(c, dawn=False)
    warehouse(c, 60, 78, renovated=False)
    stonewall(c, 0, 52, 66); stonewall(c, 138, 160, 66)
    tangerine_tree(c, 18, 66, 8); tangerine_tree(c, 42, 68, 6)
    truck(c, 118, 84)
    # 삼춘: 트럭 옆에서 손 흔듦
    chibi_at(c, wave_arm(samchun('down')), 108, 88)
    # 할망 → 열쇠 → 주인공
    chibi_at(c, halmang('right'), 40, 88)
    chibi_at(c, hero('left'), 72, 88)
    # 열쇠 (노란, 반짝)
    key = Canvas.from_art(['.KKK....', 'KyYyKKKK', 'KyyyKyyK', '.KKK.K.K'], {'K': INK, 'y': YEL_MD, 'Y': YEL_LT})
    c.blit(key, 52, 64)
    sparkle(c, 50, 61, PAPER_LT); sparkle(c, 62, 62, PAPER_LT)
    # 풀
    for (gx, gy) in ((6, 84), (30, 86), (96, 88), (150, 86)):
        c.put(gx, gy, GRASS_DK); c.put(gx + 1, gy - 1, GRASS_LT); c.put(gx + 2, gy, GRASS_DK)
    return c


def cut6(sign_on: bool) -> Canvas:
    c = Canvas(W, H)
    outdoors(c, dawn=True)
    warehouse(c, 60, 80, renovated=True, sign_on=sign_on)
    if sign_on:
        # 창문·문 유리에 불빛 (인물보다 먼저 그린다)
        c.rect(69, 59, 4, 8, YEL_LT); c.rect(75, 59, 4, 8, YEL_LT); c.rect(111, 59, 4, 8, YEL_LT); c.rect(117, 59, 4, 8, YEL_LT)
        c.rect(91, 64, 8, 8, YEL_LT); c.vline(95, 64, 71, INK); c.hline(91, 98, 68, INK)
        # 문 옆 열린 문 팻말 (글자 없이 초록 원)
        c.circle(106, 66, 2.5, INK); c.circle(106, 66, 1.5, LEAF_LT)
    stonewall(c, 0, 50, 70); stonewall(c, 140, 160, 70)
    tangerine_tree(c, 20, 70, 8); tangerine_tree(c, 146, 72, 6)
    # 문 앞 야외 테이블·의자, 칠판 메뉴
    outline_rect(c, 118, 72, 14, 4, PAL['wood'][1], INK); c.rect(120, 76, 2, 6, PAL['wood'][0]); c.rect(128, 76, 2, 6, PAL['wood'][0])
    outline_rect(c, 40, 66, 10, 12, INK, INK); c.rect(41, 67, 8, 10, hexc('34433a')); c.hline(43, 47, 69, PAPER_LT); c.hline(43, 46, 72, PINK); c.hline(43, 47, 75, YEL_LT)
    c.vline(44, 78, 82, PAL['wood'][0]); c.vline(46, 78, 82, PAL['wood'][0])
    # 화분
    outline_rect(c, 56, 78, 6, 5, PAL['soil'][1], INK); c.put(58, 76, RED); c.put(59, 77, LEAF_MD); c.put(57, 77, LEAF_MD)
    outline_rect(c, 132, 78, 6, 5, PAL['soil'][1], INK); c.put(134, 76, YEL_MD); c.put(135, 77, LEAF_MD); c.put(133, 77, LEAF_MD)
    # 주인공: 앞치마, 정면
    chibi_at(c, hero('down', accs=('apron',)), 82, 90)
    # 첫 손님 실루엣: 왼쪽에서 걸어 들어옴
    guest = compose_character(1, 2, HAIR_RGB['brown'], TOP_RGB['sky'], ('camera',), 'right', 0)
    c.blit(silhouette(guest, SILHOUETTE), 4, 46)
    c.put(20, 44, PAPER_LT); c.put(21, 43, PAPER_LT)   # 손님 머리 위 반짝
    return c


# ---------------------------------------------------------------- 출력
def cuts() -> dict[str, Canvas]:
    return {'cut1': cut1(), 'cut2': cut2(), 'cut3': cut3(), 'cut4': cut4(), 'cut5': cut5(), 'cut6': cut6(False), 'cut6_on': cut6(True)}


def build(out_dir: str, review_dir: str) -> int:
    os.makedirs(out_dir, exist_ok=True); os.makedirs(review_dir, exist_ok=True)
    cs = cuts()
    for name, c in cs.items():
        c.save(os.path.join(out_dir, f'{name}.png'), scale=2)
    # 검토용: 6컷(+불 켜진 6컷) 2열, 2배
    cols = 2
    names = list(cs)
    rows = (len(names) + cols - 1) // cols
    sheet = Canvas((W + 4) * cols + 4, (H + 4) * rows + 4)
    sheet.rect(0, 0, sheet.w, sheet.h, hexc('3b3b3b'))
    for i, n in enumerate(names):
        sheet.blit(cs[n], 4 + (i % cols) * (W + 4), 4 + (i // cols) * (H + 4))
    scaled(sheet, 2).save(os.path.join(review_dir, 'intro_contact.png'))
    return len(cs)


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, '..', '..'))
    n = build(os.path.join(root, 'public', 'assets', 'intro'), os.path.join(here, 'out'))
    print(f'{n} intro cuts')
