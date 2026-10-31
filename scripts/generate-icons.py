#!/usr/bin/env python3
"""Generate the PWA icons from the CinéScope brand mark (navy tile, pale blue C)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

NAVY = "#102e50"
ACCENT = "#b9e2f5"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
OUTPUT = Path(__file__).resolve().parent.parent / "icons"
SUPERSAMPLING = 4


def icon(size, maskable):
    canvas = size * SUPERSAMPLING
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if maskable:
        # Android crops to its own shape: full bleed, glyph inside the 80% safe zone.
        draw.rectangle((0, 0, canvas, canvas), fill=NAVY)
        glyph_ratio = 0.56
    else:
        draw.rounded_rectangle((0, 0, canvas - 1, canvas - 1), radius=canvas * 0.22, fill=NAVY)
        glyph_ratio = 0.72
    font = ImageFont.truetype(FONT, round(canvas * glyph_ratio))
    left, top, right, bottom = draw.textbbox((0, 0), "C", font=font)
    position = ((canvas - (right - left)) / 2 - left, (canvas - (bottom - top)) / 2 - top)
    draw.text(position, "C", font=font, fill=ACCENT)
    return image.resize((size, size), Image.LANCZOS)


OUTPUT.mkdir(exist_ok=True)
icon(192, False).save(OUTPUT / "icon-192.png", optimize=True)
icon(512, False).save(OUTPUT / "icon-512.png", optimize=True)
icon(512, True).save(OUTPUT / "icon-maskable-512.png", optimize=True)
