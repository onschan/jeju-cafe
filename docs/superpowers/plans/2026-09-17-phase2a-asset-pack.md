# 2A 에셋 팩 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스크립트로 생성한 카이로소프트풍 스프라이트 시트·16px 아이콘·Galmuri 폰트·8비트 SFX·계절 BGM 초안을 게임에 붙여, 1단계 색 사각형 프로토타입이 "게임처럼" 보이고 들리게 한다.

**Architecture:** `tools/assets/`(Python 3 표준 라이브러리만; PNG·WAV 인코더 자체 구현, m4a 변환만 ffmpeg) → `public/assets/`(시트 PNG + Pixi JSON, 아이콘 PNG, m4a) + `public/fonts/`. 런타임은 `src/render/assets.ts`(Pixi `Assets` 로더, 없으면 플레이스홀더 폴백)와 `src/ui/audio.ts`(Web Audio). sim은 건드리지 않는다.

**Tech Stack:** Python 3.12(표준 라이브러리), ffmpeg(로컬 `/opt/homebrew/bin/ffmpeg`), PixiJS 8 `Assets`/`Spritesheet`, Web Audio API, Galmuri v2.40.4(OFL).

**Spec:** `docs/superpowers/specs/2026-09-17-phase2-game-feel-assets.md` §2A.

---

## 파일 구조

```
tools/assets/
├─ px.py            # Canvas(RGBA), 도형·외곽선·명암 헬퍼, PNG 인코더, 팔레트
├─ sheet.py         # 스프라이트 패킹 + Pixi 스프라이트시트 JSON + 콘택트 시트
├─ sprites_tiles.py # 타일 (계절 4 × 지형 3 + locked)
├─ sprites_objects.py
├─ sprites_chars.py # 손님 2종 × 4방향 × 3프레임, 할망 초상
├─ sprites_ui.py    # 말풍선, 이펙트, 16px 아이콘
├─ build.py         # 전부 실행 → public/assets/sheet.{png,json}, icons/, out/contact.png
├─ synth.py         # WAV 인코더, 오실레이터, ADSR, 노트→주파수, ffmpeg 변환
├─ sfx.py           # 효과음 13개
├─ bgm.py           # 계절 BGM 4 + 타이틀
├─ fetch_font.sh    # Galmuri 다운로드·추출
└─ test_px.py       # 인코더·패커 단위 테스트 (unittest)
public/assets/{sheet.png, sheet.json, icons/*.png, sfx/*.m4a, bgm/*.m4a}
public/fonts/{Galmuri11.woff2, LICENSE-Galmuri.txt}
src/render/assets.ts   # 로더 + tex(name) 폴백
src/render/GameView.ts # 스프라이트 사용, 애니, y-정렬, 이펙트 (수정)
src/render/textures.ts # 플레이스홀더 유지(폴백용)
src/ui/audio.ts        # SFX/BGM 매니저
src/ui/{HUD,BottomSheet,MonthCard,Guide}.tsx  # 아이콘·폰트 적용 (수정)
src/ui/store.ts        # 액션 결과 → 사운드 훅 (수정)
index.html             # @font-face, pixelated (수정)
package.json           # scripts: assets, assets:audio, assets:font (수정)
```

## 스타일 가이드 (모든 스프라이트 Task에 적용)

- 외곽선 `OUT=#2b2118` 1px, 불투명 픽셀 중 투명 이웃(4방향)이 있으면 외곽선. `px.outline(c)`가 자동 처리.
- 광원 좌상단. 면마다 `_LT/_MD/_DK` 3톤. 하이라이트 1px 흰빛(`#fff2b0` 계열)은 아끼되 금속·물·과일에만.
- 팔레트(`px.PAL`): 잎 `#2f7a2a/#4fae3a/#8be25a`, 감귤 `#d9741a/#f7981f/#ffd27a`, 나무 `#5e3a1c/#96602c/#c98a4b`, 현무암 `#2a2a2e/#4a4a52/#6f6f78`, 흙 `#8a5a2b/#a5763f/#c4955a`, 도로 `#6d6d6d/#8f8f8f/#b3b3b3`, 하늘색 `#4a90d9`, 살구 피부 `#f4c6a0/#e8a97e`, 흰 `#f5f1e8`, 빨강 `#d62828`, 노랑 `#ffd166`, 분홍 `#f7a1c4`.
- 1×1칸 오브젝트는 32×40 캔버스, 바닥선은 y=39. 나무·정류장은 32×48. 창고는 96×80(바닥선 y=79).
- 그림자: 바닥에 반투명 타원 `(0,0,0,70)`.
- 캐릭터 32×48: 머리 큰 SD 비율(머리 14px, 몸 14px, 다리 8px), 눈 2px 검정, 프레임 0/2는 좌·우 다리 교차, 1은 정지. `down/up/left/right` 4방향, right는 left의 좌우 반전(`c.flip_x()`).
- 아이콘 16×16: 외곽선 포함, 단색 배경 없이 투명.
- 이모지 금지. 모든 표정은 픽셀로.

---

### Task 1: px.py — 캔버스·도형·PNG 인코더

**Files:**
- Create: `tools/assets/px.py`, `tools/assets/test_px.py`

- [ ] **Step 1: 실패하는 테스트**

