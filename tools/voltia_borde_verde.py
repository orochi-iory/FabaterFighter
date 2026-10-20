#!/usr/bin/env python3
"""Borde verde SIN el filete cian: vuelve al sprite de `fff5dc0` y quita solo el
trazo cian que cruzaba el traje.

De donde sale esto
------------------
`fff5dc0` ("Voltia pierde el contorno") es el ultimo estado con **borde verde**:
un filo de 1 px encima de la silueta, de tres tonos (negro fino, cian 5,176,157
y azul 22,81,104). El commit siguiente, `35b40ca`, lo convirtio en contorno negro
grueso: 1954 px de borde -> 1612 px de negro macizo, +1343 px de silueta.

`3dba241` limpio despues el **filete cian** que cruzaba la cadera y el muslo, pero
se lo llevo *todo*: cambio los 22648 px cian de la hoja, borde incluido.

Aqui se separan los dos:
  - cian que **toca la transparencia** (profundidad 1-2) = borde -> SE QUEDA;
  - cian **rodeado de opaco** = filete -> se sustituye por el color del pixel
    de dibujo mas cercano (chamfer 1 / 1,4), sin tocar el alfa y sin engordar
    la silueta.

    PYTHONPATH=tools/pylibs python3 tools/voltia_borde_verde.py
"""
import json
import os

from PIL import Image, ImageChops, ImageFilter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOJA = os.path.join(BASE, 'voltia/versions/sheet_verde.png')   # fff5dc0
META = os.path.join(BASE, 'voltia/versions/sheet_verde.json')
SALIDA = os.path.join(BASE, 'voltia/sheet_verde_limpio.png')
CIAN = (5, 176, 157)
MAXD = 64.0


def opaco_de(im):
    a = im.split()[3]
    return Image.eval(a, lambda v: 255 if v > 0 else 0)


def aro_exterior(op):
    """Opaco que toca la transparencia: se EROSIONA el opaco y se resta.

    Ojo: crecer el opaco y restarlo no vale, el crecido ya contiene al original
    y la resta sale vacia (me paso, y el filete se comio los 60453 px de cian).
    """
    dentro = op.filter(ImageFilter.MinFilter(3))
    return ImageChops.subtract(op, dentro)   # 1 en el filo


def chamfer_color(cel, objetivo):
    """Color del pixel NO cian mas cercano (dist 1 / 1,4)."""
    w, h = cel.size
    px = cel.load()
    mask = objetivo.load()
    dist = [MAXD] * (w * h)
    col = [(0, 0, 0)] * (w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and not mask[x, y]:
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


def limpiar(cel):
    """Devuelve la celda con el filete cian fuera y el borde cian intacto."""
    px = cel.load()
    w, h = cel.size
    cian = Image.new('L', (w, h), 0)
    pc = cian.load()
    n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and (r, g, b) == CIAN:
                pc[x, y] = 255
                n += 1
    if not n:
        return cel, 0, 0
    op = opaco_de(cel)
    filo = aro_exterior(op)
    borde = ImageChops.multiply(cian, filo)          # cian del contorno: se queda
    filete = ImageChops.subtract(cian, borde)        # cian de dentro: fuera
    dist, col = chamfer_color(cel, cian)
    out = cel.copy()
    po = out.load()
    pf = filete.load()
    tocados = 0
    for y in range(h):
        for x in range(w):
            if not pf[x, y]:
                continue
            i = y * w + x
            if dist[i] >= MAXD:
                continue
            r, g, b = col[i]
            po[x, y] = (r, g, b, 255)
            tocados += 1
    return out, n, tocados


def main():
    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    im = Image.open(HOJA).convert('RGBA')
    out = im.copy()
    cols, rows = im.size[0] // cw, im.size[1] // ch
    total_cian = total_filete = 0
    for r in range(rows):
        for c in range(cols):
            cel = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            if not cel.getbbox():
                continue
            nuevo, n, toc = limpiar(cel)
            total_cian += n
            total_filete += toc
            out.paste(nuevo, (c * cw, r * ch))
        print('  fila %2d lista' % r)

    # el alfa tiene que quedar igual que en la version de borde verde
    igual = ImageChops.difference(out.split()[3], im.split()[3]).getbbox() is None
    out.save(SALIDA)

    m = dict(meta)
    m['sprite'] = os.path.basename(SALIDA)
    m['notes'] = ('Borde verde de fff5dc0 con el filete cian quitado. El cian del contorno '
                  '(%d px) se queda; el de dentro (%d px) se sustituye por el color del '
                  'trazo mas cercano. Alfa sin tocar.' % (total_cian - total_filete, total_filete))
    json.dump(m, open(os.path.splitext(SALIDA)[0] + '.json', 'w'), indent=1)
    print('%s: cian %d px, de ellos filete de dentro %d px sustituidos; alfa identico: %s'
          % (SALIDA, total_cian, total_filete, igual))


if __name__ == '__main__':
    main()
