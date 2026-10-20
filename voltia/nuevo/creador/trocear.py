"""Trocea las hojas de la IA con las reglas de oro del proyecto.

REGLA DE ORO 1 · FONDO
    El fondo tiene que ser un color que NO exista en la paleta del sprite. Se le pide a la IA
    rojo puro (255,0,0), que no esta en la paleta de Voltia. Al trocear solo se anula ese rojo
    (y el que deja su antialias en el borde, que es ruido): ningun otro tono se toca.

REGLA DE ORO 2 · CABEZA
    El anclaje es el centro del casco magenta, no la caja del sprite (la coleta manda y el
    personaje baila). Se normaliza la distancia centro del casco -> pies en todos los frames.

Troceado: componentes conexas. Un sprite puede estar partido en varias piezas (coleta, guante,
bota) pero todas se agrupan por cercania, asi que un corte por columnas nunca las mutila.

Nada de LANCZOS: bajada a rejilla con NEAREST y paleta cerrada sin dithering.
"""
from collections import Counter, deque
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ORIGEN = os.path.join(BASE, 'voltia/nuevo/creador')
SALIDA = os.path.join(ORIGEN, 'sprites')

FONDO = (255, 0, 0)
TOL_FONDO = 40
CABEZA_PIES = 120
MARGEN = 4


def es_fondo(c, tol=TOL_FONDO):
    return c[0] > 255 - tol and c[1] < tol and c[2] < tol


def fondo_de(im):
    px = im.load()
    W, H = im.size
    m = [px[x, 0] for x in range(0, W, 9)] + [px[x, H - 1] for x in range(0, W, 9)]
    return Counter(m).most_common(1)[0][0]


def piezas(im, minimo=300):
    """Componentes conexas de todo lo que no es fondo."""
    px = im.load()
    W, H = im.size
    visto = [[False] * W for _ in range(H)]
    out = []
    for y in range(H):
        fila = visto[y]
        for x in range(W):
            if fila[x] or es_fondo(px[x, y]):
                continue
            dq = deque([(x, y)])
            fila[x] = True
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while dq:
                cx, cy = dq.popleft()
                n += 1
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H and not visto[ny][nx] and not es_fondo(px[nx, ny]):
                        visto[ny][nx] = True
                        dq.append((nx, ny))
            if n >= 40:
                out.append({'b': [x0, y0, x1 + 1, y1 + 1], 'n': n})
    return [p for p in out if p['n'] >= minimo]


def agrupar(ps, margen_x=14):
    """Une piezas que se solapan en horizontal: son el mismo sprite."""
    ps = sorted(ps, key=lambda p: p['b'][0])
    grupos = []
    for p in ps:
        for g in grupos:
            if p['b'][0] <= g['b'][2] + margen_x and p['b'][2] >= g['b'][0] - margen_x:
                g['b'][0] = min(g['b'][0], p['b'][0])
                g['b'][1] = min(g['b'][1], p['b'][1])
                g['b'][2] = max(g['b'][2], p['b'][2])
                g['b'][3] = max(g['b'][3], p['b'][3])
                g['n'] += p['n']
                break
        else:
            grupos.append(dict(p))
    # segunda pasada: fusionar grupos que se tocan
    cambio = True
    while cambio:
        cambio = False
        for i in range(len(grupos)):
            for j in range(i + 1, len(grupos)):
                a, b = grupos[i]['b'], grupos[j]['b']
                if a[0] <= b[2] + margen_x and b[0] <= a[2] + margen_x:
                    grupos[i]['b'] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    grupos[i]['n'] += grupos[j]['n']
                    grupos.pop(j)
                    cambio = True
                    break
            if cambio:
                break
    return sorted(grupos, key=lambda g: g['b'][0])


def es_casco(c):
    r, g, b = c
    return r > 110 and b > 80 and g < 0.65 * r and r - g > 45 and b > 0.4 * r


