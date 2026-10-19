#!/usr/bin/env python3
"""Las 24 filas de la hoja de Chun-Li, TAL CUAL están en el sheet.

Sin recortar ciclos, sin quitar frames repetidos, sin unir nada: de cada fila se
guarda la tira completa de píxeles (misma y, todo el ancho) y un GIF con las
figuras de esa fila en el orden en que están, de izquierda a derecha.

    PYTHONPATH=tools/pylibs python3 tools/chunli_rows_raw.py

Escribe voltia/nuevo/chunli/raw/fila_NN.png y fila_NN.gif, y raw/filas.json.
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

BG = (144, 200, 232)
TOL = 24


def limpiar(im):
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = px[x, y][:3]
            if abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and abs(b - BG[2]) <= TOL:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    base = 'voltia/nuevo/chunli'
    hoja = Image.open('voltia/nuevo/ref/chunli_sheet.png').convert('RGBA')
    bandas = json.load(open(os.path.join(base, 'bandas.json')))
    out = os.path.join(base, 'raw')
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    # las 24 filas: la banda 0 lleva dos (arriba/abajo) mas el retrato
    b0 = bandas[0]['frames']
    alto = sorted([f for f in b0 if f['y0'] < 80 and f['h'] < 100], key=lambda f: f['x0'])
    bajo = sorted([f for f in b0 if f['y0'] >= 80], key=lambda f: f['x0'])
    filas = [
        {'n': 1, 'y0': min(f['y0'] for f in alto), 'y1': max(f['y1'] for f in alto),
         'figs': alto},
        {'n': 2, 'y0': min(f['y0'] for f in bajo), 'y1': max(f['y1'] for f in bajo),
         'figs': bajo},
    ]
    for b in bandas[1:]:
        figs = sorted(b['frames'], key=lambda f: f['x0'])
        filas.append({'n': len(filas) + 1, 'y0': b['y0'], 'y1': b['y1'], 'figs': figs})

    datos = []
    for f in filas:
        n = f['n']
        # tira cruda: todo el ancho, la altura de la fila
        tira = hoja.crop((0, f['y0'], hoja.size[0], f['y1'] + 1))
        tira.save(os.path.join(out, 'fila_%02d.png' % n))
        # GIF con las figuras de la fila, en orden, sin tocar nada mas
        tmp = os.path.join(out, '_tmp%02d' % n)
        os.makedirs(tmp, exist_ok=True)
        for k, fig in enumerate(f['figs']):
            limpiar(hoja.crop((fig['x0'], fig['y0'], fig['x1'] + 1, fig['y1'] + 1))).save(
                os.path.join(tmp, '%02d.png' % k))
        subprocess.run([sys.executable, 'tools/make_gif.py', tmp,
                        os.path.join(out, 'fila_%02d.gif' % n), '--fps', '12',
                        '--zoom', '2', '--bg', 'EDEDF2', '--pad', '8'],
                       check=False, env=dict(os.environ, PYTHONPATH='tools/pylibs'))
        shutil.rmtree(tmp)
        datos.append({'fila': n, 'y0': f['y0'], 'y1': f['y1'], 'n': len(f['figs']),
                      'png': 'raw/fila_%02d.png' % n, 'gif': 'raw/fila_%02d.gif' % n})
        print('fila %2d  y=%4d..%4d  %2d figuras' % (n, f['y0'], f['y1'], len(f['figs'])))
    json.dump(datos, open(os.path.join(out, 'filas.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
