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
import copy
import json
import os
import uuid

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


def desmatar(im, exceso_limpio=45, corte=0.45, radio=6, tol=85):
    """Quita el velo rojo de la silueta demostrando que cada píxel ES una mezcla.

    Las tres versiones anteriores, y por qué fallaron
    ------------------------------------------------
    v1  umbral r>215: dejaba el antialias (bandas de 2-4 px con (40,0,0)).
    v2  `a = 1 - exceso/255`, aplicado a todo lo opaco: la piel de Voltia tiene exceso
        alto por sí misma —(242,173,127)→69, (223,156,119)→104, (229,173,142)→56— y se
        tomaba por velo: opacidad falsa y color del vecino pegado. Manchas marrones.
    v3  banda de 6 px + prueba por canales verde/azul: se le escapaba el filo oscuro,
        porque con referencia casi negra el verde es ~0 y el rojo previsto salía 255.
        Filtrar 19 px rojizos → 858.

    v5 (esto): además, se aplica al LIENZO y no al recorte. El recorte no tiene fondo
        alrededor (sus bordes son el corte), así que su filo quedaba a distancia -1, fuera
        de la banda, y sobrevivía el velo: se veía una línea roja en el borde superior de
        algunos frames de walk. En el lienzo el borde es transparencia de verdad.

    v4: banda de 6 px + **ajuste por mínimos cuadrados**, tol=85 y corte=0,45
        (barrido medido: 12 combinaciones; sin desmatar quedaban 2 439 px de filo rojizo
        que no es piel, con estos valores 42, y las manchas dentro de la piel no suben).
    -----------------------------------------------------------
    Si el píxel p es mezcla de un color limpio C y rojo puro R=(255,0,0):

        p = a·C + (1-a)·R      →      p - R = a·(C - R)

    y `a` se despeja de golpe en los tres canales:

        a = ((p-R)·(C-R)) / |C-R|²

    Luego se comprueba que de verdad cae ahí: `|p - (R + a·(C-R))| <= tol`.

      - a > 1,02  → el píxel es más claro que el interior: no puede ser mezcla con rojo
                    (mezclar con rojo solo quita). NO se toca. Esto salva la piel.
      - residuo grande → es una sombra, una línea o un brillo, no una mezcla. NO se toca.
      - si pasa: a >= 0,5 → color limpio C; a < 0,5 → transparente.

    C es el color del interior más cercano (distancia al fondo > radio por BFS), que por
    construcción no es velo.
    """
    px = im.load()
    W, H = im.size
    opaco = [[bool(px[x, y][3]) for x in range(W)] for y in range(H)]
    V4 = ((1, 0), (-1, 0), (0, 1), (0, -1))

    # --- 1. distancia al fondo por dentro de lo opaco
    dist = [[-1] * W for _ in range(H)]
    cola = deque()
    for y in range(H):
        for x in range(W):
            if not opaco[y][x]:
                dist[y][x] = 0
                cola.append((x, y))
    while cola:
        cx, cy = cola.popleft()
        if dist[cy][cx] >= radio:
            continue
        for dx, dy in V4:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < W and 0 <= ny < H and dist[ny][nx] == -1:
                dist[ny][nx] = dist[cy][cx] + 1
                cola.append((nx, ny))

    # --- 2. referencia: interior (dist > radio); si el sprite es muy fino, los limpios
    sem = [[None] * W for _ in range(H)]
    cola = deque()
    for y in range(H):
        for x in range(W):
            if not opaco[y][x]:
                continue
            interior = dist[y][x] == -1 or dist[y][x] > radio
            if interior or (px[x, y][0] - max(px[x, y][1], px[x, y][2])) <= exceso_limpio:
                sem[y][x] = px[x, y][:3]
                cola.append((x, y))
    while cola:
        cx, cy = cola.popleft()
        for dx, dy in V4:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < W and 0 <= ny < H and opaco[ny][nx] and sem[ny][nx] is None:
                sem[ny][nx] = sem[cy][cx]
                cola.append((nx, ny))

    # --- 3. ¿es mezcla con rojo?
    tocados = 0
    for y in range(H):
        for x in range(W):
            if not opaco[y][x]:
                continue
            if dist[y][x] != -1 and dist[y][x] > radio:
                continue                             # interior: intocable
            C = sem[y][x]
            if C is None:
                continue
            d0, d1, d2 = C[0] - 255.0, C[1], C[2]
            dd = d0 * d0 + d1 * d1 + d2 * d2
            if dd < 1.0:
                continue                             # referencia = rojo: no sirve
            r, g, b = px[x, y][0], px[x, y][1], px[x, y][2]
            a = ((r - 255.0) * d0 + g * d1 + b * d2) / dd
            if a > 1.02:
                continue                             # más claro que el interior
            pr, pg, pb = 255.0 + a * d0, a * d1, a * d2
            res = max(abs(r - pr), abs(g - pg), abs(b - pb))
            if res > tol:
                continue                             # el rojo no cuadra: es dibujo
            if a >= corte:
                px[x, y] = (C[0], C[1], C[2], 255)
            else:
                px[x, y] = (0, 0, 0, 0)
            tocados += 1
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


