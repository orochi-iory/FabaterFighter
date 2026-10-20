#!/usr/bin/env python3
"""Adelgazar el contorno de Voltia erosionando el alfa.

Ojo con las unidades: en la hoja el dibujo va a **2 px de hoja por px de arte**, y el
contorno mide **1-2 px de hoja**. Por eso `--px 2` (2 px de hoja = 1 px de arte) ya se
come el contorno entero y deja el azul del traje como borde.

Medido en el frame 0 del stance (celda 350x332, 31301 px opacos, alto 300):

    --px 1   29347 px (-6,2 %)   alto 298   1 pieza
    --px 2   27567 px (-11,9 %)  alto 296   1 pieza   <- el elegido
    --px 4   24151 px (-22,8 %)  alto 292   agujero en la axila
    --px 6   20857 px (-33,4 %)  alto 288   hueco entre brazo y costado
    --px 8   17649 px (-43,6 %)  alto 284   el brazo se despega

Lo que hace:
  1. parte de `voltia/versions/sheet_borde_verde.png` (el borde verde sin filete);
  2. erosiona el alfa `--px` px de hoja (MinFilter 3, una vez por px);
  3. guarda la hoja en `voltia/sheet_uniform.png` y actualiza `rev` en `sheet.json`;
  4. rehace `voltia/stage/fighter.png` con la receta exacta del original
     (recorte (78,19)-(272,325) del frame 0 a la mitad -> 97x153);
  5. escribe la comparacion y la hoja entera de control.

    PYTHONPATH=tools/pylibs python3 tools/voltia_contorno.py --px 2
    PYTHONPATH=tools/pylibs python3 tools/voltia_contorno.py --px 2 --solo-ver   # no toca nada
"""
import argparse
import hashlib
import json
import os
from collections import deque

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(BASE, 'voltia/versions/sheet_borde_verde.png')
HOJA = os.path.join(BASE, 'voltia/sheet_uniform.png')
META = os.path.join(BASE, 'voltia/sheet.json')
STAGE = os.path.join(BASE, 'voltia/stage/fighter.png')
CAJA_FIGHTER = (78, 19, 272, 325)
FIGHTER = (97, 153)


def erosionar(im, px):
    """Adelgaza el alfa `px` px (8-vecinos): MinFilter 3 repetido."""
    out = im.copy()
    a = im.split()[3]
    for _ in range(px):
        a = a.filter(ImageFilter.MinFilter(3))
    out.putalpha(a)
    return out


def piezas(mask):
    w, h = mask.size
    px = mask.load()
    visto = [[False] * w for _ in range(h)]
    n = 0
    mayores = []
    for y in range(h):
        for x in range(w):
            if px[x, y] and not visto[y][x]:
                n += 1
                q = deque([(x, y)])
                visto[y][x] = True
                t = 0
                while q:
                    cx, cy = q.popleft()
                    t += 1
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not visto[ny][nx] and px[nx, ny]:
                            visto[ny][nx] = True
                            q.append((nx, ny))
                mayores.append(t)
    return n, sorted(mayores, reverse=True)[:3]


