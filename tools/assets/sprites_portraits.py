"""초상 파츠 시스템 (정면, 48×48 원본 → UI에서 2배 96px 표시).
카이로소프트 치비 흉상: 머리 큰 3등신, 어깨까지. 점 눈(4×4: 짙은 테 + 안쪽 2×2 + 하이라이트 1픽셀), 눈썹 1줄, 볼터치,
작은 입(웃음·평·놀람), 머리카락 덩어리 2~3단 셰이딩, 상의 칼라. 흰자·속눈썹·`^^` 감은 눈 없음.
걷기 몸(sprites_chars)과는 별개 파츠다. 고정 인물은 sprites_portraits_named.py.

레이어(아래→위)와 시트 이름(모두 48×48):
  pt_face_{skin}_{shape}   12장  얼굴 바탕(얼굴·목·귀·볼). 피부 4종 × 얼굴형 3종(round·slim·square). tint 없음.
  pt_eyes_{kind}_{expr}     9장  눈+눈썹. 눈 3종(round·narrow·droop) × 표정 3종(normal·happy·surprised). 고유색.
  pt_mouth_{expr}           3장  입 3종.
  pt_top(_gloss)            2장  어깨·칼라. 흰 3톤 → tint = 상의색 (+ 광택).
  pt_hair_{style}(_gloss)  24장  머리 12종. 흰 3톤 → tint = 머리색 (+ 광택).
  pt_acc_{kind}            12장  액세서리, 고유색.

tint 파츠는 #ffffff가 본색, #c4c4c4가 그늘, #8c8c8c가 깊은 그늘(안쪽 경계선). 하이라이트는 tint로 못 내므로
반투명 흰 광택 레이어 pt_top_gloss / pt_hair_{style}_gloss 를 tint 뒤에 따로 얹는다.
합성 순서: face → top(+gloss) → hair(+gloss) → eyes → mouth → acc. 외곽선은 아래 레이어 위에 얹힌 상태로 계산한다(outline_layer).
"""
from __future__ import annotations
import random
from px import Canvas, PAL, OUT, hexc, Color
from sprites_chars import HAIR_RGB, TOP_RGB, tinted

CLEAR = (0, 0, 0, 0)
G = 48                                    # 격자 = 출력 크기
CX = 24                                   # 중심: x 23 | 24 사이

# tint용 흰 3톤(본색 흰 = tint 색 그대로, 그늘은 곱셈으로 어둡게) + 하이라이트 표식.
# tint(곱셈)로는 본색보다 밝은 색을 낼 수 없어서, T_HI 픽셀은 split_gloss()로 떼어 반투명 흰 '광택' 레이어(pt_*_gloss)로 따로 얹는다.
T_HI, T_BASE, T_MD, T_DK = (255, 255, 254, 255), hexc('ffffff'), hexc('c4c4c4'), hexc('8c8c8c')
GLOSS: Color = (255, 255, 255, 96)


def split_gloss(part: Canvas) -> tuple[Canvas, Canvas]:
    """T_HI 픽셀 → (본색으로 바꾼 파츠, 반투명 흰 광택 레이어)."""
    base, gloss = part.copy(), Canvas(part.w, part.h)
    for y in range(part.h):
        for x in range(part.w):
            if part.px[y][x] == T_HI:
                base.px[y][x] = T_BASE
                gloss.px[y][x] = GLOSS
    return base, gloss

# 피부 4종 (DK, MD, LT): 밝음·보통·탄 피부·짙음
SKINS: tuple[tuple[Color, Color, Color], ...] = (
    (hexc('e8a97e'), hexc('f7cfa8'), hexc('ffe4cc')),
    (hexc('c98a58'), hexc('e6b587'), hexc('f4cfa6')),
    (hexc('a86a3c'), hexc('cf9462'), hexc('e2b184')),
    (hexc('6f4426'), hexc('9a6540'), hexc('b8825a')),
)
BLUSH: tuple[Color, ...] = (hexc('ffb0bd'), hexc('f09a8c'), hexc('d9826d'), hexc('b86a55'))
EYE_RING, EYE_IN, GLINT = hexc('2b2118'), hexc('4a3328'), hexc('ffffff')
BROW = hexc('4a3328')
MOUTH_IN, MOUTH_LINE = hexc('e8788f'), hexc('7a3a3a')

