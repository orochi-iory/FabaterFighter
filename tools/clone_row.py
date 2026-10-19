#!/usr/bin/env python3
"""Clona una fila de la hoja de Cammy y le pone el aspecto de Voltia.

No genera nada: cambia colores y añade la coleta. La pose, el tamaño y la
posición de cada figura se conservan píxel a píxel, que es lo único que hasta
ahora ha dado un «clonado frame a frame» de verdad.

Se trabaja a la resolución NATIVA de la hoja (72 colores, sin antialias). Nada
de reducir la paleta a 16: cada material conserva su rampa de luz-sombra
completa, solo que con los tonos de Voltia.

    PYTHONPATH=tools/pylibs python3 tools/clone_row.py <hoja.png> <salida_dir> \
        --y 14 85 --x0 80 [--scale 2] [--ponytail] [--bolt]

Salida: <salida_dir>/cammy_NN.png  (recorte nativo, sin normalizar)
        <salida_dir>/voltia_NN.png (recoloreado + coleta + rayo)
"""
import argparse
import colorsys
import os
import sys

from PIL import Image, ImageDraw

# --- tabla de colores de la hoja de Cammy ------------------------------------
# La hoja tiene 72 colores exactos. Se clasifican a mano uno a uno: intentar
# adivinarlos por matiz confunde la sombra de la piel con el pelo, que es
# justo el fallo que sacaba las piernas moradas.
HAIR   = [(36, 9, 58), (60, 15, 95), (85, 21, 124), (110, 34, 150),
          (150, 60, 196), (186, 104, 232)]
CLOTH  = [(8, 26, 32), (10, 40, 46), (16, 96, 104), (20, 125, 120),
          (23, 147, 141), (31, 177, 164), (86, 212, 198)]
NAVY   = [(10, 12, 32), (16, 20, 54), (27, 34, 80), (46, 58, 116)]
SKIN   = [(110, 60, 38), (150, 84, 52), (196, 120, 84), (222, 148, 106),
          (240, 176, 132), (250, 202, 168)]
MASK   = [(60, 8, 40), (120, 16, 80), (160, 22, 108), (190, 25, 130),
          (214, 60, 160)]
VISOR  = [(16, 96, 104), (31, 177, 164), (120, 226, 214), (232, 252, 248)]
GOLD   = [(110, 68, 18), (150, 92, 26), (176, 112, 36), (214, 156, 46),
          (250, 210, 50)]
WHITE  = [(190, 190, 200), (222, 222, 232), (255, 255, 255)]
INK    = (10, 8, 20)

