"""Build the application icons from the pet artwork.

Produces:
  - `app/assets/app.ico`   multi-resolution Windows icon for the window and taskbar
  - `app/assets/icon.png`  256px PNG icon (also usable by Electron directly)
  - `app/assets/tray.png`  32px tray icon, cropped to the pet's face so the
                           silhouette still reads at 16px

Usage: python tools/make_app_icon.py
"""

import os

import numpy as np
from PIL import Image

# Repo root, derived from this file so the script runs from any checkout.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC = os.path.join(ROOT, "image.png")
ASSET_DIR = os.path.join(ROOT, "app", "assets")
PAD = 8

os.makedirs(ASSET_DIR, exist_ok=True)
src = Image.open(SRC).convert("RGBA")
print("source:", src.size)


def subject_box(image):
    """Bounding box of the drawn pixels."""
    alpha = np.asarray(image)[:, :, 3]
    visible = alpha > 96
    rows = np.nonzero(visible.any(axis=1))[0]
    cols = np.nonzero(visible.any(axis=0))[0]
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


# --- Icons -------------------------------------------------------------------
# Square, with the pet centred: the icon is used by the taskbar and the window
# frame, where a bottom-right anchored subject would look off-centre.
left, top, right, bottom = subject_box(src)
pet = src.crop((max(0, left - PAD), max(0, top - PAD), min(src.width, right + PAD), min(src.height, bottom + PAD)))
print("trimmed subject:", pet.size)

side = max(pet.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.alpha_composite(pet, ((side - pet.width) // 2, (side - pet.height) // 2))

icon_path = os.path.join(ASSET_DIR, "icon.png")
square.resize((256, 256), Image.LANCZOS).save(icon_path, optimize=True)
print("icon.png:", os.path.getsize(icon_path), "bytes")

ico_path = os.path.join(ASSET_DIR, "app.ico")
square.save(ico_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("app.ico:", os.path.getsize(ico_path), "bytes")

# --- Tray --------------------------------------------------------------------
# The face is the recognisable part at 16-32px, so crop the head out of the
# overlay asset (which keeps the subject in its bottom-right corner).
overlay = Image.open(os.path.join(ASSET_DIR, "pet.png")).convert("RGBA")
oleft, otop, oright, obottom = subject_box(overlay)
subject_w = oright - oleft
subject_h = obottom - otop
head_w = int(subject_w * 0.86)
head_h = int(subject_h * 0.62)
face = overlay.crop(
    (
        max(0, oright - head_w),
        min(overlay.height - 1, otop + int(subject_h * 0.24)),
        oright,
        min(overlay.height, otop + int(subject_h * 0.24) + head_h),
    )
)
tray = Image.new("RGBA", (max(face.size),) * 2, (0, 0, 0, 0))
tray.alpha_composite(face, ((tray.width - face.width) // 2, (tray.height - face.height) // 2))
tray = tray.resize((32, 32), Image.LANCZOS)
tray_path = os.path.join(ASSET_DIR, "tray.png")
tray.save(tray_path, optimize=True)
print("tray.png:", os.path.getsize(tray_path), "bytes", "from face", face.size)
