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
    for name in ('sprites_chars', 'sprites_portraits', 'sprites_ui', 'sprites_bg', 'sprites_iso_tiles', 'sprites_iso_objects', 'sprites_iso_env',
                 'sprites_iso_rooms', 'sprites_iso_facilities', 'sprites_iso_facilities_x', 'sprites_iso_decor'):
        try:
            s.update(__import__(name).sprites())
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
    iso = {n: c for n, c in sprites.items() if n.startswith('iso_')}
    if iso:
        contact_sheet(iso, cols=8, scale=2).save(os.path.join(REVIEW_DIR, 'contact_iso.png'))
    print(f'{len(sprites)} sprites ({len(iso)} iso) → sheet {sheet.w}x{sheet.h}')

if __name__ == '__main__':
    main()
