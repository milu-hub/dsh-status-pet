"""Generate a set of rubber-duck squeak candidates to pick from.

Each variant is synthesized from the same four ingredients, tuned differently:
a pitch contour (the squeeze), an amplitude envelope (the bulb), a formant set
(which decides "reedy duck" vs "plastic whistle"), and a breath of noise at the
release. Nothing is downloaded, so every candidate is reproducible.

Writes `app/assets/squeak-candidates/*.wav` plus an `audition.html` player.

Usage: python tools/make_squeak_variants.py
"""

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100
# Repo root, derived from this file so the script runs from any checkout.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "app", "assets", "squeak-candidates")

# --- synthesis ---------------------------------------------------------------


def piecewise(t, points):
    """Pitch at normalized time `t` from [(position, pitch), ...]."""
    for index in range(len(points) - 1):
        left_t, left_p = points[index]
        right_t, right_p = points[index + 1]
        if t <= right_t or index == len(points) - 2:
            span = max(1e-6, right_t - left_t)
            u = min(1.0, max(0.0, (t - left_t) / span))
            return left_p + (right_p - left_p) * u
    return points[-1][1]


def render(spec):
    """Render one variant to a list of floats in [-1, 1]."""
    random.seed(spec.get("seed", 1))
    count = int(SAMPLE_RATE * spec["duration"])
    samples = []
    phase = 0.0
    for index in range(count):
        t = index / count
        attack = min(1.0, t / spec["attack"]) if spec["attack"] > 0 else 1.0
        decay = math.exp(-spec["decay"] * t)
        envelope = attack * decay
        if spec.get("release", 0.0) > 0:
            if t > 1.0 - spec["release"]:
                envelope *= max(0.0, (1.0 - t) / spec["release"])
        if spec.get("tremolo_hz", 0.0) > 0:
            envelope *= 0.9 + 0.1 * math.sin(2 * math.pi * spec["tremolo_hz"] * t)

        frequency = max(60.0, piecewise(t, spec["pitch"]))
        phase += 2 * math.pi * frequency / SAMPLE_RATE
        if phase > 2 * math.pi:
            phase -= 2 * math.pi

        value = 0.0
        total_gain = 0.0
        for formant, gain in spec["formants"]:
            value += gain * math.sin(phase * (formant / frequency) + formant * 0.001)
            total_gain += gain
        value += spec.get("body", 0.45) * math.sin(phase)
        total_gain += spec.get("body", 0.45)
        value /= total_gain

        if spec.get("noise", 0.0) > 0:
            centre = spec.get("noise_centre", 0.4)
            value += (random.random() * 2 - 1) * spec["noise"] * (1.0 - abs(centre - t) * 1.4)

        samples.append(max(-1.0, min(1.0, value * envelope * spec.get("gain", 0.92))))
    return samples


def write_wav(path, samples):
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(b"".join(struct.pack("<h", int(value * 32000)) for value in samples))


# --- candidates --------------------------------------------------------------
# `pitch` is [(normalized time, Hz), ...]; `formants` are (Hz, relative gain).

FORMANT_REEDY = ((1500.0, 1.0), (2400.0, 0.55), (3600.0, 0.22))
FORMANT_WOODSY = ((900.0, 1.0), (1700.0, 0.7), (2900.0, 0.3))
FORMANT_THIN = ((2200.0, 1.0), (3300.0, 0.5), (4600.0, 0.25))
FORMANT_ROUND = ((1200.0, 1.0), (2000.0, 0.6), (3000.0, 0.3))

