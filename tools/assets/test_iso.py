import unittest
from px import Canvas, hexc, CLEAR, SHADOW
from iso import (ISO_W, ISO_H, iso_tile, iso_box, iso_shadow, paste_face, tile_mask, diamond_mask, cell_xy)

PAL = (hexc('202020'), hexc('808080'), hexc('e0e0e0'))


class TestTile(unittest.TestCase):
    def test_size_and_partition(self):
        t = iso_tile(hexc('ff0000'), None)
        self.assertEqual((t.w, t.h), (ISO_W, ISO_H))
        m = tile_mask()
        self.assertEqual(sum(hi - lo + 1 for lo, hi in m.values()), ISO_W * ISO_H // 2)
        self.assertEqual(m[31], (0, 31)); self.assertEqual(m[32], (0, 31))   # 위·아래 꼭짓점 2px
        self.assertEqual(m[1], (15, 16)); self.assertEqual(m[62], (15, 16))  # 좌·우 꼭짓점
        self.assertEqual(t.get(0, 0), CLEAR)
        self.assertEqual(t.get(31, 15), hexc('ff0000'))

    def test_seamless_2x2(self):
        t = iso_tile(hexc('ff0000'), hexc('800000'))
        big = Canvas(128, 64)
        for x, y in ((0, 0), (1, 0), (0, 1), (1, 1)):
            big.blit(t, 32 + (x - y) * 32, (x + y) * 16)
        # 합집합 다이아몬드(2×2) 안쪽에 빈 픽셀이 없다
        for py in range(64):
            for px in range(128):
                cx, cy = cell_xy(px, py, 64, 0)
                if 0 <= cx < 2 and 0 <= cy < 2:
                    self.assertEqual(big.get(px, py)[3], 255, (px, py))

    def test_edge_only_bottom(self):
        t = iso_tile(hexc('ff0000'), hexc('800000'))
        self.assertEqual(t.get(31, 0), hexc('ff0000'))
        self.assertEqual(t.get(31, 31), hexc('800000'))
        self.assertEqual(t.get(1, 16), hexc('800000'))
        self.assertEqual(t.get(1, 15), hexc('ff0000'))


class TestBox(unittest.TestCase):
    def test_size(self):
        b = iso_box(1, 1, 20, PAL, outline=False)
        self.assertEqual((b.w, b.h), (64, 32 + 20))
        b = iso_box(3, 2, 30, PAL, outline=False)
        self.assertEqual((b.w, b.h), (192, (3 + 2) * 16 + 30))
        b = iso_box(2, 2, 10, PAL, outline=False, pad_top=6)
        self.assertEqual((b.w, b.h), (128, 64 + 10 + 6))

    def test_bottom_vertex_at_bottom_center(self):
        for cw, ch in ((1, 1), (2, 1), (3, 2), (1, 2)):
            b = iso_box(cw, ch, 12, PAL, outline=False)
            y = b.h - 1
            self.assertEqual(b.get(b.w // 2 - 1, y)[3], 255, (cw, ch))
            self.assertEqual(b.get(b.w // 2, y)[3], 255, (cw, ch))
            self.assertEqual(b.get(b.w // 2 - 2, y)[3], 0, (cw, ch))
            self.assertEqual(b.get(b.w // 2 + 1, y)[3], 0, (cw, ch))

    def test_face_colours(self):
        b = iso_box(1, 1, 20, PAL, outline=False)
        self.assertEqual(b.get(32, 8), PAL[2])          # 윗면 LT
        self.assertEqual(b.get(20, 40), PAL[1])         # 왼쪽 면 MD
        self.assertEqual(b.get(44, 40), PAL[0])         # 오른쪽 면 DK
        self.assertEqual(b.get(31, b.h - 1), PAL[1]); self.assertEqual(b.get(32, b.h - 1), PAL[0])

    def test_outline(self):
        b = iso_box(1, 1, 20, PAL)
        from px import OUT
        self.assertEqual(b.get(32, 0), OUT)
        self.assertEqual(b.get(31, b.h - 1), OUT)
        self.assertEqual(b.get(32, 8), PAL[2])

    def test_paste_face_skew(self):
        b = iso_box(2, 1, 24, PAL, outline=False)
        s = Canvas(4, 2); s.rect(0, 0, 4, 2, hexc('ff0000'))
        paste_face(b, 'left', s, 4, 2)
        g = b.last_box
        x0 = g['x0'] + 4
        tops = [g['ymax'][x0 + i] - 24 + 1 + 2 for i in range(4)]
        for i in range(4):
            self.assertEqual(b.get(x0 + i, tops[i]), hexc('ff0000'))
            self.assertEqual(b.get(x0 + i, tops[i] - 1), PAL[1])
        self.assertEqual(tops[2] - tops[0], 1)          # 2px마다 1px 내려감
        paste_face(b, 'right', s, 2, 2)
        x1 = g['split'] + 2
        tr = [g['ymax'][x1 + i] - 24 + 1 + 2 for i in range(4)]
        self.assertEqual(tr[2] - tr[0], -1)             # 오른쪽 면은 올라감
        self.assertEqual(b.get(x1, tr[0]), hexc('ff0000'))


class TestShadow(unittest.TestCase):
    def test_shadow_alpha(self):
        s = iso_shadow(1, 1, rx=0.45, height=20)
        self.assertEqual((s.w, s.h), (64, 52))
        centre = s.get(32, 20 + 16)
        self.assertEqual(centre[3], SHADOW[3])
        self.assertEqual(s.get(0, 0), CLEAR)
        self.assertEqual(s.get(32, 0), CLEAR)


if __name__ == '__main__':
    unittest.main()
