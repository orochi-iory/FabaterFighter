#!/usr/bin/env python3
"""Estampa el rayo de Voltia en el pecho: glifo fijo, colocado por medida.

El rayo es lo primero que el modelo olvida o dibuja deforme, asi que no se pide:
se dibuja. Se usa un glifo canonico de pixel art (el mismo en todos los frames,
asi que no cambia de forma nunca) y se coloca sobre el traje, encima del
cinturon, centrado en la masa del torso.

    PYTHONPATH=tools/pylibs python3 tools/stamp_design.py <dir_entrada> <dir_salida> \
        [--scale 1] [--report]

Tambien mide la coleta en cada frame: si un frame se sale de la banda de pelo,
lo dice. La coleta no se puede estampar (tiene que moverse), pero si se puede
exigir.
"""
import argparse
import os

from PIL import Image

INK = (10, 8, 20)
BOLT = (250, 210, 50)
SUIT = {(23, 147, 141), (20, 125, 120), (16, 96, 104), (31, 177, 164)}
BELT = {(176, 112, 36), (150, 92, 26), (214, 156, 46)}
HAIR = {(85, 21, 124), (60, 15, 95), (110, 34, 150), (186, 104, 232),
        (36, 9, 58), (150, 60, 196)}

# glifo canonico: 1 = relleno. 5 x 9, el mismo siempre.
GLYPH = [
    "..##.",
    "..##.",
    ".##..",
    ".##..",
    "#####",
    "..##.",
    ".##..",
    "##...",
    "#....",
]


def find_belt(px, w, h):
    ys = [y for y in range(h) for x in range(w) if px[x, y][3] and px[x, y][:3] in BELT]
    return min(ys) if ys else None


def find_torso(px, w, h, belt):
    """Filas de traje por encima del cinturon y su centro horizontal."""
    top = belt if belt is not None else int(h * 0.55)
    rows = {}
    for y in range(int(h * 0.12), top):
        xs = [x for x in range(w) if px[x, y][3] and px[x, y][:3] in SUIT]
        if len(xs) >= 4:
            rows[y] = (min(xs), max(xs))
    return rows


def stamp(path_in, path_out, report=False):
    im = Image.open(path_in).convert('RGBA')
    w, h = im.size
    px = im.load()
    belt = find_belt(px, w, h)
    rows = find_torso(px, w, h, belt)
    if not rows:
        return False, 'sin torso'
    # zona del pecho: entre el 25 % y el 60 % de la franja de torso
    ys = sorted(rows)
    cy0 = ys[len(ys) // 4]
    cy1 = ys[min(len(ys) - 1, (len(ys) * 3) // 5)]
    band = [y for y in ys if cy0 <= y <= cy1] or ys
    cy = band[len(band) // 2]
    xs0 = min(rows[y][0] for y in band)
    xs1 = max(rows[y][1] for y in band)
    cx = (xs0 + xs1) // 2

    gh = len(GLYPH)
    gw = len(GLYPH[0])
    ox = cx - gw // 2
    oy = cy - gh // 2

    def put(x, y, col):
        if 0 <= x < w and 0 <= y < h:
            px[x, y] = col + (255,)

    # contorno: dilatar el glifo 1 px
    for yy in range(gh):
        for xx in range(gw):
            if GLYPH[yy][xx] == '#':
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        put(ox + xx + dx, oy + yy + dy, INK)
    for yy in range(gh):
        for xx in range(gw):
            if GLYPH[yy][xx] == '#':
                put(ox + xx, oy + yy, BOLT)
    im.save(path_out)

    yellow = sum(1 for y in range(h) for x in range(w)
                 if px[x, y][3] and px[x, y][:3] == BOLT)
    hair = sum(1 for y in range(h) for x in range(w)
               if px[x, y][3] and px[x, y][:3] in HAIR)
    ink = sum(1 for y in range(h) for x in range(w) if px[x, y][3])
    return True, 'rayo %d px, pelo %.1f %%' % (yellow, 100 * hair / max(1, ink))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--report', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ok = bad = 0
    for f in sorted(os.listdir(a.src)):
        if not f.endswith('.png'):
            continue
        done, msg = stamp(os.path.join(a.src, f), os.path.join(a.out, f))
        if done:
            ok += 1
        else:
            bad += 1
        if a.report:
            print('%-8s %-4s %s' % (f, 'OK' if done else 'NO', msg))
    print('rayo estampado en %d frames, %d sin torso' % (ok, bad))


if __name__ == '__main__':
    main()
