#!/usr/bin/env python3
"""Chun-Li: las 24 filas reales de la hoja, con sus nombres.

Correcciones sobre la version anterior:

1. La banda 0 no es una fila: lleva DOS filas superpuestas (figuras a y≈7-76 y
   a y≈85-145) mas el retrato. Se separan por altura.
2. El stance son las filas 1, 2 y 3 y es UNA animacion de 23 frames. No se
   publica por partes.
3. Caminar adelante y caminar atras son filas distintas (12 frames cada una).
   Antes se partio una sola fila en dos mitades y eso no vale.
4. El speed kick lleva, ademas de las poses, estelas amarillas dibujadas aparte.
   Se pegan a su pose cuando estan a menos de 8 px; las que van sueltas se
   guardan como capa de efectos.

    PYTHONPATH=tools/pylibs python3 tools/chunli_rows.py voltia/nuevo/chunli
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

BG = (144, 200, 232)
TOL = 24

# fila, slug, nombre, bucle, nota, banda
FILAS = [
    # fila, slug, nombre, bucle, nota, banda, desde, hasta
    # (desde/hasta recortan la lista de figuras de la banda; None = todas)
    (4, 'walk_fwd', 'Caminar adelante', True, 'Ciclo de 12 frames.', 2),
    (5, 'walk_back', 'Caminar atras', True, 'Fila propia, 12 frames.', 3),
    (6, 'kick_strong', 'Patada fuerte (de pie)', False,
     'La pierna sube por encima de la cadera.', 4),
    (7, 'punch_strong', 'Puno fuerte (de pie)', False, 'Brazo extendido al frente.', 5),
    (8, 'punch_weak', 'Puno debil (de pie)', False, 'Mas corto que el fuerte.', 6),
    (9, 'kick_weak', 'Patada debil (de pie)', False, 'Rodilla y extension corta.', 7),
    (10, 'special_dd_k', 'Especial ↓ ↓↘ → + patada', False,
     'Patada girada con efecto en el pie.', 8),
    (11, 'special_projectile', 'Especial proyectil', False,
     'El proyectil no esta dibujado: se completa con la chispa de Voltia.', 9),
    (12, 'speed_kick', 'Speed kick', False,
     'Poses rapidas repetidas; las estelas van dibujadas aparte en la hoja.', 10),
    (13, 'jump_place', 'Salto en el sitio', False, 'Pies fuera del suelo y vuelta.', 11),
    (14, 'jump_fwd', 'Salto adelante', False, 'Invertido sirve de salto atras.', 12),
    (15, 'kick_fwd_down', 'Patada adelante-abajo + voltereta atras', False,
     'Sube por el pecho del rival y cae con voltereta.', 13),
    (16, 'jump_punch', 'Salto + puno (debil o fuerte)', False,
     'Misma animacion para los dos botones; cambia el dano.', 14),
    (17, 'jump_kick', 'Salto + patada (debil o fuerte)', False,
     'Misma animacion para los dos botones; cambia el dano.', 15),
    (18, 'crouch_punch_strong', 'Puno fuerte agachada', False,
     'Los frames de pie sirven de transicion stance <-> agachada.', 16),
    (19, 'crouch_kick_strong', 'Patada fuerte agachada', False, 'Sale desde el suelo.', 17),
    (20, 'crouch_kick_weak', 'Patada debil agachada', False, 'Extension corta.', 18),
    (21, 'crouch_punch_weak', 'Puno debil agachada', False, 'Golpe corto desde agachada.', 19),
    (22, 'block_super', 'Defensa / onda de choque + super', False,
     'Filas 22 y 23 son la misma animacion: 8 + 6 = 14 frames, todos. '
     'La onda y la esfera no estan dibujadas.', 20),
    (24, 'knockdown', 'Derribo y recuperacion', False,
     'Se escogen frames segun la altura de la caida.', 22),
]

ATAQUE = {6, 7, 8, 9, 10, 12, 15, 16, 17, 18, 19, 20, 21}


def limpiar(im):
    """Fondo de la hoja -> transparente."""
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = px[x, y][:3]
            if abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and abs(b - BG[2]) <= TOL:
                px[x, y] = (0, 0, 0, 0)
    return im


def runs_columna(im, y0, y1):
    """Tramos de columnas con tinta entre dos filas."""
    px = im.load()
    salida, ini = [], None
    for x in range(im.size[0]):
        tinta = False
        for y in range(y0, min(y1, im.size[1])):
            r, g, b = px[x, y][:3]
            if abs(r - BG[0]) > TOL or abs(g - BG[1]) > TOL or abs(b - BG[2]) > TOL:
                tinta = True
                break
        if tinta and ini is None:
            ini = x
        elif not tinta and ini is not None:
            salida.append((ini, x - 1)); ini = None
    if ini is not None:
        salida.append((ini, im.size[0] - 1))
    return salida


def grupos_con_estela(hoja, y0, y1, min_ink=420):
    """Poses de una fila y la estela que le toca a cada una, a su derecha.

    La estela es amarilla lisa: se reconoce porque en esa columna casi toda la
    tinta es amarilla (>=60 %). El corte entre cuerpo y estela se hace por la
    primera de esas columnas dentro del tramo. Las estelas que van sueltas (mucha
    menos tinta que una pose) se pegan a la pose de su izquierda, que es la que
    las ha generado.
    """
    px = hoja.load()
    cols = {}
    for x in range(hoja.size[0]):
        tot = am = 0
        for y in range(y0, min(y1 + 1, hoja.size[1])):
            r, g, b = px[x, y][:3]
            if abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and abs(b - BG[2]) <= TOL:
                continue
            tot += 1
            if r > 200 and g > 150 and b < 130:
                am += 1
        cols[x] = (tot, am)

    runs, ini = [], None
    for x in range(hoja.size[0]):
        if cols[x][0] and ini is None:
            ini = x
        elif not cols[x][0] and ini is not None:
            runs.append((ini, x - 1)); ini = None
    if ini is not None:
        runs.append((ini, hoja.size[0] - 1))

    poses = []
    for a, b in runs:
        ink = sum(cols[x][0] for x in range(a, b + 1))
        if ink < min_ink and poses:
            # estela suelta: va con la pose de su izquierda
            e = poses[-1]['estela']
            poses[-1]['estela'] = (min(e[0], a), b) if e else (a, b)
            continue
        corte = next((x for x in range(a, b + 1)
                      if cols[x][0] and cols[x][1] >= 0.6 * cols[x][0]), None)
        if corte is not None and corte - a >= 5:
            poses.append({'cuerpo': (a, corte - 1), 'estela': (corte, b)})
        else:
            poses.append({'cuerpo': (a, b), 'estela': None})
    return poses


def guardar_con_estela(hoja, carpeta, grupos, y0, y1, margen=2):
    """Guarda cada pose con su estela dentro del mismo frame.

    El cuerpo se ancla igual que el stance (pies en la misma linea, eje de la
    cabeza al centro) y la estela se pega al desfase exacto que tiene en la hoja,
    a la derecha del sprite. Asi el rastro acompana el movimiento en vez de
    quedarse en el limbo.
    """
    os.makedirs(carpeta, exist_ok=True)
    piezas = []
    for g in grupos:
        bx0, bx1 = g['cuerpo']
        cuerpo = limpiar(hoja.crop((bx0, y0, bx1 + 1, y1 + 1)))
        bb = cuerpo.getbbox()
        if not bb:
            continue
        cuerpo = cuerpo.crop(bb)
        ax, ay = bx0 + bb[0], y0 + bb[1]
        estela = None
        if g['estela']:
            sx0, sx1 = g['estela']
            ef = limpiar(hoja.crop((sx0, y0, sx1 + 1, y1 + 1)))
            sb = ef.getbbox()
            if sb:
                estela = (ef.crop(sb), sx0 + sb[0] - ax, y0 + sb[1] - ay)
        piezas.append((cuerpo, estela))

    def eje_cabeza(im):
        px = im.load()
        w, h = im.size
        xs = [x for y in range(max(2, h // 4)) for x in range(w) if px[x, y][3] > 0]
        return (min(xs) + max(xs)) / 2.0 if xs else w / 2.0

    ejes = [eje_cabeza(c) for c, _ in piezas]
    derecha = 0.0
    arriba, abajo = 0, 0
    for (c, e), h in zip(piezas, ejes):
        derecha = max(derecha, c.size[0] - h)
        if e:
            derecha = max(derecha, e[1] + e[0].size[0] - h)
            # la estela puede sobresalir por encima de la cabeza o por debajo de
            # los pies: el lienzo tiene que dar cabida a eso o se recorta
            arriba = max(arriba, -e[2])
            abajo = max(abajo, e[2] + e[0].size[1] - c.size[1])
    CX = margen + int(round(max(ejes)))
    W = CX + int(round(derecha)) + margen
    H = max(c.size[1] for c, _ in piezas) + arriba + abajo + 2 * margen
    suelo = H - margen - abajo
    for k, ((c, e), h) in enumerate(zip(piezas, ejes)):
        lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        px_, py_ = int(round(CX - h)), suelo - c.size[1]
        lienzo.alpha_composite(c, (px_, py_))
        if e:
            lienzo.alpha_composite(e[0], (px_ + e[1], py_ + e[2]))
        lienzo.save(os.path.join(carpeta, '%02d.png' % k))
    return W, H


def guardar_tira(carpeta, salida):
    """Los frames en orden en una sola imagen, para revisar sin esperar al GIF."""
    fs = sorted(f for f in os.listdir(carpeta) if f.endswith('.png'))
    ims = [Image.open(os.path.join(carpeta, f)).convert('RGBA') for f in fs]
    W = max(i.size[0] for i in ims); H = max(i.size[1] for i in ims)
    out = Image.new('RGBA', (len(ims) * (W + 4) + 4, H + 4), (237, 237, 242, 255))
    for i, im in enumerate(ims):
        out.alpha_composite(im, (4 + i * (W + 4), 2))
    out.resize((out.size[0] * 2, out.size[1] * 2), Image.NEAREST).save(salida)
    return len(ims)


def recortar_ciclo(carpeta):
    """Quita la segunda mitad espejada de las filas de caminar.

    Los caminar de esta hoja traen el ciclo y su vuelta: A B C D E F G F E D C B.
    Si se reproducen los 12, el GIF se ve como un paseo de ida y vuelta y las dos
    filas parecen la misma. Se corta en el primer frame repetido.
    """
    import hashlib
    fs = sorted(f for f in os.listdir(carpeta) if f.endswith('.png'))
    vistos, corte = set(), len(fs)
    for i, f in enumerate(fs):
        h = hashlib.md5(open(os.path.join(carpeta, f), 'rb').read()).hexdigest()
        if h in vistos:
            corte = i
            break
        vistos.add(h)
    for f in fs[corte:]:
        os.remove(os.path.join(carpeta, f))
    return len(fs[:corte])


def guardar_bucle(hoja, carpeta, cajas, margen=2):
    """Recorta las figuras y las coloca en un lienzo comun.

    Los pies van a la misma linea (no hay bote) y el eje de la cabeza al centro
    (no hay vaiven lateral). Sin esto el bucle se mueve aunque la hoja este
    perfectamente dibujada: cada figura de la hoja esta en una x distinta.
    """
    piezas = []
    for (x0, y0, x1, y1) in cajas:
        im = limpiar(hoja.crop((x0, y0, x1 + 1, y1 + 1)))
        bb = im.getbbox()
        piezas.append(im.crop(bb) if bb else im)

    def eje_cabeza(im):
        px = im.load()
        w, h = im.size
        xs = [x for y in range(max(2, h // 4)) for x in range(w) if px[x, y][3] > 0]
        return (min(xs) + max(xs)) / 2.0 if xs else w / 2.0

    os.makedirs(carpeta, exist_ok=True)
    ejes = [eje_cabeza(p) for p in piezas]
    W = 2 * int(max(max(e, p.size[0] - e) for p, e in zip(piezas, ejes))) + 2 * margen
    H = max(p.size[1] for p in piezas) + 2 * margen
    for k, (p, e) in enumerate(zip(piezas, ejes)):
        lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        lienzo.alpha_composite(p, (int(round(W / 2 - e)), H - margen - p.size[1]))
        lienzo.save(os.path.join(carpeta, '%02d.png' % k))
    return W, H, ejes


def medir(carpeta):
    fs = sorted(f for f in os.listdir(carpeta) if f.endswith('.png'))
    out = []
    for f in fs:
        im = Image.open(os.path.join(carpeta, f)).convert('RGBA')
        px = im.load()
        w, h = im.size
        xs = []
        for y in range(max(0, h - 6), h):
            for x in range(w):
                if px[x, y][3] > 0:
                    xs.append(x)
        cx = sorted(xs)[len(xs) // 2] if xs else w // 2
        arriba = abajo = base = 0
        for y in range(h):
            for x in range(w):
                if px[x, y][3] > 0:
                    dist = abs(x - cx)
                    if y < h * 0.55:
                        arriba = max(arriba, dist)
                    else:
                        abajo = max(abajo, dist)
                    if y >= h - 6:
                        base += 1
        out.append({'f': f, 'w': w, 'h': h, 'arriba': arriba, 'abajo': abajo, 'base': base})
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else 'voltia/nuevo/chunli'
    hoja = Image.open('voltia/nuevo/ref/chunli_sheet.png').convert('RGBA')
    bandas = {b['banda']: b for b in json.load(open(os.path.join(base, 'bandas.json')))}
    destino = os.path.join(base, 'rows')
    os.makedirs(destino, exist_ok=True)
    for d in os.listdir(destino):
        shutil.rmtree(os.path.join(destino, d), ignore_errors=True)
    os.makedirs(os.path.join(base, 'gif'), exist_ok=True)
    salida = []

    def guardar(carpeta, cajas):
        """cajas: lista de (x0,y0,x1,y1) ya en orden. Devuelve los y1 de origen."""
        os.makedirs(carpeta, exist_ok=True)
        ys = []
        for k, (x0, y0, x1, y1) in enumerate(cajas):
            limpiar(hoja.crop((x0, y0, x1 + 1, y1 + 1))).save(
                os.path.join(carpeta, '%02d.png' % k))
            ys.append(y1)
        return ys

    def inclinacion(carpeta):
        """Cuanto se adelanta la mitad alta del cuerpo respecto a la baja.
        Positivo = torso echado hacia delante. Es lo que distingue caminar
        adelante de caminar atras."""
        vals = []
        for f in sorted(x for x in os.listdir(carpeta) if x.endswith('.png')):
            im = Image.open(os.path.join(carpeta, f)).convert('RGBA')
            px = im.load()
            pts = [(x, y) for y in range(im.size[1]) for x in range(im.size[0])
                   if px[x, y][3] > 0]
            if not pts:
                continue
            ys = [y for _, y in pts]
            medio = (min(ys) + max(ys)) // 2
            alto = [x for x, y in pts if y < medio]
            bajo = [x for x, y in pts if y >= medio]
            if alto and bajo:
                vals.append(sum(alto) / len(alto) - sum(bajo) / len(bajo))
        return round(sum(vals) / len(vals), 1) if vals else None

    def ficha(num, slug, nombre, bucle, nota, carpeta, ys, ataque, fps=12):
        med = medir(carpeta)
        alturas = sorted(m['h'] for m in med)
        activos, ext = [], None
        for clave in (('arriba', 'abajo') if ataque else ()):
            vals = [m[clave] for m in med]
            mx, medv = max(vals), sorted(vals)[len(vals) // 2]
            if mx >= 1.25 * max(medv, 1):
                fr = [i + 1 for i, m in enumerate(med) if m[clave] >= 0.9 * mx]
                if len(fr) > len(activos):
                    activos, ext = fr, ('brazo' if clave == 'arriba' else 'pierna')
        if ys is None or len(ys) != len(med):
            # el stance se arma con tres filas y se le quita una costura: los
            # y1 de origen ya no cuadran con los frames guardados
            aire = []
        else:
            suelo = sorted(ys)[len(ys) // 2]
            aire = [i + 1 for i, y in enumerate(ys) if y < suelo - 8]
        depie = [i + 1 for i, m in enumerate(med) if m['h'] >= 0.92 * max(alturas)]
        gif = 'gif/%02d_%s.gif' % (num, slug)
        subprocess.run([sys.executable, 'tools/make_gif.py', carpeta,
                        os.path.join(base, gif), '--fps', str(fps), '--zoom', '2',
                        '--bg', 'EDEDF2', '--pad', '6'],
                       check=False, env=dict(os.environ, PYTHONPATH='tools/pylibs'))
        fila = {'fila': num, 'slug': slug, 'nombre': nombre, 'bucle': bucle,
                'nota': nota, 'n': len(med), 'gif': gif,
                'alto': [min(alturas), max(alturas)],
                'ancho': [min(m['w'] for m in med), max(m['w'] for m in med)],
                'activos': activos, 'extension': ext, 'aire': aire,
                'de_pie': depie, 'ataque': ataque,
                'inclinacion': inclinacion(carpeta)}
        salida.append(fila)
        print('fila %2d  %-22s %2d frames  activos=%s aire=%s'
              % (num, slug, len(med), activos or '-', aire or '-'))
        return fila

    # ---------- stance: filas 1, 2 y 3 en UNA sola animacion ----------
    # Orden real de la hoja: fila 1 (10 figuras) + fila 2 (6) + fila 3 (7) = 23.
    # Se descarta UN frame y solo porque esta repetido literalmente: la figura 1
    # de la fila 2 es identica a la figura 10 de la fila 1 (costura de la hoja).
    # Si se dejan las dos, el bucle se queda parado dos ticks.
    import hashlib
    b0 = bandas[0]['frames']
    fila1 = sorted([f for f in b0 if f['y0'] < 80 and f['h'] < 100], key=lambda f: f['x0'])
    fila2 = sorted([f for f in b0 if f['y0'] >= 80], key=lambda f: f['x0'])
    fila3 = sorted(bandas[1]['frames'], key=lambda f: f['x0'])
    # Orden pedido: 2 1 2 2 3 2 y vuelta a empezar (2-1-2-2-3-2-2-1-2-2...).
    # La fila 2 es la que hace de respiracion entre la 1 y la 3, y va dos veces
    # en la union, que es justo lo que se ve en el bucle.
    orden = [2, 1, 2, 2, 3, 2]
    grupos = {1: fila1, 2: fila2, 3: fila3}
    cajas, origen = [], []
    for n_fila in orden:
        grupo = grupos[n_fila]
        for f in grupo:
            cajas.append((f['x0'], f['y0'], f['x1'], f['y1']))
            origen.append(n_fila)
    carpeta = os.path.join(destino, '01_stance')
    W, H, ejes = guardar_bucle(hoja, carpeta, cajas)
    crudo = len(cajas)
    previo, fuera = None, []
    for k, f in enumerate(sorted(os.listdir(carpeta))):
        h = hashlib.md5(open(os.path.join(carpeta, f), 'rb').read()).hexdigest()
        if h == previo:
            fuera.append(k)
        previo = h
    for k in reversed(fuera):
        os.remove(os.path.join(carpeta, '%02d.png' % k))
    origen = [o for k, o in enumerate(origen) if k not in fuera]
    for i, f in enumerate(sorted(os.listdir(carpeta))):
        os.rename(os.path.join(carpeta, f), os.path.join(carpeta, 'tmp%03d' % i))
    for f in sorted(os.listdir(carpeta)):
        os.rename(os.path.join(carpeta, f), os.path.join(carpeta, '%02d.png' % int(f[3:])))
    # tira de comprobacion: los frames en orden, con la fila de la hoja de cada uno
    fs = sorted(f for f in os.listdir(carpeta) if f.endswith('.png'))
    tira = Image.new('RGBA', (len(fs) * (W + 4) + 4, H + 14), (237, 237, 242, 255))
    for i, f in enumerate(fs):
        tira.alpha_composite(Image.open(os.path.join(carpeta, f)).convert('RGBA'), (4 + i * (W + 4), 12))
    tira.resize((tira.size[0] * 2, tira.size[1] * 2), Image.NEAREST).save(
        os.path.join(base, 'stance_secuencia.png'))
    ficha(1, 'stance', 'Stance', True,
          'Filas 1, 2 y 3 son UN solo bucle: 2 -> 1 -> 2 -> 2 -> 3 -> 2, %d frames '
          '(6+10+6+6+7+6 = 41 figuras; se descartan 2 porque estan repetidas '
          'literalmente en las costuras). La fila 2 va dos veces en la union, '
          'que es lo que pide el bucle.' % len(fs),
          carpeta, None, False, 10)
    salida[-1]['filas'] = '1-3'
    salida[-1]['orden'] = orden
    salida[-1]['crudo'] = crudo
    salida[-1]['descartados'] = len(fuera)
    salida[-1]['lienzo'] = [W, H]
    salida[-1]['origen'] = origen
    print('stance: %d figuras en la hoja -> %d frames, lienzo %dx%d, restados %s'
          % (crudo, len(fs), W, H, fuera))

    # ---------- filas 4 a 24 ----------
    for (num, slug, nombre, bucle, nota, banda) in FILAS:
        b = bandas[banda]
        carpeta = os.path.join(destino, '%02d_%s' % (num, slug))
        if num == 12:
            # cada pose con SU estela amarilla dentro del frame, a su derecha
            grupos = grupos_con_estela(hoja, b['y0'], b['y1'] + 1)
            guardar_con_estela(hoja, carpeta, grupos, b['y0'], b['y1'] + 1)
            ficha(num, slug, nombre, bucle,
                  nota + ' Cada frame lleva su estela amarilla a la derecha del sprite, '
                  'en el mismo desfase que tiene en la hoja.', carpeta, None, num in ATAQUE)
            salida[-1]['estelas'] = ['%d-%d' % tuple(g['estela']) if g['estela'] else None
                                     for g in grupos]
            guardar_tira(carpeta, os.path.join(base, 'speed_kick_secuencia.png'))
            continue
        if num == 22:
            # filas 22 y 23: UNA animacion, todos los frames, sin quitar repetidos
            cajas = []
            for bb_ in (bandas[20], bandas[21]):
                cajas += [(f['x0'], f['y0'], f['x1'], f['y1'])
                          for f in sorted(bb_['frames'], key=lambda f: f['x0'])]
            guardar_bucle(hoja, carpeta, cajas)
            ficha(num, slug, nombre, bucle, nota, carpeta, None, False)
            salida[-1]['filas'] = '22-23'
            salida[-1]['crudo'] = len(cajas)
            guardar_tira(carpeta, os.path.join(base, 'block_super_secuencia.png'))
            continue
        cajas = [(f['x0'], f['y0'], f['x1'], f['y1'])
                 for f in sorted(b['frames'], key=lambda f: f['x0'])]
        ys = guardar(carpeta, cajas)
        if num in (4, 5):
            n = recortar_ciclo(carpeta)
            ys = ys[:n]
            nota = nota + ' Ciclo real de %d frames (la fila trae tambien la vuelta espejada).' % n
        ficha(num, slug, nombre, bucle, nota, carpeta, ys, num in ATAQUE)

    json.dump(salida, open(os.path.join(base, 'rows.json'), 'w'), indent=1)
    print('total animaciones:', len(salida))


if __name__ == '__main__':
    main()
