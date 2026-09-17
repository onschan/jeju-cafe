"""감귤나무 32x32 샘플 타일 생성 (순수 파이썬 PNG 인코더). 카이로소프트풍: 어두운 외곽선 + 2~3톤 명암."""
import zlib, struct, math

W = H = 32
def hexc(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)

OUT   = hexc('2b2118')   # 외곽선
L_DK  = hexc('2f7a2a')   # 잎 어두움
L_MD  = hexc('4fae3a')   # 잎 중간
L_LT  = hexc('8be25a')   # 잎 밝음
O_DK  = hexc('d9741a')   # 감귤 어두움
O_MD  = hexc('f7981f')   # 감귤
O_LT  = hexc('ffd27a')   # 감귤 하이라이트
T_DK  = hexc('5e3a1c')   # 줄기 어두움
T_MD  = hexc('96602c')   # 줄기
SHADE = (0, 0, 0, 70)    # 바닥 그림자
CLEAR = (0, 0, 0, 0)

px = [[CLEAR]*W for _ in range(H)]
def put(x, y, c):
    if 0 <= x < W and 0 <= y < H: px[y][x] = c
def get(x, y):
    return px[y][x] if 0 <= x < W and 0 <= y < H else CLEAR

# 1) 바닥 그림자 (타원)
for y in range(H):
    for x in range(W):
        if ((x-16)/9.0)**2 + ((y-28)/2.2)**2 <= 1: put(x, y, SHADE)

# 2) 줄기
for y in range(19, 28):
    for x in range(14, 18):
        put(x, y, T_MD if x < 16 else T_DK)

# 3) 잎 덩어리: 큰 타원 + 작은 혹 3개로 울퉁불퉁하게
def in_canopy(x, y):
    if ((x-16)/11.5)**2 + ((y-12)/8.5)**2 <= 1: return True
    for cx, cy, r in [(9, 8, 4.5), (23, 9, 4.2), (16, 4, 4.0)]:
        if (x-cx)**2 + (y-cy)**2 <= r*r: return True
    return False
for y in range(H):
    for x in range(W):
        if in_canopy(x, y):
            # 광원 좌상단: 거리로 3톤
            d = ((x-11)/10.0)**2 + ((y-7)/7.0)**2
            put(x, y, L_LT if d < 0.45 else L_MD if d < 1.15 else L_DK)

# 4) 감귤 (2x2 + 하이라이트 1px), 잎 위에만
for cx, cy in [(9,11),(14,7),(20,6),(24,12),(17,14),(11,16),(22,17)]:
    for dx in range(2):
        for dy in range(2):
            put(cx+dx, cy+dy, O_MD)
    put(cx+1, cy+1, O_DK); put(cx, cy, O_LT)

# 5) 외곽선: 불투명 픽셀 중 투명 이웃이 있으면 어둡게 (그림자 제외)
solid = {(x,y) for y in range(H) for x in range(W) if get(x,y)[3]==255}
for (x,y) in list(solid):
    for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
        if get(x+dx,y+dy)[3] < 255:
            put(x,y,OUT); break

# 6) PNG 쓰기
def png(path, pixels, scale=1):
    w, h = len(pixels[0])*scale, len(pixels)*scale
    raw = b''.join(b'\x00' + b''.join(bytes(pixels[y//scale][x//scale]) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

png('tangerine_tree.png', px)          # 실제 규격: 32x32, 투명 배경
# 미리보기: 흙 타일 위에 합성해서 8배 확대
SOIL = [hexc('a5763f'), hexc('9a6d38')]
comp = [[SOIL[(x//4 + y//4) % 2] for x in range(W)] for y in range(H)]
for y in range(H):
    for x in range(W):
        r,g,b,a = px[y][x]
        if a == 0: continue
        br,bg,bb,_ = comp[y][x]; t = a/255
        comp[y][x] = (int(r*t+br*(1-t)), int(g*t+bg*(1-t)), int(b*t+bb*(1-t)), 255)
png('tangerine_tree_preview_x8.png', comp, scale=8)
print('ok')
