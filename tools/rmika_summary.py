#!/usr/bin/env python3
"""Resume las bandas de la hoja de R. Mika: mide, clasifica la postura, marca
los frames tapados con negro y genera un GIF por banda.

    PYTHONPATH=tools/pylibs python3 tools/rmika_summary.py voltia/nuevo/rmika

Escribe rmika/anims.json y rmika/gif/banda_XX.gif. Los nombres son una lectura
a ojo de los frames: la hoja no trae etiquetas.
"""
import json
import os
import subprocess
import sys

from PIL import Image

# bandas: (nombre, confianza, nota). "alta" solo cuando la postura no se puede
# confundir (todo el suelo, o un objeto, o otro personaje).
NOMBRES = {
    0: ('Guardia / idle', 'media', '16 frames de pie, pies en la misma linea, brazos delante'),
    1: ('Idle + reaccion', 'media', 'poses de pie y una caida al final'),
    2: ('Acrobacia (pino y voltereta)', 'media', 'el cuerpo gira; hay frames tapados'),
    3: ('Patada descendente + super', 'baja', 'incluye una bota gigante, efecto del super'),
    4: ('Patadas altas', 'media', 'piernas por encima de la cadera'),
    5: ('Patada voladora', 'media', '7 frames; pies muy por encima de la linea de suelo'),
    6: ('Patadas medias y aereas', 'media', 'mezcla suelo y aire'),
    7: ('Punetazos y voltereta', 'baja', 'brazo extendido a la altura del pecho'),
    8: ('Golpes varios', 'baja', 'punos y piernas mezclados'),
    9: ('Barridos y patadas bajas', 'media', 'pierna por debajo de la cadera'),
    10: ('Patadas en el aire', 'media', 'los pies no tocan la linea de suelo'),
    11: ('Tumbada y ataque al suelo', 'baja', 'cuerpo horizontal'),
    12: ('Derribo en el suelo', 'media', 'casi todos los frames horizontales'),
    13: ('Suelo y poses', 'baja', 'poses sueltas en el suelo'),
    14: ('Agachada y patada baja', 'media', 'altura reducida a la mitad'),
    15: ('Suelo (variante)', 'baja', 'repite posturas de la banda 12'),
    16: ('Rodillas y suelo', 'baja', 'arrodillada'),
    17: ('Sentada en el suelo', 'baja', 'cadera apoyada'),
    18: ('Golpes y caida', 'baja', 'secuencia larga, acaba en el suelo'),
    19: ('Patadas altas (variante)', 'baja', 'parecida a la banda 4'),
    20: ('Patadas aereas y caida', 'baja', 'sale y cae'),
    21: ('Vuelta y suelo', 'baja', 'rueda lateral'),
    22: ('Lanzamiento / agarre', 'baja', 'brazos hacia delante, cuerpo del rival no dibujado'),
    23: ('De pie y caida', 'baja', 'acaba tumbada'),
    24: ('Tumbada', 'media', 'cuerpo horizontal en los tres frames'),
    25: ('Mezcla: salto + otro personaje', 'baja', 'aparece una carretilla y un personaje que no es Mika'),
    26: ('OTRO PERSONAJE: ninja verde con baston', 'alta', 'no es R. Mika'),
    27: ('OTRO PERSONAJE: ninja verde + neumatico', 'alta', 'no es R. Mika'),
    28: ('Neumatico (objeto)', 'alta', 'sin personaje'),
    29: ('Neumatico (objeto)', 'alta', 'sin personaje'),
}


def clase(f, med_h, med_pie):
    h, w, pie = f['h'], f['w'], f['pie']
    if w > h * 1.25:
        return 'tumbada'
    if pie < med_pie - 22:
        return 'en el aire'
    if h < med_h * 0.72:
        return 'agachada'
    return 'de pie'


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else 'voltia/nuevo/rmika'
    datos = json.load(open(os.path.join(base, 'bandas.json')))
    os.makedirs(os.path.join(base, 'gif'), exist_ok=True)
    salida = []
    for d in datos:
        fs = d['frames']
        alturas = sorted(f['h'] for f in fs)
        pies = sorted(f['pie'] for f in fs)
        med_h = alturas[len(alturas) // 2]
        med_pie = pies[len(pies) // 2]
        # 'hueco' = proporcion de la caja que es transparente. La hoja tiene
        # rectangulos transparentes dentro de algunas celdas (no es tinta).
        for f in fs:
            c = Image.open(os.path.join(base, 'banda_%02d' % d['banda'],
                                        '%02d.png' % (f['i'] - 1))).convert('RGBA')
            px = c.load()
            total = vacio = 0
            for yy in range(c.size[1]):
                for xx in range(c.size[0]):
                    total += 1
                    if px[xx, yy][3] == 0:
                        vacio += 1
            f['hueco'] = round(vacio / total, 3) if total else 0
        tapados = [f['i'] for f in fs if f['hueco'] > 0.30]
        for f in fs:
            f['clase'] = clase(f, med_h, med_pie)
        clases = {}
        for f in fs:
            clases[f['clase']] = clases.get(f['clase'], 0) + 1
        dominante = max(clases, key=clases.get)
        nombre, conf, nota = NOMBRES.get(d['banda'], ('sin nombre', 'baja', ''))
        gif = 'gif/banda_%02d.gif' % d['banda']
        if len(fs) >= 2:
            subprocess.run([sys.executable, 'tools/make_gif.py',
                            os.path.join(base, 'banda_%02d' % d['banda']),
                            os.path.join(base, gif),
                            '--fps', '12', '--zoom', '2', '--bg', 'EDEDF2'],
                           check=False, env=dict(os.environ, PYTHONPATH='tools/pylibs'))
        salida.append({
            'banda': d['banda'], 'n': len(fs), 'nombre': nombre, 'confianza': conf,
            'nota': nota, 'postura': dominante, 'clases': clases,
            'med_h': med_h, 'med_pie': med_pie,
            'alto': [min(alturas), max(alturas)],
            'ancho': [min(f['w'] for f in fs), max(f['w'] for f in fs)],
            'tapados': tapados, 'gif': gif if len(fs) >= 2 else None,
            'frames': fs,
        })
        print('banda %02d  %2d frames  %-42s %-9s tapados %s'
              % (d['banda'], len(fs), nombre, dominante, tapados or '-'))
    json.dump(salida, open(os.path.join(base, 'anims.json'), 'w'), indent=1)
    print('escrito', os.path.join(base, 'anims.json'))


if __name__ == '__main__':
    main()
