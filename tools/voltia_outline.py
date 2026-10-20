#!/usr/bin/env python3
"""Voltia sin el aro negro: adelgazarlo, no borrarlo.

La hoja original (`voltia/sheet_uniform.png`) NO se toca: se escribe una copia.

Lo medido en el frame 0 del stance (celda 350x332):

  - 9388 px de 32644 opacos (29 %) son casi negros (max(r,g,b) <= 6);
  - el aro no tiene grosor fijo: 1-2 px en la cara, hasta 10-12 px en la cola;
  - 2124 de esos px estan a mas de 6 px del borde: dentro del negro hay tambien
    lineas de dibujo de verdad (brazo sobre torso, rodilla).

Borrar el negro NO vale (probado): al quitarlo se va tambien lo que sujetaba el
dibujo y salen piezas sueltas -- la mano deja de tocar el brazo, el cinturon y la
bota se parten, aparecen puntos sueltos. El sprite queda despiezado.

Lo que se hace aqui, sin tocar un solo pixel de alfa (la silueta es la misma):

  profundidad 1-2 (el borde que da al fondo)  -> se queda OSCURO, x0,32 del color
                                                 de al lado: el contorno de 2 px
  profundidad 3 y mas (el resto del aro)      -> toma el color del dibujo tal cual:
                                                 deja de ser un aro, pasa a ser
                                                 sombra del propio dibujo
  negro encerrado por color (lineas)          -> NO se toca: sigue siendo negro

Lo que queda negro son solo trazos de dentro (2124 px por celda, 2,3 % del
opaco); el aro de fuera deja de ser negro.

El color de cada px no se difunde (una difusion por vecinos inunda el aro con el
primer color que entra): se toma el del trozo de dibujo mas cercano con distancia
de chamfer (1 / 1,4).

    PYTHONPATH=tools/pylibs python3 tools/voltia_outline.py --celdas 0
    PYTHONPATH=tools/pylibs python3 tools/voltia_outline.py           # hoja entera
"""
import argparse
import json
import os

from PIL import Image, ImageChops, ImageFilter

HOJA = 'voltia/sheet_uniform.png'
META = 'voltia/sheet.json'
UMBRAL = 6          # max(r,g,b) <= UMBRAL cuenta como negro
CONTORNO = 2        # px de contorno oscuro que se dejan
OSCURO = 0.32       # cuanto se oscurece ese contorno
MAXD = 64.0


def mascaras(cel):
    r, g, b, a = cel.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    dark = Image.eval(mx, lambda v: 255 if v <= UMBRAL else 0)
    opaco = Image.eval(a, lambda v: 255 if v > 0 else 0)
    return ImageChops.multiply(dark, opaco), opaco


def anillos(dark, opaco, maximo=48):
    """Profundidad del negro contada desde la transparencia: 1 = toca el fondo."""
    prof = Image.new('L', dark.size, 0)
    transp = ImageChops.subtract(opaco, dark)
    dentro = transp
    for _ in range(2):
        dentro = dentro.filter(ImageFilter.MaxFilter(3))
    nivel = ImageChops.multiply(dark, dentro)
    for k in range(1, maximo + 1):
        if not nivel.getbbox():
            break
        prof.paste(k, (0, 0), nivel)
        sig = nivel.filter(ImageFilter.MinFilter(3))
        nivel = sig
    return prof


def externo_de(dark, opaco, iteraciones=24):
    """Negro conectado con la transparencia (el aro). El resto es linea de dibujo."""
    transp = ImageChops.subtract(opaco, dark)
    dentro = transp
    for _ in range(2):
        dentro = dentro.filter(ImageFilter.MaxFilter(3))
    crecido = ImageChops.multiply(dark, dentro)
    w, h = dark.size
    for _ in range(iteraciones):
        nuevo = crecido
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            mov = Image.new('L', (w, h), 0)
            mov.paste(crecido, (dx, dy))
            nuevo = ImageChops.lighter(nuevo, mov)
        nuevo = ImageChops.multiply(nuevo, dark)
        if ImageChops.difference(nuevo, crecido).getbbox() is None:
            break
        crecido = nuevo
    return crecido


