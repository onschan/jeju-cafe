"""초상 파츠 시스템 (64×64, 정면). Hot Springs Story 2 고용 화면풍: 큰 머리, 큰 눈, 작은 코, 발그레한 볼, 밑에 깃·어깨.
걷기 몸(sprites_chars)과는 별개 파츠다.

레이어(아래→위)와 시트 이름:
  pt_face_{skin}_{expr}   12장  얼굴 바탕(얼굴·목·귀·눈썹·눈·코·입·볼). 피부 3종 × 표정 4종. tint 없음.
  pt_top                   1장  어깨·깃. 흰 4톤 → Pixi tint = 상의색.
  pt_hair_{style}          8장  머리 8종(정면). 흰 4톤 → tint = 머리색.
  pt_acc_{kind}            6장  액세서리 6종, 고유색.
  portrait_{name}          5장  고정 초상(할망·주인공·삼춘·해녀·이장님). icons/로도 내보낸다.

tint 파츠는 흰(#ffffff)이 하이라이트 가닥, #e4e4e4가 본색, #b4b4b4가 그늘, #848484가 깊은 그늘(안쪽 경계선).
합성 순서: face → top → hair → acc. 각 파츠 외곽선은 아래 레이어 위에 얹힌 상태로 계산한다:
바깥 실루엣은 OUT, 아래 레이어와 맞닿는 가장자리는 파츠의 깊은 그늘 톤(머리카락-이마 경계선, 깃-목 경계선).
얼굴 안쪽에는 투명 픽셀을 두지 않는다(외곽선 계산이 구멍을 선으로 바꾼다).
"""
from __future__ import annotations
import random
from px import Canvas, PAL, OUT, hexc, Color
from sprites_chars import SKINS, HAIR_RGB, TOP_RGB, tinted

CLEAR = (0, 0, 0, 0)
W = H = 64
CX = 32                                   # 중심: x 31 | 32 사이

# tint용 흰 4톤
T_HI, T_BASE, T_MD, T_DK = hexc('ffffff'), hexc('e4e4e4'), hexc('b4b4b4'), hexc('848484')

HAIR_STYLES = ('bob', 'short', 'pony', 'perm', 'updo', 'sport', 'long', 'bald')
ACC_KINDS = ('strawhat', 'cap', 'glasses', 'headband', 'earrings', 'apron')
EXPRS = ('normal', 'happy', 'sad', 'surprised')

EYE_WHITE = hexc('ffffff')
IRIS_DK, IRIS_MD = hexc('2a1f1c'), hexc('6b4a3a')
BROW = hexc('4a3028')
LIP = hexc('c4524a')
MOUTH_IN = hexc('7a2a2a')
TEAR = hexc('8ec1f0')
# 피부별 (볼 홍조, 볼 하이라이트)
BLUSH: tuple[tuple[Color, Color], ...] = (
    (hexc('ffb3c1'), hexc('ffd0da')),
    (hexc('e8907e'), hexc('f4b09c')),
    (hexc('b8624a'), hexc('cf8068')),
)


# ---------------------------------------------------------------- 공용
def row(c: Canvas, y: int, hw: int, col: Color) -> None:
    """중심 대칭 가로줄: x CX-hw .. CX+hw-1."""
    c.hline(CX - hw, CX + hw - 1, y, col)


def mirror(c: Canvas, x: int, y: int, col: Color) -> None:
    c.put(x, y, col); c.put(2 * CX - 1 - x, y, col)


def mirror_rect(c: Canvas, x: int, y: int, w: int, h: int, col: Color) -> None:
    c.rect(x, y, w, h, col); c.rect(2 * CX - x - w, y, w, h, col)


def profile(c: Canvas, y0: int, hws: list[int], col: Color) -> None:
    for i, hw in enumerate(hws):
        if hw > 0:
            row(c, y0 + i, hw, col)


def outline_layer(part: Canvas, context: Canvas, inner: Color | None) -> Canvas:
    """바깥 실루엣(파츠·컨텍스트 모두 빈 이웃) → OUT, 컨텍스트와 맞닿는 가장자리 → inner(None이면 그대로)."""
    out = part.copy()
    for y in range(part.h):
        for x in range(part.w):
            if part.px[y][x][3] != 255:
                continue
            edge_out = edge_in = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if part.get(x + dx, y + dy)[3] == 255:
                    continue
                if context.get(x + dx, y + dy)[3] == 255:
                    edge_in = True
                else:
                    edge_out = True
            if edge_out:
                out.px[y][x] = OUT
            elif edge_in and inner is not None:
                out.px[y][x] = inner
    return out


def _stack(layers: list[Canvas]) -> Canvas:
    c = Canvas(W, H)
    for l in layers:
        c.blit(l, 0, 0)
    return c


