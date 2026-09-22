"""고정 인물 초상 48×48 — 손으로 그린 ART 문자 그림(px.Canvas.from_art) + sprites_portraits 파츠.
얼굴 바탕·눈·입은 파츠(표정 3종: normal·happy·surprised), 인물마다 다른 머리쓰개·옷·소품은 ART로 그린다.

시트 이름: portrait_{name} (기본 표정), portrait_{name}_{expr}. 모두 icons/로도 내보낸다.
  halmang  할망: 흰머리 쪽·꽃무늬 몸빼·안경 없음·주름 2픽셀·따뜻한 미소
  samchun  삼춘: 갈색 피부·밀짚모자·목에 수건
  hero     주인공: 청년·앞치마·짧은 머리
  jangnim  이장님: 백발·안경 없음·조끼
  haenyeo  해녀 삼춘: 검정 잠수모·물안경 이마에
  baek     백중원: 덩치·검정 모자·수염 없음
  yori     이요리: 단발·선글라스 이마
  ai       유아이: 긴 머리·리본
"""
from __future__ import annotations
from px import Canvas, PAL, OUT, hexc, Color
from sprites_chars import HAIR_RGB, TOP_RGB
from sprites_portraits import (G, CX, EXPRS, compose, stack, outline_layer, face, top_part, split_gloss, tinted,
                               EYE_L, EYE_R, EYE_Y, BROW_Y, MOUTH_Y)

CLEAR = (0, 0, 0, 0)

# ART 범례 (공용). 소문자 = 본색, 대문자 = 밝음, 다른 글자 = 어둠. K = 외곽선.
LEGEND: dict[str, Color] = {
    'K': OUT,
    # 밀짚 (노랑)
    'y': PAL['yellow'][1], 'Y': PAL['yellow'][2], 'd': PAL['yellow'][0],
    # 흰 천
    'w': PAL['white'][1], 'W': PAL['white'][2], 'x': PAL['white'][0],
    # 빨강
    'r': PAL['red'][1], 'R': PAL['red'][2], 'q': PAL['red'][0],
    # 초록(잎)
    'g': PAL['leaf'][1], 'G': PAL['leaf'][2], 'e': PAL['leaf'][0],
    # 하늘
    'b': PAL['sky'][1], 'B': PAL['sky'][2], 'n': PAL['sky'][0],
    # 감귤 주황
    'o': PAL['orange'][1], 'O': PAL['orange'][2], 'u': PAL['orange'][0],
    # 검정 천(잠수복·모자)
    'k': hexc('34343e'), 'L': hexc('55555f'), 'j': hexc('1e1e26'),
    # 남색 조끼
    'v': hexc('2f3d63'), 'V': hexc('4a5a86'), 'c': hexc('232d4a'),
    # 몸빼 보라·분홍
    'm': hexc('9a6fd1'), 'M': hexc('b993e6'), 'i': hexc('6f4aa0'),
    'p': PAL['pink'][1], 'P': PAL['pink'][2],
    # 갈색 가죽·나무
    't': PAL['wood'][1], 'T': PAL['wood'][2], 'h': PAL['wood'][0],
    # 회색(안경테·금속)
    's': PAL['basalt'][1], 'S': PAL['basalt'][2], 'z': PAL['basalt'][0],
    # 렌즈
    'a': hexc('8ec1f0'), 'A': hexc('d8ecfb'),
    # 피부(주름·수염)
    'f': hexc('e8a97e'), 'F': hexc('c98a58'),
}


def art(rows: list[str], x: int, y: int) -> Canvas:
    """부분 ART를 48×48 캔버스의 (x, y)에."""
    return Canvas.from_art(rows, LEGEND, w=G, h=G, x=x, y=y)


