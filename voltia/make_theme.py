#!/usr/bin/env python3
"""Tema de Voltia, «Puerto Voltaje».

Cumbia electrónica ligera en la menor, a 100 BPM, 48 compases (1:55).
El bucle está escrito para cerrar: el último compás es dominante y
resuelve en el primero. El motivo de tres notas (mi–sol–la) es su
nombre, VOL-TI-A. El sol sostenido del acorde de mi y la cadencia
andaluza (Am–G–F–E) son el acento mexicano; el arpegio que sube en
la sección central es el traje cargando voltaje.

Dependencia: numpy. Escribe voltia/theme.wav (PCM 16-bit estéreo).
"""

from __future__ import annotations

import math
import os
import wave

import numpy as np

SR = 44100
BPM = 100
BARS = 48
BEAT_SAMPLES = int(round(60 / BPM * SR))  # 26460
N = BARS * 4 * BEAT_SAMPLES
RNG = np.random.default_rng(17)

ROOTS = {"Am": 45, "G": 43, "F": 41, "E": 40, "C": 48}
# Tonos del requinto, en un registro medio y brillante.
TONES = {
    "Am": (69, 72, 76),
    "G": (67, 71, 74),
    "F": (65, 69, 72),
    "E": (64, 68, 71),
    "C": (72, 76, 79),
}
# Tonos agudos del arpegio de voltaje.
TONES_HI = {k: tuple(n + 12 for n in v) for k, v in TONES.items()}


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def sample_at(beat: float) -> int:
    return int(round(beat * BEAT_SAMPLES))


def chords() -> list[str]:
    andal = ["Am", "Am", "G", "G", "F", "F", "E", "E"]
    lift = ["Am", "C", "G", "E", "Am", "C", "F", "E"]
    fight = ["Am", "C", "G", "E", "F", "G", "E", "E"]
    turn = ["Am", "G", "F", "E", "Am", "F", "G", "E"]
    seq = andal + andal + lift + fight + andal + turn
    assert len(seq) == BARS
    return seq


def env_ar(n: int, attack: float, release: float, curve: float = 1.6) -> np.ndarray:
    e = np.ones(n, dtype=np.float64)
    a = min(n, int(attack * SR))
    r = min(n - a, int(release * SR))
    if a > 1:
        e[:a] = np.linspace(0.0, 1.0, a)
    if r > 1:
        e[-r:] *= np.linspace(1.0, 0.0, r)
    if curve != 1.0 and n > 8:
        t = np.linspace(0.0, 1.0, n)
        e *= np.exp(-t * curve)
    return e


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    if len(x) == 0:
        return x
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    b = 1.0 - a
    for i in range(len(x)):
        acc = a * acc + b * x[i]
        y[i] = acc
    return y


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - lowpass(x, cutoff)


def place(stereo: np.ndarray, sig: np.ndarray, beat: float, pan: float, gain: float) -> None:
    if gain <= 0 or len(sig) == 0:
        return
    start = sample_at(beat)
    if start >= N:
        return
    sig = sig[: N - start]
    ang = (pan + 1.0) * math.pi / 4
    lg = math.cos(ang) * gain
    rg = math.sin(ang) * gain
    stereo[0, start : start + len(sig)] += sig * lg
    stereo[1, start : start + len(sig)] += sig * rg


def kick(vel: float) -> np.ndarray:
    dur = 0.16
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 168 * np.exp(-t * 26) + 52
    phase = 2 * math.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 14)
    click_n = int(0.008 * SR)
    click = RNG.uniform(-1, 1, click_n)
    click = highpass(click, 1800)
    click = np.pad(click, (0, n - click_n)) * np.exp(-t * 90)
    return (body * 0.92 + click * 0.28) * vel


def rim(vel: float) -> np.ndarray:
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * math.pi * 1480 * t) * np.exp(-t * 46)
    noise = highpass(RNG.uniform(-1, 1, n), 2200) * np.exp(-t * 70)
    return (tone * 0.7 + noise * 0.45) * vel


def hat(vel: float, open_: bool) -> np.ndarray:
    dur = 0.14 if open_ else 0.045
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = highpass(RNG.uniform(-1, 1, n), 6000)
    decay = 18 if open_ else 55
    return noise * np.exp(-t * decay) * vel


