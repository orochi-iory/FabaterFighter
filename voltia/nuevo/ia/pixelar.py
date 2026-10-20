"""Convierte las tiras que devuelve la IA en sprites de pixel art real.

Por qué: la IA entrega ilustraciones suaves que *parecen* pixel art (90 000+ colores y
bordes suavizados), pero no tienen rejilla de píxel. Aquí se recortan los sprites, se
bajan a una rejilla real con divisor entero (NEAREST) y se aplanan a la paleta de 18
colores de Voltia sin dithering. Sin LANCZOS en ningún paso.
"""
from collections import Counter
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
IA = os.path.join(BASE, 'voltia/nuevo/ia')
SAL = os.path.join(IA, 'prueba')
REF = os.path.join(BASE, 'voltia/frames/voltia_stance_0.png')


def paleta():
    with Image.open(REF) as im:
        cols = [c[:3] for c, n in Counter(im.convert('RGBA').get_flattened_data()).most_common() if c[3]]
    p = Image.new('P', (1, 1))
    plano = [v for c in cols for v in c]
    plano += [0] * (768 - len(plano))
    p.putpalette(plano)
    return p, cols


def sin_lineas(im):
    """La IA dibuja una raya de suelo que une todos los sprites: se borra."""
    im = im.copy()
    px = im.load()
    bg = px[1, 1]
    W, H = im.size
    for y in range(H):
        n = sum(1 for x in range(W) if max(abs(px[x, y][i] - bg[i]) for i in range(3)) > 16)
        if n > W * 0.45:
            for x in range(W):
                px[x, y] = bg
    return im


def recorte(cel):
    px = cel.load()
    bg = px[1, 1]
    W, H = cel.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            if max(abs(px[x, y][i] - bg[i]) for i in range(3)) > 16:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None, bg
    return cel.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1)), bg


def a_pixel(rec, bg, k, pal):
    """Baja a la rejilla (divisor entero k) y aplana a la paleta, sin dithering."""
    w, h = rec.size
    chico = rec.resize((max(1, w // k), max(1, h // k)), Image.NEAREST)
    q = chico.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
    out = Image.new('RGBA', q.size)
    po, pr, pq = out.load(), chico.load(), q.load()
    for y in range(q.size[1]):
        for x in range(q.size[0]):
            c = pr[x, y]
            po[x, y] = (0, 0, 0, 0) if max(abs(c[i] - bg[i]) for i in range(3)) <= 18 else pq[x, y] + (255,)
    return out


def main():
    pal, cols = paleta()
    lotes = [('stance', 'ia_stance_a', 5, 1), ('stance', 'ia_stance_b', 5, 1),
             ('stance', 'ia_stance_c', 5, 1), ('walk', 'ia_walk', 4, 2)]
    for d in ('raw', 'pixel'):
        os.makedirs(os.path.join(SAL, d), exist_ok=True)
    reg = {'stance': [], 'walk': []}
    k_usado = Counter()
    for anim, nombre, nc, nr in lotes:
        with Image.open(os.path.join(IA, '%s.png' % nombre)) as src:
            im = sin_lineas(src.convert('RGB'))
        W, H = im.size
        cw, ch = W / nc, H / nr
        tope = 15 if anim == 'stance' else 6
        for r in range(nr):
            for c in range(nc):
                if len(reg[anim]) >= tope:
                    break
                cel = im.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
                rec, bg = recorte(cel)
                if rec is None or rec.size[1] < 80:
                    continue
                k = 3 if rec.size[1] > 300 else 2
                pix = a_pixel(rec, bg, k, pal)
                i = len(reg[anim])
                rec.save(os.path.join(SAL, 'raw', '%s_%02d.png' % (anim, i)))
                pix.save(os.path.join(SAL, 'pixel', '%s_%02d.png' % (anim, i)))
                reg[anim].append({'i': i, 'raw': list(rec.size), 'pixel': list(pix.size), 'k': k})
                k_usado[k] += 1
    with open(os.path.join(SAL, 'datos.json'), 'w') as fh:
        json.dump({'paleta': len(cols), 'reg': reg}, fh, indent=1)
    print('paleta', len(cols), '| stance', len(reg['stance']), '| walk', len(reg['walk']), '| divisores', dict(k_usado))
    print('stance f0', reg['stance'][0])
    print('walk f0', reg['walk'][0])


if __name__ == '__main__':
    main()