`tools/assets/test_px.py`:
```python
import unittest, zlib, struct, os, tempfile
from px import Canvas, hexc, PAL, OUT, CLEAR

class TestCanvas(unittest.TestCase):
    def test_put_get_and_bounds(self):
        c = Canvas(4, 3)
        c.put(1, 1, hexc('ff0000'))
        self.assertEqual(c.get(1, 1), (255, 0, 0, 255))
        self.assertEqual(c.get(-1, 0), CLEAR)
        self.assertEqual(c.get(4, 0), CLEAR)
        c.put(9, 9, hexc('00ff00'))  # 무시

    def test_rect_ellipse_outline(self):
        c = Canvas(8, 8)
        c.rect(2, 2, 4, 4, hexc('00ff00'))
        c.outline(OUT)
        self.assertEqual(c.get(2, 2), OUT)      # 모서리는 외곽선
        self.assertEqual(c.get(3, 3), (0, 255, 0, 255))  # 안쪽 유지
        self.assertEqual(c.get(0, 0), CLEAR)
        e = Canvas(9, 9)
        e.ellipse(4, 4, 4, 3, hexc('0000ff'))
        self.assertEqual(e.get(4, 4)[2], 255)
        self.assertEqual(e.get(0, 0), CLEAR)

    def test_flip_and_blit(self):
        a = Canvas(3, 1); a.put(0, 0, hexc('ff0000'))
        b = a.flip_x()
        self.assertEqual(b.get(2, 0), (255, 0, 0, 255))
        self.assertEqual(b.get(0, 0), CLEAR)
        big = Canvas(5, 5); big.blit(a, 1, 2)
        self.assertEqual(big.get(1, 2), (255, 0, 0, 255))

    def test_png_roundtrip_header(self):
        c = Canvas(2, 2); c.put(0, 0, hexc('123456'))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'x.png'); c.save(p)
            data = open(p, 'rb').read()
        self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
        w, h = struct.unpack('>II', data[16:24])
        self.assertEqual((w, h), (2, 2))
        # IDAT 압축 해제 → 2행 × (1 필터 + 2px×4)
        idat_start = data.index(b'IDAT') + 4
        idat_len = struct.unpack('>I', data[idat_start - 8:idat_start - 4])[0]
        raw = zlib.decompress(data[idat_start:idat_start + idat_len])
        self.assertEqual(len(raw), 2 * (1 + 2 * 4))
        self.assertEqual(raw[1:5], bytes([0x12, 0x34, 0x56, 255]))

    def test_scaled_save(self):
        c = Canvas(2, 1); c.put(0, 0, hexc('ffffff'))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'x.png'); c.save(p, scale=4)
            w, h = struct.unpack('>II', open(p, 'rb').read()[16:24])
        self.assertEqual((w, h), (8, 4))

    def test_palette_has_three_tones(self):
        for k in ('leaf', 'orange', 'wood', 'basalt', 'soil', 'road'):
            self.assertEqual(len(PAL[k]), 3)

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `cd tools/assets && python3 -m unittest test_px -v`
Expected: `ModuleNotFoundError: No module named 'px'`

- [ ] **Step 3: px.py 작성**

`tools/assets/px.py`:
```python
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
```

- [ ] **Step 4: 통과 확인**

Run: `cd tools/assets && python3 -m unittest test_px -v`
Expected: 6 tests OK

- [ ] **Step 5: Commit**

```bash
git add tools/assets/px.py tools/assets/test_px.py
git commit -m "feat(assets): 픽셀 캔버스와 PNG 인코더"
```

---

### Task 2: sheet.py — 패킹·Pixi JSON·콘택트 시트

**Files:**
- Create: `tools/assets/sheet.py`
- Modify: `tools/assets/test_px.py` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`tools/assets/test_px.py` 끝(`if __name__` 위)에:
```python
from sheet import pack, write_spritesheet, contact_sheet
import json

class TestSheet(unittest.TestCase):
    def test_pack_no_overlap_and_json(self):
        sprites = {'a': Canvas(32, 40), 'b': Canvas(96, 80), 'c': Canvas(16, 16)}
        for c in sprites.values(): c.rect(0, 0, c.w, c.h, hexc('ff00ff'))
        sheet, frames = pack(sprites, padding=1)
        self.assertTrue(sheet.w % 2 == 0 and sheet.h > 0)
        boxes = list(frames.values())
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                self.assertTrue(a['x'] + a['w'] <= b['x'] or b['x'] + b['w'] <= a['x'] or a['y'] + a['h'] <= b['y'] or b['y'] + b['h'] <= a['y'])
        with tempfile.TemporaryDirectory() as d:
            png = os.path.join(d, 's.png'); js = os.path.join(d, 's.json')
            write_spritesheet(sheet, frames, png, js)
            meta = json.load(open(js))
        self.assertEqual(meta['meta']['image'], 's.png')
        self.assertEqual(meta['frames']['b']['frame']['w'], 96)
        self.assertEqual(meta['frames']['c']['sourceSize'], {'w': 16, 'h': 16})

    def test_contact_sheet_size(self):
        sprites = {'a': Canvas(32, 40), 'b': Canvas(32, 40)}
        cs = contact_sheet(sprites, cols=2, scale=2)
        self.assertEqual(cs.w, (32 + 4) * 2 * 2)
```

- [ ] **Step 2: 실패 확인**

Run: `cd tools/assets && python3 -m unittest test_px -v`
Expected: `ModuleNotFoundError: No module named 'sheet'`

- [ ] **Step 3: sheet.py 작성**

`tools/assets/sheet.py`:
```python
"""스프라이트 패킹(선반 알고리즘) + Pixi 스프라이트시트 JSON + 리뷰용 콘택트 시트."""
from __future__ import annotations
import json, os
from px import Canvas, hexc

def pack(sprites: dict[str, Canvas], padding: int = 1, max_w: int = 1024) -> tuple[Canvas, dict[str, dict]]:
    """높이 내림차순 선반 패킹. 반환: (시트, {name: {x,y,w,h}})."""
    items = sorted(sprites.items(), key=lambda kv: (-kv[1].h, -kv[1].w, kv[0]))
    frames: dict[str, dict] = {}
    x = y = shelf_h = 0
    for name, c in items:
        if x + c.w + padding > max_w:
            x = 0; y += shelf_h + padding; shelf_h = 0
        frames[name] = {'x': x, 'y': y, 'w': c.w, 'h': c.h}
        x += c.w + padding
        shelf_h = max(shelf_h, c.h)
    total_h = y + shelf_h
    total_w = max_w if len(items) > 1 else items[0][1].w
    # 2의 배수로 맞춤(nearest 스케일에서 안전)
    total_h += total_h % 2
    sheet = Canvas(total_w, total_h)
    for name, f in frames.items():
        sheet.blit(sprites[name], f['x'], f['y'])
    return sheet, frames

def write_spritesheet(sheet: Canvas, frames: dict[str, dict], png_path: str, json_path: str) -> None:
    sheet.save(png_path)
    data = {
        'frames': {
            name: {
                'frame': {'x': f['x'], 'y': f['y'], 'w': f['w'], 'h': f['h']},
                'rotated': False, 'trimmed': False,
                'spriteSourceSize': {'x': 0, 'y': 0, 'w': f['w'], 'h': f['h']},
                'sourceSize': {'w': f['w'], 'h': f['h']},
            } for name, f in frames.items()
        },
        'meta': {'image': os.path.basename(png_path), 'format': 'RGBA8888', 'size': {'w': sheet.w, 'h': sheet.h}, 'scale': '1'},
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=0)

