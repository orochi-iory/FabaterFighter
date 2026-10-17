#!/usr/bin/env python3
"""Tema de Voltia, «Puerto Voltaje».

Cumbia electrónica ligera en la menor, a 108 BPM, 48 compases (1:46).
El pulso no cambia: el mismo bombo, la misma palmada y el mismo
fondo de corcheas de principio a fin. El motivo de tres notas
(mi–sol–la) es su nombre, VOL-TI-A. El sol sostenido y la cadencia
andaluza son el acento mexicano. El último compás es dominante y
resuelve en el primero.

Dependencia: numpy. Escribe voltia/theme.wav (PCM 16-bit estéreo).
"""

from __future__ import annotations

import math
import os
import wave

import numpy as np

SR = 44100
BPM = 108
BARS = 48
BEAT_SEC = 60 / BPM
BEAT_SAMPLES = int(round(BEAT_SEC * SR))  # 24500
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
    sig = (body * 0.92 + click * 0.28) * vel
    sig[:120] *= np.linspace(0.0, 1.0, 120)
    return sig


def rim(vel: float) -> np.ndarray:
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * math.pi * 1480 * t) * np.exp(-t * 46)
    noise = highpass(RNG.uniform(-1, 1, n), 2200) * np.exp(-t * 70)
    sig = (tone * 0.7 + noise * 0.45) * vel
    sig[:80] *= np.linspace(0.0, 1.0, 80)
    return sig


def hat(vel: float, open_: bool) -> np.ndarray:
    dur = 0.14 if open_ else 0.045
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = highpass(RNG.uniform(-1, 1, n), 6000)
    decay = 18 if open_ else 55
    sig = noise * np.exp(-t * decay) * vel
    sig[:60] *= np.linspace(0.0, 1.0, 60)
    return sig


def clap(vel: float) -> np.ndarray:
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    noise = highpass(RNG.uniform(-1, 1, n), 1200)
    env = np.zeros(n)
    for delay, amp in ((0.0, 1.0), (0.008, 0.7), (0.015, 0.4)):
        d = int(delay * SR)
        env[d:] += amp * np.exp(-t[: n - d] * 36)
    tone = np.sin(2 * math.pi * 980 * t) * np.exp(-t * 40) * 0.25
    sig = (noise * env + tone) * vel
    sig[:80] *= np.linspace(0.0, 1.0, 80)
    return sig


def shaker(vel: float) -> np.ndarray:
    n = int(0.04 * SR)
    t = np.arange(n) / SR
    noise = lowpass(highpass(RNG.uniform(-1, 1, n), 3500), 9000)
    sig = noise * np.exp(-t * 48) * vel
    sig[:40] *= np.linspace(0.0, 1.0, 40)
    return sig