HAIR_STYLES = ('bob', 'short', 'pony', 'perm', 'updo', 'sport', 'long', 'bald',   # 0..7 = 걷기 몸과 같은 순서
               'part', 'bangs', 'braid', 'bun')                                    # 8..11 초상 전용 변형
FACE_SHAPES = ('round', 'slim', 'square')
EYE_KINDS = ('round', 'narrow', 'droop')
EXPRS = ('normal', 'happy', 'surprised')
ACC_KINDS = ('glasses', 'sunglasses', 'strawhat', 'cap', 'beanie', 'ribbon', 'headphone', 'flower', 'towel',
             'apron', 'camera', 'backpack')


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


def stack(layers: list[Canvas]) -> Canvas:
    c = Canvas(G, G)
    for l in layers:
        c.blit(l, 0, 0)
    return c


# ---------------------------------------------------------------- 얼굴 바탕
FACE_Y = 7
FACE_HW = {
    'round':  [6, 9, 11, 12, 13, 14, 14, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 14, 13, 12, 10, 7, 4],
    'slim':   [6, 9, 11, 12, 13, 13, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 13, 13, 12, 12, 11, 10, 8, 6, 3],
    'square': [7, 10, 12, 13, 14, 14, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 14, 12, 9, 5],
}
NECK_X0, NECK_W = 20, 8                   # 목 x 20~27
EYE_Y = 21                                # 눈 y 21~24
EYE_L, EYE_R = 15, 29                     # 왼눈 x 15~18, 오른눈 x 29~32 (사이 10칸)
BROW_Y = 18
MOUTH_Y = 29
EAR_Y = 19


def face_raw(skin: int, shape: str) -> Canvas:
    dk, md, lt = SKINS[skin]
    c = Canvas(G, G)
    c.rect(NECK_X0, 32, NECK_W, 8, md)                             # 목 y 32~39
    c.rect(NECK_X0, 34, NECK_W, 2, dk)                             # 턱 밑 그늘
    profile(c, FACE_Y, FACE_HW[shape], md)
    hws = FACE_HW[shape]
    for i, hw in enumerate(hws):                                   # 볼·턱 아래쪽 그늘 1px(오른쪽 아래)
        y = FACE_Y + i
        if i >= len(hws) - 6:
            c.put(CX + hw - 1, y, dk)
            if i >= len(hws) - 3:
                c.hline(CX - hw + 2, CX + hw - 2, y, dk) if i == len(hws) - 1 else None
    c.hline(CX - 8, CX + 6, FACE_Y + 2, lt); c.hline(CX - 10, CX + 8, FACE_Y + 3, lt)   # 이마 하이라이트
    c.hline(CX - 11, CX - 6, FACE_Y + 4, lt)
    for x0 in (7, 39):                                             # 귀 2×5 (y 19~23) + 안쪽 그늘
        c.rect(x0, EAR_Y, 2, 5, md)
        c.put(x0 + (1 if x0 < CX else 0), EAR_Y + 1, dk); c.put(x0 + (1 if x0 < CX else 0), EAR_Y + 2, dk)
    c.rect(11, 25, 4, 2, BLUSH[skin]); c.rect(33, 25, 4, 2, BLUSH[skin])                # 볼터치 4×2
    c.put(11, 25, md); c.put(36, 25, md)
    return c


def face(skin: int, shape: str) -> Canvas:
    return outline_layer(face_raw(skin, shape), Canvas(G, G), None)


# ---------------------------------------------------------------- 눈·눈썹·입 (고유색)
def eye(c: Canvas, x0: int, y0: int, h: int, kind: str, right: bool) -> None:
    """4×h 점 눈: 짙은 테 + 안쪽 2×(h-2) + 왼쪽 위 하이라이트 1픽셀."""
    c.rect(x0, y0, 4, h, EYE_RING)
    c.rect(x0 + 1, y0 + 1, 2, h - 2, EYE_IN)
    for cx_, cy_ in ((x0, y0), (x0 + 3, y0), (x0, y0 + h - 1), (x0 + 3, y0 + h - 1)):   # 모서리 깎아 둥근 점
        c.put(cx_, cy_, CLEAR)
    outer, inner = (x0 + 2, x0 + 1) if right else (x0 + 1, x0 + 2)
    if kind == 'narrow':                                           # 바깥 위·안쪽 아래를 깎아 살짝 치켜뜬 눈매
        c.put(outer, y0, CLEAR); c.put(inner, y0 + h - 1, CLEAR)
    elif kind == 'droop':                                          # 바깥 위만 깎아 순한 눈
        c.put(outer, y0, CLEAR)
    c.put(x0 + 1, y0 + 1, GLINT)


