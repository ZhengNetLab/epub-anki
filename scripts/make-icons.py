"""Regenerate the app icons in public/ from design/icon-source.webp (square, >= 512 px).

Usage: python scripts/make-icons.py
- icon-192.png / icon-512.png   standard ("any") icons, the artwork as-is
- icon-maskable-512.png         Android adaptive icon: artwork shrunk to 82% so it stays
                                inside the 80% safe zone launchers never crop, margin filled
                                with a blurred extension of the artwork's own background
- apple-touch-icon.png (180)    iPhone/iPad home screen (opaque; iOS rounds the corners)
- favicon.png (64)              browser tab
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parent.parent
src = Image.open(root / "design" / "icon-source.webp").convert("RGB")
pub = root / "public"


def square(size: int) -> Image.Image:
    return src.resize((size, size), Image.LANCZOS)


def edge_gradient(size: int) -> Image.Image:
    """Smooth background continuing the artwork's own edge colours (3x3 samples, bicubic)."""
    w, h = src.size
    px = lambda x, y: src.getpixel((min(max(x, 0), w - 1), min(max(y, 0), h - 1)))
    xs, ys = (4, w // 2, w - 5), (4, h // 2, h - 5)
    grid = Image.new("RGB", (3, 3))
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            if i == 1 and j == 1:  # centre: average of the edge midpoints, not the artwork
                mids = [px(w // 2, 4), px(w // 2, h - 5), px(4, h // 2), px(w - 5, h // 2)]
                grid.putpixel((1, 1), tuple(sum(c[k] for c in mids) // 4 for k in range(3)))
            else:
                grid.putpixel((i, j), px(x, y))
    return grid.resize((size, size), Image.BICUBIC).filter(ImageFilter.GaussianBlur(size * 0.03))


def maskable(size: int, scale: float = 0.82) -> Image.Image:
    bg = edge_gradient(size)
    inner = int(size * scale)
    art = src.resize((inner, inner), Image.LANCZOS)
    # Anchor the artwork to the bottom edge (the body runs off it, as in the original) and
    # feather only the top, left and right edges into the gradient.
    mask = Image.new("L", (inner, inner + inner), 0)
    pad = int(inner * 0.05)
    ImageDraw.Draw(mask).rectangle((pad, pad, inner - pad, inner * 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(pad * 0.8)).crop((0, 0, inner, inner))
    bg.paste(art, ((size - inner) // 2, size - inner), mask)
    return bg


square(512).save(pub / "icon-512.png", optimize=True)
square(192).save(pub / "icon-192.png", optimize=True)
square(180).save(pub / "apple-touch-icon.png", optimize=True)
square(64).save(pub / "favicon.png", optimize=True)
maskable(512).save(pub / "icon-maskable-512.png", optimize=True)
print("icons written to", pub)
