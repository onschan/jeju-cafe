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
