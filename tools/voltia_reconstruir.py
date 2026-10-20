#!/usr/bin/env python3
"""Reconstruccion desde cero: nativo -> 1x de arte -> limpio -> hoja 2x.

Por que asi
-----------
Medido sobre `voltia/frames/voltia_stance_0.png` (rejilla exacta 4x):

  - a 4x: **0,00 %** de grano (ningun pixel con vecino de otro color);
  - a 1x de arte (97x153): **7,13 %** de grano.

O sea: el ruido no lo metio el reescalado, esta **dentro del dibujo**, un nivel por
debajo. Es el "colores mezclados" de la cara. En el repo no hay nada mas limpio que
rescatar (`assets/voltia_spritesheet.png` es otro diseno, 48 colores, 64x64).

Lo que hace este script, por frame
----------------------------------
1. baja el nativo a **1x de arte** con NEAREST (÷4 exacto): el pixel real del dibujo;
2. **limpia el grano por masa local**: si el color de un pixel aparece 3 veces o menos
   en su entorno 5x5, pasa al color mayoritario de sus 8 vecinos. Se **protegen** el
   negro de linea y el cian del borde, que son trazos finos de verdad;
3. opcional `--comer N`: erosiona N px de arte del contorno;
4. sube a **2x** con NEAREST: todos los bloques 2x2 uniformes por construccion;
5. monta la hoja 350x332 por celda, con el mismo encuadre (centro de tinta y linea
   de pies de la celda actual) y **pegado alineado a par**.

    PYTHONPATH=tools/pylibs python3 tools/voltia_reconstruir.py --solo-ver
    PYTHONPATH=tools/pylibs python3 tools/voltia_reconstruir.py --comer 1
"""
import argparse
import hashlib
import json
import os
from collections import Counter

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOJA = os.path.join(BASE, 'voltia/sheet_uniform.png')
META = os.path.join(BASE, 'voltia/sheet.json')
FRAMES = os.path.join(BASE, 'voltia/frames')
STAGE = os.path.join(BASE, 'voltia/stage/fighter.png')
CAJA_FIGHTER = (78, 19, 272, 325)
FIGHTER = (97, 153)
NATIVO = 4          # px de hoja por px de arte en los frames de voltia/frames
HOJA_PX = 2         # px de hoja por px de arte en la hoja
NEGRO = {(1, 1, 2)}
CIAN = {(5, 176, 157)}
V8 = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))


def grano(im):
    px = im.load()
    W, H = im.size
    op = no = 0
    for y in range(H):
        for x in range(W):
            q = px[x, y]
            if not q[3]:
                continue
            op += 1
            if not any(0 <= x + dx < W and 0 <= y + dy < H and px[x + dx, y + dy][3]
                       and px[x + dx, y + dy][:3] == q[:3] for dx, dy in V8):
                no += 1
    return no, op


