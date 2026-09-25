#!/usr/bin/env python3
"""Instala una hoja completa (UNA imagen -> rejilla -> frames) en el pipeline.

Toma las celdas cortadas por fit_grid.py, las agrupa por animacion segun el
layout de sheets.json y las pasa por el mismo canon que las tiras: chroma,
paleta congelada, escala unica y puerta QA.

Alineacion: el modelo dibuja cada figura con los pies en el borde inferior de
su celda (medido: hueco inferior 0-2 px, salvo las figuras aereas, que se
quedan flotando). Por eso cada frame conserva el ALTO COMPLETO de la celda
(solo se recorta en horizontal): asi la linea de suelo es comun y los saltos
siguen en el aire.

Uso:
    python3 voltia/install_sheet.py golpes --variant c2            # informe
    python3 voltia/install_sheet.py golpes --variant c2 --apply    # instala
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from build_sheet import load_and_key, FRAMES                        # noqa: E402
from normalize import (load_spec, estimate_pixel_size, detect_head_px,   # noqa: E402
                       normalize_strip, qa_check_strip)

CFG = json.load(open(os.path.join(HERE, "sheets.json")))
# altura de pie del nuevo canon (hojas completas)
NEW_STANDING = 148.0


def cell_path(d, i, ncols):
    return os.path.join(d, f"c{i // ncols}{i % ncols}.png")


def build_strip(frames, pad=22):
    w = sum(f.width for f in frames) + pad * (len(frames) + 1)
    h = max(f.height for f in frames) + pad * 2
    out = Image.new("RGBA", (w, h), (0, 255, 0, 0))
    x = pad
    for f in frames:
        out.alpha_composite(f, (x, pad))
        x += f.width + pad
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--variant", default="c1")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    spec = load_spec()
    d = os.path.join(HERE, "cells", f"sheet_{a.sheet}_{a.variant}")
    rep = json.load(open(os.path.join(d, "grid.json")))
    ncols = rep["grid"][0]
    sh = CFG["sheets"][a.sheet]
    if [sh["cols"], sh["rows"]] != rep["grid"]:
        raise SystemExit(f"rejilla detectada {rep['grid']} != pedida "
                         f"{[sh['cols'], sh['rows']]}")
    flat = [it for row in sh["grid"] for it in row]
    groups = {}
    for i, item in enumerate(flat):
        if item is None:
            continue
        anim, idx = item.split(":")
        groups.setdefault(anim, []).append((int(idx), i))
    empty = [c["i"] for c in rep["cells"] if c["empty"]]
    print(f"hoja {a.sheet}_{a.variant}: rejilla {rep['grid']}, vacias {empty}")

    # --- celdas: chroma + recorte horizontal al bbox (alto completo) ---
    cells = {}
    for anim, items in groups.items():
        items = sorted(items)
        out = []
        for (_, i) in items:
            k = load_and_key(cell_path(d, i, ncols))
            bb = k.getbbox()
            if not bb:
                print(f"  AVISO celda {i} vacia tras el chroma")
                continue
            crop = k.crop((max(0, bb[0] - 1), 0, min(k.width, bb[2] + 1), k.height))
            out.append(crop)
        cells[anim] = out

    # --- escala unica de hoja: altura de pie del grupo de referencia ---
    ref_anim = sh.get("ref_anim") or sorted(groups)[0]
    ref_h = [f.getbbox()[3] - f.getbbox()[1] for f in cells[ref_anim]]
    med = statistics.median(ref_h)
    strip_s = estimate_pixel_size(cells[ref_anim][len(ref_h) // 2])[0]
    scale = NEW_STANDING / (med / strip_s)
    print(f"  escala de hoja {scale:.4f} (ref {ref_anim}: figura {med:.0f}px -> "
          f"{NEW_STANDING:.0f}px-arte, pixel={strip_s})")

    for anim in sorted(cells):
        frames = cells[anim]
        s = estimate_pixel_size(frames[len(frames) // 2])[0]
        heads = [detect_head_px(f) for f in frames]
        keyed = build_strip(frames)
        verdict, notes = qa_check_strip(anim, keyed, frames, len(frames), spec,
                                        s, scale, heads, "sheet")
        # En hoja el recorte es al bbox de la figura: el aviso de "corte en
        # borde de split" no aplica (no hay split, hay recorte).
        notes = [n for n in notes if not n[1].startswith("posible corte")]
        verdict = "RECHAZAR" if any(l == "RECHAZAR" for l, _ in notes) else (
            "AVISO" if notes else "OK")
        fig = [round((f.getbbox()[3] - f.getbbox()[1]) * scale / s) for f in frames]
        det = "; ".join(m for _, m in notes)
        print(f"  {anim:16s} {len(frames)}f pixel={s} fig_arte={fig} | {verdict} {det}")
        if not a.apply or verdict == "RECHAZAR":
            continue
        norm = normalize_strip(frames, spec, s, scale=scale)
        os.makedirs(FRAMES, exist_ok=True)
        for k, f in enumerate(norm):
            f.save(os.path.join(FRAMES, f"voltia_{anim}_{k}.png"))
        print(f"    -> instalados {len(norm)} frames")


if __name__ == "__main__":
    main()
