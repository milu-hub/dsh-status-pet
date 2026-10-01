"""Verify every source file decodes as UTF-8 and report non-ASCII counts.

Usage: python tools/check_encoding.py
"""

import glob
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATTERNS = [
    os.path.join(ROOT, "app", "src", "**", "*.*"),
    os.path.join(ROOT, "tools", "*.*"),
    os.path.join(ROOT, "*.md"),
    os.path.join(ROOT, "*.cmd"),
]
EXTS = (".js", ".css", ".html", ".json", ".md", ".ps1", ".py", ".cmd")

problems = 0
for pattern in PATTERNS:
    for path in glob.glob(pattern, recursive=True):
        if not path.endswith(EXTS):
            continue
        with open(path, "rb") as handle:
            data = handle.read()
        try:
            data.decode("utf-8")
            valid = True
        except UnicodeDecodeError as error:
            valid = False
            print(f"INVALID {path}: {error}")
        non_ascii = sum(1 for byte in data if byte > 127)
        if not valid:
            problems += 1
        elif non_ascii:
            print(f"{os.path.relpath(path, ROOT)}: non-ascii bytes {non_ascii}")

print(f"\n{problems} file(s) with invalid encoding")
