#!/usr/bin/env python3
"""Vista de trabajo: una imagen por tanda de bandas de la hoja, con cada figura
numerada, para decidir a ojo donde empieza y acaba cada animacion.

    PYTHONPATH=tools/pylibs python3 tools/sheet_bands.py hoja.png salida/ --th 90 --por 4
"""
import json
import os
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheet_anim import componentes, mascara, bandas, recorte  # noqa: E402


def main():
    hoja, out = sys.argv[1], sys.argv[2]
    th = int(sys.argv[sys.argv.index('--th') + 1]) if '--th' in sys.argv else 90
    por = int(sys.argv[sys.argv.index('--por') + 1]) if '--por' in sys.argv else 4
    os.makedirs(out, exist_ok=True)
    im = Image.open(hoja).convert('RGBA')
    cajas = componentes(mascara(im))
    figs = []
    for x0, y0, x1, y1, area in cajas.values():
        if area < 60 or y1 - y0 < 20 or x1 - x0 < 6:
            continue
        figs.append([x0, y0, x1, y1, area])
    figs.sort(key=lambda f: (f[1], f[0]))

    # unir trozos de la MISMA figura: cajas a menos de 10 px en cualquier
    # direccion (una coleta o un guante suelto). Las figuras de frames
    # distintos estan a ~26 px, asi que 10 no las mezcla.
    def cerca(a, b):
        # solo se pega un trozo PEQUENO (coleta, guante suelto) a una figura
        # grande, y a menos de 6 px: si no, se fusionan dos frames vecinos y
        # sale un frame de 180 px de ancho que rompe el lienzo comun.
        grande, chico = (a, b) if a[4] > b[4] else (b, a)
        if chico[4] > 0.35 * grande[4]:
            return False
        dx = max(a[0] - b[2], b[0] - a[2])
        dy = max(a[1] - b[3], b[1] - a[3])
        return dx < 6 and dy < 6

    juntas = []
    for f in figs:
        for g in juntas:
            if cerca(f, g):
                g[0] = min(g[0], f[0]); g[1] = min(g[1], f[1])
                g[2] = max(g[2], f[2]); g[3] = max(g[3], f[3]); g[4] += f[4]
                break
        else:
            juntas.append(list(f))
    juntas = [f for f in juntas if f[4] > 600]
    juntas.sort(key=lambda f: (f[1], f[0]))
    print('figuras:', len(juntas))

    bd = bandas(im)
    datos = []
    for bi, (b0, b1) in enumerate(bd):
        dentro = sorted([f for f in juntas if b0 <= f[3] <= b1], key=lambda f: f[0])
        if len(dentro) < 2:
            continue
        datos.append({'banda': bi, 'y0': b0, 'y1': b1, 'x0': dentro[0][0], 'x1': dentro[-1][2],
                      'figs': [{'i': k, 'x0': f[0], 'y0': f[1], 'x1': f[2], 'y1': f[3]}
                               for k, f in enumerate(dentro)]})
        # montaje de la banda
        celdas = []
        for k, f in enumerate(dentro):
            c = recorte(im, f).convert('RGB')
            s = max(1.0, th / c.size[1])
            c = c.resize((max(1, round(c.size[0] * s)), max(1, round(c.size[1] * s))), Image.NEAREST)
            bg = Image.new('RGB', (c.size[0] + 6, th + 22), (238, 238, 242))
            bg.paste(c, (3, 3))
            ImageDraw.Draw(bg).text((4, th + 7), '#%d' % (k + 1), fill=(10, 10, 10))
            celdas.append(bg)
        W = sum(c.size[0] + 2 for c in celdas) + 10
        banda_img = Image.new('RGB', (max(W, 400), th + 22), (238, 238, 242))
        x = 0
        for c in celdas:
            banda_img.paste(c, (x, 0)); x += c.size[0] + 2
        banda_img.save(os.path.join(out, 'banda_%02d.png' % bi))
        # frames sueltos + medidas de la banda
        fd = os.path.join(out, 'banda_%02d' % bi)
        os.makedirs(fd, exist_ok=True)
        cajas_f = []
        for k, f in enumerate(dentro):
            c = recorte(im, f)
            # fondo magenta -> transparente, para que el frame sirva tal cual
            px_ = c.load()
            for yy in range(c.size[1]):
                for xx in range(c.size[0]):
                    p_ = px_[xx, yy]
                    if p_[3] == 0 or (p_[0] > 200 and p_[1] < 80 and p_[2] > 200):
                        px_[xx, yy] = (0, 0, 0, 0)
            c.save(os.path.join(fd, '%02d.png' % k))
            px = c.convert('RGBA').load()
            negro = sum(1 for yy in range(c.size[1]) for xx in range(c.size[0])
                        if px[xx, yy][:3] == (0, 0, 0) and px[xx, yy][3] > 0)
            cajas_f.append({
                'i': k + 1, 'x0': f[0], 'y0': f[1], 'x1': f[2], 'y1': f[3],
                'w': f[2] - f[0] + 1, 'h': f[3] - f[1] + 1,
                'pie': f[3], 'negro': round(negro / (c.size[0] * c.size[1]), 3),
            })
        datos[-1]['frames'] = cajas_f
        datos[-1]['imagen'] = 'banda_%02d.png' % bi
    json.dump(datos, open(os.path.join(out, 'bandas.json'), 'w'), indent=1)
    print('bandas con figura:', len(datos))
    for d in datos:
        print('banda %02d  y=%d..%d  x=%4d..%4d  %d figuras'
              % (d['banda'], d['y0'], d['y1'], d['x0'], d['x1'], len(d['figs'])))


if __name__ == '__main__':
    main()
