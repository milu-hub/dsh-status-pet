"""Synthesize the pet's rubber-duck squeak and write a WAV file.

The character comes from three layers: a fast up-then-down pitch bend in the
duck's register, a couple of fixed formants that make it reedy rather than
beepy, and a short noise "breath" at the squeak's release. Played back it reads
as the classic squeeze-toy squeak.

Usage: python tools/make_squeak.py
"""

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100
DURATION = 0.185
# Repo root, derived from this file so the script runs from any checkout.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "assets", "squeak.wav")

random.seed(20260930)

count = int(SAMPLE_RATE * DURATION)
samples = []

# Pitch contour: rise fast like a squeezed bulb, then fall away.
PITCH_START = 780.0
PITCH_PEAK = 1750.0
PITCH_END = 900.0

# Formants (frequency, relative gain) give the squeak its rubbery timbre.
FORMANTS = ((1500.0, 1.0), (2400.0, 0.55), (3600.0, 0.22))

phase = 0.0
for index in range(count):
    t = index / count

    # Amplitude: very fast attack, smooth decay, plus a small tremolo.
    attack = min(1.0, t / 0.045)
    decay = math.exp(-6.2 * t)
    envelope = attack * decay
    if t > 0.86:
        envelope *= max(0.0, (1.0 - t) / 0.14)
    tremolo = 0.9 + 0.1 * math.sin(2 * math.pi * 58.0 * t)

    if t < 0.34:
        frequency = PITCH_START + (PITCH_PEAK - PITCH_START) * (t / 0.34) ** 0.72
    else:
        u = (t - 0.34) / 0.66
        frequency = PITCH_PEAK + (PITCH_END - PITCH_PEAK) * u**0.9

    phase += 2 * math.pi * frequency / SAMPLE_RATE
    if phase > 2 * math.pi:
        phase -= 2 * math.pi

    value = 0.0
    for formant, gain in FORMANTS:
        value += gain * math.sin(phase * (formant / frequency) + formant * 0.001)
    # A touch of the fundamental keeps the body of the squeak audible.
    value += 0.45 * math.sin(phase)
    value /= 2.22

    # Airy release noise, strongest in the first and last fifth.
    if t < 0.2 or t > 0.7:
        value += (random.random() * 2 - 1) * 0.055 * (1.0 - abs(0.5 - t) * 1.4)

    samples.append(max(-1.0, min(1.0, value * envelope * tremolo * 0.92)))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with wave.open(OUT, "wb") as handle:
    handle.setnchannels(1)
    handle.setsampwidth(2)
    handle.setframerate(SAMPLE_RATE)
    frames = b"".join(struct.pack("<h", int(sample * 32000)) for sample in samples)
    handle.writeframes(frames)

print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes, {DURATION * 1000:.0f} ms)")
