#!/usr/bin/env python3
"""Parte una hoja de sprites en animaciones por filas.

Pensado para hojas de rejilla floja: fondo plano de un color, filas separadas
por franjas de fondo, figuras empaquetadas a mano. No reescala nada y convierte
el fondo en transparente.

    PYTHONPATH=tools/pylibs python3 tools/sheet_cut.py hoja.png salida/ \
        [--bg RRGGBB|auto] [--tol 24] [--min-area 300]

Escribe:
  salida/banda_NN/00.png...   frames recortados, fondo transparente
  salida/banda_NN.png         montaje de la banda para revisar
  salida/bandas.json          medidas de cada banda y cada frame
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def color_fondo(im):
    c = im.convert('RGB')
    w, h = c.size
    esquinas = [c.getpixel(p) for p in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]]
    return max(set(esquinas), key=esquinas.count)


def mascara(im, bg, tol):
    """Tinta = pixel que se aleja del color de fondo mas que tol (euclideo)."""
    w, h = im.size
    px = im.convert('RGB').load()
    br, bgc, bb = bg
    t2 = tol * tol
    filas = []
    for y in range(h):
        runs = []
        ini = None
        for x in range(w):
            r, g, b = px[x, y]
            dr, dg, db = r - br, g - bgc, b - bb
            tinta = dr * dr + dg * dg + db * db > t2
            if tinta and ini is None:
                ini = x
            elif not tinta and ini is not None:
                runs.append((ini, x - 1))
                ini = None
        if ini is not None:
            runs.append((ini, w - 1))
        filas.append(runs)
    return filas


def componentes(filas):
    padre = []
    prev, todos = [], []
    for y, runs in enumerate(filas):
        act = []
        for x0, x1 in runs:
            ident = len(padre)
            padre.append(ident)
            for px0, px1, pid in prev:
                if x0 <= px1 and px0 <= x1:
                    a, b = ident, pid
                    while padre[a] != a:
                        a = padre[a]
                    while padre[b] != b:
                        b = padre[b]
                    if a != b:
                        padre[b] = a
            act.append((x0, x1, ident))
            todos.append((y, x0, x1, ident))
        prev = act

    def raiz(a):
        while padre[a] != a:
            padre[a] = padre[padre[a]]
            a = padre[a]
        return a

    cajas = {}
    for y, x0, x1, ident in todos:
        r = raiz(ident)
        c = cajas.get(r)
        if c is None:
            cajas[r] = [x0, y, x1, y, x1 - x0 + 1]
        else:
            if x0 < c[0]: c[0] = x0
            if x1 > c[2]: c[2] = x1
            if y > c[3]: c[3] = y
            c[4] += x1 - x0 + 1
    return cajas


def bandas(filas):
    """Franjas de filas totalmente vacias -> limites de banda."""
    vacias = [i for i, runs in enumerate(filas) if not runs]
    if not vacias:
        return [(0, len(filas) - 1)]
    out, ant = [], -1
    for i in vacias:
        if i == ant + 1:
            ant = i
            continue
        if i - 1 > ant:
            out.append((ant + 1, i - 1))
        ant = i
    if ant < len(filas) - 1:
        out.append((ant + 1, len(filas) - 1))
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return
    hoja, out = sys.argv[1], sys.argv[2]
    tol = int(sys.argv[sys.argv.index('--tol') + 1]) if '--tol' in sys.argv else 24
    min_area = int(sys.argv[sys.argv.index('--min-area') + 1]) if '--min-area' in sys.argv else 300
    os.makedirs(out, exist_ok=True)

    im = Image.open(hoja).convert('RGBA')
    if '--bg' in sys.argv and sys.argv[sys.argv.index('--bg') + 1] != 'auto':
        hx = sys.argv[sys.argv.index('--bg') + 1]
        bg = tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))
    else:
        bg = color_fondo(im)
    print('fondo', bg)

    # pixels de fondo -> transparentes
    px = im.load()
    w, h = im.size
    t2 = tol * tol
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dr, dg, db = r - bg[0], g - bg[1], b - bg[2]
            if dr * dr + dg * dg + db * db <= t2:
                px[x, y] = (0, 0, 0, 0)

    # la mascara se toma del alfa: el fondo ya es transparente
    alfa = im.getchannel('A').load()
    filas = []
    for y in range(h):
        runs, ini = [], None
        for x in range(w):
            if alfa[x, y] > 0:
                if ini is None:
                    ini = x
            elif ini is not None:
                runs.append((ini, x - 1)); ini = None
        if ini is not None:
            runs.append((ini, w - 1))
        filas.append(runs)
    cajas = componentes(filas)
    figs = []
    for x0, y0, x1, y1, area in cajas.values():
        if area < min_area or y1 - y0 < 8 or x1 - x0 < 6:
            continue
        figs.append([x0, y0, x1, y1, area])

    # pegar trozos pequenos (sombra, mechon, efecto) a su figura
    figs.sort(key=lambda f: f[1])
    juntas = []
    for f in figs:
        for g in juntas:
            grande, chico = (g, f) if g[4] > f[4] else (f, g)
            if chico[4] > 0.35 * grande[4]:
                continue
            dx = max(f[0] - g[2], g[0] - f[2])
            dy = max(f[1] - g[3], g[1] - f[3])
            if dx < 8 and dy < 8:
                g[0] = min(g[0], f[0]); g[1] = min(g[1], f[1])
                g[2] = max(g[2], f[2]); g[3] = max(g[3], f[3]); g[4] += f[4]
                break
        else:
            juntas.append(list(f))
    juntas.sort(key=lambda f: (f[1], f[0]))
    print('figuras:', len(juntas))

    bd = bandas(filas)
    datos = []
    for bi, (b0, b1) in enumerate(bd):
        dentro = sorted([f for f in juntas if b0 <= (f[1] + f[3]) // 2 <= b1], key=lambda f: f[0])
        if len(dentro) < 2:
            continue
        fd = os.path.join(out, 'banda_%02d' % bi)
        os.makedirs(fd, exist_ok=True)
        frames = []
        for k, f in enumerate(dentro):
            c = im.crop((f[0], f[1], f[2] + 1, f[3] + 1))
            c.save(os.path.join(fd, '%02d.png' % k))
            frames.append({'i': k + 1, 'x0': f[0], 'y0': f[1], 'x1': f[2], 'y1': f[3],
                           'w': c.size[0], 'h': c.size[1], 'pie': f[3]})
        # montaje
        TH = 110
        celdas = []
        for k, f in enumerate(dentro):
            c = im.crop((f[0], f[1], f[2] + 1, f[3] + 1)).convert('RGBA')
            s = max(1.0, TH / c.size[1])
            c = c.resize((max(1, round(c.size[0] * s)), max(1, round(c.size[1] * s))), Image.NEAREST)
            bgc = Image.new('RGBA', (c.size[0] + 6, TH + 20), (240, 240, 244, 255))
            bgc.alpha_composite(c, (3, 3))
            celdas.append(bgc.convert('RGB'))
        total_w = sum(c.size[0] + 2 for c in celdas) + 8
        montaje = Image.new('RGB', (max(total_w, 200), TH + 20), (240, 240, 244))
        x = 0
        for c in celdas:
            montaje.paste(c, (x, 0)); x += c.size[0] + 2
        montaje.save(os.path.join(out, 'banda_%02d.png' % bi))
        datos.append({'banda': bi, 'y0': b0, 'y1': b1, 'n': len(frames),
                      'x0': dentro[0][0], 'x1': dentro[-1][2], 'frames': frames})
        print('banda %02d  y=%4d..%4d  %2d frames  alto %d-%d  ancho %d-%d'
              % (bi, b0, b1, len(frames),
                 min(f['h'] for f in frames), max(f['h'] for f in frames),
                 min(f['w'] for f in frames), max(f['w'] for f in frames)))
    json.dump(datos, open(os.path.join(out, 'bandas.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
