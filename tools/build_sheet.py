#!/usr/bin/env python3
"""Recorta una hoja de 20 poses (5 columnas x 4 filas) en frames de un lienzo fijo.

Es el método aceptado para el modelo nuevo: **una sola hoja**, una sola
escala y un solo suelo. Todos los frames salen del mismo factor, así que no
hay deriva de tamaño entre poses.

La hoja lleva fondo verde plano en los pasillos y alrededor de cada figura.
No se recorta pose a pose ni se reescala cada frame por separado.

Uso:
    PYTHONPATH=tools/pylibs python3 tools/build_sheet.py \
        voltia/nueva/idle/src/sheet_idle.png voltia/nueva/idle 200 240 238

    argumentos: <hoja> <carpeta_salida> <ancho> <alto> <fila_del_suelo>

Después de recortar, si el brazo o el guante salen manchados, se pasa
tools/fix_gloves.py (solo en los frames revisados a mano).

Ojo con el factor: se calcula con la figura de la primera celda, como en el
pipeline anterior. Un píxel de diferencia en el alto de esa figura mueve el
factor un 0,4 %, y entonces los frames no cuadran al píxel con los de otra
tirada. Por eso una animación no se mezcla nunca con frames de dos hojas.
"""

import os
import sys

from PIL import Image

# Paleta congelada del modelo (ver voltia/guide/style.json).
PALETTE = [
    (10, 8, 20), (16, 20, 54), (27, 34, 80),
    (16, 96, 104), (23, 147, 141), (31, 177, 164),
    (60, 15, 95), (85, 21, 124), (186, 104, 232),
    (120, 16, 80), (190, 25, 130),
    (196, 120, 84), (240, 176, 132),
    (176, 112, 36), (250, 210, 50), (255, 255, 255),
]


def is_green(px):
    r, g, b = px[:3]
    return g > 150 and r < 100 and b < 120 and g > r + 80 and g > b + 80


def snap(im):
    """Lleva cada píxel al color más cercano de la paleta (mantiene alfa)."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    cache = {}
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                px[x, y] = (0, 0, 0, 0)
                continue
            key = p[:3]
            if key not in cache:
                cache[key] = min(
                    PALETTE,
                    key=lambda c: (c[0] - key[0]) ** 2 + (c[1] - key[1]) ** 2 + (c[2] - key[2]) ** 2,
                )
            px[x, y] = cache[key] + (255,)
    return im


def rows_of_cells(im, ncol=5):
    """Separa la hoja en filas usando los pasillos verdes completos."""
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    solid = [all(is_green(px[x, y]) for x in range(w)) for y in range(h)]
    spans, start = [], None
    for y, green in enumerate(solid):
        if green and start is None:
            start = y
        elif not green and start is not None:
            if y - start >= 8:
                spans.append((start, y - 1))
            start = None
    if start is not None and h - start >= 8:
        spans.append((start, h - 1))
    bounds = [0] + [(a + b) // 2 for a, b in spans] + [h]
    step = w / ncol
    xs = [round(i * step) for i in range(ncol + 1)]
    return [[im.crop((xs[i], bounds[j], xs[i + 1], bounds[j + 1]))
             for i in range(ncol)] for j in range(len(bounds) - 1)]


def cut_figure(cell):
    """Recorta la figura dentro de su celda y deja verde -> transparente."""
    cell = cell.convert('RGBA')
    px = cell.load()
    w, h = cell.size
    for y in range(h):
        for x in range(w):
            if is_green(px[x, y]):
                px[x, y] = (0, 0, 0, 0)
    box = cell.getbbox()
    return cell.crop(box) if box else cell


def build(sheet, outdir, cw, ch, ground, ncol=5, nrows=4, write=True):
    im = Image.open(sheet)
    grid = rows_of_cells(im, ncol)
    if len(grid) != nrows:
        raise SystemExit('la hoja dio %d filas, se esperaban %d' % (len(grid), nrows))
    figs = [cut_figure(grid[j][i]) for j in range(nrows) for i in range(ncol)]
    factor = (cw * 0.0 + 200) / figs[0].height   # 200 px = 170 cm con coleta
    out = []
    for k, fig in enumerate(figs):
        w, h = max(1, round(fig.width * factor)), max(1, round(fig.height * factor))
        fig = snap(fig.resize((w, h), Image.NEAREST))
        px = fig.load()
        feet = [x for y in range(max(0, h - 5), h) for x in range(w) if px[x, y][3]]
        cx = sum(feet) / len(feet) if feet else w / 2
        frame = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        frame.alpha_composite(fig, (round(cw / 2 - cx), ground - h))
        out.append(frame)
        if write:
            os.makedirs(outdir, exist_ok=True)
            frame.save(os.path.join(outdir, '%02d.png' % k))
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) < 5:
        raise SystemExit(__doc__)
    sheet, outdir = args[0], args[1]
    cw, ch, ground = int(args[2]), int(args[3]), int(args[4])
    frames = build(sheet, outdir, cw, ch, ground)
    print('%s -> %s: %d frames de %dx%d, suelo %d'
          % (sheet, outdir, len(frames), cw, ch, ground))
