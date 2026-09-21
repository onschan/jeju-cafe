"""픽셀 캔버스 + PNG 인코더 (표준 라이브러리만). 카이로소프트풍 스프라이트 생성용."""
from __future__ import annotations
import struct, zlib, math

Color = tuple[int, int, int, int]
CLEAR: Color = (0, 0, 0, 0)

def hexc(h: str, a: int = 255) -> Color:
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

OUT = hexc('2b2118')
SHADOW: Color = (0, 0, 0, 70)

# 이름 → (DK, MD, LT)
PAL: dict[str, tuple[Color, Color, Color]] = {
    'leaf':   (hexc('2f7a2a'), hexc('4fae3a'), hexc('8be25a')),
    'orange': (hexc('d9741a'), hexc('f7981f'), hexc('ffd27a')),
    'wood':   (hexc('5e3a1c'), hexc('96602c'), hexc('c98a4b')),
    'basalt': (hexc('2a2a2e'), hexc('4a4a52'), hexc('6f6f78')),
    'soil':   (hexc('8a5a2b'), hexc('a5763f'), hexc('c4955a')),
    'road':   (hexc('6d6d6d'), hexc('8f8f8f'), hexc('b3b3b3')),
    'sky':    (hexc('2f6fb5'), hexc('4a90d9'), hexc('8ec1f0')),
    'skin':   (hexc('e8a97e'), hexc('f4c6a0'), hexc('ffe0c4')),
    'white':  (hexc('cfcac0'), hexc('f5f1e8'), hexc('ffffff')),
    'red':    (hexc('9f1f1f'), hexc('d62828'), hexc('f26d6d')),
    'yellow': (hexc('c9a227'), hexc('ffd166'), hexc('fff0b3')),
    'pink':   (hexc('c76f96'), hexc('f7a1c4'), hexc('ffd3e6')),
    'snow':   (hexc('bfd4e6'), hexc('e6f0f8'), hexc('ffffff')),
    'grass':  (hexc('3f7f2f'), hexc('5aa63f'), hexc('8fd45e')),
}

class Canvas:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.px: list[list[Color]] = [[CLEAR] * w for _ in range(h)]

    @classmethod
    def from_art(cls, rows: list[str], legend: dict[str, Color], w: int | None = None, h: int | None = None,
                 x: int = 0, y: int = 0) -> 'Canvas':
        """문자 그림 → 캔버스. `.`과 공백은 투명, 나머지 글자는 legend 색. 모든 행 길이가 같아야 한다.
        w/h를 주면 그 크기 캔버스의 (x, y)에 그림을 얹는다(부분 그림용)."""
        if not rows:
            raise ValueError('빈 ART')
        width = len(rows[0])
        for i, r in enumerate(rows):
            if len(r) != width:
                raise ValueError(f'ART 행 {i} 길이 {len(r)} != {width}: {r!r}')
        c = cls(w or width, h or len(rows))
        for yy, r in enumerate(rows):
            for xx, ch in enumerate(r):
                if ch in '. ':
                    continue
                if ch not in legend:
                    raise KeyError(f'ART 글자 {ch!r} (행 {yy}, 열 {xx})가 legend에 없다')
                c.put(x + xx, y + yy, legend[ch])
        return c

    # ---- 픽셀 ----
    def put(self, x: int, y: int, c: Color) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x: int, y: int) -> Color:
        return self.px[y][x] if 0 <= x < self.w and 0 <= y < self.h else CLEAR

    def blend(self, x: int, y: int, c: Color) -> None:
        """알파 블렌딩 put (그림자용)."""
        if not (0 <= x < self.w and 0 <= y < self.h):
            return
        r, g, b, a = c
        br, bg, bb, ba = self.px[y][x]
        t = a / 255
        if ba == 0:
            self.px[y][x] = (r, g, b, a)
        else:
            self.px[y][x] = (int(r * t + br * (1 - t)), int(g * t + bg * (1 - t)), int(b * t + bb * (1 - t)), max(a, ba))

    # ---- 도형 ----
    def rect(self, x: int, y: int, w: int, h: int, c: Color) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, c)

    def hline(self, x0: int, x1: int, y: int, c: Color) -> None:
        for x in range(min(x0, x1), max(x0, x1) + 1):
            self.put(x, y, c)

    def vline(self, x: int, y0: int, y1: int, c: Color) -> None:
        for y in range(min(y0, y1), max(y0, y1) + 1):
            self.put(x, y, c)

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, c: Color, blend: bool = False) -> None:
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    (self.blend if blend else self.put)(x, y, c)

    def circle(self, cx: float, cy: float, r: float, c: Color) -> None:
        self.ellipse(cx, cy, r, r, c)

    def shade_ellipse(self, cx: float, cy: float, rx: float, ry: float, tones: tuple[Color, Color, Color], light=(-0.45, -0.55)) -> None:
        """타원을 3톤으로: 광원 방향으로 밝게."""
        dk, md, lt = tones
        lx, ly = cx + light[0] * rx, cy + light[1] * ry
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    d = ((x - lx) / rx) ** 2 + ((y - ly) / ry) ** 2
                    self.put(x, y, lt if d < 0.35 else md if d < 1.1 else dk)

    def shade_rect(self, x: int, y: int, w: int, h: int, tones: tuple[Color, Color, Color]) -> None:
        """사각 면: 위·왼쪽 1px 밝게, 아래·오른쪽 1px 어둡게."""
        dk, md, lt = tones
        self.rect(x, y, w, h, md)
        self.hline(x, x + w - 1, y, lt); self.vline(x, y, y + h - 1, lt)
        self.hline(x, x + w - 1, y + h - 1, dk); self.vline(x + w - 1, y, y + h - 1, dk)

    def shadow(self, cx: float, cy: float, rx: float, ry: float) -> None:
        self.ellipse(cx, cy, rx, ry, SHADOW, blend=True)

    def outline(self, c: Color = OUT) -> None:
        """불투명 픽셀 중 4방향 이웃이 비(반)투명이면 외곽선 색으로."""
        solid = {(x, y) for y in range(self.h) for x in range(self.w) if self.px[y][x][3] == 255}
        for (x, y) in solid:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if self.get(x + dx, y + dy)[3] < 255:
                    self.px[y][x] = c
                    break

    def dither(self, x: int, y: int, w: int, h: int, a: Color, b: Color) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, a if (xx + yy) % 2 == 0 else b)

    # ---- 합성 ----
    def blit(self, src: 'Canvas', x: int, y: int) -> None:
        for yy in range(src.h):
            for xx in range(src.w):
                c = src.px[yy][xx]
                if c[3] == 255:
                    self.put(x + xx, y + yy, c)
                elif c[3] > 0:
                    self.blend(x + xx, y + yy, c)

    def flip_x(self) -> 'Canvas':
        out = Canvas(self.w, self.h)
        for y in range(self.h):
            out.px[y] = list(reversed(self.px[y]))
        return out

    def copy(self) -> 'Canvas':
        out = Canvas(self.w, self.h)
        out.px = [row[:] for row in self.px]
        return out

    # ---- PNG ----
    def save(self, path: str, scale: int = 1) -> None:
        w, h = self.w * scale, self.h * scale
        rows = []
        for y in range(h):
            row = self.px[y // scale]
            rows.append(b'\x00' + b''.join(bytes(row[x // scale]) for x in range(w)))
        raw = b''.join(rows)
        def chunk(t: bytes, d: bytes) -> bytes:
            return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        with open(path, 'wb') as f:
            f.write(b'\x89PNG\r\n\x1a\n')
            f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
            f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
            f.write(chunk(b'IEND', b''))