def procesar(anim, fichero, n_esperado, extras=None):
    extras = extras or []
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
        # OJO: aquí NO se desmata. El recorte no tiene fondo a su alrededor (sus bordes son
        # el corte), así que el filo del recorte quedaba a distancia -1 y el velo sobrevivía.
        # Se desmata el LIENZO, que sí lleva su transparencia de verdad. Ver v5 en desmatar().
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
    # No se pierden frames añadidos/aprobados desde el creador. Si su lienzo medido no
    # coincide con la nueva hoja, se conserva toda la animación anterior sin sobrescribirla.
    for extra, blob, size in extras:
        if tuple(size) != (CW, CH):
            print('  AVISO: no regenero %s: el frame añadido %s mide %dx%d y la hoja nueva %dx%d; '
                  'conservo el movimiento anterior intacto.'
                  % (anim, extra.get('id', extra.get('i')), size[0], size[1], CW, CH))
            return None
    destino = os.path.join(SALIDA, anim)
    os.makedirs(destino, exist_ok=True)
    for f in os.listdir(destino):
        os.remove(os.path.join(destino, f))
    datos = []
    for i, p in enumerate(piezas):
        lienzo = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        lienzo.alpha_composite(p['sp'], (int(round(ax - p['hx'])), int(round(ay - p['hy']))))
        lienzo = desmatar(lienzo)      # ahora el borde del sprite sí es transparente
        lienzo.save(os.path.join(destino, 'f%02d.png' % i))
        bb = lienzo.getbbox()
        datos.append({'id': uuid.uuid4().hex, 'estado': 'pendiente',
                      'i': i, 'fichero': '%s/f%02d.png' % (anim, i),
                      'nativo': list(p['sp'].size), 'caja_en_hoja': p['caja'],
                      'cabeza': [round(p['hx'], 1), round(p['hy'], 1)],
                      'cortado': bool(bb and (bb[0] <= 0 or bb[1] <= 0 or bb[2] >= CW or bb[3] >= CH))})
    base_generados = len(datos)
    for extra, blob, _size in extras:
        i = len(datos)
        nombre = 'f%02d.png' % i
        with open(os.path.join(destino, nombre), 'wb') as out:
            out.write(blob)
        entry = copy.deepcopy(extra)
        entry.update({'i': i, 'fichero': '%s/%s' % (anim, nombre)})
        datos.append(entry)
    print('%-7s %d nuevos + %d preservados | lienzo %dx%d | ancla cabeza (%d,%d) | '
          'sin reducir | cortados %d'
          % (anim, base_generados, len(extras), CW, CH, ax, ay,
             sum(1 for d in datos[:base_generados] if d['cortado'])))
    return {'lienzo': [CW, CH], 'ancla': [ax, ay], 'esperado': n_esperado,
            'escala': 1, 'frames': datos}


def main():
    os.makedirs(SALIDA, exist_ok=True)
    datos_p = os.path.join(SALIDA, 'datos.json')
    try:
        anterior = json.load(open(datos_p, encoding='utf-8'))
    except FileNotFoundError:
        anterior = {'anims': {}}
    antiguas = anterior.get('anims', {})
    todo = {}
    for anim, fichero, n in (('stance', 'sheet_stance.png', 8), ('walk', 'sheet_walk.png', 6)):
        extras = []
        old_anim = antiguas.get(anim, {})
        for frame in old_anim.get('frames', []):
            # Los frames de la hoja se regeneran; los añadidos/copias aceptadas son
            # material distinto y se conservan byte a byte.
            if not (frame.get('subido') or frame.get('copiado_de')):
                continue
            path = os.path.join(SALIDA, frame.get('fichero', '%s/f%02d.png' % (anim, frame['i'])))
            if not os.path.isfile(path):
                continue
            with Image.open(path) as im:
                size = im.size
            extras.append((copy.deepcopy(frame), open(path, 'rb').read(), size))
        r = procesar(anim, fichero, n, extras)
        if r:
            todo[anim] = r
        elif anim in antiguas:
            todo[anim] = antiguas[anim]
    # Mantener todo movimiento agregado desde la biblioteca (jump, block, etc.); este
    # troceador solo rehace las hojas IA de stance y walk.
    for anim, old_anim in antiguas.items():
        if anim not in todo:
            todo[anim] = old_anim
    with open(datos_p, 'w', encoding='utf-8') as fh:
        json.dump({'sin_escalar': True, 'fondo': 'rojo puro -> transparencia',
                   'anims': todo}, fh, indent=1, ensure_ascii=False)
        fh.write('\n')


if __name__ == '__main__':
    main()
