"""캐릭터 스프라이트: 손님 2종 × 4방향 × 3프레임(32×48, 발 y=42) + 할망 초상(48×48).
카이로소프트식 뭉툭한 장난감 비율: 전체 ~22×30, 머리가 절반(16×14), 토르소 14×10 한 덩어리,
팔은 토르소 옆에 붙은 3px 혹, 다리는 5×7 블록 2개. right는 left의 좌우 반전."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color

Tones = tuple[Color, Color, Color]
DIRS = ('down', 'up', 'left', 'right')
CLEAR = (0, 0, 0, 0)
SHOE = PAL['basalt'][0]

HEAD = (8, 11, 16, 14)      # x, y, w, h  → y 11~24
TORSO_Y, TORSO_H = 25, 10   # y 25~34
LEG_Y0, LEG_Y1 = 35, 41     # 발바닥 y=41, 바닥선 y=42
LIFT = 2


def round_block(c: Canvas, x: int, y: int, w: int, h: int, col: Color, r: int = 2) -> None:
    """모서리를 둥글린 블록(r=2: 각 모서리 3픽셀 제거)."""
    c.rect(x, y, w, h, col)
    cuts = [(0, 0)] if r == 1 else [(0, 0), (1, 0), (0, 1)]
    for dx, dy in cuts:
        c.put(x + dx, y + dy, CLEAR); c.put(x + w - 1 - dx, y + dy, CLEAR)
        c.put(x + dx, y + h - 1 - dy, CLEAR); c.put(x + w - 1 - dx, y + h - 1 - dy, CLEAR)


def leg(c: Canvas, x: int, tones: Tones, lifted: bool) -> None:
    """5×7 다리 블록. 신발은 아래 2줄(+외곽선 1줄)."""
    y1 = LEG_Y1 - (LIFT if lifted else 0)
    c.rect(x, LEG_Y0, 5, y1 - LEG_Y0 + 1, tones[1])
    c.vline(x + 1, LEG_Y0, y1 - 2, tones[2])
    c.vline(x + 3, LEG_Y0, y1 - 2, tones[0])
    c.rect(x, y1 - 1, 5, 2, SHOE)                     # 1줄 보이고 1줄은 외곽선


def arm(c: Canvas, x: int, y: int, top: Tones, skin: Tones, w: int = 3) -> None:
    """토르소 옆에 붙는 3px 혹 팔: 소매 6줄 + 손 3×3."""
    c.rect(x, y, w, 6, top[1])
    c.hline(x, x + w - 1, y, top[2])
    c.hline(x, x + w - 1, y + 5, top[0])
    c.rect(x, y + 6, w, 3, skin[1])
    c.hline(x, x + w - 1, y + 8, skin[0])


def torso(c: Canvas, x: int, w: int, top: Tones, bottom: Tones) -> None:
    c.rect(x, TORSO_Y, w, TORSO_H, top[1])
    c.hline(x, x + w - 1, TORSO_Y, top[2]); c.vline(x, TORSO_Y, TORSO_Y + TORSO_H - 1, top[2])
    c.vline(x + w - 1, TORSO_Y + 1, TORSO_Y + TORSO_H - 1, top[0])
    c.hline(x + 1, x + w - 1, TORSO_Y + TORSO_H - 1, top[0])


def head_base(c: Canvas, skin: Tones) -> None:
    hx, hy, hw, hh = HEAD
    round_block(c, hx, hy, hw, hh, skin[1])
    c.hline(hx + 2, hx + hw - 3, hy + hh - 1, skin[0])
    c.vline(hx + hw - 2, hy + 3, hy + hh - 3, skin[0])


def hair_cap(c: Canvas, hair: Tones, full: bool = False, back_half: bool = False) -> None:
    """윗 6줄 + 옆 1px 내려오는 머리 캡. full: 머리 전체(up), back_half: 뒤통수 절반(left)."""
    hx, hy, hw, hh = HEAD
    if full:
        round_block(c, hx, hy, hw, hh, hair[1])
        c.hline(hx + 2, hx + hw - 3, hy + hh - 1, hair[0]); c.hline(hx + 1, hx + hw - 2, hy + hh - 2, hair[0])
        c.vline(hx + hw - 2, hy + 2, hy + hh - 3, hair[0])
    else:
        c.rect(hx, hy, hw, 6, hair[1])
        for dx, dy in ((0, 0), (1, 0), (0, 1)):
            c.put(hx + dx, hy + dy, CLEAR); c.put(hx + hw - 1 - dx, hy + dy, CLEAR)
        c.vline(hx, hy + 6, hy + 9, hair[1]); c.vline(hx + hw - 1, hy + 6, hy + 9, hair[1])
        c.hline(hx + 1, hx + hw - 2, hy + 5, hair[0])
        if back_half:
            c.rect(hx + 9, hy + 6, hw - 9, hh - 6, hair[1])
            c.vline(hx + hw - 2, hy + 6, hy + hh - 3, hair[0])
            c.hline(hx + 10, hx + hw - 3, hy + hh - 1, hair[0])
            for dx, dy in ((0, 0), (1, 0), (0, 1)):
                c.put(hx + hw - 1 - dx, hy + hh - 1 - dy, CLEAR)
    c.rect(hx + 3, hy + 1, 5, 1, hair[2]); c.rect(hx + 3, hy + 2, 2, 1, hair[2])


def face(c: Canvas, skin: Tones, side: bool = False) -> None:
    ey = HEAD[1] + 6                                        # 눈 y 17~18
    c.rect(11, ey, 2, 2, OUT)
    c.put(11, ey, hexc('4a4a52'))
    if side:
        c.put(7, ey + 2, skin[1]); c.put(7, ey + 3, skin[1])   # 코 1px(외곽선 돌출)
        c.put(10, ey + 3, PAL['pink'][2])
        c.hline(9, 10, ey + 5, skin[0])
    else:
        c.rect(19, ey, 2, 2, OUT); c.put(19, ey, hexc('4a4a52'))
        c.put(10, ey + 3, PAL['pink'][2]); c.put(21, ey + 3, PAL['pink'][2])
        c.hline(15, 16, ey + 4, skin[0])                    # 입 2px


def make_char(palette: dict, direction: str, frame: int) -> Canvas:
    """palette: hair/skin/top/bottom 각 3톤(DK,MD,LT). direction ∈ down/up/left (right는 호출부에서 반전)."""
    hair: Tones = palette['hair']; skin: Tones = palette['skin']
    top: Tones = palette['top']; bottom: Tones = palette['bottom']
    c = Canvas(32, 48)
    c.shadow(15.5, 43, 9, 2.4)

    if direction in ('down', 'up'):
        # 다리: frame 0 왼다리 듦, 2 오른다리 듦, 1 둘 다 딛음
        leg(c, 10, bottom, lifted=(frame == 0))
        leg(c, 16, bottom, lifted=(frame == 2))
        # 팔(혹) — frame 0/2에서 한쪽 위 1px / 다른쪽 아래 1px
        swing = (0, 0) if frame == 1 else ((-1, 1) if frame == 0 else (1, -1))
        arm(c, 6, 26 + swing[0], top, skin)
        arm(c, 23, 26 + swing[1], top, skin)
        torso(c, 9, 14, top, bottom)
    else:  # left
        front_dx = -2 if frame != 1 else -1
        leg(c, 15, bottom, lifted=(frame == 2))             # 뒷다리
        leg(c, 11 + front_dx, bottom, lifted=(frame == 0))  # 앞다리(2px 앞으로)
        torso(c, 11, 10, top, bottom)
        ax = 10 + (-1 if frame == 0 else 1 if frame == 2 else 0)
        ay = 26 + (-1 if frame == 0 else 1 if frame == 2 else 0)
        arm(c, ax, ay, (top[0], top[0], top[1]), skin)     # 앞팔: 어두운 톤으로 토르소와 구분

    head_base(c, skin)
    if direction == 'up':
        hair_cap(c, hair, full=True)
    elif direction == 'down':
        hair_cap(c, hair)
        face(c, skin)
    else:
        hair_cap(c, hair, back_half=True)
        face(c, skin, side=True)
    return c


# ---------------------------------------------------------------- 손님별 장식
def deco_local(c: Canvas, direction: str, frame: int) -> None:
    """밀짚모자(20 wide, 띠 2px) + 몸빼 점무늬."""
    ydk, ymd, ylt = PAL['yellow']
    dots = ((11, 27), (17, 27), (14, 30), (20, 30), (11, 33)) if direction != 'left' else ((13, 27), (17, 30), (13, 33))
    for x, y in dots:
        c.put(x, y, PAL['pink'][0])
    bx = 6 if direction != 'left' else 4
    c.rect(bx, 15, 20, 2, ymd); c.hline(bx + 1, bx + 18, 15, ylt); c.hline(bx, bx + 19, 16, ydk)   # 챙
    c.rect(10, 8, 12, 7, ymd); c.hline(11, 20, 8, ylt); c.vline(10, 9, 13, ylt)                     # 크라운
    c.put(10, 8, CLEAR); c.put(21, 8, CLEAR)
    c.rect(10, 13, 12, 2, ydk)                                                                        # 띠 2px


def deco_tourist(c: Canvas, direction: str, frame: int) -> None:
    """앞머리 2px + 카메라(앞) / 배낭 8×8(뒤)."""
    hair = PAL['wood']; rdk, rmd, rlt = PAL['red']; bdk, bmd, blt = PAL['basalt']
    if direction == 'down':
        c.rect(9, 17, 3, 2, hair[1]); c.rect(15, 17, 2, 2, hair[1]); c.rect(20, 17, 3, 2, hair[1])   # 앞머리
        c.rect(13, 28, 6, 4, bdk); c.hline(14, 17, 28, bmd)
        c.rect(15, 29, 2, 2, PAL['sky'][2]); c.put(16, 30, PAL['sky'][0])
    elif direction == 'up':
        c.rect(12, 26, 8, 8, rmd)
        c.hline(12, 19, 26, rlt); c.vline(12, 27, 33, rlt)
        c.hline(13, 19, 33, rdk); c.vline(19, 27, 33, rdk)
    else:
        c.rect(9, 17, 3, 2, hair[1])                                                # 앞머리 한 뭉치
        c.rect(19, 27, 3, 7, rmd); c.vline(21, 27, 33, rdk); c.hline(19, 21, 27, rlt)   # 배낭 옆면
        c.rect(8, 29, 4, 3, bdk); c.put(9, 30, PAL['sky'][2])                      # 카메라


LOCAL = {'hair': (hexc('8a8a90'), hexc('b3b3b8'), hexc('d6d6da')), 'skin': PAL['skin'],
         'top': PAL['pink'], 'bottom': (hexc('2a2a2e'), hexc('55555e'), hexc('7a7a84')), 'accent': PAL['yellow'][1]}
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
    hdk, hmd, hlt = LOCAL['hair']
    sdk, smd, slt = PAL['skin']
    pdk, pmd, plt = PAL['pink']
    wdk, wmd, wlt = PAL['white']
    # 저고리 (깃 V자)
    c.rect(3, 40, 42, 8, pmd)
    c.put(3, 40, CLEAR); c.put(44, 40, CLEAR)
    for i in range(8):
        c.rect(23 - i, 47 - i, 2, 1, wlt); c.rect(23 + i, 47 - i, 2, 1, wmd)
    c.hline(4, 43, 40, plt)
    # 목
    c.rect(18, 36, 12, 6, smd); c.hline(18, 29, 39, sdk)
    # 머리(뒤) + 쪽
    c.ellipse(24, 19, 18, 12, hmd)
    c.circle(24, 6, 5, hmd); c.ellipse(24, 7.5, 5, 3.2, hdk); c.circle(23, 5, 2.2, hlt)
    # 얼굴: 크고 둥글게
    c.ellipse(24, 27, 15.5, 13.5, smd)
    c.rect(7, 25, 3, 5, smd); c.rect(38, 25, 3, 5, smd); c.put(8, 27, sdk); c.put(39, 27, sdk)   # 귀
    c.hline(10, 18, 19, hlt); c.hline(30, 38, 19, hlt)                          # 머리결 하이라이트
    for x in range(9, 40):                                                      # 이마 머리 그늘
        if ((x - 24) / 15.5) ** 2 + ((16 - 27) / 13.5) ** 2 <= 1:
            c.put(x, 16, hdk)
    # 웃는 눈 ^ ^ (3px 호)
    for ex in (16, 28):
        c.put(ex, 25, OUT); c.hline(ex + 1, ex + 3, 24, OUT); c.put(ex + 4, 25, OUT)
    # 볼 2×2 + 코 + 입
    c.rect(12, 29, 2, 2, plt); c.rect(34, 29, 2, 2, plt)
    c.put(24, 29, sdk); c.put(23, 30, sdk)
    c.put(20, 33, OUT); c.hline(21, 27, 34, OUT); c.put(28, 33, OUT)
    c.hline(22, 26, 35, pdk)
    # 감귤꽃 (테두리를 둘러 회색 머리 위에서도 읽히게)
    fx, fy = 35, 11
    for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        c.put(fx + dx, fy + dy, OUT)
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
