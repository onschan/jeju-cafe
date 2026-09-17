"""8비트 효과음 13개 → public/assets/sfx/{name}.m4a"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import Synth, write_wav, to_m4a

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'sfx')
PEAK = 0.55  # 정규화 목표 피크. AAC 인코딩 시 square 파형은 링잉으로 ~+3dB 튀므로 여유를 둔다
PEAK_OVERRIDE = {'error': 0.4}  # 저음 square는 링잉이 더 커서 추가 여유


def normalize(buf, peak=PEAK):
    m = max((abs(v) for v in buf), default=0.0)
    return [v * peak / m for v in buf] if m > 0 else buf


def seq(s, bufs):
    """버퍼들을 순서대로 이어 붙인다 (mix로 합성 → tanh)."""
    parts, t = [], 0.0
    for b in bufs:
        parts.append((b, t))
        t += len(b) / 22050
    return s.mix(parts)


def build():
    os.makedirs(OUT, exist_ok=True)
    s = Synth()
    pluck = (0.003, 0.03, 0.6, 0.02)      # 짧은 UI 음
    bell = (0.003, 0.05, 0.5, 0.06)       # 여운 있는 음
    recipes = {
        # 아주 짧은 클릭
        'tap': s.tone('C6', 0.05, 'square', 0.3, env=(0.002, 0.01, 0.6, 0.01)),
        # 툭 놓는 소리: 위로 슬라이드 + 살짝 노이즈
        'place': s.mix([
            (s.slide('C4', 'C5', 0.12, 'triangle', 0.5), 0),
            (s.noise(0.05, 0.2, lowpass=0.8), 0.02),
        ]),
        # 빼는 소리: 아래로 슬라이드
        'remove': s.slide('C5', 'C4', 0.15, 'square', 0.35, env=(0.003, 0.03, 0.7, 0.04)),
        # 심기: 두 음이 순차로
        'plant': seq(s, [
            s.tone('E5', 0.06, 'triangle', 0.5, env=pluck),
            s.tone('G5', 0.06, 'triangle', 0.5, env=pluck),
        ]),
        # 수확: 아르페지오
        'harvest': seq(s, [
            s.tone('C5', 0.05, 'pulse25', 0.4, env=pluck),
            s.tone('E5', 0.05, 'pulse25', 0.4, env=pluck),
            s.tone('G5', 0.05, 'pulse25', 0.4, env=pluck),
            s.tone('C6', 0.12, 'pulse25', 0.4, env=bell),
        ]),
        # 동전: 짧은 음 → 길게 울리는 높은 음
        'coin': seq(s, [
            s.tone('B5', 0.05, 'square', 0.35, env=(0.002, 0.02, 0.8, 0.01)),
            s.tone('E6', 0.18, 'square', 0.35, env=(0.002, 0.04, 0.5, 0.08)),
        ]),
        # 손님 만족
        'happy': seq(s, [
            s.tone('E5', 0.08, 'triangle', 0.5, env=pluck),
            s.tone('G5', 0.08, 'triangle', 0.5, env=pluck),
            s.tone('C6', 0.16, 'triangle', 0.5, env=bell, vibrato=0.01),
        ]),
        # 손님 시큰둥: 내려가는 두 음
        'meh': seq(s, [
            s.tone('G4', 0.12, 'square', 0.3, env=(0.005, 0.03, 0.6, 0.03)),
            s.tone('F4', 0.18, 'square', 0.3, env=(0.005, 0.04, 0.5, 0.06)),
        ]),
        # 해금: 올라가는 아르페지오 + 긴 마지막 음
        'unlock': seq(s, [
            s.tone('C5', 0.06, 'pulse25', 0.4, env=pluck),
            s.tone('E5', 0.06, 'pulse25', 0.4, env=pluck),
            s.tone('G5', 0.06, 'pulse25', 0.4, env=pluck),
            s.tone('C6', 0.06, 'pulse25', 0.4, env=pluck),
            s.tone('E6', 0.25, 'pulse25', 0.4, env=(0.003, 0.06, 0.5, 0.1)),
        ]),
        # 월 전환: 종소리 느낌
        'month': seq(s, [
            s.tone('C5', 0.15, 'triangle', 0.5, env=bell),
            s.tone('G4', 0.15, 'triangle', 0.5, env=bell),
            s.tone('C5', 0.30, 'triangle', 0.5, env=(0.003, 0.08, 0.5, 0.12)),
        ]),
        # 팡파르: square 멜로디 + 옥타브 아래 triangle
        'fanfare': s.mix([
            (s.sequence([('C5', 0.5), ('E5', 0.5), ('G5', 0.5), ('C6', 1.5)], 240, 'square', 0.3,
                        env=(0.003, 0.03, 0.7, 0.05)), 0),
            (s.sequence([('C4', 0.5), ('E4', 0.5), ('G4', 0.5), ('C5', 1.5)], 240, 'triangle', 0.35,
                        env=(0.003, 0.03, 0.7, 0.05)), 0),
        ]),
        # 오류: 낮은 반음 하강
        'error': seq(s, [
            s.tone('A#3', 0.08, 'square', 0.3, env=(0.003, 0.02, 0.7, 0.02)),
            s.tone('A3', 0.16, 'square', 0.3, env=(0.003, 0.03, 0.6, 0.05)),
        ]),
        # 버스 도착: 로우패스 노이즈 + 낮은 웅웅
        'bus': s.mix([
            (s.noise(0.5, 0.25, env=(0.05, 0.1, 0.7, 0.2), lowpass=0.9), 0),
            (s.tone('C3', 0.5, 'triangle', 0.2, env=(0.05, 0.1, 0.7, 0.2)), 0),
        ]),
    }
    for name, buf in recipes.items():
        buf = normalize(buf, PEAK_OVERRIDE.get(name, PEAK))
        wav = os.path.join(OUT, f'{name}.wav')
        write_wav(wav, buf)
        to_m4a(wav, os.path.join(OUT, f'{name}.m4a'))
    print(f'{len(recipes)} sfx')


if __name__ == '__main__':
    build()