def eyes_raw(kind: str, expr: str) -> Canvas:
    c = Canvas(G, G)
    if expr == 'surprised':
        eye(c, EYE_L, EYE_Y - 1, 5, kind, False); eye(c, EYE_R, EYE_Y - 1, 5, kind, True)
        by = BROW_Y - 2
    elif expr == 'happy':
        eye(c, EYE_L, EYE_Y, 4, kind, False); eye(c, EYE_R, EYE_Y, 4, kind, True)
        c.put(EYE_L + 2, EYE_Y + 2, GLINT); c.put(EYE_R + 2, EYE_Y + 2, GLINT)   # 두 번째 반짝
        by = BROW_Y
    else:
        eye(c, EYE_L, EYE_Y, 4, kind, False); eye(c, EYE_R, EYE_Y, 4, kind, True)
        by = BROW_Y
    if kind == 'droop':                                            # 눈썹 바깥쪽이 내려감
        c.hline(EYE_L, EYE_L + 2, by, BROW); c.put(EYE_L + 3, by + 1, BROW)
        c.hline(EYE_R + 1, EYE_R + 3, by, BROW); c.put(EYE_R, by + 1, BROW)
    elif kind == 'narrow':                                         # 살짝 올라간 눈썹
        c.hline(EYE_L + 1, EYE_L + 3, by, BROW); c.put(EYE_L, by + 1, BROW)
        c.hline(EYE_R, EYE_R + 2, by, BROW); c.put(EYE_R + 3, by + 1, BROW)
    else:
        c.hline(EYE_L, EYE_L + 3, by, BROW); c.hline(EYE_R, EYE_R + 3, by, BROW)
    return c


def mouth_raw(expr: str) -> Canvas:
    c = Canvas(G, G)
    y = MOUTH_Y
    if expr == 'normal':                                           # 작은 미소 (양 끝 1px 올라감)
        c.hline(CX - 2, CX + 1, y, MOUTH_LINE); c.put(CX - 3, y - 1, MOUTH_LINE); c.put(CX + 2, y - 1, MOUTH_LINE)
    elif expr == 'happy':                                          # 열린 웃음 6×3, 안은 분홍
        c.rect(CX - 2, y - 1, 4, 2, MOUTH_IN)
        c.vline(CX - 3, y - 2, y, MOUTH_LINE); c.vline(CX + 2, y - 2, y, MOUTH_LINE)
        c.hline(CX - 2, CX + 1, y + 1, MOUTH_LINE)
        c.hline(CX - 2, CX + 1, y - 1, hexc('ffffff'))            # 윗니 한 줄
    elif expr == 'surprised':                                      # 작은 o
        c.rect(CX - 1, y - 1, 2, 2, MOUTH_IN)
        c.vline(CX - 2, y - 1, y, MOUTH_LINE); c.vline(CX + 1, y - 1, y, MOUTH_LINE)
        c.hline(CX - 1, CX, y - 2, MOUTH_LINE); c.hline(CX - 1, CX, y + 1, MOUTH_LINE)
    return c


# ---------------------------------------------------------------- 어깨·칼라 (흰 4톤)
TOP_Y = 37
TOP_HW = [11, 15, 18, 20, 22, 23, 24, 24, 24, 24, 24]              # y 37~47


def top_raw() -> Canvas:
    c = Canvas(G, G)
    profile(c, TOP_Y, TOP_HW, T_BASE)
    row(c, 37, 4, CLEAR); row(c, 38, 4, CLEAR); row(c, 39, 3, CLEAR)     # 목선 개구부 (V)
    for y, hw in ((37, 6), (38, 6), (39, 5), (40, 4)):                  # 칼라 하이라이트(양쪽 깃)
        mirror(c, CX - hw, y, T_HI); mirror(c, CX - hw + 1, y, T_HI)
    c.hline(CX - 3, CX + 2, 40, T_HI); c.hline(CX - 2, CX + 1, 41, T_HI)
    for y, hw in ((37, 7), (38, 7), (39, 6), (40, 5), (41, 4)):         # 깃 아래 그늘 선
        mirror(c, CX - hw, y, T_MD)
    c.hline(CX - 11, CX - 7, 37, T_HI); c.hline(CX + 6, CX + 10, 37, T_HI)   # 어깨 윗줄 빛
    c.hline(CX - 15, CX - 12, 38, T_HI); c.hline(CX + 11, CX + 14, 38, T_HI)
    for y in range(42, 48):                                             # 팔 경계 그늘
        mirror(c, CX - 13, y, T_MD)
    for y in range(45, 48):
        mirror(c, CX - 14, y, T_MD)
    return c


