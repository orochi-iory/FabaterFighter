#!/usr/bin/env python3
"""Recorte de Voltia. No usa 'canal verde alto'.

Un píxel es fondo si está más cerca del color de recorte que de cualquier
tinta de la paleta, o si cae dentro del radio duro del recorte. Lo que
queda se encaja en la tinta más cercana. Una tinta de personaje dentro
del radio de exclusión es un error: se sacrifica la tinta, no el recorte.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'tools' / 'pylibs'))
from PIL import Image

KEY = (0, 255, 0)
# Radio duro: el antialias del recorte cae aquí y se borra.
HARD = 60
# Ninguna tinta puede vivir dentro de esta bola. Voltia está a 183.
EXCLUDE = 100
SPECK = 8

PALETTE = [
    (0, 0, 0),
    (76, 36, 114),
    (16, 18, 46),
    (128, 70, 160),
    (30, 34, 78),
    (40, 176, 184),
    (8, 72, 80),
    (42, 18, 70),
    (156, 28, 100),
    (6, 44, 54),
    (96, 14, 68),
    (236, 184, 142),
    (200, 132, 92),
    (148, 88, 60),
    (188, 140, 28),
    (250, 210, 56),
    (228, 184, 52),
    (14, 108, 108),
]


def dist(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


HARD2 = HARD * HARD
EXCLUDE2 = EXCLUDE * EXCLUDE
KEY_D = {p: dist(p, KEY) for p in PALETTE}


def nearest(rgb):
    return min(PALETTE, key=lambda p: dist(rgb, p))


def check_palette():
    bad = [p for p, d in KEY_D.items() if d < EXCLUDE2]
    if bad:
        raise SystemExit(f'paleta dentro del recorte, hay que mover estas tintas: {bad}')


def extract(im):
    im = im.convert('RGBA')
    w, h = im.size
    src = im.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            rgb = (r, g, b)
            dk = dist(rgb, KEY)
            ink = nearest(rgb)
            di = dist(rgb, ink)
            if dk <= HARD2 or dk < di:
                continue
            dst[x, y] = (*ink, 255)
    drop_specks(out)
    return out


def drop_specks(im):
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][3] == 0:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) < SPECK:
                for cx, cy in comp:
                    px[cx, cy] = (0, 0, 0, 0)


def main(argv):
    check_palette()
    if len(argv) != 3:
        print('uso: extract.py entrada.png salida.png', file=sys.stderr)
        return 2
    src = Image.open(argv[1])
    extract(src).save(argv[2])
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
