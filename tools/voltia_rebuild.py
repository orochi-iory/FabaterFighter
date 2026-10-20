#!/usr/bin/env python3
"""Reconstruir la hoja de Voltia desde los frames NATIVOS, sin reescalado fraccionario.

El origen de los artefactos
---------------------------
Los frames de `voltia/frames/voltia_<anim>_<i>.png` tienen **rejilla de pixel exacta
de 4x** (medido: 0,00 % de bloques 4x4 no uniformes). La hoja se armaba en
`voltia/normalize.py -> art_image()` con `Image.LANCZOS` y un factor **no entero**
(el scale que iguala la altura de la cabeza). LANCZOS sobre pixel art inventa
medios pixeles: de ahi salen los cuadrados sueltos, los bordes poco lisos y el
morado donde el azul se mezcla con el rosa. Medido en la hoja entregada: 52,85 %
de los bloques 2x2 no eran uniformes.

Lo que hace este script
-----------------------
1. coge cada frame nativo y lo baja **exactamente /2** con NEAREST (4x -> 2x: cada
   bloque 4x4 es uniforme, asi que el resultado es la rejilla nativa intacta);
2. lo coloca en su celda 350x332 conservando el encuadre que ya tiene la hoja
   (mismo centro de tinta y misma linea de pies por celda);
3. no toca colores, ni contornos, ni alfa: no hay interpolacion de ningun tipo.

    PYTHONPATH=tools/pylibs python3 tools/voltia_rebuild.py --solo-ver
    PYTHONPATH=tools/pylibs python3 tools/voltia_rebuild.py
"""
import argparse
import hashlib
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voltia_borde_verde as BV  # noqa: E402  (quitar el filete cian de dentro)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOJA = os.path.join(BASE, 'voltia/sheet_uniform.png')
META = os.path.join(BASE, 'voltia/sheet.json')
FRAMES = os.path.join(BASE, 'voltia/frames')
STAGE = os.path.join(BASE, 'voltia/stage/fighter.png')
CAJA_FIGHTER = (78, 19, 272, 325)
FIGHTER = (97, 153)
DIVISOR = 2      # nativo 4x -> hoja 2x


