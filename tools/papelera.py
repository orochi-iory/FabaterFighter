#!/usr/bin/env python3
"""Papelera del creador: mover sprites, devolverlos y vaciarla.

Nada se borra de golpe. Los PNG se mueven a `creador/papelera/<mov>/<base>/` y
`papelera.json` guarda el índice que tenía cada uno, para poder recolocarlo.

    # mandar a la papelera los marcados en el visor
    PYTHONPATH=tools/pylibs python3 tools/papelera.py --lista ~/Downloads/papelera_stance.txt
    PYTHONPATH=tools/pylibs python3 tools/papelera.py --ver
    PYTHONPATH=tools/pylibs python3 tools/papelera.py --restaurar
    PYTHONPATH=tools/pylibs python3 tools/papelera.py --vaciar

La lista es una ruta por línea relativa a `creador/sprites/`: `stance/f04.png`.
Se mueve el nativo Y su versión oficial del mismo índice, y se renumera lo que queda.
Para devolver cada uno a su sitio, `datos.json` guarda en cada frame el campo `original`
(índice que tenía antes de cualquier borrado).
"""
import argparse
import json
import os
import shutil
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREADOR = os.path.join(BASE, 'voltia/nuevo/creador')
BASES = {'sprites': os.path.join(CREADOR, 'sprites'),
         'oficial': os.path.join(CREADOR, 'oficial')}
PAPELERA = os.path.join(CREADOR, 'papelera')
INDICE = os.path.join(PAPELERA, 'papelera.json')


def cargar_indice():
    return json.load(open(INDICE)) if os.path.exists(INDICE) else []


def guardar_indice(items):
    os.makedirs(PAPELERA, exist_ok=True)
    with open(INDICE, 'w') as fh:
        json.dump(items, fh, indent=1)


def leer_lista(ruta):
    movs = {}
    with open(os.path.expanduser(ruta), encoding='utf-8') as fh:
        for linea in fh:
            linea = linea.strip()
            if not linea or linea.startswith('#'):
                continue
            mov, fichero = linea.split('/')
            movs.setdefault(mov, set()).add(int(fichero[1:-4]))
    return movs


def leer_bytes(carpeta):
    return {f: open(os.path.join(carpeta, f), 'rb').read()
            for f in os.listdir(carpeta) if f.endswith('.png')}


def escribir_frames(carpeta, frames, contenidos):
    """Deja en `carpeta` exactamente f00..fN-1 en el orden de `frames`."""
    for f in os.listdir(carpeta):
        if f.endswith('.png'):
            os.remove(os.path.join(carpeta, f))
    for k, f in enumerate(frames):
        f['i'] = k
        f['fichero'] = '%s/f%02d.png' % (os.path.basename(carpeta), k)
        with open(os.path.join(carpeta, 'f%02d.png' % k), 'wb') as fh:
            fh.write(contenidos[f.pop('_bytes')])


def mover(movs):
    indice = cargar_indice()
    for mov, fuera in movs.items():
        for base_nombre, base in BASES.items():
            datos_p = os.path.join(base, 'datos.json')
            datos = json.load(open(datos_p))
            v = datos['anims'][mov]
            carpeta = os.path.join(base, mov)
            contenidos = leer_bytes(carpeta)
            frames = v['frames']
            for f in frames:
                f.setdefault('original', f['i'])
            quedan, van = [], []
            for f in frames:
                (van if f['i'] in fuera else quedan).append(f)
            if not quedan:
                sys.exit('te quedarías sin ningún frame de %s en %s' % (mov, base_nombre))
            destino = os.path.join(PAPELERA, mov, base_nombre)
            os.makedirs(destino, exist_ok=True)
            for f in van:
                nombre = 'f%02d.png' % f['i']
                shutil.copy2(os.path.join(carpeta, nombre), os.path.join(destino, nombre))
                indice.append({'mov': mov, 'base': base_nombre,
                               'indice_original': f['original'], 'fichero': nombre})
            for f in quedan:
                f['_bytes'] = 'f%02d.png' % f['i']
            escribir_frames(carpeta, quedan, contenidos)
            v['frames'] = quedan
            with open(datos_p, 'w') as fh:
                json.dump(datos, fh, indent=1)
            print('  %-22s quedan %2d · a la papelera %s'
                  % (base_nombre + '/' + mov, len(quedan), sorted(fuera)))
    guardar_indice(indice)
    print('\n%d fichero(s) en la papelera (no se ha borrado nada)' % len(indice))


def restaurar():
    indice = cargar_indice()
    if not indice:
        print('la papelera está vacía')
        return
    for mov in sorted({it['mov'] for it in indice}):
        for base_nombre, base in BASES.items():
            items = [it for it in indice if it['mov'] == mov and it['base'] == base_nombre]
            if not items:
                continue
            datos_p = os.path.join(base, 'datos.json')
            datos = json.load(open(datos_p))
            v = datos['anims'][mov]
            carpeta = os.path.join(base, mov)
            contenidos = leer_bytes(carpeta)
            frames = v['frames']
            for f in frames:
                f.setdefault('original', f['i'])
                f['_bytes'] = 'f%02d.png' % f['i']
            for it in items:
                frames.append({'i': -1, 'original': it['indice_original'],
                               '_bytes': '__papelera__' + it['fichero']})
                contenidos['__papelera__' + it['fichero']] = open(
                    os.path.join(PAPELERA, mov, base_nombre, it['fichero']), 'rb').read()
            frames.sort(key=lambda f: f['original'])
            escribir_frames(carpeta, frames, contenidos)
            v['frames'] = frames
            with open(datos_p, 'w') as fh:
                json.dump(datos, fh, indent=1)
            print('  %-22s restaurado(s) %d · quedan %d'
                  % (base_nombre + '/' + mov, len(items), len(frames)))
    guardar_indice([])
    print('papelera vacía otra vez (los ficheros han vuelto a su sitio)')


def vaciar():
    indice = cargar_indice()
    n = 0
    for raiz, _, ficheros in os.walk(PAPELERA):
        for f in ficheros:
            if f.endswith('.png'):
                os.remove(os.path.join(raiz, f))
                n += 1
    guardar_indice([])
    print('%d fichero(s) borrados de verdad' % n if n else 'la papelera ya estaba vacía')


def ver():
    indice = cargar_indice()
    if not indice:
        print('la papelera está vacía')
        return
    print('papelera: %d fichero(s)' % len(indice))
    for it in indice:
        print('  %-8s %-8s f%02d (venía del índice %d)'
              % (it['base'], it['mov'], int(it['fichero'][1:-4]), it['indice_original']))
    print('\nrestaurar: --restaurar   ·   vaciar: --vaciar')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lista', default='')
    ap.add_argument('--restaurar', action='store_true')
    ap.add_argument('--vaciar', action='store_true')
    ap.add_argument('--ver', action='store_true')
    a = ap.parse_args()
    if a.vaciar:
        vaciar()
    elif a.restaurar:
        restaurar()
    elif a.lista:
        mover(leer_lista(a.lista))
    else:
        ver()


if __name__ == '__main__':
    main()
