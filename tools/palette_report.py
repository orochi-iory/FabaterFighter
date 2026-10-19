#!/usr/bin/env python3
"""Compara la huella de color de un set con la de la stance aprobada.

La stance (voltia/nueva/stance) es la referencia de paleta: 15 colores exactos
y un reparto concreto entre ellos. Cualquier animación nueva tiene que parecerse
a esa huella; si el reparto se va, se nota a simple vista aunque los colores
sean los mismos ("algo ha pasado con la paleta").

Uso:
    PYTHONPATH=tools/pylibs python3 tools/palette_report.py <dir> [<dir> ...]

Imprime, por carpeta: nº de colores distintos, % fuera de la paleta, y la
diferencia (en puntos porcentuales) de los tonos principales contra la stance.
"""

import os
import sys
from collections import Counter

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sheet as B  # noqa: E402

STANCE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      'voltia', 'nueva', 'stance')

NAMES = {
    (10, 8, 20): 'contorno',
    (16, 20, 54): 'azul oscuro',
    (27, 34, 80): 'azul',
    (16, 96, 104): 'traje sombra',
    (23, 147, 141): 'traje',
    (31, 177, 164): 'traje luz',
    (60, 15, 95): 'pelo sombra',
    (85, 21, 124): 'pelo',
    (186, 104, 232): 'pelo luz',
    (120, 16, 80): 'máscara sombra',
    (190, 25, 130): 'máscara',
    (196, 120, 84): 'piel sombra',
    (240, 176, 132): 'piel',
    (176, 112, 36): 'cinturón',
    (250, 210, 50): 'rayo',
}


def fingerprint(folder):
    ink, off, raw = Counter(), 0, 0
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.png'):
            continue
        im = Image.open(os.path.join(folder, name)).convert('RGBA')
        for p in im.get_flattened_data():
            if not p[3]:
                continue
            raw += 1
            ink[p[:3]] += 1
            if p[:3] not in B.PALETTE:
                off += 1
    total = sum(ink.values()) or 1
    return {c: 100.0 * n / total for c, n in ink.items()}, 100.0 * off / raw if raw else 0.0, len(ink)


def main(argv):
    dirs = argv or [STANCE]
    base, _, _ = fingerprint(STANCE)
    for d in dirs:
        fp, off, ncol = fingerprint(d)
        print('\n%s' % d)
        print('  colores %d · fuera de paleta %.2f %% · tinta total %d px'
              % (ncol, off, sum(1 for _ in ())))
        worst = []
        for c, share in sorted(base.items(), key=lambda t: -t[1]):
            if share < 1.0:
                continue
            got = fp.get(c, 0.0)
            worst.append((abs(got - share), NAMES.get(c, str(c)), share, got))
        worst.sort(reverse=True)
        for diff, name, share, got in worst[:5]:
            flag = '  <-- se va' if diff > 1.0 else ''
            print('  %-14s stance %5.1f %%  set %5.1f %%  dif %+5.1f%s'
                  % (name, share, got, got - share, flag))
        extra = [c for c in fp if c not in B.PALETTE]
        if extra:
            print('  colores fuera de paleta: %d' % len(extra))


if __name__ == '__main__':
    main(sys.argv[1:])
