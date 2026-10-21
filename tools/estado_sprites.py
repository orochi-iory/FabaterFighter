#!/usr/bin/env python3
"""Organiza los sprites por estado: aprobado, pendiente o descartado.

El visor del creador descarga una lista con un estado por línea; este script la aplica a
`oficial/datos.json` y `sprites/datos.json` (campo `estado` de cada frame).

    # marcar los marcados en el visor como aprobados
    PYTHONPATH=tools/pylibs python3 tools/estado_sprites.py --estado aprobado --lista ~/Downloads/aprobar_stance.txt
    PYTHONPATH=tools/pylibs python3 tools/estado_sprites.py --estado descartado --lista ~/Downloads/descartar_stance.txt
    PYTHONPATH=tools/pylibs python3 tools/estado_sprites.py --ver stance

Lista: una ruta por línea relativa a `creador/sprites/`, p. ej. `stance/f03.png`.

`descartado` no borra ni mueve nada: es una marca. Para sacarlo del proyecto se usa la
papelera (`tools/papelera.py`), que sí mueve el fichero.
"""
import argparse
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREADOR = os.path.join(BASE, 'voltia/nuevo/creador')
BASES = {'sprites': os.path.join(CREADOR, 'sprites'),
         'oficial': os.path.join(CREADOR, 'oficial')}
VALIDOS = ('aprobado', 'pendiente', 'descartado')


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


def aplicar(estado, movs):
    if estado not in VALIDOS:
        sys.exit('estado no válido: %s (usa %s)' % (estado, ', '.join(VALIDOS)))
    for mov, indices in movs.items():
        for base_nombre, base in BASES.items():
            p = os.path.join(base, 'datos.json')
            datos = json.load(open(p))
            v = datos['anims'][mov]
            n = 0
            for f in v['frames']:
                if f['i'] in indices:
                    f['estado'] = estado
                    n += 1
            with open(p, 'w') as fh:
                json.dump(datos, fh, indent=1)
            print('  %-22s %d frame(s) -> %s' % (base_nombre + '/' + mov, n, estado))
    print('\nHecho. Resumen:')
    ver(movs.keys())


def ver(movs=None):
    for mov in (movs or ['stance', 'walk']):
        p = os.path.join(BASES['sprites'], 'datos.json')
        v = json.load(open(p))['anims'].get(mov)
        if not v:
            continue
        cuenta = {}
        for f in v['frames']:
            e = f.get('estado', 'pendiente')
            cuenta[e] = cuenta.get(e, 0) + 1
        detalle = ', '.join('f%02d:%s' % (f['i'], f.get('estado', 'pendiente')[:3])
                            for f in v['frames'])
        print('  %-7s %s' % (mov, cuenta))
        print('          %s' % detalle)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--estado', choices=VALIDOS, default='')
    ap.add_argument('--lista', default='')
    ap.add_argument('--ver', nargs='?', const='', default=None)
    a = ap.parse_args()
    if a.estado and a.lista:
        aplicar(a.estado, leer_lista(a.lista))
    elif a.ver is not None:
        ver([a.ver] if a.ver else None)
    else:
        ver(None)


if __name__ == '__main__':
    main()
