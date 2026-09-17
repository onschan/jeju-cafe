"""캐릭터 파츠 시스템: 몸·상의·머리·액세서리를 레이어로 쌓아 수백 종을 만든다(32×48, 발 y=42).
Hot Springs Story 2식 치비: 전체 ~20×26(y 16~41), 머리가 60%(둥근 16×14), 토르소 10×6, 다리 4×5 스텁 2개.
1px 하이라이트(눈)와 둥근 실루엣으로 아기자기하게. right는 left의 좌우 반전.

레이어(아래→위)와 시트 이름:
  body_{skin}_{dir}_{frame}  36장  피부 3종 × 4방향 × 3프레임. 피부·얼굴·바지(road)·신발·그림자 + 흰 티. tint 없이 쓴다.
  top_{dir}_{frame}          12장  상의(토르소+소매)만 흰 3톤(#ffffff/#d0d0d0/#a0a0a0) → Pixi tint = 상의색.
  hair_{style}_{dir}         32장  머리 8종 × 4방향, 흰 3톤 → tint = 머리색. 7(대머리)은 빈 프레임.
  acc_{kind}_{dir}           24장  액세서리 6종 × 4방향, 고유색(tint 없음).
머리는 프레임과 무관하게 y=16 고정(머리·액세서리가 프레임마다 흔들리지 않도록 걷기 바운스는 토르소 밑단·다리에만 준다).
tint 파츠는 흰(#ffffff)이 본색, #d0d0d0이 그늘, #a0a0a0이 깊은 그늘이라 tint 색 = 결과 본색이다.
각 파츠의 외곽선은 '몸 위에 얹힌 상태'를 기준으로 계산해(outline_on) 레이어를 겹쳐도 목·이마에 선이 생기지 않는다.
"""
from __future__ import annotations
import random
from px import Canvas, PAL, OUT, hexc, Color

Tones = tuple[Color, Color, Color]
DIRS = ('down', 'up', 'left', 'right')
CLEAR = (0, 0, 0, 0)
SHOE = PAL['basalt'][0]
EYE_HI = PAL['white'][2]

HEAD_Y, HEAD_H = 16, 14      # y 16~29 (프레임 무관 고정)
TORSO_Y, TORSO_H = 30, 6     # y 30~35 (bob 프레임은 밑단 1px 추가)
LEG_Y0, LEG_Y1 = 36, 40      # 다리 y 36~40, 신발 y 41, 바닥선 y 42

# tint용 흰 3톤 (DK, MD, LT): 본색 = LT(흰), 그늘 = MD, 깊은 그늘 = DK
TINT: Tones = (hexc('a0a0a0'), hexc('d0d0d0'), hexc('ffffff'))
PANTS: Tones = PAL['road']

SKINS: tuple[Tones, ...] = (
    (hexc('e8a97e'), hexc('f4c6a0'), hexc('ffe0c4')),
    (hexc('b8824f'), hexc('d9a577'), hexc('efc49a')),
    (hexc('84512c'), hexc('a86f45'), hexc('c98f63')),
)
HAIR_STYLES = ('bob', 'short', 'pony', 'perm', 'updo', 'sport', 'long', 'bald')   # 0..7
ACC_KINDS = ('strawhat', 'cap', 'glasses', 'backpack', 'camera', 'apron')

# 검토·손님용 tint 색 (렌더에서는 데이터로 정의)
HAIR_RGB = {'black': hexc('3a3a44'), 'dark': hexc('6b3f1d'), 'brown': hexc('96602c'),
            'blonde': hexc('d4a13c'), 'grey': hexc('b3b3b8'), 'red': hexc('b4432b')}
TOP_RGB = {'pink': hexc('f7a1c4'), 'sky': hexc('4a90d9'), 'leaf': hexc('4fae3a'), 'yellow': hexc('ffd166'),
           'red': hexc('d62828'), 'white': hexc('f0ece4'), 'purple': hexc('9a6fd1'), 'orange': hexc('f7981f')}


# ---------------------------------------------------------------- 공용 도형
def round_block(c: Canvas, x: int, y: int, w: int, h: int, col: Color) -> None:
    """둥근 머리: 첫/끝 줄 모서리 2px, 다음 줄 1px 컷."""
    c.rect(x, y, w, h, col)
    for row, cut in ((0, 2), (1, 1), (h - 1, 2), (h - 2, 1)):
        for i in range(cut):
            c.put(x + i, y + row, CLEAR); c.put(x + w - 1 - i, y + row, CLEAR)


