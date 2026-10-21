#!/usr/bin/env python3
"""Monta la tira de anclaje de Voltia: frente, derecha, izquierda y trasera, con su etiqueta.

Es la referencia que se da a la IA en cada generacion, a 1408x768 (el mismo formato que la
imagen de referencia que paso el usuario).

Cada vista se mide por su tinta (no por la caja del PNG: el fondo rojo sobra), se escala a
la misma altura y se apoya en la MISMA linea de pies. La etiqueta va debajo, sobre una banda
blanca, para que quede claro que ese texto no forma parte del sprite.

    PYTHONPATH=tools/pylibs python3 tools/creador_ancla.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = os.path.join(BASE, 'voltia/nuevo/creador/ancla')
SALIDA = os.path.join(ENTRADA, 'ANCLA_voltia_4_vistas.png')
TOL = 90
W, H = 1408, 768
ALTO_TINTA = 600
LINEA_PIES = 640
BANDA = H - 78
ETIQUETAS = [('frente.png', 'FRENTE'), ('derecha2.png', 'DERECHA'),
             ('izquierda2.png', 'IZQUIERDA'), ('trasera.png', 'TRASERA')]
FUENTES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]


def es_rojo(c):
    return c[0] > 255 - TOL and c[1] < TOL and c[2] < TOL


def recortar_tinta(p):
    im = Image.open(p).convert('RGBA')
    px = im.load()
    ancho, alto = im.size
    x0, y0, x1, y1 = ancho, alto, 0, 0
    for y in range(alto):
        for x in range(ancho):
            if not es_rojo(px[x, y][:3]):
                if x < x0: x0 = x
                if y < y0: y0 = y
                if x > x1: x1 = x
                if y > y1: y1 = y
    return im.crop((x0, y0, x1 + 1, y1 + 1))


def fuente(tam):
    for f in FUENTES:
        if os.path.exists(f):
            return ImageFont.truetype(f, tam)
    return ImageFont.load_default()


def main():
    hoja = Image.new('RGBA', (W, H), (255, 0, 0, 255))
    slot = W // len(ETIQUETAS)
    for k, (fichero, texto) in enumerate(ETIQUETAS):
        fig = recortar_tinta(os.path.join(ENTRADA, fichero))
        esc = ALTO_TINTA / fig.size[1]
        fig = fig.resize((max(1, round(fig.size[0] * esc)), ALTO_TINTA), Image.LANCZOS)
        cx = slot * k + slot // 2
        hoja.alpha_composite(fig, (cx - fig.size[0] // 2, LINEA_PIES - fig.size[1]))
        print('  %-14s %4d×%4d -> x%d  escala %.3f'
              % (texto, fig.size[0], fig.size[1], cx, esc))

    # banda de etiquetas
    d = ImageDraw.Draw(hoja)
    d.rectangle((0, BANDA, W, H), fill=(255, 255, 255, 255))
    f = fuente(30)
    for k, (_, texto) in enumerate(ETIQUETAS):
        cx = slot * k + slot // 2
        ancho = d.textlength(texto, font=f)
        d.text((cx - ancho / 2, BANDA + 22), texto, font=f, fill=(20, 16, 34, 255))
    hoja.convert('RGB').save(SALIDA)
    print('\n%s · %d×%d' % (SALIDA, W, H))


if __name__ == '__main__':
    main()