# ---------------------------------------------------------------- 할망: 흰머리 쪽 + 꽃무늬 몸빼 저고리 + 주름 2픽셀
HALMANG_TOP = [   # x 0~47, y 37~47 (11줄): 보라 몸빼 저고리, 흰 동정(V), 꽃무늬 점
'.............KKKKKKKKKKKKKKKKKKKKKK.............',
'.........KKKKmMMmmmmWWKKKKWWmmmmMMmKKKK.........',
'......KKKmMmmmmmmmmmmWWKKWWmmmmmmmmmMmKKK.......',
'....KKmmMmmPmmmmmmmmmmWWWWmmmmmmmPmmmMmmKK......',
'...KmmmMmmPPPmmmmmmmmmmWWmmmmmmmPPPmmmMmmmK.....',
'..KmmmmMmmmPmmmmmmmmmmmmmmmmmmmmmPmmmmMmmmmK....',
'.KmmmmmMmmmmmmmmPmmmmmmmmmmmmPmmmmmmmMmmmmmmK...',
'.KmmmmmmMmmmmmmPPPmmmmmmmmmmPPPmmmmmmMmmmmmmK...',
'KmmmimmmMmmmmmmmPmmmmmmmmmmmmPmmmmmmmMmmmimmmK..',
'KmmmimmmmMmmmmmmmmmmmPmmmmmmmmmmmmmmMmmmmimmmK..',
'KmmmimmmmMmmmmmmmmmmPPPmmmmmmmmmmmmMmmmmmimmmK..',
]


def halmang(expr: str) -> Canvas:
    c = compose(0, 'updo', hexc('f0f0f0'), TOP_RGB['purple'], (), expr, shape='round', eyes='droop')
    c.blit(outline_layer(art(HALMANG_TOP, 0, 37), c, None), 0, 0)
    for x0 in (EYE_L - 3, EYE_R + 4):                                            # 눈꼬리 주름 2픽셀
        c.put(x0, EYE_Y + 3, hexc('d9967a')); c.put(x0 + (1 if x0 < CX else -1), EYE_Y + 4, hexc('d9967a'))
    c.rect(10, 25, 5, 3, hexc('ffb0bd')); c.rect(33, 25, 5, 3, hexc('ffb0bd'))    # 깊은 홍조
    c.put(10, 25, hexc('f7cfa8')); c.put(37, 25, hexc('f7cfa8'))
    return c


# ---------------------------------------------------------------- 삼춘: 밀짚모자(넓은 챙) + 목에 수건
SAMCHUN_HAT = [   # x 0~47, y 0~14 (15줄)
'..................KKKKKKKKKKKK..................',
'...............KKKYYYYyyyyyyyyKKK...............',
'..............KYYYyyyyyyyyyyyyyyK...............',
'.............KYYyyyyyyyyyyyyyyyyyK..............',
'.............KYyyyyyyyyyyyyyyyyyyK..............',
'.............KrrrrrrrrrrrrrrrrrrrK..............',
'.............KqqqqqqqqqqqqqqqqqqqK..............',
'.....KKKKKKKKKyyyyyyyyyyyyyyyyyyyKKKKKKKKK......',
'..KKKYYYYYYYYYyyyyyyyyyyyyyyyyyyyyyyyyyyyyKKK...',
'.KYYYyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyK..',
'KYYyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyK.',
'KyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyydddK',
'KdddddddddddddddddddddddddddddddddddddddddddddK.',
'.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK..',
'................................................',
]
SAMCHUN_TOWEL = [   # x 12~35, y 35~43 (9줄): 목에 두른 흰 수건(파란 줄무늬), 오른쪽에 매듭
'.......KKKKKKKKKK.......',
'.....KKwWWwwwwwwwKK.....',
'....KwwwwwwbwwwwwwwK....',
'...KwwbwwwwwwwwbwwwwK...',
'...KwwwwwbwwwwwwwwwwKK..',
'...KwwwwwwwwbwwwwwwwwwK.',
'....KwwbwwwwwwwwbwwwwwK.',
'.....KxxxxxxxxxxxxxwwxK.',
'......KKKKKKKKKKKKKKKK..',
]


