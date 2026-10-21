#!/usr/bin/env python3
"""Compone una hoja de animacion a partir de N imagenes sueltas generadas por IA.

Por que existe: la herramienta de imagen hace UNA imagen por llamada (no acepta pedir
una rejilla de 8 viñetas en un solo lienzo). Generar 8 poses sueltas da mas control de la
pose, pero cada imagen sale con su encuadre, su escala y a veces su formato. Esto las
normaliza y las pega en una hoja de una fila, con fondo rojo puro, para poder seguir con
el pipeline de siempre (trocear.py -> encajar.py).

Que hace, por figura
--------------------
1. quita el rojo del fondo (mismo criterio que trocear.py: `es_rojo` TOL 90);
2. mide la ALTURA DE TINTA (no la caja del sprite: la caja depende de la coleta);
3. escala cada figura para que su altura de tinta sea la mediana del lote;
4. la apoya en la MISMA linea de pies y la centra por el centro de masa horizontal;
5. la pega en una hoja de una fila con huecos amplios sobre rojo puro.

    PYTHONPATH=tools/pylibs python3 tools/creador_componer.py salida.png f1.png f2.png ...
"""
import sys

from PIL import Image

TOL = 90
ALTO_OBJETIVO = 560      # px de tinta por figura en la hoja (≈ el nativo actual: 500-530)
HUECO = 90               # px de rojo entre figuras (el reparto por cabeza necesita aire)
MARGEN = 40


def es_rojo(c):
    return c[0] > 255 - TOL and c[1] < TOL and c[2] < TOL


def sin_fondo(im):
    im = im.convert('RGBA')
    px = im.load()
    W, H = im.size
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if es_rojo(c):
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    if len(sys.argv) < 3:
        raise SystemExit('uso: creador_componer.py salida.png f1.png f2.png ...')
    salida, entradas = sys.argv[1], sys.argv[2:]

    figuras = []
    for p in entradas:
        im = sin_fondo(Image.open(p))
        bb = im.split()[3].getbbox()
        if not bb:
            raise SystemExit('sin figura en ' + p)
        figuras.append(im.crop(bb))
        print('  %-28s %4d×%4d' % (p.split('/')[-1], bb[2] - bb[0], bb[3] - bb[1]))

    alturas = sorted(f.size[1] for f in figuras)
    objetivo = ALTO_OBJETIVO or alturas[len(alturas) // 2]

    normalizadas = []
    for f in figuras:
        esc = objetivo / f.size[1]
        n = f.resize((max(1, round(f.size[0] * esc)), objetivo), Image.LANCZOS)
        normalizadas.append(n)
        print('  escala %.3f -> %d×%d' % (esc, n.size[0], n.size[1]))

    W = sum(n.size[0] for n in normalizadas) + HUECO * (len(normalizadas) - 1) + 2 * MARGEN
    H = objetivo + 2 * MARGEN
    hoja = Image.new('RGBA', (W, H), (255, 0, 0, 255))
    x = MARGEN
    for n in normalizadas:
        hoja.alpha_composite(n, (x, H - MARGEN - n.size[1]))   # pies en la misma linea
        x += n.size[0] + HUECO
    hoja.convert('RGB').save(salida)
    print('\nhoja %s · %d×%d · %d figuras · fondo rojo puro' % (salida, W, H, len(normalizadas)))


if __name__ == '__main__':
    main()
