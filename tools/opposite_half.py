#!/usr/bin/env python3
"""Segundo medio ciclo del walk: la mitad de atrás con el tono cambiado.

Problema: el generador de hojas no dibuja el paso contrario. Pida lo que se
pida, repite la misma pierna delante (comprobado con la hoja de 5 poses y
con la de 8: la bota delantera sale siempre con el mismo tono).

Solución: en un walk de perfil la silueta del paso es la misma (siempre hay
un pie delante y otro detrás). Lo que cambia es CUÁL de las dos piernas y
cuál de los dos brazos va delante, y eso se ve por el tono con que están
pintados: la pierna cercana lleva el teal claro y el navy normal, la lejana
el teal de sombra y el navy de sombra. Así que la mitad contraria se saca
cambiando esos tonos, sin tocar la geometría, el lienzo ni el suelo.

Uso:
    PYTHONPATH=tools/pylibs python3 tools/opposite_half.py <carpeta> 0 1 2 --into 3 4 5
    (copia el frame 0 en el 3, el 1 en el 4, el 2 en el 5, cambiando tonos)

Solo se cambian tonos de material por debajo de --y (la línea del cuello),
para no tocar máscara, visor, boca, pelo ni rayo.
"""

import os
import sys

from PIL import Image

PAIRS = [
    ((23, 147, 141), (16, 96, 104)),   # teal normal <-> teal sombra
    ((16, 96, 104), (23, 147, 141)),
    ((27, 34, 80), (16, 20, 54)),      # navy normal <-> navy sombra
    ((16, 20, 54), (27, 34, 80)),
    ((240, 176, 132), (196, 120, 84)),  # piel clara <-> piel sombra
    ((196, 120, 84), (240, 176, 132)),
]
MAP = dict(PAIRS)
KEEP = {(10, 8, 20), (250, 210, 50), (255, 255, 255), (176, 112, 36),
        (120, 16, 80), (190, 25, 130), (60, 15, 95), (85, 21, 124),
        (186, 104, 232), (31, 177, 164)}


def swap(im, y0):
    px = im.load()
    w, h = im.size
    for y in range(y0, h):
        for x in range(w):
            p = px[x, y]
            if not p[3]:
                continue
            c = p[:3]
            if c in KEEP:
                continue
            if c in MAP:
                px[x, y] = MAP[c] + (255,)
    return im


if __name__ == '__main__':
    argv = sys.argv[1:]
    d = argv[0]
    y_at = 100
    if '--y' in argv:
        i = argv.index('--y')
        y_at = int(argv[i + 1])
        del argv[i:i + 2]
    cut = argv.index('--into')
    src = [int(a) for a in argv[1:cut]]
    dst = [int(a) for a in argv[cut + 1:]]
    if len(src) != len(dst):
        raise SystemExit('el número de frames de origen y destino debe coincidir')
    for a, b in zip(src, dst):
        im = Image.open(os.path.join(d, '%02d.png' % a)).convert('RGBA')
        swap(im, y_at)
        im.save(os.path.join(d, '%02d.png' % b))
        print('%02d -> %02d (tonos cambiados desde y=%d)' % (a, b, y_at))