def samchun(expr: str) -> Canvas:
    c = compose(2, 'sport', HAIR_RGB['grey'], TOP_RGB['orange'], (), expr, shape='square', eyes='narrow',
                extra=stack([art(SAMCHUN_HAT, 0, 0)]))
    c.blit(art(SAMCHUN_TOWEL, 12, 35), 0, 0)
    return c


# ---------------------------------------------------------------- 주인공: 흰 셔츠 + 초록 앞치마(감귤 마크)
HERO_APRON = [   # x 8~39, y 37~47 (11줄): 어깨끈 + 가슴받이, 가운데 감귤 마크
'.......KK..............KK.......',
'.......Kee............eeK.......',
'.......Kee............eeK.......',
'.......KeeKKKKKKKKKKKKeeK.......',
'.......KeGGGGGGGGGGGGGGeK.......',
'.......KeggggggooggggggeK.......',
'.......KegggggooooggggggK.......',
'.......KeggggggooggggggeK.......',
'.......KeggggggggggggggeK.......',
'.......KeeeggggggggggeeeK.......',
'.......KKKKKKKKKKKKKKKKKK.......',
]


def hero(expr: str) -> Canvas:
    c = compose(0, 'short', HAIR_RGB['black'], TOP_RGB['white'], (), expr, shape='round', eyes='round')
    c.blit(art(HERO_APRON, 8, 37), 0, 0)
    return c


# ---------------------------------------------------------------- 이장님: 백발 가르마 + 흰 셔츠 위 남색 조끼
JANGNIM_VEST = [   # x 0~47, y 37~47 (11줄)
'.............KKKKKKKKKKKKKKKKKKKKKK.............',
'.........KKKKvVvvvvvWWKKKKWWvvvvvVvKKKK.........',
'......KKKvVvvvvvvvvvvWWKKWWvvvvvvvvvVvKKK.......',
'....KKvvVvvvvvvvvvvvvvWWWWvvvvvvvvvvvVvvKK......',
'...KvvvVvvvvvvvvvvvvvvvWWvvvvvvvvvvvvVvvvvK.....',
'..KvvvvVvvvvvvvcvvvvvvvxxvvvvvvvcvvvvvVvvvvK....',
'.KvvvvvVvvvvvvvcvvvvvvvxxvvvvvvvcvvvvvVvvvvvK...',
'.KvvvvvvVvvvvvvcvvvvvvvxxvvvvvvvcvvvvvVvvvvvK...',
'KvvvcvvvVvvvvvvcvvvvvvvxxvvvvvvvcvvvvVvvvcvvvK..',
'KvvvcvvvvVvvvvvcvvvvvvvxxvvvvvvvcvvvVvvvvcvvvK..',
'KvvvcvvvvVvvvvvvvvvvvvvxxvvvvvvvvvvVvvvvvcvvvK..',
]


def jangnim(expr: str) -> Canvas:
    c = compose(0, 'part', hexc('d4d4d8'), TOP_RGB['white'], (), expr, shape='square', eyes='droop')
    c.blit(outline_layer(art(JANGNIM_VEST, 0, 37), c, None), 0, 0)
    for x0 in (EYE_L - 3, EYE_R + 4):                                            # 눈꼬리 주름 2픽셀
        c.put(x0, EYE_Y + 3, hexc('d9967a')); c.put(x0 + (1 if x0 < CX else -1), EYE_Y + 4, hexc('d9967a'))
    return c


