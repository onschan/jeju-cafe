"""UI 스프라이트: 말풍선 24×20, 이펙트(코인·반짝 16×16, 링 32×32, 컵 8×8, 부탁 ! 8×10), 16×16 아이콘 18개 + sprites_ui_icons.ART(이모지 대체 픽셀 아이콘).
얇은 1px 디테일(파동·X·글리프)은 outline() 뒤에 얹어 외곽선에 먹히지 않게 한다."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color
import sprites_ui_icons as ART_ICONS

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
    elif name in ART_ICONS.ART:
        return icon_art(name)
    else:
        raise KeyError(name)

    c.outline()
    for x, y, col in post:
        c.put(x, y, col)
    return c


def icon_art(name: str) -> Canvas:
    """sprites_ui_icons.ART의 16×16 문자 그림을 캔버스로. 기본 outline(), POST_ALL은 테두리 없이, POST 글자는 테두리 뒤에 다시 얹는다."""
    rows = ART_ICONS.ART[name]
    c = Canvas(16, 16)
    post_chars = ART_ICONS.POST.get(name, '')
    later: list[tuple[int, int, Color]] = []
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            col = ART_ICONS.LEGEND[ch]
            c.put(x, y, col)
            if ch in post_chars:
                later.append((x, y, col))
    if name not in ART_ICONS.POST_ALL:
        c.outline()
    for x, y, col in later:
        c.put(x, y, col)
    return c


# ---------------------------------------------------------------- 보상 상자 64×64 (RewardPopup: 8프레임, 80ms)
# 0 닫힘 · 1~2 흔들(좌/우) · 3 뚜껑 살짝 · 4 활짝+빛줄기 · 5~6 반짝 파티클 · 7 활짝(정지)
CHEST_GOLD = (hexc('c98a1a'), hexc('ffd54a'), hexc('fff3b0'))
CHEST_IRON = (hexc('3b3b44'), hexc('6a6a76'), hexc('9a9aa8'))


def _chest_body(c: Canvas, dx: int = 0) -> None:
    """상자 몸통 x 8~55, y 32~58: 나무 널빤지(가로 결) + 쇠 테 2줄 + 앞면 자물쇠 판."""
    wdk, wmd, wlt = WOOD
    idk, imd, ilt = CHEST_IRON
    x0, y0, w, h = 8 + dx, 32, 48, 27
    c.rect(x0, y0, w, h, wmd)
    for y in range(y0 + 1, y0 + h - 1, 5):                       # 널빤지 결
        c.hline(x0 + 1, x0 + w - 2, y, wlt); c.hline(x0 + 1, x0 + w - 2, y + 4, wdk)
    c.rect(x0, y0 + h - 3, w, 3, wdk)                           # 밑단 그늘
    for bx in (x0 + 6, x0 + w - 10):                             # 세로 쇠 테
        c.rect(bx, y0, 4, h, imd); c.vline(bx, y0, y0 + h - 1, ilt); c.vline(bx + 3, y0, y0 + h - 1, idk)
        for ry in range(y0 + 3, y0 + h - 2, 6):
            c.put(bx + 1, ry, idk)
    c.rect(x0 + 20, y0 + 2, 8, 9, imd); c.rect(x0 + 21, y0 + 3, 6, 7, ilt)      # 자물쇠 판
    c.rect(x0 + 23, y0 + 5, 2, 3, idk); c.put(x0 + 24, y0 + 8, idk)             # 열쇠 구멍


def _chest_lid(c: Canvas, dx: int = 0, lift: int = 0) -> None:
    """닫힌 뚜껑(둥근 위) x 6~57, y 18~33. lift만큼 위로 든다."""
    wdk, wmd, wlt = WOOD
    idk, imd, ilt = CHEST_IRON
    y0 = 18 - lift
    hws = [18, 22, 24, 25, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26]
    for i, hw in enumerate(hws):
        c.hline(32 - hw + dx, 32 + hw - 1 + dx, y0 + i, wmd)
    c.hline(32 - 17 + dx, 32 + 16 + dx, y0 + 1, wlt); c.hline(32 - 21 + dx, 32 + 20 + dx, y0 + 2, wlt)
    c.hline(32 - 23 + dx, 32 + 22 + dx, y0 + 3, wlt)
    c.rect(6 + dx, y0 + 13, 52, 3, wdk)                                         # 뚜껑 밑단 그늘
    for bx in (14 + dx, 46 + dx):                                               # 쇠 테
        c.rect(bx, y0 + 1, 4, 15, imd); c.vline(bx, y0 + 2, y0 + 15, ilt); c.vline(bx + 3, y0 + 2, y0 + 15, idk)
    c.rect(28 + dx, y0 + 11, 8, 5, imd); c.rect(29 + dx, y0 + 12, 6, 3, ilt)    # 걸쇠


def _chest_open_lid(c: Canvas) -> None:
    """뒤로 젖혀진 뚜껑: 위쪽에 안쪽 면(어두운 나무)이 보인다. x 6~57, y 4~18.
    아래 변(y 18)은 _chest_inside()의 뒷벽 위 변과 맞닿는다 — 여기가 벌어지면 뚜껑이 공중에 뜬다."""
    wdk, wmd, wlt = WOOD
    idk, imd, ilt = CHEST_IRON
    c.rect(6, 4, 52, 15, wdk); c.rect(8, 6, 48, 10, hexc('4a2c14'))
    c.hline(6, 57, 4, wmd); c.hline(6, 57, 17, wmd)
    for bx in (14, 46):
        c.rect(bx, 4, 4, 15, imd); c.vline(bx, 5, 17, ilt); c.vline(bx + 3, 5, 17, idk)
    c.rect(28, 13, 8, 4, imd); c.rect(29, 14, 6, 2, ilt)


def _chest_inside(c: Canvas) -> None:
    """열린 상자의 안쪽 뒷벽·옆널 x 8~55, y 17~34.
    젖혀진 뚜껑(y 4~18)과 몸통 앞면(y 32~58)을 잇는 부분이다. 이게 없으면 뚜껑이 몸통에서 떨어져 떠 보인다."""
    wdk, wmd, wlt = WOOD
    idk, imd, ilt = CHEST_IRON
    c.rect(8, 17, 48, 17, wdk)                                   # 옆널(바깥 나무)
    c.rect(11, 17, 42, 16, hexc('3a2210'))                       # 안쪽 그늘
    c.vline(8, 17, 33, wmd); c.vline(9, 17, 33, wmd)             # 왼쪽 옆널에 드는 빛
    for bx in (14, 46):                                          # 경첩 쇠 테 — 뚜껑에서 몸통까지 한 줄로 이어진다
        c.rect(bx, 17, 4, 17, imd); c.vline(bx, 17, 33, ilt); c.vline(bx + 3, 17, 33, idk)


def _chest_glow(c: Canvas, strength: int) -> None:
    """열린 상자 속 금빛 + 위로 뻗는 빛줄기. strength 0~2."""
    gdk, gmd, glt = CHEST_GOLD
    c.rect(12, 22, 40, 11, gmd); c.rect(14, 22, 36, 5, glt)                      # 상자 속 금빛(뒷벽 위 4줄은 그늘로 남긴다 — 깊이)
    for x in range(13, 51, 6):                                                  # 금화 무더기
        c.rect(x, 29, 5, 3, gdk); c.rect(x + 1, 28, 3, 1, gmd)
    if strength <= 0:
        return
    # 빛줄기: 위로 갈수록 가늘어지는 기둥 (가운데가 길고 바깥은 짧고 비스듬)
    rays = ((12, 6, -1), (22, 1, 0), (32, 0, 0), (42, 1, 0), (52, 6, 1)) if strength == 2 else ((17, 4, -1), (32, 2, 0), (47, 4, 1))
    for rx, top, slant in rays:
        for y in range(top, 22):
            x = rx + slant * (21 - y) // 4
            w = 1 if y < top + 6 else 2 if y < 18 else 3
            c.hline(x - w // 2, x - w // 2 + w - 1, y, glt)
            if w == 3:
                c.put(x - 1, y, gmd)


def _spark(c: Canvas, x: int, y: int, size: int) -> None:
    for i in range(size + 1):
        col = WHITE[2] if i < size else YELLOW[2]
        c.put(x + i, y, col); c.put(x - i, y, col); c.put(x, y + i, col); c.put(x, y - i, col)
    c.put(x, y, YELLOW[1])


def chest(frame: int) -> Canvas:
    c = Canvas(64, 64)
    if frame <= 2:
        dx = (0, -2, 2)[frame]
        _chest_body(c, dx); _chest_lid(c, dx)
        c.outline()
        if frame:                                                               # 흔들릴 때 땀방울 같은 움직임 선
            for y in (24, 40):
                c.put(4 + dx if dx < 0 else 59 + dx, y, BASALT[2])
        return c
    if frame == 3:
        _chest_body(c)
        c.rect(8, 27, 48, 6, CHEST_GOLD[2])                                      # 틈으로 새는 빛 (몸통 폭 그대로 — 옆이 벌어지지 않게)
        _chest_lid(c, 0, 5)
        c.outline()
        c.rect(11, 29, 42, 2, CHEST_GOLD[1])
        return c
    # 열린 상자: 몸통·안쪽 뒷벽·젖혀진 뚜껑을 한 캔버스에 겹쳐 그린 뒤 **한 번만** 윤곽을 두른다.
    # (뚜껑만 따로 윤곽을 두르면 몸통과 잘린 두 덩어리로 보여 공중에 뜬다)
    _chest_inside(c)
    _chest_open_lid(c)
    _chest_body(c)
    c.outline()
    _chest_glow(c, {4: 2, 5: 1, 6: 2, 7: 0}[frame])                             # 빛줄기는 젖혀진 뚜껑 앞으로
    if frame in (5, 6):
        for (sx, sy, sz) in (((3, 14, 2), (60, 10, 1), (8, 44, 1), (57, 36, 2)) if frame == 5 else ((6, 8, 1), (58, 18, 2), (4, 38, 2), (60, 46, 1))):
            _spark(c, sx, sy, sz)
    return c


def ui_sparkle(frame: int) -> Canvas:
    """8×8 반짝 3프레임: 점 → 십자 → 4각 별."""
    c = Canvas(8, 8)
    if frame == 0:
        c.rect(3, 3, 2, 2, YELLOW[2]); c.put(3, 3, WHITE[2])
    elif frame == 1:
        c.hline(1, 6, 3, WHITE[2]); c.hline(1, 6, 4, WHITE[2]); c.vline(3, 1, 6, WHITE[2]); c.vline(4, 1, 6, WHITE[2])
        c.rect(3, 3, 2, 2, YELLOW[1])
    else:
        c.hline(0, 7, 3, YELLOW[2]); c.vline(3, 0, 7, YELLOW[2])
        c.hline(2, 4, 4, YELLOW[2]); c.vline(4, 2, 4, YELLOW[2])
        c.rect(2, 2, 3, 3, WHITE[2]); c.put(3, 3, YELLOW[1])
    return c


def ui_coin(frame: int) -> Canvas:
    """12×12 동전 4프레임(회전): 정면 → 반 → 옆 → 반(뒤집힘)."""
    c = Canvas(12, 12)
    if frame == 2:                                                              # 옆면: 3px 기둥 (outline이 먹지 않게 직접)
        c.rect(4, 1, 4, 10, YELLOW[1]); c.vline(5, 1, 10, YELLOW[2]); c.vline(4, 1, 10, OUT); c.vline(7, 1, 10, OUT)
        c.hline(4, 7, 0, OUT); c.hline(4, 7, 11, OUT)
        return c
    rx = (5.5, 3.5, 0, 3.5)[frame]
    light = (-0.45, -0.55) if frame != 3 else (0.45, -0.55)
    c.shade_ellipse(5.5, 5.5, rx, 5.5, YELLOW, light=light)
    if frame == 0:
        c.rect(5, 3, 2, 6, YELLOW[0]); c.hline(4, 7, 3, YELLOW[0]); c.hline(4, 7, 8, YELLOW[0])
    else:
        c.vline(5, 4, 8, YELLOW[0]); c.hline(4, 6, 4, YELLOW[0]); c.hline(4, 6, 8, YELLOW[0])
    c.outline()
    return c


def ui_ribbon_banner() -> Canvas:
    """240×40 리본 배너(제목 글자는 DOM). 가운데 띠 + 양 끝 제비꼬리 + 접힘. 9-slice 가능(양 끝 40px, 가운데 반복)."""
    c = Canvas(240, 40)
    rdk, rmd, rlt = RED
    ydk, ymd, ylt = YELLOW
    # 뒤쪽 꼬리 (좌우) y 12~37
    for tx, dirn in ((0, 1), (239, -1)):
        for y in range(12, 38):
            cut = abs(y - 25) // 3                                                # 제비꼬리 V
            x0 = tx + dirn * cut
            for i in range(30 - cut):
                c.put(x0 + dirn * i, y, rdk)
    # 가운데 띠 y 4~31
    c.rect(24, 4, 192, 28, rmd)
    c.hline(24, 215, 5, rlt); c.hline(24, 215, 6, rlt)
    c.rect(24, 28, 192, 4, rdk)
    c.hline(26, 213, 8, ymd); c.hline(26, 213, 27, ymd)                            # 금줄
    # 접힘(띠 양끝 아래 삼각 그늘)
    for i in range(8):
        c.vline(24 + i, 32, 32 + i, hexc('6a1414')); c.vline(215 - i, 32, 32 + i, hexc('6a1414'))
    c.outline()
    return c


def icon_home_cafe() -> Canvas:
    """24×24 카페 본관 미니 아이콘: 지붕 없는 흰 벽(제주 돌담 밑단) + 창 너머 카운터·컵 + 감귤 간판."""
    c = Canvas(24, 24)
    wdk, wmd, wlt = WHITE
    bdk, bmd, blt = BASALT
    tdk, tmd, tlt = WOOD
    c.rect(1, 7, 22, 16, wmd); c.hline(2, 21, 8, wlt); c.vline(2, 8, 21, wlt)       # 흰 벽
    c.rect(1, 5, 22, 2, bmd); c.hline(1, 22, 5, blt)                                 # 옥상 난간(평지붕)
    c.rect(1, 20, 22, 3, bmd); c.dither(2, 21, 20, 2, bdk, bmd)                      # 돌담 밑단
    c.rect(3, 10, 9, 8, SKY[2]); c.hline(3, 11, 10, WHITE[2])                        # 창
    c.rect(3, 14, 9, 4, tmd); c.hline(3, 11, 14, tlt)                                # 창 너머 카운터
    c.rect(4, 12, 2, 2, wlt); c.rect(7, 12, 2, 2, wlt); c.put(10, 12, wlt)           # 컵
    c.rect(14, 11, 6, 9, tmd); c.vline(14, 11, 19, tlt); c.hline(14, 19, 11, tlt); c.put(18, 15, YELLOW[1])   # 나무 문
    c.rect(13, 0, 9, 6, wlt); c.rect(14, 1, 7, 4, WHITE[2])                          # 간판 (흰 판)
    c.rect(16, 1, 4, 4, ORANGE[1]); c.put(16, 1, CLEAR); c.put(19, 1, CLEAR); c.put(16, 4, CLEAR); c.put(19, 4, CLEAR)   # 감귤
    c.put(17, 2, ORANGE[2]); c.put(18, 0, LEAF[1])
    c.outline()
    c.put(18, 0, LEAF[1]); c.put(17, 2, ORANGE[2])
    return c


def icon_home_cafe_big() -> Canvas:
    """48×48 본관 아이콘 (uifix): 지름 56 원형 「본관으로」 버튼 안에 들어가게 **네 귀퉁이를 비워** 그린다.
    24px짜리를 48px로 늘리면 1px 선이 2px로 뭉쳐 흐려 보이고, 원형 버튼이 네 귀퉁이(간판·벽 끝)를 잘라 먹는다."""
    c = Canvas(48, 48)
    wdk, wmd, wlt = WHITE
    bdk, bmd, blt = BASALT
    tdk, tmd, tlt = WOOD
    # 흰 벽 (x 7~40, y 13~41 — 원 안에 넉넉히 들어온다)
    c.rect(7, 13, 34, 29, wmd)
    c.rect(8, 14, 32, 3, wlt); c.rect(8, 14, 3, 26, wlt)
    # 평지붕 난간
    c.rect(6, 9, 36, 4, bmd); c.hline(6, 41, 9, blt); c.hline(6, 41, 12, bdk)
    # 돌담 밑단
    c.rect(7, 35, 34, 7, bmd); c.dither(8, 36, 32, 5, bdk, bmd)
    # 창 (왼쪽): 하늘빛 유리 + 나무 카운터 + 컵 둘
    c.rect(11, 18, 16, 15, SKY[2]); c.rect(12, 19, 14, 4, WHITE[2])
    c.rect(11, 27, 16, 6, tmd); c.hline(11, 26, 27, tlt)
    c.rect(14, 23, 4, 4, wlt); c.rect(20, 23, 4, 4, wlt)
    c.put(15, 22, WHITE[2]); c.put(21, 22, WHITE[2])
    c.vline(19, 18, 26, SKY[1])                                   # 창틀 세로
    # 나무 문 (오른쪽)
    c.rect(30, 20, 9, 15, tmd); c.vline(30, 20, 34, tlt); c.hline(30, 38, 20, tlt)
    c.rect(32, 22, 5, 5, SKY[2]); c.put(36, 29, YELLOW[1])        # 문 창·손잡이
    # 감귤 간판 (벽 위, 귀퉁이를 넘지 않게 가운데 가까이)
    c.rect(17, 4, 14, 8, wlt); c.rect(18, 5, 12, 6, WHITE[2])
    c.rect(21, 6, 6, 5, ORANGE[1]); c.put(21, 6, CLEAR); c.put(26, 6, CLEAR); c.put(21, 10, CLEAR); c.put(26, 10, CLEAR)
    c.rect(22, 7, 2, 2, ORANGE[2]); c.put(25, 4, LEAF[1]); c.put(24, 3, LEAF[1])
    c.outline()
    c.put(25, 4, LEAF[1]); c.put(24, 3, LEAF[1]); c.rect(22, 7, 2, 2, ORANGE[2])
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
         'menu', 'look', 'harvest', 'plant', 'remove', 'unlock', 'calendar', 'sound_on', 'sound_off',
         *sorted(ART_ICONS.ART))


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
    for i in range(8):
        s[f'ui_chest_{i}'] = chest(i)
    for i in range(3):
        s[f'ui_sparkle_{i}'] = ui_sparkle(i)
    for i in range(4):
        s[f'ui_coin_{i}'] = ui_coin(i)
    s['ui_ribbon_banner'] = ui_ribbon_banner()
    s['icon_home_cafe'] = icon_home_cafe()
    s['icon_home_cafe_big'] = icon_home_cafe_big()
    return s
