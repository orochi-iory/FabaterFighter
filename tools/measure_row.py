#!/usr/bin/env python3
"""Anatomia de una fila de la hoja: cuanto mide cada parte de cada figura.

No intenta segmentar la hoja entera (las coletas y las sombras parten las
bandas). Mide UNA fila de figuras de pie y saca, para cada una:

    alto, ancho, cabeza (hasta el cuello), hombros, cintura (cinturon),
    bota (desde donde empieza el rojo abajo), suelo y eje de la cabeza.

Con las medianas se puede escribir una especificacion numerica y pedir la
animacion nueva con el mismo esqueleto.

    PYTHONPATH=tools/pylibs python3 tools/measure_row.py <hoja> --y y0 y1 --x0 px
"""
import argparse
import json
import statistics as st

from PIL import Image

BG = (16, 48, 80)


def is_bg(p):
    return (abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 14
            and abs(p[2] - BG[2]) < 16)


def is_red(p):
    r, g, b = p
    return r > 90 and r > g * 2.2 and r > b * 2.2


def is_gold(p):
    r, g, b = p
    return r > 100 and 30 < g < 200 and b < 90 and r > g * 1.15


def is_hair(p):
    r, g, b = p
    return r > 120 and g > 70 and b < 110 and r > b * 1.6 and g > b


def cells(im, y0, y1, x0):
    w, _ = im.size
    px = im.load()
    cols = [any(not is_bg(px[x, y]) for y in range(y0, y1 + 1)) for x in range(x0, w)]
    out, start = [], None
    for i, f in enumerate(cols):
        if f and start is None:
            start = i
        if not f and start is not None:
            if i - start >= 6:
                out.append((x0 + start, x0 + i - 1))
            start = None
    if start is not None:
        out.append((x0 + start, w - 1))
    return out


def measure_cell(px, x0, x1, y0, y1):
    ys = [y for y in range(y0, y1 + 1)
          if any(not is_bg(px[x, y]) for x in range(x0, x1 + 1))]
    if not ys:
        return None
    ty, by = min(ys), max(ys)
    H = by - ty + 1
    width = {}
    for y in range(ty, by + 1):
        xs = [x for x in range(x0, x1 + 1) if not is_bg(px[x, y])]
        width[y] = (max(xs) - min(xs) + 1) if xs else 0

    # cuello: el minimo de ancho entre el 12 % y el 38 % de la altura
    lo, hi = ty + int(H * 0.12), ty + int(H * 0.38)
    neck = min(range(lo, hi + 1), key=lambda y: width[y])
    head_h = neck - ty + 1
    # hombros: el maximo de ancho justo debajo del cuello
    sho_lo, sho_hi = neck, ty + int(H * 0.62)
    shoulders = max(width[y] for y in range(sho_lo, sho_hi + 1))
    # cintura: la fila con dorado mas alta
    g_lo, g_hi = ty + int(H * 0.32), ty + int(H * 0.62)
    gold = [y for y in range(g_lo, g_hi + 1)
            for x in range(x0, x1 + 1) if is_gold(px[x, y])]
    belt = (min(gold) - ty) if gold else None
    # bota: primera fila desde abajo en la que el rojo domina el ancho
    boot = None
    gaps = 0
    for y in range(by, ty, -1):
        reds = sum(1 for x in range(x0, x1 + 1) if is_red(px[x, y]))
        if reds >= 2:
            gaps = 0
            boot = y
        else:
            gaps += 1
            if gaps > int(H * 0.12):
                break
    boot_h = (by - boot + 1) if boot else 0
    # eje de la cabeza: centro de masa de la banda de cabeza
    hx = [x for y in range(ty, neck + 1) for x in range(x0, x1 + 1)
          if not is_bg(px[x, y])]
    axis = ((sum(hx) / len(hx)) - x0) if hx else (x1 - x0) / 2
    hair = sum(1 for y in range(ty, neck + 1) for x in range(x0, x1 + 1)
               if is_hair(px[x, y]))
    return {
        'x0': x0, 'x1': x1, 'w': x1 - x0 + 1, 'h': H,
        'head_h': head_h, 'heads_tall': round(H / head_h, 2),
        'shoulders': shoulders, 'belt_y': belt,
        'boot_h': boot_h, 'axis_px': round(axis, 1),
        'axis_rel': round(axis / max(1, (x1 - x0)), 3),
        'hair_px': hair,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('--y', nargs=2, type=int, required=True)
    ap.add_argument('--x0', type=int, default=80)
    ap.add_argument('--json')
    a = ap.parse_args()
    im = Image.open(a.sheet).convert('RGB')
    px = im.load()
    cs = cells(im, a.y[0], a.y[1], a.x0)
    rows = []
    print('%-4s %-5s %-5s %-7s %-10s %-8s %-7s %-6s %-6s' %
          ('n', 'w', 'h', 'cabeza', 'cabezas', 'cintura', 'bota', 'eje', 'pelo'))
    for i, (x0, x1) in enumerate(cs):
        m = measure_cell(px, x0, x1, a.y[0], a.y[1])
        if not m:
            continue
        rows.append(m)
        print('%-4d %-5d %-5d %-7d %-10.2f %-8s %-7d %-6.2f %-6d' % (
            i, m['w'], m['h'], m['head_h'], m['heads_tall'],
            m['belt_y'], m['boot_h'], m['axis_rel'], m['hair_px']))

    def med(k):
        return st.median([r[k] for r in rows])

    print('\n--- medianas de %d figuras ---' % len(rows))
    print('alto          %d px' % med('h'))
    print('ancho         %d px' % med('w'))
    print('cabeza        %d px  -> cuerpo de %.2f cabezas' % (med('head_h'), med('heads_tall')))
    print('hombros       %d px' % med('shoulders'))
    print('cintura       y+%s' % med('belt_y'))
    print('bota          %d px' % med('boot_h'))
    print('eje cabeza    %.2f del ancho' % med('axis_rel'))
    print('pelo          %d px en la cabeza' % med('hair_px'))

    if a.json:
        spec = {'sheet': a.sheet, 'row': a.y,
                'median': {k: med(k) for k in
                           ('w', 'h', 'head_h', 'heads_tall', 'shoulders',
                            'belt_y', 'boot_h', 'axis_rel', 'hair_px')},
                'frames': rows}
        with open(a.json, 'w') as fh:
            json.dump(spec, fh, indent=1)
        print('\nescrito', a.json)


if __name__ == '__main__':
    main()
