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
