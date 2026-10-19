#!/usr/bin/env python3
"""Mide cada banda de una hoja ya recortada, la nombra y le hace un GIF.

    PYTHONPATH=tools/pylibs python3 tools/anim_data.py voltia/nuevo/chunli

Lee banda_NN/ + bandas.json y escribe anims.json y gif/banda_NN.gif.

Qué mide, frame a frame:
  alto, ancho  -> caja de la figura
  pie          -> fila mas baja con tinta (suelo)
  base         -> tinta en las 6 filas de abajo (cuanto pie hay apoyado)
  alcance      -> distancia maxima a la que llega un pixel desde el centro de
                  los pies. Sirve para localizar los frames ACTIVOS de un golpe:
                  el golpe existe cuando el brazo o la pierna estan extendidos.
"""
import json
import os
import subprocess
import sys

from PIL import Image

# nombre, confianza, nota. Confianza = cuanto se sostiene la lectura mirando
# los frames. La hoja no trae etiquetas.
NOMBRES = {
    0: ('Retrato + guardia (idle)', 'media', 'el frame 1 es un retrato, no un frame de animacion'),
    1: ('Paso lateral / desplazamiento', 'baja', 'rodilla arriba y cuerpo girando; acaba en guardia'),
    2: ('Caminar', 'media', 'ciclo suave, piernas alternando, misma linea de pies'),
    3: ('Caminar (ciclo espejo)', 'baja', 'mismo patron que la banda 2'),
    4: ('Patada alta', 'alta', 'la pierna sube por encima de la cadera y vuelve'),
    5: ('Punetazo', 'alta', 'el puno sale al frente y se recoge'),
    6: ('Punetazo largo', 'alta', 'brazo totalmente extendido, dos salidas'),
    7: ('Patada media', 'alta', 'rodilla, extension y recogida'),
    8: ('Patada giratoria', 'alta', 'el cuerpo gira y la pierna barre'),
    9: ('Bloqueo', 'media', '3 frames, brazo cruzado delante'),
    10: ('Patada con energia', 'media', 'efecto amarillo/azul en el pie'),
    11: ('Agacharse y levantarse', 'media', 'altura baja a la mitad'),
    12: ('Salto mortal', 'alta', 'el cuerpo se pone del reves'),
    13: ('Salto y caida', 'media', 'vuelta en el aire y aterrizaje'),
    14: ('Salto en cuclillas', 'media', 'todo el ciclo por debajo de la altura de pie'),
    15: ('Salto vertical', 'alta', 'los pies se separan del suelo y vuelven'),
    16: ('Agachada y golpe bajo', 'media', 'incluye un puno extendido'),
    17: ('Patada desde agachada', 'media', 'sale bajo y la pierna se extiende'),
    18: ('Barrido bajo', 'alta', 'estela horizontal en el suelo'),
    19: ('Golpe desde agachada', 'media', 'marca de golpe en el frame 3'),
    20: ('Especial: energia azul', 'alta', 'el remolino azul crece frame a frame'),
    21: ('Final del especial', 'alta', 'sigue el remolino y se apaga'),
    22: ('Derribo y levantarse', 'alta', 'cae de espaldas, queda en el suelo y se levanta'),
}


def medir(d):
    fs = sorted(f for f in os.listdir(d) if f.endswith('.png'))
    out = []
    for f in fs:
        im = Image.open(os.path.join(d, f)).convert('RGBA')
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
        out.append({'f': f, 'w': w, 'h': h, 'arriba': arriba, 'abajo': abajo,
                    'base': base})
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else 'voltia/nuevo/chunli'
    datos = json.load(open(os.path.join(base, 'bandas.json')))
    os.makedirs(os.path.join(base, 'gif'), exist_ok=True)
    salida = []
    for d in datos:
        b = d['banda']
        carpeta = os.path.join(base, 'banda_%02d' % b)
        med = medir(carpeta)
        alturas = sorted(m['h'] for m in med)
        medianoche = alturas[len(alturas) // 2]
        activos, cual = [], None
        for clave in ('arriba', 'abajo'):
            vals = [m[clave] for m in med]
            mx = max(vals)
            medv = sorted(vals)[len(vals) // 2]
            if mx >= 1.25 * max(medv, 1):
                fr = [m['f'] for m in med if m[clave] >= 0.9 * mx]
                if len(fr) > len(activos):
                    activos, cual = fr, ('brazo' if clave == 'arriba' else 'pierna')
        nombre, conf, nota = NOMBRES.get(b, ('sin nombre', 'baja', ''))
        ataque = any(k in nombre for k in ('Patada', 'Punetazo', 'Golpe', 'Barrido',
                                           'Especial', 'Paso lateral'))
        if not ataque:
            activos, cual = [], None
        gif = 'gif/banda_%02d.gif' % b
        # frames que no son frames de animacion (retratos): fuera del GIF
        extra = [m['f'] for m in med if m['h'] > 1.8 * medianoche]
        if extra:
            import tempfile, shutil
            tmp = tempfile.mkdtemp()
            for m in med:
                if m['f'] not in extra:
                    shutil.copy(os.path.join(carpeta, m['f']), tmp)
            subprocess.run([sys.executable, 'tools/make_gif.py', tmp,
                            os.path.join(base, gif), '--fps', '12', '--zoom', '2',
                            '--bg', 'EDEDF2', '--pad', '5'],
                           check=False, env=dict(os.environ, PYTHONPATH='tools/pylibs'))
            shutil.rmtree(tmp)
        else:
            subprocess.run([sys.executable, 'tools/make_gif.py', carpeta,
                            os.path.join(base, gif), '--fps', '12', '--zoom', '2',
                            '--bg', 'EDEDF2', '--pad', '5'],
                           check=False, env=dict(os.environ, PYTHONPATH='tools/pylibs'))
        salida.append({
            'banda': b, 'n': len(med), 'extension': cual, 'ataque': ataque, 'nombre': nombre, 'confianza': conf,
            'nota': nota, 'gif': gif, 'alto': [min(alturas), max(alturas)],
            'ancho': [min(m['w'] for m in med), max(m['w'] for m in med)],
            'activos': activos,
            'alcance': [max(m['arriba'], m['abajo']) for m in med],
            'frames': med,
        })
        print('banda %02d  %2d frames  %-34s %-6s activos=%s'
              % (b, len(med), nombre, conf, activos or '-'))
    json.dump(salida, open(os.path.join(base, 'anims.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
