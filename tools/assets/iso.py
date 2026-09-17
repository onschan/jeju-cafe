"""아이소메트릭(2:1 다이메트릭, 타일 64×32) 프리미티브.

좌표 규약(src/render/iso.ts와 동일): 셀 (x, y)의 다이아몬드 위 꼭짓점이 sx = (x − y)·32, sy = (x + y)·16.
픽셀 (px, py)는 그 중심 (px+.5, py+.5)을 역변환한 연속 셀 좌표를 floor 한 셀에 속한다 → 타일이 빈틈·겹침 없이
평면을 분할하므로 이어 붙여도 이음새가 없다.

상자(iso_box): 윗면 LT · 왼쪽 면 MD · 오른쪽 면 DK(광원 좌상단). 캔버스는 바닥 앞 꼭짓점이 **하단 중앙**에 오도록
너비 64·max(cw, ch)로 잡는다(렌더러가 스프라이트 하단 중앙을 footAnchor에 맞춘다).
"""
from __future__ import annotations
from typing import Callable
from px import Canvas, Color, OUT, SHADOW

ISO_W, ISO_H = 64, 32
Mask = dict[int, tuple[int, int]]   # 열 px → (ymin, ymax) 포함 구간


# ---------------------------------------------------------------- 좌표
def cell_xy(px: int, py: int, ox: float, oy: float) -> tuple[float, float]:
    """픽셀 중심 → 연속 셀 좌표. (ox, oy)는 셀 (0,0) 위 꼭짓점의 연속 화면 좌표."""
    sx, sy = px + 0.5 - ox, py + 0.5 - oy
    return sx / ISO_W + sy / ISO_H, sy / ISO_H - sx / ISO_W


def to_screen(x: float, y: float, ox: float, oy: float, z: float = 0) -> tuple[float, float]:
    """연속 셀 좌표(+높이 z px) → 연속 화면 좌표."""
    return ox + (x - y) * (ISO_W / 2), oy + (x + y) * (ISO_H / 2) - z


def diamond_mask(rect: tuple[float, float, float, float], ox: float, oy: float) -> Mask:
    """셀 단위 사각형 [x0,x1)×[y0,y1)이 차지하는 픽셀을 열별 (ymin, ymax)로."""
    x0, y0, x1, y1 = rect
    xs = [to_screen(x, y, ox, oy)[0] for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))]
    ys = [to_screen(x, y, ox, oy)[1] for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))]
    m: Mask = {}
    for px in range(int(min(xs)) - 1, int(max(xs)) + 2):
        lo = hi = None
        for py in range(int(min(ys)) - 1, int(max(ys)) + 2):
            cx, cy = cell_xy(px, py, ox, oy)
            if x0 <= cx < x1 and y0 <= cy < y1:
                lo = py if lo is None else lo
                hi = py
        if lo is not None:
            m[px] = (lo, hi)
    return m


def ellipse_mask(cx: float, cy: float, rx: float, ry: float) -> Mask:
    """화면 좌표 타원(픽셀 중심 기준)을 열별 구간으로."""
    m: Mask = {}
    for px in range(int(cx - rx) - 1, int(cx + rx) + 2):
        lo = hi = None
        for py in range(int(cy - ry) - 1, int(cy + ry) + 2):
            if ((px + 0.5 - cx) / rx) ** 2 + ((py + 0.5 - cy) / ry) ** 2 <= 1:
                lo = py if lo is None else lo
                hi = py
        if lo is not None:
            m[px] = (lo, hi)
    return m


def shift_mask(m: Mask, dx: int, dy: int) -> Mask:
    return {px + dx: (lo + dy, hi + dy) for px, (lo, hi) in m.items()}


def fill_mask(c: Canvas, m: Mask, col: Color, dy: int = 0) -> None:
    for px, (lo, hi) in m.items():
        c.vline(px, lo + dy, hi + dy, col)


def extrude(c: Canvas, m: Mask, height: int, pal: tuple[Color, Color, Color], split_x: int, z0: int = 0,
            edge: bool = True, side_fn: Callable[[int], bool] | None = None) -> None:
    """바닥 마스크 m(z=0)을 z0만큼 띄우고 height px 돌출. 윗면 LT, split_x 왼쪽 MD, 오른쪽 DK.
    edge: 옆면 첫 줄(윗면과의 경계)을 DK로 1px 그어 면을 나눈다. side_fn(px) → True면 그 열은 MD(왼쪽 면)."""
    dk, md, lt = pal
    for px, (lo, hi) in m.items():
        top_lo, top_hi = lo - height - z0, hi - height - z0
        c.vline(px, top_lo, top_hi, lt)
        if height > 0:
            left = side_fn(px) if side_fn else px < split_x
            c.vline(px, top_hi + 1, hi - z0, md if left else dk)
            if edge:
                c.put(px, top_hi + 1, dk if left else _darker(dk))