# origen -> (material, escalon dentro de la rampa)
TABLE = {
    # pelo rubio de Cammy (cuatro escalones + brillo)
    (248, 208, 56):  ('hair', 4), (248, 240, 120): ('hair', 5),
    (208, 160, 48):  ('hair', 3), (168, 120, 0):   ('hair', 2),
    (160, 80, 40):   ('hair', 1), (248, 176, 0):   ('hair', 3),
    (192, 128, 0):   ('hair', 2), (136, 80, 0):    ('hair', 1),
    (255, 209, 129): ('hair', 5), (248, 216, 0):   ('hair', 4),
    (248, 208, 128): ('hair', 5), (255, 180, 63):  ('hair', 4),
    (250, 202, 168): ('skin', 5),
    (199, 128, 0):   ('hair', 2), (246, 192, 0):   ('hair', 3),
    (249, 192, 2):   ('hair', 3), (255, 180, 63):  ('hair', 4),
    (192, 117, 0):   ('hair', 2), (106, 53, 0):    ('hair', 0),
    (85, 43, 0):     ('hair', 0), (128, 64, 0):    ('hair', 1),

    # piel
    (248, 232, 200): ('skin', 5), (248, 192, 144): ('skin', 4),
    (240, 168, 112): ('skin', 3), (232, 160, 104): ('skin', 3),
    (200, 112, 64):  ('skin', 2), (248, 200, 152): ('skin', 5),
    (200, 136, 88):  ('skin', 2), (168, 104, 40):  ('skin', 1),

    # leotardo y mallas rojas
    (248, 0, 0):   ('cloth', 5), (248, 40, 0):  ('cloth', 5),
    (200, 0, 0):   ('cloth', 4), (184, 24, 0):  ('cloth', 3),
    (160, 0, 0):   ('cloth', 3), (160, 16, 0):  ('cloth', 3),
    (120, 0, 0):   ('cloth', 2), (80, 16, 16):  ('cloth', 1),
    (72, 0, 0):    ('ink', 0),

    # acolchado y guantes grises de Cammy -> guanteletes marino
    (160, 168, 192): ('navy', 3), (104, 112, 144): ('navy', 2),
    (109, 113, 152): ('navy', 2), (158, 163, 218): ('navy', 3),

    # blancos: ojos, suela, ribetes
    (255, 255, 255): ('white', 2), (224, 224, 232): ('white', 1),
    (240, 240, 240): ('white', 1), (224, 224, 224): ('white', 1),
    (221, 221, 221): ('white', 1), (234, 234, 234): ('white', 1),
    (254, 254, 254): ('white', 2), (224, 208, 208): ('white', 0),
    (192, 176, 176): ('white', 0), (128, 128, 128): ('white', 0),
    (56, 56, 56):    ('ink', 0), (0, 0, 0): ('ink', 0),

    # dorado del cinturón
    (255, 255, 0):   ('gold', 4), (248, 208, 56): ('gold', 3),

    # efectos azules (patadas, destellos)
    (64, 112, 240): ('visor', 3), (32, 48, 240): ('visor', 3),
    (96, 192, 240): ('visor', 3), (64, 80, 240): ('visor', 3),
    (80, 160, 240): ('visor', 3), (97, 127, 250): ('visor', 3),
    (33, 40, 153): ('visor', 2), (64, 81, 199): ('visor', 2),
    (30, 41, 153): ('visor', 2), (64, 80, 200): ('visor', 2),
    (168, 208, 248): ('visor', 3), (112, 224, 240): ('visor', 3),
    (192, 240, 240): ('visor', 3), (0, 0, 255): ('visor', 3),
    (0, 0, 185): ('visor', 2), (38, 40, 60): ('ink', 0),
    (64, 64, 48): ('ink', 0), (80, 80, 64): ('ink', 0),
    (64, 32, 16): ('hair', 0), (96, 112, 96): ('navy', 1),
}

RAMP_OF = {'hair': HAIR, 'cloth': CLOTH, 'navy': NAVY, 'skin': SKIN,
           'mask': MASK, 'visor': VISOR, 'gold': GOLD, 'white': WHITE}


def lookup(p):
    """Color de origen -> (material, escalon). Si no esta en la tabla, se
    aproxima por distancia al color conocido mas cercano."""
    hit = TABLE.get(p)
    if hit:
        return hit
    best, bd = ('skin', 2), 10 ** 9
    for src, (mat, idx) in TABLE.items():
        d = sum((a - b) ** 2 for a, b in zip(p, src))
        if d < bd:
            bd, best = d, (mat, idx)
    return best


def paint(p, mat, idx):
    if mat == 'ink':
        return INK
    ramp = RAMP_OF[mat]
    return ramp[min(idx, len(ramp) - 1)]


def is_bg(p):
    return (abs(p[0] - 16) < 12 and abs(p[1] - 48) < 14 and abs(p[2] - 80) < 16)


def retarget(mat, y, top, bot, boot_frac=0.86, leg_frac=0.55):
    """Decide el material final segun donde esta el pixel en la figura.

    Cammy y Voltia no llevan la misma ropa: Cammy tiene leotardo alto y las
    piernas desnudas, Voltia lleva mallas hasta la bota. Y las botas de Cammy
    son del mismo rojo que el leotardo, asi que por color no se separan.
    Se resuelve por zonas verticales de la caja de la figura:

        ny < 0.20   cabeza   -> mascara magenta en la cara, visor en los ojos
        0.20-0.55   torso    -> traje teal; brazos desnudos
        0.55-0.86   piernas  -> traje teal (mallas)
        ny > 0.86   pies     -> azul marino

    Es una regla de vestuario, no un filtro: el dibujo no se toca, solo cambia
    el color de cada pixel.
    """
    ny = (y - top) / max(1, (bot - top))
    if mat in ('gold', 'white') and ny > 0.55:
        return mat
    if ny >= boot_frac:
        return 'white' if mat == 'white' else 'navy'
    if ny >= leg_frac:
        # mallas: la piel pasa a traje; el acolchado y los guantes a marino
        if mat == 'skin':
            return 'cloth'
        if mat == 'steel':
            return 'navy'
        return mat
    if ny <= 0.20:
        # cabeza: la cara va tapada por la mascara, los ojos son visor
        if mat == 'skin':
            return 'mask'
        if mat == 'white':
            return 'visor'
        return mat
    return mat

