"""Draw a pitch-contour comparison sheet for the squeak candidates.

Each panel plots the dominant frequency over time, so the "shape" of every
candidate can be compared at a glance before listening.

Usage: python tools/squeak_spectrogram.py
Writes app/assets/squeak-candidates/contours.png
"""

import glob
import os
import wave

import numpy as np
from PIL import Image, ImageDraw

# Repo root, derived from this file so the script runs from any checkout.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATE_DIR = os.path.join(ROOT, "app", "assets", "squeak-candidates")
OUT = os.path.join(CANDIDATE_DIR, "contours.png")

PANEL_W = 360
PANEL_H = 120
GAP = 12
LABEL_H = 26
COLS = 2


def contour(path):
    """Return (times in ms, dominant Hz, peak level)."""
    with wave.open(path, "rb") as handle:
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    data = np.frombuffer(frames, dtype="<i2").astype(np.float64) / 32768.0

    window = 1024
    hop = 256
    times = []
    pitches = []
    spectra = []
    bands = []
    for start in range(0, max(1, len(data) - window), hop):
        chunk = data[start : start + window] * np.hanning(window)
        spectrum = np.abs(np.fft.rfft(chunk))
        freqs = np.fft.rfftfreq(window, 1 / rate)
        band = (freqs > 300) & (freqs < 6000)
        times.append(start / rate * 1000)
        spectra.append(spectrum)
        bands.append(band)
        pitches.append(freqs[band][np.argmax(spectrum[band])])
    # Only trust windows that actually carry energy: the quiet tail of a sound
    # would otherwise report the loudest noise bin as a "pitch".
    pitches = np.array(pitches)
    levels = np.array([spectrum[band].max() for spectrum, band in zip(spectra, bands)])
    pitches[levels < max(1e-6, levels.max() * 0.12)] = np.nan
    return np.array(times), pitches, float(np.abs(data).max())


files = sorted(glob.glob(os.path.join(CANDIDATE_DIR, "*.wav")))
rows = (len(files) + COLS - 1) // COLS
canvas = Image.new("RGB", (COLS * PANEL_W + (COLS + 1) * GAP, rows * (PANEL_H + LABEL_H) + (rows + 1) * GAP), (18, 22, 31))
draw = ImageDraw.Draw(canvas)

for index, path in enumerate(files):
    column = index % COLS
    row = index // COLS
    x0 = GAP + column * (PANEL_W + GAP)
    y0 = GAP + row * (PANEL_H + LABEL_H + GAP)

    times, pitches, peak = contour(path)
    draw.rectangle([x0, y0 + LABEL_H, x0 + PANEL_W, y0 + LABEL_H + PANEL_H], fill=(27, 33, 48), outline=(52, 62, 84))

    # Frequency axis: 300..3000 Hz
    low, high = 300.0, 3000.0
    for freq in (500, 1000, 2000, 3000):
        y = y0 + LABEL_H + PANEL_H - (freq - low) / (high - low) * PANEL_H
        draw.line([x0, y, x0 + PANEL_W, y], fill=(42, 50, 68))
        draw.text((x0 + 4, y - 12), f"{freq}", fill=(110, 122, 148))

    span = max(1.0, float(times[-1])) if len(times) else 1.0
    points = []
    for time, pitch in zip(times, pitches):
        if np.isnan(pitch):
            continue
        px = x0 + time / span * PANEL_W
        py = y0 + LABEL_H + PANEL_H - (min(high, max(low, pitch)) - low) / (high - low) * PANEL_H
        points.append((px, py))
    if len(points) > 1:
        draw.line(points, fill=(96, 165, 250), width=3)

    draw.text((x0 + 2, y0 + 4), f"{os.path.basename(path)}   {span:.0f} ms   peak {peak:.2f}", fill=(232, 236, 246))

canvas.save(OUT)
print("wrote", OUT, canvas.size)
