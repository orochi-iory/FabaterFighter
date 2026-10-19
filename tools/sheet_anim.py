#!/usr/bin/env python3
"""Separa una hoja de sprites en animaciones sin rejilla.

La hoja de R. Mika no tiene celdas regulares: las figuras estan empaquetadas a
mano. Asi que se usan tres senales, en este orden:

  1. BANDAS. Franjas horizontales separadas por filas 100 % magenta. Cada banda
     es una fila de la hoja y casi siempre una animacion (o dos).
  2. HUECO. Dentro de una banda, un hueco de mas de ~40 px entre dos figuras
     marca cambio de animacion.
  3. SILUETA. Si dos figuras seguidas se parecen poco (IoU < 0,50 alineadas por
     los pies y el centro), tambien es un corte: es otra animacion.

Las animaciones de 1 solo frame se pegan a la vecina mas parecida.

    PYTHONPATH=tools/pylibs python3 tools/sheet_anim.py hoja.png salida/ [--gap 40] [--iou 0.50]

Salida: anim_NNN/00.png..., anims.json (frames, caja, linea de pies, IoU) e
informe.txt.
"""
import json
import os
import sys
from PIL import Image, ImageChops

BG_R, BG_G, BG_B = 200, 80, 200


def es_tinta(p):
    return p[3] > 0 and not (p[0] > BG_R and p[1] < BG_G and p[2] > BG_B)


def mascara(im):
    w, h = im.size
    px = im.convert('RGBA').load()
    filas = []
    for y in range(h):
        runs = []
        ini = None
        for x in range(w):
            t = es_tinta(px[x, y])
            if t and ini is None:
                ini = x
            elif not t and ini is not None:
                runs.append((ini, x - 1))
                ini = None
        if ini is not None:
            runs.append((ini, w - 1))
        filas.append(runs)
    return filas


class UF:
    def __init__(self):
        self.p = []

    def nuevo(self):
        self.p.append(len(self.p))
        return len(self.p) - 1

    def raiz(self, a):
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def une(self, a, b):
        ra, rb = self.raiz(a), self.raiz(b)
        if ra != rb:
            self.p[rb] = ra


def componentes(filas):
    uf = UF()
    prev, todos = [], []
    for y, runs in enumerate(filas):
        act = []
        for x0, x1 in runs:
            ident = uf.nuevo()
            for px0, px1, pid in prev:
                if x0 <= px1 and px0 <= x1:
                    uf.une(ident, pid)
            act.append((x0, x1, ident))
            todos.append((y, x0, x1, ident))
        prev = act
    cajas = {}
    for y, x0, x1, ident in todos:
        r = uf.raiz(ident)
        c = cajas.get(r)
        if c is None:
            cajas[r] = [x0, y, x1, y, x1 - x0 + 1]
        else:
            if x0 < c[0]: c[0] = x0
            if x1 > c[2]: c[2] = x1
            if y > c[3]: c[3] = y
            c[4] += x1 - x0 + 1
    return cajas


def bandas(im, paso=2):
    """Filas 100 % magenta -> limites de bandas (region con figuras)."""
    w, h = im.size
    px = im.convert('RGBA').load()
    vacias = []
    for y in range(h):
        if all(not es_tinta(px[x, y]) for x in range(0, w, paso)):
            vacias.append(y)
    if not vacias:
        return [(0, h - 1)]
    tramos, s, p = [], vacias[0], vacias[0]
    for y in vacias[1:]:
        if y == p + 1:
            p = y
        else:
            tramos.append((s, p)); s = y; p = y
    tramos.append((s, p))
    # invertir: las bandas son los huecos entre separadores
    out = []
    ant = -1
    for a, b in tramos:
        if a - 1 > ant:
            out.append((ant + 1, a - 1))
        ant = b
    if ant < h - 1:
        out.append((ant + 1, h - 1))
    return out


def recorte(im, f):
    return im.crop((f[0], f[1], f[2] + 1, f[3] + 1))