def guiro_tick(vel: float, accent: bool) -> np.ndarray:
    dur = 0.055 if accent else 0.028
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = RNG.uniform(-1, 1, n)
    # El raspado: un pasa-banda estrecho que sube un poco.
    center = 1800 + (900 if accent else 400)
    band = lowpass(highpass(noise, center * 0.55), center * 1.8)
    scrape = np.sin(np.linspace(0, math.pi, n)) ** 1.4
    return band * scrape * vel


def bass_note(midi: float, dur: float, vel: float, glide_from: float | None) -> np.ndarray:
    n = int(max(0.04, dur) * SR)
    t = np.arange(n) / SR
    target = midi_hz(midi)
    if glide_from is None:
        f = np.full(n, target)
    else:
        g = min(n, int(0.035 * SR))
        f = np.full(n, target)
        f[:g] = np.linspace(midi_hz(glide_from), target, g)
    phase = 2 * math.pi * np.cumsum(f) / SR
    sine = np.sin(phase)
    # Un poco de armónico para que se oiga en altavoces pequeños, sin ensuciar.
    square = np.tanh(3.2 * np.sin(phase)) * 0.22
    sig = lowpass(sine * 0.85 + square, 420)
    sig *= env_ar(n, 0.006, min(0.05, dur * 0.45), curve=2.4)
    return sig * vel


def karplus(freq: float, dur: float, vel: float) -> np.ndarray:
    n = int(dur * SR)
    period = max(2, int(SR / freq))
    buf = RNG.uniform(-1, 1, period)
    buf = lowpass(buf, 2800)
    out = np.empty(n)
    idx = 0
    decay = 0.990 + vel * 0.004
    for i in range(n):
        out[i] = buf[idx]
        nxt = (idx + 1) % period
        avg = 0.5 * (buf[idx] + buf[nxt])
        buf[idx] = decay * (0.35 * buf[idx] + 0.65 * avg)
        idx = nxt
    click_n = min(n, int(0.003 * SR))
    click = highpass(RNG.uniform(-1, 1, click_n), 2500) * np.linspace(1, 0, click_n)
    out[:click_n] += click * 0.55
    out *= np.exp(-np.linspace(0, 1, n) * 1.4)
    peak = float(np.max(np.abs(out))) if n else 0.0
    if peak > 0:
        out *= 0.85 / peak
    return out * vel