# ---------------------------------------------------------------- 얼굴 바탕
# 얼굴 실루엣: y=6부터 한 줄씩 절반 너비. 위는 머리에 가려지고 아래턱은 둥글게.
FACE_Y = 6
FACE_HW = [8, 12, 14, 15, 16, 17, 18, 18, 19, 19] + [20] * 24 + [20, 19, 19, 18, 17, 16, 14, 12, 9, 5]
NECK_X0, NECK_X1 = 26, 37
EYE_Y = 25                                # 속눈썹 줄. 눈 6×7 (y 25~31)
EYE_L = 18                                # 왼눈 x 18~23, 오른눈 40~45
EYE_R = 2 * CX - EYE_L - 6


def face_shape(c: Canvas, skin: int) -> None:
    dk, md, lt = SKINS[skin]
    # 목 (턱 아래 그늘 2줄)
    c.rect(NECK_X0, 42, NECK_X1 - NECK_X0 + 1, 14, md)
    c.rect(NECK_X0, 48, NECK_X1 - NECK_X0 + 1, 3, dk)
    # 얼굴
    profile(c, FACE_Y, FACE_HW, md)
    # 귀 (얼굴 옆 3px, y 29~35, 바깥 모서리 둥글게 — 얼굴 밖이라 투명 OK)
    for x0 in (9, 52):
        outer = x0 if x0 < CX else x0 + 2
        c.rect(x0, 29, 3, 7, md)
        c.put(outer, 29, CLEAR); c.put(outer, 35, CLEAR)
        c.put(x0 + 1, 32, dk); c.put(x0 + 1, 33, dk)
    # 정수리 하이라이트(대머리·모자용)
    c.hline(22, 30, 8, lt); c.hline(20, 26, 9, lt); c.hline(19, 22, 10, lt)


def eye_open(c: Canvas, x0: int, y: int, skin: int, iris: tuple[int, int] = (3, 4), lid: int = 0, look_down: int = 0) -> None:
    """6×7 눈. 속눈썹 1줄 + 흰자 6줄, 홍채 iris(w,h)를 가운데 위쪽에. 바깥 눈꼬리는 2px 두께.
    lid: 위 눈꺼풀이 내려온 줄 수(슬픔). look_down: 홍채를 아래로 내린 px."""
    dk, md, lt = SKINS[skin]
    left = x0 < CX
    c.rect(x0, y + 1, 6, 6, EYE_WHITE)
    c.hline(x0, x0 + 5, y, OUT)
    outer = x0 if left else x0 + 5
    c.put(outer, y + 1, OUT)
    # 아래 모서리 둥글게 (피부색으로)
    c.put(x0, y + 6, md); c.put(x0 + 5, y + 6, md)
    if lid:
        c.rect(x0 + 1, y + 1, 4, lid, md); c.hline(x0 + 1, x0 + 4, y + lid, OUT)
        c.put(x0 + 1, y + 1, OUT); c.put(x0 + 4, y + 1, OUT)
    iw, ih = iris
    ix = x0 + (6 - iw) // 2 + (0 if left else (6 - iw) % 2)
    iy = y + 1 + lid + look_down
    c.rect(ix, iy, iw, ih, IRIS_DK)
    c.hline(ix, ix + iw - 1, iy + ih - 1, IRIS_MD)                # 홍채 아랫줄 중간톤
    c.put(ix, iy, EYE_WHITE)                                       # 하이라이트(광원 왼쪽 위 → 양 눈 다 왼쪽 위)


def eye_closed_smile(c: Canvas, x0: int, y: int) -> None:
    """^ 모양 웃는 눈 (6 너비, 2px 두께)."""
    c.put(x0, y + 4, OUT); c.put(x0, y + 5, OUT)
    c.put(x0 + 1, y + 3, OUT); c.put(x0 + 1, y + 4, OUT)
    c.hline(x0 + 2, x0 + 3, y + 2, OUT); c.hline(x0 + 2, x0 + 3, y + 3, OUT)
    c.put(x0 + 4, y + 3, OUT); c.put(x0 + 4, y + 4, OUT)
    c.put(x0 + 5, y + 4, OUT); c.put(x0 + 5, y + 5, OUT)


def brow(c: Canvas, x0: int, y: int, kind: str) -> None:
    """눈썹 5px. normal/happy 수평, sad 안쪽이 올라감(八 반대), surprised 1px 위."""
    left = x0 < CX
    inner = x0 + 4 if left else x0
    if kind == 'sad':
        pts = [(x0 + i, y + (0 if (i < 2 if left else i > 2) else -1)) for i in range(5)]
        pts[4 if left else 0] = (inner, y - 2)
        for x, yy in pts:
            c.put(x, yy, BROW)
    elif kind == 'surprised':
        c.hline(x0, x0 + 4, y - 1, BROW)
    else:
        c.hline(x0, x0 + 4, y, BROW)


