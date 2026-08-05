"""
Generate the backend-owned SynTask invoice logo PNG asset.

The source of truth is ``frontend/public/logo.svg`` (an angular circuit "S"
drawn from stroked paths, linear-gradient strokes and radial-gradient
terminals).  ReportLab cannot render SVG reliably and the project has no
``svglib`` dependency, so the invoice PDF generator embeds a transparent PNG
instead.

This script re-draws the SVG geometry with Pillow + numpy (both already
backend dependencies) at 4x supersampling and downscales to the native
720x769 canvas for clean anti-aliased edges.

Output: backend/app/assets/syntask-logo.png

Usage:
    python backend/scripts/generate_invoice_logo.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

OUTPUT = Path(__file__).resolve().parent.parent / "app" / "assets" / "syntask-logo.png"

# Canvas size from the SVG viewBox (720 x 769).
W, H = 720, 769
SCALE = 4
SW = 43.0  # stroke width used by the SVG paths

# Gradient stop colors copied from the SVG.
LINEAR_STOPS = [(0.00, "#B94A15"), (0.48, "#E56A1F"), (1.00, "#F8A26D")]
RADIAL_STOPS = [(0.00, "#F8A26D"), (0.72, "#E56A1F"), (1.00, "#B94A15")]
INNER_FILL = (0x41, 0x18, 0x07)  # #411807, drawn at 18% opacity

# The three stroked paths from the SVG.
PATHS = [
    [(615, 280), (363, 139), (255, 204), (254, 327), (477, 463), (476, 580), (362, 654), (115, 510)],
    [(141, 251), (141, 404), (365, 533)],
    [(347, 259), (580, 390), (580, 536)],
]
TERMINALS = [(615, 280), (141, 251), (580, 536), (115, 510)]

# userSpaceOnUse linear gradient axis from the SVG.
G0 = np.array((109.0, 656.0))  # stop 0   -> #B94A15
G1 = np.array((622.0, 126.0))  # stop 1   -> #F8A26D
GV = G1 - G0
GVLEN2 = float(GV @ GV)


def _hex_rgb(h):
    return np.asarray([int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)], dtype=float)


def color_at(stops, t):
    """Vectorized piecewise-linear RGB interpolation over the color stops at t in [0, 1]."""
    t = np.clip(t, 0.0, 1.0)
    out = np.zeros((*t.shape, 3), dtype=np.float64)
    last = len(stops) - 1
    for i in range(last):
        t0, c0 = stops[i]
        t1, c1 = stops[i + 1]
        mask = (t >= t0) & (t <= t1)
        if i == last - 1:
            mask |= t >= t1
        f = np.zeros_like(t)
        np.divide(t - t0, t1 - t0, out=f, where=(t1 > t0))
        out[mask] = _hex_rgb(c0) + (_hex_rgb(c1) - _hex_rgb(c0)) * f[mask][..., None]
    return out


def dist_to_segment(p, a, b):
    """Per-pixel distance to the segment a-b (vectorized over p)."""
    ab = b - a
    t = np.clip(((p - a) @ ab) / float(ab @ ab), 0.0, 1.0)
    proj = a + t[..., None] * ab
    return np.linalg.norm(p - proj, axis=-1)


def main() -> None:
    h, w = H * SCALE, W * SCALE
    yy, xx = np.mgrid[0:h, 0:w]
    pts = np.stack([xx.astype(np.float64), yy.astype(np.float64)], axis=-1) / SCALE

    rgb = np.zeros((h, w, 3), dtype=np.float64)
    alpha = np.zeros((h, w), dtype=np.float64)

    # Stroked paths (round caps/joins == union of disks around the path).
    stroke_mask = np.zeros((h, w), dtype=bool)
    for path in PATHS:
        for a, b in zip(path, path[1:]):
            stroke_mask |= dist_to_segment(pts, np.asarray(a, dtype=float), np.asarray(b, dtype=float)) <= SW / 2.0

    t_lin = np.clip(((pts - G0) @ GV) / GVLEN2, 0.0, 1.0)
    stroke_color = color_at(LINEAR_STOPS, t_lin)
    rgb[stroke_mask] = stroke_color[stroke_mask]
    alpha[stroke_mask] = 1.0

    # Terminal circles (drawn after the strokes, radial gradient per circle).
    for cx, cy in TERMINALS:
        center = np.asarray((float(cx), float(cy)))
        d = np.linalg.norm(pts - center, axis=-1)
        mask = d <= 29.0
        t_rad = d / 36.0  # matches the SVG gradient scale(36)
        rgb[mask] = color_at(RADIAL_STOPS, t_rad)[mask]
        alpha[mask] = 1.0

    # Subtle inset detail (18% opacity dark circles over the terminals).
    for cx, cy in TERMINALS:
        center = np.asarray((float(cx), float(cy)))
        d = np.linalg.norm(pts - center, axis=-1)
        mask = d <= 14.0
        rgb[mask] = rgb[mask] * (1.0 - 0.18) + np.asarray(INNER_FILL, dtype=float) * 0.18
        alpha[mask] = 1.0

    img = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    pil = Image.fromarray(img).resize((W, H), Image.Resampling.LANCZOS)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pil.save(OUTPUT, "PNG")
    print(f"Wrote {OUTPUT} ({W}x{H})")


if __name__ == "__main__":
    main()