def top_part(context: Canvas) -> Canvas:
    return outline_layer(top_raw(), context, T_DK)


# ---------------------------------------------------------------- 머리 (흰 4톤)
CAP_Y = 1
CAP_HW = [6, 10, 12, 13, 14, 15, 15, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16]    # y 1~17


def band(c: Canvas, y: int, x0: int = CX - 10, x1: int = CX - 2) -> None:
    """하이라이트 띠: 왼쪽 위 호, 2px 굵기."""
    c.rect(x0, y, x1 - x0 + 1, 2, T_HI); c.rect(x0 - 3, y + 1, 3, 2, T_HI); c.rect(x1 + 1, y - 1, 3, 2, T_HI)
    c.put(x0 - 4, y + 3, T_HI); c.put(x1 + 4, y - 1, T_HI)


def bangs(c: Canvas, y: int, tips: tuple[int, ...], w: int = 3, depth: int = 2) -> None:
    """앞머리 밑단 y줄 아래로 w칸 너비·depth줄 깊이의 가닥. 가닥 왼쪽 위는 그늘."""
    for tx in tips:
        c.rect(tx, y + 1, w, depth, T_BASE)
        c.put(tx + w - 1, y + depth, T_MD)
    c.hline(CX - 16, CX + 15, y, T_MD)                             # 밑단 그늘 줄


def side_lock(c: Canvas, x_out: int, y0: int, y1: int, w: int) -> None:
    """얼굴 옆으로 흘러내린 머리(좌우 대칭). 안쪽 세로 그늘 + 아래 1줄 그늘."""
    mirror_rect(c, x_out, y0, w, y1 - y0 + 1, T_BASE)
    mirror_rect(c, x_out + w - 1, y0, 1, y1 - y0 + 1, T_MD)
    mirror_rect(c, x_out, y1, w, 1, T_MD)


def cap(c: Canvas, hws: list[int] = CAP_HW, y0: int = CAP_Y) -> None:
    profile(c, y0, hws, T_BASE)
    band(c, y0 + 3)
    for i, hw in enumerate(hws):                                   # 오른쪽·아래 그늘 2px
        y = y0 + i
        if i >= 2:
            c.hline(CX + hw - 2, CX + hw - 1, y, T_MD)