def mouth(c: Canvas, kind: str) -> None:
    if kind == 'normal':                                           # 작은 미소: 4px + 올라간 입꼬리
        c.hline(30, 33, 38, OUT); c.put(29, 37, OUT); c.put(34, 37, OUT)
        c.hline(30, 33, 39, LIP)
    elif kind == 'happy':                                          # 활짝 벌린 입 (이 + 혀)
        c.hline(29, 34, 36, OUT); c.put(28, 35, OUT); c.put(35, 35, OUT)
        c.put(28, 36, OUT); c.put(35, 36, OUT)
        c.hline(29, 34, 37, EYE_WHITE)
        c.rect(29, 38, 6, 2, MOUTH_IN)
        c.hline(30, 33, 39, LIP)
        c.put(28, 37, OUT); c.put(35, 37, OUT)
        c.put(28, 38, OUT); c.put(35, 38, OUT)
        c.put(29, 39, OUT); c.put(34, 39, OUT)
        c.hline(30, 33, 40, OUT)
    elif kind == 'sad':                                            # 처진 입
        c.hline(30, 33, 37, OUT); c.put(29, 38, OUT); c.put(34, 38, OUT)
        c.hline(30, 33, 38, LIP)
    elif kind == 'surprised':                                      # 작은 O
        c.rect(30, 37, 4, 4, OUT)
        c.rect(31, 38, 2, 2, MOUTH_IN)
        c.put(30, 37, LIP); c.put(33, 37, LIP); c.put(30, 40, LIP); c.put(33, 40, LIP)


def face_raw(skin: int, expr: str) -> Canvas:
    c = Canvas(W, H)
    dk, md, lt = SKINS[skin]
    blush, blush_hi = BLUSH[skin]
    face_shape(c, skin)
    ey = EYE_Y
    brow(c, EYE_L, ey - 3, expr); brow(c, EYE_R + 1, ey - 3, expr)
    if expr == 'happy':
        eye_closed_smile(c, EYE_L, ey); eye_closed_smile(c, EYE_R, ey)
    elif expr == 'sad':
        eye_open(c, EYE_L, ey, skin, lid=1, look_down=1); eye_open(c, EYE_R, ey, skin, lid=1, look_down=1)
        c.put(EYE_L - 1, ey + 6, TEAR); c.put(EYE_L - 1, ey + 7, TEAR)                 # 눈물 한 방울
    elif expr == 'surprised':
        eye_open(c, EYE_L, ey, skin, iris=(3, 3), look_down=1); eye_open(c, EYE_R, ey, skin, iris=(3, 3), look_down=1)
    else:
        eye_open(c, EYE_L, ey, skin); eye_open(c, EYE_R, ey, skin)
    # 볼 (happy는 더 넓고 진하게)
    for x0 in (13, 47):
        c.rect(x0, 33, 4, 2, blush); c.put(x0 + 1, 33, blush_hi)
        if expr == 'happy':
            c.rect(x0, 32, 4, 4, blush); c.put(x0 + 1, 33, blush_hi); c.put(x0 + 2, 33, blush_hi)
    # 코 1px
    c.put(31, 34, dk)
    mouth(c, expr)
    return c


def face(skin: int, expr: str) -> Canvas:
    return outline_layer(face_raw(skin, expr), Canvas(W, H), None)


# ---------------------------------------------------------------- 어깨·깃 (흰 4톤)
def top_raw() -> Canvas:
    c = Canvas(W, H)
    profile(c, 51, [24, 27, 29, 30] + [31] * 9, T_BASE)            # y 51~63
    for y, hw in ((51, 7), (52, 7), (53, 7), (54, 6), (55, 5), (56, 3)):   # 목선 개구부 (둥근 U)
        row(c, y, hw, CLEAR)
    for y, hw in ((52, 8), (53, 8), (54, 7), (55, 6), (56, 5), (57, 3)):   # 깃 하이라이트
        mirror(c, CX - hw, y, T_HI)
    c.hline(CX - 3, CX + 2, 57, T_HI)
    c.hline(CX - 22, CX - 10, 52, T_HI); c.hline(CX + 9, CX + 21, 52, T_HI)   # 어깨 윗줄
    c.hline(CX - 24, CX - 23, 53, T_HI); c.hline(CX + 22, CX + 23, 53, T_HI)
    for y in range(58, 64):                                        # 팔 경계 그늘
        mirror(c, CX - 14, y, T_MD)
    c.rect(CX - 31, 60, 4, 4, T_MD); c.rect(CX + 27, 60, 4, 4, T_MD)
    return c


def top_part(context: Canvas) -> Canvas:
    return outline_layer(top_raw(), context, T_DK)


# ---------------------------------------------------------------- 머리 (흰 4톤, 정면)
CAP_HW = [8, 12, 15, 17, 18, 19, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21]   # y 3~20


def strands(c: Canvas, pts: list[tuple[int, int, int]]) -> None:
    """하이라이트 가닥: (x, y, 길이) 대각선 ↘."""
    for x, y, n in pts:
        for i in range(n):
            c.put(x + i, y + i, T_HI)


