#!/usr/bin/env python3
"""Colocacion de cada frame nativo dentro de la celda oficial, sin escalarlo.

Para que el visor pueda enseñar el frame nativo **tal cual** (sin filtro y sin
redimensionar) y que al cambiar entre "nativo" y "hoja de juego" no salte nada,
hace falta saber en que esquina de la celda 175x166 de arte va cada frame.

El frame nativo es un x4 exacto del arte (0 bloques 4x4 no uniformes). Se baja a
1x con NEAREST (÷4, sin perdida: es el mismo pixel repetido) y se busca su
posicion en la celda por la caja de tinta: el desplazamiento que lleva la caja de
tinta del frame a la de la celda es unico, y despues se comprueba pixel a pixel
que coinciden.

Escribe `voltia/frames/coloc.json`:

    {"celda":[175,166], "escala":4, "frames":{"stance/0":[ox,oy], ...}}

con (ox,oy) en px de arte. En el visor: frame nativo en (ox*4, oy*4) de un
lienzo de 700x664.

    PYTHONPATH=tools/pylibs python3 tools/voltia_nativo_coloc.py
"""
import json
import os

from PIL import Image, ImageChops

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOJA = os.path.join(BASE, 'voltia/sheet_uniform.png')
META = os.path.join(BASE, 'voltia/sheet.json')
FRAMES = os.path.join(BASE, 'voltia/frames')
SALIDA = os.path.join(FRAMES, 'coloc.json')
NATIVO = 4
HOJA_PX = 2


def main():
    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    hoja = Image.open(HOJA).convert('RGBA')
    aw, ah = cw // HOJA_PX, ch // HOJA_PX

    out = {'celda': [aw, ah], 'escala': NATIVO, 'frames': {}}
    iguales = distintos = 0
    for a in meta['animations']:
        r, celdas = a['row'], []
        for i in range(a['frames']):
            p = os.path.join(FRAMES, 'voltia_%s_%d.png' % (a['id'], i))
            nativo = Image.open(p).convert('RGBA')
            arte = nativo.resize((nativo.size[0] // NATIVO, nativo.size[1] // NATIVO),
                                 Image.NEAREST)
            celda = hoja.crop((i * cw, r * ch, (i + 1) * cw, (r + 1) * ch))
            celda = celda.resize((aw, ah), Image.NEAREST)

            bb, cbb = arte.split()[3].getbbox(), celda.split()[3].getbbox()
            if not bb or not cbb:
                continue
            ox, oy = cbb[0] - bb[0], cbb[3] - bb[3]
            dx = dy = None
            for cand in ((cbb[0] - bb[0], cbb[3] - bb[3]),
                         (cbb[2] - bb[2], cbb[3] - bb[3]),
                         (cbb[0] - bb[0], cbb[1] - bb[1])):
                if cand[0] < 0 or cand[1] < 0 or cand[0] + arte.size[0] > aw \
                        or cand[1] + arte.size[1] > ah:
                    continue
                trozo = celda.crop((cand[0], cand[1],
                                    cand[0] + arte.size[0], cand[1] + arte.size[1]))
                if ImageChops.difference(trozo, arte).getbbox() is None:
                    dx, dy = cand
                    iguales += 1
                    break
            if dx is None:
                distintos += 1
                dx, dy = max(0, min(aw - arte.size[0], ox)), max(0, min(ah - arte.size[1], oy))
            celdas.append([dx, dy, arte.size[0], arte.size[1]])
        out['frames'][a['id']] = celdas
        print('  %-12s %2d frames' % (a['id'], len(celdas)))

    json.dump(out, open(SALIDA, 'w'), separators=(',', ':'))
    print('\nidenticos a la hoja: %d · recolocados (no coincidian): %d' % (iguales, distintos))
    print('escrito %s' % os.path.relpath(SALIDA, BASE))


if __name__ == '__main__':
    main()
