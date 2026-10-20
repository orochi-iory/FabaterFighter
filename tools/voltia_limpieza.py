#!/usr/bin/env python3
"""Saneado del modelo: pixeles limpios a resolucion de arte.

El problema, medido en `voltia/sheet_uniform.png` (5250x8300, dibujo a 2 px de
hoja por px de arte):

  - solo 18 colores opacos, o sea la PALETA esta bien;
  - pero el **52,85 % de los bloques 2x2 no son uniformes**: hay color a medio
    pixel (un bloque con 3 px de un tono y 1 de otro). Eso es lo que se ve como
    "colores mezclados y poco definidos", sobre todo en la cara;
  - a 1x, el 5,21 % de los pixeles (33 714) no tiene ni un vecino de su color:
    ruido de generacion (una mota cian en la cara, un magenta suelto en la
    mascara, un amarillo en la coleta).

Lo que hace este script, sin IA y sin tocar el dibujo de fondo:

  1. baja a resolucion de arte (1x) tomando, por cada bloque 2x2, el color
     MAYORITARIO (no el de la esquina): se acaba el color a medio pixel;
  2. pasa un filtro de ruido a 1x: el pixel cuyo color no aparece en ninguno de
     sus 8 vecinos pasa al color mayoritario de esos vecinos;
  3. vuelve a subir a 2x con NEAREST: todos los bloques quedan uniformes.

El alfa no se inventa: un bloque sigue opaco si al menos `--alfa` de sus 4 px
lo estaban (2 por defecto, misma silueta a ojo; 3 adelgaza, 4 recorta).

    PYTHONPATH=tools/pylibs python3 tools/voltia_limpieza.py --solo-ver --filas 0
    PYTHONPATH=tools/pylibs python3 tools/voltia_limpieza.py          # hoja entera
"""
import argparse
import hashlib
import json
import os
import sys
from collections import Counter

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOJA = os.path.join(BASE, 'voltia/sheet_uniform.png')
META = os.path.join(BASE, 'voltia/sheet.json')
STAGE = os.path.join(BASE, 'voltia/stage/fighter.png')
CAJA_FIGHTER = (78, 19, 272, 325)
FIGHTER = (97, 153)
V8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
# Tonos oscuros de la paleta. Si un bloque 2x2 lleva UNO de estos aunque sea
# minoria, gana el: son los trazos del dibujo (el ojo, la boca, la linea del
# menton). Sin esto, la mayoria por bloque se come la cara.
OSCUROS = {(1, 1, 2), (37, 5, 42), (18, 19, 63), (47, 10, 84)}


def a_arte(cel, escala, umbral_alfa, proteger=True):
    """Baja a 1x por mayoria de color. Devuelve (imagen 1x, px opacos antes/despues)."""
    w, h = cel.size
    w1, h1 = w // escala, h // escala
    src = cel.load()
    out = Image.new('RGBA', (w1, h1), (0, 0, 0, 0))
    dst = out.load()
    op_antes = op_despues = 0
    for y in range(h1):
        for x in range(w1):
            c = Counter()
            op = 0
            for dy in range(escala):
                for dx in range(escala):
                    p = src[x * escala + dx, y * escala + dy]
                    if p[3]:
                        op += 1
                        c[p[:3]] += 1
            op_antes += op
            if op >= umbral_alfa and c:
                # desempate: mas repetido y, a igualdad, el mas claro (menos ruido
                # oscuro en zonas iluminadas). Counter mantiene el orden de llegada.
                osc = [k for k in c if k in OSCUROS] if proteger else []
                if osc:
                    mejor = max(osc, key=lambda k: c[k])
                else:
                    mejor = max(c.items(), key=lambda kv: (kv[1], sum(kv[0])))[0]
                dst[x, y] = (mejor[0], mejor[1], mejor[2], 255)
                op_despues += 1
    return out, op_antes, op_despues


def quitar_ruido(im1, pasadas=1):
    """El pixel sin ningun vecino de su color pasa al color mayoritario de al lado."""
    w, h = im1.size
    total = 0
    for _ in range(pasadas):
        src = im1.copy().load()
        dst = im1.load()
        cambios = []
        for y in range(h):
            for x in range(w):
                p = src[x, y]
                if not p[3]:
                    continue
                vecinos = []
                for dx, dy in V8:
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy < h:
                        q = src[xx, yy]
                        if q[3]:
                            vecinos.append(q[:3])
                if not vecinos:
                    continue
                if any(v == p[:3] for v in vecinos):
                    continue
                cambios.append((x, y, Counter(vecinos).most_common(1)[0][0]))
        for x, y, col in cambios:
            dst[x, y] = (col[0], col[1], col[2], 255)
        total += len(cambios)
        if not cambios:
            break
    return im1, total


