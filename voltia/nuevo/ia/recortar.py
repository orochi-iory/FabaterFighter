"""Recorta las tiras de la IA y centra cada frame por la CABEZA, no por la caja.

El problema que resuelve: centrar por la caja del sprite hace que la coleta mande (es
enorme y cambia de forma en cada frame), asi que el personaje "baila" de un frame a otro.
Aqui se localiza el casco magenta, se toma su centro y se normaliza la distancia
CABEZA-PIES, de modo que en todos los frames:

  - el centro del casco cae en el mismo pixel,
  - la linea de pies cae en el mismo pixel,
  - el personaje mide lo mismo de cabeza a pies.

Nada de LANCZOS: bajada con NEAREST y paleta cerrada sin dithering.
"""
from collections import Counter, deque
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
IA = os.path.join(BASE, 'voltia/nuevo/ia')
SAL = os.path.join(IA, 'frames')

CABEZA_PIES = 120       # px de arte entre el centro del casco y la linea de pies
MARGEN = 4


def fondo(im):
    """Color de fondo: el mas frecuente de los bordes."""
    px = im.load()
    W, H = im.size
    muestras = [px[x, 0] for x in range(0, W, 7)] + [px[x, H - 1] for x in range(0, W, 7)]
    muestras += [px[0, y] for y in range(0, H, 7)] + [px[W - 1, y] for y in range(0, H, 7)]
    return Counter(muestras).most_common(1)[0][0]


def es_fondo(c, bg, tol=30):
    return max(abs(c[i] - bg[i]) for i in range(3)) <= tol


def ocupacion_columnas(im, bg):
    px = im.load()
    W, H = im.size
    return [sum(1 for y in range(0, H, 2) if not es_fondo(px[x, y], bg)) for x in range(W)]


def bandas(im, bg):
    """Bandas horizontales con contenido: la IA a veces devuelve dos filas."""
    px = im.load()
    W, H = im.size
    oc = [sum(1 for x in range(0, W, 2) if not es_fondo(px[x, y], bg)) for y in range(H)]
    out, ini = [], None
    for y, n in enumerate(oc):
        if n > 1 and ini is None:
            ini = y
        elif n <= 1 and ini is not None:
            if y - ini > 60:
                out.append((ini, y))
            ini = None
    if ini is not None and H - ini > 60:
        out.append((ini, H))
    return out


def trocear(oc):
    """Corta por las columnas vacias."""
    out, ini = [], None
    for x, n in enumerate(oc):
        if n > 0 and ini is None:
            ini = x
        elif n == 0 and ini is not None:
            if x - ini > 20:
                out.append([ini, x])
            ini = None
    if ini is not None:
        out.append([ini, len(oc)])
    return out