def cap_block(c: Canvas, x: int, y: int, w: int, h: int, col: Color) -> None:
    """머리 캡: 위쪽 모서리만 둥글게(2px, 1px)."""
    c.rect(x, y, w, h, col)
    for row, cut in ((0, 2), (1, 1)):
        for i in range(cut):
            c.put(x + i, y + row, CLEAR); c.put(x + w - 1 - i, y + row, CLEAR)


def outline_on(part: Canvas, context: Canvas, col: Color = OUT) -> Canvas:
    """part의 불투명 픽셀 중 4방향 이웃이 part·context 양쪽 모두에서 비어 있으면 외곽선.
    레이어가 몸 위에 얹혔을 때 실루엣 바깥 가장자리만 선이 생긴다."""
    out = part.copy()
    for y in range(part.h):
        for x in range(part.w):
            if part.px[y][x][3] != 255:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if part.get(x + dx, y + dy)[3] < 255 and context.get(x + dx, y + dy)[3] < 255:
                    out.px[y][x] = col
                    break
    return out


def tinted(c: Canvas, rgb: Color) -> Canvas:
    """Pixi tint와 같은 채널 곱."""
    out = Canvas(c.w, c.h)
    for y in range(c.h):
        for x in range(c.w):
            r, g, b, a = c.px[y][x]
            out.px[y][x] = (r * rgb[0] // 255, g * rgb[1] // 255, b * rgb[2] // 255, a)
    return out


def finish(c: Canvas, direction: str, context: Canvas | None = None) -> Canvas:
    """외곽선 + right 반전. context가 없으면 자기 자신 기준."""
    c = outline_on(c, context if context is not None else c)
    return c.flip_x() if direction == 'right' else c


# ---------------------------------------------------------------- 몸
def leg(c: Canvas, x: int, tones: Tones, lifted: bool, bob: int) -> None:
    """4×5 다리 스텁 + 신발 1줄. bob 프레임은 다리가 1px 짧아지고(토르소 밑단이 내려옴) 들린 다리는 바닥에서 1px 뜬다."""
    y0 = LEG_Y0 + bob
    y1 = LEG_Y1 - 1 if lifted else LEG_Y1
    c.rect(x, y0, 4, y1 - y0 + 1, tones[1])
    c.vline(x + 1, y0, y1, tones[2])
    c.rect(x, y1 + 1, 4, 1, SHOE)


def torso(c: Canvas, x: int, w: int, bob: int, top: Tones) -> None:
    h = TORSO_H + bob
    c.rect(x, TORSO_Y, w, h, top[2])
    c.vline(x + w - 2, TORSO_Y + 1, TORSO_Y + h - 1, top[1])      # 오른쪽 1px 그늘
    c.hline(x + 1, x + w - 2, TORSO_Y + h - 1, top[0])            # 밑단
    c.put(x + 1, TORSO_Y + h - 1, top[1])


def sleeve(c: Canvas, x: int, y: int, top: Tones) -> None:
    c.rect(x, y, 2, 2, top[2]); c.put(x + 1, y + 1, top[1])


def hand(c: Canvas, x: int, y: int, skin: Tones) -> None:
    c.rect(x, y, 2, 2, skin[1]); c.put(x + 1, y + 1, skin[0])


def head(c: Canvas, hx: int, hw: int, skin: Tones) -> None:
    y = HEAD_Y
    round_block(c, hx, y, hw, HEAD_H, skin[1])
    c.hline(hx + 3, hx + hw - 4, y + HEAD_H - 1, skin[0])                       # 턱 그늘
    c.vline(hx + hw - 2, y + 4, y + HEAD_H - 3, skin[0])
    c.rect(hx + 3, y + 1, 4, 1, skin[2]); c.rect(hx + 3, y + 2, 2, 1, skin[2])  # 정수리 하이라이트(대머리용)


def face(c: Canvas, skin: Tones, side: bool = False, hx: int = 8) -> None:
    y = HEAD_Y
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


def arm_y(frame: int, side: int) -> int:
    """side=+1 왼팔, -1 오른팔. bob 프레임에서 앞뒤로 1px 흔든다."""
    bob = 0 if frame == 1 else 1
    swing = (frame == 2) - (frame == 0)
    return TORSO_Y + bob + 1 + swing * side


def body_raw(skin: Tones, direction: str, frame: int, top: Tones = TINT) -> Canvas:
    """외곽선 전 몸 전체(흰 티 포함). direction ∈ down/up/left."""
    c = Canvas(32, 48)
    c.shadow(15.5, 43, 7, 2)
    bob = 0 if frame == 1 else 1
    if direction in ('down', 'up'):
        leg(c, 11, PANTS, lifted=(frame == 0), bob=bob)
        leg(c, 17, PANTS, lifted=(frame == 2), bob=bob)
        torso(c, 11, 10, bob, top)
        for x, side in ((9, 1), (21, -1)):
            ay = arm_y(frame, side)
            sleeve(c, x, ay, top); hand(c, x, ay + 2, skin)
        head(c, 8, 16, skin)
        if direction == 'down':
            face(c, skin)
    else:
        front = 11 - (1 if frame != 1 else 0)
        leg(c, 16, PANTS, lifted=(frame == 2), bob=bob)          # 뒷다리
        leg(c, front, PANTS, lifted=(frame == 0), bob=bob)       # 앞다리(1px 앞으로)
        torso(c, 12, 8, bob, top)
        ax = 11 - (frame == 0) + (frame == 2)
        ay = TORSO_Y + bob + 1
        sleeve(c, ax, ay, top); hand(c, ax, ay + 2, skin)
        c.vline(ax + 1, ay, ay + 1, top[0])                      # 팔·몸 경계 1px
        head(c, 9, 14, skin)
        face(c, skin, side=True, hx=9)
    return c


def top_raw(direction: str, frame: int) -> Canvas:
    """상의(토르소+소매)만. body_raw와 같은 좌표."""
    c = Canvas(32, 48)
    bob = 0 if frame == 1 else 1
    if direction in ('down', 'up'):
        torso(c, 11, 10, bob, TINT)
        for x, side in ((9, 1), (21, -1)):
            sleeve(c, x, arm_y(frame, side), TINT)
    else:
        torso(c, 12, 8, bob, TINT)
        ax = 11 - (frame == 0) + (frame == 2)
        ay = TORSO_Y + bob + 1
        sleeve(c, ax, ay, TINT)
        c.vline(ax + 1, ay, ay + 1, TINT[0])
    return c


def src_dir(direction: str) -> str:
    return 'left' if direction == 'right' else direction


def body(skin_idx: int, direction: str, frame: int) -> Canvas:
    return finish(body_raw(SKINS[skin_idx], src_dir(direction), frame), direction)


def top(direction: str, frame: int) -> Canvas:
    d = src_dir(direction)
    return finish(top_raw(d, frame), direction, context=body_raw(SKINS[0], d, frame))


# ---------------------------------------------------------------- 머리 (흰 3톤)
def hair_raw(style: int, direction: str) -> Canvas:
    """direction ∈ down/up/left. 머리 y=16 고정. 캡은 몸의 둥근 머리(8,16,16×14 / 9,16,14×14)에 맞춘다."""
    dk, md, lt = TINT
    c = Canvas(32, 48)
    name = HAIR_STYLES[style]
    if name == 'bald':
        return c
    y = HEAD_Y
    hx, hw = (9, 14) if direction == 'left' else (8, 16)
    right = hx + hw - 1

    def cap(rows: int, sides: int = 2) -> None:
        """앞·옆에서 보는 캡: rows줄 + 옆으로 sides줄 더, 마지막 줄은 그늘."""
        cap_block(c, hx, y, hw, rows, lt)
        c.hline(hx + 1, right - 1, y + rows - 1, md)
        c.vline(hx, y + rows, y + rows + sides - 1, lt); c.vline(right, y + rows, y + rows + sides - 1, lt)
        c.put(hx, y + rows + sides - 1, md); c.put(right, y + rows + sides - 1, md)

    def back_of_head(bottom: int) -> None:
        """옆모습 뒤통수: 오른쪽 절반을 bottom까지 채운다."""
        bx = hx + hw // 2 + 1
        c.rect(bx, y + 6, right - bx + 1, bottom - (y + 6) + 1, lt)
        c.vline(right, y + 6, bottom, md)
        c.hline(bx, right, bottom, md)

    def full_back(bottom_shade: int = 2) -> None:
        """뒷모습: 머리 전체를 덮는다."""
        round_block(c, hx, y, hw, HEAD_H, lt)
        for i in range(bottom_shade):
            c.hline(hx + 2 + i, right - 2 - i, y + HEAD_H - 1 - i, md)
        c.vline(right - 1, y + 3, y + HEAD_H - 3, md)

    if name == 'short':            # 짧은 머리: 캡 6줄 + 옆 2줄
        if direction == 'up':
            full_back()
        else:
            cap(6)
            if direction == 'left':
                back_of_head(y + 11)
                c.vline(hx - 1, y + 2, y + 4, lt)                                  # 앞머리 1px 넘침
    elif name == 'sport':          # 스포츠: 캡 4줄, 옆 1줄
        if direction == 'up':
            full_back(1)
        else:
            cap(4, sides=1)
            if direction == 'left':
                back_of_head(y + 9)
    elif name == 'bob':            # 단발: 캡 + 양옆 턱까지(2px), 밑단 그늘
        if direction == 'up':
            full_back()
            c.rect(hx + 1, y + HEAD_H - 2, hw - 2, 2, lt); c.hline(hx + 2, right - 2, y + HEAD_H, md)   # 목 뒤 밑단
        else:
            cap(6)
            for sx in (hx, right - 1):
                c.rect(sx, y + 6, 2, 7, lt)
                c.hline(sx, sx + 1, y + 12, md)
            if direction == 'left':
                back_of_head(y + 12)
                c.vline(hx - 1, y + 2, y + 4, lt)
    elif name == 'pony':           # 포니테일: 짧은 캡 + 뒤로 묶은 꼬리
        if direction == 'up':
            full_back()
            c.rect(hx + 6, y + 5, 4, 2, dk)                                        # 머리끈
            c.rect(hx + 6, y + 7, 4, 10, lt); c.vline(hx + 9, y + 7, y + 16, md); c.hline(hx + 6, hx + 9, y + 16, md)
            c.put(hx + 6, y + 16, CLEAR); c.put(hx + 9, y + 16, CLEAR)
        else:
            cap(6)
            if direction == 'left':
                back_of_head(y + 10)
                c.rect(right + 1, y + 4, 2, 2, dk)                                  # 머리끈
                c.rect(right + 1, y + 6, 3, 8, lt); c.vline(right + 3, y + 6, y + 13, md); c.hline(right + 1, right + 3, y + 13, md)
                c.put(right + 3, y + 13, CLEAR)
                c.vline(hx - 1, y + 2, y + 4, lt)
            else:
                c.rect(hx - 2, y + 4, 2, 8, lt); c.hline(hx - 2, hx - 1, y + 11, md)  # 옆으로 살짝 보이는 꼬리
                c.put(hx - 2, y + 4, dk)
    elif name == 'perm':           # 파마: 1px 넓은 뭉실 캡, 울퉁불퉁 가장자리
        if direction == 'up':
            round_block(c, hx - 1, y - 1, hw + 2, HEAD_H + 2, lt)
            for x in range(hx - 1, right + 2, 2):
                c.put(x, y + HEAD_H, CLEAR)
            c.hline(hx + 2, right - 2, y + HEAD_H - 1, md); c.hline(hx + 1, right - 1, y + HEAD_H - 2, md)
            c.vline(right, y + 3, y + HEAD_H - 3, md)
        else:
            cap_block(c, hx - 1, y - 1, hw + 2, 8, lt)                             # y-1 ~ y+6 (눈 위에서 끝)
            for x in range(hx + 1, right, 3):
                c.put(x, y + 6, CLEAR)                                             # 곱슬 밑단(스캘럽)
            c.hline(hx, right, y + 5, md)
            for x in range(hx + 1, right, 3):
                c.put(x, y + 5, lt)
            c.rect(hx - 1, y + 7, 2, 4, lt); c.rect(right, y + 7, 2, 4, lt)        # 양옆 뭉치
            c.put(hx - 1, y + 10, md); c.put(right + 1, y + 10, md)
            c.put(hx - 1, y + 8, md); c.put(right + 1, y + 8, md)
            if direction == 'left':
                back_of_head(y + 11)
                c.put(right + 1, y + 9, CLEAR)
    elif name == 'updo':           # 올림머리: 짧은 캡 + 정수리 쪽(6×3)
        bx = hx + hw // 2 - 3 if direction != 'left' else hx + hw // 2
        if direction == 'up':
            full_back(1)
        else:
            cap(5)
            if direction == 'left':
                back_of_head(y + 9)
        c.rect(bx, y - 3, 6, 4, lt)
        c.put(bx, y - 3, CLEAR); c.put(bx + 5, y - 3, CLEAR)
        c.hline(bx + 1, bx + 4, y, md); c.put(bx + 4, y - 1, md)
    elif name == 'long':           # 긴 생머리: 캡 + 어깨까지 3px 양옆
        if direction == 'up':
            full_back(0)
            c.rect(hx + 1, y + 6, hw - 2, 15, lt)                                  # 등 뒤로 흘러내림 y 22~36
            c.hline(hx + 1, right - 1, y + 20, md); c.vline(right - 1, y + 6, y + 20, md)
            c.put(hx + 1, y + 20, CLEAR); c.put(right - 1, y + 20, CLEAR)
        else:
            cap(6)
            for sx in (hx - 1, right - 1):
                c.rect(sx, y + 6, 3, 11, lt)
                c.hline(sx, sx + 2, y + 16, md)
                c.put(sx if sx < hx else sx + 2, y + 16, CLEAR)
            if direction == 'left':
                c.rect(hx + hw // 2 + 1, y + 6, hw // 2 - 1, 10, lt)                # 뒤통수
                c.rect(right - 3, y + 6, 4, 12, lt)                                  # 등 뒤로
                c.vline(right, y + 6, y + 17, md); c.hline(right - 3, right, y + 17, md)
                c.put(right, y + 17, CLEAR)
                c.vline(hx - 1, y + 2, y + 4, lt)
    return c


def hair(style: int, direction: str) -> Canvas:
    d = src_dir(direction)
    return finish(hair_raw(style, d), direction, context=body_raw(SKINS[0], d, 1))


# ---------------------------------------------------------------- 액세서리 (고유색)
def acc_raw(kind: str, direction: str) -> Canvas:
    """direction ∈ down/up/left. 좌표는 body_raw 기준(머리 y=16, 토르소 y=30)."""
    c = Canvas(32, 48)
    hy, ty = HEAD_Y, TORSO_Y
    hx, hw = (9, 14) if direction == 'left' else (8, 16)
    right = hx + hw - 1
    if kind == 'strawhat':
        ydk, ymd, ylt = PAL['yellow']
        bx, bw = (hx - 2, hw + 4) if direction != 'left' else (hx - 2, hw + 3)
        c.rect(bx, hy + 1, bw, 3, ymd); c.hline(bx + 1, bx + bw - 2, hy + 1, ylt); c.hline(bx, bx + bw - 1, hy + 3, ydk)   # 챙
        c.put(bx, hy + 1, CLEAR); c.put(bx + bw - 1, hy + 1, CLEAR)
        cx, cw = hx + 2, hw - 4
        c.rect(cx, hy - 2, cw, 4, ymd); c.hline(cx + 1, cx + cw - 2, hy - 2, ylt); c.vline(cx, hy - 1, hy, ylt)         # 크라운
        c.put(cx, hy - 2, CLEAR); c.put(cx + cw - 1, hy - 2, CLEAR)
        c.hline(cx, cx + cw - 1, hy + 1, ydk)                                                                             # 띠
    elif kind == 'cap':
        bdk, bmd, blt = PAL['sky']
        cap_block(c, hx, hy - 1, hw, 6, bmd)                                    # 크라운 y 15~20
        c.hline(hx + 2, right - 2, hy - 1, blt); c.vline(hx + 1, hy, hy + 3, blt)
        c.hline(hx, right, hy + 4, bdk)
        c.put(hx + hw // 2, hy - 1, bdk); c.put(hx + hw // 2 - 1, hy - 1, blt)   # 꼭지
        if direction == 'down':
            c.rect(hx + 2, hy + 5, hw - 4, 2, bdk); c.hline(hx + 3, right - 3, hy + 5, bmd)   # 챙(정면: 납작하게)
        elif direction == 'left':
            c.rect(hx - 5, hy + 3, 6, 2, bdk); c.hline(hx - 4, hx, hy + 3, bmd)              # 챙 앞으로
        else:
            c.rect(hx + 5, hy + 4, hw - 10, 1, bdk)                                            # 뒤: 조절띠
    elif kind == 'glasses':
        fr = PAL['basalt'][0]; lens = PAL['sky'][2]
        ey = hy + 7
        if direction == 'down':
            for ex in (10, 18):
                c.rect(ex, ey - 1, 4, 4, fr); c.rect(ex + 1, ey, 2, 2, lens); c.put(ex + 1, ey, PAL['white'][2])
            c.hline(14, 17, ey, fr)
            c.put(hx, ey, fr); c.put(right, ey, fr)                              # 다리
        elif direction == 'left':
            ex = hx + 2
            c.rect(ex, ey - 1, 4, 4, fr); c.rect(ex + 1, ey, 2, 2, lens); c.put(ex + 1, ey, PAL['white'][2])
            c.hline(ex + 4, right - 2, ey, fr)                                   # 안경다리(귀 쪽으로)
        # up: 보이지 않음
    elif kind == 'backpack':
        rdk, rmd, rlt = PAL['red']
        if direction == 'down':
            c.vline(12, ty + 1, ty + 4, rdk); c.vline(19, ty + 1, ty + 4, rdk)   # 어깨끈
            c.put(12, ty + 1, rmd); c.put(19, ty + 1, rmd)
        elif direction == 'up':
            c.rect(13, ty, 6, 6, rmd); c.hline(13, 18, ty, rlt); c.vline(13, ty + 1, ty + 4, rlt)
            c.hline(14, 18, ty + 5, rdk); c.vline(18, ty + 1, ty + 5, rdk)
            c.rect(15, ty + 2, 2, 1, rdk)                                        # 주머니 지퍼
        else:
            c.rect(18, ty, 3, 6, rmd); c.vline(20, ty, ty + 5, rdk); c.hline(18, 20, ty, rlt); c.hline(18, 20, ty + 5, rdk)
            c.put(20, ty, CLEAR); c.put(20, ty + 5, CLEAR)
            c.hline(14, 17, ty + 1, rdk)                                         # 어깨끈 옆면
    elif kind == 'camera':
        bdk, bmd, blt = PAL['basalt']
        if direction == 'down':
            c.rect(14, ty + 1, 4, 3, bdk); c.put(15, ty + 1, bmd); c.put(16, ty + 2, PAL['sky'][2]); c.put(17, ty + 2, bmd)
            c.hline(12, 13, ty, bdk); c.hline(18, 19, ty, bdk)                   # 목끈
        elif direction == 'left':
            c.rect(11, ty + 1, 3, 3, bdk); c.put(12, ty + 1, bmd); c.put(11, ty + 2, PAL['sky'][2])
            c.hline(14, 15, ty, bdk)
        # up: 보이지 않음
    elif kind == 'apron':
        adk, amd, alt = PAL['leaf']
        if direction == 'down':
            c.rect(13, ty + 1, 6, 5, amd); c.vline(13, ty + 1, ty + 5, alt)     # 가슴받이
            c.rect(12, ty + 6, 8, 3, amd); c.vline(12, ty + 6, ty + 8, alt); c.hline(12, 19, ty + 8, adk)   # 치마
            c.hline(13, 18, ty + 1, adk)                                         # 목끈 아래 선
            c.rect(15, ty + 4, 2, 2, adk); c.put(15, ty + 4, alt)               # 주머니
        elif direction == 'up':
            c.hline(13, 18, ty + 2, amd)                                         # 허리끈
            c.put(15, ty + 3, amd); c.put(16, ty + 3, amd); c.put(14, ty + 4, adk); c.put(17, ty + 4, adk)   # 리본
        else:
            c.rect(12, ty + 1, 3, 5, amd); c.vline(12, ty + 1, ty + 5, alt)
            c.rect(11, ty + 6, 5, 3, amd); c.vline(11, ty + 6, ty + 8, alt); c.hline(11, 15, ty + 8, adk)
            c.hline(12, 14, ty + 1, adk)
    return c


def acc(kind: str, direction: str) -> Canvas:
    d = src_dir(direction)
    return finish(acc_raw(kind, d), direction, context=body_raw(SKINS[0], d, 1))


# ---------------------------------------------------------------- 조합
def compose_character(skin: int, hair_style: int, hair_rgb: Color, top_rgb: Color,
                      accs: tuple[str, ...] | list[str], direction: str, frame: int) -> Canvas:
    """렌더와 같은 순서로 레이어를 쌓는다: 몸 → 상의(tint) → 머리(tint) → 액세서리."""
    c = body(skin, direction, frame)
    c.blit(tinted(top(direction, frame), top_rgb), 0, 0)
    c.blit(tinted(hair(hair_style, direction), hair_rgb), 0, 0)
    for kind in accs:
        c.blit(acc(kind, direction), 0, 0)
    return c


GUESTS = {
    'local':   dict(skin=0, hair_style=1, hair_rgb=HAIR_RGB['grey'], top_rgb=TOP_RGB['pink'], accs=('strawhat',)),
    'tourist': dict(skin=1, hair_style=1, hair_rgb=HAIR_RGB['brown'], top_rgb=TOP_RGB['sky'], accs=('camera',)),
}


def guest(kind: str, direction: str, frame: int) -> Canvas:
    return compose_character(direction=direction, frame=frame, **GUESTS[kind])


# ---------------------------------------------------------------- 시트 + 검토 시트
def sprites() -> dict[str, Canvas]:
    s: dict[str, Canvas] = {}
    for kind in ('local', 'tourist'):
        for d in DIRS:
            for f in range(3):
                s[f'guest_{kind}_{d}_{f}'] = guest(kind, d, f)
    for skin in range(len(SKINS)):
        for d in DIRS:
            for f in range(3):
                s[f'body_{skin}_{d}_{f}'] = body(skin, d, f)
    for d in DIRS:
        for f in range(3):
            s[f'top_{d}_{f}'] = top(d, f)
    for style in range(len(HAIR_STYLES)):
        for d in DIRS:
            s[f'hair_{style}_{d}'] = hair(style, d)
    for kind in ACC_KINDS:
        for d in DIRS:
            s[f'acc_{kind}_{d}'] = acc(kind, d)
    return s


def parts_preview(seed: int = 7, scale: int = 4) -> Canvas:
    """검토 시트: 무작위 조합 4×6 + 머리 8종(down/left/up) + 액세서리 6종(down/left/up)."""
    from sheet import contact_sheet
    rng = random.Random(seed)
    cells: dict[str, Canvas] = {}
    hair_keys, top_keys = list(HAIR_RGB), list(TOP_RGB)
    for i in range(24):
        skin = rng.randrange(len(SKINS)); style = rng.randrange(len(HAIR_STYLES))
        accs = rng.sample(ACC_KINDS, rng.choice((0, 1, 1, 2)))
        accs.sort(key=lambda k: ('apron', 'backpack', 'camera', 'glasses', 'cap', 'strawhat').index(k))
        cells[f'r{i}'] = compose_character(skin, style, HAIR_RGB[rng.choice(hair_keys)], TOP_RGB[rng.choice(top_keys)],
                                           accs, rng.choice(DIRS), rng.randrange(3))
    cols = 8
    for d in ('down', 'left', 'up'):
        for style in range(len(HAIR_STYLES)):
            cells[f'h{style}{d}'] = compose_character(style % 3, style, HAIR_RGB[hair_keys[style % 6]], TOP_RGB['white'], (), d, 1)
    for d in ('down', 'left', 'up'):
        for i, kind in enumerate(ACC_KINDS):
            cells[f'a{kind}{d}'] = compose_character(i % 3, 1, HAIR_RGB['dark'], TOP_RGB['yellow'], (kind,), d, 1)
        cells[f'a_pad0{d}'] = Canvas(32, 48); cells[f'a_pad1{d}'] = Canvas(32, 48)
    # 무작위 조합은 6열 4줄로 보이도록 8열 그리드에 2칸 여백을 넣는다
    ordered: dict[str, Canvas] = {}
    for row in range(4):
        for col in range(6):
            ordered[f'r{row * 6 + col}'] = cells[f'r{row * 6 + col}']
        ordered[f'pad{row}a'] = Canvas(32, 48); ordered[f'pad{row}b'] = Canvas(32, 48)
    for k, v in cells.items():
        if not k.startswith('r'):
            ordered[k] = v
    return contact_sheet(ordered, cols=cols, scale=scale)


if __name__ == '__main__':
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    parts_preview().save(os.path.join(here, 'out', 'parts_preview.png'))
    print('parts_preview.png written')
