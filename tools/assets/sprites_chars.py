"""캐릭터 스프라이트: 손님 2종 × 4방향 × 3프레임(32×48, 발 y=42) + 할망 초상(48×48).
Hot Springs Story 2식 치비: 전체 ~20×26(y 16~41), 머리가 60%(둥근 16×14), 토르소 10×6, 다리 4×5 스텁 2개.
1px 하이라이트(눈·머리결·옷 왼쪽 열)와 둥근 실루엣으로 아기자기하게. right는 left의 좌우 반전.
walk: frame 0/2에서 몸 전체가 1px 내려앉고(발 바닥선은 유지) 한쪽 다리가 들린다."""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color

Tones = tuple[Color, Color, Color]
DIRS = ('down', 'up', 'left', 'right')
CLEAR = (0, 0, 0, 0)
SHOE = PAL['basalt'][0]
EYE_HI = PAL['white'][2]

HEAD_Y, HEAD_H = 16, 14      # y 16~29
TORSO_Y, TORSO_H = 30, 6     # y 30~35
LEG_Y0, LEG_Y1 = 36, 40      # 다리 y 36~40, 신발 y 41, 바닥선 y 42


def round_block(c: Canvas, x: int, y: int, w: int, h: int, col: Color) -> None:
    """둥근 머리: 첫/끝 줄 모서리 2px, 다음 줄 1px 컷."""
    c.rect(x, y, w, h, col)
    for row, cut in ((0, 2), (1, 1), (h - 1, 2), (h - 2, 1)):
        for i in range(cut):
            c.put(x + i, y + row, CLEAR); c.put(x + w - 1 - i, y + row, CLEAR)


def leg(c: Canvas, x: int, tones: Tones, lifted: bool, bob: int) -> None:
    """4×5 다리 스텁 + 신발 1줄. 들린 다리는 몸과 함께 내려오되 바닥에서 1px 떠 있다."""
    if lifted:
        y0, y1 = LEG_Y0 + bob, LEG_Y1 - 1
    else:
        y0, y1 = LEG_Y0, LEG_Y1
    c.rect(x, y0, 4, y1 - y0 + 1, tones[1])
    c.vline(x + 1, y0, y1, tones[2])
    c.rect(x, y1 + 1, 4, 1, SHOE)


def torso(c: Canvas, x: int, w: int, y: int, top: Tones) -> None:
    c.rect(x, y, w, TORSO_H, top[1])
    c.vline(x + 1, y, y + TORSO_H - 2, top[2])           # 왼쪽 1px 밝게
    c.hline(x + 1, x + w - 2, y + TORSO_H - 1, top[0])
    c.vline(x + w - 2, y + 1, y + TORSO_H - 1, top[0])


def arm(c: Canvas, x: int, y: int, top: Tones, skin: Tones) -> None:
    """2px 혹 팔: 소매 2줄 + 손 2×2."""
    c.rect(x, y, 2, 2, top[1]); c.put(x, y, top[2])
    c.rect(x, y + 2, 2, 2, skin[1]); c.put(x + 1, y + 3, skin[0])


