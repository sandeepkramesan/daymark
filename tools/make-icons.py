#!/usr/bin/env python3
"""Generate Dayline PNG app icons from the same geometry as logo.svg.

Run from the project root:  python tools/make-icons.py

The SVG stays the favicon; PNGs are needed for Android/Chrome installs, maskable
launcher icons (content inside the 80% safe circle) and iOS home-screen icons.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BG = "#050505"
INK = "#F5F5F5"
ACCENT = "#ED1C2E"
SUPERSAMPLE = 4


def rounded_line(draw, start, end, width, fill):
    """A line with round caps (PIL only draws butt caps)."""
    draw.line([start, end], fill=fill, width=width)
    radius = width / 2
    for x, y in (start, end):
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=fill)


def draw_mark(size, content_scale=1.0):
    """Draw the Dayline mark on a transparent square canvas."""
    canvas = size * SUPERSAMPLE
    unit = canvas / 64  # logo.svg uses a 64x64 viewBox

    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def at(value):
        """Map a viewBox coordinate (0-64) onto the canvas, scaled about centre."""
        return (canvas / 2) + (value * unit - canvas / 2) * content_scale

    stroke = max(1, round(2.6 * unit * content_scale))
    thin = max(1, round(2.2 * unit * content_scale))

    # Calendar body
    draw.rounded_rectangle(
        [at(8), at(13), at(56), at(57)],
        radius=8 * unit * content_scale,
        outline=INK,
        width=stroke,
    )

    # Binder rings
    tick_width = max(1, round(3 * unit * content_scale))
    for x in (20, 44):
        rounded_line(draw, (at(x), at(8)), (at(x), at(20)), tick_width, INK)

    # Red accent dot
    radius = 3.4 * unit * content_scale
    cx, cy = at(49), at(19)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=ACCENT)

    # Clock face
    radius = 11.5 * unit * content_scale
    cx, cy = at(32), at(36)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=INK, width=thin)

    # Clock hands
    hand_width = max(1, round(1.8 * unit * content_scale))
    rounded_line(draw, (cx, cy), (cx, at(30)), hand_width, INK)
    rounded_line(draw, (cx, cy), (at(37), cy), hand_width, INK)

    # Sun rays: short strokes just outside the clock face
    ray_width = max(1, round(1.8 * unit * content_scale))
    rays = [
        ((32, 20), (32, 24)),
        ((32, 48), (32, 52)),
        ((16, 36), (20, 36)),
        ((44, 36), (48, 36)),
        ((20.7, 24.7), (23.5, 27.5)),
        ((40.5, 44.5), (43.3, 47.3)),
        ((43.3, 24.7), (40.5, 27.5)),
        ((23.5, 44.5), (20.7, 47.3)),
    ]
    for (x0, y0), (x1, y1) in rays:
        rounded_line(draw, (at(x0), at(y0)), (at(x1), at(y1)), ray_width, INK)

    return image.resize((size, size), Image.LANCZOS)


def compose(size, content_scale=1.0):
    """Opaque black square with the mark centred."""
    background = Image.new("RGBA", (size, size), BG)
    background.alpha_composite(draw_mark(size, content_scale))
    return background.convert("RGB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "icon-192.png": compose(192, 0.94),
        "icon-512.png": compose(512, 0.94),
        # Maskable: keep everything inside the 80% safe circle.
        "icon-512-maskable.png": compose(512, 0.62),
        "apple-touch-icon.png": compose(180, 0.9),
    }
    for name, image in outputs.items():
        path = OUT / name
        image.save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(OUT.parent)} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
