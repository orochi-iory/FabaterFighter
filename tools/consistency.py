#!/usr/bin/env python3
"""Comprueba que un set de frames es del MISMO tamaño que la stance aprobada.

La stance (voltia/nueva/stance/00.png) es el patrón. Este script mide cada
frame y lo compara con ella:

- `mascara`: alto de la cabeza. Es la escala.
- `alto`: alto total de la figura (coleta incluida).
- `coleta`: alto de la coleta.
- `tinta`: píxeles opacos totales.
- `ancho 1/3`: ancho del cuerpo a un tercio de la altura (hombros/pecho).
- `ancho 2/3`: ancho a dos tercios (caderas y piernas).

Si el ancho o la tinta se van, el personaje parece más pequeño aunque la
cabeza mida lo mismo: es el fallo que se cuela cuando se pide "piernas
juntas" y el modelo estrecha todo el cuerpo.

Uso:
    PYTHONPATH=tools/pylibs python3 tools/consistency.py <dir> [<dir> ...]
        [--tol 5] [--ref voltia/nueva/stance/00.png]

Sale con código 1 si algún frame se pasa de tolerancia.
"""

import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sheet as B  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HAIR = {(60, 15, 95), (85, 21, 124), (186, 104, 232)}


def profile(path):
    im = Image.open(path).convert('RGBA')
    px = im.load()
    w, h = im.size
    ink = [(x, y) for y in range(h) for x in range(w) if px[x, y][3]]
    if not ink:
        return None
    hp = [(x, y) for (x, y) in ink if px[x, y][:3] in HAIR]
    top = min(y for _, y in ink)
    bot = max(y for _, y in ink)

    def width(frac):
        y = int(top + (bot - top) * frac)
        xs = [x for x, yy in ink if yy == y]
        return (max(xs) - min(xs) + 1) if xs else 0

    return {
        'mascara': B.mask_height(im),
        'alto': bot - top + 1,
        'coleta': (max(y for _, y in hp) - min(y for _, y in hp) + 1) if hp else 0,
        'tinta': len(ink),
        'ancho 1/3': width(0.33),
        'ancho 2/3': width(0.66),
    }


def main(argv):
    tol = 5.0
    if '--tol' in argv:
        tol = float(argv[argv.index('--tol') + 1])
    ref = os.path.join(ROOT, 'voltia', 'nueva', 'stance', '00.png')
    if '--ref' in argv:
        ref = argv[argv.index('--ref') + 1]
    dirs = [a for a in argv if not a.startswith('--')
            and a not in (str(tol), ref)] or [os.path.dirname(ref)]

    base = profile(ref)
    print('patrón: %s  %s\n' % (os.path.relpath(ref, ROOT), base))
    bad = 0
    for d in dirs:
        if not os.path.isdir(d):
            continue
        print(d)
        for name in sorted(os.listdir(d)):
            if not name.endswith('.png'):
                continue
            p = profile(os.path.join(d, name))
            if not p:
                continue
            diffs = {k: 100.0 * (p[k] - base[k]) / base[k] if base[k] else 0.0
                     for k in base}
            # Qué bloquea y qué no:
            # - máscara: la escala. Siempre.
            # - tinta y ancho del torso: que el personaje no se adelgace.
            # - alto, coleta y ancho de piernas: se informan, porque la coleta
            #   se mueve a propósito (regla de oro) y las piernas cambian de
            #   postura. Si bloquearan, ninguna animación con coleta viva pasaría.
            over = [k for k in diffs
                    if k in ('mascara', 'tinta', 'ancho 1/3')
                    and abs(diffs[k]) > (tol if k != 'tinta' else tol * 2)]
            flag = '  OK' if not over else '  <-- FUERA (%s)' % ', '.join(over)
            if over:
                bad += 1
            print('  %s  mascara %2d  %s%s'
                  % (name, p['mascara'],
                     '  '.join('%s %+5.1f%%' % (k, v) for k, v in diffs.items()),
                     flag))
        print('')
    if bad:
        print('%d frame(s) fuera de ±%.1f%%: el personaje no mide lo mismo.' % (bad, tol))
        return 1
    print('Todos los frames dentro de ±%.1f%% del patrón.' % tol)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
