#!/usr/bin/env python3
"""Compone el prompt de una hoja completa a partir de sheets.json.

Una sola fuente de verdad para el prompt: evita que se cuelen descripciones
de otra animacion (error ya cometido en lotes anteriores).

Uso:
    python3 voltia/gen_sheet.py golpes          # imprime el prompt
    python3 voltia/gen_sheet.py golpes --check  # solo lista celdas
"""
from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "sheets.json")))


def build_prompt(sheet_id):
    sh = CFG["sheets"][sheet_id]
    cols, rows = sh["cols"], sh["rows"]
    grid = sh["grid"]
    assert len(grid) == rows, f"grid filas {len(grid)} != {rows}"
    lines = []
    lines.append(
        f"2D fighting game sprite sheet, {sh['orientation']} "
        f"with a strict grid of exactly {cols} columns and {rows} rows "
        f"({cols * rows} cells), all cells perfectly aligned and the same size, "
        f"with wide empty green gutters between every cell.")
    lines.append(
        "Background: pure flat #00FF00 green covering the whole canvas from edge "
        "to edge, perfectly uniform, absolutely nothing else on the background.")
    lines.append(
        "No borders, no frames, no text, no numbers, no labels, no arrows, no "
        "drop shadows, no gradients, no second character, no props, no effects.")
    lines.append(f"CHARACTER (identical in every single cell): {CFG['identity_block']}")
    lines.append(f"STYLE: {CFG['style_block']}")
    lines.append(
        "The LARGE FAT YELLOW ZIGZAG LIGHTNING BOLT on the chest MUST be clearly "
        "visible in EVERY cell, no exceptions. Same head size, same proportions "
        "(exactly seven heads tall), same palette and same outline weight in every cell.")
    lines.append(
        "WIDE EMPTY GREEN GUTTERS: leave a large empty green gap between every pair "
        "of neighbouring cells, horizontally AND vertically, at least half the height "
        "of a character. No figure may ever touch or cross a gutter; the ponytail, "
        "the fists and the feet stay inside their own cell. No ground shadow, no "
        "floor line, no puddle: each figure floats inside empty green.")
    lines.append(
        "All frames show the full body from the side, facing and attacking to the "
        "RIGHT, feet near the bottom of each cell, whole figure inside its own cell, "
        "nothing cropped, silhouettes never touching between neighbouring cells, "
        "each figure standing on its own invisible ground line inside the cell.")
    lines.append("Cell contents, left to right, top to bottom:")
    for ri, row in enumerate(grid):
        parts = []
        for ci, item in enumerate(row):
            n = ri * cols + ci + 1
            if item is None:
                parts.append(f"[{n}] completely empty green, no character")
                continue
            anim, idx = item.split(":")
            desc = CFG["animations"][anim]["frames"][int(idx)]
            parts.append(f"[{n}] {CFG['animations'][anim]['label']} frame {int(idx) + 1}: {desc}")
        lines.append(f"Row {ri + 1}: " + "; ".join(parts) + ".")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if a.check:
        sh = CFG["sheets"][a.sheet]
        filled = sum(1 for row in sh["grid"] for c in row if c)
        print(f"{a.sheet}: {sh['cols']}x{sh['rows']} = {sh['cols'] * sh['rows']} celdas, "
              f"{filled} con personaje")
        return
    print(build_prompt(a.sheet))


if __name__ == "__main__":
    main()
