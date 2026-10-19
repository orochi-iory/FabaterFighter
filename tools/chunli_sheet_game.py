#!/usr/bin/env python3
"""Hoja de juego de Chun-Li: frames de rows/ metidos en una rejilla como la de Voltia.

Lo que hace, en orden:

1. Coge los frames ya cortados de voltia/nuevo/chunli/rows/ (no toca la hoja
   original: solo lee).
2. Quita la sombra negra que trae el dibujo. Es del suelo, no del personaje: si
   se queda dentro del sprite, al saltar la sombra salta con ella y ademas el
   motor dibuja la suya. Antes de quitarla se usa como referencia de suelo.
3. Alinea cada frame por dos anclas: el suelo (pies en la misma linea) y el eje
   de la cabeza (cabeza en la misma vertical). Los frames en el aire conservan
   su altura porque el suelo sale de la sombra, no de la caja del dibujo.
4. Escala todo por S para que la altura de la tinta coincida con la de Voltia
   (147 px de mundo medidos, no supuestos) y monta la rejilla con NEAREST.

    PYTHONPATH=tools/pylibs python3 tools/chunli_sheet_game.py

Escribe voltia/nuevo/chunli/game/sheet.png y sheet.json.
"""
import json
import os

from PIL import Image

BASE = 'voltia/nuevo/chunli'
SALIDA = os.path.join(BASE, 'game')
HOJA_VOLTIA = 'voltia/sheet_uniform.png'
CV, CH = 350, 332          # celda de la hoja de Voltia
FILA_SPARK = 16            # rayo_proj en la hoja de Voltia

# id, carpeta de rows/, frames (None = todos), fps, bucle
ANIMS = [
    ('stance', '01_stance', None, 10, True),
    ('walk', '04_walk_fwd', None, 12, True),
    ('walk_back', '05_walk_back', None, 12, True),
    ('dash', '04_walk_fwd', [0, 1, 2], 16, True),
    # En estas cuatro filas el dibujo ya trae el arco del salto (el cuerpo sube
    # hasta 85 px sobre el suelo de la franja). Si se ancla cada frame por los
    # pies, la voltereta se aplasta contra el suelo y el sprite pega saltos: se
    # ancla por el CENTRO del cuerpo, y la altura la pone el motor con p.y.
    ('jump', '13_jump_place', None, 12, False, 'centro'),
    ('fwdjump', '14_jump_fwd', None, 12, False, 'centro'),
    ('crouch', '18_crouch_punch_strong', [2, 3, 4], 8, True),
    ('block', '22_block_super', [0, 1, 2, 3, 4, 5], 10, True),
    ('punch_weak', '08_punch_weak', None, 14, False),
    ('punch_strong', '07_punch_strong', None, 11, False),
    ('kick_weak', '09_kick_weak', None, 13, False),
    ('kick_strong', '06_kick_strong', None, 10, False),
    ('crouch_punch_weak', '21_crouch_punch_weak', None, 12, False),
    ('crouch_punch_strong', '18_crouch_punch_strong', None, 11, False),
    ('crouch_kick_weak', '20_crouch_kick_weak', None, 13, False),
    ('crouch_kick_strong', '19_crouch_kick_strong', None, 12, False),
    ('jump_punch', '16_jump_punch', None, 16, False, 'centro'),
    ('jump_kick', '17_jump_kick', None, 16, False, 'centro'),
    # la voltereta lleva su propia altura dentro de la hoja: aqui NO se aplana
    # al suelo, se deja subir y bajar como esta dibujada
    ('kick_fwd_down', '15_kick_fwd_down', None, 18, False, 'sombra'),
    ('special_dd_k', '10_special_dd_k', None, 12, False),
    ('speed_kick', '12_speed_kick', None, 16, False),
    ('rayo_throw', '11_special_projectile', None, 10, False),
    ('hit', '22_block_super', [3, 4, 5], 8, False),
    ('crouch_hit', '22_block_super', [1, 2], 8, False),
    ('knockdown', '24_knockdown', [2, 3, 4, 5, 6, 7, 8], 8, False),
    ('ko', '24_knockdown', [7, 8], 5, True),
    ('victory1', '22_block_super', [6, 7, 8, 9, 10, 11, 12, 13], 8, True),
    ('victory2', '10_special_dd_k', None, 8, True),
]

# filas donde el corte por columnas trae trozos de la figura vecina
FRAGMENTOS = {'jump', 'fwdjump', 'jump_punch', 'jump_kick', 'kick_fwd_down'}