def hair_raw(style: str) -> Canvas:
    c = Canvas(G, G)
    if style == 'bald':
        side_lock(c, 5, 13, 21, 2)                                 # 귀 바깥쪽 옆머리만
        c.rect(CX - 16, 12, 6, 2, T_BASE); c.rect(CX + 10, 12, 6, 2, T_BASE)
        return c
    if style == 'sport':                                           # 모자 밑 짧은 머리: 딱 맞는 캡 + 삐죽 3개
        cap(c, [5, 9, 11, 13, 14, 14, 15, 15, 15, 15, 15], 3)      # y 3~13
        c.rect(CX - 9, 2, 3, 1, T_BASE); c.rect(CX - 2, 1, 4, 2, T_BASE); c.rect(CX + 6, 2, 3, 1, T_BASE)
        c.hline(CX - 15, CX + 14, 13, T_MD)
        side_lock(c, 7, 13, 17, 2)
        return c
    if style in ('updo', 'bun'):                                   # 올림머리·묶음: 이마 넓게 + 정수리 쪽
        cap(c, [8, 11, 13, 14, 15, 15, 16, 16, 16], 4)             # y 4~12
        c.hline(CX - 15, CX + 14, 12, T_MD)
        side_lock(c, 8, 12, 17, 3)
        if style == 'updo':
            profile(c, 0, [3, 5, 6, 6, 5], T_BASE); c.hline(CX - 4, CX + 3, 4, T_MD)   # 위로 올린 쪽
            c.hline(CX - 4, CX - 1, 1, T_HI)
        else:
            c.rect(CX + 6, 2, 8, 6, T_BASE); c.rect(CX + 7, 1, 6, 1, T_BASE)           # 옆으로 묶은 둥근 쪽
            c.rect(CX + 12, 3, 2, 4, T_MD); c.hline(CX + 7, CX + 9, 2, T_HI)
            c.rect(CX + 5, 5, 2, 2, T_DK)                                            # 머리끈
        return c
    if style == 'perm':
        profile(c, 0, [5, 9, 12, 14, 15, 16, 16, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17], T_BASE)   # y 0~17
        band(c, 3, CX - 11, CX - 3)
        for x in range(CX - 17, CX + 17, 5):                       # 밑단 둥근 혹
            c.rect(x, 18, 4, 2, T_BASE); c.put(x + 3, 19, T_MD)
        c.hline(CX - 16, CX + 15, 17, T_MD)
        for y0 in (12, 18, 24):                                    # 옆 뭉치 3단
            mirror_rect(c, 4, y0, 4, 6, T_BASE); mirror_rect(c, 3, y0 + 1, 1, 4, T_BASE)
            mirror_rect(c, 4, y0 + 5, 4, 1, T_MD); mirror_rect(c, 7, y0, 1, 6, T_MD)
        return c
    cap(c)                                                         # 공통 캡 y 1~17
    if style == 'short':
        bangs(c, 17, (8, 14, 21, 28, 35))
        side_lock(c, 7, 16, 21, 2)
    elif style == 'part':                                          # 가르마: 왼쪽에서 갈라진 앞머리
        c.rect(CX - 16, 18, 10, 3, T_BASE); c.rect(CX - 4, 18, 20, 2, T_BASE)   # 양쪽 큰 덩어리
        c.put(CX - 7, 20, T_MD); c.hline(CX - 4, CX + 15, 19, T_MD); c.hline(CX - 16, CX - 7, 20, T_MD)
        c.vline(CX - 5, 13, 18, T_MD)                                            # 가르마 선
        side_lock(c, 7, 16, 22, 2)
    elif style == 'bob':
        bangs(c, 17, (8, 14, 21, 28, 35))
        side_lock(c, 5, 14, 31, 4)
        mirror_rect(c, 5, 30, 5, 2, T_BASE); mirror_rect(c, 5, 31, 5, 1, T_MD)   # 밑단 안쪽으로 말림
    elif style == 'bangs':                                         # 뱅헤어: 일자 앞머리 + 단발
        c.hline(CX - 16, CX + 15, 17, T_MD)
        c.rect(CX - 14, 18, 28, 2, T_BASE); c.hline(CX - 14, CX + 13, 19, T_MD)
        side_lock(c, 5, 14, 33, 4)
    elif style == 'long':
        bangs(c, 17, (8, 14, 21, 28, 35))
        side_lock(c, 4, 14, 36, 4)
        mirror_rect(c, 2, 30, 7, 14, T_BASE); mirror_rect(c, 2, 43, 7, 1, T_MD)   # 어깨 위로 흘러내림
        mirror_rect(c, 8, 30, 1, 13, T_MD)
    elif style == 'braid':                                         # 땋음: 앞머리 + 한쪽 땋은 머리
        bangs(c, 17, (8, 14, 21, 28, 35))
        side_lock(c, 6, 14, 22, 3)
        for i, y0 in enumerate(range(22, 46, 4)):                  # 오른쪽 어깨로 땋음 (마디 6칸)
            c.rect(CX + 12, y0, 6, 4, T_BASE); c.hline(CX + 12, CX + 17, y0 + 3, T_MD)
            c.put(CX + 12 + (i % 2) * 3, y0 + 1, T_MD); c.put(CX + 13 + ((i + 1) % 2) * 3, y0, T_HI)
        c.rect(CX + 13, 45, 4, 2, T_DK)                                            # 머리끈
    elif style == 'pony':
        bangs(c, 17, (8, 14, 21, 28, 35))
        side_lock(c, 7, 16, 20, 2)
        c.rect(CX + 9, 0, 8, 3, T_BASE); c.rect(CX + 15, 2, 5, 4, T_BASE)      # 높이 묶은 꼬리
        c.rect(CX + 17, 5, 5, 16, T_BASE); c.vline(CX + 21, 6, 20, T_MD); c.hline(CX + 17, CX + 21, 20, T_MD)
        c.vline(CX + 18, 6, 15, T_HI)
        c.rect(CX + 13, 3, 3, 3, T_DK)                                         # 머리끈
    return c