VARIANTS = [
    {
        "file": "01-classic",
        "note": "经典鸭叫：快速上扬再落下，最短最脆",
        "duration": 0.16,
        "pitch": [(0.0, 900.0), (0.28, 1900.0), (1.0, 1000.0)],
        "formants": FORMANT_REEDY,
        "attack": 0.04,
        "decay": 7.0,
        "release": 0.12,
        "tremolo_hz": 58.0,
        "noise": 0.05,
        "seed": 11,
    },
    {
        "file": "02-double-squeeze",
        "note": "捏两下：两个短促的吱吱，更俏皮",
        "duration": 0.30,
        "pitch": [(0.0, 850.0), (0.14, 1800.0), (0.30, 700.0), (0.44, 1750.0), (1.0, 900.0)],
        "formants": FORMANT_REEDY,
        "attack": 0.03,
        "decay": 3.6,
        "release": 0.10,
        "tremolo_hz": 0.0,
        "noise": 0.06,
        "seed": 12,
    },
    {
        "file": "03-deep-squeeze",
        "note": "肥胖捏捏乐：音区低、共鸣厚，适合大号桌宠",
        "duration": 0.22,
        "pitch": [(0.0, 420.0), (0.35, 980.0), (1.0, 520.0)],
        "formants": FORMANT_WOODSY,
        "attack": 0.06,
        "decay": 5.4,
        "release": 0.16,
        "tremolo_hz": 42.0,
        "noise": 0.04,
        "seed": 13,
    },
    {
        "file": "04-rising",
        "note": "越捏越紧：音高一路往上，带一点紧绷感",
        "duration": 0.19,
        "pitch": [(0.0, 700.0), (0.55, 1650.0), (1.0, 2100.0)],
        "formants": FORMANT_REEDY,
        "attack": 0.08,
        "decay": 4.2,
        "release": 0.22,
        "tremolo_hz": 64.0,
        "noise": 0.05,
        "noise_centre": 0.7,
        "seed": 14,
    },
    {
        "file": "05-howl",
        "note": "长鸣：慢起慢落，像被慢慢捏扁",
        "duration": 0.34,
        "pitch": [(0.0, 620.0), (0.22, 1500.0), (0.60, 1250.0), (1.0, 680.0)],
        "formants": FORMANT_ROUND,
        "attack": 0.14,
        "decay": 2.8,
        "release": 0.24,
        "tremolo_hz": 34.0,
        "noise": 0.07,
        "seed": 15,
    },
    {
        "file": "06-thin-whistle",
        "note": "细塑料哨音：音区高、Formant 高，尖锐但短",
        "duration": 0.13,
        "pitch": [(0.0, 1400.0), (0.30, 2600.0), (1.0, 1500.0)],
        "formants": FORMANT_THIN,
        "attack": 0.03,
        "decay": 9.0,
        "release": 0.10,
        "tremolo_hz": 70.0,
        "noise": 0.05,
        "seed": 16,
    },
    {
        "file": "07-bright-squeak",
        "note": "明亮吱声：中高音、衰减快，最像常见橡皮鸭",
        "duration": 0.15,
        "pitch": [(0.0, 1000.0), (0.25, 2100.0), (1.0, 1100.0)],
        "formants": FORMANT_REEDY,
        "attack": 0.05,
        "decay": 8.0,
        "release": 0.14,
        "tremolo_hz": 80.0,
        "noise": 0.06,
        "seed": 17,
    },
    {
        "file": "08-soft-squish",
        "note": "轻柔挤一下：整体音量小、起音软，适合不打扰",
        "duration": 0.20,
        "pitch": [(0.0, 760.0), (0.30, 1400.0), (1.0, 820.0)],
        "formants": FORMANT_ROUND,
        "attack": 0.12,
        "decay": 4.6,
        "release": 0.26,
        "tremolo_hz": 46.0,
        "noise": 0.09,
        "gain": 0.62,
        "seed": 18,
    },
]

# --- output ------------------------------------------------------------------

os.makedirs(OUT_DIR, exist_ok=True)
manifest = []
for variant in VARIANTS:
    samples = render(variant)
    path = os.path.join(OUT_DIR, f"{variant['file']}.wav")
    write_wav(path, samples)
    manifest.append((variant["file"], variant["note"], os.path.getsize(path)))
    print(f"{variant['file']:<18} {len(samples) / SAMPLE_RATE * 1000:5.0f} ms  {os.path.getsize(path):>6} bytes  {variant['note']}")

html = ["<!doctype html>", "<html lang=\"zh\"><head><meta charset=\"utf-8\">",
        "<title>橡皮鸭音效试听</title>",
        "<style>body{font-family:'Segoe UI','Microsoft YaHei UI',sans-serif;background:#12161f;color:#e8ecf6;padding:28px;max-width:760px;margin:0 auto}",
        "h1{font-size:20px;font-weight:600}p.hint{color:#93a0bb;font-size:13px}",
        "div.row{display:flex;align-items:center;gap:14px;padding:12px 14px;margin:8px 0;background:#1b2130;border-radius:10px}",
        "span.name{font-weight:600;min-width:170px}",
        "span.note{color:#93a0bb;font-size:13px;flex:1}",
        "audio{height:34px}button{background:#2b6cf6;border:0;color:#fff;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:13px}",
        "code{background:#0d1117;padding:2px 6px;border-radius:5px;font-size:12px}</style></head><body>",
        "<h1>橡皮鸭音效候选</h1>",
        "<p class=\"hint\">点播放逐个试听。选定后告诉我编号，我把 <code>app/assets/squeak.wav</code> 换成它，并把生成参数写进 <code>tools/make_squeak.py</code>。</p>"]
for name, note, _ in manifest:
    html.append(f"<div class=\"row\"><span class=\"name\">{name}</span><span class=\"note\">{note}</span>"
                f"<audio controls preload=\"none\" src=\"{name}.wav\"></audio></div>")
html.append("</body></html>")

with open(os.path.join(OUT_DIR, "audition.html"), "w", encoding="utf-8") as handle:
    handle.write("\n".join(html))

print(f"\n试听页面: {os.path.join(OUT_DIR, 'audition.html')}")