def limpiar(im, pasadas=3, masa=2, proteger=(NEGRO, CIAN)):
    """Quita grano: el color con poca masa local pasa al mayoritario de al lado."""
    im = im.copy()
    for _ in range(pasadas):
        src = im.copy().load()
        dst = im.load()
        W, H = im.size
        cambios = []
        for y in range(H):
            for x in range(W):
                q = src[x, y]
                if not q[3]:
                    continue
                if any(q[:3] in g for g in proteger):
                    continue
                entorno = [src[x + dx, y + dy][:3]
                           for dy in range(-2, 3) for dx in range(-2, 3)
                           if 0 <= x + dx < W and 0 <= y + dy < H and src[x + dx, y + dy][3]]
                if entorno.count(q[:3]) > masa:
                    continue
                vecinos = [src[x + dx, y + dy][:3] for dx, dy in V8
                           if 0 <= x + dx < W and 0 <= y + dy < H and src[x + dx, y + dy][3]]
                if not vecinos:
                    continue
                cambios.append((x, y, Counter(vecinos).most_common(1)[0][0]))
        for x, y, c in cambios:
            dst[x, y] = (c[0], c[1], c[2], 255)
        if not cambios:
            break
    return im


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
    ap.add_argument('--comer', type=int, default=0, help='px de ARTE erosionados del contorno')
    ap.add_argument('--pasadas', type=int, default=3)
    ap.add_argument('--solo-ver', action='store_true')
    args = ap.parse_args()

    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    actual = Image.open(HOJA).convert('RGBA')

    nueva = Image.new('RGBA', actual.size, (0, 0, 0, 0))
    for a in meta['animations']:
        r = a['row']
        for i in range(a['frames']):
            p = os.path.join(FRAMES, 'voltia_%s_%d.png' % (a['id'], i))
            nativo = Image.open(p).convert('RGBA')
            uno = nativo.resize((nativo.size[0] // NATIVO, nativo.size[1] // NATIVO), Image.NEAREST)
            uno = limpiar(uno, args.pasadas)
            if args.comer:
                al = uno.split()[3]
                for _ in range(args.comer):
                    al = al.filter(ImageFilter.MinFilter(3))
                uno.putalpha(al)
            arte = uno.resize((uno.size[0] * HOJA_PX, uno.size[1] * HOJA_PX), Image.NEAREST)
            bb = arte.split()[3].getbbox()
            if not bb:
                continue
            cel_vieja = actual.crop((i * cw, r * ch, (i + 1) * cw, (r + 1) * ch))
            bb_v = cel_vieja.split()[3].getbbox()
            if bb_v:
                cx = (bb_v[0] + bb_v[2]) / 2.0
                pies = bb_v[3]
            else:
                cx, pies = cw / 2.0, ch - 4
            ancho, alto = bb[2] - bb[0], bb[3] - bb[1]
            x = int(round(cx - ancho / 2.0 - bb[0]))
            y = int(round(pies - alto - bb[1]))
            x = max(0, min(cw - arte.size[0], x))
            y = max(0, min(ch - arte.size[1], y))
            x -= x % 2
            y -= y % 2
            nueva.alpha_composite(arte, (i * cw + x, r * ch + y))
        print('  fila %2d (%s)' % (r, a['id']))

    # ---- medidas en el frame 0 del stance, a 1x de arte
    def a1x(im):
        return im.crop((0, 0, cw, ch)).resize((cw // HOJA_PX, ch // HOJA_PX), Image.NEAREST)

    g0 = grano(a1x(actual))
    g1 = grano(a1x(nueva))
    print('\ngrano (frame 0, a 1x de arte): %d/%d (%.2f %%) -> %d/%d (%.2f %%)'
          % (g0[0], g0[1], 100 * g0[0] / g0[1], g1[0], g1[1], 100 * g1[0] / g1[1]))
    px = nueva.load()
    W, H = nueva.size
    uni = no = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            b = [px[x + i, y + j] for i in range(2) for j in range(2)]
            if not any(q[3] for q in b):
                continue
            if all(q == b[0] for q in b):
                uni += 1
            else:
                no += 1
    print('bloques 2x2 no uniformes: %.2f %%' % (100 * no / (uni + no)))
    cols = len({p for p in nueva.getdata() if p[3]})
    print('colores opacos: %d (antes %d)' % (cols, len({p for p in actual.getdata() if p[3]})))

    # ---- comparaciones
    f = fuente(15)
    f2 = fuente(12)
    BG = (238, 238, 242, 255)
    cajas = (('cara', (196, 28, 268, 108), 8), ('cuerpo', (60, 10, 300, 332), 2.4))
    for nombre, caja, z in cajas:
        w, h = caja[2] - caja[0], caja[3] - caja[1]
        tw, th = int(w * z), int(h * z)
        sal = Image.new('RGBA', (2 * tw + 30, th + 46), BG)
        d = ImageDraw.Draw(sal)
        for i, (rot, src) in enumerate((('ANTES (LANCZOS)', actual), ('RECONSTRUIDA Y LIMPIA', nueva))):
            t = src.crop((caja[0], caja[1], caja[2], caja[3]))
            fr = Image.new('RGBA', t.size, BG)
            fr.alpha_composite(t)
            sal.alpha_composite(fr.resize((tw, th), Image.NEAREST), (10 + i * (tw + 10), 30))
            d.text((12 + i * (tw + 10), 10), rot, font=f, fill=(20, 20, 40))
        d.text((12, th + 32), 'grano a 1x: %.2f %% -> %.2f %%' % (100 * g0[0] / g0[1], 100 * g1[0] / g1[1]),
               font=f2, fill=(90, 90, 115))
        sal.convert('RGB').save(os.path.join(BASE, 'voltia/versions/rebuild_%s.png' % nombre))

    if args.solo_ver:
        print('(--solo-ver: no se ha tocado la hoja)')
        return

    nueva.save(HOJA)
    rev = hashlib.md5(open(HOJA, 'rb').read()).hexdigest()[:10]
    meta['rev'] = rev
    meta['notes'] = ('Reconstruida desde los frames nativos: ÷4 a 1x de arte con NEAREST, grano '
                     'quitado por masa local (negro y cian protegidos), %d px de arte comidos del '
                     'contorno, y ×2 NEAREST a la hoja. Sin LANCZOS en ningun paso.' % args.comer)
    json.dump(meta, open(META, 'w'), indent=1)
    nueva.crop((0, 0, cw, ch)).crop(CAJA_FIGHTER).resize(FIGHTER, Image.NEAREST).save(STAGE)
    print('hoja %s rev %s | fighter %s' % (HOJA, rev, STAGE))

    nom = {a['row']: a['id'] for a in meta['animations']}
    esca = 0.30
    tw2, th2 = int(nueva.size[0] * esca), int(nueva.size[1] * esca)
    gut = 190
    hs = Image.new('RGBA', (tw2 + gut + 14, th2 + 46), BG)
    dh = ImageDraw.Draw(hs)
    dh.text((10, 8), 'VOLTIA · reconstruida desde cero · 25 filas', font=f, fill=(20, 20, 40))
    plano = Image.new('RGBA', nueva.size, BG)
    plano.alpha_composite(nueva)
    hs.alpha_composite(plano.resize((tw2, th2), Image.LANCZOS), (gut + 10, 36))
    for r in range(nueva.size[1] // ch):
        y = 36 + int(r * ch * esca)
        dh.text((8, y + int(ch * esca / 2) - 14), '%02d' % r, font=f, fill=(20, 20, 40))
        dh.text((8, y + int(ch * esca / 2) + 1), nom.get(r, '')[:19], font=f2, fill=(60, 60, 90))
    hs.convert('RGB').save(os.path.join(BASE, 'voltia/versions/hoja_reconstruida.png'))
    print('control: voltia/versions/hoja_reconstruida.png')


if __name__ == '__main__':
    main()
