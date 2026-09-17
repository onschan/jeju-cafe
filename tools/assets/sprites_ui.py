"""UI 스프라이트: 말풍선 24×20, 이펙트(코인·반짝 16×16, 링 32×32, 컵 8×8, 부탁 ! 8×10), 16×16 아이콘 18개.
얇은 1px 디테일(파동·X·글리프)은 outline() 뒤에 얹어 외곽선에 먹히지 않게 한다."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color

CLEAR = (0, 0, 0, 0)
WHITE, SKY, BASALT, WOOD, YELLOW = PAL['white'], PAL['sky'], PAL['basalt'], PAL['wood'], PAL['yellow']
RED, PINK, LEAF, ORANGE, SOIL = PAL['red'], PAL['pink'], PAL['leaf'], PAL['orange'], PAL['soil']


def round_rect(c: Canvas, x: int, y: int, w: int, h: int, col: Color) -> None:
    c.rect(x, y, w, h, col)
    for cx, cy in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
        c.put(cx, cy, CLEAR)


def glyph(c: Canvas, x: int, y: int, rows: list[str], col: Color) -> None:
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch == 'X':
                c.put(x + dx, y + dy, col)


# ---------------------------------------------------------------- 말풍선
def bubble(face: str) -> Canvas:
    c = Canvas(24, 20)
    wdk, wmd, wlt = WHITE
    round_rect(c, 0, 0, 24, 16, wmd)
    c.hline(1, 22, 14, wdk); c.vline(22, 1, 14, wdk)
    c.hline(1, 22, 1, wlt); c.vline(1, 1, 13, wlt)
    # 꼬리(왼쪽 아래)
    c.rect(4, 16, 5, 1, wmd); c.rect(4, 17, 4, 1, wmd); c.rect(4, 18, 3, 1, wmd); c.rect(4, 19, 2, 1, wmd)
    c.outline()
    # 표정 12×10 영역: x 6~17, y 3~12
    if face in ('happy', 'meh', 'angry'):
        c.rect(7, 5, 2, 2, OUT); c.rect(15, 5, 2, 2, OUT)
    if face == 'happy':
        c.put(9, 9, OUT); c.hline(10, 13, 10, OUT); c.put(14, 9, OUT)
        c.put(6, 8, PINK[1]); c.put(17, 8, PINK[1])
    elif face == 'meh':
        c.hline(9, 14, 10, OUT)
    elif face == 'angry':
        c.put(6, 3, OUT); c.put(7, 4, OUT); c.put(17, 3, OUT); c.put(16, 4, OUT)     # 눈썹
        c.put(9, 11, OUT); c.hline(10, 13, 10, OUT); c.put(14, 11, OUT)              # 아래로 굽은 입
        c.put(6, 8, RED[1]); c.put(17, 8, RED[1])
    elif face == 'question':
        glyph(c, 8, 3, ['.XXXX.', 'XX..XX', 'XX..XX', '....XX', '...XX.', '..XX..', '..XX..',
                        '......', '..XX..', '..XX..'], SKY[0])
    elif face == 'wait':
        for x in (7, 11, 15):
            c.rect(x, 7, 2, 2, BASALT[1]); c.put(x, 7, BASALT[2])
    return c


# ---------------------------------------------------------------- 이펙트
def coin(frame: int) -> Canvas:
    c = Canvas(16, 16)
    rx = (7, 4.5, 2, 4.5)[frame]
    light = (-0.45, -0.55) if frame != 3 else (0.45, -0.55)
    c.shade_ellipse(7.5, 7.5, rx, 7, YELLOW, light=light)
    if frame == 0:
        c.rect(7, 4, 2, 7, YELLOW[0]); c.hline(6, 9, 4, YELLOW[0]); c.hline(6, 9, 10, YELLOW[0])
    elif frame in (1, 3):
        c.vline(7, 5, 10, YELLOW[0]); c.hline(6, 8, 5, YELLOW[0]); c.hline(6, 8, 10, YELLOW[0])
    c.outline()
    return c


def sparkle(frame: int) -> Canvas:
    """4각 별. 1px 십자에 외곽선을 두르면 뭉개져서 외곽선 없이 노란 심으로 대비를 준다."""
    c = Canvas(16, 16)
    size = (4, 8, 6, 3)[frame]
    half = size // 2
    for i in range(1, half + 1):
        col = WHITE[2] if i < half else YELLOW[2]
        c.put(7 + i, 7, col); c.put(7 - i, 7, col); c.put(7, 7 + i, col); c.put(7, 7 - i, col)
    if size >= 6:
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            c.put(7 + dx, 7 + dy, YELLOW[2])
    c.put(7, 7, YELLOW[1])
    return c


def ready_ring() -> Canvas:
    c = Canvas(32, 32)
    cx = cy = 15.5
    for y in range(32):
        for x in range(32):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if 11 <= d < 15.5:
                c.put(x, y, OUT if d >= 14.5 or d < 12 else YELLOW[1] if d >= 13.2 else YELLOW[2])
    return c


def cup() -> Canvas:
    """앉은 손님 손에 드는 커피 컵 8×8: 흰 컵 + 갈색 커피 + 손잡이 + 김 1px."""
    c = Canvas(8, 8)
    wdk, wmd, wlt = WHITE
    c.rect(0, 2, 6, 6, wmd)             # 몸통 (외곽선이 가장자리를 먹으므로 한 칸 크게)
    c.outline()
    c.hline(1, 4, 3, WOOD[1])           # 커피 표면
    c.put(1, 6, wdk); c.put(4, 6, wdk)  # 바닥 그늘
    c.put(6, 3, OUT); c.put(7, 4, OUT); c.put(7, 5, OUT); c.put(6, 6, OUT)  # 손잡이
    c.put(2, 0, wlt); c.put(3, 1, wlt)  # 김
    return c


def alert() -> Canvas:
    """부탁을 들고 온 손님 머리 위 "!" 8×10 (빨강, 흰 테두리)."""
    c = Canvas(8, 10)
    rdk, rmd, rlt = RED
    c.rect(3, 1, 2, 5, rmd)
    c.rect(3, 7, 2, 2, rmd)
    c.put(3, 1, rlt); c.put(3, 7, rlt)
    c.put(4, 5, rdk); c.put(4, 8, rdk)
    # 흰 테두리: 빨간 픽셀의 빈 4방향 이웃을 흰색으로 (outline()은 안쪽을 깎으므로 바깥에 두른다)
    solid = [(x, y) for y in range(c.h) for x in range(c.w) if c.px[y][x][3] == 255]
    for x, y in solid:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if 0 <= x + dx < c.w and 0 <= y + dy < c.h and c.px[y + dy][x + dx][3] < 255:
                c.put(x + dx, y + dy, WHITE[2])
    return c


# ---------------------------------------------------------------- 아이콘 16×16
def icon(name: str) -> Canvas:
    c = Canvas(16, 16)
    bdk, bmd, blt = BASALT
    wdk, wmd, wlt = WHITE
    post: list = []   # outline 뒤에 얹을 (x, y, color)

    if name == 'money':
        c.shade_ellipse(8, 10, 6, 4.5, YELLOW)
        c.rect(5, 3, 6, 3, YELLOW[1]); c.hline(5, 10, 3, YELLOW[2])
        c.rect(4, 2, 2, 2, YELLOW[1]); c.rect(10, 2, 2, 2, YELLOW[1])
        c.hline(4, 11, 5, WOOD[0]); c.put(3, 6, WOOD[0]); c.put(12, 6, WOOD[0])
        post = [(7, 9, YELLOW[0]), (7, 10, YELLOW[0]), (7, 11, YELLOW[0]), (8, 9, YELLOW[0]), (8, 11, YELLOW[0])]
    elif name == 'research':
        c.rect(5, 1, 6, 2, blt)
        c.rect(6, 2, 4, 6, SKY[2])
        c.ellipse(8, 11, 5.5, 4, SKY[2])
        c.ellipse(8, 12, 4.5, 2.6, SKY[1]); c.hline(5, 11, 14, SKY[0])
        c.vline(6, 3, 8, wlt)
        post = [(7, 11, wlt), (9, 9, wlt), (10, 12, wlt), (9, 13, SKY[2])]
    elif name == 'local':
        c.rect(1, 9, 14, 3, YELLOW[1]); c.hline(2, 13, 9, YELLOW[2]); c.hline(1, 14, 11, YELLOW[0])
        c.rect(4, 3, 8, 6, YELLOW[1]); c.hline(5, 10, 3, YELLOW[2]); c.vline(4, 4, 8, YELLOW[2])
        c.put(4, 3, CLEAR); c.put(11, 3, CLEAR)
        c.hline(4, 11, 8, YELLOW[0])
    elif name == 'tourist':
        c.rect(2, 5, 12, 8, bmd); c.hline(3, 12, 5, blt); c.vline(2, 6, 11, blt)
        c.hline(3, 13, 12, bdk); c.vline(13, 6, 12, bdk)
        c.rect(4, 3, 4, 2, bdk); c.rect(11, 4, 2, 1, YELLOW[1])
        c.circle(8.5, 8.5, 2.6, SKY[2]); c.circle(8.5, 8.5, 1.4, SKY[0])
        post = [(7, 7, wlt), (8, 8, SKY[2])]
    elif name == 'speed_pause':
        c.rect(3, 3, 4, 10, wmd); c.rect(9, 3, 4, 10, wmd)
        c.vline(4, 4, 11, wlt); c.vline(10, 4, 11, wlt)
    elif name in ('speed_1', 'speed_2', 'speed_3'):
        n = int(name[-1])
        w = (9, 6, 4)[n - 1]; h = (11, 9, 7)[n - 1]
        x0 = (3, 2, 1)[n - 1]
        for k in range(n):
            bx = x0 + k * (w + 1)
            for i in range(w):
                hh = max(1, round(h / 2 * (1 - i / w)))
                c.vline(bx + i, 8 - hh, 8 + hh - 1, wmd)
            c.vline(bx, 8 - h // 2, 8 + h // 2 - 1, wlt)
    elif name == 'build':
        c.rect(4, 2, 9, 4, bmd); c.hline(5, 12, 2, blt); c.hline(5, 12, 5, bdk); c.rect(4, 2, 2, 4, bdk)
        c.rect(7, 6, 3, 8, WOOD[1]); c.vline(7, 6, 13, WOOD[2]); c.vline(9, 6, 13, WOOD[0])
    elif name == 'menu':
        round_rect(c, 3, 2, 10, 13, wmd); c.hline(4, 11, 3, wlt); c.vline(12, 3, 13, wdk); c.hline(4, 11, 14, wdk)
        c.rect(6, 1, 4, 3, bdk); c.hline(7, 8, 1, blt)
        post = [(x, y, bmd) for y in (6, 9, 12) for x in range(5, 11)]
    elif name == 'look':
        c.ellipse(8, 8, 7, 4.2, wmd)
        c.circle(8, 8, 2.6, SKY[0]); c.circle(8, 8, 1.2, OUT)
        c.hline(3, 5, 6, wlt)
        post = [(7, 7, wlt)]
    elif name == 'harvest':
        for y in range(5, 14):
            hw = max(0, 3 - (y - 5) // 3)
            c.hline(8 - hw, 8 + hw - (1 if hw else 0), y, ORANGE[1])
        c.vline(6, 5, 8, ORANGE[2]); c.vline(9, 6, 11, ORANGE[0])
        c.rect(7, 2, 2, 3, LEAF[1]); c.rect(4, 1, 3, 3, LEAF[1]); c.rect(9, 1, 3, 3, LEAF[1])
        c.put(5, 1, LEAF[2]); c.put(7, 2, LEAF[2]); c.put(11, 3, LEAF[0])
    elif name == 'plant':
        c.vline(8, 7, 13, LEAF[0]); c.put(7, 8, LEAF[0])
        c.ellipse(4.5, 6.5, 3.4, 2.4, LEAF[1]); c.ellipse(11.5, 5, 3.4, 2.4, LEAF[1])
        c.put(3, 5, LEAF[2]); c.put(4, 5, LEAF[2]); c.put(10, 3, LEAF[2]); c.put(11, 3, LEAF[2])
        c.ellipse(8, 13.5, 5, 1.6, SOIL[1]); c.hline(4, 11, 14, SOIL[0])
    elif name == 'remove':
        c.rect(4, 5, 8, 9, bmd); c.vline(5, 6, 12, blt); c.vline(10, 6, 12, bdk); c.hline(5, 10, 13, bdk)
        c.rect(3, 3, 10, 2, bmd); c.hline(4, 11, 3, blt)
        c.rect(6, 1, 4, 2, bdk)
        post = [(7, y, bdk) for y in range(7, 12)] + [(8, y, blt) for y in range(7, 12)]
    elif name == 'unlock':
        c.rect(3, 8, 10, 7, YELLOW[1]); c.hline(4, 11, 8, YELLOW[2]); c.vline(3, 9, 13, YELLOW[2])
        c.hline(4, 12, 14, YELLOW[0]); c.vline(12, 9, 13, YELLOW[0])
        c.rect(5, 1, 8, 2, blt); c.rect(5, 3, 2, 2, blt); c.rect(11, 3, 2, 5, blt)   # 열린 고리(왼쪽 들림)
        c.put(5, 1, CLEAR); c.put(12, 1, CLEAR)
        post = [(7, 10, bdk), (8, 10, bdk), (7, 11, bdk), (8, 11, bdk), (7, 12, bdk)]
    elif name == 'calendar':
        c.rect(2, 3, 12, 12, wmd); c.vline(13, 6, 13, wdk); c.hline(3, 12, 14, wdk)
        c.rect(2, 3, 12, 3, RED[1]); c.hline(3, 12, 3, RED[2])
        c.rect(4, 1, 2, 3, bdk); c.rect(10, 1, 2, 3, bdk)
        post = [(x, y, blt) for y in (8, 11) for x in (4, 5, 7, 8, 10, 11)] + [(7, 8, RED[1]), (8, 8, RED[1])]
    elif name in ('sound_on', 'sound_off'):
        c.rect(1, 6, 3, 4, bmd); c.put(1, 6, blt)
        for i in range(5):
            c.vline(4 + i, 6 - i, 9 + i, wmd)
        c.vline(5, 5, 10, wlt)
        if name == 'sound_on':
            post = [(11, 5, wmd), (12, 6, wmd), (12, 7, wmd), (12, 8, wmd), (12, 9, wmd), (11, 10, wmd),
                    (13, 3, SKY[1]), (14, 4, SKY[1]), (14, 5, SKY[1]), (14, 6, SKY[1]), (14, 7, SKY[1]),
                    (14, 8, SKY[1]), (14, 9, SKY[1]), (14, 10, SKY[1]), (14, 11, SKY[1]), (13, 12, SKY[1])]
        else:
            post = [(10 + i, 5 + i, RED[1]) for i in range(5)] + [(14 - i, 5 + i, RED[1]) for i in range(5)]
    else:
        raise KeyError(name)

    c.outline()
    for x, y, col in post:
        c.put(x, y, col)
    return c


# ---------------------------------------------------------------- 장면 창 배경 160×90 (로비: 회벽 + 카운터 + 창문)
def scene_lobby() -> Canvas:
    c = Canvas(160, 90)
    wdk, wmd, wlt = WOOD
    bdk, bmd, blt = BASALT
    plaster, plaster2 = hexc('f5f1e8'), hexc('ece5d4')
    # 회벽 (아주 옅은 디더) + 걸레받이
    c.dither(0, 0, 160, 66, plaster, plaster2)
    c.hline(0, 159, 0, hexc('d8d0bd'))
    c.rect(0, 62, 160, 4, wmd); c.hline(0, 159, 62, wlt); c.hline(0, 159, 65, wdk)
    # 마루: 널빤지 (12px마다 이음선, 줄마다 어긋나게)
    c.rect(0, 66, 160, 24, wmd)
    for y in range(66, 90, 6):
        c.hline(0, 159, y, wdk)
        off = 6 if (y // 6) % 2 else 0
        for x in range(off, 160, 12):
            c.vline(x, y + 1, y + 5, wdk)
        c.hline(0, 159, y + 1, wlt)
    # 창문 (왼쪽): 나무 틀, 하늘 + 구름, 십자 살
    wx, wy, ww, wh = 14, 10, 44, 34
    c.rect(wx - 3, wy - 3, ww + 6, wh + 6, wdk)
    c.rect(wx - 2, wy - 2, ww + 4, wh + 4, wmd)
    c.rect(wx, wy, ww, wh, SKY[2])
    c.rect(wx, wy + wh - 8, ww, 8, PAL['grass'][1]); c.hline(wx, wx + ww - 1, wy + wh - 8, PAL['grass'][2])
    c.ellipse(wx + 14, wy + 10, 7, 3.5, WHITE[2]); c.ellipse(wx + 20, wy + 9, 5, 3, WHITE[2])
    c.ellipse(wx + 33, wy + 16, 5, 2.5, WHITE[2])
    c.rect(wx + ww // 2 - 1, wy, 2, wh, wmd); c.rect(wx, wy + wh // 2 - 1, ww, 2, wmd)
    c.rect(wx - 3, wy + wh + 3, ww + 6, 2, wdk)  # 창턱
    # 선반 + 병 3개
    c.rect(66, 22, 30, 2, wmd); c.hline(66, 95, 22, wlt)
    for i, col in enumerate((ORANGE[1], LEAF[1], YELLOW[1])):
        jx = 69 + i * 10
        c.rect(jx, 14, 6, 8, col); c.rect(jx + 1, 12, 4, 2, bdk); c.put(jx + 1, 15, WHITE[2])
    # 메뉴 칠판 (오른쪽 위)
    c.rect(104, 6, 48, 26, wmd); c.rect(106, 8, 44, 22, bdk)
    for i, (x0, x1) in enumerate(((110, 128), (110, 136), (110, 124), (110, 132))):
        y = 11 + i * 5
        c.hline(x0, x1, y, WHITE[1]); c.hline(140, 146, y, YELLOW[1])
    # 카운터 (오른쪽): 윗면 밝게, 앞면 세로 널빤지, 밑단 어둡게
    cx, cy, cw, ch = 92, 46, 68, 30
    c.rect(cx, cy, cw, ch, wmd)
    c.rect(cx, cy, cw, 4, wlt); c.hline(cx, cx + cw - 1, cy + 4, wdk)
    for x in range(cx + 8, cx + cw, 10):
        c.vline(x, cy + 6, cy + ch - 3, wdk)
    c.rect(cx, cy + ch - 2, cw, 2, wdk)
    c.vline(cx, cy, cy + ch - 1, wdk)
    # 카운터 위: 커피 머신(회색 상자) + 컵 2개 + 화분
    c.rect(130, 32, 18, 14, bmd); c.rect(131, 33, 16, 3, blt); c.rect(134, 38, 6, 4, bdk); c.put(146, 34, RED[1])
    for x in (100, 110):
        c.rect(x, 40, 6, 5, WHITE[1]); c.hline(x, x + 5, 40, WHITE[2]); c.put(x + 6, 42, WHITE[1])
    c.rect(118, 38, 8, 6, PAL['soil'][1]); c.ellipse(122, 36, 4, 3, LEAF[1]); c.put(120, 34, LEAF[2])
    # 벽 액자
    c.rect(66, 34, 20, 14, wdk); c.rect(68, 36, 16, 10, SKY[1]); c.ellipse(76, 44, 6, 3, LEAF[0]); c.rect(72, 38, 3, 3, ORANGE[1])
    return c


ICONS = ('money', 'research', 'local', 'tourist', 'speed_pause', 'speed_1', 'speed_2', 'speed_3', 'build',
         'menu', 'look', 'harvest', 'plant', 'remove', 'unlock', 'calendar', 'sound_on', 'sound_off')


def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    for face in ('happy', 'meh', 'angry', 'question', 'wait'):
        s[f'bubble_{face}'] = bubble(face)
    for i in range(4):
        s[f'fx_coin_{i}'] = coin(i)
        s[f'fx_sparkle_{i}'] = sparkle(i)
    s['fx_ready_ring'] = ready_ring()
    s['fx_cup'] = cup()
    s['fx_alert'] = alert()
    for n in ICONS:
        s[f'icon_{n}'] = icon(n)
    s['scene_lobby'] = scene_lobby()
    return s
