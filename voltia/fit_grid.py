#!/usr/bin/env python3
"""Ajuste y corte de rejilla para hojas generadas en UNA sola imagen.

El modelo no siempre respeta el numero pedido de columnas/filas, pero SI que
dibuja una rejilla regular. Este modulo estima la rejilla real mirando los
valles del perfil de ocupacion y luego corta por geometria (cero heuristica
de separacion de figuras).

Uso:
    python3 voltia/fit_grid.py voltia/raw/sheet_golpes_c1.png --out voltia/cells/c1
"""
from __future__ import annotations

import argparse
import json
import os

from PIL import Image


def occ_maps(img, tol_green=True):
    """Perfiles de ocupacion (pixeles NO fondo) por columna y por fila."""
    W, H = img.size
    px = img.convert("RGB").load()
    col = [0] * W
    row = [0] * H
    for y in range(H):
        r_off = y * W
        for x in range(W):
            r, g, b = px[x, y]
            if g > 150 and r < 90 and b < 90:
                continue
            col[x] += 1
            row[y] += 1
    return col, row


def _window(v, c, half):
    a, b = max(0, c - half), min(len(v), c + half + 1)
    return a, b


def _merge_runs(runs, gap=9):
    out = []
    for a, b in runs:
        if out and a - out[-1][1] - 1 <= gap:
            out[-1] = (out[-1][0], b)
        else:
            out.append((a, b))
    return out


