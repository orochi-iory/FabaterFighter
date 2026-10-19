#!/usr/bin/env python3
"""Pixelado determinista: reduce a tamano nativo por COLOR DOMINANTE.

Promediar al reducir (LANCZOS, bilinear) inventa colores nuevos y emborrona el
sprite: es lo que arruinaba todos los intentos. Aqui cada bloque N x N se
sustituye por el color MAS FRECUENTE del bloque, de modo que:

  - no aparece ni un color nuevo,
  - los bordes quedan duros,
  - el pixel vuelve a ser gordo, como en la Game Boy Advance.

    PYTHONPATH=tools/pylibs python3 tools/pixelate.py <in.png> <out.png> [--block 4] \
        [--palette auto|<hex,hex,...>]
"""
import argparse
from collections import Counter

from PIL import Image


def parse_palette(s):
    return [tuple(int(v, 16) for v in c.split(',')) for c in s.split(';') if c]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--block', type=int, default=4)
    ap.add_argument('--palette', default='auto')
    ap.add_argument('--green', default='17,239,6')
    a = ap.parse_args()

    im = Image.open(a.src).convert('RGB')
    w, h = im.size
    n = a.block
    ow, oh = w // n, h // n
    px = im.load()
    out = Image.new('RGB', (ow, oh))
    op = out.load()
    green = tuple(int(v) for v in a.green.split(','))

    for by in range(oh):
        for bx in range(ow):
            c = Counter()
            for y in range(by * n, by * n + n):
                for x in range(bx * n, bx * n + n):
                    c[px[x, y]] += 1
            # el verde manda si ocupa mas de la mitad del bloque: asi los
            # bordes de la figura no se comen el fondo
            if c[green] * 2 > n * n:
                op[bx, by] = green
            else:
                op[bx, by] = c.most_common(1)[0][0]

    if a.palette != 'auto':
        pal = parse_palette(a.palette)
        op = out.load()
        for y in range(oh):
            for x in range(ow):
                p = op[x, y]
                best = min(pal, key=lambda q: sum((i - j) ** 2
                                                  for i, j in zip(p, q)))
                op[x, y] = best

    out.save(a.out)
    print('%s -> %s  %dx%d  bloque %d  %d colores' %
          (a.src, a.out, ow, oh, n, len(set(out.get_flattened_data()))))


if __name__ == '__main__':
    main()