def mascara_bin(im, f, W, H):
    """Silueta de la figura en un lienzo comun: pies abajo, centro del bbox al
    centro del lienzo."""
    c = recorte(im, f)
    w, h = c.size
    lienzo = Image.new('L', (W, H), 0)
    lienzo.paste(c.convert('RGBA').getchannel('A').point(lambda v: 255 if v > 0 else 0),
                 ((W - w) // 2, H - h))
    return lienzo


def iou(a, b):
    inter = ImageChops.multiply(a, b).histogram()[255]
    union = ImageChops.lighter(a, b).histogram()[255]
    return inter / union if union else 0.0


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return
    hoja, out = sys.argv[1], sys.argv[2]
    gap = int(sys.argv[sys.argv.index('--gap') + 1]) if '--gap' in sys.argv else 40
    umbral = float(sys.argv[sys.argv.index('--iou') + 1]) if '--iou' in sys.argv else 0.50
    os.makedirs(out, exist_ok=True)

    im = Image.open(hoja).convert('RGBA')
    cajas = componentes(mascara(im))
    figs = []
    for x0, y0, x1, y1, area in cajas.values():
        if area < 40 or y1 - y0 < 6 or x1 - x0 < 4:
            continue
        figs.append([x0, y0, x1, y1, area])
    # unir trozos que se solapan en X (brazo o coleta sueltos = misma figura)
    figs.sort(key=lambda f: (f[1], f[0]))
    juntas = []
    for f in figs:
        for g in juntas:
            if min(f[2], g[2]) - max(f[0], g[0]) > 0 and max(f[1] - g[3], g[1] - f[3]) < 14:
                g[0] = min(g[0], f[0]); g[1] = min(g[1], f[1])
                g[2] = max(g[2], f[2]); g[3] = max(g[3], f[3]); g[4] += f[4]
                break
        else:
            juntas.append(list(f))
    print('figuras:', len(juntas))

    bd = bandas(im)
    print('bandas:', len(bd))

    grupos = []
    for (b0, b1) in bd:
        dentro = [f for f in juntas if b0 <= f[3] <= b1]
        dentro.sort(key=lambda f: f[0])
        if not dentro:
            continue
        W = max(f[2] - f[0] + 1 for f in dentro) + 4
        H = max(f[3] - f[1] + 1 for f in dentro) + 4
        masks = [mascara_bin(im, f, W, H) for f in dentro]
        actual = [0]
        for i in range(1, len(dentro)):
            hueco = dentro[i][0] - dentro[i - 1][2]
            parecido = iou(masks[i - 1], masks[i])
            corte = hueco > gap or parecido < umbral
            if corte:
                grupos.append((dentro[actual[0]:i], actual[0]))
                actual = [i]
        grupos.append((dentro[actual[0]:], actual[0]))

    # pegar animaciones de un frame a la vecina mas parecida
    def comun(a, b):
        W = max([f[2] - f[0] for f in a + b]) + 4
        H = max([f[3] - f[1] for f in a + b]) + 4
        return iou(mascara_bin(im, a[-1], W, H), mascara_bin(im, b[0], W, H))

    i = 0
    while i < len(grupos):
        g = grupos[i][0]
        if len(g) == 1 and len(grupos) > 1:
            izq = grupos[i - 1][0] if i else None
            der = grupos[i + 1][0] if i + 1 < len(grupos) else None
            opciones = []
            if izq: opciones.append((comun(izq, g), 'i'))
            if der: opciones.append((comun(g, der), 'd'))
            opciones.sort(reverse=True)
            if opciones and opciones[0][0] >= 0.30:
                if opciones[0][1] == 'i':
                    grupos[i - 1] = (izq + g, grupos[i - 1][1])
                else:
                    grupos[i + 1] = (g + der, grupos[i + 1][1])
                grupos.pop(i)
                continue
        i += 1

    anims = []
    for n, (g, _) in enumerate(grupos):
        d = os.path.join(out, 'anim_%03d' % n)
        os.makedirs(d, exist_ok=True)
        for k, f in enumerate(g):
            recorte(im, f).save(os.path.join(d, '%02d.png' % k))
        anims.append({
            'id': 'anim_%03d' % n,
            'n': len(g),
            'x0': g[0][0], 'x1': g[-1][2],
            'pie': [f[3] for f in g],
            'alto': [f[3] - f[1] + 1 for f in g],
            'ancho': [f[2] - f[0] + 1 for f in g],
            'fps': 12,            # propuesta, no viene en la hoja
        })

    json.dump(anims, open(os.path.join(out, 'anims.json'), 'w'), indent=1)
    lineas = []
    for a in anims:
        lineas.append('%s  %2d frames  alto %d-%d  ancho %d-%d  pies %d-%d' % (
            a['id'], a['n'], min(a['alto']), max(a['alto']),
            min(a['ancho']), max(a['ancho']), min(a['pie']), max(a['pie'])))
    txt = '\n'.join(lineas)
    open(os.path.join(out, 'informe.txt'), 'w').write(txt + '\n')
    print(txt)


if __name__ == '__main__':
    main()
