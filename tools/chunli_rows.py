#!/usr/bin/env python3
"""Reconstruye las animaciones de Chun-Li con la numeracion REAL de filas.

Las 23 bandas que salen del corte por huecos de fondo no coinciden con las 24
filas de la hoja: la banda 03 lleva DOS animaciones (caminar adelante y caminar
atras, 6 + 6 frames). El resto va 1 banda = 1 fila.

    PYTHONPATH=tools/pylibs python3 tools/chunli_rows.py voltia/nuevo/chunli

Escribe rows/<id>/ con los frames, gif/<id>.gif y rows.json con medidas y ficha.
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

# fila -> (slug, nombre, bucle, nota, banda, rango de frames)
# banda 03 se parte: frames 0-5 = caminar adelante, 6-11 = caminar atras.
FILAS = [
    (1, 'stance_1', 'Stance · parte 1', True,
     'Con las filas 2 y 3 forma el bucle completo del stance.', 0, None),
    (2, 'stance_2', 'Stance · parte 2', True,
     'Segunda parte del mismo bucle.', 1, None),
    (3, 'stance_3', 'Stance · parte 3', True,
     'Tercera parte; al acabar vuelve a la fila 1.', 2, None),
    (4, 'walk_fwd', 'Caminar adelante', True,
     'Ciclo de 6 frames.', 3, (0, 6)),
    (5, 'walk_back', 'Caminar atras', True,
     'Mismo patron dibujado al reves en la hoja; 6 frames.', 3, (6, 12)),
    (6, 'kick_strong', 'Patada fuerte (de pie)', False,
     'La pierna sube por encima de la cadera.', 4, None),
    (7, 'punch_strong', 'Puno fuerte (de pie)', False,
     'Brazo extendido al frente.', 5, None),
    (8, 'punch_weak', 'Puno debil (de pie)', False,
     'Misma idea que el fuerte pero mas corto.', 6, None),
    (9, 'kick_weak', 'Patada debil (de pie)', False,
     'Rodilla y extension corta.', 7, None),
    (10, 'special_dd_k', 'Especial ↓ ↓↘ → + patada', False,
     'La patada girada con el efecto en el pie.', 8, None),
    (11, 'special_projectile', 'Especial proyectil', False,
     'El proyectil NO esta dibujado: hay que completarlo con la chispa de Voltia.', 9, None),
    (12, 'speed_kick', 'Speed kick', False,
     'Patada rapida repetida (machaque de boton).', 10, None),
    (13, 'jump_place', 'Salto en el sitio', False,
     'Los pies se separan del suelo y vuelven.', 11, None),
    (14, 'jump_fwd', 'Salto adelante', False,
     'Invertido sirve de salto atras.', 12, None),
    (15, 'kick_fwd_down', 'Patada adelante-abajo + voltereta atras', False,
     'Sube caminando por el pecho del rival y cae con voltereta.', 13, None),
    (16, 'jump_punch', 'Salto + puno (debil o fuerte)', False,
     'Misma animacion para los dos botones; cambia el impacto y el dano.', 14, None),
    (17, 'jump_kick', 'Salto + patada (debil o fuerte)', False,
     'Misma animacion para los dos botones; cambia el impacto y el dano.', 15, None),
    (18, 'crouch_punch_strong', 'Puno fuerte agachada', False,
     'Los frames de levantarse se reutilizan para pasar de stance a agachada y al reves.', 16, None),
    (19, 'crouch_kick_strong', 'Patada fuerte agachada', False,
     'Sale desde el suelo.', 17, None),
    (20, 'crouch_kick_weak', 'Patada debil agachada', False,
     'Extension corta.', 18, None),
    (21, 'crouch_punch_weak', 'Puno debil agachada', False,
     'Golpe corto desde agachada.', 19, None),
    (22, 'block', 'Defensa / onda de choque', True,
     'Guarda normal; con impactos grandes genera la onda. Tambien arranca el super.', 20, None),
    (23, 'super_sphere', 'Super · esfera envolvente', False,
     'La esfera no esta dibujada; los frames son el arranque del super.', 21, None),
    (24, 'knockdown', 'Derribo y recuperacion', False,
     'Se usan frames distintos segun la altura de la caida.', 22, None),
]


# filas cuyo sentido son golpes: solo en estas tiene sentido buscar el frame
# activo por extension del brazo o de la pierna
ATAQUE = {6, 7, 8, 9, 10, 12, 15, 16, 17, 18, 19, 20, 21}


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
        arriba = abajo = pies = 0
        for y in range(h):
            for x in range(w):
                if px[x, y][3] > 0:
                    dist = abs(x - cx)
                    if y < h * 0.55:
                        arriba = max(arriba, dist)
                    else:
                        abajo = max(abajo, dist)
                    if y >= h - 6:
                        pies += 1
        out.append({'f': f, 'w': w, 'h': h, 'arriba': arriba, 'abajo': abajo,
                    'base': pies})
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else 'voltia/nuevo/chunli'
    destino = os.path.join(base, 'rows')
    gifs = os.path.join(base, 'gif')
    os.makedirs(destino, exist_ok=True)
    os.makedirs(gifs, exist_ok=True)
    bandas_json = {b['banda']: b['frames'] for b in
                   json.load(open(os.path.join(base, 'bandas.json')))}
    salida = []

    for (num, slug, nombre, bucle, nota, banda, rango) in FILAS:
        origen = os.path.join(base, 'banda_%02d' % banda)
        fs = sorted(f for f in os.listdir(origen) if f.endswith('.png'))
        if rango:
            fs = fs[rango[0]:rango[1]]
        carpeta = os.path.join(destino, '%02d_%s' % (num, slug))
        if os.path.isdir(carpeta):
            shutil.rmtree(carpeta)
        os.makedirs(carpeta)
        # fuera los retratos: son mas altos que cualquier frame de animacion
        alturas_src = [Image.open(os.path.join(origen, f)).size[1] for f in fs]
        if alturas_src:
            med_src = sorted(alturas_src)[len(alturas_src) // 2]
            fs = [f for f, h in zip(fs, alturas_src) if h < 1.8 * med_src]
        for k, f in enumerate(fs):
            shutil.copy(os.path.join(origen, f), os.path.join(carpeta, '%02d.png' % k))
        med = medir(carpeta)

        alturas = sorted(m['h'] for m in med)
        medh = alturas[len(alturas) // 2]
        activos, ext = [], None
        claves = ('arriba', 'abajo') if num in ATAQUE else ()
        for clave in claves:
            vals = [m[clave] for m in med]
            mx = max(vals)
            medv = sorted(vals)[len(vals) // 2]
            if mx >= 1.25 * max(medv, 1):
                fr = [i + 1 for i, m in enumerate(med) if m[clave] >= 0.9 * mx]
                if len(fr) > len(activos):
                    activos, ext = fr, ('brazo' if clave == 'arriba' else 'pierna')
        # frames "de pie" (sirven de transicion agachada <-> stance)
        depie = [i + 1 for i, m in enumerate(med) if m['h'] >= 0.92 * max(alturas)]
        # frames en el aire: el borde inferior del recorte queda por encima de
        # la linea de suelo de la fila (y menor = mas alto en la hoja)
        fuente = bandas_json[banda]
        if rango:
            fuente = fuente[rango[0]:rango[1]]
        y1s = [fr['y1'] for fr in fuente][:len(med)]
        suelo = sorted(y1s)[len(y1s) // 2] if y1s else 0
        aire = [i + 1 for i, y in enumerate(y1s) if y < suelo - 8]

        gif = 'gif/%02d_%s.gif' % (num, slug)
        fps = 12
        subprocess.run([sys.executable, 'tools/make_gif.py', carpeta,
                        os.path.join(base, gif), '--fps', str(fps), '--zoom', '2',
                        '--bg', 'EDEDF2', '--pad', '6'],
                       check=False, env=dict(os.environ, PYTHONPATH='tools/pylibs'))
        salida.append({
            'fila': num, 'slug': slug, 'nombre': nombre, 'bucle': bucle,
            'nota': nota, 'banda': banda, 'n': len(med), 'fps': fps,
            'gif': gif, 'alto': [min(alturas), max(alturas)],
            'ancho': [min(m['w'] for m in med), max(m['w'] for m in med)],
            'activos': activos, 'extension': ext, 'de_pie': depie, 'aire': aire,
            'ataque': num in ATAQUE,
            'frames': med,
        })
        print('fila %2d  %-22s %2d frames  activos=%s  aire=%s  de pie=%s'
              % (num, slug, len(med), activos or '-', aire or '-', depie or '-'))

    # stance completo: filas 1 a 3 en orden
    stance = [s for s in salida if s['fila'] in (1, 2, 3)]
    carpeta = os.path.join(destino, '00_stance_full')
    if os.path.isdir(carpeta):
        shutil.rmtree(carpeta)
    os.makedirs(carpeta)
    k = 0
    for s in stance:
        src = os.path.join(destino, '%02d_%s' % (s['fila'], s['slug']))
        for f in sorted(os.listdir(src)):
            shutil.copy(os.path.join(src, f), os.path.join(carpeta, '%02d.png' % k))
            k += 1
    subprocess.run([sys.executable, 'tools/make_gif.py', carpeta,
                    os.path.join(base, 'gif/00_stance_full.gif'), '--fps', '12',
                    '--zoom', '2', '--bg', 'EDEDF2', '--pad', '6'],
                   check=False, env=dict(os.environ, PYTHONPATH='tools/pylibs'))
    salida.insert(0, {
        'fila': 0, 'slug': 'stance_full', 'nombre': 'Stance completo (filas 1-3)',
        'bucle': True, 'nota': 'Las tres filas seguidas: %d frames de bucle.' % k,
        'banda': None, 'n': k, 'fps': 12, 'gif': 'gif/00_stance_full.gif',
        'alto': [min(m['h'] for s in stance for m in s['frames']),
                 max(m['h'] for s in stance for m in s['frames'])],
        'ancho': [min(m['w'] for s in stance for m in s['frames']),
                  max(m['w'] for s in stance for m in s['frames'])],
        'activos': [], 'extension': None, 'de_pie': [], 'aire': [],
        'frames': [],
    })
    print('stance completo:', k, 'frames')

    json.dump(salida, open(os.path.join(base, 'rows.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