def is_bg(p):
    return (abs(p[0] - 16) < 12 and abs(p[1] - 48) < 14 and abs(p[2] - 80) < 16)


def row_cells(im, y0, y1, x0, min_gap=2, min_w=8):
    """Corta una fila en figuras por las columnas de fondo."""
    w, _ = im.size
    px = im.load()
    cols = [any(not is_bg(px[x, y]) for y in range(y0, y1 + 1)) for x in range(x0, w)]
    cells, start = [], None
    for i, f in enumerate(cols):
        if f and start is None:
            start = i
        if not f and start is not None:
            cells.append((x0 + start, x0 + i - 1))
            start = None
    if start is not None:
        cells.append((x0 + start, w - 1))
    return [(a, b) for (a, b) in cells if b - a >= min_w]



def mask_face(cell, top, bot, scale=1):
    """Mascara de Voltia sobre la cara, en la rejilla nativa.

    El color solo no basta: en la cabeza, la piel de la cara y los mechones
    dorados se parecen. Se recolorea la cara a magenta (hecho antes, en
    `retarget`) y aqui se recorta la forma: se localiza la masa de mascara y se
    pinta sobre ella una banda de visor a la altura de los ojos, que es lo que
    convierte una cara tapada en el visor de Voltia. Sin esto la cabeza queda
    como una mancha morada sin mirada.
    """
    w, h = cell.size
    px = cell.load()
    face_cols = [MASK[3], MASK[4]]
    pts = [(x, y) for y in range(h) for x in range(w)
           if px[x, y][3] and px[x, y][:3] in face_cols]
    if not pts:
        return cell
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    fh = max(1, y1 - y0)
    # banda del visor: un tercio del alto de la cara, a la altura de los ojos
    vy = y0 + int(fh * 0.38)
    vh = max(1, int(fh * 0.22))
    for y in range(vy, min(y1, vy + vh) + 1):
        for x in range(x0, x1 + 1):
            if px[x, y][3] and px[x, y][:3] in face_cols:
                # el visor no llega al borde: deja 1 px de mascara
                if x0 < x < x1:
                    px[x, y] = VISOR[2] + (255,)
    return cell

