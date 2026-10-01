"""Build the pet overlay asset from the supplied artwork.

The source is `image.png` (the cut-out artwork, already carrying an alpha
channel). The subject is placed on a larger transparent square canvas so the
widget gets a genuinely free top-left corner for the speech bubble: without that
padding the trimmed artwork fills the whole box and the bubble would have to
overlap the pet.

Layout of the produced `pet.png`:

    +---------------------------+
    | bubble area (empty)       |
    |                      +----|
    |                      |    |
    |                      | pet|
    +----------------------+----+

Usage: python tools/make_pet_asset.py
"""

import os

import numpy as np
from PIL import Image

# Repo root, derived from this file so the script runs from any checkout.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC = os.path.join(ROOT, "image.png")
OUT_DIR = os.path.join(ROOT, "app", "assets")
# Padding added left of and above the subject, as a fraction of the subject's
# width / height. This is the pocket the speech bubble occupies: the bubble
# column is everything left of the subject and its height the space above it, so
# the padding decides how large the bubble can be while touching the artwork.
PAD_RATIO = 0.42

os.makedirs(OUT_DIR, exist_ok=True)

src = Image.open(SRC).convert("RGBA")
print("source:", src.size, "alpha:", "yes" if src.getextrema()[3][0] < 255 else "no")

alpha = np.asarray(src)[:, :, 3]
visible = alpha > 96
rows = np.nonzero(visible.any(axis=1))[0]
cols = np.nonzero(visible.any(axis=0))[0]
subject = src.crop((int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1))
print("subject:", subject.size)

# A square canvas: the subject keeps its size, and the extra room is added to the
# left and the top only, which is exactly where the bubble goes.
pad_x = round(subject.width * PAD_RATIO)
pad_y = round(subject.height * PAD_RATIO)
canvas_side = max(subject.width + pad_x, subject.height + pad_y)
canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
canvas.alpha_composite(subject, (canvas_side - subject.width, canvas_side - subject.height))
print(
    "canvas: %dx%d  subject at x %d..%d y %d..%d  (free top-left %dx%d)"
    % (
        canvas.width,
        canvas.height,
        canvas.width - subject.width,
        canvas.width,
        canvas.height - subject.height,
        canvas.height,
        canvas.width - subject.width,
        canvas.height - subject.height,
    )
)


def export(image, height, name):
    width = max(1, round(image.width * height / image.height))
    resized = image.resize((width, height), Image.LANCZOS)
    path = os.path.join(OUT_DIR, name)
    resized.save(path, optimize=True)
    print(f"{name}: {resized.size} {os.path.getsize(path)} bytes")


export(canvas, 1024, "pet.png")
export(canvas, 2048, "pet@2x.png")
print(f"aspect W/H: {canvas.width / canvas.height:.4f}")

# Previews for reviewing the alpha against light and dark desktops.
master = Image.open(os.path.join(OUT_DIR, "pet.png")).convert("RGBA")
for name, background in (("preview-dark.png", (32, 36, 48, 255)), ("preview-light.png", (246, 247, 250, 255))):
    preview = Image.new("RGBA", master.size, background)
    preview.alpha_composite(master)
    preview.convert("RGB").save(os.path.join(OUT_DIR, name))
print("done")