NEGRO = (0, 0, 0, 255)


def quitar_sombra(im):
    """Borra la elipse negra del suelo y devuelve la linea de suelo.

    La sombra es una mancha de negro puro ancha y baja (relleno), separada del
    cuerpo. Se detecta por forma, no por posicion, porque en los frames en el
    aire la sombra queda a distinta altura.
    """
    px = im.load()
    w, h = im.size
    visto = set()
    fuera = []
    suelo = None
    for y in range(h):
        for x in range(w):
            if (x, y) in visto or px[x, y] != NEGRO:
                continue
            pila = [(x, y)]
            visto.add((x, y))
            comp = []
            while pila:
                cx, cy = pila.pop()
                comp.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if (dx or dy) and 0 <= nx < w and 0 <= ny < h \
                                and (nx, ny) not in visto and px[nx, ny] == NEGRO:
                            visto.add((nx, ny))
                            pila.append((nx, ny))
            xs = [p[0] for p in comp]
            ys = [p[1] for p in comp]
            cw = max(xs) - min(xs) + 1
            ch = max(ys) - min(ys) + 1
            relleno = len(comp) / float(cw * ch)
            if cw >= 10 and ch <= 7 and cw >= 2.5 * ch and relleno >= 0.5:
                fuera += comp
                suelo = max(ys) if suelo is None else max(suelo, max(ys))
    for (x, y) in fuera:
        px[x, y] = (0, 0, 0, 0)

    # Resto de sombra: cuando la sombra toca el pie, el componente negro se pega
    # al contorno del dibujo y no pasa el filtro de forma. Lo que queda es negro
    # puro por DEBAJO de la ultima fila con color del sprite: eso no puede ser
    # dibujo, es la sombra. Se quita solo si son 6 px o mas, para no comerse un
    # borde suelto.
    # Las sombras que tocan el pie no se pueden quitar por forma, porque el
    # componente negro se pega al contorno del dibujo. Se quitan por DISTANCIA:
    # el contorno del sprite siempre esta a 1 px de un pixel con color, la
    # sombra no. Solo se mira la franja de abajo, que es donde va esa sombra.
    if any(px[x, y] == NEGRO for y in range(h) for x in range(w)):
        color = [(x, y) for y in range(h) for x in range(w)
                 if px[x, y][3] > 0 and not (px[x, y][0] < 25 and px[x, y][1] < 25
                                             and px[x, y][2] < 25)]
        if color:
            dist = {}
            cola = []
            for (x, y) in color:
                dist[(x, y)] = 0
                cola.append((x, y))
            i = 0
            while i < len(cola):
                cx, cy = cola[i]
                i += 1
                if dist[(cx, cy)] >= 2:
                    continue
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in dist:
                            dist[(nx, ny)] = dist[(cx, cy)] + 1
                            cola.append((nx, ny))
            for y in range(h):
                for x in range(w):
                    if px[x, y] == NEGRO and dist.get((x, y), 9) >= 2:
                        px[x, y] = (0, 0, 0, 0)
    return suelo


def amarillo(p):
    r, g, b = p[:3]
    return r > 200 and g > 150 and b < 130


