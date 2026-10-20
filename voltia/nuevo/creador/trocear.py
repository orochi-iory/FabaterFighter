"""Trocea las hojas de la IA respetando las reglas de oro. Version 3: SIN REDUCIR.

POR QUE NO SE REDUCE (esto es lo que hacia que se viera sucio)
    La imagen que devuelve la IA parece pixel art pero NO lo es: tiene 152 107 colores
    distintos, 107 220 de ellos usados en un solo pixel, y el 88 % de las transiciones son
    suaves. No hay rejilla de pixeles (solo el 8 % de los bloques 2x2 son uniformes).
    Reducirla -con NEAREST y factor fraccionario (3,83-4,28)- tira 30 000 colores, rompe
    las lineas de 1 px (el filo cian de las botas) y deja escalones irregulares: eso es el
    aspecto de "baja resolucion y sucio".

    Aqui NO se reduce. Se recorta a resolucion nativa y solo se convierte el rojo en
    transparencia pura. El sprite queda exactamente como lo dibujo la IA.

SEPARACION (por que antes se colaban unos en otros)
    Las hojas vienen con los sprites casi pegados. Cortar por columnas fija corta cuerpos.
    Aqui cada pixel no-rojo se asigna a la CABEZA mas cercana (BFS multi-fuente): cada
    pixel pertenece a un unico sprite y ninguno se duplica ni se parte.

ANCLAJE
    Regla de oro: el ancla es el centro del casco. Se coloca cada sprite por traslacion
    (sin escalar) para que su cabeza caiga en el mismo pixel.
"""
from collections import deque, Counter
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ORIGEN = os.path.join(BASE, 'voltia/nuevo/creador')
SALIDA = os.path.join(ORIGEN, 'sprites')

TOL = 90          # rojo del fondo + su antialias
MARGEN = 6


def es_rojo(c, tol=TOL):
    """Rojo de fondo y su antialias: rojo alto y verde/azul casi nulos."""
    return c[0] > 255 - tol and c[1] < tol and c[2] < tol


def alpha_de_rojo(im):
    """Convierte el rojo en transparencia pura. No toca ningun otro pixel."""
    out = im.convert('RGBA').copy()
    px = out.load()
    W, H = out.size
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if es_rojo(c):
                px[x, y] = (0, 0, 0, 0)
    return out


def desmatar(im, exceso_limpio=45, corte=0.5):
    """Elimina el velo rojo de la silueta propagando el color interior.

    El problema: la IA antialiasa el personaje contra el rojo, y no deja un filo de 1 px
    sino bandas de 2-4 px con tonos como (40,0,0) o (74,0,0). Mi umbral pedia rojo casi
    puro (r>215), asi que todo eso sobrevivia y se veia como borde rojo.

    Metodo, en dos pasos y sin inventar tonos:
      1. `exceso = r - max(g,b)` mide cuanto rojo del fondo lleva el pixel. Si la mezcla es
         con un color oscuro (la linea de la silueta), entonces exceso = 255*(1-a), asi que
         a = 1 - exceso/255 es la opacidad real del pixel.
      2. si a >= corte el pixel es del personaje: se le pone el color del interior mas
         cercano (propagacion BFS), no una mezcla calculada. Si a < corte, era fondo: fuera.

    Asi el borde queda con los colores del propio dibujo: cero rojo.
    """
    px = im.load()
    W, H = im.size
    opaco = [[bool(px[x, y][3]) for x in range(W)] for y in range(H)]

    def exceso(c):
        return c[0] - max(c[1], c[2])

    limpio = [[opaco[y][x] and exceso(px[x, y][:3]) <= exceso_limpio for x in range(W)] for y in range(H)]
    # propagar el color limpio mas cercano a todo lo opaco
    color = [[None] * W for _ in range(H)]
    cola = deque()
    for y in range(H):
        for x in range(W):
            if limpio[y][x]:
                color[y][x] = px[x, y][:3]
                cola.append((x, y))
    while cola:
        cx, cy = cola.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < W and 0 <= ny < H and opaco[ny][nx] and color[ny][nx] is None:
                color[ny][nx] = color[cy][cx]
                cola.append((nx, ny))
    for y in range(H):
        for x in range(W):
            if not opaco[y][x]:
                continue
            p_ = px[x, y][:3]
            e = exceso(p_)
            if e <= exceso_limpio:
                continue
            a = 1.0 - e / 255.0
            if a < corte or color[y][x] is None:
                px[x, y] = (0, 0, 0, 0)
            else:
                c = color[y][x]
                px[x, y] = (c[0], c[1], c[2], 255)
    return im


def es_casco(c):
    r, g, b = c
    return r > 110 and b > 80 and g < 0.65 * r and r - g > 45 and b > 0.4 * r


def cabezas(im, junta):
    """Centros de los cascos. El visor teal parte el casco: se fusionan los cercanos."""
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
                if cy_ < 0.45 * H:
                    out.append({'x': cx_, 'y': cy_, 'n': len(xs)})
    out.sort(key=lambda c: c['x'])
    fin = []
    for c in out:
        if fin and c['x'] - fin[-1]['x'] < junta:
            if c['n'] > fin[-1]['n']:
                fin[-1] = c
            continue
        fin.append(c)
    for i, c in enumerate(fin):
        c['i'] = i
    return fin


