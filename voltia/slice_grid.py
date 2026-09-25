#!/usr/bin/env python3
"""Corte DETERMINISTA de una hoja completa generada en UNA sola imagen.

La hoja se genera como una rejilla de celdas separadas por franjas de verde
puro (#00FF00). Como el fondo es cromático y uniforme, el corte NO depende de
heurísticas de separación de figuras: se detectan las franjas vacías y cada
celda sale por geometría.

Uso:
    python3 voltia/slice_grid.py voltia/raw/sheet_golpes.png --cols 6 --rows 7 \
        --out voltia/cells/golpes

Salida:
    <out>/c<RR><CC>.png   celdas recortadas al contenido (fondo verde intacto)
    <out>/grid.json       informe (bandas, tamaños, huecos vacíos, avisos)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

BG = (0, 255, 0)


def bg_mask(img, tol=34):
    """True donde el pixel es fondo verde puro."""
    px = img.convert("RGB").load()
    w, h = img.size
    m = bytearray(w * h)
    i = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # verde dominante y muy saturado
            m[i] = 1 if (g > 150 and r < 90 and b < 90 and
                         abs(r - BG[0]) < tol + 40 and abs(b - BG[2]) < tol + 40) else 0
            i += 1
    return m


def bands(mask, w, h, axis, thr=0.985, min_len=6):
    """Bandas de CONTENIDO a lo largo de un eje (axis='row'|'col')."""
    n = h if axis == "row" else w
    other = w if axis == "row" else h
    counts = [0] * n
    for i in range(n):
        c = 0
        if axis == "row":
            base = i * w
            for j in range(other):
                c += 1 - mask[base + j]
        else:
            for j in range(other):
                c += 1 - mask[j * w + i]
        counts[i] = c
    # una línea de banda tiene contenido si mas del (1-thr) de su longitud NO es fondo
    limit = max(2, int(other * (1 - thr)))
    is_content = [counts[i] > limit for i in range(n)]
    out, s = [], None
    for i in range(n):
        if is_content[i] and s is None:
            s = i
        elif not is_content[i] and s is not None:
            if i - s >= min_len:
                out.append((s, i - 1))
            s = None
    if s is not None and n - s >= min_len:
        out.append((s, n - 1))
    return out


def merge_bands(bs, gap=0):
    out = []
    for a, b in bs:
        if out and a - out[-1][1] - 1 <= gap:
            out[-1] = (out[-1][0], b)
        else:
            out.append((a, b))
    return out


def slice_sheet(path, cols, rows, tol=34, thr=0.985, pad=4):
    img = Image.open(path).convert("RGB")
    W, H = img.size
    mask = bg_mask(img, tol)
    row_bands = merge_bands(bands(mask, W, H, "row", thr), gap=max(4, H // (rows * 12)))
    report = {
        "image": os.path.basename(path),
        "size": [W, H],
        "expected": [cols, rows],
        "row_bands": row_bands,
        "cells": [],
        "warnings": [],
    }
    if len(row_bands) != rows:
        report["warnings"].append(
            f"filas detectadas {len(row_bands)} != {rows} (se usan las detectadas)")
    cells = []
    for ri, (y0, y1) in enumerate(row_bands):
        # columnas dentro de esta banda
        sub = []
        for y in range(y0, y1 + 1):
            pass
        col_counts = [0] * W
        for x in range(W):
            c = 0
            for y in range(y0, y1 + 1):
                c += 1 - mask[y * W + x]
            col_counts[x] = c
        limit = max(2, int((y1 - y0 + 1) * (1 - thr)))
        is_content = [col_counts[x] > limit for x in range(W)]
        col_bands, s = [], None
        for x in range(W):
            if is_content[x] and s is None:
                s = x
            elif not is_content[x] and s is not None:
                if x - s >= 6:
                    col_bands.append((s, x - 1))
                s = None
        if s is not None and W - s >= 6:
            col_bands.append((s, W - 1))
        col_bands = merge_bands(col_bands, gap=max(4, W // (cols * 12)))
        if len(col_bands) != cols:
            report["warnings"].append(
                f"fila {ri}: columnas detectadas {len(col_bands)} != {cols}")
        for ci, (x0, x1) in enumerate(col_bands):
            cells.append({
                "row": ri, "col": ci,
                "bbox": [max(0, x0 - pad), max(0, y0 - pad),
                         min(W, x1 + pad), min(H, y1 + pad)],
                "w": x1 - x0 + 1, "h": y1 - y0 + 1,
            })
    report["cells"] = cells
    return img, report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tol", type=int, default=34)
    ap.add_argument("--thr", type=float, default=0.985)
    a = ap.parse_args()

    img, rep = slice_sheet(a.sheet, a.cols, a.rows, tol=a.tol, thr=a.thr)
    os.makedirs(a.out, exist_ok=True)
    for c in rep["cells"]:
        x0, y0, x1, y1 = c["bbox"]
        cell = img.crop((x0, y0, x1, y1))
        cell.save(os.path.join(a.out, f"c{c['row']}{c['col']}.png"))
    with open(os.path.join(a.out, "grid.json"), "w") as f:
        json.dump(rep, f, indent=1)
    print(f"{rep['image']} {rep['size']} -> {len(rep['cells'])} celdas "
          f"({len(rep['row_bands'])} filas)")
    ws = [c["w"] for c in rep["cells"]]
    hs = [c["h"] for c in rep["cells"]]
    if ws:
        print(f"  celda ancho  min/med/max = {min(ws)}/{sum(ws)//len(ws)}/{max(ws)}")
        print(f"  celda alto   min/med/max = {min(hs)}/{sum(hs)//len(hs)}/{max(hs)}")
    for w in rep["warnings"]:
        print("  AVISO:", w)


if __name__ == "__main__":
    main()