def union_mask(masks: list[Mask]) -> Mask:
    """열별 (min lo, max hi) 합집합 — 열마다 구간이 이어진 모양(ㄱ자 담 등)에만 쓴다."""
    out: Mask = {}
    for m in masks:
        for px, (lo, hi) in m.items():
            if px in out:
                out[px] = (min(out[px][0], lo), max(out[px][1], hi))
            else:
                out[px] = (lo, hi)
    return out


def iso_line(c: Canvas, p0: tuple[float, float], p1: tuple[float, float], col: Color) -> None:
    """연속 화면 좌표 두 점 사이 1px 선(브레젠험)."""
    x0, y0 = int(p0[0]), int(p0[1]); x1, y1 = int(p1[0]), int(p1[1])
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        c.put(x0, y0, col)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy; x0 += sx
        if e2 <= dx:
            err += dx; y0 += sy


def texture_where(c: Canvas, tmp: Canvas, keys: set[Color]) -> None:
    """tmp의 픽셀을 c의 현재 색이 keys 안에 있는 곳에만 옮긴다(면에 무늬 입히기)."""
    for y in range(min(c.h, tmp.h)):
        for x in range(min(c.w, tmp.w)):
            col = tmp.px[y][x]
            if col[3] and c.px[y][x] in keys:
                c.px[y][x] = col


def _darker(col: Color, k: float = 0.75) -> Color:
    return (int(col[0] * k), int(col[1] * k), int(col[2] * k), col[3])