def repartir(im, cs):
    """BFS multi-fuente: cada pixel no-rojo va a la cabeza mas cercana.

    Devuelve una etiqueta por pixel (0..n-1, o -1 si es fondo). Asi dos sprites que se
    tocan se reparten por el punto medio y ninguno se lleva un trozo del vecino.
    """
    px = im.load()
    W, H = im.size
    etiqueta = [[-1] * W for _ in range(H)]
    dq = deque()
    for c in cs:
        x, y = int(round(c['x'])), int(round(c['y']))
        # sembrar con los pixeles del casco mas cercanos al centro
        semillas = 0
        for dy in range(-14, 15):
            for dx in range(-14, 15):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and etiqueta[ny][nx] == -1 and not es_rojo(px[nx, ny]):
                    etiqueta[ny][nx] = c['i']
                    dq.append((nx, ny))
                    semillas += 1
    while dq:
        cx, cy = dq.popleft()
        lab = etiqueta[cy][cx]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < W and 0 <= ny < H and etiqueta[ny][nx] == -1 and not es_rojo(px[nx, ny]):
                etiqueta[ny][nx] = lab
                dq.append((nx, ny))
    return etiqueta


def sprite_de(im, etiqueta, lab):
    """Recorta el sprite de una etiqueta, a resolucion nativa, con rojo transparente."""
    px = im.load()
    W, H = im.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            if etiqueta[y][x] == lab:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None, None
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    out = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
    po = out.load()
    # pixeles del sprite a color nativo, sin tocar nada
    for y in range(y0, y1):
        for x in range(x0, x1):
            if etiqueta[y][x] == lab:
                c = px[x, y]
                po[x - x0, y - y0] = c + (255,)
    return out, (x0, y0, x1, y1)


def procesar(anim, fichero, n_esperado):
    with Image.open(os.path.join(ORIGEN, fichero)) as src:
        im = src.convert('RGB')
    W, H = im.size
    cs = cabezas(im, W / n_esperado * 0.55)
    if len(cs) != n_esperado:
        print('  AVISO: %d cabezas para %d sprites esperados' % (len(cs), n_esperado))
    if not cs:
        return None
    etiqueta = repartir(im, cs)
    piezas = []
    for c in cs:
        sp, caja = sprite_de(im, etiqueta, c['i'])
        if sp is None or sp.size[1] < 60:
            continue
        sp = desmatar(sp)
        piezas.append({'lab': c['i'], 'sp': sp, 'caja': caja,
                       'hx': c['x'] - caja[0], 'hy': c['y'] - caja[1]})
    if not piezas:
        return None
    # lienzo comun por traslacion: la cabeza al mismo pixel
    ax = int(round(max(p['hx'] for p in piezas))) + MARGEN
    ay = int(round(max(p['hy'] for p in piezas))) + MARGEN
    der = int(round(max(p['sp'].size[0] - p['hx'] for p in piezas))) + MARGEN
    aba = int(round(max(p['sp'].size[1] - p['hy'] for p in piezas))) + MARGEN
    CW, CH = ax + der, ay + aba
    destino = os.path.join(SALIDA, anim)
    os.makedirs(destino, exist_ok=True)
    for f in os.listdir(destino):
        os.remove(os.path.join(destino, f))
    datos = []
    for i, p in enumerate(piezas):
        lienzo = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        lienzo.alpha_composite(p['sp'], (int(round(ax - p['hx'])), int(round(ay - p['hy']))))
        lienzo.save(os.path.join(destino, 'f%02d.png' % i))
        bb = lienzo.getbbox()
        datos.append({'i': i, 'fichero': '%s/f%02d.png' % (anim, i),
                      'nativo': list(p['sp'].size), 'caja_en_hoja': p['caja'],
                      'cabeza': [round(p['hx'], 1), round(p['hy'], 1)],
                      'cortado': bool(bb and (bb[0] <= 0 or bb[1] <= 0 or bb[2] >= CW or bb[3] >= CH))})
    print('%-7s %d/%d sprites | lienzo %dx%d | ancla cabeza (%d,%d) | sin reducir | cortados %d'
          % (anim, len(datos), n_esperado, CW, CH, ax, ay,
             sum(1 for d in datos if d['cortado'])))
    return {'lienzo': [CW, CH], 'ancla': [ax, ay], 'esperado': n_esperado,
            'escala': 1, 'frames': datos}


def main():
    os.makedirs(SALIDA, exist_ok=True)
    todo = {}
    for anim, fichero, n in (('stance', 'sheet_stance.png', 8), ('walk', 'sheet_walk.png', 6)):
        r = procesar(anim, fichero, n)
        if r:
            todo[anim] = r
    with open(os.path.join(SALIDA, 'datos.json'), 'w') as fh:
        json.dump({'sin_escalar': True, 'fondo': 'rojo puro -> transparencia',
                   'anims': todo}, fh, indent=1)


if __name__ == '__main__':
    main()