def hair_part(style: str, context: Canvas) -> Canvas:
    return outline_layer(hair_raw(style), context, T_DK)


# ---------------------------------------------------------------- 액세서리 (고유색)
def acc_raw(kind: str) -> Canvas:
    c = Canvas(G, G)
    if kind == 'strawhat':
        ydk, ymd, ylt = PAL['yellow']
        profile(c, 0, [9, 12, 13, 13, 13, 13, 13, 13, 13], ymd)                  # 크라운 y 0~8
        c.hline(CX - 10, CX - 2, 1, ylt); c.hline(CX - 12, CX - 10, 2, ylt)
        c.rect(CX - 13, 6, 26, 2, PAL['red'][1]); c.hline(CX - 13, CX + 12, 7, PAL['red'][0])   # 띠
        c.rect(CX - 22, 9, 44, 3, ymd); c.hline(CX - 22, CX + 21, 9, ylt); c.hline(CX - 22, CX + 21, 11, ydk)   # 챙 y 9~11
        c.hline(CX - 21, CX + 20, 12, ydk)
    elif kind == 'cap':
        bdk, bmd, blt = PAL['sky']
        profile(c, 0, [7, 11, 13, 14, 15, 16, 16, 16, 16, 16], bmd)               # 크라운 y 0~9
        c.hline(CX - 9, CX - 2, 1, blt); c.hline(CX - 12, CX - 9, 2, blt); c.hline(CX - 13, CX - 12, 3, blt)
        c.rect(CX - 2, 0, 4, 1, bdk)                                              # 꼭지
        c.rect(CX - 3, 4, 6, 4, PAL['orange'][1]); c.put(CX - 1, 3, PAL['leaf'][1])   # 감귤 패치
        c.rect(CX - 19, 10, 38, 3, bdk); c.hline(CX - 19, CX + 18, 10, bmd)      # 챙 y 10~12
    elif kind == 'beanie':
        rdk, rmd, rlt = PAL['red']
        profile(c, 0, [6, 10, 13, 14, 15, 16, 16, 17, 17, 17, 17, 17, 17, 17], rmd)   # y 0~13
        c.hline(CX - 9, CX - 2, 2, rlt); c.hline(CX - 12, CX - 9, 3, rlt)
        c.rect(CX - 17, 11, 34, 4, rmd); c.hline(CX - 17, CX + 16, 11, rlt); c.hline(CX - 17, CX + 16, 14, rdk)   # 접은 단
        for x in range(CX - 16, CX + 16, 3):
            c.vline(x, 12, 13, rdk)
        c.rect(CX - 2, 0, 4, 1, PAL['white'][1])                                  # 방울
    elif kind in ('glasses', 'sunglasses'):
        fr = hexc('3b3b44')
        for x0 in (EYE_L - 2, EYE_R - 2):                                         # 8×7 테 (안은 비움)
            c.rect(x0, EYE_Y - 2, 8, 7, fr)
            if kind == 'glasses':
                c.rect(x0 + 1, EYE_Y - 1, 6, 5, CLEAR); c.put(x0 + 6, EYE_Y - 1, hexc('8ec1f0'))
            else:
                c.rect(x0 + 1, EYE_Y - 1, 6, 5, hexc('2a2a3a')); c.hline(x0 + 1, x0 + 3, EYE_Y - 1, hexc('55556a'))
        c.hline(EYE_L + 6, EYE_R - 3, EYE_Y, fr)                                   # 브리지
        c.hline(8, EYE_L - 3, EYE_Y, fr); c.hline(EYE_R + 6, 39, EYE_Y, fr)        # 안경다리
    elif kind == 'ribbon':
        pdk, pmd, plt = PAL['pink']
        rx, ry = CX + 8, 4                                                        # 머리 오른쪽 위
        for w, y in ((2, ry), (4, ry + 1), (5, ry + 2), (5, ry + 3), (4, ry + 4), (2, ry + 5)):
            c.rect(rx - w - 1, y, w, 1, pmd); c.rect(rx + 2, y, w, 1, pmd)
        c.rect(rx - 1, ry + 1, 3, 4, pdk); c.put(rx, ry + 2, plt)
        c.put(rx - 5, ry + 1, plt); c.put(rx + 3, ry + 1, plt)
    elif kind == 'headphone':
        bdk, bmd, blt = PAL['basalt']
        for i, hw in enumerate((11, 14, 16, 17, 18, 18)):                          # 헤드밴드 호 y 0~5
            c.put(CX - hw, i, bdk); c.put(CX + hw - 1, i, bdk)
            c.put(CX - hw + 1, i, bmd); c.put(CX + hw - 2, i, bmd)
        c.hline(CX - 10, CX + 9, 0, bdk); c.hline(CX - 10, CX + 9, 1, bmd)
        mirror_rect(c, 3, 6, 2, 12, bdk)                                          # 옆 줄
        mirror_rect(c, 3, 17, 6, 8, bmd); mirror_rect(c, 3, 17, 6, 1, blt)         # 이어컵 6×8
        mirror_rect(c, 4, 19, 3, 4, PAL['orange'][1])
    elif kind == 'flower':
        fx, fy = CX + 11, 8                                                       # 머리 오른쪽에 감귤꽃
        odk, omd, olt = PAL['orange']
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, -1), (-1, 1), (1, 1)):
            c.rect(fx + dx - 1, fy + dy - 1, 2, 2, hexc('ffffff'))
        c.rect(fx - 1, fy - 1, 2, 2, PAL['yellow'][1])
        c.rect(fx + 1, fy + 3, 3, 2, PAL['leaf'][1]); c.put(fx + 3, fy + 4, PAL['leaf'][0])
    elif kind == 'towel':                                                         # 머리에 두른 수건 (농부)
        wdk, wmd, wlt = PAL['white']
        c.rect(CX - 16, 6, 32, 6, wmd); c.hline(CX - 16, CX + 15, 6, wlt); c.hline(CX - 16, CX + 15, 11, wdk)
        c.rect(CX - 15, 4, 30, 2, wmd)
        for x in range(CX - 14, CX + 14, 4):
            c.vline(x, 7, 9, PAL['sky'][1])
        c.rect(CX + 15, 8, 5, 6, wmd); c.rect(CX + 16, 10, 3, 5, wmd); c.hline(CX + 16, CX + 18, 14, wdk)   # 매듭 자락
    elif kind == 'apron':
        adk, amd, alt = PAL['leaf']
        c.rect(CX - 7, 42, 14, 6, amd); c.hline(CX - 7, CX + 6, 42, alt)          # 가슴받이
        mirror_rect(c, CX - 8, 38, 2, 4, adk)                                     # 어깨끈
        c.rect(CX - 3, 45, 6, 3, adk)                                             # 주머니
    elif kind == 'camera':
        bdk, bmd, blt = PAL['basalt']
        for i in range(6):                                                        # 목에 건 끈
            c.put(CX - 8 + i, 38 + i, bdk); c.put(CX + 7 - i, 38 + i, bdk)
        c.rect(CX - 5, 43, 10, 5, bmd); c.hline(CX - 5, CX + 4, 43, blt)          # 카메라 몸통
        c.rect(CX - 1, 44, 3, 3, bdk); c.put(CX, 45, hexc('8ec1f0'))
        c.rect(CX + 2, 42, 2, 1, PAL['red'][1])
    elif kind == 'backpack':
        odk, omd, olt = PAL['orange']
        mirror_rect(c, CX - 13, 37, 4, 11, omd); mirror_rect(c, CX - 13, 37, 1, 11, olt)   # 어깨끈 2줄
        mirror_rect(c, CX - 10, 37, 1, 11, odk)
    return c