# ---------------------------------------------------------------- 캔버스
class IsoCanvas(Canvas):
    """cw×ch 칸 발자국 위에 상자·원판·빌보드를 쌓는 캔버스. 바닥 앞 꼭짓점 = (w/2, h)."""

    def __init__(self, cw: int, ch: int, height: int, pad_top: int = 0):
        w = ISO_W * max(cw, ch)
        d = (cw + ch) * (ISO_H // 2)
        super().__init__(w, d + height + pad_top)
        self.cw, self.ch, self.height = cw, ch, height
        self.ox = w / 2 - (cw - ch) * (ISO_W / 2)      # 바닥 셀(0,0) 위 꼭짓점 연속 x
        self.oy = float(pad_top + height)                # 바닥 셀(0,0) 위 꼭짓점 연속 y
        self.mid = w // 2                                # 앞 꼭짓점 오른쪽 열(왼쪽 열 mid−1)
        self.last_box: dict | None = None

    # 좌표
    def screen(self, x: float, y: float, z: float = 0) -> tuple[float, float]:
        return to_screen(x, y, self.ox, self.oy, z)

    def spx(self, x: float, y: float, z: float = 0) -> tuple[int, int]:
        sx, sy = self.screen(x, y, z)
        return int(sx), int(sy)

    def footprint(self, rect: tuple[float, float, float, float] | None = None) -> Mask:
        return diamond_mask(rect or (0, 0, self.cw, self.ch), self.ox, self.oy)

    # 도형
    def box(self, height: int, pal: tuple[Color, Color, Color], rect: tuple[float, float, float, float] | None = None,
            z0: int = 0, edge: bool = True, side_fn: Callable[[int], bool] | None = None) -> Mask:
        rect = rect or (0, 0, self.cw, self.ch)
        m = self.footprint(rect)
        split = int(self.screen(rect[2], rect[3])[0])   # 앞 꼭짓점 x
        extrude(self, m, height, pal, split, z0, edge, side_fn)
        ymax = {px: hi for px, (lo, hi) in m.items()}
        self.last_box = {'rect': rect, 'height': height, 'z0': z0, 'split': split,
                         'x0': min(m), 'x1': max(m), 'ymax': ymax}
        return m

    def boxes(self, rects: list[tuple[float, float, float, float]], height: int, pal: tuple[Color, Color, Color],
              z0: int = 0, edge: bool = True, side_fn: Callable[[int], bool] | None = None) -> Mask:
        """여러 사각형의 합집합을 한 덩어리로 돌출(ㄱ자 담 등). side_fn이 없으면 앞 꼭짓점 x 기준."""
        m = union_mask([self.footprint(r) for r in rects])
        split = max(m, key=lambda px: (m[px][1], -abs(px - self.mid)))
        extrude(self, m, height, pal, split, z0, edge, side_fn)
        return m

    def line(self, p0: tuple[float, float, float], p1: tuple[float, float, float], col: Color) -> None:
        """셀 좌표 (x, y, z) 두 점 사이 선."""
        iso_line(self, self.screen(*p0), self.screen(*p1), col)

    def sx_of(self, x: float, y: float) -> int:
        return int(self.screen(x, y)[0])

    def gable_roof(self, rect: tuple[float, float, float, float], z_eave: int, rise: int,
                   pal: tuple[Color, Color, Color], axis: str = 'x', slates: int = 3, ridge: bool = True) -> None:
        """박공 지붕. axis='x'면 용마루가 x 방향(y 중앙). 앞 경사면 MD, 뒤 경사면(얇게 보임) DK, 용마루 LT."""
        dk, md, lt = pal
        x0, y0, x1, y1 = rect
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        half = (y1 - y0) / 2 if axis == 'x' else (x1 - x0) / 2

        def z_at(x: float, y: float) -> float:
            t = abs(y - my) / half if axis == 'x' else abs(x - mx) / half
            return z_eave + rise * (1 - t)

        def front(x: float, y: float) -> bool:
            return (y > my) if axis == 'x' else (x > mx)

        step = 0.02
        n_x, n_y = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
        for pass_front in (False, True):
            for i in range(n_x):
                x = x0 + i * step
                for j in range(n_y):
                    y = y0 + j * step
                    if front(x, y) != pass_front:
                        continue
                    sx, sy = self.screen(x, y, z_at(x, y))
                    self.put(int(sx), int(sy), md if pass_front else dk)
        # 슬레이트 줄: 용마루와 평행한 선 + 직교 선
        for k in range(1, slates):
            t = k / slates
            if axis == 'x':
                y = my + half * t
                self.line((x0, y, z_at(x0, y)), (x1, y, z_at(x1, y)), dk)
            else:
                x = mx + half * t
                self.line((x, y0, z_at(x, y0)), (x, y1, z_at(x, y1)), dk)
        n_cols = int(((x1 - x0) if axis == 'x' else (y1 - y0)) * 3)
        for k in range(1, n_cols):
            t = k / n_cols
            if axis == 'x':
                x = x0 + (x1 - x0) * t
                self.line((x, my, z_at(x, my)), (x, y1, z_at(x, y1)), dk)
            else:
                y = y0 + (y1 - y0) * t
                self.line((mx, y, z_at(mx, y)), (x1, y, z_at(x1, y)), dk)
        zr = z_eave + rise
        if ridge:
            if axis == 'x':
                self.line((x0, my, zr), (x1, my, zr), lt); self.line((x0, my, zr + 1), (x1, my, zr + 1), lt)
            else:
                self.line((mx, y0, zr), (mx, y1, zr), lt); self.line((mx, y0, zr + 1), (mx, y1, zr + 1), lt)
        # 처마·박공 가장자리 외곽선(실루엣 안쪽 경계라 outline()이 못 잡는 곳)
        if axis == 'x':
            self.line((x0, y1, z_eave), (x1, y1, z_eave), OUT)
            self.line((x1, y1, z_eave), (x1, my, zr), OUT); self.line((x1, my, zr), (x1, y0, z_eave), OUT)
        else:
            self.line((x1, y0, z_eave), (x1, y1, z_eave), OUT)
            self.line((x1, y1, z_eave), (mx, y1, zr), OUT); self.line((mx, y1, zr), (x0, y1, z_eave), OUT)

    def disc(self, cx: float, cy: float, r: float, height: int, pal: tuple[Color, Color, Color], z0: int = 0,
             edge: bool = False) -> Mask:
        """셀 좌표 (cx, cy) 중심 반지름 r 칸의 원기둥."""
        sx, sy = self.screen(cx, cy)
        m = ellipse_mask(sx, sy, r * ISO_W / 2 * 1.4142, r * ISO_H / 2 * 1.4142)
        extrude(self, m, height, pal, int(sx), z0, edge)
        return m

    def ground_shadow(self, cx: float, cy: float, rx: float, ry: float | None = None) -> None:
        """셀 좌표 중심의 바닥 그림자(rx 칸 → 화면 타원)."""
        sx, sy = self.screen(cx, cy)
        ry = rx / 2 if ry is None else ry
        self.ellipse(sx - 0.5, sy - 0.5, rx * ISO_W / 2 * 1.4142, ry * ISO_H / 2 * 1.4142, SHADOW, blend=True)

    def billboard(self, sprite: Canvas, cx: float = 0.5, cy: float = 0.5, lift: int = 0) -> None:
        """2D 스프라이트를 (cx, cy) 셀 좌표에 세운다(하단 중앙 = 그 점)."""
        sx, sy = self.screen(cx, cy)
        self.blit(sprite, int(sx) - sprite.w // 2, int(sy) - sprite.h - lift)

    def pillar(self, x: float, y: float, w: int, height: int, pal: tuple[Color, Color, Color], z0: int = 0) -> None:
        """가는 기둥: 세로 막대(왼쪽 MD 오른쪽 DK) + 윗면 점."""
        sx, sy = self.spx(x, y)
        dk, md, lt = pal
        for i in range(w):
            self.vline(sx - w // 2 + i, sy - z0 - height, sy - z0, md if i < w / 2 else dk)
        self.hline(sx - w // 2, sx - w // 2 + w - 1, sy - z0 - height, lt)


# ---------------------------------------------------------------- 공개 API
def iso_tile(top: Color, edge: Color | None, w: int = ISO_W, h: int = ISO_H) -> Canvas:
    """평평한 다이아몬드 타일. edge를 주면 아래 두 변을 1px 그 색으로(격자감, 이음새는 그대로 이어짐)."""
    c = Canvas(w, h)
    m = diamond_mask((0, 0, 1, 1), w / 2, 0) if (w, h) == (ISO_W, ISO_H) else _scaled_diamond(w, h)
    fill_mask(c, m, top)
    if edge is not None:
        for px, (lo, hi) in m.items():
            if hi >= h // 2:
                c.put(px, hi, edge)
    return c


def _scaled_diamond(w: int, h: int) -> Mask:
    m: Mask = {}
    for px in range(w):
        lo = hi = None
        for py in range(h):
            if abs(px + 0.5 - w / 2) / (w / 2) + abs(py + 0.5 - h / 2) / (h / 2) <= 1:
                lo = py if lo is None else lo
                hi = py
        if lo is not None:
            m[px] = (lo, hi)
    return m


def tile_mask() -> Mask:
    return diamond_mask((0, 0, 1, 1), ISO_W / 2, 0)


def iso_box(cw: int, ch: int, height: int, pal: tuple[Color, Color, Color], outline: bool = True,
            pad_top: int = 0) -> IsoCanvas:
    """cw×ch 칸, height px 상자. 캔버스 64·max(cw,ch) × ((cw+ch)·16 + height + pad_top)."""
    c = IsoCanvas(cw, ch, height, pad_top)
    c.box(height, pal)
    if outline:
        c.outline()
    return c


def iso_shadow(cw: int = 1, ch: int = 1, rx: float = 0.45, ry: float | None = None, height: int = 0,
               pad_top: int = 0) -> IsoCanvas:
    """발자국 중심에 바닥 그림자만 깐 빈 캔버스(빌보드용)."""
    c = IsoCanvas(cw, ch, height, pad_top)
    c.ground_shadow(cw / 2, ch / 2, rx, ry)
    return c


def paste_face(box: IsoCanvas, face: str, sprite: Canvas, u: int, v: int) -> None:
    """마지막 box()의 면에 2D 스프라이트를 붙인다.
    left: 면 왼쪽 끝에서 u px, 면 윗변에서 v px — 열마다 윗변을 따라 0.5px/x 내려감(계단).
    right: 앞 꼭짓점에서 u px, 윗변 따라 0.5px/x 올라감. top: 윗면 위 꼭짓점 기준 (u, v) 평면 블릿."""
    g = box.last_box
    assert g is not None, 'box()를 먼저 호출'
    h, z0, split = g['height'], g['z0'], g['split']
    if face == 'top':
        sx, sy = box.screen(g['rect'][0], g['rect'][1], z0 + h)
        box.blit(sprite, int(sx) - sprite.w // 2 + u, int(sy) + v)
        return
    x0 = g['x0'] if face == 'left' else split
    for i in range(sprite.w):
        px = x0 + u + i
        if px not in g['ymax'] or (face == 'left' and px >= split) or (face == 'right' and px < split):
            continue
        top = g['ymax'][px] - h - z0 + 1
        for j in range(sprite.h):
            col = sprite.px[j][i]
            py = top + v + j
            if col[3] == 0 or py > g['ymax'][px] - z0:
                continue
            (box.put if col[3] == 255 else box.blend)(px, py, col)


def face_span(box: IsoCanvas, face: str) -> int:
    """왼쪽/오른쪽 면의 가로 픽셀 수."""
    g = box.last_box
    assert g is not None
    return (g['split'] - g['x0']) if face == 'left' else (g['x1'] - g['split'] + 1)