# ---------------------------------------------------------------- 해녀 삼춘: 검정 잠수모(얼굴 감싸기) + 이마의 물안경
HAENYEO_HOOD = [   # x 4~43, y 0~40 (41줄): 얼굴 구멍 x 9~38(y 8~34) 남기고 감싼다
'..................KKKKKKKK..............',
'..............KKKKLLkkkkkkKKKK..........',
'............KKLLkkkkkkkkkkkkkkKK........',
'..........KKLLkkkkkkkkkkkkkkkkkkKK......',
'.........KLLkkkkkkkkkkkkkkkkkkkkkkK.....',
'........KLkkkkkkkkkkkkkkkkkkkkkkkkkK....',
'.......KLkkkkkkkkkkkkkkkkkkkkkkkkkkkK...',
'......KLkkkkkkkkkkkkkkkkkkkkkkkkkkkkkK..',
'......KkkkkjjjjjjjjjjjjjjjjjjjjjjjkkkkK.',
'.....KkkkkK....................KkkkkK...',
'.....KkkkK......................KkkkK...',
'....KkkkkK......................KkkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkK........................KkkkK..',
'....KkkkkK......................KkkkkK..',
'....KkkkkkK....................KkkkkkK..',
'....KkkkkkkK..................KkkkkkkK..',
'....KkkkkkkkK................KkkkkkkkK..',
'....KkkkkkkkkKK............KKkkkkkkkkK..',
'....KkkkkkkkkkkKKK......KKKkkkkkkkkkkK..',
'....KjkkkkkkkkkkkkK....KkkkkkkkkkkkkjK..',
'....KjjkkkkkkkkkkkK....KkkkkkkkkkkkjjK..',
'.....KjjjkkkkkkkkkK....KkkkkkkkkjjjjK...',
'......KKjjjjjjjjjjK....KjjjjjjjjjjKK....',
'........KKKKKKKKKK......KKKKKKKKKK......',
]
HAENYEO_GOGGLES = [   # x 12~35, y 9~15 (7줄): 이마에 올린 물안경(회색 테 + 하늘색 렌즈), 옆으로 검정 끈
'.....KKKKKKK....KKKKKKK.',
'....KsSSSSSsK..KsSSSSSsK',
'KKKKKsAaaaasKKKKsAaaaasK',
'jjjjKsaaaaasssssaaaaaasK',
'....KsaaaaasKKKKsaaaaasK',
'....KssssssK....KssssssK',
'.....KKKKKK......KKKKKK.',
]


def haenyeo(expr: str) -> Canvas:
    c = compose(2, 'bald', HAIR_RGB['black'], hexc('3a3a44'), (), expr, shape='round', eyes='narrow',
                extra=stack([art(HAENYEO_HOOD, 4, 0), art(HAENYEO_GOGGLES, 12, 9)]))
    return c


# ---------------------------------------------------------------- 백중원: 덩치(넓은 어깨) + 검정 모자 + 검정 셔츠
BAEK_CAP = [   # x 4~43, y 0~13 (14줄): 검정 야구모자, 챙 넓게
'.............KKKKKKKKKKKKKK.............',
'..........KKKLLLkkkkkkkkkkkKKK..........',
'........KKLLLkkkkkkkkkkkkkkkkKK.........',
'.......KLLLkkkkkkkkkkkkkkkkkkkkK........',
'......KLLkkkkkkkkkkkkkkkkkkkkkkkK.......',
'.....KLLkkkkkkkkkkkkkkkkkkkkkkkkkK......',
'.....KLkkkkkkkkkkkkkkkkkkkkkkkkkkK......',
'....KLkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.....',
'....KkkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.....',
'....KkkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.....',
'KKKKKjjjjjjjjjjjjjjjjjjjjjjjjjjjjjKKKKK.',
'KLLkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkK',
'KjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjK',
'.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
]
BAEK_TOP = [   # x 0~47, y 35~47 (13줄): 넓은 어깨 검정 셔츠, 흰 칼라
'..............KKKKKKKKKKKKKKKKKKKK..............',
'..........KKKKkkkkkkWWWKKKKWWWkkkkkKKKK.........',
'.......KKKkLkkkkkkkkkWWKKKKWWkkkkkkkkkkKKK......',
'.....KKkLLkkkkkkkkkkkkWWKKWWkkkkkkkkkkkkkKK.....',
'...KKkkLkkkkkkkkkkkkkkkWWWWkkkkkkkkkkkkkkkkKK...',
'..KkkkLkkkkkkkkkkkkkkkkkWWkkkkkkkkkkkkkkkkkkkK..',
'.KkkkLkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.',
'.KkkkLkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.',
'KkkkLkkkjkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkjkkkkkkkK',
'KkkkLkkkjkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkjkkkkkkkK',
'KkkkLkkkjkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkjkkkkkkkK',
'KkkkkkkkjkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkjkkkkkkkK',
'KkkkkkkkjkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkjkkkkkkkK',
]