def medir(im):
    """Bloques 2x2 no uniformes y ruido a 1x."""
    px = im.load()
    W, H = im.size
    uni = no = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            a, b, c, d = px[x, y], px[x + 1, y], px[x, y + 1], px[x + 1, y + 1]
            if not any(p[3] for p in (a, b, c, d)):
                continue
            if a == b == c == d:
                uni += 1
            else:
                no += 1
    uno = im.resize((W // 2, H // 2), Image.NEAREST)
    p1 = uno.load()
    w1, h1 = uno.size
    ruido = op = 0
    for y in range(h1):
        for x in range(w1):
            q = p1[x, y]
            if not q[3]:
                continue
            op += 1
            if not any(0 <= x + dx < w1 and 0 <= y + dy < h1 and p1[x + dx, y + dy][3]
                       and p1[x + dx, y + dy][:3] == q[:3] for dx, dy in V8):
                ruido += 1
    return (100 * no / max(uni + no, 1), ruido, op, len(Counter(p for p in im.getdata() if p[3])))


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
    ap.add_argument('--escala', type=int, default=2, help='px de hoja por px de arte')
    ap.add_argument('--alfa', type=int, default=2, help='px opacos de 4 para seguir opaco')
    ap.add_argument('--pasadas', type=int, default=2, help='pasadas del filtro de ruido')
    ap.add_argument('--sin-proteger', action='store_true', help='no protege los trazos oscuros (se come la cara)')
    ap.add_argument('--filas', default='', help='solo estas filas (0,1,2)')
    ap.add_argument('--solo-ver', action='store_true', help='no escribe la hoja, deja la comparacion')
    args = ap.parse_args()

    im = Image.open(HOJA).convert('RGBA')
    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    cols, rows = im.size[0] // cw, im.size[1] // ch
    filas = set(int(x) for x in args.filas.split(',')) if args.filas else set(range(rows))

    out = im.copy()
    ruido_total = 0
    for r in sorted(filas):
        for c in range(cols):
            cel = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            if not cel.getbbox():
                continue
            uno, _, _ = a_arte(cel, args.escala, args.alfa, not args.sin_proteger)
            uno, n = quitar_ruido(uno, args.pasadas)
            ruido_total += n
            dos = uno.resize((cw, ch), Image.NEAREST)
            out.paste(dos, (c * cw, r * ch))
        print('  fila %2d lista' % r)

    u0, r0, o0, c0 = medir(im)
    u1, r1, o1, c1 = medir(out)
    print('\nbloques 2x2 no uniformes: %.2f %% -> %.2f %%' % (u0, u1))
    print('ruido a 1x: %d px (%.2f %%) -> %d px (%.2f %%)' % (r0, 100 * r0 / o0, r1, 100 * r1 / max(o1, 1)))
    print('px opacos a 1x: %d -> %d (%+.1f %%)' % (o0, o1, 100 * (o1 - o0) / o0))
    print('colores opacos: %d -> %d' % (c0, c1))
    print('pixeles corregidos por el filtro de ruido: %d' % ruido_total)

    # ---- comparacion: cara y cuerpo, antes / despues
    f = fuente(15)
    f2 = fuente(12)
    cajas = [('cara', (196, 28, 268, 108), 8), ('cuerpo', (150, 120, 300, 300), 4)]
    for nombre, caja, z in cajas:
        w, h = caja[2] - caja[0], caja[3] - caja[1]
        tw, th = w * z, h * z
        sal = Image.new('RGBA', (2 * tw + 30, th + 46), (238, 238, 242, 255))
        d = ImageDraw.Draw(sal)
        for i, (rot, src) in enumerate((('ANTES', im), ('DESPUES', out))):
            t = src.crop((caja[0], caja[1], caja[2], caja[3]))
            fr = Image.new('RGBA', t.size, (238, 238, 242, 255))
            fr.alpha_composite(t)
            sal.alpha_composite(fr.resize((tw, th), Image.NEAREST), (10 + i * (tw + 10), 30))
            d.text((12 + i * (tw + 10), 10), rot, font=f, fill=(20, 20, 40))
        d.text((12, th + 32), 'bloques 2x2 no uniformes: %.2f %% -> %.2f %%' % (u0, u1),
               font=f2, fill=(90, 90, 115))
        sal.convert('RGB').save(os.path.join(BASE, 'voltia/versions/limpieza_%s.png' % nombre))

    if args.solo_ver:
        print('(--solo-ver: la hoja no se ha tocado)')
        return

    out.save(HOJA)
    rev = hashlib.md5(open(HOJA, 'rb').read()).hexdigest()[:10]
    meta['rev'] = rev
    meta['notes'] = (meta.get('notes', '').split(' | Saneado')[0] +
                     ' | Saneado: pixel limpio a resolucion de arte (mayoria por bloque %dx%d, '
                     'umbral de alfa %d/4, filtro de ruido %d pasadas).' % (args.escala, args.escala, args.alfa, args.pasadas))
    json.dump(meta, open(META, 'w'), indent=1)
    c0_ = out.crop((0, 0, cw, ch))
    c0_.crop(CAJA_FIGHTER).resize(FIGHTER, Image.NEAREST).save(STAGE)
    print('hoja %s rev %s | fighter %s' % (HOJA, rev, STAGE))


if __name__ == '__main__':
    main()
