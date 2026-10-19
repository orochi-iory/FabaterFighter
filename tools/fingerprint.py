#!/usr/bin/env python3
"""Huella visual: mide si un frame SE PARECE al objetivo, no si cumple reglas.

Las puertas anteriores (paleta, mascara a 30 px, alto uniforme) daban «OK» con
frames que no se parecian en nada al objetivo. Esto mide lo que si correlaciona
con la vista:

    alto y ancho de la figura      -> densidad real del dibujo
    pixeles de tinta               -> cuanto detalle hay
    % de contorno                  -> grosor de linea
    numero de colores              -> riqueza de la paleta
    % de pelo                      -> peso de la coleta
    ancho de la cabeza             -> el «casco»

    PYTHONPATH=tools/pylibs python3 tools/fingerprint.py <referencia.png> <candidato...>

Sale con codigo 1 si el candidato se sale de las bandas.
"""
import sys

from PIL import Image

DARK = {(0, 0, 0), (10, 8, 20), (10, 12, 32), (16, 20, 54), (72, 0, 0)}
HAIR = {(85, 21, 124), (60, 15, 95), (110, 34, 150), (186, 104, 232),
        (36, 9, 58), (150, 60, 196)}

# banda tolerada de cada medida, relativa al objetivo
BANDS = {
    'alto': 0.20, 'ancho': 0.25, 'tinta': 0.30, 'contorno': 0.50,
    'colores': 0.30, 'pelo': 0.25, 'cabeza': 0.25,
}


def fingerprint(path):
    im = Image.open(path).convert('RGBA')
    bb = im.getbbox()
    if not bb:
        return None
    im = im.crop(bb)
    w, h = im.size
    px = im.load()
    ink = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    if not ink:
        return None
    dark = sum(1 for (x, y) in ink if px[x, y][:3] in DARK)
    hair = sum(1 for (x, y) in ink if px[x, y][:3] in HAIR)
    cols = len({px[x, y][:3] for (x, y) in ink})
    band = [x for x in range(w) for y in range(max(1, int(h * 0.20)))
            if px[x, y][3] > 0]
    return {
        'alto': h, 'ancho': w, 'tinta': len(ink),
        'contorno': 100 * dark / len(ink),
        'colores': cols,
        'pelo': 100 * hair / len(ink),
        'cabeza': (max(band) - min(band) + 1) if band else 0,
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    ref = fingerprint(sys.argv[1])
    print('OBJETIVO  %-34s %s' % (sys.argv[1].split('/')[-1],
                                  ' '.join('%s=%s' % (k, round(v, 1))
                                           for k, v in ref.items())))
    bad = 0
    for path in sys.argv[2:]:
        f = fingerprint(path)
        if not f:
            print('vacio', path)
            continue
        fails = []
        for k, tol in BANDS.items():
            d = (f[k] - ref[k]) / max(1e-6, ref[k])
            if abs(d) > tol:
                fails.append('%s %+.0f%%' % (k, 100 * d))
        state = 'OK' if not fails else 'SE PARECE MAL: ' + ', '.join(fails)
        if fails:
            bad += 1
        print('%-34s %s\n    %s' % (path.split('/')[-1],
                                    ' '.join('%s=%s' % (k, round(v, 1))
                                             for k, v in f.items()), state))
    print('\n%d de %d candidatos fuera de banda' % (bad, len(sys.argv) - 2))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