def contact_sheet(sprites: dict[str, Canvas], cols: int = 8, scale: int = 3, gap: int = 4) -> Canvas:
    """검토용: 회색 바탕에 셀 단위로 나열. 셀 크기는 가장 큰 스프라이트 기준."""
    names = list(sprites)
    cw = max(c.w for c in sprites.values()) + gap
    ch = max(c.h for c in sprites.values()) + gap
    rows = (len(names) + cols - 1) // cols
    cs = Canvas(cw * cols, ch * rows)
    cs.rect(0, 0, cs.w, cs.h, hexc('3b3b3b'))
    for i, n in enumerate(names):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        cs.dither(cx, cy, cw - gap, ch - gap, hexc('5a5a5a'), hexc('505050'))
        cs.blit(sprites[n], cx + (cw - gap - sprites[n].w) // 2, cy + (ch - gap - sprites[n].h))
    out = Canvas(cs.w * scale, cs.h * scale)
    for y in range(out.h):
        for x in range(out.w):
            out.px[y][x] = cs.px[y // scale][x // scale]
    return out
```

- [ ] **Step 4: 통과 확인**

Run: `cd tools/assets && python3 -m unittest test_px -v`
Expected: 8 tests OK

- [ ] **Step 5: Commit**

```bash
git add tools/assets/sheet.py tools/assets/test_px.py
git commit -m "feat(assets): 스프라이트 패킹과 Pixi JSON"
```

---

### Task 3: 타일·오브젝트 스프라이트

**Files:**
- Create: `tools/assets/sprites_tiles.py`, `tools/assets/sprites_objects.py`, `tools/assets/build.py`
- Modify: `package.json` (scripts)

각 모듈은 `def sprites() -> dict[str, Canvas]`를 export한다. 아래 목록과 묘사대로 `px` 헬퍼로 그린다. 정확한 픽셀은 구현자의 재량이지만 **스타일 가이드와 크기·바닥선·이름은 반드시 지킨다.**

- [ ] **Step 1: sprites_tiles.py**

`tile_{terrain}_{season}` 32×32, 12장 + `tile_locked`:
- `soil`: 바탕 `soil.MD`, 4~6개 `soil.DK` 점, 2~3개 `soil.LT` 점, 오른쪽·아래 1px `soil.DK` 경계선(격자감). 계절: spring 노란 유채점 2개(`yellow.MD`), summer `grass.MD` 풀 3포기(2px 세로선), autumn 갈색 낙엽점 2개(`orange.DK`), winter 상단 40% `snow.MD` 덮음(경계는 `snow.DK` 1px)
- `rock`: 바탕 `basalt.MD`, 큰 돌 2개(`shade_ellipse` basalt, rx 5~7), 구멍 점 `basalt.DK` 4개. 겨울엔 돌 위에 눈 `snow.MD` 캡
- `road`: 바탕 `road.MD`, 세로 중앙선 없음, 가장자리 위·아래 1px `road.DK`, 자갈 점 `road.LT` 6개. 겨울: 눈 점 4개
- `tile_locked`: `(0,0,0,110)` 전체 + 대각선 빗금(`(255,255,255,40)`, 4px 간격)
- 타일은 **외곽선 없음**(붙였을 때 격자 무늬가 생기지 않게).

- [ ] **Step 2: sprites_objects.py**

바닥선 규칙: 32×40은 y=39, 32×48은 y=47, 96×80은 y=79. 그림자는 바닥선 위 2px 중심 타원. 마지막에 `c.outline()`.
- `obj_busstop` 32×48: 기둥(`basalt.MD` 2px, y 20~44) + 표지판(`sky.MD` 12×10 사각, 안에 흰 버스 실루엣 6×4) + 벤치(`wood` shade_rect 20×4, y 36)
- `obj_warehouse` 96×80: 벽 `white.MD`(x 6~89, y 30~76) 아래 2px `white.DK`, 슬레이트 지붕 `basalt` 3톤(삼각 아님, 사다리꼴: y 14~30, 좌우 4px씩 넘침), 지붕 골 세로선 `basalt.DK` 8px 간격, 문 `wood.MD` 14×20 중앙, 창 2개 `sky.LT` 10×8 + 창틀 `wood.DK`, 간판 `wood.LT` 30×8 (y 34, 안에 `orange.MD` 감귤 원 2개), 굴뚝 없음
- `obj_gate_{0,1,2,3}` 32×40: 돌기둥 2개(`basalt` shade_rect 6×22, x 4/22, y 16~38), 기둥에 구멍 3개(`basalt.DK`), 가로 막대 n개(`wood.MD` 20×2, y 20/26/32에서 위부터 n개). `obj_gate`는 `obj_gate_0`의 별칭으로도 등록
- `obj_path` 32×32: 바탕 없음(투명), 자갈 8~10개(`basalt` 3톤 2×2·3×2), 가장자리 풀점 `grass.MD` 3개. 외곽선 없음
- `obj_field_empty` 32×40: 이랑 4줄(`soil.DK` 가로 2px, y 24/29/34/38 사이 `soil.LT` 1px), 테두리 `soil.DK`
- `obj_field_planted`: empty + 새싹 6개(`leaf.LT` 1×2 + 잎 `leaf.MD` 좌우 1px)
- `obj_field_ready`: empty + 당근잎 6개(`leaf.MD` 3×4 뭉치 + `leaf.LT` 하이라이트), 잎 밑에 `orange.MD` 1px(당근 머리)
- `obj_tangerine_tree_young` 32×48: 줄기 `wood` 2×8, 잎뭉치 `shade_ellipse` rx5 ry4
- `obj_tangerine_tree` 32×48: assets-sample/make_sample.py와 같은 구성(잎 타원+혹 3, 줄기 4×9), 열매 없음
- `obj_tangerine_tree_ready`: 위 + 감귤 7개(2×2 `orange.MD`, `orange.DK` 우하, `orange.LT` 좌상)
- `obj_table_out` 32×40: 파라솔(`red`/`white` 줄무늬 반타원 rx 14 ry 7, y 8~15; 살 `basalt.DK` 3개), 기둥 `basalt.MD` 2×20, 테이블 상판 `wood` shade_ellipse rx 10 ry 4 (y 28), 의자 2개 `wood.DK` 4×3 좌우
- `obj_stonewall` 32×40: 현무암 돌 7~9개 `basalt` shade_ellipse(rx 4~6, ry 3~4) 두 줄로 쌓기(y 22~38), 틈에 `basalt.DK`, 위 돌 몇 개는 `grass.MD` 이끼 1px

- [ ] **Step 3: build.py**

```python
"""모든 스프라이트를 생성해 public/assets/에 쓴다. 사용: python3 tools/assets/build.py"""
from __future__ import annotations
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'public', 'assets')
ICON_DIR = os.path.join(OUT_DIR, 'icons')
REVIEW_DIR = os.path.join(HERE, 'out')

from sheet import pack, write_spritesheet, contact_sheet
import sprites_tiles, sprites_objects

def all_sprites():
    s = {}
    for mod in (sprites_tiles, sprites_objects):
        s.update(mod.sprites())
    try:
        import sprites_chars, sprites_ui  # Task 4·5에서 추가
        s.update(sprites_chars.sprites()); s.update(sprites_ui.sprites())
    except ImportError:
        pass
    return s

def main():
    os.makedirs(OUT_DIR, exist_ok=True); os.makedirs(ICON_DIR, exist_ok=True); os.makedirs(REVIEW_DIR, exist_ok=True)
    sprites = all_sprites()
    sheet, frames = pack(sprites)
    write_spritesheet(sheet, frames, os.path.join(OUT_DIR, 'sheet.png'), os.path.join(OUT_DIR, 'sheet.json'))
    for name, c in sprites.items():
        if name.startswith('icon_') or name.startswith('portrait_'):
            c.save(os.path.join(ICON_DIR, f'{name}.png'))
    contact_sheet(sprites, cols=10, scale=3).save(os.path.join(REVIEW_DIR, 'contact.png'))
    print(f'{len(sprites)} sprites → sheet {sheet.w}x{sheet.h}')

if __name__ == '__main__':
    main()
```

`package.json` scripts에 추가: `"assets": "python3 tools/assets/build.py"`. `.gitignore`에 `tools/assets/out/` 추가.

- [ ] **Step 4: 실행·검토**

Run: `pnpm assets && ls public/assets`
Expected: `sheet.png`, `sheet.json` 생성, 콘솔에 `N sprites → sheet 1024x…`. `tools/assets/out/contact.png`를 열어 확인: 외곽선이 끊기지 않고, 바닥선이 맞고, 3톤 명암이 보이고, 감귤나무가 샘플과 같은 톤. 어색한 스프라이트는 고친다.

- [ ] **Step 5: Commit**

```bash
git add tools/assets/sprites_tiles.py tools/assets/sprites_objects.py tools/assets/build.py package.json .gitignore public/assets/sheet.png public/assets/sheet.json
git commit -m "feat(assets): 타일·오브젝트 스프라이트와 빌드 스크립트"
```

---

### Task 4: 캐릭터 스프라이트

**Files:**
- Create: `tools/assets/sprites_chars.py`

- [ ] **Step 1: 공통 캐릭터 빌더**

`make_char(palette: dict, direction: str, frame: int) -> Canvas(32,48)`:
- 비율: 머리 14×14(y 6~19, 둥근 사각: `rect` + 모서리 1px 제거), 몸 12×14(y 20~33), 다리 각 4×8(y 34~41), 신발 `basalt.DK` 1px. 바닥선 y=47이 아니라 **y=42**에 발을 두고 그 아래 그림자(캐릭터는 칸 중앙에 서므로).
- 방향: `down` 얼굴(눈 2개 `OUT` 2×2, x 11/19, y 12), `up` 뒷머리(눈 없음, 머리카락색 전체), `left` 눈 1개(x 10), 코 1px 왼쪽 돌출. `right = left.flip_x()`.
- 걷기: frame 0 왼다리 앞(왼 y 34~41, 오른 y 36~41 + 2px 위로), frame 2 반대, frame 1 둘 다 y 34~41. 팔은 몸 옆 2×8, frame 0/2에서 반대로 스윙(위·아래 1px).
- `palette`: `hair, skin, top, bottom, accent` 각 Color.

- [ ] **Step 2: 손님 2종 + 할망**

- `guest_local_*`: 밀짚모자(`yellow.MD` 챙 18×2 + 크라운 12×5, `yellow.DK` 띠), 피부 `skin.MD`, 상의 `pink.MD`(몸빼 무늬: `pink.DK` 점 4개), 바지 `basalt.MD`
- `guest_tourist_*`: 머리 `wood.DK`, 피부 `skin.LT`, 상의 `sky.MD`, 바지 `road.DK`, 카메라(`basalt.DK` 6×4 + 렌즈 `sky.LT` 2×2, 가슴 앞; up 방향에서는 배낭 `red.MD` 8×10)
- 24장: `guest_{local,tourist}_{down,up,left,right}_{0,1,2}`
- `portrait_halmang` 48×48: 흰 머리(`white.MD`) 쪽진머리, 주름 `skin.DK` 2줄, 웃는 눈(`OUT` 가로 3px), 볼 `pink.LT` 2×2, 머리에 감귤 꽃(`white.LT` 3×3 + `yellow.MD` 중심), 목 아래 `pink.MD` 저고리 깃

- [ ] **Step 3: build 후 콘택트 시트 검토**

Run: `pnpm assets` → `tools/assets/out/contact.png`에서 24장이 4방향 3프레임으로 자연스러운지(다리 교차가 보이는지, right가 left의 반전인지) 확인.

- [ ] **Step 4: Commit**

```bash
git add tools/assets/sprites_chars.py public/assets/sheet.png public/assets/sheet.json
git commit -m "feat(assets): 손님 걷기 스프라이트와 할망 초상"
```

---

### Task 5: 말풍선·이펙트·UI 아이콘

**Files:**
- Create: `tools/assets/sprites_ui.py`

- [ ] **Step 1: 말풍선 24×20**

흰 둥근 사각(`white.MD`, 모서리 1px 제거) + 왼쪽 아래 꼬리 3px + 외곽선. 안에 표정 12×10:
- `bubble_happy`: 눈 `OUT` 2×2 둘, 입 `OUT` 웃는 호(가로 6px, 양끝 1px 위), 볼 `pink.MD` 1px
- `bubble_meh`: 눈 둘, 입 가로 직선 6px
- `bubble_angry`: 눈 위 눈썹 `OUT` 대각 2px, 입 아래로 굽은 호, 볼 `red.MD`
- `bubble_question`: `?` 글리프(7×10, `sky.DK`)
- `bubble_wait`: 점 3개 `basalt.MD`

- [ ] **Step 2: 이펙트**

- `fx_coin_{0..3}` 16×16: `yellow` 3톤 원(r 6) → 옆으로 눌린 타원(rx 4) → 세로 선(rx 1) → 다시 타원(회전 느낌). 중앙에 `yellow.DK` `₩` 대신 세로 2px 막대
- `fx_sparkle_{0..3}` 16×16: 4각 별(`white.LT` 십자 + 대각 짧게), 크기 4→8→6→3
- `fx_ready_ring` 32×32: `yellow.MD` 2px 링(r 14) + 안쪽 `yellow.LT` 1px, 투명 중앙

- [ ] **Step 3: 아이콘 16×16 (18개)**

`icon_money`(주머니 `yellow` + 끈 `wood.DK`), `icon_research`(플라스크 `sky.LT` + 거품 2), `icon_local`(밀짚모자), `icon_tourist`(카메라), `icon_speed_pause`(세로 막대 2), `icon_speed_1`(▶ 1개 `white.MD`), `icon_speed_2`(▶▶), `icon_speed_3`(▶▶▶ 작게), `icon_build`(망치 `basalt`+`wood`), `icon_menu`(클립보드 `white` + 줄 3), `icon_look`(눈 모양 `white`+`sky.DK` 동공), `icon_harvest`(당근 `orange.MD` + 잎), `icon_plant`(새싹 `leaf`), `icon_remove`(휴지통 `basalt`), `icon_unlock`(열린 자물쇠 `yellow`), `icon_calendar`(달력 `white` + `red.MD` 상단), `icon_sound_on`(스피커 + 파동 2), `icon_sound_off`(스피커 + X `red.MD`). 전부 외곽선.

- [ ] **Step 4: build·검토·Commit**

Run: `pnpm assets` → `public/assets/icons/`에 18 아이콘 + 초상 PNG. 콘택트 시트에서 16px 아이콘이 3배 확대에서도 읽히는지 확인.

```bash
git add tools/assets/sprites_ui.py public/assets
git commit -m "feat(assets): 말풍선·이펙트·UI 아이콘"
```

---

### Task 6: synth.py — WAV 인코더와 8비트 신시사이저

**Files:**
- Create: `tools/assets/synth.py`
- Modify: `tools/assets/test_px.py` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트**

```python
from synth import Synth, note_hz, write_wav, SR
import wave

class TestSynth(unittest.TestCase):
    def test_note_hz(self):
        self.assertAlmostEqual(note_hz('A4'), 440.0, places=3)
        self.assertAlmostEqual(note_hz('C4'), 261.626, places=2)
        self.assertAlmostEqual(note_hz('F#5'), 739.989, places=2)

    def test_tone_length_and_range(self):
        s = Synth()
        buf = s.tone('A4', 0.25, wave='square', vol=0.5, env=(0.01, 0.05, 0.6, 0.1))
        self.assertEqual(len(buf), int(SR * 0.25))
        self.assertTrue(all(-1.0 <= v <= 1.0 for v in buf))
        self.assertTrue(max(buf) > 0.2)

    def test_mix_and_wav(self):
        s = Synth()
        a = s.tone('C4', 0.1); b = s.tone('E4', 0.1)
        m = s.mix([(a, 0.0), (b, 0.05)])
        self.assertEqual(len(m), int(SR * 0.15))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 't.wav'); write_wav(p, m)
            with wave.open(p) as w:
                self.assertEqual(w.getframerate(), SR)
                self.assertEqual(w.getnchannels(), 1)
                self.assertEqual(w.getnframes(), len(m))

    def test_noise_and_slide(self):
        s = Synth()
        n = s.noise(0.1, vol=0.3)
        self.assertEqual(len(n), int(SR * 0.1))
        sl = s.slide('C4', 'C5', 0.2, wave='triangle')
        self.assertEqual(len(sl), int(SR * 0.2))