def agujeros(mask):
    """Huecos de transparencia encerrados por el dibujo (los que despiezan)."""
    w, h = mask.size
    px = mask.load()
    visto = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not px[x, y] and not visto[y][x]:
                visto[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not px[x, y] and not visto[y][x]:
                visto[y][x] = True
                q.append((x, y))
    while q:
        cx, cy = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visto[ny][nx] and not px[nx, ny]:
                visto[ny][nx] = True
                q.append((nx, ny))
    n = 0
    mayor = 0
    for y in range(h):
        for x in range(w):
            if not px[x, y] and not visto[y][x]:
                n += 1
                qq = deque([(x, y)])
                visto[y][x] = True
                t = 0
                while qq:
                    cx, cy = qq.popleft()
                    t += 1
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not visto[ny][nx] and not px[nx, ny]:
                            visto[ny][nx] = True
                            qq.append((nx, ny))
                mayor = max(mayor, t)
    return n, mayor


def opaco_de(im):
    return Image.eval(im.split()[3], lambda v: 255 if v > 0 else 0)


def fuente(tam):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, tam)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--px', type=int, default=2, help='px de HOJA que se comen (2 = 1 px de arte)')
    ap.add_argument('--solo-ver', action='store_true', help='no escribe la hoja, solo la comparacion')
    args = ap.parse_args()
    k = args.px

    base = Image.open(FUENTE).convert('RGBA')
    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    cols, rows = base.size[0] // cw, base.size[1] // ch

    nuevo = erosionar(base, k)

    # ---- control por filas: opacos, piezas y agujeros de la celda 0 de cada fila
    print('fila  opacos(antes -> ahora)      piezas  agujero mayor')
    for r in range(rows):
        y0, y1 = r * ch, (r + 1) * ch
        a0 = opaco_de(base.crop((0, y0, cw, y1)))
        a1 = opaco_de(nuevo.crop((0, y0, cw, y1)))
        if not a1.getbbox():
            continue
        n0 = sum(1 for p in a0.getdata() if p)
        n1 = sum(1 for p in a1.getdata() if p)
        np_, may = piezas(a1)
        nh, hm = agujeros(a1)
        print('%4d  %6d -> %6d (%+5.1f %%)  %5d  %5d px  (%d huecos)'
              % (r, n0, n1, 100 * (n1 - n0) / max(n0, 1), np_, hm, nh))

    caja = (60, 10, 300, 332)
    BG = (238, 238, 242, 255)
    f = fuente(15)
    f2 = fuente(12)
    pasos = [0, 2, 4]
    z = 2.6
    w, h = caja[2] - caja[0], caja[3] - caja[1]
    tw, th = int(w * z), int(h * z)
    sal = Image.new('RGBA', (len(pasos) * (tw + 12) + 12, th + 60), BG)
    d = ImageDraw.Draw(sal)
    d.text((12, 6), 'Contorno −%d px de hoja (%0.1f px de arte). Comparado con el original y con −4'
           % (k, k / 2.0), font=f, fill=(20, 20, 40))
    for i, p in enumerate(pasos):
        im = erosionar(base, p).crop(caja)
        fr = Image.new('RGBA', im.size, BG)
        fr.alpha_composite(im)
        sal.alpha_composite(fr.resize((tw, th), Image.NEAREST), (12 + i * (tw + 12), 30))
        etiqueta = {0: 'ORIGINAL', 2: 'AHORA: −2 px hoja', 4: 'referencia: −4 px hoja'}[p]
        d.text((14 + i * (tw + 12), th + 36), etiqueta, font=f if p == k else f2,
               fill=(20, 20, 40) if p == k else (110, 110, 135))
    sal.convert('RGB').save(os.path.join(BASE, 'voltia/versions/prueba_contorno_elegido.png'))

    if args.solo_ver:
        print('(--solo-ver: no se ha tocado la hoja)')
        return

    nuevo.save(HOJA)
    rev = hashlib.md5(open(HOJA, 'rb').read()).hexdigest()[:10]
    meta['sprite'] = 'sheet_uniform.png'
    meta['rev'] = rev
    meta['notes'] = ('Modelo de Voltia con borde verde y el contorno adelgazado %d px de hoja '
                     '(= %0.1f px de arte). Se erosiona SOLO el alfa: no se recolorea nada y '
                     'el dibujo de dentro no se mueve. Alfa del original con filete: '
                     'voltia/versions/sheet_borde_verde.png.' % (k, k / 2.0))
    json.dump(meta, open(META, 'w'), indent=1)

    c = nuevo.crop((0, 0, cw, ch))
    figh = c.crop(CAJA_FIGHTER).resize(FIGHTER, Image.NEAREST)
    figh.save(STAGE)
    print('%s  rev %s' % (HOJA, rev))
    print('%s  %s' % (STAGE, figh.size))

    # hoja entera de control
    nom = {a['row']: a['id'] for a in meta['animations']}
    esca = 0.30
    tw2, th2 = int(nuevo.size[0] * esca), int(nuevo.size[1] * esca)
    gut = 190
    hs = Image.new('RGBA', (tw2 + gut + 14, th2 + 46), BG)
    dh = ImageDraw.Draw(hs)
    dh.text((10, 8), 'VOLTIA · contorno −%d px de hoja · 25 filas' % k, font=f, fill=(20, 20, 40))
    plano = Image.new('RGBA', nuevo.size, BG)
    plano.alpha_composite(nuevo)
    hs.alpha_composite(plano.resize((tw2, th2), Image.LANCZOS), (gut + 10, 36))
    for r in range(rows):
        y = 36 + int(r * ch * esca)
        dh.text((8, y + int(ch * esca / 2) - 14), '%02d' % r, font=f, fill=(20, 20, 40))
        dh.text((8, y + int(ch * esca / 2) + 1), nom.get(r, '')[:19], font=f2, fill=(60, 60, 90))
    hs.convert('RGB').save(os.path.join(BASE, 'voltia/versions/hoja_contorno_%dpx.png' % k))
    print('control: voltia/versions/hoja_contorno_%dpx.png' % k)


if __name__ == '__main__':
    main()
