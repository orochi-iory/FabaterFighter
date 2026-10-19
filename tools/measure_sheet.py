#!/usr/bin/env python3
"""Mide la hoja de Cammy frame a frame para poder especificarla con numeros.

Lo que se busca no es «una hoja bonita»: es saber cuanto mide cada figura, en
que columna esta su cabeza, donde apoya el pie y que proporcion guarda la
cabeza con el cuerpo. Con esos numeros se puede pedir una animacion nueva sin
que cada frame acabe de un tamano distinto, que es el fallo que se repite.

    PYTHONPATH=tools/pylibs python3 tools/measure_sheet.py <hoja.png> \
        [--x0 80] [--json out.json]

Imprime la tabla por filas y un resumen con las medianas.
"""
import argparse
import json
import statistics as st

from PIL import Image

BG = (16, 48, 80)


def is_bg(p):
    return (abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 14
            and abs(p[2] - BG[2]) < 16)


def runs(flags, min_len=4):
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        if not f and start is not None:
            if i - start >= min_len:
                out.append((start, i - 1))
            start = None
    if start is not None and len(flags) - start >= min_len:
        out.append((start, len(flags) - 1))
    return out


def measure(path, x0=0):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()

    rows = runs([any(not is_bg(px[x, y]) for x in range(x0, w)) for y in range(h)], 6)
    frames = []
    for ri, (ry0, ry1) in enumerate(rows):
        # el suelo de la fila: la ultima fila con pixeles de sombra/pie
        cols = [any(not is_bg(px[x, y]) for y in range(ry0, ry1 + 1)) for x in range(x0, w)]
        for ci, (cx0, cx1) in enumerate(runs(cols, 6)):
            bx0, bx1 = x0 + cx0, x0 + cx1
            # caja real de la figura dentro de la banda
            ys = [y for y in range(ry0, ry1 + 1)
                  if any(not is_bg(px[x, y]) for x in range(bx0, bx1 + 1))]
            xs = [x for x in range(bx0, bx1 + 1)
                  if any(not is_bg(px[x, y]) for y in range(ry0, ry1 + 1))]
            if not ys or not xs:
                continue
            fy0, fy1 = min(ys), max(ys)
            fx0, fx1 = min(xs), max(xs)
            H = fy1 - fy0 + 1
            # cabeza: primera banda de pixeles desde arriba con masa suficiente
            head_bot = fy0
            for y in range(fy0, fy1):
                cnt = sum(1 for x in range(fx0, fx1 + 1) if not is_bg(px[x, y]))
                if cnt >= max(3, (fx1 - fx0) * 0.14):
                    head_bot = y
                elif y - fy0 > H * 0.12:
                    break
            # eje de la cabeza: centro de masa de esa banda
            hx = [x for y in range(fy0, head_bot + 1) for x in range(fx0, fx1 + 1)
                  if not is_bg(px[x, y])]
            head_axis = (sum(hx) / len(hx)) - fx0 if hx else (fx1 - fx0) / 2
            ink = sum(1 for y in range(fy0, fy1 + 1) for x in range(fx0, fx1 + 1)
                      if not is_bg(px[x, y]))
            frames.append({
                'row': ri, 'col': ci,
                'x0': fx0, 'x1': fx1, 'y0': fy0, 'y1': fy1,
                'w': fx1 - fx0 + 1, 'h': H,
                'head_h': head_bot - fy0 + 1,
                'head_axis_rel': round(head_axis / max(1, (fx1 - fx0)), 3),
                'head_axis_px': round(head_axis, 1),
                'ink': ink,
            })
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('--x0', type=int, default=80)
    ap.add_argument('--json')
    a = ap.parse_args()

    fr = measure(a.sheet, a.x0)
    by_row = {}
    for f in fr:
        by_row.setdefault(f['row'], []).append(f)

    print('frames: %d en %d filas' % (len(fr), len(by_row)))
    print('\n%-4s %-4s %-6s %-5s %-5s %-6s %-6s %-6s' %
          ('fila', 'col', 'ancho', 'alto', 'cabeza', 'cuerpo', 'eje', 'tinta'))
    for r in sorted(by_row)[:14]:
        for f in by_row[r]:
            print('%-4d %-4d %-6d %-5d %-5d %-6.2f %-6.2f %-6d' % (
                f['row'], f['col'], f['w'], f['h'], f['head_h'],
                f['h'] / f['head_h'], f['head_axis_rel'], f['ink']))

    hs = [f['h'] for f in fr]
    heads = [f['head_h'] for f in fr]
    ws = [f['w'] for f in fr]
    bb = [f['head_axis_rel'] for f in fr]
    print('\n--- resumen de las %d figuras ---' % len(fr))
    print('alto      mediana %d  min %d  max %d  desv %.1f' %
          (st.median(hs), min(hs), max(hs), st.pstdev(hs)))
    print('ancho     mediana %d  min %d  max %d' % (st.median(ws), min(ws), max(ws)))
    print('cabeza    mediana %d  => cuerpo de %.2f cabezas' %
          (st.median(heads), st.median(hs) / st.median(heads)))
    print('eje cabeza relativo  mediana %.3f (0 = borde izq, 1 = borde der)' %
          st.median(bb))
    print('tinta     mediana %d  min %d  max %d' %
          (st.median([f['ink'] for f in fr]), min(f['ink'] for f in fr),
           max(f['ink'] for f in fr)))

    spec = {
        'sheet': a.sheet,
        'frames': len(fr),
        'rows': len(by_row),
        'median': {
            'h': st.median(hs), 'w': st.median(ws),
            'head_h': st.median(heads),
            'heads_tall': round(st.median(hs) / st.median(heads), 2),
            'head_axis_rel': round(st.median(bb), 3),
            'ink': st.median([f['ink'] for f in fr]),
        },
        'detail': fr,
    }
    if a.json:
        with open(a.json, 'w') as fh:
            json.dump(spec, fh, indent=1)
        print('\nescrito', a.json)


if __name__ == '__main__':
    main()