def head(c: Canvas, hx: int, hw: int, y: int, skin: Tones, hair: Tones, mode: str) -> None:
    """mode: down / up / left."""
    round_block(c, hx, y, hw, HEAD_H, skin[1])
    c.hline(hx + 3, hx + hw - 4, y + HEAD_H - 1, skin[0])                       # 턱 그늘
    c.vline(hx + hw - 2, y + 4, y + HEAD_H - 3, skin[0])
    if mode == 'up':
        round_block(c, hx, y, hw, HEAD_H, hair[1])
        c.hline(hx + 3, hx + hw - 4, y + HEAD_H - 1, hair[0]); c.hline(hx + 2, hx + hw - 3, y + HEAD_H - 2, hair[0])
        c.vline(hx + hw - 2, y + 3, y + HEAD_H - 3, hair[0])
    else:
        # 머리 캡: 위 6줄, 아래 가장자리 1px 어둡게, 좌상단 밝은 결 2px
        c.rect(hx, y, hw, 6, hair[1])
        for row, cut in ((0, 2), (1, 1)):
            for i in range(cut):
                c.put(hx + i, y + row, CLEAR); c.put(hx + hw - 1 - i, y + row, CLEAR)
        c.hline(hx + 1, hx + hw - 2, y + 5, hair[0])
        c.vline(hx, y + 6, y + 7, hair[1]); c.vline(hx + hw - 1, y + 6, y + 7, hair[1])
        if mode == 'left':
            c.rect(hx + hw // 2 + 1, y + 6, hw // 2 - 1, HEAD_H - 8, hair[1])   # 뒤통수
            c.vline(hx + hw - 2, y + 6, y + HEAD_H - 3, hair[0])
            c.hline(hx + hw // 2 + 1, hx + hw - 3, y + HEAD_H - 3, hair[0])
            c.vline(hx - 1, y + 2, y + 4, hair[1])                              # 앞으로 1px 넘치는 머리
    c.rect(hx + 3, y + 1, 4, 1, hair[2]); c.rect(hx + 3, y + 2, 2, 1, hair[2])  # 하이라이트 결 2px


def face(c: Canvas, y: int, skin: Tones, side: bool = False, hx: int = 8) -> None:
    ey = y + 7                                                # 눈 y 23~24
    if side:
        ex = hx + 3
        c.rect(ex, ey, 2, 2, OUT); c.put(ex, ey, EYE_HI)
        c.put(hx - 1, ey + 2, skin[1])                        # 코 1px(외곽선 돌출)
        c.put(ex - 1, ey + 3, PAL['pink'][1])
        c.hline(ex, ex + 1, ey + 4, OUT)
    else:
        for ex in (11, 19):
            c.rect(ex, ey, 2, 2, OUT); c.put(ex, ey, EYE_HI)
        c.put(10, ey + 3, PAL['pink'][1]); c.put(21, ey + 3, PAL['pink'][1])
        c.hline(15, 16, ey + 4, OUT)


def make_char(palette: dict, direction: str, frame: int) -> Canvas:
    """palette: hair/skin/top/bottom 각 3톤(DK,MD,LT). direction ∈ down/up/left."""
    hair: Tones = palette['hair']; skin: Tones = palette['skin']
    top: Tones = palette['top']; bottom: Tones = palette['bottom']
    c = Canvas(32, 48)
    c.shadow(15.5, 43, 7, 2)
    bob = 0 if frame == 1 else 1

    if direction in ('down', 'up'):
        leg(c, 11, bottom, lifted=(frame == 0), bob=bob)
        leg(c, 17, bottom, lifted=(frame == 2), bob=bob)
        torso(c, 11, 10, TORSO_Y + bob, top)
        arm(c, 9, TORSO_Y + bob + 1 + (frame == 2) - (frame == 0), top, skin)
        arm(c, 21, TORSO_Y + bob + 1 + (frame == 0) - (frame == 2), top, skin)
        head(c, 8, 16, HEAD_Y + bob, skin, hair, direction)
        if direction == 'down':
            face(c, HEAD_Y + bob, skin)
    else:  # left
        front = 11 - (1 if frame != 1 else 0)
        leg(c, 16, bottom, lifted=(frame == 2), bob=bob)          # 뒷다리
        leg(c, front, bottom, lifted=(frame == 0), bob=bob)       # 앞다리(1px 앞으로)
        torso(c, 12, 8, TORSO_Y + bob, top)
        ax = 11 - (frame == 0) + (frame == 2)
        arm(c, ax, TORSO_Y + bob + 1, top, skin)
        c.vline(ax + 1, TORSO_Y + bob + 1, TORSO_Y + bob + 2, top[0])   # 팔·몸 경계 1px
        head(c, 9, 14, HEAD_Y + bob, skin, hair, 'left')
        face(c, HEAD_Y + bob, skin, side=True, hx=9)
    return c


# ---------------------------------------------------------------- 손님별 장식
def deco_local(c: Canvas, direction: str, frame: int) -> None:
    """밀짚모자(챙 18×3 + 크라운 4px, 띠 1px) + 몸빼 점 2개."""
    ydk, ymd, ylt = PAL['yellow']
    bob = 0 if frame == 1 else 1
    ty = TORSO_Y + bob
    for x, y in ((13, ty + 1), (17, ty + 3)) if direction != 'left' else ((14, ty + 1), (17, ty + 3)):
        c.put(x, y, PAL['pink'][0])
    hy = HEAD_Y + bob
    bx = 7 if direction != 'left' else 6
    c.rect(bx, hy + 1, 18, 3, ymd); c.hline(bx + 1, bx + 16, hy + 1, ylt); c.hline(bx, bx + 17, hy + 3, ydk)   # 챙
    c.put(bx, hy + 1, CLEAR); c.put(bx + 17, hy + 1, CLEAR)
    cx = 10 if direction != 'left' else 10
    c.rect(cx, hy - 2, 12, 4, ymd); c.hline(cx + 1, cx + 10, hy - 2, ylt); c.vline(cx, hy - 1, hy, ylt)     # 크라운
    c.put(cx, hy - 2, CLEAR); c.put(cx + 11, hy - 2, CLEAR)
    c.hline(cx, cx + 11, hy + 1, ydk)                                                                       # 띠


def deco_tourist(c: Canvas, direction: str, frame: int) -> None:
    """앞머리 + 카메라 4×3(앞) / 배낭 6×6(뒤)."""
    hair = PAL['wood']; rdk, rmd, rlt = PAL['red']; bdk, bmd, blt = PAL['basalt']
    bob = 0 if frame == 1 else 1
    hy, ty = HEAD_Y + bob, TORSO_Y + bob
    if direction == 'down':
        c.rect(9, hy + 6, 2, 1, hair[1]); c.rect(14, hy + 6, 3, 1, hair[1]); c.rect(21, hy + 6, 2, 1, hair[1])
        c.rect(14, ty + 1, 4, 3, bdk); c.put(15, ty + 1, bmd); c.put(16, ty + 2, PAL['sky'][2])
    elif direction == 'up':
        c.rect(13, ty, 6, 6, rmd); c.hline(13, 18, ty, rlt); c.vline(13, ty + 1, ty + 4, rlt)
        c.hline(14, 18, ty + 5, rdk); c.vline(18, ty + 1, ty + 5, rdk)
    else:
        c.rect(10, hy + 6, 2, 1, hair[1])
        c.rect(18, ty, 3, 5, rmd); c.vline(20, ty, ty + 4, rdk); c.hline(18, 20, ty, rlt)   # 배낭 옆면


LOCAL = {'hair': (hexc('8a8a90'), hexc('b3b3b8'), hexc('e0e0e4')), 'skin': PAL['skin'],
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
    c.rect(3, 41, 42, 7, pmd)
    c.put(3, 41, CLEAR); c.put(44, 41, CLEAR)
    for i in range(7):
        c.rect(23 - i, 47 - i, 2, 1, wlt); c.rect(23 + i, 47 - i, 2, 1, wmd)
    c.hline(4, 43, 41, plt)
    # 목
    c.rect(18, 37, 12, 6, smd); c.hline(18, 29, 40, sdk)
    # 머리(뒤) + 쪽
    c.ellipse(24, 20, 19, 12.5, hmd)
    c.circle(24, 6, 5, hmd); c.ellipse(24, 7.5, 5, 3.2, hdk); c.rect(21, 3, 3, 1, hlt); c.rect(21, 4, 2, 1, hlt)
    # 얼굴: 크고 둥글게
    c.ellipse(24, 28, 16, 13.5, smd)
    c.rect(6, 26, 3, 5, smd); c.rect(39, 26, 3, 5, smd); c.put(7, 28, sdk); c.put(40, 28, sdk)   # 귀
    c.rect(11, 12, 6, 1, hlt); c.rect(11, 13, 3, 1, hlt)                       # 머리결 하이라이트 2px
    for x in range(8, 41):                                                      # 이마 머리 그늘
        if ((x - 24) / 16) ** 2 + ((17 - 28) / 13.5) ** 2 <= 1:
            c.put(x, 17, hdk)
    # 웃는 눈 ^ ^ (2px 호)
    for ex in (16, 28):
        c.put(ex, 26, OUT); c.hline(ex + 1, ex + 2, 25, OUT); c.put(ex + 3, 26, OUT)
    # 볼 3×2 + 코 + 입
    c.rect(11, 30, 3, 2, plt); c.rect(34, 30, 3, 2, plt)
    c.put(24, 30, sdk); c.put(23, 31, sdk)
    c.put(20, 34, OUT); c.hline(21, 27, 35, OUT); c.put(28, 34, OUT)
    c.hline(22, 26, 36, pdk)
    # 감귤꽃 (테두리를 둘러 회색 머리 위에서도 읽히게)
    fx, fy = 35, 12
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