```

- [ ] **Step 2: 실패 확인**

Run: `cd tools/assets && python3 -m unittest test_px -v`
Expected: `No module named 'synth'`

- [ ] **Step 3: synth.py 작성**

```python
"""8비트 신시사이저 + WAV 인코더 (표준 라이브러리). 샘플은 float [-1,1] 리스트."""
from __future__ import annotations
import math, random, struct, subprocess, os

SR = 22050
NOTE_INDEX = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}

def note_hz(name: str) -> float:
    """'A4' → 440. 'F#5' 등 샤프 지원."""
    if name == 'R':
        return 0.0
    n, octv = (name[:-1], int(name[-1]))
    semis = NOTE_INDEX[n] + (octv - 4) * 12 - 9  # A4 = 0
    return 440.0 * (2 ** (semis / 12))

def _env(i: int, n: int, a: float, d: float, s: float, r: float) -> float:
    """ADSR (초 단위 a,d,r; s는 레벨). 길이 n 샘플 안에 릴리스를 넣는다."""
    t = i / SR
    total = n / SR
    if t < a:
        return t / a if a > 0 else 1.0
    if t < a + d:
        return 1.0 - (1.0 - s) * ((t - a) / d if d > 0 else 1.0)
    if t > total - r:
        return s * max(0.0, (total - t) / r if r > 0 else 0.0)
    return s