def bangs(c: Canvas, y: int, x0: int, x1: int, tips: tuple[int, ...]) -> None:
    """앞머리 밑단: y줄까지 채운 뒤 tips 위치마다 3px 너비·2px 깊이 뾰족 가닥."""
    c.hline(x0, x1, y, T_BASE)
    for tx in tips:
        c.hline(tx - 1, tx + 1, y + 1, T_BASE)
        c.put(tx, y + 2, T_BASE)


def side_lock(c: Canvas, left: bool, y0: int, y1: int, w: int = 4, x_out: int | None = None) -> None:
    """얼굴 옆으로 흘러내린 머리(구레나룻·단발 옆). 바깥 위·아래 모서리 둥글게, 아래 1줄 그늘."""
    x0 = (CX - 21 - (w - 3)) if left else (CX + 18)
    if x_out is not None:
        x0 = x_out if left else 2 * CX - x_out - w
    c.rect(x0, y0, w, y1 - y0 + 1, T_BASE)
    outer = x0 if left else x0 + w - 1
    c.put(outer, y0, CLEAR); c.put(outer, y1, CLEAR)
    c.hline(x0, x0 + w - 1, y1, T_MD); c.put(outer, y1, CLEAR)
    c.hline(x0 + (1 if left else 0), x0 + w - (1 if not left else 1), y1 - 1, T_MD)


