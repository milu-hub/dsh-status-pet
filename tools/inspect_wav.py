"""Describe short WAVs: duration, peak level, and the pitch trajectory over time.

Usage:
    python tools/inspect_wav.py                 # scan app/assets/squeak-candidates
    python tools/inspect_wav.py <file.wav> ...  # inspect specific files
"""

import glob
import os
import sys
import wave

import numpy as np

# Repo root, derived from this file so the script runs from any checkout.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DIR = os.path.join(ROOT, "app", "assets", "squeak-candidates")


def describe(path):
    with wave.open(path, "rb") as handle:
        rate = handle.getframerate()
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())

    assert width == 2, "expected 16-bit samples"
    data = np.frombuffer(frames, dtype="<i2").astype(np.float64)
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    data /= 32768.0

    window = 1024
    hop = 512
    pitches = []
    levels = []
    for start in range(0, max(1, len(data) - window), hop):
        chunk = data[start : start + window] * np.hanning(window)
        spectrum = np.abs(np.fft.rfft(chunk))
        freqs = np.fft.rfftfreq(window, 1 / rate)
        band = (freqs > 300) & (freqs < 6000)
        pitches.append(freqs[band][np.argmax(spectrum[band])])
        levels.append(spectrum[band].max())
    # Drop the quiet tail: without energy the loudest bin is just noise.
    values = np.array(pitches)
    strengths = np.array(levels)
    if strengths.max() > 0:
        values[strengths < strengths.max() * 0.12] = np.nan
    pitches = [value for value in values if not np.isnan(value)]

    name = os.path.basename(path)
    milliseconds = len(data) / rate * 1000
    peak = np.abs(data).max()
    if not pitches:
        print(f"{name:<20} {milliseconds:5.0f} ms  peak {peak:.2f}  (too quiet to measure)")
        return
    step = max(1, len(pitches) // 7)
    line = "  ".join(f"{value:4.0f}" for value in pitches[::step][:8])
    print(f"{name:<20} {milliseconds:5.0f} ms  peak {peak:.2f}  Hz: {line}")


targets = sys.argv[1:]
if not targets:
    targets = sorted(glob.glob(os.path.join(DEFAULT_DIR, "*.wav")))

print(f"{'file':<20} {'length':>8}  {'level':>9}  pitch trajectory (left to right)")
print("-" * 84)
for target in targets:
    describe(target)