def casco(im):
    px = im.load()
    W, H = im.size
    visto = [[False] * W for _ in range(H)]
    mejor = None
    for y in range(H):
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
            # el casco esta arriba: descartar blobs muy bajos (cinturon, botas)
            cy_medio = sum(ys) / len(ys)
            if len(xs) > 60 and cy_medio < 0.35 * H and (mejor is None or len(xs) > mejor[0]):
                mejor = (len(xs), sum(xs) / len(xs), cy_medio)
    return mejor


def limpiar_vecinos(r, margen=6, alcance=0.42):
    """Quita trozos de los sprites vecinos que entran en la celda.

    Se queda la componente principal (cuerpo + coleta) y solo las piezas que caen dentro
    de su franja horizontal. Un guante o una bota del vecino queda fuera y se tira.
    """
    ps = piezas(r, minimo=40)
    if len(ps) <= 1:
        return r
    principal = max(ps, key=lambda p: p['n'])['b']
    centro = (principal[0] + principal[2]) / 2
    franja = (principal[2] - principal[0]) * alcance
    px = r.load()
    W, H = r.size
    fuera = Image.new('RGB', r.size, FONDO)
    pf = fuera.load()
    for p in ps:
        b = p['b']
        cerca_x = b[0] <= centro + franja and b[2] >= centro - franja
        cerca_y = b[1] <= principal[3] and b[3] >= principal[1]
        if not (cerca_x and cerca_y):
            continue
        for y in range(b[1], b[3]):
            for x in range(b[0], b[2]):
                pf[x, y] = px[x, y]
    return fuera


def cabezas(im, ancho_celda=None):
    """Centros de todos los cascos de la hoja, ordenados por x."""
    px = im.load()
    W, H = im.size
    visto = [[False] * W for _ in range(H)]
    out = []
    for y in range(H):
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
            if len(xs) > 80:
                cx_, cy_ = sum(xs) / len(xs), sum(ys) / len(ys)
                if cy_ < 0.4 * H:
                    out.append({'x': cx_, 'y': cy_, 'n': len(xs)})
    out.sort(key=lambda c: c['x'])
    # El visor teal y los ojos parten el casco en trozos: se fusionan los cercanos
    # (el casco de un frame nunca se acerca al del siguiente).
    junta = ancho_celda * 0.55 if ancho_celda else 30
    fin = []
    for c in out:
        if fin and c['x'] - fin[-1]['x'] < junta:
            if c['n'] > fin[-1]['n']:
                fin[-1] = c
            continue
        fin.append(c)
    return fin


def recorte_caja(im, caja):
    r = im.crop(tuple(caja))
    px = r.load()
    W, H = r.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            if not es_fondo(px[x, y]):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return r.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def paleta_de(ims, n=24):
    m = Image.new('RGB', (sum(i.size[0] for i in ims), max(i.size[1] for i in ims)), FONDO)
    x = 0
    for i in ims:
        m.paste(i, (x, 0))
        x += i.size[0]
    return m.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def a_pixel(r, k):
    """Baja a rejilla con NEAREST y NO toca los colores: solo anula el rojo del fondo.

    Cuantizar a 24 colores apagaba el dibujo (el dorado del cinturon salia crema). Al
    tener un fondo que no existe en la paleta no hace falta cerrar la paleta para
    recortar, asi que se conservan los tonos originales.
    """
    chico = r.resize((max(1, round(r.size[0] / k)), max(1, round(r.size[1] / k))), Image.NEAREST)
    out = Image.new('RGBA', chico.size)
    pr, po = chico.load(), out.load()
    for y in range(chico.size[1]):
        for x in range(chico.size[0]):
            c = pr[x, y]
            # rojo del fondo y su antialias: fuera. Ningun otro tono se toca.
            po[x, y] = (0, 0, 0, 0) if es_fondo(c, 70) else c + (255,)
    return out