def pony_tail(cell, box, scale):
    """Coleta larga de Voltia, dibujada en la rejilla nativa.

    Sale del moño (arriba y detrás de la cabeza) y cae en arco por detrás del
    cuerpo. Se dibuja primero la silueta oscura y encima la masa de pelo, con
    una guía de mechones, para que se lea como el resto del sprite y no como
    un pegote.
    """
    x0, y0, x1, y1 = box
    h = y1 - y0
    s = scale
    layer = Image.new('RGBA', cell.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # punto de anclaje: lado izquierdo de la cabeza, un poco por debajo del
    # borde superior de la figura (el moño)
    ax = x0 + (x1 - x0) * 0.30
    ay = y0 + h * 0.10
    # puntos del arco: se abre hacia atrás y abajo, y la punta se afila
    pts = []
    for i in range(13):
        t = i / 12
        px_ = ax - (x1 - x0) * (0.05 + 0.75 * t) - 2 * s
        py_ = ay + h * (0.02 + 0.95 * t)
        pts.append((px_, py_))
    width0 = max(3, int(h * 0.16))
    dark = (36, 9, 58, 255)
    mid = (85, 21, 124, 255)
    lite = (150, 60, 196, 255)
    for i in range(len(pts) - 1):
        t = i / (len(pts) - 1)
        wdt = width0 * (1.0 - 0.75 * t)
        x1p, y1p = pts[i]
        x2p, y2p = pts[i + 1]
        d.line([(x1p, y1p), (x2p, y2p)], fill=dark, width=int(wdt) + 2 * s)
    for i in range(len(pts) - 1):
        t = i / (len(pts) - 1)
        wdt = width0 * (1.0 - 0.75 * t)
        x1p, y1p = pts[i]
        x2p, y2p = pts[i + 1]
        d.line([(x1p, y1p), (x2p, y2p)], fill=mid, width=max(1, int(wdt)))
    # brillo: un mechón paralelo por el borde interior
    for i in range(0, len(pts) - 1):
        t = i / (len(pts) - 1)
        if 0.15 < t < 0.8:
            x1p, y1p = pts[i]
            x2p, y2p = pts[i + 1]
            d.line([(x1p + 2 * s, y1p), (x2p + 2 * s, y2p)], fill=lite, width=max(1, s))
    out = Image.new('RGBA', cell.size, (0, 0, 0, 0))
    out.alpha_composite(layer)
    out.alpha_composite(cell)
    return out


def bolt(cell, top, bot, scale=1):
    """Rayo amarillo en el pecho, en la rejilla nativa.

    Se dibuja solo sobre los pixeles del traje del torso, dentro de su caja, y
    con el tamano del pecho: si se pinta a ojo sobre toda la figura acaba
    tapando la cara y los brazos, que es lo que paso en el primer intento.
    """
    w, h = cell.size
    px = cell.load()
    torso_top = top + (bot - top) * 0.24
    torso_bot = top + (bot - top) * 0.50
    pts = [(x, y) for y in range(int(torso_top), int(torso_bot))
           for x in range(w) if px[x, y][3] and px[x, y][:3] in CLOTH]
    if not pts:
        return cell
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    bw = max(3, (max(xs) - min(xs)) * 0.42)
    bh = max(4, (max(ys) - min(ys)) * 0.72)
    shape = [(0.42, -0.50), (0.00, 0.06), (0.34, 0.06), (0.10, 0.50),
             (0.62, -0.10), (0.32, -0.10), (0.58, -0.50)]
    poly = [(cx + a * bw, cy + b * bh) for a, b in shape]
    # mascara: solo pinta donde habia traje
    lay = Image.new('RGBA', cell.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.polygon(poly, fill=(250, 210, 50, 255))
    out = cell.copy()
    op = out.load()
    lp = lay.load()
    for y in range(h):
        for x in range(w):
            if lp[x, y][3] and op[x, y][3] and op[x, y][:3] in CLOTH:
                op[x, y] = (250, 210, 50, 255)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('outdir')
    ap.add_argument('--y', nargs=2, type=int, required=True)
    ap.add_argument('--x0', type=int, default=0)
    ap.add_argument('--scale', type=int, default=1)
    ap.add_argument('--ponytail', action='store_true')
    ap.add_argument('--bolt', action='store_true')
    ap.add_argument('--boot-frac', type=float, default=0.86)
    ap.add_argument('--leg-frac', type=float, default=0.55)
    a = ap.parse_args()

    im = Image.open(a.sheet).convert('RGB')
    y0, y1 = a.y
    cells = row_cells(im, y0, y1, a.x0)
    os.makedirs(a.outdir, exist_ok=True)
    print('%d figuras en la fila y=%d..%d' % (len(cells), y0, y1))

    crop = im.crop((0, 0, im.size[0], y1 + 1))
    colors = set(crop.get_flattened_data())
    mats = sorted({lookup(c)[0] for c in colors if not is_bg(c)})
    print('materiales origen:', mats)

    for i, (x0, x1) in enumerate(cells):
        box = (x0, y0, x1 + 1, y1 + 1)
        cell = im.crop(box).convert('RGBA')
        w, h = cell.size
        orig = cell.copy()
        pxc0 = cell.load()
        ys = [yy for yy in range(h) for xx in range(w)
              if not is_bg(pxc0[xx, yy][:3])]
        top, bot = (min(ys), max(ys)) if ys else (0, h - 1)
        # fondo -> transparente
        pxc = cell.load()
        for yy in range(h):
            for xx in range(w):
                r, g, b, al = pxc[xx, yy]
                if is_bg((r, g, b)):
                    pxc[xx, yy] = (0, 0, 0, 0)
                else:
                    mat, idx = lookup((r, g, b))
                    mat = retarget(mat, yy, top, bot, a.boot_frac, a.leg_frac)
                    nr, ng, nb = paint((r, g, b), mat, idx)
                    pxc[xx, yy] = (nr, ng, nb, 255)
        cell = mask_face(cell, top, bot, a.scale)
        orig.save(os.path.join(a.outdir, 'cammy_%02d.png' % i))
        if a.ponytail:
            cell = pony_tail(cell, (0, 0, w - 1, h - 1), a.scale)
        if a.bolt:
            cell = bolt(cell, top, bot, a.scale)
        cell.save(os.path.join(a.outdir, 'voltia_%02d.png' % i))
    print('escrito en', a.outdir)


if __name__ == '__main__':
    sys.exit(main())