class Synth:
    def __init__(self, seed: int = 1):
        self.rng = random.Random(seed)

    def _osc(self, wave: str, phase: float) -> float:
        p = phase % 1.0
        if wave == 'square':
            return 1.0 if p < 0.5 else -1.0
        if wave == 'pulse25':
            return 1.0 if p < 0.25 else -1.0
        if wave == 'triangle':
            return 4 * abs(p - 0.5) - 1
        if wave == 'saw':
            return 2 * p - 1
        return math.sin(2 * math.pi * p)

    def tone(self, note: str, dur: float, wave: str = 'square', vol: float = 0.5, env=(0.005, 0.02, 0.7, 0.05), vibrato: float = 0.0) -> list[float]:
        hz = note_hz(note)
        n = int(SR * dur)
        out, phase = [], 0.0
        for i in range(n):
            f = hz * (1 + vibrato * math.sin(2 * math.pi * 6 * i / SR)) if vibrato else hz
            phase += f / SR
            out.append(self._osc(wave, phase) * vol * _env(i, n, *env) if hz else 0.0)
        return out

    def slide(self, a: str, b: str, dur: float, wave: str = 'square', vol: float = 0.5, env=(0.005, 0.02, 0.8, 0.05)) -> list[float]:
        h0, h1 = note_hz(a), note_hz(b)
        n = int(SR * dur)
        out, phase = [], 0.0
        for i in range(n):
            f = h0 + (h1 - h0) * (i / n)
            phase += f / SR
            out.append(self._osc(wave, phase) * vol * _env(i, n, *env))
        return out

    def noise(self, dur: float, vol: float = 0.3, env=(0.001, 0.03, 0.3, 0.05), lowpass: float = 0.0) -> list[float]:
        n = int(SR * dur)
        out, last = [], 0.0
        for i in range(n):
            v = self.rng.uniform(-1, 1)
            last = last + (v - last) * (1 - lowpass) if lowpass else v
            out.append(last * vol * _env(i, n, *env))
        return out

    def mix(self, parts: list[tuple[list[float], float]]) -> list[float]:
        """[(buffer, start_sec)] → 합성. 클리핑은 tanh로 부드럽게."""
        total = max(int(SR * st) + len(b) for b, st in parts) if parts else 0
        out = [0.0] * total
        for b, st in parts:
            o = int(SR * st)
            for i, v in enumerate(b):
                out[o + i] += v
        return [math.tanh(v) for v in out]

    def sequence(self, notes: list[tuple[str, float]], bpm: float, wave: str = 'square', vol: float = 0.4, env=(0.005, 0.03, 0.6, 0.04)) -> list[float]:
        """[(note, beats)] 를 순서대로. 'R'은 쉼."""
        beat = 60.0 / bpm
        parts, t = [], 0.0
        for note, beats in notes:
            parts.append((self.tone(note, beats * beat, wave, vol, env), t))
            t += beats * beat
        return self.mix(parts)