def hair_raw(style: str) -> Canvas:
    c = Canvas(W, H)
    if style == 'bald':                                              # 옆머리만: 귀 위에서 뒤로
        for left in (True, False):
            x0 = 8 if left else 49
            for i, (y, xa, xb) in enumerate(((18, 1, 6), (19, 0, 6), (20, 0, 6), (21, 0, 6), (22, 0, 6), (23, 0, 6),
                                             (24, 0, 6), (25, 0, 5), (26, 0, 5), (27, 0, 4), (28, 1, 4))):
                if not left:
                    xa, xb = 7 - xb, 7 - xa
                c.hline(x0 + xa, x0 + xb, y, T_BASE)
            c.hline(x0 + (0 if left else 3), x0 + (4 if left else 7), 27, T_MD)
            c.hline(x0 + (1 if left else 3), x0 + (4 if left else 6), 28, T_MD)
        c.hline(9, 11, 20, T_HI); c.put(12, 21, T_HI); c.hline(52, 54, 20, T_HI)
        return c
    if style == 'sport':                                             # 스포츠: 얼굴 딱 맞는 캡 + 삐죽 가닥
        profile(c, 4, [9, 13, 15, 17, 18, 19, 20, 20, 20, 20, 20, 20, 20], T_BASE)   # y 4~16
        for x in (CX - 17, CX - 11, CX - 5, CX + 1, CX + 7, CX + 13):
            c.hline(x, x + 1, 17, T_BASE)
        for x, dy in ((CX - 12, 2), (CX - 5, 3), (CX + 3, 2), (CX + 10, 1)):
            c.rect(x, 4 - dy, 2, dy + 1, T_BASE)
        c.hline(CX - 20, CX + 19, 16, T_MD)
        strands(c, [(CX - 10, 6, 3), (CX - 3, 5, 2), (CX + 6, 7, 2)])
        return c
    if style == 'updo':                                              # 올림머리: 뒤로 빗어 넘김 + 정수리 쪽
        profile(c, 4, [10, 14, 16, 18, 19, 20, 20, 21, 21, 21], T_BASE)          # y 4~13
        for x in (CX - 15, CX - 8, CX - 1, CX + 6, CX + 13):                      # 이마선 물결
            c.hline(x, x + 1, 14, T_BASE)
        c.hline(CX - 20, CX + 19, 13, T_MD)
        side_lock(c, True, 12, 23, w=3, x_out=CX - 22); side_lock(c, False, 12, 23, w=3, x_out=CX - 22)
        for y, hw in ((0, 3), (1, 5), (2, 6), (3, 6), (4, 6), (5, 6), (6, 5), (7, 3)):   # 쪽
            row(c, y, hw, T_BASE)
        row(c, 6, 5, T_MD); row(c, 7, 3, T_MD); c.hline(CX - 4, CX + 3, 5, T_MD)
        c.hline(CX - 3, CX - 1, 1, T_HI); c.put(CX - 4, 2, T_HI)
        strands(c, [(CX - 14, 8, 3), (CX + 7, 6, 3)])
        c.hline(CX - 8, CX - 5, 6, T_HI); c.hline(CX + 10, CX + 12, 9, T_HI)
        return c
    # 앞머리 있는 스타일 공통 캡 (y 3~20)
    profile(c, 3, CAP_HW, T_BASE)
    if style == 'short':
        bangs(c, 19, CX - 20, CX + 19, (CX - 15, CX - 8, CX - 1, CX + 6, CX + 13))
        side_lock(c, True, 20, 27, w=3); side_lock(c, False, 20, 27, w=3)
        strands(c, [(CX - 15, 6, 4), (CX - 9, 5, 3), (CX + 4, 6, 2)])
    elif style == 'bob':
        bangs(c, 20, CX - 20, CX + 19, (CX - 15, CX - 8, CX - 1, CX + 6, CX + 13))
        side_lock(c, True, 18, 42, w=4); side_lock(c, False, 18, 42, w=4)
        for left in (True, False):
            c.vline(CX - 21 if left else CX + 20, 24, 40, T_MD)                   # 얼굴 쪽 안 그늘
        c.vline(CX - 23, 26, 31, T_HI); c.vline(CX + 22, 28, 33, T_HI)
        strands(c, [(CX - 15, 6, 4), (CX - 9, 5, 3), (CX + 5, 6, 2)])
    elif style == 'long':
        bangs(c, 20, CX - 20, CX + 19, (CX - 15, CX - 8, CX - 1, CX + 6, CX + 13))
        for left in (True, False):
            for y0, y1, w, xo in ((18, 30, 4, CX - 22), (31, 42, 5, CX - 23), (43, 52, 7, CX - 25), (53, 63, 9, CX - 27)):
                x0 = xo if left else 2 * CX - xo - w
                c.rect(x0, y0, w, y1 - y0 + 1, T_BASE)
            c.put(CX - 22 if left else CX + 21, 18, CLEAR)
            c.vline(CX - 21 if left else CX + 20, 24, 50, T_MD)
            c.vline(CX - 19 if left else CX + 18, 53, 63, T_MD)
            c.vline(CX - 23 if left else CX + 22, 26, 33, T_HI)
        c.hline(CX - 27, CX - 20, 63, T_MD); c.hline(CX + 19, CX + 26, 63, T_MD)
        strands(c, [(CX - 15, 6, 4), (CX - 9, 5, 3), (CX + 5, 6, 2)])
    elif style == 'pony':
        bangs(c, 19, CX - 20, CX + 19, (CX - 16, CX - 9, CX - 2, CX + 5, CX + 12))
        side_lock(c, True, 20, 26, w=3); side_lock(c, False, 20, 26, w=3)
        # 높이 묶은 꼬리: 오른쪽 뒤로 올라갔다가 어깨 쪽으로 흘러내림
        for y, xa, xb in ((0, CX + 13, CX + 20), (1, CX + 12, CX + 22), (2, CX + 12, CX + 23), (3, CX + 13, CX + 24),
                          (4, CX + 16, CX + 25), (5, CX + 20, CX + 26), (6, CX + 21, CX + 26)):
            c.hline(xa, xb, y, T_BASE)
        c.rect(CX + 22, 7, 5, 16, T_BASE); c.rect(CX + 23, 23, 4, 6, T_BASE); c.rect(CX + 24, 29, 3, 4, T_BASE)
        c.put(CX + 26, 32, CLEAR)
        c.rect(CX + 17, 3, 4, 3, T_DK)                                             # 머리끈
        c.vline(CX + 26, 8, 30, T_MD); c.vline(CX + 22, 8, 12, T_MD)
        c.hline(CX + 14, CX + 16, 1, T_HI); c.vline(CX + 24, 10, 15, T_HI)
        strands(c, [(CX - 15, 6, 4), (CX - 9, 5, 3), (CX + 4, 6, 2)])
    elif style == 'perm':                                            # 곱슬: 둥근 뭉치 가장자리
        profile(c, 2, [7, 12, 15, 17, 19, 20, 21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22], T_BASE)   # y 2~19
        for x in range(CX - 21, CX + 20, 5):                                       # 앞머리 밑단 스캘럽 (둥근 혹)
            c.hline(x, x + 3, 20, T_BASE); c.hline(x + 1, x + 2, 21, T_BASE)
        for left in (True, False):                                                 # 양옆 뭉치 y 16~40
            for y0, xo in ((16, CX - 23), (22, CX - 24), (28, CX - 24), (34, CX - 23)):
                x0 = xo if left else 2 * CX - xo - 5
                c.rect(x0, y0, 5, 6, T_BASE)
                outer = x0 if left else x0 + 4
                c.put(outer, y0, CLEAR); c.put(outer, y0 + 5, CLEAR)
                c.hline(x0 + (1 if left else 0), x0 + (4 if left else 3), y0 + 5, T_MD)
            c.put(CX - 22 if left else CX + 21, 40, T_MD)
        for x in (CX - 14, CX - 7, CX + 3, CX + 11):                               # 곱슬 결 (짧은 곡선)
            c.put(x, 6, T_HI); c.put(x + 1, 5, T_HI); c.put(x + 2, 6, T_HI)
        c.put(CX - 22, 24, T_HI); c.put(CX + 21, 30, T_HI); c.put(CX - 4, 12, T_HI)
    return c


def hair_part(style: str, context: Canvas) -> Canvas:
    return outline_layer(hair_raw(style), context, T_DK)


