#!/usr/bin/env python3
"""Prueba: quitar el contorno negro de Voltia (modelo original) sin tocar la hoja.

`voltia/sheet_uniform.png` NO se modifica: se escribe una hoja aparte.

Lo medido en el frame 0 del stance (celda 350x332 de la hoja original):

  - 9388 de 32644 px opacos (29 %) son casi negros: max(r,g,b) <= 6;
  - el aro no tiene grosor fijo: 1-2 px en la cara, hasta 10-12 px en la cola;
  - 2124 de esos px estan a mas de 6 px del borde, o sea que dentro del negro
    tambien hay lineas de dibujo de verdad (brazo sobre torso, rodilla, pliegues).

Por eso no vale borrar todo el negro (aplana el dibujo) ni rellenarlo por
difusion (la onda corre por dentro del aro y un solo color lo inunda: medido,
el cian del traje se comia la cola entera).

Lo que si funciona: dos grupos por topologia, no por grosor.

  externo  negro conectado con la transparencia = el aro. Se borra (alfa 0).
  interno  negro encerrado por color = lineas de dibujo. Se queda, intacto.

Y luego 1 px de borde oscurecido sobre la silueta que queda, para que el sprite
siga leyendose sobre el fondo. Es el unico precio: al quitar el aro el personaje
adelgaza lo que medía el aro (en la cola, hasta 12 px).

    PYTHONPATH=tools/pylibs python3 tools/voltia_outline.py --celdas 0
    PYTHONPATH=tools/pylibs python3 tools/voltia_outline.py            # toda la hoja
"""
import argparse
import json
import os

from PIL import Image, ImageChops, ImageFilter

HOJA = 'voltia/sheet_uniform.png'
META = 'voltia/sheet.json'
UMBRAL = 6          # max(r,g,b) <= UMBRAL cuenta como negro
BORDE = 1           # px de borde oscurecido que se deja
FACTOR = 0.55       # cuanto se oscurece ese borde
SUAVIZAR = True     # quita px sueltos del alfa (apertura + cierre)


def mascaras(cel):
    r, g, b, a = cel.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    dark = Image.eval(mx, lambda v: 255 if v <= UMBRAL else 0)
    opaco = Image.eval(a, lambda v: 255 if v > 0 else 0)
    return ImageChops.multiply(dark, opaco), opaco


def aro_externo(dark, opaco, iteraciones=24):
    """Negro que se toca con la transparencia, crecido por negro."""
    transp = ImageChops.subtract(opaco, dark)      # por donde puede entrar
    dentro = transp
    for _ in range(2):
        dentro = dentro.filter(ImageFilter.MaxFilter(3))
    crecido = ImageChops.multiply(dark, dentro)
    for _ in range(iteraciones):
        nuevo = crecido
        w, h = dark.size
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            mov = Image.new('L', (w, h), 0)
            mov.paste(crecido, (dx, dy))
            nuevo = ImageChops.lighter(nuevo, mov)
        nuevo = ImageChops.multiply(nuevo, dark)
        if ImageChops.difference(nuevo, crecido).getbbox() is None:
            break
        crecido = nuevo
    return crecido


def quitar_trozos(cel, minimo=12):
    """Tira los trocitos que quedan sueltos al borrar el aro (islas de 1-11 px)."""
    a = cel.split()[3]
    px = a.load()
    w, h = cel.size
    visto = [[False] * w for _ in range(h)]
    fuera = Image.new('L', (w, h), 0)
    borrar = []
    for y in range(h):
        for x in range(w):
            if px[x, y] == 0 or visto[y][x]:
                continue
            pila, comp = [(x, y)], []
            visto[y][x] = True
            while pila:
                cx, cy = pila.pop()
                comp.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not visto[ny][nx] \
                                and px[nx, ny] > 0:
                            visto[ny][nx] = True
                            pila.append((nx, ny))
            if len(comp) < minimo:
                borrar.extend(comp)
    if not borrar:
        return cel, 0
    for x, y in borrar:
        fuera.putpixel((x, y), 255)
    r, g, b, _ = cel.split()
    al = ImageChops.subtract(cel.split()[3], fuera)
    return Image.merge('RGBA', (r, g, b, al)), len(borrar)


def limpiar_celda(cel, borde=BORDE, factor=FACTOR, suavizar=SUAVIZAR):
    dark, opaco = mascaras(cel)
    n = sum(1 for p in dark.getdata() if p)
    if not n:
        return cel, 0
    externo = aro_externo(dark, opaco)
    r, g, b, _ = cel.split()
    al = ImageChops.subtract(cel.split()[3], externo)     # aro fuera
    out = Image.merge('RGBA', (r, g, b, al))
    if suavizar:
        al2 = Image.eval(al, lambda v: 255 if v > 0 else 0)
        al2 = al2.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        out = Image.merge('RGBA', (r, g, b, al2))
    if borde > 0:
        a = out.split()[3]
        op = Image.eval(a, lambda v: 255 if v > 0 else 0)
        dentro = op
        for _ in range(borde):
            dentro = dentro.filter(ImageFilter.MinFilter(3))
        cerca = ImageChops.subtract(op, dentro)
        r, g, b, al = out.split()
        osc = Image.merge('RGBA', (
            Image.eval(r, lambda v: int(v * factor)),
            Image.eval(g, lambda v: int(v * factor)),
            Image.eval(b, lambda v: int(v * factor)), al))
        out.paste(osc, (0, 0), cerca)
    out, _ = quitar_trozos(out)
    return out, n


def contar(cel):
    dark, _ = mascaras(cel)
    return sum(1 for p in dark.getdata() if p), sum(
        1 for p in cel.split()[3].getdata() if p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--celdas', default='', help='filas a procesar: 0,1,2 (por defecto todas)')
    ap.add_argument('--borde', type=int, default=BORDE)
    ap.add_argument('--factor', type=float, default=FACTOR)
    ap.add_argument('--sin-suavizar', action='store_true')
    ap.add_argument('--salida', default='voltia/sheet_outline.png')
    args = ap.parse_args()

    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    im = Image.open(HOJA).convert('RGBA')
    cols, rows = im.size[0] // cw, im.size[1] // ch
    filas = set(int(x) for x in args.celdas.split(',')) if args.celdas else None
    print('hoja %dx%d, %d x %d celdas de %dx%d' % (im.size[0], im.size[1], cols, rows, cw, ch))

    out = im.copy()
    antes = despues = 0
    for r in range(rows):
        if filas is not None and r not in filas:
            continue
        for c in range(cols):
            cel = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            if not cel.getbbox():
                continue
            nuevo, n = limpiar_celda(cel, args.borde, args.factor, not args.sin_suavizar)
            antes += n
            despues += contar(nuevo)[0]
            out.paste(nuevo, (c * cw, r * ch))
        print('  fila %2d lista' % r)

    if filas is None:
        out.save(args.salida)
    else:                       # solo las filas pedidas: se guarda el recorte
        y0 = min(filas) * ch
        out.crop((0, y0, im.size[0], (max(filas) + 1) * ch)).save(args.salida)
    print('%s: negro %d -> %d px (%.1f %%)'
          % (args.salida, antes, despues, 100.0 * despues / max(1, antes)))

    if filas is None:
        m = dict(meta)
        m['sprite'] = os.path.basename(args.salida)
        m['notes'] = (meta.get('notes', '') +
                      ' Prueba: aro negro externo borrado, borde de %d px al %d %%.'
                      % (args.borde, round(args.factor * 100))).strip()
        json.dump(m, open(os.path.splitext(args.salida)[0] + '.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