def baek(expr: str) -> Canvas:
    c = compose(1, 'sport', HAIR_RGB['black'], hexc('3a3a44'), (), expr, shape='square', eyes='narrow',
                extra=art(BAEK_CAP, 4, 0))
    c.blit(art(BAEK_TOP, 0, 35), 0, 0)
    return c


# ---------------------------------------------------------------- 이요리: 단발 + 이마의 선글라스 + 흰 셔츠
YORI_SUNGLASSES = [   # x 12~35, y 11~17 (7줄): 이마에 올린 검정 선글라스
'.....KKKKKKK....KKKKKKK.',
'....KjjjjjjjK..KjjjjjjjK',
'KKKKKjLjjjjjKKKKjLjjjjjK',
'....KjjjjjjjjjjjjjjjjjjK',
'....KjjjjjjjKKKKjjjjjjjK',
'.....KjjjjjK....KjjjjjK.',
'......KKKKK......KKKKK..',
]


def yori(expr: str) -> Canvas:
    c = compose(0, 'bob', HAIR_RGB['dark'], TOP_RGB['white'], (), expr, shape='slim', eyes='round',
                extra=art(YORI_SUNGLASSES, 12, 11))
    return c


# ---------------------------------------------------------------- 유아이: 긴 머리 + 큰 리본 + 분홍 원피스 칼라
AI_RIBBON = [   # x 27~43, y 1~10 (10줄): 오른쪽 위 큰 빨간 리본
'....KKK...KKK....',
'...KRrrK.KrrRK...',
'..KRrrrrKrrrrrK..',
'..KrrrrKqKrrrrK..',
'..KrrrrKRKrrrrK..',
'..KrrrrKqKrrrrK..',
'..KqrrrKKKrrrqK..',
'...KqqrK.KrqqK...',
'....KKK...KKK....',
'.................',
]


def ai(expr: str) -> Canvas:
    c = compose(0, 'long', HAIR_RGB['dark'], TOP_RGB['pink'], (), expr, shape='slim', eyes='round',
                extra=art(AI_RIBBON, 27, 1))
    wlt = PAL['white'][2]
    for i in range(4):                                                            # 흰 둥근 칼라
        c.put(CX - 5 + i, 38 + i, wlt); c.put(CX + 4 - i, 38 + i, wlt)
        c.put(CX - 6 + i, 38 + i, wlt); c.put(CX + 5 - i, 38 + i, wlt)
    return c


FIXED = {'halmang': halmang, 'samchun': samchun, 'hero': hero, 'jangnim': jangnim, 'haenyeo': haenyeo,
         'baek': baek, 'yori': yori, 'ai': ai}


def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    for name, fn in FIXED.items():
        for expr in EXPRS:
            s[f'portrait_{name}' if expr == 'normal' else f'portrait_{name}_{expr}'] = fn(expr)
    return s


def named_preview(scale: int = 3) -> Canvas:
    from sheet import contact_sheet
    cells = {}
    for name, fn in FIXED.items():
        for expr in EXPRS:
            cells[f'{name}_{expr}'] = fn(expr)
    return contact_sheet(cells, cols=6, scale=scale)


if __name__ == '__main__':
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    named_preview().save(os.path.join(here, 'out', 'portraits_named_preview.png'))
    print('portraits_named_preview.png written')
