#!/usr/bin/env python3
"""Borra sprites del creador y regenera datos.json para que no queden huecos.

Uso normal: se marca en el visor y el visor descarga una lista; este script la aplica.

    PYTHONPATH=tools/pylibs python3 tools/borrar_sprites.py --lista ~/Downloads/borrar_stance_oficial.txt
    PYTHONPATH=tools/pylibs python3 tools/borrar_sprites.py --mov stance --indices 4,6

La lista es una ruta por linea, relativa a `creador/`: `stance/f04.png`, `walk/f02.png`.

Que hace, en este orden:
  1. borra los PNG de `sprites/<mov>/` y `oficial/<mov>/` (el nativo y su version oficial);
  2. **renumera** los que quedan para que sigan siendo consecutivos (`f00, f01, …`) y no
     queden huecos: los scripts y el visor esperan indices seguidos;
  3. reescribe `sprites/datos.json` y `oficial/datos.json` con los frames que quedan.

No toca `sheet_*.png` (la hoja original de la IA): eso es el material de origen y se guarda.
"""
import argparse
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREADOR = os.path.join(BASE, 'voltia/nuevo/creador')
SPRITES = os.path.join(CREADOR, 'sprites')
OFICIAL = os.path.join(CREADOR, 'oficial')


def leer_lista(ruta):
    movs = {}
    with open(ruta, encoding='utf-8') as fh:
        for linea in fh:
            linea = linea.strip()
            if not linea or linea.startswith('#'):
                continue
            mov, fichero = linea.split('/')
            if not fichero.startswith('f') or not fichero.endswith('.png'):
                sys.exit('linea rara en la lista: ' + linea)
            movs.setdefault(mov, set()).add(int(fichero[1:-4]))
    return movs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lista', default='', help='fichero con una ruta por linea (stance/f04.png)')
    ap.add_argument('--mov', default='', help='movimiento: stance o walk')
    ap.add_argument('--indices', default='', help='indices a borrar, separados por comas (0-based)')
    a = ap.parse_args()

    if a.lista:
        pedido = leer_lista(os.path.expanduser(a.lista))
    elif a.mov and a.indices:
        pedido = {a.mov: {int(x) for x in a.indices.split(',') if x.strip()}}
    else:
        sys.exit('uso: --lista FICHERO  |  --mov stance --indices 4,6')

    for mov, fuera in pedido.items():
        # 1. trabajar sobre copia en memoria de los frames que se quedan
        guardado = {}
        for base in (SPRITES, OFICIAL):
            datos_p = os.path.join(base, 'datos.json')
            datos = json.load(open(datos_p))
            v = datos['anims'][mov]
            quedan = [f for f in v['frames'] if f['i'] not in fuera]
            if not quedan:
                sys.exit('te quedarias sin ningun frame de %s en %s' % (mov, base))
            imgs = []
            for f in quedan:
                p = os.path.join(base, mov, 'f%02d.png' % f['i'])
                with open(p, 'rb') as fh:
                    imgs.append(fh.read())
            guardado[base] = (datos, v, quedan, imgs)

        # 2. borrar todo y reescribir renumerado
        for base, (datos, v, quedan, imgs) in guardado.items():
            carpeta = os.path.join(base, mov)
            for f in os.listdir(carpeta):
                if f.endswith('.png'):
                    os.remove(os.path.join(carpeta, f))
            for nuevo_i, (f, datos_png) in enumerate(zip(quedan, imgs)):
                f['i'] = nuevo_i
                f['fichero'] = '%s/f%02d.png' % (mov, nuevo_i)
                with open(os.path.join(carpeta, 'f%02d.png' % nuevo_i), 'wb') as fh:
                    fh.write(datos_png)
            v['frames'] = quedan
            with open(os.path.join(base, 'datos.json'), 'w') as fh:
                json.dump(datos, fh, indent=1)
            print('  %-42s %d frame(s) · borrados %s'
                  % (os.path.relpath(base, BASE) + '/' + mov, len(quedan), sorted(fuera)))
        print('%-7s quedan %d frames, renumerados f00..f%02d'
              % (mov, len(guardado[SPRITES][2]), len(guardado[SPRITES][2]) - 1))


if __name__ == '__main__':
    main()