def acc_part(kind: str, context: Canvas) -> Canvas:
    return outline_layer(acc_raw(kind), context, None)


# ---------------------------------------------------------------- 조합
def compose(skin: int, hair_style: int | str, hair_rgb: Color, top_rgb: Color,
            accs: tuple[str, ...] | list[str], expr: str = 'normal', shape: str = 'round', eyes: str = 'round',
            extra: Canvas | None = None) -> Canvas:
    """face → top(tint) → hair(tint) → [extra] → eyes → mouth → acc. 외곽선은 아래 레이어 기준. 48×48.
    extra는 머리 위·표정 아래에 얹는 고정 인물용 그림(모자·후드 등, 이미 색이 칠해진 것)."""
    style = HAIR_STYLES[hair_style] if isinstance(hair_style, int) else hair_style
    f = face(skin, shape)
    tb, tg = split_gloss(top_part(f))
    ctx = stack([f, tinted(tb, top_rgb), tg])
    hb, hg = split_gloss(hair_part(style, ctx))
    out = stack([ctx, tinted(hb, hair_rgb), hg])
    if extra is not None:
        out = stack([out, outline_layer(extra, out, None)])
    out = stack([out, eyes_raw(eyes, expr), mouth_raw(expr)])
    for kind in accs:
        out = stack([out, acc_part(kind, out)])
    return out