def write_wav(path: str, samples: list[float]) -> None:
    with open(path, 'wb') as f:
        data = b''.join(struct.pack('<h', int(max(-1.0, min(1.0, s)) * 32767)) for s in samples)
        f.write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVE')
        f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, SR, SR * 2, 2, 16))
        f.write(b'data' + struct.pack('<I', len(data)) + data)

def to_m4a(wav_path: str, m4a_path: str, bitrate: str = '64k') -> None:
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', bitrate, m4a_path], check=True)
    os.remove(wav_path)
```

- [ ] **Step 4: 통과 확인**

Run: `cd tools/assets && python3 -m unittest test_px -v`
Expected: 12 tests OK

- [ ] **Step 5: Commit**

```bash
git add tools/assets/synth.py tools/assets/test_px.py
git commit -m "feat(assets): 8비트 신시사이저와 WAV 인코더"
```

---

### Task 7: SFX 13개와 BGM 5곡

**Files:**
- Create: `tools/assets/sfx.py`, `tools/assets/bgm.py`
- Modify: `package.json` (`"assets:audio": "python3 tools/assets/sfx.py && python3 tools/assets/bgm.py"`), `.gitignore` (`*.wav`)

- [ ] **Step 1: sfx.py**

출력 `public/assets/sfx/{name}.m4a`. 각 효과음의 레시피(구현자는 이 골격을 지키되 귀로 듣고 미세 조정):
| 이름 | 레시피 |
|---|---|
| tap | square C6 0.04s vol .3 |
| place | triangle C4→C5 slide 0.12s + noise 0.05s lowpass .8 |
| remove | square C5→C4 slide 0.15s |
| plant | triangle E5 0.06 + G5 0.06 (순차) |
| harvest | pulse25 C5 .05, E5 .05, G5 .05, C6 .12 (아르페지오) |
| coin | square B5 .05 → E6 .18 (env s .5) |
| happy | triangle E5 .08, G5 .08, C6 .16 vibrato .01 |
| meh | square G4 .12, F4 .18 |
| unlock | pulse25 C5 .06, E5 .06, G5 .06, C6 .06, E6 .25 |
| month | triangle C5 .15, G4 .15, C5 .3 |
| fanfare | square 시퀀스 (C5 .5)(E5 .5)(G5 .5)(C6 1.5) bpm 240 + 같은 것 triangle 옥타브 아래 |
| error | square A#3 .08, A3 .16 |
| bus | noise 0.5 lowpass .9 vol .25 + triangle C3 .5 vol .2 |

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import Synth, write_wav, to_m4a
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'sfx')

def build():
    os.makedirs(OUT, exist_ok=True)
    s = Synth()
    recipes = {
        'tap': s.tone('C6', 0.04, 'square', 0.3),
        'place': s.mix([(s.slide('C4', 'C5', 0.12, 'triangle', 0.5), 0), (s.noise(0.05, 0.2, lowpass=0.8), 0.02)]),
        # ... 표의 나머지 11개
    }
    for name, buf in recipes.items():
        wav = os.path.join(OUT, f'{name}.wav'); write_wav(wav, buf); to_m4a(wav, os.path.join(OUT, f'{name}.m4a'))
    print(f'{len(recipes)} sfx')

if __name__ == '__main__':
    build()
```

- [ ] **Step 2: bgm.py**

출력 `public/assets/bgm/{spring,summer,autumn,winter,title}.m4a`, 각 24초 루프(끝이 시작으로 이어지도록 마지막 마디는 으뜸화음으로). 구성: 멜로디(pulse25) + 베이스(triangle, 옥타브 아래, 4분음) + 화음 아르페지오(square vol .15) + 드럼(킥=triangle C2 .05, 스네어=noise .06, 하이햇=noise .02 lowpass .3). 계절 성격:
| 곡 | bpm | 조성 | 성격 |
|---|---|---|---|
| spring | 112 | C장조 | 밝고 통통, 멜로디 8분음 위주 |
| summer | 124 | G장조 | 경쾌, 셔플 느낌(짝수 8분음을 .35/.65 길이) |
| autumn | 96 | A단조 | 차분, 4분음 멜로디, 6도 화음 |
| winter | 84 | D단조 | 느리고 넓게, 아르페지오만 + 멜로디 드문드문 |
| title | 100 | F장조 | 4마디 후렴이 반복, 팡파르 느낌 |
멜로디는 `[(note, beats)]` 리스트로 코드에 직접 적는다(8마디 × 4박 = 32박). 각 성부는 `Synth.sequence`로 렌더 후 `mix`. 렌더 시간이 길면(순수 파이썬) 샘플레이트 유지하고 성부를 줄이지 말 것 — 5곡 합쳐 1~2분 걸려도 된다.

- [ ] **Step 3: 실행·확인**

Run: `pnpm assets:audio && ls -la public/assets/sfx public/assets/bgm`
Expected: m4a 13 + 5, WAV 없음. `ffprobe public/assets/bgm/spring.m4a 2>&1 | grep Duration` → 약 24초. 파일 크기: sfx 각 <10KB, bgm 각 ~200KB.

- [ ] **Step 4: Commit**

```bash
git add tools/assets/sfx.py tools/assets/bgm.py package.json .gitignore public/assets/sfx public/assets/bgm
git commit -m "feat(assets): 8비트 효과음 13개와 계절 BGM 초안 5곡"
```

---

### Task 8: Galmuri 폰트

**Files:**
- Create: `tools/assets/fetch_font.sh`, `public/fonts/Galmuri11.woff2`, `public/fonts/Galmuri11-Bold.woff2`, `public/fonts/LICENSE-Galmuri.txt`
- Modify: `index.html`, `package.json` (`"assets:font": "bash tools/assets/fetch_font.sh"`)

- [ ] **Step 1: fetch_font.sh**

```bash
#!/usr/bin/env bash
# Galmuri (OFL-1.1) https://github.com/quiple/galmuri — v2.40.4 릴리스에서 Galmuri11 woff2와 라이선스만 추출
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
curl -sL -o "$TMP/galmuri.zip" https://github.com/quiple/galmuri/releases/download/v2.40.4/Galmuri-v2.40.4.zip
mkdir -p "$ROOT/public/fonts"
unzip -q -o "$TMP/galmuri.zip" -d "$TMP/g"
find "$TMP/g" -iname 'Galmuri11.woff2' -exec cp {} "$ROOT/public/fonts/Galmuri11.woff2" \;
find "$TMP/g" -iname 'Galmuri11-Bold.woff2' -exec cp {} "$ROOT/public/fonts/Galmuri11-Bold.woff2" \;
find "$TMP/g" \( -iname 'LICENSE*' -o -iname 'OFL*' \) -print -quit | xargs -I{} cp {} "$ROOT/public/fonts/LICENSE-Galmuri.txt"
ls -la "$ROOT/public/fonts"
rm -rf "$TMP"
```
zip 안 경로가 다르면 `unzip -l`로 확인해 `find` 패턴을 맞춘다. Bold가 없으면 Regular만.

