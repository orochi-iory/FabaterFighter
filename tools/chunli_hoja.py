"""Hoja de referencia de Chun-Li: UNA fila por animacion.

Las filas 1, 2 y 3 de la hoja original son el mismo stance, asi que aqui van
juntas en una sola fila (dos lineas de frames, porque son 32). Las filas 4 a 24
salen crudas, tal cual estan en la hoja, una fila cada una.

Salida: voltia/nuevo/chunli/raw/hoja_animaciones.png
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chunli_page as cp  # noqa: E402  (NOMBRES / BASE)

BASE = cp.BASE
FUENTES = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
           '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
FONDO = (139, 197, 233, 255)
TINTA = (18, 32, 58)


def fuente(tam):
    for p in FUENTES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, tam)
            except Exception:
                pass
    return ImageFont.load_default()


def frames_stance():
    carpeta = os.path.join(BASE, 'rows', '01_stance')
    nombres = sorted(f for f in os.listdir(carpeta) if f.endswith('.png'))
    return [Image.open(os.path.join(carpeta, f)).convert('RGBA') for f in nombres]


def main():
    f_tit = fuente(26)
    f_num = fuente(22)
    f_nom = fuente(15)
    f_sub = fuente(14)

    stance = frames_stance()
    paso = stance[0].size[0] + 2
    por_linea = 16
    ancho_izq = 200
    ancho_stance = min(len(stance), por_linea) * paso
    filas = []
    for n in range(4, 25):
        p = os.path.join(BASE, 'raw', 'fila_%02d.png' % n)
        if os.path.exists(p):
            filas.append((n, Image.open(p).convert('RGBA')))

    ancho_datos = max(ancho_stance, max(im.size[0] for _, im in filas))
    alto_stance = stance[0].size[1] * 2 + 4
    alto = 56 + alto_stance + 16 + sum(im.size[1] + 14 for _, im in filas) + 20
    ancho = ancho_izq + ancho_datos + 20

    hoja = Image.new('RGBA', (ancho, alto), FONDO)
    d = ImageDraw.Draw(hoja)
    d.text((16, 12), 'CHUN-LI · 22 animaciones, una fila por animación', font=f_tit, fill=TINTA)
    d.text((16, 38), 'El stance son las filas 1, 2 y 3 de la hoja: aquí van juntas, '
                     'en un solo bucle (1 → 2 → 1 → 3).', font=f_sub, fill=(40, 62, 92))

    y = 68
    d.text((16, y + 4), '1–3', font=f_num, fill=(140, 20, 60))
    d.text((16, y + 30), 'stance', font=f_nom, fill=TINTA)
    d.text((16, y + 48), 'un bucle', font=f_sub, fill=(140, 20, 60))
    d.text((16, y + 64), '%d frames' % len(stance), font=f_sub, fill=(40, 62, 92))
    for i, im in enumerate(stance):
        lin, col = divmod(i, por_linea)
        hoja.alpha_composite(im, (ancho_izq + col * paso, y + lin * (im.size[1] + 4)))
    y += alto_stance + 16
    d.line([(16, y - 8), (ancho - 16, y - 8)], fill=(110, 170, 210, 255), width=2)

    for n, im in filas:
        d.text((16, y + im.size[1] // 2 - 16), '%02d' % n, font=f_num, fill=(18, 32, 58))
        d.text((62, y + im.size[1] // 2 - 8), cp.NOMBRES.get(n, ''), font=f_nom, fill=(40, 62, 92))
        hoja.alpha_composite(im, (ancho_izq, y))
        y += im.size[1] + 14

    salida = os.path.join(BASE, 'raw', 'hoja_animaciones.png')
    hoja.convert('RGB').save(salida)
    print('%s: %d px de ancho, %d de alto, %d filas (%d frames de stance)'
          % (salida, ancho, alto, len(filas) + 1, len(stance)))


if __name__ == '__main__':
    main()
