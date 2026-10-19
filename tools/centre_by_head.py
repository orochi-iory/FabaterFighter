#!/usr/bin/env python3
"""Centra los frames de una animación por el eje de la cabeza.

El generador no mantiene el cuerpo en el mismo sitio entre poses: en el idle
la cabeza se mueve 31 px de un frame a otro, así que la figura "baila" hacia
delante y hacia atrás. Centrar por los pies no lo arregla (los pies se mueven
solo 16 px y son la referencia de apoyo); el eje que se lee como identidad es
la cabeza.

Este script mide la máscara (el casco rosa) de cada frame, toma la x de su
caja como eje, y desplaza el frame entero en horizontal para que todos los
ejes caigan en la misma columna. No reescala, no recorta y no toca el suelo:
solo traslada píxeles enteros.

Uso:
    PYTHONPATH=tools/pylibs python3 tools/centre_by_head.py voltia/nueva/idle
    ... --target 128   # columna del eje (por defecto la mediana del propio set)
    ... --dry-run      # solo informa, no escribe
"""

import os
import statistics
import sys
from collections import deque

from PIL import Image

# Máscara del casco: rosa y su sombra.
MASK = {(190, 25, 130), (120, 16, 80)}


def head_axis(im):
    """x del centro de la caja de la masa de máscara más grande."""
    px = im.load()
    w, h = im.size
    seen = set()
    best = None
    for y in range(h):
        for x in range(w):
            if (x, y) in seen:
                continue
            p = px[x, y]
            if not p[3] or p[:3] not in MASK:
                continue
            comp = {(x, y)}
            q = deque([(x, y)])
            seen.add((x, y))
            while q:
                cx, cy = q.popleft()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if not (0 <= nx < w and 0 <= ny < h) or (nx, ny) in seen:
                        continue
                    other = px[nx, ny]
                    if other[3] and other[:3] in MASK:
                        seen.add((nx, ny))
                        comp.add((nx, ny))
                        q.append((nx, ny))
            if best is None or len(comp) > len(best):
                best = comp
    if not best:
        return None
    xs = [p[0] for p in best]
    return (min(xs) + max(xs)) / 2


def shift(im, dx):
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(im, (dx, 0))
    return out


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    folder = args[0] if args else 'voltia/nueva/stance'
    dry = '--dry-run' in argv
    target = None
    for i, a in enumerate(argv):
        if a == '--target':
            target = float(argv[i + 1])

    names = sorted(n for n in os.listdir(folder) if n.endswith('.png'))
    ims = [Image.open(os.path.join(folder, n)).convert('RGBA') for n in names]
    axes = [head_axis(im) for im in ims]
    if any(a is None for a in axes):
        raise SystemExit('hay frames sin máscara; revisa la carpeta')
    if target is None:
        target = round(statistics.median(axes))
    print('eje objetivo: x=%s (mediana del set: %s)' % (target, round(statistics.median(axes))))
    print('antes: cabeza x %.0f–%.0f (recorrido %.0f)'
          % (min(axes), max(axes), max(axes) - min(axes)))
    out_axes = []
    for name, im, ax in zip(names, ims, axes):
        dx = int(round(target - ax))
        out_axes.append(ax + dx)
        print('  %s  eje %6.1f -> %6.1f  desplazo %+d px' % (name, ax, ax + dx, dx))
        if not dry and dx:
            shift(im, dx).save(os.path.join(folder, name))
    print('después: cabeza x %.0f–%.0f (recorrido %.0f)'
          % (min(out_axes), max(out_axes), max(out_axes) - min(out_axes)))


if __name__ == '__main__':
    main(sys.argv[1:])
