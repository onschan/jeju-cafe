"""초상 파츠 시스템 (정면). 카이로소프트 치비: 큰 둥근 머리, 점 눈(흰자·속눈썹·눈썹 없음, 표정 모두 점 눈), 발그레한 볼, 작은 입, 밑에 깃·어깨.
걷기 몸(sprites_chars)과는 별개 파츠다.

32×32 격자에 그리고 2배로 키워 64×64로 내보낸다. 월드 스프라이트가 1.5~3배로 그려지므로 초상도 같은 굵기의 도트로 보이게 한다.
(64 격자에 1px 디테일을 넣으면 옆의 월드보다 '매끈한 일러스트'처럼 보인다.)

레이어(아래→위)와 시트 이름(모두 64×64):
  pt_face_{skin}_{expr}   12장  얼굴 바탕(얼굴·목·귀·눈·입·볼). 피부 3종 × 표정 4종. tint 없음.
  pt_top                   1장  어깨·깃. 흰 4톤 → Pixi tint = 상의색.
  pt_hair_{style}          8장  머리 8종(정면). 흰 4톤 → tint = 머리색.
  pt_acc_{kind}            6장  액세서리 6종, 고유색.
  portrait_{name}          5장  고정 초상(할망·주인공·삼춘·해녀·이장님). icons/로도 내보낸다.

tint 파츠는 흰(#ffffff)이 하이라이트 띠, #e4e4e4가 본색, #b4b4b4가 그늘, #848484가 깊은 그늘(안쪽 경계선).
합성 순서: face → top → hair → acc. 각 파츠 외곽선은 아래 레이어 위에 얹힌 상태로 계산한다:
바깥 실루엣은 OUT, 아래 레이어와 맞닿는 가장자리는 파츠의 깊은 그늘 톤(머리카락-이마 경계선, 깃-목 경계선).
얼굴 안쪽에는 투명 픽셀을 두지 않는다(외곽선 계산이 구멍을 선으로 바꾼다). 톤은 2~3단만, 안티에일리어싱·1px 잔디테일 없음.
"""
from __future__ import annotations
import random
from px import Canvas, PAL, OUT, hexc, Color
from sprites_chars import SKINS, HAIR_RGB, TOP_RGB, tinted

CLEAR = (0, 0, 0, 0)
G = 32                                    # 작업 격자
SCALE = 2                                 # 내보내기 배율 (64×64)
CX = 16                                   # 중심: x 15 | 16 사이

# tint용 흰 4톤
T_HI, T_BASE, T_MD, T_DK = hexc('ffffff'), hexc('e4e4e4'), hexc('b4b4b4'), hexc('848484')

HAIR_STYLES = ('bob', 'short', 'pony', 'perm', 'updo', 'sport', 'long', 'bald')
ACC_KINDS = ('strawhat', 'cap', 'glasses', 'headband', 'earrings', 'apron')
EXPRS = ('normal', 'happy', 'sad', 'surprised')

GLINT = hexc('ffffff')
MOUTH_IN = hexc('e8788f')
BLUSH: tuple[Color, ...] = (hexc('ffb3c1'), hexc('e8907e'), hexc('b8624a'))


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
    c = Canvas(G, G)
    for l in layers:
        c.blit(l, 0, 0)
    return c