def anclas(im, suelo):
    """eje de la cabeza (x) y suelo (y) de un frame."""
    px = im.load()
    w, h = im.size
    pts = [(x, y) for y in range(h) for x in range(w)
           if px[x, y][3] > 0 and not amarillo(px[x, y])]
    if not pts:
        pts = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    b_h = max(ys) - min(ys) + 1
    b_w = max(xs) - min(xs) + 1
    if suelo is None:
        suelo = max(ys)
    if b_h >= 1.15 * b_w:
        # de pie: el eje es el centro de la tinta de arriba (la cabeza)
        tope = min(ys) + max(2, b_h // 5)
        cab = [x for x, y in pts if y <= tope]
        eje = (min(cab) + max(cab)) / 2.0
    else:
        eje = (min(xs) + max(xs)) / 2.0
    return eje, suelo


def frames_de(carpeta, cuales):
    fs = sorted(f for f in os.listdir(carpeta) if f.endswith('.png'))
    if cuales is not None:
        fs = [fs[i] for i in cuales]
    return [Image.open(os.path.join(carpeta, f)).convert('RGBA') for f in fs]


def spark_voltia(k):
    """La chispa del rayo de Voltia, al tamaño que tiene en su juego."""
    hoja = Image.open(HOJA_VOLTIA).convert('RGBA')
    celdas = []
    for c in range(3):
        im = hoja.crop((c * CV, FILA_SPARK * CH, (c + 1) * CV, (FILA_SPARK + 1) * CH))
        celdas.append(im.crop(im.getbbox()))
    # UNA sola escala para los tres frames: si cada uno se ajusta a su alto, la
    # chispa cambia de tamaño entre frames y el proyectil tiembla. k = 0,42 es
    # la escala a la que Voltia dibuja su chispa (projectile.scale).
    return [i.resize((max(1, int(round(i.size[0] * k))),
                      max(1, int(round(i.size[1] * k)))), Image.NEAREST) for i in celdas]



def quitar_fragmentos(im, frac=0.18):
    """Borra los trozos sueltos que en la hoja son de la figura vecina.

    El corte de estas filas va por columnas, asi que un frame se trae a veces
    una mano o una cabeza de la figura de al lado flotando en el aire. Es un
    trozo pequeno comparado con el cuerpo: se queda solo lo que mide al menos el
    18 % del trozo mayor y se recorta el frame a lo que queda.
    """
    px = im.load()
    w, h = im.size
    visto = [[False] * w for _ in range(h)]
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if visto[y0][x0] or px[x0, y0][3] == 0:
                continue
            pila = [(x0, y0)]
            visto[y0][x0] = True
            pts = []
            while pila:
                cx, cy = pila.pop()
                pts.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not visto[ny][nx] \
                                and px[nx, ny][3] > 0:
                            visto[ny][nx] = True
                            pila.append((nx, ny))
            comps.append(pts)
    if len(comps) < 2:
        return im
    mayor = max(len(c) for c in comps)
    for pts in comps:
        if len(pts) < max(10, frac * mayor):
            for (x, y) in pts:
                px[x, y] = (0, 0, 0, 0)
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def main():
    os.makedirs(SALIDA, exist_ok=True)
    alto_voltia = 147.0      # medido: 294 px de tinta x 0.5 de scale

    # --- 1. alturas nativas y escala ---
    # la altura se mide SIN la sombra del suelo: la sombra no es el personaje y
    # contarla daba 2 px de mas (y una escala 3 % corta)
    stance = frames_de(os.path.join(BASE, 'rows', '01_stance'), None)
    alturas = []
    for im in stance:
        quitar_sombra(im)
        bb = im.getbbox()
        alturas.append(bb[3] - bb[1])
    alturas.sort()
    nativa = alturas[len(alturas) // 2]
    S = alto_voltia / float(nativa)
    print('Chun-Li stance: %d frames, alto de tinta %d-%d, mediana %d px' %
          (len(alturas), alturas[0], alturas[-1], nativa))
    print('Voltia mide %.0f px de mundo (medido en su hoja)' % alto_voltia)
    print('escala aplicada: %.3f  ->  %.1f px de mundo' % (S, nativa * S))

    # --- 2. piezas alineadas (antes de escalar) ---
    piezas = []          # (id, [imagenes recortadas con su (dx,dy) respecto al ancla])
    for fila in ANIMS:
        anim_id, carpeta, cuales, fps, bucle = fila[:5]
        ancla = fila[5] if len(fila) > 5 else 'pies'
        ims = frames_de(os.path.join(BASE, 'rows', carpeta), cuales)
        piezas.append((anim_id, carpeta, ims, fps, bucle, ancla))

    # la chispa entra como una animación más
    spark = spark_voltia(0.42)
    piezas.append(('rayo_proj', 'voltia/sheet_uniform.png#16', spark, 12, True, 'pies'))

    # --- 3. geometría común ---
    # para cada frame: eje_x, suelo_y dentro de su imagen; extensiones de la tinta
    geo = []
    for anim_id, carpeta, ims, fps, bucle, ancla in piezas:
        lista = []
        # 'centro': el punto que se clava en el pivote no son los pies del frame
        # sino el centro del cuerpo, a la altura que tiene en el primer frame (el
        # de despegue, con los pies en el suelo). Asi la voltereta gira sobre si
        # misma en vez de dar tirones, y el motor sigue mandando la altura.
        centro_h = None
        for k, im in enumerate(ims):
            if anim_id == 'rayo_proj':
                bb = im.getbbox()
                lista.append((im, (bb[0] + bb[2]) / 2.0, bb[3]))
                continue
            if anim_id in FRAGMENTOS:
                im = quitar_fragmentos(im)
            suelo_sombra = quitar_sombra(im)   # fuera la sombra del suelo
            if ancla == 'centro':
                bb = im.getbbox()
                if centro_h is None:
                    centro_h = (bb[3] - bb[1]) / 2.0
                eje = (bb[0] + bb[2]) / 2.0
                lista.append((im, eje, bb[1] + (bb[3] - bb[1]) / 2.0 + centro_h))
                continue
            # anclaje por los pies, no por la sombra ni por la caja del dibujo:
            # la altura del salto y del derribo la mueve el motor con p.y, asi
            # que el sprite tiene que ir con los pies en el pivote. Si los frames
            # se dejan a la altura que tienen en la hoja, el salto sale doble.
            eje, suelo = anclas(im, suelo_sombra if ancla == 'sombra' else None)
            lista.append((im, eje, suelo))
        geo.append((anim_id, carpeta, lista, fps, bucle, ancla))

    IZQ = DER = ARR = ABA = 0
    for anim_id, carpeta, lista, fps, bucle, ancla in geo:
        for im, eje, suelo in lista:
            bb = im.getbbox()
            if not bb:
                continue
            IZQ = max(IZQ, eje - bb[0])
            DER = max(DER, bb[2] - eje)
            ARR = max(ARR, suelo - bb[1])
            ABA = max(ABA, bb[3] - suelo)
    cw0 = int(round(IZQ + DER))
    ch0 = int(round(ARR + ABA))
    print('celda nativa %dx%d  (eje x=%d, suelo y=%d)' % (cw0, ch0, round(IZQ), round(ARR)))

    cw, ch = int(round(cw0 * S)), int(round(ch0 * S))
    pivx, pivy = int(round(IZQ * S)), int(round(ARR * S))
    print('celda escalada %dx%d  pivote (%d, %d)' % (cw, ch, pivx, pivy))

    # --- 4. montar la rejilla ---
    cols = max(len(f[2]) for f in geo)
    rows = len(geo)
    hoja = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
    salida = []
    for r, (anim_id, carpeta, lista, fps, bucle, ancla) in enumerate(geo):
        for c, (im, eje, suelo) in enumerate(lista):
            celda = Image.new('RGBA', (cw0, ch0), (0, 0, 0, 0))
            celda.alpha_composite(im, (int(round(IZQ - eje)), int(round(ARR - suelo))))
            celda = celda.resize((cw, ch), Image.NEAREST)
            hoja.alpha_composite(celda, (c * cw, r * ch))
        salida.append({'id': anim_id, 'label': anim_id.replace('_', ' '),
                       'row': r, 'frames': len(lista), 'fps': fps, 'loop': bucle})
        print('  fila %2d  %-20s %2d frames  %2d fps  %s  (%s)'
              % (r, anim_id, len(lista), fps, 'bucle' if bucle else 'una vez', carpeta))

    hoja.save(os.path.join(SALIDA, 'sheet.png'))

    # --- 5. comprobar la altura ya horneada ---
    celdas = []
    fila_stance = [a for a in salida if a['id'] == 'stance'][0]['row']
    for c in range(salida[fila_stance]['frames']):
        cel = hoja.crop((c * cw, fila_stance * ch, (c + 1) * cw, (fila_stance + 1) * ch))
        bb = cel.getbbox()
        celdas.append(bb[3] - bb[1])
    celdas.sort()
    print('altura horneada del stance: %d-%d, mediana %d px (Voltia %d)'
          % (celdas[0], celdas[-1], celdas[len(celdas) // 2], int(alto_voltia)))

    meta = {
        'sprite': 'sheet.png',
        'cell': {'w': cw, 'h': ch},
        'pivot': [pivx, pivy],
        'scale': 1,
        'height_world': round(celdas[len(celdas) // 2], 1),
        'notes': 'Chun-Li a la altura de Voltia. Escala %.3f sobre frames nativos.' % S,
        'animations': salida,
    }
    json.dump(meta, open(os.path.join(SALIDA, 'sheet.json'), 'w'), indent=1)
    print('%s: %d filas x %d columnas, celda %dx%d, %.1f MB'
          % (os.path.join(SALIDA, 'sheet.png'), rows, cols, cw, ch,
             os.path.getsize(os.path.join(SALIDA, 'sheet.png')) / 1048576.0))


if __name__ == '__main__':
    main()
