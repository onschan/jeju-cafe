"""캐릭터 스프라이트: 손님 2종 × 4방향 × 3프레임(32×48, 발 y=42) + 할망 초상(48×48).
SD 비율: 머리 14, 몸 14, 다리 8. right는 left의 좌우 반전."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color

Tones = tuple[Color, Color, Color]
DIRS = ('down', 'up', 'left', 'right')
CLEAR = (0, 0, 0, 0)

HEAD_X, HEAD_Y, HEAD_W, HEAD_H = 9, 6, 14, 14      # y 6~19
BODY_X, BODY_Y, BODY_W, BODY_H = 10, 20, 12, 14    # y 20~33
LEG_Y0, LEG_Y1 = 34, 41                            # 발바닥 y=41, 바닥선 y=42
LIFT = 2                                           # 들린 다리는 2px 짧게


def round_rect(c: Canvas, x: int, y: int, w: int, h: int, col: Color) -> None:
    c.rect(x, y, w, h, col)
    for cx, cy in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
        c.put(cx, cy, CLEAR)


def leg(c: Canvas, x: int, tones: Tones, lifted: bool) -> None:
    """4×8 다리. 바깥 1px은 outline이 먹으므로 안쪽 2px만 색이 보인다."""
    dk, md, lt = tones
    y1 = LEG_Y1 - (LIFT if lifted else 0)
    c.rect(x, LEG_Y0, 4, y1 - LEG_Y0 + 1, md)
    c.vline(x + 1, LEG_Y0, y1, lt)
    c.rect(x, y1 - 1, 4, 2, PAL['basalt'][0])   # 신발(위 1px 보임 + 아래 1px는 외곽선)


def arm(c: Canvas, x: int, y: int, top: Tones, skin: Tones) -> None:
    """2×8 팔: 소매 + 손 2px."""
    c.rect(x, y, 2, 6, top[0])
    c.put(x + 1, y, top[1])
    c.rect(x, y + 6, 2, 2, skin[1])


def make_char(palette: dict, direction: str, frame: int) -> Canvas:
    """palette: hair/skin/top/bottom 각 3톤(DK,MD,LT), accent Color."""
    hair: Tones = palette['hair']; skin: Tones = palette['skin']
    top: Tones = palette['top']; bottom: Tones = palette['bottom']
    c = Canvas(32, 48)
    c.shadow(15.5, 43, 8, 2.2)

    # ---- 다리 (frame 0: 왼다리 딛고 오른다리 듦, 2: 반대, 1: 정지)
    if direction in ('down', 'up'):
        lx, rx = 11, 17
        leg(c, lx, bottom, lifted=(frame == 2))
        leg(c, rx, bottom, lifted=(frame == 0))
    else:  # left (right는 반전)
        if frame == 0:
            leg(c, 10, bottom, False); leg(c, 17, bottom, True)
        elif frame == 2:
            leg(c, 16, bottom, False); leg(c, 11, bottom, True)
        else:
            leg(c, 11, bottom, False); leg(c, 16, bottom, False)

    # ---- 몸: 상의 y 20~28, 하의 y 29~33
    c.rect(BODY_X, BODY_Y, BODY_W, 9, top[1])
    c.vline(BODY_X + 1, BODY_Y, BODY_Y + 8, top[2])
    c.vline(BODY_X + BODY_W - 2, BODY_Y + 1, BODY_Y + 8, top[0])
    c.hline(BODY_X + 1, BODY_X + BODY_W - 2, BODY_Y + 8, top[0])
    c.rect(BODY_X, BODY_Y + 9, BODY_W, 5, bottom[1])
    c.vline(BODY_X + BODY_W - 2, BODY_Y + 9, BODY_Y + 13, bottom[0])

    # ---- 팔
    if direction in ('down', 'up'):
        swing = (0, 0) if frame == 1 else ((-1, 1) if frame == 0 else (1, -1))
        arm(c, 8, 21 + swing[0], top, skin)
        arm(c, 22, 21 + swing[1], top, skin)
    else:
        ax = 13 + (-2 if frame == 0 else 2 if frame == 2 else 0)
        arm(c, ax, 21, top, skin)
        c.vline(ax - 1, 21, 28, top[0]) if frame != 0 else None

    # ---- 머리 14×14 (둥근 사각)
    round_rect(c, HEAD_X, HEAD_Y, HEAD_W, HEAD_H, skin[1])
    c.hline(HEAD_X + 1, HEAD_X + HEAD_W - 2, HEAD_Y + HEAD_H - 1, skin[0])   # 턱 그늘
    c.vline(HEAD_X + HEAD_W - 2, HEAD_Y + 1, HEAD_Y + HEAD_H - 2, skin[0])
    if direction == 'up':
        round_rect(c, HEAD_X, HEAD_Y, HEAD_W, HEAD_H, hair[1])
        c.hline(HEAD_X + 1, HEAD_X + HEAD_W - 2, HEAD_Y + HEAD_H - 1, hair[0])
        c.hline(HEAD_X + 1, HEAD_X + HEAD_W - 2, HEAD_Y + HEAD_H - 2, hair[0])
        c.rect(HEAD_X + 2, HEAD_Y + 1, 4, 2, hair[2])
    elif direction == 'down':
        c.rect(HEAD_X, HEAD_Y, HEAD_W, 4, hair[1])                       # 앞머리
        c.put(HEAD_X, HEAD_Y, CLEAR); c.put(HEAD_X + HEAD_W - 1, HEAD_Y, CLEAR)
        c.rect(HEAD_X, HEAD_Y + 4, 2, 3, hair[1]); c.rect(HEAD_X + HEAD_W - 2, HEAD_Y + 4, 2, 3, hair[1])
        c.rect(HEAD_X + 2, HEAD_Y + 1, 4, 1, hair[2])
        c.hline(HEAD_X + 2, HEAD_X + HEAD_W - 3, HEAD_Y + 3, hair[0])
        c.rect(12, 12, 2, 2, OUT); c.rect(18, 12, 2, 2, OUT)            # 눈
        c.put(12, 12, hexc('4a4a52')); c.put(18, 12, hexc('4a4a52'))     # 눈 하이라이트
        c.put(11, 15, PAL['pink'][2]); c.put(20, 15, PAL['pink'][2])     # 볼
        c.hline(15, 16, 16, skin[0])                                     # 입
    else:  # left
        c.rect(HEAD_X, HEAD_Y, HEAD_W, 4, hair[1])
        c.put(HEAD_X, HEAD_Y, CLEAR); c.put(HEAD_X + HEAD_W - 1, HEAD_Y, CLEAR)
        c.rect(HEAD_X + 7, HEAD_Y + 4, 7, 10, hair[1])                   # 뒷머리
        c.vline(HEAD_X + HEAD_W - 2, HEAD_Y + 4, HEAD_Y + HEAD_H - 2, hair[0])
        c.put(HEAD_X + HEAD_W - 1, HEAD_Y + HEAD_H - 1, CLEAR)
        c.rect(HEAD_X + 2, HEAD_Y + 1, 3, 1, hair[2])
        c.hline(HEAD_X + 1, HEAD_X + 6, HEAD_Y + 3, hair[0])
        c.rect(11, 12, 2, 2, OUT); c.put(11, 12, hexc('4a4a52'))         # 눈 1개
        c.put(8, 14, skin[1]); c.put(8, 15, skin[1])                      # 코(외곽선 돌출)
        c.put(13, 15, PAL['pink'][2])                                     # 볼
    return c


# ---------------------------------------------------------------- 손님별 장식
def deco_local(c: Canvas, direction: str, frame: int) -> None:
    """밀짚모자 + 몸빼 무늬."""
    ydk, ymd, ylt = PAL['yellow']
    for x, y in ((12, 22), (18, 22), (13, 26), (19, 26)) if direction != 'left' else ((12, 22), (17, 24), (13, 27)):
        c.put(x, y, PAL['pink'][0])
    c.rect(7, 8, 18, 2, ymd); c.hline(8, 23, 8, ylt); c.hline(7, 24, 9, ydk)      # 챙
    c.rect(10, 3, 12, 5, ymd); c.hline(11, 20, 3, ylt); c.vline(10, 4, 7, ylt)     # 크라운
    c.put(10, 3, CLEAR); c.put(21, 3, CLEAR)
    c.hline(10, 21, 7, ydk)                                                       # 띠


def deco_tourist(c: Canvas, direction: str, frame: int) -> None:
    """카메라(앞) / 배낭(뒤)."""
    rdk, rmd, rlt = PAL['red']
    bdk, bmd, blt = PAL['basalt']
    if direction == 'down':
        c.rect(13, 24, 6, 4, bdk); c.hline(14, 17, 24, bmd)
        c.rect(15, 25, 2, 2, PAL['sky'][2]); c.put(16, 26, PAL['sky'][0])
        c.put(11, 23, bdk); c.put(12, 23, bdk); c.put(19, 23, bdk); c.put(20, 23, bdk)   # 끈
    elif direction == 'up':
        c.rect(12, 21, 8, 10, rmd)
        c.hline(12, 19, 21, rlt); c.vline(12, 21, 30, rlt)
        c.hline(13, 19, 30, rdk); c.vline(19, 22, 30, rdk)
        c.hline(13, 18, 25, rdk)
    else:
        c.rect(19, 22, 3, 9, rmd); c.vline(21, 22, 30, rdk); c.hline(19, 21, 22, rlt)    # 배낭 옆면
        c.rect(9, 24, 4, 3, bdk); c.put(10, 25, PAL['sky'][2])                            # 카메라


LOCAL = {'hair': (hexc('8a8a90'), hexc('b3b3b8'), hexc('d6d6da')), 'skin': PAL['skin'],
         'top': PAL['pink'], 'bottom': PAL['basalt'], 'accent': PAL['yellow'][1]}
TOURIST = {'hair': PAL['wood'], 'skin': (PAL['skin'][1], PAL['skin'][2], hexc('fff0e0')),
           'top': PAL['sky'], 'bottom': PAL['road'], 'accent': PAL['red'][1]}


def guest(kind: str, direction: str, frame: int) -> Canvas:
    pal, deco = (LOCAL, deco_local) if kind == 'local' else (TOURIST, deco_tourist)
    src = 'left' if direction == 'right' else direction
    c = make_char(pal, src, frame)
    deco(c, src, frame)
    c.outline()
    return c.flip_x() if direction == 'right' else c


# ---------------------------------------------------------------- 할망 초상
def portrait_halmang() -> Canvas:
    c = Canvas(48, 48)
    wdk, wmd, wlt = PAL['white']
    sdk, smd, slt = PAL['skin']
    pdk, pmd, plt = PAL['pink']
    # 저고리 (깃 V자)
    c.rect(4, 40, 40, 8, pmd)
    c.put(4, 40, CLEAR); c.put(43, 40, CLEAR)
    for i in range(8):
        c.rect(23 - i, 47 - i, 2, 1, wlt); c.rect(23 + i, 47 - i, 2, 1, wmd)
    c.hline(5, 43, 40, plt)
    # 목
    c.rect(19, 36, 10, 6, smd); c.hline(19, 28, 39, sdk)
    # 머리(뒤) + 쪽
    c.ellipse(24, 19, 17, 11, wmd)
    c.circle(24, 6, 4.5, wmd); c.ellipse(24, 7.5, 4.5, 3, wdk); c.circle(23, 5, 2, wlt)
    c.hline(29, 36, 5, PAL['wood'][2]); c.hline(29, 36, 6, PAL['wood'][0])     # 비녀
    # 얼굴
    c.ellipse(24, 27, 14.5, 13, smd)
    c.rect(8, 25, 3, 4, smd); c.rect(37, 25, 3, 4, smd); c.put(9, 27, sdk); c.put(38, 27, sdk)   # 귀
    c.hline(11, 18, 20, wlt); c.hline(30, 37, 20, wlt)                         # 머리결 하이라이트
    c.vline(24, 9, 15, wdk)                                                    # 가르마
    for x in range(10, 39):                                                    # 이마 아래 머리 그늘
        if ((x - 24) / 14.5) ** 2 + ((16 - 27) / 13) ** 2 <= 1:
            c.put(x, 16, wdk)
    # 웃는 눈 ^ ^
    for ex in (16, 28):
        c.put(ex, 25, OUT); c.hline(ex + 1, ex + 3, 24, OUT); c.put(ex + 4, 25, OUT)
    # 주름 2줄 + 볼 + 코 + 입
    c.hline(14, 16, 28, sdk); c.hline(32, 34, 28, sdk)
    c.rect(13, 30, 2, 2, plt); c.rect(33, 30, 2, 2, plt)
    c.put(24, 29, sdk); c.put(23, 30, sdk)
    c.put(20, 33, OUT); c.hline(21, 27, 34, OUT); c.put(28, 33, OUT)
    c.hline(22, 26, 35, pdk)                                                   # 아랫입술
    # 감귤꽃
    fx, fy = 34, 11
    for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        c.put(fx + dx, fy + dy, OUT)                                           # 흰 머리 위에서 읽히도록 테두리
    c.rect(fx - 1, fy, 3, 1, wlt); c.rect(fx, fy - 1, 1, 3, wlt); c.put(fx, fy, PAL['yellow'][1])
    c.put(fx + 2, fy + 2, PAL['leaf'][1]); c.put(fx + 3, fy + 2, PAL['leaf'][0])
    c.outline()
    return c


def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    for kind in ('local', 'tourist'):
        for d in DIRS:
            for f in range(3):
                s[f'guest_{kind}_{d}_{f}'] = guest(kind, d, f)
    s['portrait_halmang'] = portrait_halmang()
    return s