def up(c: Canvas, k: int = SCALE) -> Canvas:
    out = Canvas(c.w * k, c.h * k)
    for y in range(out.h):
        for x in range(out.w):
            out.px[y][x] = c.px[y // k][x // k]
    return out


# ---------------------------------------------------------------- 얼굴 바탕
# 얼굴 실루엣 y 3~24: 이마보다 볼이 넓고 턱은 완전히 둥글게. 너비 26 (=64px의 81%).
FACE_Y = 3
FACE_HW = [5, 8, 10, 11, 12, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 12, 11, 9, 6]
NECK_X0, NECK_W = 13, 6                   # 목 x 13~18
EYE_Y = 15                                # 눈 y 15~17 (얼굴 아래 1/3)
EYE_L, EYE_R = 10, 20                     # 왼눈 x 10~11, 오른눈 x 20~21 (사이 8칸)
MOUTH_Y = 20


def face_shape(c: Canvas, skin: int) -> None:
    dk, md, lt = SKINS[skin]
    c.rect(NECK_X0, 22, NECK_W, 7, md)                            # 목 y 22~28 (턱 밑 그늘 2줄)
    c.rect(NECK_X0, 24, NECK_W, 2, dk)
    profile(c, FACE_Y, FACE_HW, md)
    for x0 in (1, 29):                                             # 귀 2×3 (y 15~17)
        c.rect(x0, 15, 2, 3, md)
        c.put(x0 + (1 if x0 < CX else 0), 16, dk)
    c.hline(11, 17, 5, lt); c.hline(10, 12, 6, lt)                # 정수리 하이라이트(대머리·모자용)


def eye_dot(c: Canvas, x0: int, y: int, h: int = 3) -> None:
    """점 눈 2×h + 왼쪽 위 흰 하이라이트 1px."""
    c.rect(x0, y, 2, h, OUT)
    c.put(x0, y, GLINT)


def mouth(c: Canvas, kind: str) -> None:
    y = MOUTH_Y
    if kind == 'normal':                                           # 작은 미소 (양 끝 1px 올라감)
        c.hline(15, 16, y, OUT); c.put(14, y - 1, OUT); c.put(17, y - 1, OUT)
    elif kind == 'happy':                                          # 작은 u 입, 안은 분홍
        c.rect(15, y - 1, 2, 2, MOUTH_IN)
        c.vline(14, y - 1, y, OUT); c.vline(17, y - 1, y, OUT); c.hline(15, 16, y + 1, OUT)
    elif kind == 'sad':                                            # 작은 ∩ 입
        c.hline(15, 16, y - 1, OUT); c.put(14, y, OUT); c.put(17, y, OUT)
    elif kind == 'surprised':                                      # 작은 o
        c.rect(15, y - 1, 2, 2, MOUTH_IN)
        c.vline(14, y - 1, y, OUT); c.vline(17, y - 1, y, OUT); c.hline(15, 16, y - 2, OUT); c.hline(15, 16, y + 1, OUT)


def face_raw(skin: int, expr: str) -> Canvas:
    c = Canvas(G, G)
    face_shape(c, skin)
    if expr == 'happy':                                            # 살짝 눌린 점 눈
        eye_dot(c, EYE_L, EYE_Y, 2); eye_dot(c, EYE_R, EYE_Y, 2)
    elif expr == 'surprised':
        eye_dot(c, EYE_L, EYE_Y - 1, 4); eye_dot(c, EYE_R, EYE_Y - 1, 4)
    else:
        eye_dot(c, EYE_L, EYE_Y); eye_dot(c, EYE_R, EYE_Y)
        if expr == 'sad':                                          # 안쪽 위 1px 처진 눈꼬리
            c.put(EYE_L + 2, EYE_Y - 1, OUT); c.put(EYE_R - 1, EYE_Y - 1, OUT)
    c.rect(7, 18, 2, 1, BLUSH[skin]); c.rect(23, 18, 2, 1, BLUSH[skin])   # 볼
    mouth(c, expr)
    return c


def face(skin: int, expr: str) -> Canvas:
    return outline_layer(face_raw(skin, expr), Canvas(G, G), None)


# ---------------------------------------------------------------- 어깨·깃 (흰 4톤)
def top_raw() -> Canvas:
    c = Canvas(G, G)
    profile(c, 26, [12, 14, 15, 16, 16, 16], T_BASE)               # y 26~31
    row(c, 26, 4, CLEAR); row(c, 27, 4, CLEAR); row(c, 28, 3, CLEAR)   # 목선 개구부
    for y, hw in ((26, 5), (27, 5), (28, 4)):                      # 깃 하이라이트
        mirror(c, CX - hw, y, T_HI)
    c.hline(CX - 3, CX + 2, 29, T_HI)
    c.hline(CX - 11, CX - 6, 26, T_HI); c.hline(CX + 5, CX + 10, 26, T_HI)   # 어깨 윗줄
    for y in range(29, 32):                                        # 팔 경계 그늘
        mirror(c, CX - 8, y, T_MD)
    return c


def top_part(context: Canvas) -> Canvas:
    return outline_layer(top_raw(), context, T_DK)


# ---------------------------------------------------------------- 머리 (흰 4톤, 정면)
CAP_HW = [5, 9, 11, 12, 13, 13, 14, 14, 14, 14]                    # y 1~10


def band(c: Canvas, y: int) -> None:
    """하이라이트 띠 하나: 왼쪽 위 호."""
    c.hline(CX - 7, CX - 1, y, T_HI); c.hline(CX - 9, CX - 7, y + 1, T_HI)


def bangs(c: Canvas, y: int, tips: tuple[int, ...]) -> None:
    """앞머리 밑단 y줄 아래로 2칸짜리 뾰족 가닥."""
    for tx in tips:
        c.hline(tx, tx + 1, y + 1, T_BASE)


def side_lock(c: Canvas, x_out: int, y0: int, y1: int, w: int) -> None:
    """얼굴 옆으로 흘러내린 머리(좌우 대칭). 아래 1줄 그늘."""
    mirror_rect(c, x_out, y0, w, y1 - y0 + 1, T_BASE)
    mirror_rect(c, x_out, y1, w, 1, T_MD)


def hair_raw(style: str) -> Canvas:
    c = Canvas(G, G)
    if style == 'bald':
        side_lock(c, 1, 9, 14, 3)
        return c
    if style == 'sport':                                           # 짧은 스포츠: 딱 맞는 캡 + 삐죽 3개
        profile(c, 2, [5, 8, 10, 11, 12, 12, 12, 13, 13], T_BASE)   # y 2~10
        c.rect(CX - 6, 1, 2, 1, T_BASE); c.rect(CX - 1, 0, 2, 2, T_BASE); c.rect(CX + 4, 1, 2, 1, T_BASE)
        band(c, 3)
        return c
    if style == 'updo':                                            # 올림머리: 이마 넓게 + 정수리 쪽
        row(c, 0, 3, T_BASE); row(c, 1, 4, T_BASE); row(c, 2, 4, T_MD)       # 쪽
        profile(c, 3, [7, 10, 11, 12, 13, 13], T_BASE)                        # y 3~8
        side_lock(c, 2, 8, 12, 2)
        band(c, 4)
        return c
    profile(c, 1, CAP_HW, T_BASE)                                  # 공통 캡 y 1~10
    band(c, 3)
    if style == 'short':
        bangs(c, 10, (5, 11, 17, 23))
        side_lock(c, 2, 10, 14, 2)
    elif style == 'bob':
        bangs(c, 10, (5, 11, 17, 23))
        side_lock(c, 1, 9, 21, 3)
    elif style == 'long':
        bangs(c, 10, (5, 11, 17, 23))
        side_lock(c, 1, 9, 26, 3)
        mirror_rect(c, 0, 24, 4, 8, T_BASE); mirror_rect(c, 0, 31, 4, 1, T_MD)   # 어깨 위로
    elif style == 'pony':
        bangs(c, 10, (5, 11, 17, 23))
        side_lock(c, 2, 10, 13, 2)
        c.rect(CX + 6, 0, 6, 2, T_BASE); c.rect(CX + 11, 1, 3, 3, T_BASE)    # 높이 묶은 꼬리
        c.rect(CX + 12, 3, 3, 11, T_BASE); c.vline(CX + 14, 4, 13, T_MD)
        c.rect(CX + 9, 2, 2, 2, T_DK)                                        # 머리끈
    elif style == 'perm':
        profile(c, 0, [4, 8, 10, 12, 13, 13, 14, 14, 14, 14, 14], T_BASE)   # y 0~10, 1줄 크게
        for x in range(CX - 13, CX + 13, 4):                                  # 밑단 둥근 혹
            c.hline(x, x + 1, 11, T_BASE)
        for y0 in (9, 13, 17):                                               # 옆 뭉치 3개
            mirror_rect(c, 1, y0, 3, 4, T_BASE); mirror_rect(c, 0, y0 + 1, 1, 2, T_BASE)
            mirror_rect(c, 1, y0 + 3, 3, 1, T_MD)
    return c


def hair_part(style: str, context: Canvas) -> Canvas:
    return outline_layer(hair_raw(style), context, T_DK)


# ---------------------------------------------------------------- 액세서리 (고유색)
def acc_raw(kind: str) -> Canvas:
    c = Canvas(G, G)
    if kind == 'strawhat':
        ydk, ymd, ylt = PAL['yellow']
        c.rect(CX - 9, 0, 18, 6, ymd); c.hline(CX - 9, CX + 8, 0, ylt)       # 크라운 y 0~5
        c.put(CX - 9, 0, CLEAR); c.put(CX + 8, 0, CLEAR)
        c.hline(CX - 9, CX + 8, 4, ydk)                                       # 띠
        c.rect(CX - 15, 6, 30, 2, ymd); c.hline(CX - 15, CX + 14, 7, ydk)     # 챙 y 6~7
    elif kind == 'cap':
        bdk, bmd, blt = PAL['sky']
        profile(c, 1, [5, 8, 10, 11, 12, 13, 13], bmd)                        # 크라운 y 1~7
        c.hline(CX - 6, CX - 1, 2, blt); c.hline(CX - 8, CX - 6, 3, blt)
        c.rect(CX - 1, 0, 2, 1, bdk)                                          # 꼭지
        c.rect(CX - 2, 4, 4, 2, PAL['orange'][1])                             # 감귤 패치
        c.rect(CX - 13, 8, 26, 2, bdk); c.hline(CX - 13, CX + 12, 8, bmd)     # 챙 y 8~9
    elif kind == 'glasses':
        fr = hexc('3b3b44'); glint = hexc('8ec1f0')
        for x0 in (EYE_L - 2, EYE_R - 2):                                     # 6×5 테 (안은 비움)
            c.rect(x0, EYE_Y - 1, 6, 5, fr); c.rect(x0 + 1, EYE_Y, 4, 3, CLEAR)
            c.put(x0 + 4, EYE_Y, glint)
        c.hline(EYE_L + 4, EYE_R - 3, EYE_Y, fr)                              # 브리지
        c.hline(3, EYE_L - 3, EYE_Y, fr); c.hline(EYE_R + 4, 28, EYE_Y, fr)   # 안경다리
    elif kind == 'headband':
        rdk, rmd, rlt = PAL['red']
        c.rect(CX - 13, 8, 26, 2, rmd); c.hline(CX - 13, CX + 12, 8, rlt)
        c.rect(CX + 12, 6, 2, 2, rmd); c.put(CX + 13, 6, rdk)                 # 매듭
    elif kind == 'earrings':
        gdk, gmd, glt = PAL['yellow']
        for x in (1, 30):
            c.put(x, 18, gmd); c.put(x, 19, gdk)
    elif kind == 'apron':
        adk, amd, alt = PAL['leaf']
        c.rect(CX - 5, 28, 10, 4, amd); c.hline(CX - 5, CX + 4, 28, alt)     # 가슴받이
        mirror_rect(c, CX - 6, 26, 1, 2, adk)                                 # 어깨끈
        c.rect(CX - 2, 30, 4, 2, adk)                                         # 주머니
    return c


def acc_part(kind: str, context: Canvas) -> Canvas:
    return outline_layer(acc_raw(kind), context, None)


# ---------------------------------------------------------------- 조합 (32 격자)
def compose(skin: int, hair_style: int | str, hair_rgb: Color, top_rgb: Color,
            accs: tuple[str, ...] | list[str], expr: str = 'normal') -> Canvas:
    """face → top(tint) → hair(tint) → acc. 외곽선은 아래 레이어 기준으로 계산. 32×32."""
    style = HAIR_STYLES[hair_style] if isinstance(hair_style, int) else hair_style
    f = face(skin, expr)
    t = tinted(top_part(f), top_rgb)
    ctx = _stack([f, t])
    h = tinted(hair_part(style, ctx), hair_rgb)
    out = _stack([ctx, h])
    for kind in accs:
        out = _stack([out, acc_part(kind, out)])
    return out


def portrait(skin: int, hair_style: int | str, hair_rgb: Color, top_rgb: Color,
             accs: tuple[str, ...] | list[str], expr: str = 'normal') -> Canvas:
    """64×64 초상."""
    return up(compose(skin, hair_style, hair_rgb, top_rgb, accs, expr))


# ---------------------------------------------------------------- 고정 초상 (32 격자에서 손질 후 확대)
def _halmang() -> Canvas:
    c = compose(0, 'updo', HAIR_RGB['grey'], TOP_RGB['pink'], (), 'normal')    # 점 눈 + 잔잔한 미소
    c.rect(6, 18, 3, 2, BLUSH[0]); c.rect(23, 18, 3, 2, BLUSH[0])              # 깊은 홍조
    wlt, wmd = PAL['white'][2], PAL['white'][1]
    for i in range(3):                                                          # 저고리 동정 (흰 V)
        c.put(CX - 4 + i, 26 + i, wlt); c.put(CX + 3 - i, 26 + i, wmd)
    c.put(CX - 1, 29, wlt); c.put(CX, 29, wmd)
    fx, fy = CX + 8, 5                                                          # 감귤꽃(머리 위 오른쪽): 흰 꽃잎 + 노란 수술 + 잎
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        c.put(fx + dx, fy + dy, hexc('ffffff'))
    c.put(fx, fy, PAL['yellow'][1]); c.put(fx + 1, fy + 1, PAL['leaf'][1]); c.put(fx + 2, fy + 1, PAL['leaf'][0])
    return c


def _hero() -> Canvas:
    return compose(0, 'short', HAIR_RGB['black'], TOP_RGB['white'], ('apron',), 'normal')


def _samchun() -> Canvas:
    c = compose(1, 'sport', HAIR_RGB['grey'], TOP_RGB['orange'], ('cap',), 'happy')
    c.hline(14, 17, 18, hexc('8a8a90'))                                         # 콧수염
    return c


def _haenyeo() -> Canvas:
    c = compose(2, 'short', HAIR_RGB['black'], hexc('3a3a44'), (), 'normal')
    hood = Canvas(G, G)
    hdk, hmd, hlt = hexc('1e1e26'), hexc('34343e'), hexc('55555f')
    profile(hood, 1, [6, 9, 11, 12, 13, 14, 14, 14, 14, 14], hmd)              # y 1~10
    mirror_rect(hood, 1, 11, 3, 15, hmd)                                        # 양옆 얼굴 감싸기
    mirror_rect(hood, 0, 24, 5, 3, hmd)
    hood.hline(CX - 13, CX + 12, 10, hdk)                                       # 이마 접힌 단
    hood.hline(CX - 7, CX - 1, 3, hlt); hood.hline(CX - 9, CX - 7, 4, hlt)
    c.blit(outline_layer(hood, c, None), 0, 0)
    return c


def _jangnim() -> Canvas:
    c = compose(0, 'bald', HAIR_RGB['grey'], hexc('2f3d63'), ('glasses',), 'normal')
    wlt = PAL['white'][2]
    for i in range(3):                                                          # 흰 셔츠 깃 V + 넥타이
        c.put(CX - 4 + i, 26 + i, wlt); c.put(CX + 3 - i, 26 + i, wlt)
    c.rect(CX - 1, 28, 2, 4, wlt); c.rect(CX - 1, 29, 2, 3, PAL['red'][1])
    ldk = hexc('232d4a')
    for i in range(3):                                                          # 라펠
        c.put(CX - 5 - i, 26 + i, ldk); c.put(CX + 4 + i, 26 + i, ldk)
    g = HAIR_RGB['grey']                                                        # 가는 회색 눈썹 호
    for x0 in (EYE_L - 1, EYE_R - 1):
        c.put(x0, 13, g); c.hline(x0 + 1, x0 + 2, 12, g); c.put(x0 + 3, 13, g)
    return c


FIXED = {'halmang': _halmang, 'hero': _hero, 'samchun': _samchun, 'haenyeo': _haenyeo, 'jangnim': _jangnim}


def portrait_halmang() -> Canvas:
    return up(_halmang())


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
    return {k: up(v) for k, v in s.items()}


def portraits_preview(seed: int = 3, scale: int = 4) -> Canvas:
    """검토 시트(8열, 64×64를 4배): 고정 5 / 무작위 조합 12(머리 8종이 한 번씩은 나오도록) / 한 얼굴의 표정 4."""
    from sheet import contact_sheet
    rng = random.Random(seed)
    cells: dict[str, Canvas] = {}
    for name, fn in FIXED.items():
        cells[name] = up(fn())
    for i in range(3):
        cells[f'pad{i}'] = Canvas(G * SCALE, G * SCALE)
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
        cells[f'pad{3 + i}'] = Canvas(G * SCALE, G * SCALE)
    for expr in EXPRS:
        cells[f'e_{expr}'] = portrait(0, 'bob', HAIR_RGB['dark'], TOP_RGB['yellow'], (), expr)
    return contact_sheet(cells, cols=8, scale=scale)


if __name__ == '__main__':
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    portraits_preview().save(os.path.join(here, 'out', 'portraits_preview.png'))
    print('portraits_preview.png written')