def lead_voice(midi: float, dur: float, vel: float, scoop: bool, dark: bool) -> np.ndarray:
    n = int(max(0.05, dur) * SR)
    t = np.arange(n) / SR
    f = np.full(n, midi_hz(midi))
    if scoop:
        s = min(n // 2, int(0.032 * SR))
        if s > 2:
            f[:s] = midi_hz(midi) * 2 ** (np.linspace(-0.85, 0.0, s) / 12)
    vib_from = int(0.11 * SR)
    if n > vib_from + 8 and dur > 0.28:
        depth = 0.06 * vel
        f[vib_from:] *= 2 ** (np.sin(2 * math.pi * 5.1 * t[vib_from:]) * depth / 12)
    phase = 2 * math.pi * np.cumsum(f) / SR
    sig = np.zeros(n)
    nh = 4 if dark else 5 + int(vel * 4)
    base = midi_hz(midi)
    for k in range(1, nh + 1):
        if base * k > 11000:
            break
        amp = 1.0 / (k ** 1.32)
        if k % 2 == 0:
            amp *= 0.28 if not dark else 0.08
        sig += amp * np.sin(phase * k)
    sig /= max(1.0, np.max(np.abs(sig)))
    cutoff = 1600 if dark else 2200 + vel * 1600
    sig = lowpass(sig, cutoff)
    rel = 0.09 if dark else 0.055
    sig *= env_ar(n, 0.014 if not scoop else 0.008, rel, curve=0.55)
    return sig * vel


def pad_tone(midi: float, dur: float) -> tuple[np.ndarray, np.ndarray]:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f1 = midi_hz(midi)
    f2 = midi_hz(midi + 7)  # quinta, el neón
    lfo = 0.82 + 0.18 * np.sin(2 * math.pi * 0.13 * t)
    left = np.sin(2 * math.pi * f1 * 0.997 * t) * 0.6 + np.sin(2 * math.pi * f2 * 1.003 * t) * 0.4
    right = np.sin(2 * math.pi * f1 * 1.004 * t) * 0.6 + np.sin(2 * math.pi * f2 * 0.996 * t) * 0.4
    e = env_ar(n, 0.18, 0.22, curve=0.3)
    return left * lfo * e, right * lfo * e


def spark(vel: float) -> np.ndarray:
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    f = np.linspace(3400, 1680, n)
    phase = 2 * math.pi * np.cumsum(f) / SR
    tone = np.sin(phase) * np.exp(-t * 28)
    crack_n = int(0.006 * SR)
    crack = highpass(RNG.uniform(-1, 1, crack_n), 3000)
    crack = np.pad(crack, (0, n - crack_n)) * np.exp(-t * 120)
    return (tone * 0.8 + crack * 0.35) * vel


def theme_a(offset: int) -> list[tuple]:
    """El motivo. VOL-TI-A, y el acorde de mi con sol sostenido."""
    raw = [
        (0, 0.00, 76, 0.40, 0.94),
        (0, 0.50, 79, 0.40, 0.86),
        (0, 1.00, 81, 0.82, 0.98),
        (0, 2.50, 84, 0.36, 0.76),
        (0, 3.00, 81, 0.36, 0.72),
        (0, 3.50, 76, 0.40, 0.70),
        (1, 0.50, 76, 0.36, 0.78),
        (1, 1.00, 79, 0.36, 0.80),
        (1, 1.50, 81, 0.62, 0.86),
        (1, 2.50, 83, 0.30, 0.66),
        (1, 3.00, 81, 0.30, 0.64),
        (1, 3.50, 79, 0.38, 0.62),
        (2, 0.00, 74, 0.32, 0.80),
        (2, 0.45, 74, 0.28, 0.62),
        (2, 1.00, 76, 0.32, 0.74),
        (2, 1.45, 74, 0.32, 0.66),
        (2, 2.00, 71, 0.85, 0.84),
        (2, 3.20, 67, 0.55, 0.60),
        (3, 0.50, 71, 0.36, 0.70),
        (3, 1.00, 69, 0.30, 0.64),
        (3, 1.50, 67, 0.75, 0.78),
        (3, 2.75, 69, 0.36, 0.60),
        (3, 3.25, 71, 0.55, 0.66),
        (4, 0.00, 72, 0.36, 0.82),
        (4, 0.50, 69, 0.30, 0.68),
        (4, 1.00, 65, 0.30, 0.64),
        (4, 1.50, 69, 0.36, 0.70),
        (4, 2.00, 72, 0.72, 0.80),
        (4, 3.00, 74, 0.62, 0.68),
        (5, 0.50, 76, 0.34, 0.74),
        (5, 1.00, 74, 0.34, 0.68),
        (5, 1.50, 72, 0.72, 0.76),
        (5, 2.75, 69, 0.36, 0.58),
        (5, 3.25, 65, 0.50, 0.56),
        (6, 0.00, 76, 0.32, 0.86),
        (6, 0.45, 68, 0.28, 0.70),
        (6, 1.00, 71, 0.32, 0.74),
        (6, 1.50, 76, 0.68, 0.88),
        (6, 2.50, 74, 0.30, 0.64),
        (6, 3.00, 71, 0.28, 0.60),
        (6, 3.50, 68, 0.38, 0.62),
        (7, 0.45, 71, 0.30, 0.66),
        (7, 1.00, 69, 0.26, 0.58),
        (7, 1.45, 68, 0.30, 0.64),
        (7, 2.00, 64, 0.78, 0.72),
    ]
    return [(b + offset, beat, m, d, v) for b, beat, m, d, v in raw]


def theme_b() -> list[tuple]:
    """La carga: notas largas que suben, y el salto de octava."""
    raw = [
        (16, 0.00, 69, 1.35, 0.78),
        (16, 1.55, 72, 1.15, 0.80),
        (16, 3.00, 76, 0.85, 0.84),
        (17, 0.00, 79, 1.45, 0.86),
        (17, 1.85, 76, 0.75, 0.72),
        (17, 2.90, 72, 0.85, 0.70),
        (18, 0.00, 74, 1.15, 0.80),
        (18, 1.45, 71, 0.95, 0.74),
        (18, 2.85, 67, 0.90, 0.66),
        (19, 0.00, 76, 1.35, 0.88),
        (19, 1.70, 71, 0.55, 0.68),
        (19, 2.55, 68, 1.05, 0.74),
        (20, 0.35, 69, 0.28, 0.70),
        (20, 0.80, 72, 0.28, 0.74),
        (20, 1.25, 76, 0.28, 0.80),
        (20, 1.85, 81, 1.35, 0.96),
        (21, 0.00, 79, 0.38, 0.78),
        (21, 0.50, 76, 0.38, 0.72),
        (21, 1.05, 72, 0.70, 0.74),
        (21, 2.05, 76, 0.36, 0.70),
        (21, 2.55, 79, 1.15, 0.82),
        (22, 0.00, 81, 0.75, 0.86),
        (22, 1.00, 77, 0.48, 0.70),
        (22, 1.70, 72, 0.48, 0.66),
        (22, 2.45, 69, 1.15, 0.72),
        (23, 0.00, 71, 0.36, 0.74),
        (23, 0.50, 76, 0.36, 0.78),
        (23, 1.05, 80, 0.72, 0.88),
        (23, 2.15, 76, 0.36, 0.66),
        (23, 2.65, 74, 0.30, 0.60),
        (23, 3.15, 71, 0.55, 0.64),
    ]
    return list(raw)


def theme_fight() -> list[tuple]:
    """Cero piedad: frases cortas, saltos, el circuito que se cierra."""
    raw = [
        (24, 0.00, 76, 0.24, 0.90),
        (24, 0.40, 72, 0.22, 0.72),
        (24, 0.85, 69, 0.28, 0.74),
        (24, 1.40, 76, 0.22, 0.78),
        (24, 1.85, 81, 0.62, 0.96),
        (24, 2.85, 79, 0.32, 0.70),
        (24, 3.35, 76, 0.40, 0.68),
        (25, 0.00, 76, 0.28, 0.80),
        (25, 0.45, 79, 0.28, 0.76),
        (25, 1.00, 76, 0.62, 0.82),
        (25, 1.95, 72, 0.36, 0.66),
        (25, 2.50, 76, 0.28, 0.70),
        (25, 3.00, 79, 0.72, 0.80),
        (26, 0.00, 74, 0.28, 0.78),
        (26, 0.45, 71, 0.24, 0.66),
        (26, 0.90, 67, 0.40, 0.70),
        (26, 1.65, 71, 0.26, 0.64),
        (26, 2.15, 74, 0.26, 0.70),
        (26, 2.65, 79, 0.95, 0.84),
        (27, 0.00, 76, 0.22, 0.86),
        (27, 0.35, 68, 0.22, 0.70),
        (27, 0.72, 71, 0.22, 0.72),
        (27, 1.15, 76, 0.55, 0.84),
        (27, 2.05, 74, 0.28, 0.62),
        (27, 2.50, 71, 0.26, 0.60),
        (27, 2.95, 68, 0.70, 0.66),
        (28, 0.00, 72, 0.36, 0.80),
        (28, 0.50, 69, 0.28, 0.66),
        (28, 0.95, 65, 0.28, 0.62),
        (28, 1.45, 69, 0.36, 0.70),
        (28, 2.00, 72, 0.48, 0.76),
        (28, 2.70, 76, 0.32, 0.72),
        (28, 3.20, 77, 0.55, 0.74),
        (29, 0.00, 74, 0.36, 0.76),
        (29, 0.50, 71, 0.28, 0.64),
        (29, 1.00, 67, 0.72, 0.74),
        (29, 2.05, 71, 0.32, 0.62),
        (29, 2.55, 74, 0.32, 0.66),
        (29, 3.05, 67, 0.65, 0.60),
        (30, 0.00, 76, 0.72, 0.88),
        (30, 1.00, 71, 0.36, 0.66),
        (30, 1.50, 68, 0.36, 0.64),
        (30, 2.05, 76, 0.70, 0.82),
        (30, 3.00, 74, 0.32, 0.60),
        (30, 3.45, 71, 0.36, 0.58),
        (31, 0.00, 68, 0.36, 0.72),
        (31, 0.50, 71, 0.36, 0.74),
        (31, 1.05, 76, 1.05, 0.90),
        (31, 2.40, 74, 0.30, 0.60),
        (31, 2.85, 71, 0.26, 0.56),
        (31, 3.25, 68, 0.40, 0.58),
    ]
    return list(raw)


def theme_turn() -> list[tuple]:
    """Fragmentos del motivo y una bajada que pide el mi del principio."""
    raw = [
        (40, 0.45, 76, 0.36, 0.80),
        (40, 1.00, 79, 0.36, 0.82),
        (40, 1.50, 81, 0.85, 0.92),
        (40, 3.00, 76, 0.55, 0.64),
        (41, 0.45, 74, 0.36, 0.70),
        (41, 1.00, 71, 0.36, 0.66),
        (41, 1.55, 67, 0.95, 0.74),
        (41, 3.00, 71, 0.55, 0.58),
        (42, 0.00, 72, 0.42, 0.76),
        (42, 0.70, 69, 0.36, 0.64),
        (42, 1.40, 65, 0.48, 0.66),
        (42, 2.35, 69, 0.36, 0.60),
        (42, 2.90, 72, 0.70, 0.68),
        (43, 0.00, 76, 0.40, 0.80),
        (43, 0.55, 71, 0.32, 0.64),
        (43, 1.05, 68, 0.36, 0.66),
        (43, 1.65, 64, 1.15, 0.72),
        (44, 0.40, 76, 0.32, 0.82),
        (44, 0.90, 79, 0.32, 0.80),
        (44, 1.40, 81, 0.75, 0.92),
        (44, 2.85, 84, 0.55, 0.70),
        (45, 0.00, 81, 0.62, 0.78),
        (45, 0.90, 77, 0.48, 0.66),
        (45, 1.65, 72, 0.48, 0.62),
        (45, 2.40, 69, 1.05, 0.68),
        (46, 0.00, 71, 0.42, 0.72),
        (46, 0.65, 67, 0.38, 0.60),
        (46, 1.35, 74, 0.42, 0.66),
        (46, 2.05, 71, 0.36, 0.58),
        (46, 2.70, 67, 0.75, 0.62),
        (47, 0.00, 76, 0.48, 0.74),
        (47, 0.70, 74, 0.32, 0.60),
        (47, 1.20, 71, 0.36, 0.62),
        (47, 1.75, 68, 0.42, 0.66),
        (47, 2.40, 64, 0.70, 0.60),
    ]
    return list(raw)


def build_score(seq: list[str]) -> dict:
    lead = theme_a(0) + theme_a(8) + theme_b() + theme_fight() + theme_a(32) + theme_turn()
    echo_bars = set(range(8, 16)) | set(range(32, 40))
    echo = []
    for bar, beat, midi, dur, vel in lead:
        if bar in echo_bars and dur >= 0.34:
            echo.append((bar, beat + 0.75, midi, dur * 0.9, vel * 0.34))

    bass = []
    prev = None
    for bar, chord in enumerate(seq):
        root = ROOTS[chord]
        nxt = ROOTS[seq[(bar + 1) % BARS]]
        if bar == BARS - 1:
            events = [
                (0.00, root, 0.40, 0.96),
                (1.50, root + 12, 0.15, 0.58),
                (2.15, root + 7, 0.32, 0.78),
                (2.95, 44, 0.22, 0.86),  # sol sostenido, sensible
                (3.55, 45, 0.28, 0.72),  # la, anticipa el principio
            ]
        else:
            events = [
                (0.00, root, 0.42, 0.94),
                (1.50, root + 12, 0.15, 0.56),
                (2.20, root + 7, 0.30, 0.74),
                (3.50, nxt, 0.16, 0.60),
            ]
        for beat, midi, dur, vel in events:
            bass.append((bar * 4 + beat, midi, dur, vel, prev))
            prev = midi
        # El compás se cuenta en beats absolutos; prev es el último midi.

    pluck = []
    for bar, chord in enumerate(seq):
        tones = TONES[chord]
        if 16 <= bar < 32:
            pattern = [(0.25, 0), (1.25, 2), (2.25, 1), (3.25, 0)]
            gain = 0.55
        elif bar == BARS - 1:
            pattern = [(0.25, 2), (1.00, 0), (1.75, 1)]
            gain = 0.7
        elif bar % 8 in (3, 7):
            pattern = [(0.25, 0), (1.00, 2), (1.75, 1), (2.50, 2), (3.25, 0)]
            gain = 0.85
        else:
            pattern = [(0.25, 2), (0.75, 0), (1.50, 1), (2.25, 2), (2.75, 1), (3.25, 0)]
            gain = 1.0
        for beat, deg in pattern:
            pluck.append((bar + beat / 4.0, tones[deg], 0.34, 0.72 * gain))

    arp = []
    for bar in range(16, 32):
        tones = TONES_HI[seq[bar]]
        for i, beat in enumerate((0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5)):
            tone = tones[i % 3]
            if (bar - 16) % 8 >= 4 and i % 2 == 0:
                tone += 12
            phase = ((bar - 16) % 4) / 4 + beat / 16
            vel = 0.28 + 0.5 * min(1.0, phase)
            arp.append((bar * 4 + beat, tone, 0.13, vel))

    sparks = [
        (0, 2.50, 0.55),
        (6, 3.50, 0.40),
        (14, 1.00, 0.35),
        (20, 1.85, 0.70),
        (24, 1.85, 0.62),
        (27, 0.00, 0.45),
        (32, 1.00, 0.50),
        (39, 3.20, 0.36),
        (44, 1.40, 0.58),
        (47, 1.75, 0.42),
    ]
    return {
        "lead": lead,
        "echo": echo,
        "bass": bass,
        "pluck": pluck,
        "arp": arp,
        "sparks": sparks,
    }


def render() -> tuple[np.ndarray, dict]:
    seq = chords()
    score = build_score(seq)
    drums = np.zeros((2, N))
    bass_b = np.zeros((2, N))
    pluck_b = np.zeros((2, N))
    lead_b = np.zeros((2, N))
    echo_b = np.zeros((2, N))
    arp_b = np.zeros((2, N))
    pad_b = np.zeros((2, N))
    spark_b = np.zeros((2, N))

    for bar in range(BARS):
        jitter = float(RNG.uniform(-0.004, 0.004))
        place(drums, kick(1.0), bar * 4 + jitter, 0.0, 0.78)
        place(drums, kick(0.72), bar * 4 + 1.5, 0.0, 0.62)
        place(drums, kick(0.38 if bar in (15, 31, 47) else 0.42), bar * 4 + 3.0, 0.02, 0.40)
        if bar in (15, 31, 47):
            for k, beat in enumerate((2.55, 3.05, 3.45)):
                place(drums, rim(0.55 + 0.12 * k), bar * 4 + beat, -0.05, 0.22)
        place(drums, rim(0.55), bar * 4 + 1.0, -0.12, 0.20)
        for beat in (0.5, 1.5, 2.5):
            place(drums, hat(0.55, False), bar * 4 + beat, 0.22, 0.075)
        open_hat = bar % 2 == 1 and bar != 47
        place(drums, hat(0.7 if open_hat else 0.5, open_hat), bar * 4 + 3.5, 0.28, 0.08)
        for i in range(16):
            beat = i * 0.25
            accent = i in (0, 3, 6, 8, 11, 14)
            place(
                drums,
                guiro_tick(0.9 if accent else 0.32, accent),
                bar * 4 + beat,
                0.42,
                0.09 if accent else 0.03,
            )

    prev_midi = None
    for beat, midi, dur, vel, glide in score["bass"]:
        glide_from = prev_midi if glide is not None and abs(glide - midi) <= 7 else None
        place(bass_b, bass_note(midi, dur * 0.6, vel, glide_from), beat, 0.0, 0.60)
        prev_midi = midi

    for beat, midi, dur, vel in score["pluck"]:
        swing = 0.012 if abs((beat * 2) - round(beat * 2)) > 0.2 else 0.0
        place(pluck_b, karplus(midi_hz(midi), 0.42, vel), beat + swing, -0.38, 0.48)

    prev_end = -9.0
    prev_midi = None
    for bar, beat, midi, dur, vel in score["lead"]:
        start = bar * 4 + beat
        gap = start - prev_end
        leap = prev_midi is not None and abs(midi - prev_midi) >= 4
        scoop = gap > 0.28 or leap
        place(lead_b, lead_voice(midi, dur * 0.6, vel, scoop, dark=False), start, -0.06, 0.32)
        place(lead_b, lead_voice(midi - 0.07, dur * 0.6, vel * 0.42, False, dark=True), start + 0.018, 0.32, 0.14)
        prev_end = start + dur * 0.6
        prev_midi = midi

    for bar, beat, midi, dur, vel in score["echo"]:
        start = bar * 4 + beat
        if start + dur * 0.6 >= BARS * 4:
            continue
        sig = lead_voice(midi - 0.12, dur * 0.6, vel, scoop=False, dark=True)
        place(echo_b, sig, start, 0.55, 0.22)

    for beat, midi, dur, vel in score["arp"]:
        place(arp_b, lead_voice(midi, dur * 0.6, vel, scoop=False, dark=True), beat, 0.18, 0.26)

    for bar, chord in enumerate(seq):
        if bar == BARS - 1:
            dur_beats = 3.92
        else:
            dur_beats = 3.85
        left, right = pad_tone(ROOTS[chord] + 12, dur_beats * 0.6)
        start = sample_at(bar * 4)
        end = min(N, start + len(left))
        pad_b[0, start:end] += left[: end - start] * 0.055
        pad_b[1, start:end] += right[: end - start] * 0.055

    for i, (bar, beat, vel) in enumerate(score["sparks"]):
        place(spark_b, spark(vel), bar * 4 + beat, -0.35 if i % 2 == 0 else 0.4, 0.20)

    dry = drums + bass_b + pluck_b + lead_b + echo_b + arp_b + pad_b + spark_b
    send = (pluck_b + lead_b + echo_b) * 0.55 + drums * 0.18
    send = np.stack((lowpass(send[0], 5000), lowpass(send[1], 5000)))
    wet = np.zeros_like(dry)
    taps = ((0.017, 0.20), (0.029, 0.15), (0.043, 0.11), (0.061, 0.08), (0.083, 0.055), (0.119, 0.035))
    for i, (dt, g) in enumerate(taps):
        d = int(dt * SR)
        src_l = send[0] if i % 2 == 0 else send[1]
        src_r = send[1] if i % 2 == 0 else send[0]
        wet[0, d:] += src_l[:-d] * g
        wet[0, :d] += src_l[-d:] * g
        wet[1, d:] += src_r[:-d] * g
        wet[1, :d] += src_r[-d:] * g
    mix = dry + wet * 0.85

    # Compresión leve: el tema se oye presente sin convertirse en un concierto.
    mag = np.abs(mix)
    thresh, ratio = 0.38, 1.8
    over = mag > thresh
    squeezed = thresh + (mag - thresh) / ratio
    mix = np.where(over, np.sign(mix) * squeezed, mix)

    mix = mix - np.mean(mix, axis=1, keepdims=True)
    mix = np.tanh(mix * 1.05)
    peak = float(np.max(np.abs(mix)))
    if peak > 0:
        mix *= 0.9 / peak

    stems = {
        "drums": float(np.sqrt(np.mean(drums ** 2))),
        "bass": float(np.sqrt(np.mean(bass_b ** 2))),
        "pluck": float(np.sqrt(np.mean(pluck_b ** 2))),
        "lead": float(np.sqrt(np.mean(lead_b ** 2))),
        "echo": float(np.sqrt(np.mean(echo_b ** 2))),
        "arp": float(np.sqrt(np.mean(arp_b ** 2))),
        "pad": float(np.sqrt(np.mean(pad_b ** 2))),
        "spark": float(np.sqrt(np.mean(spark_b ** 2))),
    }
    return mix.astype(np.float32), stems, score, seq


def write_wav(path: str, audio: np.ndarray) -> None:
    pcm = np.clip(audio, -1, 1)
    interleaved = (pcm.T * 32767.0).astype(np.int16)
    with wave.open(path, "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(interleaved.tobytes())


def qa_images(audio: np.ndarray, score: dict, seq: list[str]) -> None:
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "pylibs"))
        from PIL import Image, ImageDraw
    except Exception as exc:
        print("sin imagen de control:", exc)
        return
    roll = Image.new("RGB", (48 * 28 + 40, 360), (16, 18, 32))
    d = ImageDraw.Draw(roll)
    lo, hi = 40, 90

    def y_of(midi: float) -> int:
        return int(340 - (midi - lo) / (hi - lo) * 320)

    for bar in range(BARS):
        x = 36 + bar * 28
        col = (28, 32, 52) if bar % 2 == 0 else (22, 26, 44)
        d.rectangle((x, 16, x + 28, 344), fill=col)
        if bar % 8 == 0:
            d.line((x, 16, x, 344), fill=(80, 90, 120))
    colors = {
        "pluck": (255, 150, 190),
        "bass": (255, 203, 61),
        "lead": (120, 255, 235),
        "echo": (170, 140, 255),
        "arp": (255, 255, 255),
    }
    for beat, midi, dur, vel, _glide in score["bass"]:
        x = 36 + beat / 4 * 28
        d.rectangle((x, y_of(midi) - 2, x + max(2, dur / 4 * 28), y_of(midi) + 2), fill=colors["bass"])
    for beat, midi, dur, vel in score["pluck"]:
        x = 36 + beat / 4 * 28
        d.point((x, y_of(midi)), fill=colors["pluck"])
    for bar, beat, midi, dur, vel in score["lead"]:
        x = 36 + (bar * 4 + beat) / 4 * 28
        d.rectangle((x, y_of(midi) - 2, x + max(2, dur / 4 * 28), y_of(midi) + 2), fill=colors["lead"])
    for bar, beat, midi, dur, vel in score["echo"]:
        x = 36 + (bar * 4 + beat) / 4 * 28
        d.line((x, y_of(midi) - 1, x + 6, y_of(midi) - 1), fill=colors["echo"])
    roll.save("/tmp/theme_roll.png")

    wave_img = Image.new("RGB", (1200, 280), (14, 16, 28))
    wd = ImageDraw.Draw(wave_img)
    mono = audio.mean(axis=0)
    step = len(mono) // 1180
    for i in range(1180):
        chunk = mono[i * step : (i + 1) * step]
        amp = float(np.max(np.abs(chunk))) if len(chunk) else 0
        h = amp * 120
        wd.line((10 + i, 140 - h, 10 + i, 140 + h), fill=(150, 255, 230))
    wave_img.save("/tmp/theme_wave.png")

    join = np.concatenate([mono[-SR:], mono[:SR]])
    zoom = Image.new("RGB", (1200, 200), (14, 16, 28))
    zd = ImageDraw.Draw(zoom)
    step = len(join) // 1180
    for i in range(1180):
        chunk = join[i * step : (i + 1) * step]
        amp = float(np.max(np.abs(chunk))) if len(chunk) else 0
        h = amp * 80
        col = (255, 180, 90) if abs(i - 590) < 8 else (150, 255, 230)
        zd.line((10 + i, 100 - h, 10 + i, 100 + h), fill=col)
    zd.line((600, 0, 600, 200), fill=(255, 80, 80))
    zoom.save("/tmp/theme_join.png")

    # Espectrograma de los primeros 16 compases y de la carga (16-32).
    def spec_img(start_s, dur_s, path):
        a = mono[int(start_s * SR) : int((start_s + dur_s) * SR)]
        win = 2048
        hop = 512
        window = np.hanning(win)
        cols = 1 + (len(a) - win) // hop
        rows = 420
        spec = np.zeros((rows, cols))
        freqs = np.fft.rfftfreq(win, 1 / SR)
        band = freqs <= 4000
        for i in range(cols):
            frame = a[i * hop : i * hop + win] * window
            mag = np.abs(np.fft.rfft(frame))[band]
            # Agrupa a 420 bandas logarítmicas.
            idx = np.clip((np.log2(freqs[band] + 40) - np.log2(40)) / (np.log2(4040) - np.log2(40)) * (rows - 1), 0, rows - 1).astype(int)
            for b, v in zip(idx, mag):
                spec[b, i] = max(spec[b, i], v)
        spec = np.log1p(spec)
        spec /= spec.max() + 1e-9
        img = np.zeros((rows, cols, 3), dtype=np.uint8)
        img[:, :, 1] = (spec * 210).astype(np.uint8)
        img[:, :, 2] = (spec * 180).astype(np.uint8)
        img[:, :, 0] = (spec ** 2 * 80).astype(np.uint8)
        Image.fromarray(img[::-1]).resize((1100, 320), Image.NEAREST).save(path)

    spec_img(0, 19.2, "/tmp/theme_spec_a.png")
    spec_img(38.4, 19.2, "/tmp/theme_spec_b.png")
    print("qa", seq[0], "->", seq[-1])


def main() -> None:
    audio, stems, score, seq = render()
    out = os.path.join(os.path.dirname(__file__), "theme.wav")
    write_wav(out, audio)
    rms = float(np.sqrt(np.mean(audio ** 2)))
    peak = float(np.max(np.abs(audio)))
    jump = float(np.max(np.abs(audio[:, 0] - audio[:, -1])))
    deriv = np.abs(np.diff(audio[0]))
    print(f"samples {audio.shape[1]}  dur {audio.shape[1] / SR:.2f}s  peak {peak:.3f}  rms {rms:.3f} ({20 * math.log10(rms):.1f} dBFS)")
    print(f"loop jump {jump:.5f}  p99 deriv {np.percentile(deriv, 99):.5f}  max deriv {deriv.max():.4f}")
    print("stems", " ".join(f"{k}={v:.4f}" for k, v in stems.items()))
    print("lead notes", len(score["lead"]), "pluck", len(score["pluck"]), "bass", len(score["bass"]))
    print("wrote", out, os.path.getsize(out))
    qa_images(audio, score, seq)


if __name__ == "__main__":
    main()