def find_gutters(prof, thr_frac=0.35, min_len=3):
    """Franjas vacias reales: tramos del perfil por debajo de thr_frac*mediana."""
    L = len(prof)
    med = sorted(prof)[L // 2]
    thr = max(2.0, thr_frac * med)
    runs, s = [], None
    for i in range(L):
        if prof[i] < thr:
            if s is None:
                s = i
        elif s is not None:
            if i - s >= min_len:
                runs.append((s, i - 1))
            s = None
    if s is not None and L - s >= min_len:
        runs.append((s, L - 1))
    return _merge_runs(runs), med, thr


def gutters_to_cuts(prof, thr_frac=0.35, min_len=3):
    runs, med, thr = find_gutters(prof, thr_frac, min_len)
    L = len(prof)
    cuts = [0]
    for a, b in runs:
        if a <= 1 or b >= L - 2:      # margen del lienzo, no gutter interno
            continue
        cuts.append((a + b) // 2)
    cuts.append(L)
    return cuts, runs, med, thr


def fit_axis(prof, nmin=3, nmax=14, search=0.18, verbose=False):
    """Rejilla real: primero gutters medidos; si no hay, ajuste periodico."""
    cuts_g, runs, med, thr = gutters_to_cuts(prof)
    if len(cuts_g) - 2 >= 2:
        if verbose:
            print(f"    gutters={runs} -> cortes={cuts_g[1:-1]}")
        return len(cuts_g) - 1, cuts_g, 0.0

    L = len(prof)
    mean = sum(prof) / L
    best = None
    for n in range(nmin, nmax + 1):
        if L / n < 45:
            continue
        step = L / n
        half = int(step * search)
        cuts = [0]
        acc = 0.0
        for k in range(1, n):
            nominal = int(round(k * step))
            a, b = _window(prof, nominal, half)
            m = min(range(a, b), key=lambda i: prof[i])
            cuts.append(m)
            acc += prof[m]
        cuts.append(L)
        score = (acc / max(1, (n - 1))) / max(1e-6, mean)
        score += 0.035 * n
        if verbose:
            print(f"    n={n:2d} score={score:.3f} cortes={cuts[1:-1]}")
        if best is None or score < best[2]:
            best = (n, cuts, score)
    return best


def cell_stats(img, box):
    """Figura dentro de una celda: bbox, alto, y presencia de rayo amarillo."""
    x0, y0, x1, y1 = box
    px = img.convert("RGB").load()
    minx, miny, maxx, maxy = x1, y1, x0, y0
    body = 0
    yellow = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            if g > 150 and r < 90 and b < 90:
                continue
            body += 1
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            if r > 150 and g > 120 and b < 120:
                yellow += 1
    if body == 0:
        return None
    return {
        "box": [x0, y0, x1, y1],
        "bbox": [minx, miny, maxx, maxy],
        "w": maxx - minx + 1,
        "h": maxy - miny + 1,
        "body": body,
        "fill": round(body / ((x1 - x0) * (y1 - y0)), 3),
        "yellow": yellow,
        "bolt": round(1000 * yellow / body, 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, default=0, help="fijar columnas (0 = auto)")
    ap.add_argument("--rows", type=int, default=0, help="fijar filas (0 = auto)")
    ap.add_argument("--pad", type=int, default=5)
    ap.add_argument("--uniform", action="store_true", help="corte uniforme estricto con --cols/--rows")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    img = Image.open(a.sheet).convert("RGB")
    W, H = img.size
    if a.uniform and a.cols and a.rows:
        # corte estrictamente uniforme (la rejilla pedida en el prompt)
        cuts_c = [int(round(k * W / a.cols)) for k in range(a.cols + 1)]
        cuts_r = [int(round(k * H / a.rows)) for k in range(a.rows + 1)]
        nc, nr = a.cols, a.rows
        sc = sr = 0.0
    else:
        col, row = occ_maps(img)
        nc, cuts_c, sc = fit_axis(col, verbose=a.verbose)
        nr, cuts_r, sr = fit_axis(row, verbose=a.verbose)
        if a.cols:
            nc, cuts_c, _ = fit_axis(col, nmin=a.cols, nmax=a.cols)
        if a.rows:
            nr, cuts_r, _ = fit_axis(row, nmin=a.rows, nmax=a.rows)
    print(f"{os.path.basename(a.sheet)} {W}x{H} -> rejilla {nc} cols x {nr} filas "
          f"({nc * nr} celdas)  score col={sc:.2f} row={sr:.2f}")

    os.makedirs(a.out, exist_ok=True)
    cells = []
    for ri in range(nr):
        y0 = max(0, cuts_r[ri] + a.pad)
        y1 = min(H, cuts_r[ri + 1] - a.pad)
        for ci in range(nc):
            x0 = max(0, cuts_c[ci] + a.pad)
            x1 = min(W, cuts_c[ci + 1] - a.pad)
            st = cell_stats(img, (x0, y0, x1, y1))
            idx = ri * nc + ci
            if st is None:
                cells.append({"i": idx, "row": ri, "col": ci, "empty": True})
                continue
            st.update({"i": idx, "row": ri, "col": ci, "empty": False})
            cells.append(st)
            img.crop((x0, y0, x1, y1)).save(os.path.join(a.out, f"c{ri}{ci}.png"))

    filled = [c for c in cells if not c["empty"]]
    hs = sorted(c["h"] for c in filled)
    ws = sorted(c["w"] for c in filled)
    bolts = sorted(c["bolt"] for c in filled)
    print(f"  celdas ocupadas {len(filled)}/{len(cells)}")
    if hs:
        print(f"  alto figura  min/med/max = {hs[0]}/{hs[len(hs)//2]}/{hs[-1]}")
        print(f"  ancho figura min/med/max = {ws[0]}/{ws[len(ws)//2]}/{ws[-1]}")
        print(f"  rayo (por 1000) min/med/max = {bolts[0]}/{bolts[len(bolts)//2]}/{bolts[-1]}")
        print(f"  celdas sin rayo (<3): "
              f"{[c['i'] for c in filled if c['bolt'] < 3]}")
        print(f"  vacias al final: {[c['i'] for c in cells if c['empty']][-12:]}")
    json.dump({"image": os.path.basename(a.sheet), "size": [W, H],
               "grid": [nc, nr], "cells": cells},
              open(os.path.join(a.out, "grid.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