- [ ] **Step 2: index.html**

`<style>`에 추가:
```css
@font-face { font-family: 'Galmuri11'; src: url('/fonts/Galmuri11.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Galmuri11'; src: url('/fonts/Galmuri11-Bold.woff2') format('woff2'); font-weight: 700; font-display: swap; }
html, body, #root { font-family: 'Galmuri11', system-ui, sans-serif; }
canvas, img.px { image-rendering: pixelated; image-rendering: crisp-edges; }
```

- [ ] **Step 3: 실행·Commit**

Run: `pnpm assets:font` → 파일 3개. `pnpm dev`로 열어 HUD 글자가 픽셀 폰트인지 확인.

```bash
git add tools/assets/fetch_font.sh public/fonts index.html package.json
git commit -m "feat(assets): Galmuri11 픽셀 폰트"
```

---

### Task 9: assets.ts 로더와 GameView 스프라이트 적용

**Files:**
- Create: `src/render/assets.ts`
- Modify: `src/render/GameView.ts`, `src/ui/App.tsx`

- [ ] **Step 1: assets.ts**

```ts
import { Assets, Texture, TextureStyle, type Spritesheet } from 'pixi.js';

let sheet: Spritesheet | null = null;
const missing = new Set<string>();

/** 시트를 로드한다. 실패해도 게임은 플레이스홀더로 계속 돈다. */
export async function loadAssets(): Promise<boolean> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  try {
    sheet = await Assets.load<Spritesheet>('/assets/sheet.json');
    return true;
  } catch (e) {
    console.warn('assets: sheet 로드 실패, 플레이스홀더 사용', e);
    return false;
  }
}

/** 이름으로 텍스처. 없으면 null (호출자가 플레이스홀더 결정). 개발 중 누락 이름을 한 번만 경고. */
export function tex(name: string): Texture | null {
  const t = sheet?.textures[name] ?? null;
  if (!t && import.meta.env.DEV && !missing.has(name)) { missing.add(name); console.warn('assets: 없는 스프라이트', name); }
  return t;
}

export function hasAssets(): boolean { return sheet !== null; }

/** 계절·상태별 이름 규칙을 한곳에 */
export const spriteName = {
  tile: (terrain: string, season: string) => `tile_${terrain}_${season}`,
  object: (type: string, variant?: string) => (variant ? `obj_${type}_${variant}` : `obj_${type}`),
  guest: (type: string, dir: 'down' | 'up' | 'left' | 'right', frame: 0 | 1 | 2) => `guest_${type}_${dir}_${frame}`,
  bubble: (mood: string) => `bubble_${mood}`,
};
```

- [ ] **Step 2: GameView 변경 (핵심만 — 나머지 구조 유지)**

- `init`에서 `await loadAssets()` (App이 아니라 GameView 안에서).
- `buildTiles(state)`: `tex(spriteName.tile(terrain, seasonOf(month)))` 있으면 그것, 없으면 `terrainTexture`. 계절이 바뀌면(`lastSeason !== season`) 타일 텍스처만 교체.
- 오브젝트 노드: `variant` 결정 — field: `crop ? (ready ? 'ready' : 'planted') : 'empty'`; tangerine_tree: `crop.daysGrown < growDays/3 ? 'young' : ready ? 'ready' : undefined`; gate: `'0'`(2B에서 영업 토글 연동). 스프라이트는 **바닥 정렬**: `sprite.anchor.set(0, 1)`, `position.set(o.x*TILE, (o.y+def.h)*TILE)`. 없으면 플레이스홀더(`objectTexture`+라벨). 변형이 바뀌면 텍스처만 교체.
- **y-정렬**: `objects` 컨테이너와 `guests` 컨테이너를 하나의 `actors` 컨테이너로 합치고 `sortableChildren = true`, 각 노드 `zIndex = 바닥 y(픽셀)`. 손님은 `g.y*TILE + TILE`.
- 손님: 방향은 `path[0]`과 현재 위치 delta(dx>0 right, dx<0 left, dy>0 down, dy<0 up; 정지·seated는 down). 프레임은 걷는 동안 `Math.floor(performance.now()/125) % 3`, 정지 시 1. `tex(spriteName.guest(...))` 없으면 기존 Graphics. 앵커 (0.5, 1), 위치 `((g.x+0.5)*TILE + jitter, (g.y+1)*TILE)`.
- 말풍선: `tex(spriteName.bubble(mood ?? 'wait'))` → Sprite, 없으면 기존 `bubble()`. 새로 뜰 때 0.2초 스케일 0.6→1 팝(rAF 기준 `performance.now()` 보간, 렌더 전용).
- `fx_ready_ring`: ready 밭/나무 위에 링 스프라이트, alpha를 `0.5+0.5*sin(now/200)`.
- 코인 팝: 상태에 "판매 이벤트"가 없으므로 렌더에서 감지 — 손님 노드가 `menuId`를 처음 갖는 프레임에 `fx_coin_0..3`을 4프레임 애니(각 80ms)로 손님 머리 위에서 12px 떠오르며 재생 후 제거. 렌더 전용 큐 `fxQueue`.
- 플레이스홀더 색 사각형 위 라벨은 `hasAssets()`가 false일 때만.

- [ ] **Step 3: 타입·실행 확인**

Run: `pnpm exec tsc --noEmit && pnpm dev` → 폰 뷰에서 타일·창고·정낭·테이블·손님 걷기·말풍선·코인 팝·수확 링이 보이는지. 콘솔에 `없는 스프라이트` 경고가 있으면 이름 규칙을 맞춘다(사라질 때까지).

- [ ] **Step 4: Commit**

```bash
git add src/render/assets.ts src/render/GameView.ts src/ui/App.tsx
git commit -m "feat(render): 스프라이트 시트 로더, 걷기 애니, y-정렬, 이펙트"
```

---

### Task 10: audio.ts와 사운드 훅

**Files:**
- Create: `src/ui/audio.ts`
- Modify: `src/ui/store.ts`, `src/ui/HUD.tsx`, `src/ui/App.tsx`

- [ ] **Step 1: audio.ts**