def chamfer(cel, dark):
    """Color del px de dibujo mas cercano (distancia 1 / 1.4). No difunde."""
    w, h = cel.size
    px = cel.load()
    dp = dark.load()
    dist = [MAXD] * (w * h)
    col = [(0, 0, 0)] * (w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and not dp[x, y]:
                dist[base + x] = 0.0
                col[base + x] = (r, g, b)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if dist[i] == 0:
                continue
            best, bc = dist[i], col[i]
            for dx, dy, wgt in ((-1, 0, 1.0), (0, -1, 1.0), (-1, -1, 1.414), (1, -1, 1.414)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < w and 0 <= yy < h:
                    j = yy * w + xx
                    if dist[j] + wgt < best:
                        best, bc = dist[j] + wgt, col[j]
            dist[i], col[i] = best, bc
    for y in range(h - 1, -1, -1):
        for x in range(w - 1, -1, -1):
            i = y * w + x
            if dist[i] == 0:
                continue
            best, bc = dist[i], col[i]
            for dx, dy, wgt in ((1, 0, 1.0), (0, 1, 1.0), (1, 1, 1.414), (-1, 1, 1.414)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < w and 0 <= yy < h:
                    j = yy * w + xx
                    if dist[j] + wgt < best:
                        best, bc = dist[j] + wgt, col[j]
            dist[i], col[i] = best, bc
    return dist, col


def linea_fina(dark, fill, radio=2):
    """Negro que tiene color a los dos lados: linea de dibujo, no mancha.

    Se mira a `radio` px: si a la izquierda y a la derecha hay color (o arriba y
    abajo), ese negro es un trazo y se respeta. En el aro gordo, a 2 px solo hay
    mas negro, asi que no cuenta.
    """
    w, h = dark.size
    cerca = fill
    for _ in range(radio):
        cerca = cerca.filter(ImageFilter.MaxFilter(3))

    def desplaza(im, dx, dy):
        out = Image.new('L', (w, h), 0)
        out.paste(im, (dx, dy))
        return out

    hor = ImageChops.multiply(desplaza(cerca, -radio, 0), desplaza(cerca, radio, 0))
    ver = ImageChops.multiply(desplaza(cerca, 0, -radio), desplaza(cerca, 0, radio))
    return ImageChops.multiply(ImageChops.lighter(hor, ver), dark)


def limpiar_celda(cel, contorno=CONTORNO, oscuro=OSCURO, radio=2):
    """Adelgaza el aro: fuera lo que no es ni borde exterior ni trazo fino."""
    dark, opaco = mascaras(cel)
    n = sum(1 for p in dark.getdata() if p)
    if not n:
        return cel, 0
    prof = anillos(dark, opaco).load()
    fill = ImageChops.multiply(ImageChops.invert(dark), opaco)
    trazo = linea_fina(dark, fill, radio)
    # se rellena: negro que no es el borde exterior (profundidad <= contorno) y
    # que no es trazo fino
    prof_img = anillos(dark, opaco)
    exterior = Image.eval(prof_img, lambda v: 255 if 0 < v <= contorno else 0)
    mancha = ImageChops.subtract(dark, ImageChops.lighter(exterior, trazo))
    dist, col = chamfer(cel, dark)
    w, h = cel.size
    px = cel.load()
    out = cel.copy()
    po = out.load()
    pm = mancha.load()
    pe = exterior.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            if pm[x, y]:                       # se rellena con el color de al lado
                i = y * w + x
                if dist[i] >= MAXD:
                    continue
                r, g, b = col[i]
                po[x, y] = (r, g, b, 255)
            elif pe[x, y]:                     # borde exterior: oscuro, no negro
                i = y * w + x
                if dist[i] >= MAXD:
                    continue
                r, g, b = col[i]
                po[x, y] = (int(r * oscuro), int(g * oscuro), int(b * oscuro), 255)
            # el resto (trazos) se queda como esta
    return out, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--celdas', default='', help='filas a procesar: 0,1,2 (por defecto todas)')
    ap.add_argument('--contorno', type=int, default=CONTORNO)
    ap.add_argument('--oscuro', type=float, default=OSCURO)
    ap.add_argument('--radio', type=int, default=2, help='px a los que se busca color a los dos lados')
    ap.add_argument('--salida', default='voltia/sheet_outline.png')
    args = ap.parse_args()

    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    im = Image.open(HOJA).convert('RGBA')
    cols, rows = im.size[0] // cw, im.size[1] // ch
    filas = set(int(x) for x in args.celdas.split(',')) if args.celdas else None
    print('hoja %dx%d, %d x %d celdas de %dx%d' % (im.size[0], im.size[1], cols, rows, cw, ch))

    out = im.copy()
    antes = 0
    for r in range(rows):
        if filas is not None and r not in filas:
            continue
        for c in range(cols):
            cel = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            if not cel.getbbox():
                continue
            nuevo, n = limpiar_celda(cel, args.contorno, args.oscuro, args.radio)
            antes += n
            out.paste(nuevo, (c * cw, r * ch))
        print('  fila %2d lista' % r)

    if filas is None:
        out.save(args.salida)
    else:
        y0 = min(filas) * ch
        out.crop((0, y0, im.size[0], (max(filas) + 1) * ch)).save(args.salida)
    despues = 0
    for c in range(cols):
        cel = out.crop((c * cw, 0, (c + 1) * cw, ch))
        despues += sum(1 for p in mascaras(cel)[0].getdata() if p)
    print('%s: negro %d -> %d px' % (args.salida, antes, despues))
    if filas is None:
        m = dict(meta)
        m['sprite'] = os.path.basename(args.salida)
        m['notes'] = (meta.get('notes', '') +
                      ' Aro negro adelgazado: contorno de %d px al %d %%, resto del aro al %d %%, '
                      'lineas internas al %d %%. Alfa sin tocar.'
                      % (args.contorno, round(args.oscuro * 100), round(args.relleno * 100),
                         round(args.linea * 100))).strip()
        json.dump(m, open(os.path.splitext(args.salida)[0] + '.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
