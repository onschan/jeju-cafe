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
