"""계절 BGM 4곡 + 타이틀 → public/assets/bgm/{name}.m4a (약 24초 루프).

구성: 멜로디(pulse25) + 베이스(triangle, 4분음 근음) + 아르페지오(square, 8분음)
      + 드럼(킥=triangle C2, 스네어=노이즈, 하이햇=로우패스 노이즈).
멜로디는 [(note, beats)] 로 직접 적는다. 각 곡의 마지막 마디는 으뜸화음으로 끝나 루프가 이어진다.
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import Synth, write_wav, to_m4a, SR

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'bgm')
PEAK = 0.6  # AAC 링잉 여유 (인코딩 후 피크 약 -2dB)

# 아르페지오 8분음 패턴 (화음 음 인덱스). 화음은 낮은 음부터 3~4개.
ARP_UP = [0, 1, 2, 1, 0, 1, 2, 1]
ARP_WIDE = [0, 1, 2, 3, 2, 1, 0, 1]

# ---------------------------------------------------------------- 곡 데이터
# chords: 마디별 (베이스 근음, 아르페지오 음 목록)
# melody: [(note, beats)] — 합계 = 마디 수 × 4
# drums: (kick_beats, snare_beats, hat_every_eighth)
# swing: 8분음 쌍 길이 (아르페지오·하이햇에 적용)

SPRING = dict(
    bpm=112, bars=12, arp=ARP_UP, swing=(0.5, 0.5),
    drums=([0, 2], [1, 3], True),
    chords=[
        ('C3', ['C4', 'E4', 'G4']), ('G2', ['G3', 'B3', 'D4']), ('A2', ['A3', 'C4', 'E4']), ('F2', ['F3', 'A3', 'C4']),
        ('C3', ['C4', 'E4', 'G4']), ('G2', ['G3', 'B3', 'D4']), ('F2', ['F3', 'A3', 'C4']), ('C3', ['C4', 'E4', 'G4']),
        ('A2', ['A3', 'C4', 'E4']), ('F2', ['F3', 'A3', 'C4']), ('G2', ['G3', 'B3', 'D4']), ('C3', ['C4', 'E4', 'G4']),
    ],
    melody=[
        # A (1-4): 통통 튀는 8분음 후렴
        ('E5', .5), ('G5', .5), ('E5', .5), ('C5', .5), ('D5', .5), ('E5', .5), ('G5', 1),
        ('D5', .5), ('G5', .5), ('B5', .5), ('G5', .5), ('A5', .5), ('G5', .5), ('D5', 1),
        ('C5', .5), ('E5', .5), ('A5', .5), ('E5', .5), ('C6', .5), ('B5', .5), ('A5', 1),
        ('A5', .5), ('G5', .5), ('F5', .5), ('E5', .5), ('F5', .5), ('G5', .5), ('A5', .5), ('B5', .5),
        # A' (5-8): 한 옥타브 위로 열리며 C5로 착지
        ('C6', .5), ('G5', .5), ('E5', .5), ('G5', .5), ('C6', 1), ('R', .5), ('G5', .5),
        ('B5', .5), ('A5', .5), ('G5', .5), ('A5', .5), ('B5', 1), ('D6', 1),
        ('C6', .5), ('A5', .5), ('F5', .5), ('A5', .5), ('C6', .5), ('D6', .5), ('E6', 1),
        ('D6', .5), ('C6', .5), ('G5', .5), ('E5', .5), ('C5', 2),
        # B (9-12): 단조 살짝 → 밝게 마무리
        ('A5', .5), ('C6', .5), ('E6', .5), ('C6', .5), ('A5', .5), ('B5', .5), ('C6', 1),
        ('F5', .5), ('A5', .5), ('C6', .5), ('A5', .5), ('F5', .5), ('G5', .5), ('A5', 1),
        ('G5', .5), ('B5', .5), ('D6', .5), ('B5', .5), ('G5', .5), ('A5', .5), ('B5', .5), ('D6', .5),
        ('C6', 1), ('G5', .5), ('E5', .5), ('C5', 1.5), ('R', .5),
    ],
)

SUMMER = dict(
    bpm=124, bars=12, arp=ARP_UP, swing=(0.65, 0.35),
    drums=([0, 2], [1, 3], True),
    chords=[
        ('G2', ['G3', 'B3', 'D4']), ('C3', ['C4', 'E4', 'G4']), ('D3', ['D4', 'F#4', 'A4']), ('G2', ['G3', 'B3', 'D4']),
        ('E2', ['E3', 'G3', 'B3']), ('C3', ['C4', 'E4', 'G4']), ('D3', ['D4', 'F#4', 'A4']), ('G2', ['G3', 'B3', 'D4']),
        ('C3', ['C4', 'E4', 'G4']), ('D3', ['D4', 'F#4', 'A4']), ('G2', ['G3', 'B3', 'D4']), ('G2', ['G3', 'B3', 'D4']),
    ],
    melody=[
        # 셔플: 8분음 쌍은 .65/.35
        ('D5', .65), ('G5', .35), ('B5', .65), ('G5', .35), ('A5', .65), ('B5', .35), ('D6', 1),
        ('E6', .65), ('D6', .35), ('C6', .65), ('E6', .35), ('G5', 1), ('A5', 1),
        ('F#5', .65), ('A5', .35), ('D6', .65), ('A5', .35), ('F#5', .65), ('A5', .35), ('C6', 1),
        ('B5', .65), ('A5', .35), ('G5', .65), ('A5', .35), ('B5', 1), ('D5', 1),
        ('E5', .65), ('G5', .35), ('B5', .65), ('G5', .35), ('E6', .65), ('D6', .35), ('B5', 1),
        ('C6', .65), ('E6', .35), ('G5', .65), ('E6', .35), ('C6', .65), ('D6', .35), ('E6', 1),
        ('D6', .65), ('C6', .35), ('A5', .65), ('F#5', .35), ('A5', .65), ('C6', .35), ('D6', 1),
        ('B5', .65), ('D6', .35), ('G5', .65), ('B5', .35), ('G5', 2),
        ('E5', .65), ('G5', .35), ('C6', .65), ('G5', .35), ('E6', 1), ('C6', 1),
        ('D6', .65), ('A5', .35), ('F#5', .65), ('A5', .35), ('D6', .65), ('E6', .35), ('F#6', 1),
        ('G6', .65), ('D6', .35), ('B5', .65), ('D6', .35), ('G5', .65), ('A5', .35), ('B5', 1),
        ('D6', .65), ('B5', .35), ('A5', .65), ('B5', .35), ('G5', 2),
    ],
)

AUTUMN = dict(
    bpm=96, bars=10, arp=ARP_UP, swing=(0.5, 0.5),
    drums=([0], [2], True),
    chords=[
        ('A2', ['A3', 'C4', 'E4']), ('F2', ['F3', 'A3', 'C4']), ('C3', ['C4', 'E4', 'G4']), ('G2', ['G3', 'B3', 'D4']),
        ('A2', ['A3', 'C4', 'E4']), ('F2', ['F3', 'A3', 'C4']), ('D3', ['D4', 'F4', 'A4']), ('E3', ['E4', 'G#4', 'B4']),
        ('A2', ['A3', 'C4', 'E4']), ('A2', ['A3', 'C4', 'E4']),
    ],
    melody=[
        ('A4', 1), ('C5', 1), ('E5', 1), ('D5', 1),
        ('C5', 1), ('A4', 1), ('F4', 2),
        ('E4', 1), ('G4', 1), ('C5', 1), ('B4', 1),
        ('D5', 1), ('B4', 1), ('G4', 2),
        ('A4', 1), ('C5', 1), ('E5', 1), ('A5', 1),
        ('G5', 1), ('F5', 1), ('C5', 2),
        ('D5', 1), ('F5', 1), ('A5', 1), ('F5', 1),
        ('E5', 1), ('G#5', 1), ('B4', 2),
        ('C5', 1), ('B4', 1), ('A4', 1), ('B4', 1),
        ('A4', 3), ('R', 1),
    ],
    # 6도 아래 화성
    harmony=[
        ('C4', 1), ('E4', 1), ('G4', 1), ('F4', 1),
        ('E4', 1), ('C4', 1), ('A3', 2),
        ('G3', 1), ('B3', 1), ('E4', 1), ('D4', 1),
        ('F4', 1), ('D4', 1), ('B3', 2),
        ('C4', 1), ('E4', 1), ('G4', 1), ('C5', 1),
        ('B4', 1), ('A4', 1), ('E4', 2),
        ('F4', 1), ('A4', 1), ('C5', 1), ('A4', 1),
        ('G#4', 1), ('B4', 1), ('D4', 2),
        ('E4', 1), ('D4', 1), ('C4', 1), ('D4', 1),
        ('C4', 3), ('R', 1),
    ],
)

WINTER = dict(
    bpm=84, bars=8, arp=ARP_WIDE, swing=(0.5, 0.5),
    drums=([0], [], True),
    chords=[
        ('D3', ['D4', 'A4', 'D5', 'F5']), ('A#2', ['A#3', 'F4', 'A#4', 'D5']),
        ('F2', ['F3', 'C4', 'F4', 'A4']), ('C3', ['C4', 'G4', 'C5', 'E5']),
        ('D3', ['D4', 'A4', 'D5', 'F5']), ('G2', ['G3', 'D4', 'G4', 'A#4']),
        ('A2', ['A3', 'E4', 'A4', 'C#5']), ('D3', ['D4', 'A4', 'D5', 'F5']),
    ],
    melody=[
        ('A4', 2), ('D5', 2),
        ('F5', 3), ('R', 1),
        ('C5', 2), ('A4', 1), ('C5', 1),
        ('E5', 3), ('R', 1),
        ('D5', 1), ('F5', 1), ('A5', 2),
        ('G5', 2), ('A#4', 2),
        ('C#5', 2), ('E5', 1), ('A5', 1),
        ('D5', 3), ('R', 1),
    ],
)

_CHORUS = [
    ('A5', .5), ('C6', .5), ('F5', 1), ('A5', .5), ('G5', .5), ('F5', 1),
    ('D5', .5), ('F5', .5), ('A#5', 1), ('D6', .5), ('C6', .5), ('A#5', 1),
    ('C6', .5), ('G5', .5), ('E5', 1), ('G5', .5), ('A5', .5), ('B5', .5), ('C6', .5),
]
TITLE = dict(
    bpm=100, bars=10, arp=ARP_UP, swing=(0.5, 0.5),
    drums=([0, 2], [1, 3], True),
    chords=[
        ('F2', ['F3', 'A3', 'C4']), ('C3', ['C4', 'E4', 'G4']),
        ('F2', ['F3', 'A3', 'C4']), ('A#2', ['A#3', 'D4', 'F4']), ('C3', ['C4', 'E4', 'G4']), ('F2', ['F3', 'A3', 'C4']),
        ('F2', ['F3', 'A3', 'C4']), ('A#2', ['A#3', 'D4', 'F4']), ('C3', ['C4', 'E4', 'G4']), ('F2', ['F3', 'A3', 'C4']),
    ],
    melody=[
        # 팡파르 인트로 (점음표)
        ('F5', .75), ('F5', .25), ('F5', .5), ('A5', .5), ('C6', 2),
        ('E5', .75), ('E5', .25), ('G5', .5), ('C6', .5), ('E6', 1), ('G5', .5), ('A5', .5),
        # 후렴 ×2
        *_CHORUS, ('A5', .5), ('F5', .5), ('C5', 1), ('F5', 2),
        *_CHORUS, ('C6', .5), ('A5', .5), ('F5', 1), ('F5', 2),
    ],
)

SONGS = {'spring': SPRING, 'summer': SUMMER, 'autumn': AUTUMN, 'winter': WINTER, 'title': TITLE}


# ---------------------------------------------------------------- 렌더
def _drum_kit(s):
    kick = s.tone('C2', 0.08, 'triangle', 0.3, env=(0.001, 0.06, 0.0, 0.01))
    snare = s.noise(0.07, 0.2, env=(0.001, 0.05, 0.15, 0.015))
    hat = s.noise(0.025, 0.08, env=(0.001, 0.015, 0.2, 0.008), lowpass=0.3)
    return kick, snare, hat


def render(name, song):
    s = Synth(seed=sum(map(ord, name)))  # 재현 가능한 노이즈
    bpm, bars = song['bpm'], song['bars']
    beat = 60.0 / bpm
    total_beats = bars * 4
    assert len(song['chords']) == bars, f'{name}: chords {len(song["chords"])} != bars {bars}'
    mel_beats = sum(b for _, b in song['melody'])
    assert abs(mel_beats - total_beats) < 1e-6, f'{name}: melody {mel_beats} beats != {total_beats}'
    if 'harmony' in song:
        assert abs(sum(b for _, b in song['harmony']) - total_beats) < 1e-6, f'{name}: harmony length'

    parts = []
    # 멜로디
    parts.append((s.sequence(song['melody'], bpm, 'pulse25', 0.28, env=(0.005, 0.04, 0.6, 0.04)), 0.0))
    if 'harmony' in song:
        parts.append((s.sequence(song['harmony'], bpm, 'pulse25', 0.14, env=(0.005, 0.04, 0.6, 0.04)), 0.0))
    # 베이스: 4분음 근음
    bass_notes = [(root, 1) for root, _ in song['chords'] for _ in range(4)]
    parts.append((s.sequence(bass_notes, bpm, 'triangle', 0.26, env=(0.005, 0.05, 0.7, 0.04)), 0.0))
    # 아르페지오: 8분음 (스윙 적용)
    e1, e2 = song['swing']
    arp_notes = []
    for _, chord in song['chords']:
        for k, idx in enumerate(song['arp']):
            arp_notes.append((chord[idx % len(chord)], e1 if k % 2 == 0 else e2))
    parts.append((s.sequence(arp_notes, bpm, 'square', 0.12, env=(0.002, 0.03, 0.45, 0.03)), 0.0))
    # 드럼
    kick, snare, hat = _drum_kit(s)
    kick_beats, snare_beats, hat_on = song['drums']
    for bar in range(bars):
        t0 = bar * 4 * beat
        for b in kick_beats:
            parts.append((kick, t0 + b * beat))
        for b in snare_beats:
            parts.append((snare, t0 + b * beat))
        if hat_on:
            for b in range(4):
                parts.append((hat, t0 + b * beat))
                parts.append((hat, t0 + (b + e1) * beat))

    buf = s.mix(parts)
    # 정확한 루프 길이로 자르거나 채움
    n = int(round(SR * total_beats * beat))
    buf = (buf + [0.0] * n)[:n]
    peak = max(abs(v) for v in buf)
    buf = [v * PEAK / peak for v in buf]
    return buf, n / SR


def build():
    os.makedirs(OUT, exist_ok=True)
    for name, song in SONGS.items():
        t = time.time()
        buf, dur = render(name, song)
        wav = os.path.join(OUT, f'{name}.wav')
        write_wav(wav, buf)
        to_m4a(wav, os.path.join(OUT, f'{name}.m4a'))
        print(f'{name}: {dur:.2f}s ({song["bpm"]}bpm, {song["bars"]} bars) in {time.time() - t:.1f}s')
    print(f'{len(SONGS)} bgm')


if __name__ == '__main__':
    build()