def stab(midis: tuple[int, ...], vel: float) -> np.ndarray:
    """Acorde corto del fondo electrónico. Mismo ataque en todo el tema."""
    n = int(0.11 * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for m in midis:
        phase = 2 * math.pi * midi_hz(m) * t
        for k in range(1, 5):
            sig += (1.0 / k) * np.sin(phase * k)
    peak = float(np.max(np.abs(sig))) or 1.0
    sig = lowpass(sig / peak, 1600)
    sig *= np.exp(-t * 26)
    atk = min(n, int(0.004 * SR))
    if atk > 1:
        sig[:atk] *= np.linspace(0.0, 1.0, atk)
    return sig * vel


def guiro_tick(vel: float, accent: bool) -> np.ndarray:
    dur = 0.055 if accent else 0.028
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = RNG.uniform(-1, 1, n)
    # El raspado: un pasa-banda estrecho que sube un poco.
    center = 1800 + (900 if accent else 400)
    band = lowpass(highpass(noise, center * 0.55), center * 1.8)
    scrape = np.sin(np.linspace(0, math.pi, n)) ** 1.4
    sig = band * scrape * vel
    nfade = min(len(sig), 40)
    sig[:nfade] *= np.linspace(0.0, 1.0, nfade)
    return sig


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
    out[:80] *= np.linspace(0.0, 1.0, 80)
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


def cell(offset, notes):
    return [(b + offset, beat, midi, dur, vel) for b, beat, midi, dur, vel in notes]


# Frases en corcheas. El pulso no se estira ni se encoge entre secciones.
MOTIF = [
    (0, 0.00, 76, 0.40, 0.92),
    (0, 0.50, 79, 0.40, 0.84),
    (0, 1.00, 81, 0.62, 0.96),
    (0, 2.00, 76, 0.38, 0.70),
    (0, 2.50, 84, 0.38, 0.78),
    (0, 3.00, 81, 0.38, 0.72),
    (0, 3.50, 76, 0.38, 0.68),
    (1, 0.00, 76, 0.38, 0.80),
    (1, 0.50, 79, 0.38, 0.76),
    (1, 1.00, 81, 0.55, 0.86),
    (1, 2.00, 83, 0.38, 0.66),
    (1, 2.50, 81, 0.38, 0.64),
    (1, 3.00, 79, 0.38, 0.62),
    (1, 3.50, 76, 0.38, 0.60),
    (2, 0.00, 74, 0.38, 0.78),
    (2, 0.50, 76, 0.38, 0.74),
    (2, 1.00, 74, 0.38, 0.70),
    (2, 1.50, 71, 0.45, 0.76),
    (2, 2.50, 67, 0.38, 0.62),
    (2, 3.00, 71, 0.38, 0.64),
    (2, 3.50, 74, 0.38, 0.66),
    (3, 0.00, 71, 0.38, 0.72),
    (3, 0.50, 69, 0.38, 0.64),
    (3, 1.00, 67, 0.50, 0.74),
    (3, 2.00, 69, 0.38, 0.60),
    (3, 2.50, 71, 0.38, 0.64),
    (3, 3.00, 74, 0.42, 0.68),
    (3, 3.50, 71, 0.38, 0.60),
    (4, 0.00, 72, 0.38, 0.80),
    (4, 0.50, 69, 0.34, 0.66),
    (4, 1.00, 65, 0.38, 0.64),
    (4, 1.50, 69, 0.38, 0.70),
    (4, 2.00, 72, 0.50, 0.78),
    (4, 3.00, 74, 0.38, 0.66),
    (4, 3.50, 72, 0.38, 0.62),
    (5, 0.00, 76, 0.38, 0.76),
    (5, 0.50, 74, 0.38, 0.68),
    (5, 1.00, 72, 0.50, 0.74),
    (5, 2.00, 69, 0.38, 0.60),
    (5, 2.50, 65, 0.38, 0.56),
    (5, 3.00, 69, 0.38, 0.60),
    (5, 3.50, 72, 0.38, 0.62),
    (6, 0.00, 76, 0.36, 0.86),
    (6, 0.50, 68, 0.32, 0.70),
    (6, 1.00, 71, 0.36, 0.74),
    (6, 1.50, 76, 0.50, 0.86),
    (6, 2.50, 74, 0.34, 0.64),
    (6, 3.00, 71, 0.32, 0.60),
    (6, 3.50, 68, 0.36, 0.62),
    (7, 0.00, 71, 0.36, 0.68),
    (7, 0.50, 69, 0.32, 0.58),
    (7, 1.00, 68, 0.36, 0.64),
    (7, 1.50, 64, 0.48, 0.70),
    (7, 2.50, 68, 0.34, 0.60),
    (7, 3.00, 71, 0.34, 0.62),
    (7, 3.50, 76, 0.36, 0.66),
]

CHARGE = [
    (0, 0.00, 69, 0.40, 0.78),
    (0, 0.50, 72, 0.40, 0.76),
    (0, 1.00, 76, 0.40, 0.82),
    (0, 1.50, 81, 0.52, 0.90),
    (0, 2.50, 76, 0.38, 0.70),
    (0, 3.00, 72, 0.38, 0.66),
    (0, 3.50, 69, 0.38, 0.62),
    (1, 0.00, 79, 0.40, 0.84),
    (1, 0.50, 76, 0.40, 0.74),
    (1, 1.00, 72, 0.48, 0.72),
    (1, 2.00, 76, 0.38, 0.70),
    (1, 2.50, 79, 0.40, 0.76),
    (1, 3.00, 76, 0.38, 0.68),
    (1, 3.50, 72, 0.38, 0.64),
    (2, 0.00, 74, 0.40, 0.78),
    (2, 0.50, 71, 0.38, 0.68),
    (2, 1.00, 67, 0.48, 0.70),
    (2, 2.00, 71, 0.38, 0.64),
    (2, 2.50, 74, 0.40, 0.70),
    (2, 3.00, 79, 0.42, 0.78),
    (2, 3.50, 74, 0.38, 0.64),
    (3, 0.00, 76, 0.38, 0.84),
    (3, 0.50, 71, 0.34, 0.66),
    (3, 1.00, 68, 0.38, 0.70),
    (3, 1.50, 76, 0.50, 0.84),
    (3, 2.50, 74, 0.34, 0.62),
    (3, 3.00, 71, 0.32, 0.60),
    (3, 3.50, 68, 0.38, 0.64),
    (4, 0.00, 69, 0.38, 0.74),
    (4, 0.50, 72, 0.38, 0.76),
    (4, 1.00, 76, 0.38, 0.82),
    (4, 1.50, 81, 0.55, 0.94),
    (4, 2.50, 79, 0.38, 0.72),
    (4, 3.00, 76, 0.38, 0.68),
    (4, 3.50, 72, 0.38, 0.64),
    (5, 0.00, 79, 0.38, 0.80),
    (5, 0.50, 76, 0.38, 0.72),
    (5, 1.00, 72, 0.48, 0.70),
    (5, 2.00, 76, 0.38, 0.68),
    (5, 2.50, 79, 0.42, 0.76),
    (5, 3.00, 76, 0.38, 0.66),
    (5, 3.50, 72, 0.38, 0.62),
    (6, 0.00, 81, 0.42, 0.84),
    (6, 0.50, 77, 0.38, 0.70),
    (6, 1.00, 72, 0.42, 0.66),
    (6, 2.00, 69, 0.48, 0.68),
    (6, 2.50, 72, 0.38, 0.64),
    (6, 3.00, 77, 0.38, 0.70),
    (6, 3.50, 81, 0.38, 0.74),
    (7, 0.00, 76, 0.38, 0.78),
    (7, 0.50, 71, 0.34, 0.66),
    (7, 1.00, 80, 0.42, 0.84),
    (7, 1.50, 76, 0.38, 0.70),
    (7, 2.50, 74, 0.34, 0.60),
    (7, 3.00, 71, 0.34, 0.60),
    (7, 3.50, 68, 0.36, 0.64),
]

FIGHT = [
    (0, 0.00, 76, 0.40, 0.86),
    (0, 0.50, 72, 0.40, 0.74),
    (0, 1.00, 69, 0.40, 0.78),
    (0, 1.50, 76, 0.50, 0.90),
    (0, 2.50, 81, 0.38, 0.80),
    (0, 3.00, 79, 0.38, 0.68),
    (0, 3.50, 76, 0.38, 0.66),
    (1, 0.00, 79, 0.40, 0.82),
    (1, 0.50, 76, 0.40, 0.74),
    (1, 1.00, 72, 0.46, 0.72),
    (1, 2.00, 76, 0.38, 0.70),
    (1, 2.50, 79, 0.40, 0.76),
    (1, 3.00, 76, 0.38, 0.68),
    (1, 3.50, 72, 0.38, 0.64),
    (2, 0.00, 74, 0.40, 0.78),
    (2, 0.50, 71, 0.38, 0.68),
    (2, 1.00, 67, 0.46, 0.70),
    (2, 2.00, 71, 0.38, 0.64),
    (2, 2.50, 74, 0.40, 0.72),
    (2, 3.00, 79, 0.40, 0.78),
    (2, 3.50, 74, 0.38, 0.64),
    (3, 0.00, 76, 0.38, 0.84),
    (3, 0.50, 71, 0.34, 0.66),
    (3, 1.00, 68, 0.38, 0.70),
    (3, 1.50, 76, 0.48, 0.86),
    (3, 2.50, 74, 0.34, 0.62),
    (3, 3.00, 71, 0.32, 0.60),
    (3, 3.50, 68, 0.36, 0.64),
    (4, 0.00, 72, 0.38, 0.80),
    (4, 0.50, 69, 0.36, 0.68),
    (4, 1.00, 65, 0.40, 0.66),
    (4, 1.50, 69, 0.42, 0.72),
    (4, 2.50, 72, 0.38, 0.70),
    (4, 3.00, 77, 0.38, 0.74),
    (4, 3.50, 72, 0.38, 0.64),
    (5, 0.00, 74, 0.38, 0.76),
    (5, 0.50, 71, 0.38, 0.66),
    (5, 1.00, 67, 0.46, 0.72),
    (5, 2.00, 71, 0.38, 0.64),
    (5, 2.50, 74, 0.40, 0.70),
    (5, 3.00, 79, 0.38, 0.74),
    (5, 3.50, 74, 0.38, 0.62),
    (6, 0.00, 76, 0.38, 0.84),
    (6, 0.50, 68, 0.32, 0.68),
    (6, 1.00, 71, 0.36, 0.72),
    (6, 1.50, 76, 0.48, 0.84),
    (6, 2.50, 74, 0.34, 0.60),
    (6, 3.00, 71, 0.32, 0.58),
    (6, 3.50, 68, 0.36, 0.62),
    (7, 0.00, 71, 0.36, 0.70),
    (7, 0.50, 68, 0.34, 0.64),
    (7, 1.00, 76, 0.42, 0.80),
    (7, 1.50, 71, 0.38, 0.66),
    (7, 2.50, 68, 0.34, 0.60),
    (7, 3.00, 64, 0.36, 0.58),
    (7, 3.50, 76, 0.34, 0.64),
]

TURN = [
    (0, 0.00, 76, 0.38, 0.82),
    (0, 0.50, 79, 0.38, 0.80),
    (0, 1.00, 81, 0.55, 0.90),
    (0, 2.00, 76, 0.38, 0.66),
    (0, 2.50, 84, 0.38, 0.72),
    (0, 3.00, 81, 0.38, 0.66),
    (0, 3.50, 76, 0.38, 0.62),
    (1, 0.00, 74, 0.38, 0.72),
    (1, 0.50, 71, 0.38, 0.66),
    (1, 1.00, 67, 0.50, 0.72),
    (1, 2.00, 71, 0.38, 0.60),
    (1, 2.50, 74, 0.38, 0.64),
    (1, 3.00, 71, 0.38, 0.60),
    (1, 3.50, 67, 0.38, 0.56),
    (2, 0.00, 72, 0.38, 0.76),
    (2, 0.50, 69, 0.36, 0.64),
    (2, 1.00, 65, 0.42, 0.66),
    (2, 2.00, 69, 0.38, 0.60),
    (2, 2.50, 72, 0.42, 0.66),
    (2, 3.00, 74, 0.38, 0.62),
    (2, 3.50, 72, 0.38, 0.58),
    (3, 0.00, 76, 0.38, 0.80),
    (3, 0.50, 71, 0.34, 0.64),
    (3, 1.00, 68, 0.38, 0.66),
    (3, 1.50, 64, 0.48, 0.70),
    (3, 2.50, 68, 0.34, 0.58),
    (3, 3.00, 71, 0.34, 0.60),
    (3, 3.50, 76, 0.36, 0.62),
    (4, 0.00, 76, 0.36, 0.82),
    (4, 0.50, 79, 0.36, 0.78),
    (4, 1.00, 81, 0.52, 0.90),
    (4, 2.00, 84, 0.40, 0.70),
    (4, 2.50, 81, 0.38, 0.66),
    (4, 3.00, 76, 0.38, 0.62),
    (4, 3.50, 72, 0.38, 0.58),
    (5, 0.00, 81, 0.42, 0.76),
    (5, 0.50, 77, 0.38, 0.66),
    (5, 1.00, 72, 0.42, 0.62),
    (5, 2.00, 69, 0.48, 0.64),
    (5, 2.50, 72, 0.38, 0.60),
    (5, 3.00, 65, 0.38, 0.56),
    (5, 3.50, 69, 0.38, 0.58),
    (6, 0.00, 71, 0.38, 0.70),
    (6, 0.50, 67, 0.36, 0.60),
    (6, 1.00, 74, 0.40, 0.66),
    (6, 2.00, 71, 0.38, 0.58),
    (6, 2.50, 67, 0.42, 0.60),
    (6, 3.00, 71, 0.38, 0.58),
    (6, 3.50, 74, 0.36, 0.56),
    (7, 0.00, 76, 0.38, 0.74),
    (7, 0.50, 74, 0.34, 0.62),
    (7, 1.00, 71, 0.36, 0.64),
    (7, 1.50, 68, 0.40, 0.66),
    (7, 2.00, 64, 0.42, 0.60),
    (7, 3.00, 68, 0.28, 0.50),
]


def build_score(seq: list[str]) -> dict:
    lead = (
        cell(0, MOTIF) + cell(8, MOTIF) + cell(16, CHARGE)
        + cell(24, FIGHT) + cell(32, MOTIF) + cell(40, TURN)
    )
    bass = []
    prev = None
    for bar, chord in enumerate(seq):
        root = ROOTS[chord]
        nxt = ROOTS[seq[(bar + 1) % BARS]]
        fifth = 44 if bar == BARS - 1 else root + 7  # sensible solo en el cierre
        events = [
            (0.00, root, 0.36, 0.94),
            (1.50, root + 12, 0.16, 0.58),
            (2.50, fifth, 0.28, 0.76),
            (3.50, nxt, 0.18, 0.62),
        ]
        for beat, midi, dur, vel in events:
            bass.append((bar * 4 + beat, midi, dur, vel, prev))
            prev = midi

    pluck = []
    pattern = ((0.00, 2), (0.75, 0), (1.50, 1), (2.25, 2), (2.75, 1), (3.25, 0))
    for bar, chord in enumerate(seq):
        tones = TONES[chord]
        for beat, deg in pattern:
            pluck.append((bar * 4 + beat, tones[deg], 0.28, 0.74))

    stab_notes = []
    pulse = []
    for bar, chord in enumerate(seq):
        low = tuple(n - 12 for n in TONES[chord])
        hi = TONES_HI[chord]
        for i, beat in enumerate((0.5, 1.5, 2.5, 3.5)):
            stab_notes.append((bar * 4 + beat, low, 0.78))
            pulse.append((bar * 4 + beat, hi[i % 3], 0.12, 0.42))

    return {"lead": lead, "bass": bass, "pluck": pluck, "stabs": stab_notes, "pulse": pulse}


def render() -> tuple[np.ndarray, dict]:
    seq = chords()
    score = build_score(seq)
    drums = np.zeros((2, N))
    bass_b = np.zeros((2, N))
    pluck_b = np.zeros((2, N))
    lead_b = np.zeros((2, N))
    stab_b = np.zeros((2, N))
    pulse_b = np.zeros((2, N))
    pad_b = np.zeros((2, N))

    # El mismo compás 48 veces. Nada entra ni se cae.
    for bar in range(BARS):
        base = bar * 4
        place(drums, kick(1.0), base, 0.0, 0.72)
        place(drums, kick(0.62), base + 1.5, 0.0, 0.50)
        place(drums, kick(0.48), base + 2.0, 0.0, 0.36)
        place(drums, clap(0.85), base + 1.0, 0.04, 0.22)
        place(drums, clap(0.72), base + 3.0, -0.04, 0.18)
        for i in range(16):
            beat = i * 0.25
            off = i in (2, 6, 10, 14)
            place(drums, hat(0.7 if off else 0.4, False), base + beat, 0.2, 0.055 if off else 0.032)
        for beat in (0.5, 1.5, 2.5, 3.5):
            place(drums, shaker(0.5), base + beat, 0.55, 0.038)
            place(drums, guiro_tick(0.55, False), base + beat, 0.36, 0.04)
        place(drums, rim(0.4), base + 0.5, -0.15, 0.07)

    prev_midi = None
    for beat, midi, dur, vel, glide in score["bass"]:
        glide_from = prev_midi if glide is not None and abs(glide - midi) <= 7 else None
        place(bass_b, bass_note(midi, dur * BEAT_SEC, vel, glide_from), beat, 0.0, 0.58)
        prev_midi = midi

    for beat, midi, dur, vel in score["pluck"]:
        place(pluck_b, karplus(midi_hz(midi), 0.28, vel), beat, -0.32, 0.36)

    prev_end = -9.0
    for bar, beat, midi, dur, vel in score["lead"]:
        start = bar * 4 + beat
        scoop = start - prev_end > 0.45
        place(lead_b, lead_voice(midi, dur * BEAT_SEC, vel, scoop, dark=False), start, -0.04, 0.30)
        place(lead_b, lead_voice(midi - 0.06, dur * BEAT_SEC, vel * 0.35, False, dark=True), start + 0.012, 0.28, 0.10)
        prev_end = start + dur

    for beat, midis, vel in score["stabs"]:
        place(stab_b, stab(midis, vel), beat, 0.22, 0.36)

    for beat, midi, dur, vel in score["pulse"]:
        place(pulse_b, lead_voice(midi, dur * BEAT_SEC, vel, scoop=False, dark=True), beat, 0.12, 0.08)

    for bar, chord in enumerate(seq):
        left, right = pad_tone(ROOTS[chord] + 12, 3.7 * BEAT_SEC)
        start = sample_at(bar * 4)
        end = min(N, start + len(left))
        pad_b[0, start:end] += left[: end - start] * 0.04
        pad_b[1, start:end] += right[: end - start] * 0.04

    dry = drums + bass_b + pluck_b + lead_b + stab_b + pulse_b + pad_b
    send = (pluck_b + lead_b + stab_b) * 0.45 + drums * 0.14
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
        "stab": float(np.sqrt(np.mean(stab_b ** 2))),
        "pulse": float(np.sqrt(np.mean(pulse_b ** 2))),
        "pad": float(np.sqrt(np.mean(pad_b ** 2))),
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
