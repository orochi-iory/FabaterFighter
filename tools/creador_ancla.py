#!/usr/bin/env python3
"""Monta el ancla de Voltia a partir de UNA sola imagen de 4 poses, con su etiqueta.

Por que asi: generar las cuatro vistas por separado dio cuatro personajes distintos (una de
frente mas ancha, otra con el rayo del pecho diferente). En **una sola hoja** la IA mantiene
el diseno entre las cuatro, que es justo lo que hace falta para usarla como referencia.

Este script NO genera nada: coge la hoja que sale de la IA, la mide, la reescala a 1408x768
(el formato de la referencia del usuario) y le pone la banda blanca con las etiquetas.

    PYTHONPATH=tools/pylibs python3 tools/creador_ancla.py hoja_ia.png
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(BASE, 'voltia/nuevo/creador/ancla/ANCLA_voltia_4_vistas.png')
W, H = 1408, 768
BANDA = 78
ALTO_FIGURA = H - BANDA - 20
ETIQUETAS = ['FRENTE', 'DERECHA', 'IZQUIERDA', 'TRASERA']
FUENTES = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
           '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']


def es_rojo(c):
    return c[0] > 200 and c[1] < 70 and c[2] < 70


def tramos(im):
    """Columnas con tinta: devuelve un tramo (x0, x1) por figura."""
    px = im.convert('RGB').load()
    ancho, alto = im.size
    hay = []
    for x in range(ancho):
        v = False
        for y in range(0, alto, 2):
            if not es_rojo(px[x, y]):
                v = True
                break
        hay.append(v)
    out, ini = [], None
    for x, v in enumerate(hay):
        if v and ini is None:
            ini = x
        elif not v and ini is not None:
            out.append((ini, x - 1))
            ini = None
    if ini is not None:
        out.append((ini, ancho - 1))
    return [t for t in out if t[1] - t[0] > 20]


def recorte_vertical(im, x0, x1):
    px = im.convert('RGB').load()
    ys = [y for y in range(im.size[1])
          if any(not es_rojo(px[x, y]) for x in range(x0, x1 + 1, 2))]
    return (min(ys), max(ys)) if ys else (0, im.size[1] - 1)


def fuente(tam):
    for f in FUENTES:
        if os.path.exists(f):
            return ImageFont.truetype(f, tam)
    return ImageFont.load_default()


def main():
    if len(sys.argv) < 2:
        raise SystemExit('uso: creador_ancla.py hoja_ia.png')
    hoja = Image.open(sys.argv[1]).convert('RGB')
    t = tramos(hoja)
    if len(t) != 4:
        raise SystemExit('se esperaban 4 figuras y hay %d' % len(t))
    print('  %s · %dx%d' % (os.path.basename(sys.argv[1]), *hoja.size))

    salida = Image.new('RGBA', (W, H), (255, 0, 0, 255))
    slot = W // 4
    for k, (x0, x1) in enumerate(t):
        y0, y1 = recorte_vertical(hoja, x0, x1)
        fig = hoja.crop((x0, y0, x1 + 1, y1 + 1))
        esc = ALTO_FIGURA / fig.size[1]
        fig = fig.resize((max(1, round(fig.size[0] * esc)), ALTO_FIGURA), Image.LANCZOS)
        cx = slot * k + slot // 2
        salida.alpha_composite(fig.convert('RGBA'), (cx - fig.size[0] // 2, 10 + ALTO_FIGURA - fig.size[1]))
        print('  %-10s %4d..%4d  esc %.3f  -> x%d' % (ETIQUETAS[k], x0, x1, esc, cx))

    d = ImageDraw.Draw(salida)
    d.rectangle((0, H - BANDA, W, H), fill=(255, 255, 255, 255))
    f = fuente(30)
    for k, texto in enumerate(ETIQUETAS):
        cx = slot * k + slot // 2
        d.text((cx - d.textlength(texto, font=f) / 2, H - BANDA + 22), texto,
               font=f, fill=(20, 16, 34, 255))
    salida.convert('RGB').save(SALIDA)
    print('\n%s · %dx%d' % (SALIDA, W, H))


if __name__ == '__main__':
    main()