# ---------------------------------------------------------------- 액세서리 (고유색)
def acc_raw(kind: str) -> Canvas:
    c = Canvas(W, H)
    if kind == 'strawhat':
        ydk, ymd, ylt = PAL['yellow']
        profile(c, 0, [9, 13, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16], ymd)     # 크라운 y 0~12
        c.hline(CX - 14, CX + 13, 1, ylt); c.vline(CX - 15, 2, 9, ylt)
        c.hline(CX - 16, CX + 15, 10, ydk); c.hline(CX - 16, CX + 15, 11, ydk)        # 띠
        c.hline(CX - 16, CX + 15, 12, ymd)
        profile(c, 13, [29, 30, 30, 29], ymd)                                        # 챙 y 13~16
        c.hline(CX - 28, CX + 27, 13, ylt); c.hline(CX - 29, CX + 28, 16, ydk)
        for x in range(CX - 27, CX + 27, 5):                                         # 밀짚 결
            c.put(x, 15, ydk)
    elif kind == 'cap':
        bdk, bmd, blt = PAL['sky']
        profile(c, 3, [8, 12, 15, 17, 18, 19, 20, 21, 21, 21, 21, 21, 21], bmd)       # 크라운 y 3~15
        c.hline(CX - 8, CX + 7, 3, blt); c.hline(CX - 14, CX - 9, 4, blt); c.vline(CX - 18, 8, 12, blt)
        c.hline(CX - 16, CX + 15, 14, bdk); c.hline(CX - 21, CX + 20, 15, bdk)
        c.rect(CX - 1, 1, 2, 2, bdk); c.put(CX - 1, 1, blt)                           # 꼭지
        c.vline(CX - 1, 4, 13, bdk)                                                  # 가운데 솔기
        c.rect(CX - 5, 8, 10, 4, hexc('f5f1e8')); c.rect(CX - 3, 9, 6, 2, PAL['orange'][1])   # 감귤 패치
        profile(c, 16, [22, 22, 21], bdk)                                             # 챙 y 16~18 (정면: 납작)
        c.hline(CX - 21, CX + 20, 16, bmd)
    elif kind == 'glasses':
        fr = hexc('3b3b44'); lens = (142, 193, 240, 90)
        for x0 in (EYE_L - 2, EYE_R - 2):
            c.rect(x0, EYE_Y - 2, 10, 10, fr)
            c.rect(x0 + 1, EYE_Y - 1, 8, 8, CLEAR)
            for cx_, cy_ in ((x0, EYE_Y - 2), (x0 + 9, EYE_Y - 2), (x0, EYE_Y + 7), (x0 + 9, EYE_Y + 7)):
                c.put(cx_, cy_, CLEAR)
            for yy in range(EYE_Y - 1, EYE_Y + 7):
                for xx in range(x0 + 1, x0 + 9):
                    c.blend(xx, yy, lens)
            c.put(x0 + 2, EYE_Y, (255, 255, 255, 120)); c.put(x0 + 3, EYE_Y, (255, 255, 255, 120))
        c.hline(EYE_L + 8, EYE_R - 3, EYE_Y + 2, fr)                                  # 브리지
        c.hline(9, EYE_L - 3, EYE_Y + 1, fr); c.hline(EYE_R + 8, 54, EYE_Y + 1, fr)   # 안경다리
    elif kind == 'headband':
        rdk, rmd, rlt = PAL['red']
        c.rect(CX - 22, 16, 44, 4, rmd)
        c.hline(CX - 21, CX + 20, 16, rlt); c.hline(CX - 22, CX + 21, 19, rdk)
        c.put(CX - 22, 16, CLEAR); c.put(CX + 21, 16, CLEAR); c.put(CX - 22, 19, CLEAR); c.put(CX + 21, 19, CLEAR)
        for x in range(CX - 18, CX + 20, 6):
            c.put(x, 17, hexc('fff0b3')); c.put(x + 1, 18, hexc('fff0b3'))
        c.rect(CX + 18, 13, 4, 4, rmd); c.rect(CX + 21, 12, 3, 3, rmd)                # 매듭 리본
        c.put(CX + 18, 13, CLEAR); c.put(CX + 23, 12, CLEAR)
        c.put(CX + 20, 15, rdk); c.put(CX + 22, 14, rdk)
    elif kind == 'earrings':
        gdk, gmd, glt = PAL['yellow']
        for x in (10, 53):
            c.put(x, 36, gmd); c.rect(x - 1, 37, 3, 3, gmd); c.put(x - 1, 37, glt); c.put(x + 1, 39, gdk); c.put(x, 39, gdk)
            c.put(x - 1, 39, CLEAR); c.put(x + 1, 37, CLEAR)
    elif kind == 'apron':
        adk, amd, alt = PAL['leaf']
        c.rect(CX - 10, 56, 20, 8, amd); c.hline(CX - 10, CX + 9, 56, alt); c.vline(CX - 10, 56, 63, alt)
        c.hline(CX - 9, CX + 9, 57, adk)                                             # 가슴받이 윗선
        c.rect(CX - 11, 50, 2, 7, adk); c.rect(CX + 9, 50, 2, 7, adk)                # 어깨끈
        c.put(CX - 11, 50, amd); c.put(CX + 9, 50, amd)
        c.rect(CX - 4, 60, 8, 4, adk); c.hline(CX - 3, CX + 2, 61, amd)              # 주머니
        c.put(CX + 1, 61, hexc('ffd27a')); c.put(CX + 2, 61, PAL['orange'][1])       # 주머니 속 감귤
    return c