def portrait(*args, **kwargs) -> Canvas:
    return compose(*args, **kwargs)


# ---------------------------------------------------------------- 시트 + 검토 시트
def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    base_face = face(0, 'round')
    for skin in range(len(SKINS)):
        for shape in FACE_SHAPES:
            s[f'pt_face_{skin}_{shape}'] = face(skin, shape)
    for kind in EYE_KINDS:
        for expr in EXPRS:
            s[f'pt_eyes_{kind}_{expr}'] = eyes_raw(kind, expr)
    for expr in EXPRS:
        s[f'pt_mouth_{expr}'] = mouth_raw(expr)
    s['pt_top'], s['pt_top_gloss'] = split_gloss(top_part(base_face))
    ctx = stack([base_face, top_part(base_face)])
    for style in HAIR_STYLES:
        s[f'pt_hair_{style}'], s[f'pt_hair_{style}_gloss'] = split_gloss(hair_part(style, ctx))
    ctx2 = stack([ctx, hair_part('short', ctx)])
    for kind in ACC_KINDS:
        s[f'pt_acc_{kind}'] = acc_part(kind, ctx2)
    return s


def portraits_preview(seed: int = 3, scale: int = 3) -> Canvas:
    """검토 시트(8열): 머리 12종 / 액세서리 12종 / 얼굴형×피부 12 / 표정 3 × 눈 3 / 무작위 8."""
    from sheet import contact_sheet
    rng = random.Random(seed)
    cells: dict[str, Canvas] = {}
    hair_keys, top_keys = list(HAIR_RGB), list(TOP_RGB)
    for i, style in enumerate(HAIR_STYLES):
        cells[f'h_{style}'] = compose(i % 4, style, HAIR_RGB[hair_keys[i % len(hair_keys)]], TOP_RGB[top_keys[i % len(top_keys)]], ())
    for i in range(4):
        cells[f'pad0_{i}'] = Canvas(G, G)
    for i, kind in enumerate(ACC_KINDS):
        cells[f'a_{kind}'] = compose(i % 4, 'short' if kind not in ('ribbon', 'flower') else 'bob', HAIR_RGB['dark'], TOP_RGB['sky'], (kind,))
    for i in range(4):
        cells[f'pad1_{i}'] = Canvas(G, G)
    for skin in range(4):
        for shape in FACE_SHAPES:
            cells[f'f_{skin}_{shape}'] = compose(skin, 'bald', HAIR_RGB['grey'], TOP_RGB['white'], (), shape=shape)
    for i in range(4):
        cells[f'pad2_{i}'] = Canvas(G, G)
    for eyes in EYE_KINDS:
        for expr in EXPRS:
            cells[f'e_{eyes}_{expr}'] = compose(0, 'bob', HAIR_RGB['dark'], TOP_RGB['yellow'], (), expr, eyes=eyes)
    for i in range(7):
        cells[f'pad3_{i}'] = Canvas(G, G)
    for i in range(8):
        accs = rng.sample(ACC_KINDS, rng.choice((0, 1, 1, 2)))
        cells[f'r{i}'] = compose(rng.randrange(len(SKINS)), rng.randrange(len(HAIR_STYLES)), HAIR_RGB[rng.choice(hair_keys)],
                                 TOP_RGB[rng.choice(top_keys)], accs, rng.choice(EXPRS), rng.choice(FACE_SHAPES), rng.choice(EYE_KINDS))
    return contact_sheet(cells, cols=8, scale=scale)


if __name__ == '__main__':
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    portraits_preview().save(os.path.join(here, 'out', 'portraits_preview.png'))
    print('portraits_preview.png written')