def medir(im):
    """Bloques 2x2 no uniformes y ruido a 1x."""
    px = im.load()
    W, H = im.size
    uni = no = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            a, b, c, d = px[x, y], px[x + 1, y], px[x, y + 1], px[x + 1, y + 1]
            if not any(q[3] for q in (a, b, c, d)):
                continue
            if a == b == c == d:
                uni += 1
            else:
                no += 1
    uno = im.resize((W // 2, H // 2), Image.NEAREST)
    p1 = uno.load()
    w1, h1 = uno.size
    V = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    ruido = op = 0
    for y in range(h1):
        for x in range(w1):
            q = p1[x, y]
            if not q[3]:
                continue
            op += 1
            if not any(0 <= x + dx < w1 and 0 <= y + dy < h1 and p1[x + dx, y + dy][3]
                       and p1[x + dx, y + dy][:3] == q[:3] for dx, dy in V):
                ruido += 1
    cols = len({p for p in im.getdata() if p[3]})
    return 100 * no / max(uni + no, 1), ruido, op, cols


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
    ap.add_argument('--solo-ver', action='store_true')
    ap.add_argument('--filete', type=int, default=1, help='1 = quitar el filete cian de dentro')
    ap.add_argument('--contorno', type=int, default=0, help='px de hoja que se comen del contorno')
    args = ap.parse_args()

    meta = json.load(open(META))
    cw, ch = meta['cell']['w'], meta['cell']['h']
    actual = Image.open(HOJA).convert('RGBA')
    cols, rows = actual.size[0] // cw, actual.size[1] // ch

    nueva = Image.new('RGBA', actual.size, (0, 0, 0, 0))
    faltan = []
    for a in meta['animations']:
        r = a['row']
        for i in range(a['frames']):
            p = os.path.join(FRAMES, 'voltia_%s_%d.png' % (a['id'], i))
            if not os.path.exists(p):
                faltan.append(p)
                continue
            nativo = Image.open(p).convert('RGBA')
            # /2 exacto y sin interpolar: 4x -> 2x
            arte = nativo.resize((nativo.size[0] // DIVISOR, nativo.size[1] // DIVISOR), Image.NEAREST)
            bb_n = arte.split()[3].getbbox()
            if not bb_n:
                continue
            # encuadre actual de esa celda: mismo centro de tinta y misma linea de pies
            cel_vieja = actual.crop((i * cw, r * ch, (i + 1) * cw, (r + 1) * ch))
            bb_v = cel_vieja.split()[3].getbbox()
            if bb_v:
                cx = (bb_v[0] + bb_v[2]) / 2.0
                pies = bb_v[3]
            else:
                cx, pies = cw / 2.0, ch - 4
            ancho, alto = bb_n[2] - bb_n[0], bb_n[3] - bb_n[1]
            x = int(round(cx - ancho / 2.0 - bb_n[0]))
            y = int(round(pies - alto - bb_n[1]))
            x = max(0, min(cw - arte.size[0], x))
            y = max(0, min(ch - arte.size[1], y))
            # el bloque 2x2 de la hoja tiene que caer entero sobre el pixel de arte:
            # si se pega en coordenada impar, la rejilla se parte y vuelve el ruido.
            x -= x % 2
            y -= y % 2
            if args.filete:
                # el nativo trae el filete cian que cruzaba el traje: fuera, igual que antes
                arte, _, _ = BV.limpiar(arte)
            if args.contorno:
                a3 = arte.split()[3]
                for _ in range(args.contorno):
                    a3 = a3.filter(ImageFilter.MinFilter(3))
                arte.putalpha(a3)
            nueva.alpha_composite(arte, (i * cw + x, r * ch + y))
        print('  fila %2d (%s) lista' % (r, a['id']))

    if faltan:
        print('FALTAN %d frames nativos, no se hace nada:' % len(faltan))
        for p in faltan[:10]:
            print('  ', p)
        return

    u0, r0, o0, c0 = medir(actual)
    u1, r1, o1, c1 = medir(nueva)
    print('\nbloques 2x2 no uniformes: %.2f %% -> %.2f %%' % (u0, u1))
    print('colores opacos: %d -> %d' % (c0, c1))
    print('pixeles opacos a 1x: %d -> %d' % (o0, o1))

    # comparacion de la cara y del sprite entero
    f = fuente(15)
    f2 = fuente(12)
    BG = (238, 238, 242, 255)
    for nombre, caja, z in (('cara', (196, 28, 268, 108), 8), ('cuerpo', (60, 10, 300, 332), 2.4)):
        w, h = caja[2] - caja[0], caja[3] - caja[1]
        tw, th = int(w * z), int(h * z)
        sal = Image.new('RGBA', (2 * tw + 30, th + 46), BG)
        d = ImageDraw.Draw(sal)
        for i, (rot, src) in enumerate((('HOJA VIEJA (LANCZOS)', actual), ('RECONSTRUIDA DE LOS NATIVOS', nueva))):
            t = src.crop((caja[0], caja[1], caja[2], caja[3]))
            fr = Image.new('RGBA', t.size, BG)
            fr.alpha_composite(t)
            sal.alpha_composite(fr.resize((tw, th), Image.NEAREST), (10 + i * (tw + 10), 30))
            d.text((12 + i * (tw + 10), 10), rot, font=f, fill=(20, 20, 40))
        d.text((12, th + 32), 'bloques 2x2 no uniformes: %.2f %% -> %.2f %%' % (u0, u1),
               font=f2, fill=(90, 90, 115))
        sal.convert('RGB').save(os.path.join(BASE, 'voltia/versions/nativo_%s.png' % nombre))

    if args.solo_ver:
        print('(--solo-ver: la hoja no se ha tocado)')
        return

    nueva.save(HOJA)
    rev = hashlib.md5(open(HOJA, 'rb').read()).hexdigest()[:10]
    meta['rev'] = rev
    meta['notes'] = ('Reconstruida desde los frames nativos de voltia/frames (rejilla exacta 4x) '
                     'bajando /2 con NEAREST: sin LANCZOS, sin factor fraccionario, sin colores '
                     'nuevos. Bloques 2x2 no uniformes 0,00 %.')
    json.dump(meta, open(META, 'w'), indent=1)
    nueva.crop((0, 0, cw, ch)).crop(CAJA_FIGHTER).resize(FIGHTER, Image.NEAREST).save(STAGE)
    print('hoja %s  rev %s  |  fighter %s' % (HOJA, rev, STAGE))

    # hoja entera de control
    nom = {a['row']: a['id'] for a in meta['animations']}
    esca = 0.30
    tw2, th2 = int(nueva.size[0] * esca), int(nueva.size[1] * esca)
    gut = 190
    hs = Image.new('RGBA', (tw2 + gut + 14, th2 + 46), BG)
    dh = ImageDraw.Draw(hs)
    dh.text((10, 8), 'VOLTIA · reconstruida desde los frames nativos · 25 filas', font=f, fill=(20, 20, 40))
    plano = Image.new('RGBA', nueva.size, BG)
    plano.alpha_composite(nueva)
    hs.alpha_composite(plano.resize((tw2, th2), Image.LANCZOS), (gut + 10, 36))
    for r in range(rows):
        y = 36 + int(r * ch * esca)
        dh.text((8, y + int(ch * esca / 2) - 14), '%02d' % r, font=f, fill=(20, 20, 40))
        dh.text((8, y + int(ch * esca / 2) + 1), nom.get(r, '')[:19], font=f2, fill=(60, 60, 90))
    hs.convert('RGB').save(os.path.join(BASE, 'voltia/versions/hoja_nativa.png'))
    print('control: voltia/versions/hoja_nativa.png')


if __name__ == '__main__':
    main()
