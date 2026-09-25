#!/usr/bin/env python3
"""Hoja de contacto numerada de una hoja completa (para revisar antes de votar).

Uso:
    python3 voltia/montage.py basicos c2
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "sheets.json")))


def main(sheet, variant):
    d = os.path.join(HERE, "cells", f"sheet_{sheet}_{variant}")
    rep = json.load(open(os.path.join(d, "grid.json")))
    cols, rows = rep["grid"]
    src = Image.open(os.path.join(HERE, "raw", f"sheet_{sheet}_{variant}.png")).convert("RGB")
    S, ch, cw = 2, 170, 170
    W = cols * (cw + 8) + 8
    H = rows * (ch + 26) + 8
    m = Image.new("RGB", (W * S, H * S), (26, 24, 38))
    dr = ImageDraw.Draw(m)
    try:
        F = ImageFont.load_default(size=16)
    except Exception:
        F = ImageFont.load_default()
    flat = [it for row in CFG["sheets"][sheet]["grid"] for it in row]
    for c in rep["cells"]:
        i = c["i"]
        r, cx = divmod(i, cols)
        if c["empty"]:
            t = Image.new("RGB", (cw, ch), (60, 20, 20))
            ImageDraw.Draw(t).text((8, 8), "VACIA", fill=(255, 255, 255), font=F)
        else:
            x0, y0, x1, y1 = c["bbox"]
            t = src.crop((x0, y0, x1 + 1, y1 + 1))
            t = t.resize((max(1, int(t.width * ch / t.height)), ch), Image.NEAREST)
            bg = Image.new("RGB", (cw, ch), (26, 24, 38))
            bg.paste(t, ((cw - t.width) // 2, 0))
            t = bg
        px, py = 8 + cx * (cw + 8), 8 + r * (ch + 26)
        m.paste(t.resize((t.width * S, t.height * S), Image.NEAREST), (px * S, py * S))
        lab = f"{i}"
        if i < len(flat) and flat[i]:
            a, k = flat[i].split(":")
            lab += f" {a}:{int(k) + 1}"
        dr.text(((px + 4) * S, (py + ch + 4) * S), lab, fill=(255, 203, 61), font=F)
    out = os.path.join(HERE, f"diag_{sheet}_{variant}.png")
    m.save(out)
    print("montaje:", out, m.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "c1")