def acc_part(kind: str, context: Canvas) -> Canvas:
    return outline_layer(acc_raw(kind), context, None)


# ---------------------------------------------------------------- 조합
def portrait(skin: int, hair_style: int | str, hair_rgb: Color, top_rgb: Color,
             accs: tuple[str, ...] | list[str], expr: str = 'normal') -> Canvas:
    """face → top(tint) → hair(tint) → acc. 외곽선은 아래 레이어 기준으로 계산."""
    style = HAIR_STYLES[hair_style] if isinstance(hair_style, int) else hair_style
    f = face(skin, expr)
    t = tinted(top_part(f), top_rgb)
    ctx = _stack([f, t])
    h = tinted(hair_part(style, ctx), hair_rgb)
    out = _stack([ctx, h])
    for kind in accs:
        out = _stack([out, acc_part(kind, out)])
    return out


# ---------------------------------------------------------------- 고정 초상
def portrait_halmang() -> Canvas:
    c = portrait(0, 'updo', HAIR_RGB['grey'], TOP_RGB['pink'], (), 'happy')
    sdk = SKINS[0][0]
    # 깊은 홍조 + 눈가 주름
    for x0 in (12, 47):
        c.rect(x0, 32, 5, 4, BLUSH[0][0]); c.hline(x0 + 1, x0 + 2, 33, BLUSH[0][1])
    c.put(15, 27, sdk); c.put(14, 28, sdk); c.put(48, 27, sdk); c.put(49, 28, sdk)
    # 저고리 동정: 흰 V 깃
    wdk, wmd, wlt = PAL['white']
    for i in range(6):
        c.rect(CX - 7 + i, 53 + i, 3, 1, wlt); c.rect(CX + 4 - i, 53 + i, 3, 1, wmd)
    c.hline(CX - 8, CX - 6, 52, wlt); c.hline(CX + 5, CX + 7, 52, wmd)
    c.rect(CX - 1, 59, 2, 5, wlt); c.put(CX, 59, wmd); c.put(CX, 60, wmd)
    c.hline(CX - 2, CX - 1, 63, OUT); c.hline(CX, CX + 1, 63, OUT)
    # 감귤꽃 (쪽 옆): 흰 꽃잎 5장 + 노란 수술, 잎 하나
    fx, fy = CX + 10, 4
    wh, ye = hexc('ffffff'), PAL['yellow'][1]
    for dx, dy in ((-2, -1), (-2, 0), (-1, -2), (0, -2), (1, -1), (1, 0), (-1, 1), (0, 1)):
        c.put(fx + dx, fy + dy, wh)
    c.rect(fx - 1, fy - 1, 2, 2, ye)
    for dx, dy in ((-3, -1), (-3, 0), (-2, -2), (-1, -3), (0, -3), (1, -2), (2, -1), (2, 0), (1, 1), (0, 2), (-1, 2), (-2, 1)):
        c.put(fx + dx, fy + dy, OUT)
    c.put(fx + 2, fy + 1, PAL['leaf'][1]); c.put(fx + 3, fy + 2, PAL['leaf'][1]); c.put(fx + 3, fy + 1, PAL['leaf'][0]); c.put(fx + 4, fy + 2, PAL['leaf'][0])
    return c


def portrait_hero() -> Canvas:
    return portrait(0, 'short', HAIR_RGB['black'], TOP_RGB['white'], ('apron',), 'normal')


def portrait_samchun() -> Canvas:
    c = portrait(1, 'sport', HAIR_RGB['grey'], TOP_RGB['orange'], ('cap',), 'happy')
    dk = SKINS[1][0]
    c.hline(21, 23, 32, dk); c.hline(40, 42, 32, dk)                                # 눈가 웃음 주름
    g = hexc('8a8a90')
    c.hline(CX - 3, CX + 2, 35, g); c.put(CX - 4, 36, g); c.put(CX + 3, 36, g)     # 콧수염
    return c