def partir_pegados(trozos, oc):
    """Si dos sprites se tocan, el trozo sale al doble: se parte por el hueco minimo."""
    cambio = True
    while cambio:
        cambio = False
        anchos = sorted(t[1] - t[0] for t in trozos)
        if not anchos:
            break
        mediana = anchos[len(anchos) // 2]
        for i, t in enumerate(trozos):
            a, b = t
            if b - a <= 1.6 * mediana:
                continue
            z0 = a + int((b - a) * 0.25)
            z1 = b - int((b - a) * 0.25)
            corte = min(range(z0, z1), key=lambda x: oc[x])
            trozos[i:i + 1] = [[a, corte], [corte, b]]
            cambio = True
            break
    return trozos


def es_casco(c):
    """Magenta/pink del casco: rojo alto, azul medio, verde bajo."""
    r, g, b = c
    return r > 120 and b > 90 and g < 0.62 * r and r - g > 55 and b > 0.45 * r


def casco(im):
    """Centro del casco: el blob magenta mas grande de la mitad superior."""
    px = im.load()
    W, H = im.size
    visto = [[False] * W for _ in range(H)]
    mejor = None
    for y in range(H // 2):
        for x in range(W):
            if visto[y][x] or not es_casco(px[x, y]):
                continue
            dq = deque([(x, y)])
            visto[y][x] = True
            xs, ys = [], []
            while dq:
                cx, cy = dq.popleft()
                xs.append(cx)
                ys.append(cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H and not visto[ny][nx] and es_casco(px[nx, ny]):
                        visto[ny][nx] = True
                        dq.append((nx, ny))
            if len(xs) > 60 and (mejor is None or len(xs) > mejor[0]):
                mejor = (len(xs), sum(xs) / len(xs), sum(ys) / len(ys))
    return mejor


def recorte(im, bg):
    px = im.load()
    W, H = im.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            if not es_fondo(px[x, y], bg):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def paleta_de(ims, n=32):
    muestra = Image.new('RGB', (sum(i.size[0] for i in ims), max(i.size[1] for i in ims)), (255, 255, 255))
    x = 0
    for i in ims:
        muestra.paste(i, (x, 0))
        x += i.size[0]
    return muestra.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def a_pixel(r, bg, k, pal):
    """Baja a rejilla con divisor real y aplana a la paleta, sin dithering."""
    chico = r.resize((max(1, round(r.size[0] / k)), max(1, round(r.size[1] / k))), Image.NEAREST)
    q = chico.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
    out = Image.new('RGBA', q.size)
    pq, pr, po = q.load(), chico.load(), out.load()
    for y in range(q.size[1]):
        for x in range(q.size[0]):
            po[x, y] = (0, 0, 0, 0) if es_fondo(pr[x, y], bg) else pq[x, y] + (255,)
    return out


def main():
    recursos = {'stance': 'ia_stance.png', 'walk': 'ia_walk.png'}
    os.makedirs(SAL, exist_ok=True)
    salida = {}
    for anim, fichero in recursos.items():
        with Image.open(os.path.join(IA, fichero)) as src:
            im = src.convert('RGB')
        bg = fondo(im)
        recs = []
        for (ya, yb) in bandas(im, bg):
            banda = im.crop((0, ya, im.size[0], yb))
            for (a, b) in partir_pegados(trocear(ocupacion_columnas(banda, bg)),
                                         ocupacion_columnas(banda, bg)):
                r = recorte(banda.crop((a, 0, b, banda.size[1])), bg)
                if r and r.size[1] > 80:
                    recs.append(r)
        pal = paleta_de(recs)

        # 1) escalar cada frame a la misma distancia cabeza-pies y medir sus extremos
        piezas = []
        for i, r in enumerate(recs):
            c = casco(r)
            hx0, hy0 = (c[1], c[2]) if c else (r.size[0] / 2, r.size[1] / 4)
            k = max(1.0, (r.size[1] - hy0)) / CABEZA_PIES   # pies = borde inferior del recorte
            sp = a_pixel(r, bg, k, pal)
            hx, hy = hx0 / k, hy0 / k
            piezas.append({'i': i, 'sp': sp, 'hx': hx, 'hy': hy, 'k': k,
                           'origen': list(r.size), 'casco': bool(c)})

        # 2) lienzo que quepa todo: la cabeza ancla la x, los pies anclan la y
        izq = max(p['hx'] for p in piezas)
        der = max(p['sp'].size[0] - p['hx'] for p in piezas)
        arr = max(p['hy'] for p in piezas)
        aba = max(p['sp'].size[1] - p['hy'] for p in piezas)
        ax, ay = int(round(izq)) + MARGEN, int(round(arr)) + MARGEN
        W, H = int(round(izq + der)) + MARGEN * 2, int(round(arr + aba)) + MARGEN * 2
        datos = []
        for p in piezas:
            lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            lienzo.alpha_composite(p['sp'], (int(round(ax - p['hx'])), int(round(ay - p['hy']))))
            bb = lienzo.getbbox()
            cortado = bb and (bb[0] <= 0 or bb[1] <= 0 or bb[2] >= W or bb[3] >= H)
            lienzo.save(os.path.join(SAL, '%s_%02d.png' % (anim, p['i'])))
            datos.append({'i': p['i'], 'origen': p['origen'], 'k': round(p['k'], 2),
                          'sprite': list(p['sp'].size), 'casco': p['casco'],
                          'bbox': list(bb) if bb else None, 'cortado': bool(cortado)})
        salida[anim] = {'lienzo': [W, H], 'ancla': [ax, ay], 'pies_y': ay + CABEZA_PIES,
                        'frames': datos}
        print('%-7s %d frames | lienzo %dx%d | cabeza (%d,%d) | pies y=%d | cortados %d'
              % (anim, len(piezas), W, H, ax, ay, ay + CABEZA_PIES,
                 sum(1 for d in datos if d['cortado'])))
    with open(os.path.join(SAL, 'datos.json'), 'w') as fh:
        json.dump({'cabeza_pies': CABEZA_PIES, 'anims': salida}, fh, indent=1)


if __name__ == '__main__':
    main()
