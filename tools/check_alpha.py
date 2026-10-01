"""Report the alpha profile of the renderer's cut-out artwork.

Usage: python tools/check_alpha.py [path-to-sticker.png]
"""

import os
import sys

import numpy as np
from PIL import Image

# Repo root, derived from this file so the script runs from any checkout.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".shots", "pet-sticker.png")
img = Image.open(path).convert("RGBA")
a = np.asarray(img)
alpha = a[:, :, 3]
print("size:", img.size)
print("fully transparent: %.1f%%" % (100.0 * (alpha == 0).mean()))
print("fully opaque:      %.1f%%" % (100.0 * (alpha == 255).mean()))
print("partial:           %.1f%%" % (100.0 * ((alpha > 0) & (alpha < 255)).mean()))

# Where does the artwork live? Row/column occupancy of visible pixels.
visible = alpha > 128
rows = np.nonzero(visible.any(axis=1))[0]
cols = np.nonzero(visible.any(axis=0))[0]
print("visible box: x %d..%d  y %d..%d" % (cols[0], cols[-1], rows[0], rows[-1]))

for name, bg in (("dark", (24, 28, 40, 255)), ("light", (246, 247, 250, 255))):
    canvas = Image.new("RGBA", img.size, bg)
    canvas.alpha_composite(img)
    out = path.replace(".png", f"-on-{name}.png")
    canvas.convert("RGB").save(out)
    print("wrote", out)