def portrait_haenyeo() -> Canvas:
    c = portrait(2, 'short', HAIR_RGB['black'], hexc('3a3a44'), (), 'normal')
    dk = SKINS[2][0]
    # 검은 두건: 머리 전체를 덮고 얼굴 둘레만 연다
    hood = Canvas(W, H)
    hdk, hmd, hlt = hexc('1e1e26'), hexc('34343e'), hexc('55555f')
    profile(hood, 2, [8, 13, 16, 18, 19, 20, 21, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22], hmd)   # y 2~21
    for y in range(22, 50):                                                          # 양옆 얼굴 감싸기
        hood.rect(CX - 24, y, 5, 1, hmd); hood.rect(CX + 19, y, 5, 1, hmd)
    hood.rect(CX - 25, 50, 8, 4, hmd); hood.rect(CX + 17, 50, 8, 4, hmd)
    hood.hline(CX - 22, CX + 21, 21, hdk); hood.hline(CX - 21, CX + 20, 20, hdk)    # 이마 접힌 단
    hood.hline(CX - 8, CX + 7, 2, hlt); hood.hline(CX - 14, CX - 9, 3, hlt); hood.vline(CX - 19, 8, 14, hlt)
    hood.vline(CX - 20, 22, 48, hdk); hood.vline(CX + 19, 22, 48, hdk)
    c.blit(outline_layer(hood, c, None), 0, 0)
    c.hline(21, 23, 32, dk); c.hline(40, 42, 32, dk)                                # 햇볕 주름
    c.put(CX - 8, 42, dk); c.put(CX + 7, 42, dk)
    return c


def portrait_jangnim() -> Canvas:
    c = portrait(0, 'bald', HAIR_RGB['grey'], hexc('2f3d63'), ('glasses',), 'normal')
    wlt = PAL['white'][2]
    for i in range(5):                                                                # 흰 셔츠 깃
        c.rect(CX - 7 + i, 52 + i, 2, 1, wlt); c.rect(CX + 5 - i, 52 + i, 2, 1, wlt)
    c.rect(CX - 2, 56, 4, 8, wlt)
    c.rect(CX - 1, 57, 2, 7, PAL['red'][1]); c.put(CX, 58, PAL['red'][0]); c.rect(CX - 1, 61, 2, 3, PAL['red'][0])   # 넥타이
    ldk = hexc('232d4a')
    for i in range(7):                                                                # 라펠 그늘
        c.put(CX - 8 - i, 52 + i, ldk); c.put(CX + 7 + i, 52 + i, ldk)
        c.put(CX - 9 - i, 53 + i, ldk); c.put(CX + 8 + i, 53 + i, ldk)
    g = HAIR_RGB['grey']                                                             # 굵은 회색 눈썹
    c.rect(EYE_L - 1, 21, 7, 2, g); c.rect(EYE_R, 21, 7, 2, g)
    c.put(EYE_L - 1, 21, SKINS[0][1]); c.put(EYE_R + 6, 21, SKINS[0][1])
    return c


FIXED = {
    'halmang': portrait_halmang, 'hero': portrait_hero, 'samchun': portrait_samchun,
    'haenyeo': portrait_haenyeo, 'jangnim': portrait_jangnim,
}


# ---------------------------------------------------------------- 시트 + 검토 시트
def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    base_face = face(0, 'normal')
    for skin in range(len(SKINS)):
        for expr in EXPRS:
            s[f'pt_face_{skin}_{expr}'] = face(skin, expr)
    s['pt_top'] = top_part(base_face)
    ctx = _stack([base_face, top_part(base_face)])
    for style in HAIR_STYLES:
        s[f'pt_hair_{style}'] = hair_part(style, ctx)
    ctx2 = _stack([ctx, hair_part('short', ctx)])
    for kind in ACC_KINDS:
        s[f'pt_acc_{kind}'] = acc_part(kind, ctx2)
    for name, fn in FIXED.items():
        s[f'portrait_{name}'] = fn()
    return s


def portraits_preview(seed: int = 3, scale: int = 4) -> Canvas:
    """검토 시트(8열): 고정 5 / 무작위 조합 12(머리 8종이 한 번씩은 나오도록) / 한 얼굴의 표정 4."""
    from sheet import contact_sheet
    rng = random.Random(seed)
    cells: dict[str, Canvas] = {}
    for name, fn in FIXED.items():
        cells[name] = fn()
    for i in range(3):
        cells[f'pad{i}'] = Canvas(W, H)
    hair_keys, top_keys = list(HAIR_RGB), list(TOP_RGB)
    order = ('apron', 'earrings', 'glasses', 'headband', 'cap', 'strawhat')
    for i in range(12):
        accs = rng.sample(ACC_KINDS, rng.choice((0, 1, 1, 2)))
        if 'cap' in accs and 'strawhat' in accs:                                  # 모자는 하나만
            accs.remove('cap')
        accs.sort(key=order.index)
        cells[f'r{i}'] = portrait(rng.randrange(len(SKINS)), i % len(HAIR_STYLES),
                                  HAIR_RGB[rng.choice(hair_keys)], TOP_RGB[rng.choice(top_keys)], accs, rng.choice(EXPRS))
    for i in range(4):
        cells[f'pad{3 + i}'] = Canvas(W, H)
    for expr in EXPRS:
        cells[f'e_{expr}'] = portrait(0, 'bob', HAIR_RGB['dark'], TOP_RGB['yellow'], (), expr)
    return contact_sheet(cells, cols=8, scale=scale)


if __name__ == '__main__':
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    portraits_preview().save(os.path.join(here, 'out', 'portraits_preview.png'))
    print('portraits_preview.png written')