def procesar(anim, fichero, n_esperado):
    with Image.open(os.path.join(ORIGEN, fichero)) as src:
        im = src.convert('RGB')
    bg = fondo_de(im)
    # La hoja viene con los N sprites repartidos en una fila: se parte en N columnas
    # iguales. Trocear por huecos no sirve, porque coleta y cuerpo de frames vecinos
    # se solapan y el corte mutila el sprite.
    W = im.size[0]
    cs = cabezas(im, W / n_esperado)
    if len(cs) == n_esperado:
        # Los cortes van a mitad de camino entre cabezas consecutivas: asi cada frame se
        # queda con su cabeza y con su coleta, sin cortar al vecino por la mitad.
        cortes = [0]
        for i in range(len(cs) - 1):
            cortes.append(int(round((cs[i]['x'] + cs[i + 1]['x']) / 2)))
        cortes.append(W)
        print('  %d cabezas encontradas, cortes por cabeza' % len(cs))
    else:
        cortes = [round(i * W / n_esperado) for i in range(n_esperado + 1)]
        print('  AVISO: %d cabezas para %d frames, se reparte en columnas iguales'
              % (len(cs), n_esperado))
    recs = []
    for i in range(n_esperado):
        a, b = cortes[i], cortes[i + 1]
        r = recorte_caja(im, [a, 0, b, im.size[1]])
        if r is not None:
            r = limpiar_vecinos(r)
        if r and r.size[1] > 60:
            recs.append(r)
    if not recs:
        return None
    pal = paleta_de(recs)
    piezas_f = []
    for i, r in enumerate(recs):
        c = casco(r)
        hx0, hy0 = (c[1], c[2]) if c else (r.size[0] / 2, r.size[1] / 4)
        k = max(1.0, (r.size[1] - hy0)) / CABEZA_PIES
        sp = a_pixel(r, k)
        rojo = sum(1 for p in sp.get_flattened_data() if p[3] and es_fondo(p[:3], 20))
        piezas_f.append({'i': i, 'sp': sp, 'hx': hx0 / k, 'hy': hy0 / k, 'k': k,
                         'origen': list(r.size), 'casco': bool(c), 'rojo': rojo})
    izq = max(p['hx'] for p in piezas_f)
    der = max(p['sp'].size[0] - p['hx'] for p in piezas_f)
    arr = max(p['hy'] for p in piezas_f)
    aba = max(p['sp'].size[1] - p['hy'] for p in piezas_f)
    ax, ay = int(round(izq)) + MARGEN, int(round(arr)) + MARGEN
    W, H = int(round(izq + der)) + MARGEN * 2, int(round(arr + aba)) + MARGEN * 2
    destino = os.path.join(SALIDA, anim)
    os.makedirs(destino, exist_ok=True)
    datos = []
    for p in piezas_f:
        lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        lienzo.alpha_composite(p['sp'], (int(round(ax - p['hx'])), int(round(ay - p['hy']))))
        lienzo.save(os.path.join(destino, 'f%02d.png' % p['i']))
        bb = lienzo.getbbox()
        datos.append({'i': p['i'], 'fichero': '%s/f%02d.png' % (anim, p['i']),
                      'origen': p['origen'], 'k': round(p['k'], 2), 'casco': p['casco'],
                      'rojo': p['rojo'], 'casco_encontrado': p['casco'],
                      'cortado': bool(bb and (bb[0] <= 0 or bb[1] <= 0 or bb[2] >= W or bb[3] >= H))})
    print('%-7s %d/%d frames | fondo %s | lienzo %dx%d | cabeza (%d,%d) | sin casco %d | rojo %d'
          % (anim, len(piezas_f), n_esperado, bg, W, H, ax, ay,
             sum(1 for d in datos if not d['casco']), sum(d['rojo'] for d in datos)))
    return {'lienzo': [W, H], 'ancla': [ax, ay], 'pies_y': ay + CABEZA_PIES,
            'esperado': n_esperado, 'frames': datos}


def main():
    os.makedirs(SALIDA, exist_ok=True)
    todo = {}
    for anim, fichero, n in (('stance', 'sheet_stance.png', 8), ('walk', 'sheet_walk.png', 6)):
        r = procesar(anim, fichero, n)
        if r:
            todo[anim] = r
    with open(os.path.join(SALIDA, 'datos.json'), 'w') as fh:
        json.dump({'fondo': list(FONDO), 'cabeza_pies': CABEZA_PIES,
                   'reglas': ['fondo fuera de la paleta', 'anclaje por cabeza'],
                   'anims': todo}, fh, indent=1)


if __name__ == '__main__':
    main()
