#!/usr/bin/env python3
"""Recorta una hoja a tamano NATIVO: sin reescalar, sin normalizar.

El error de raiz de todo el proyecto fue reescalar cada figura a 200 px. Aqui
se corta y nada mas: lo que mida la figura en la hoja es lo que mide el frame.
Despues se comprueba con tools/fingerprint.py.

    PYTHONPATH=tools/pylibs python3 tools/cut_native.py <hoja.png> <salida_dir> \
        [--green "17,239,6"] [--min-ink 80] [--json boxes.json]

Devuelve tambien un contacto con todos los frames para mirarlos de un golpe.
"""
import argparse
import json
import os

from PIL import Image, ImageDraw


def parse_color(s):
    return tuple(int(v) for v in s.split(','))


def is_bg(p, bg, tol=40):
    return all(abs(a - b) <= tol for a, b in zip(p[:3], bg))


def runs(flags, min_len=3):
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('outdir')
    ap.add_argument('--green', default='17,239,6')
    ap.add_argument('--min-ink', type=int, default=80)
    ap.add_argument('--json')
    a = ap.parse_args()
    bg = parse_color(a.green)

    im = Image.open(a.sheet).convert('RGB')
    w, h = im.size
    px = im.load()
    os.makedirs(a.outdir, exist_ok=True)

    rows = runs([any(not is_bg(px[x, y], bg) for x in range(w)) for y in range(h)], 4)
    boxes, n = [], 0
    for (ry0, ry1) in rows:
        cols = runs([any(not is_bg(px[x, y], bg) for y in range(ry0, ry1 + 1))
                     for x in range(w)], 3)
        for (cx0, cx1) in cols:
            ys = [y for y in range(ry0, ry1 + 1)
                  if any(not is_bg(px[x, y], bg) for x in range(cx0, cx1 + 1))]
            xs = [x for x in range(cx0, cx1 + 1)
                  if any(not is_bg(px[x, y], bg) for y in range(ry0, ry1 + 1))]
            if not ys or not xs:
                continue
            bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
            cell = im.crop((bx0, by0, bx1 + 1, by1 + 1)).convert('RGBA')
            p = cell.load()
            ink = 0
            for yy in range(cell.size[1]):
                for xx in range(cell.size[0]):
                    if is_bg(p[xx, yy], bg):
                        p[xx, yy] = (0, 0, 0, 0)
                    else:
                        ink += 1
            if ink < a.min_ink:
                continue
            cell.save(os.path.join(a.outdir, '%02d.png' % n))
            boxes.append({'n': n, 'x': bx0, 'y': by0,
                          'w': bx1 - bx0 + 1, 'h': by1 - by0 + 1, 'ink': ink})
            n += 1

    print('%s -> %s: %d frames NATIVOS (sin reescalar)' %
          (a.sheet, a.outdir, len(boxes)))
    if boxes:
        ws = sorted(b['w'] for b in boxes)
        hs = sorted(b['h'] for b in boxes)
        print('  alto  %d-%d  ancho %d-%d' % (hs[0], hs[-1], ws[0], ws[-1]))
    if a.json:
        with open(a.json, 'w') as fh:
            json.dump(boxes, fh)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
