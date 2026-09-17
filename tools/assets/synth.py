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

def soften(samples: list[float], alpha: float = 0.3, passes: int = 2) -> list[float]:
    """1차 로우패스를 여러 번 걸어 사각파의 날카로움을 깎는다. alpha 0.3 ≈ 1.2kHz 컷오프."""
    out = samples
    for _ in range(passes):
        y, res = 0.0, []
        for v in out:
            y += alpha * (v - y)
            res.append(y)
        out = res
    return out

def write_wav(path: str, samples: list[float]) -> None:
    with open(path, 'wb') as f:
        data = b''.join(struct.pack('<h', int(max(-1.0, min(1.0, s)) * 32767)) for s in samples)
        f.write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVE')
        f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, SR, SR * 2, 2, 16))
        f.write(b'data' + struct.pack('<I', len(data)) + data)

def to_m4a(wav_path: str, m4a_path: str, bitrate: str = '64k') -> None:
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', bitrate, m4a_path], check=True)
    os.remove(wav_path)