```ts
type SfxName = 'tap' | 'place' | 'remove' | 'plant' | 'harvest' | 'coin' | 'happy' | 'meh' | 'unlock' | 'month' | 'fanfare' | 'error' | 'bus';
type BgmName = 'spring' | 'summer' | 'autumn' | 'winter' | 'title';

const MUTE_KEY = 'jeju-cafe:muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let current: { name: BgmName; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* noop */ }

async function load(url: string): Promise<AudioBuffer | null> {
  if (!ctx) return null;
  if (buffers.has(url)) return buffers.get(url)!;
  try {
    const res = await fetch(url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    buffers.set(url, buf);
    return buf;
  } catch { return null; }
}

/** 첫 사용자 제스처에서 호출. iOS는 이 안에서 resume해야 소리가 난다. */
export function unlockAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  bgmGain = ctx.createGain(); bgmGain.gain.value = 0.5; bgmGain.connect(master);
  void ctx.resume();
  for (const n of ['tap', 'place', 'remove', 'plant', 'harvest', 'coin', 'happy', 'meh', 'unlock', 'month', 'fanfare', 'error', 'bus']) void load(`/assets/sfx/${n}.m4a`);
}

export function sfx(name: SfxName): void {
  if (!ctx || !master) return;
  const buf = buffers.get(`/assets/sfx/${name}.m4a`);
  if (!buf) return;
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(master); src.start();
}

export async function bgm(name: BgmName): Promise<void> {
  if (!ctx || !bgmGain || current?.name === name) return;
  const buf = await load(`/assets/bgm/${name}.m4a`);
  if (!buf || !ctx) return;
  const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(bgmGain);
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start();
  const t = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(1, t + 1);
  if (current) { current.gain.gain.linearRampToValueAtTime(0, t + 1); const old = current.src; setTimeout(() => old.stop(), 1100); }
  current = { name, src, gain };
}

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* noop */ }
  if (master) master.gain.value = m ? 0 : 1;
}
export function isMuted(): boolean { return muted; }

export function suspendAudio(): void { void ctx?.suspend(); }
export function resumeAudio(): void { void ctx?.resume(); }
```

- [ ] **Step 2: 훅**

- `App.tsx`: 최상위 div에 `onPointerDownCapture={unlockAudio}` (한 번 호출되면 이후는 no-op).
- `store.ts` `dispatch`: 성공 시 액션 타입별 `sfx` — place→'place', remove→'remove', plant→'plant', harvest→'harvest', setSlot→'tap', unlock→'unlock', setSpeed→'tap'; 실패 시 'error'.
- `store.ts` `startLoop`: 매 스텝 변화를 감지해 — 손님 mood가 새로 'happy'가 되면 'coin' + 'happy'(둘 다 짧으니 겹쳐도 됨), 'meh'면 'meh'; `lastMonthCard`가 null→값이 되면 'month'; 계절이 바뀌면 `bgm(season)`; 처음 로드 시 `bgm(seasonOf(month))`. 감지는 이전 프레임 스냅샷(guest id→mood 맵, 이전 계절)과 비교. `visibilitychange`에서 `suspendAudio/resumeAudio`.
- `HUD.tsx`: 오른쪽 위에 음소거 토글 버튼(`icon_sound_on/off`).

- [ ] **Step 3: 확인·Commit**

폰 뷰에서 첫 탭 후 배경음이 나오고, 배치·수확·판매에 효과음, 음소거 토글이 새로고침 후에도 유지되는지.

```bash
git add src/ui/audio.ts src/ui/store.ts src/ui/HUD.tsx src/ui/App.tsx
git commit -m "feat(ui): Web Audio SFX·계절 BGM·음소거"
```

---

### Task 11: UI에 아이콘·폰트 적용

**Files:**
- Modify: `src/ui/HUD.tsx`, `src/ui/BottomSheet.tsx`, `src/ui/MonthCard.tsx`, `src/ui/Guide.tsx`
- Create: `src/ui/Icon.tsx`

- [ ] **Step 1: Icon 컴포넌트**

```tsx
export function Icon({ name, size = 16, alt = '' }: { name: string; size?: number; alt?: string }) {
  return <img className="px" src={`/assets/icons/icon_${name}.png`} width={size} height={size} alt={alt} style={{ verticalAlign: 'middle', imageRendering: 'pixelated' }} />;
}
```

- [ ] **Step 2: 이모지 전부 교체**

HUD: 💰→`<Icon name="money" size={24}/>`, 🔬→research, 🧢/📷→local/tourist, ⏸/×1/×2/×3→speed_pause/speed_1/2/3(버튼 안 아이콘 + 텍스트 없음, 활성은 노란 배경). BottomSheet: 👆/🔨/📋→look/build/menu, 🌱→plant, ✨→harvest, 🗑→remove, ✅/❌→텍스트 "재료 있음/없음"에 `leaf`/`red` 색점. Guide: 할망 초상 `portrait_halmang` 48px을 말풍선 왼쪽에. MonthCard: `icon_calendar` 제목 옆. 아이콘은 HUD에서 24px(2배)로 표시(픽셀 배수만 사용: 16/32/48).

- [ ] **Step 3: 확인**

`grep -rn "[😀-🙏🌀-🗿🚀-🛿🇦-🇿]" src/ui src/render` → 없음. 폰 뷰 스크린샷에서 폰트가 Galmuri, 아이콘이 선명한지.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat(ui): 픽셀 아이콘과 Galmuri 적용, 이모지 제거"
```

---

### Task 12: 최종 확인과 README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README에 에셋 파이프라인 절 추가**

```markdown
## 에셋 파이프라인
- `pnpm assets` — 스프라이트 시트·아이콘 생성 (`tools/assets/build.py`). 검토용 `tools/assets/out/contact.png`
- `pnpm assets:audio` — 효과음·BGM 생성 (ffmpeg 필요)
- `pnpm assets:font` — Galmuri11 다운로드 (OFL)
- 직접 그린 PNG나 곡으로 바꾸려면: 같은 이름으로 `public/assets/`에 두고 `tools/assets/`에서 그 이름의 생성 코드를 지운다.
- 폰트: Galmuri (OFL-1.1, https://github.com/quiple/galmuri). 라이선스 `public/fonts/LICENSE-Galmuri.txt`
```

- [ ] **Step 2: 전체 검증**

`pnpm test`(74), `cd tools/assets && python3 -m unittest`(12), `pnpm exec tsc --noEmit`, `pnpm build`(assets 포함 dist 크기 확인: bgm 5개 ≈1MB), 폰 뷰 5분 플레이 스크린샷.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: 에셋 파이프라인"
```

---

## 완료 기준
- 색 사각형이 화면에 하나도 없다(플레이스홀더는 시트 누락 시 폴백으로만 존재).
- 이모지가 UI에 없다. 폰트는 Galmuri11.
- 첫 탭 후 BGM이 계절에 맞게 나오고, 배치·수확·판매·해금에 효과음이 난다.
- 손님이 방향에 맞게 걷고, 앉으면 말풍선이 팝되고, 판매 시 코인이 튄다.
- 모든 에셋은 `tools/assets/`에서 재생성 가능하다.
