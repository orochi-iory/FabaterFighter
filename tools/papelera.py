#!/usr/bin/env python3
"""CLI para la misma papelera recuperable que usa el creador web.

    python3 tools/papelera.py --lista ~/Downloads/papelera_stance.txt
    python3 tools/papelera.py --ver
    python3 tools/papelera.py --restaurar
    python3 tools/papelera.py --vaciar

Formato de lista: `movimiento/fNN.png`, por ejemplo `jump/f02.png`.
"""
import argparse
import os
import sys

import creator_store as store


def items_desde_lista(ruta):
    datasets = store.ensure_ids(write=True)
    pares = []
    seen = set()
    with open(os.path.expanduser(ruta), encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            try:
                mov, filename = line.split('/', 1)
                idx = int(filename[1:-4])
            except (ValueError, IndexError):
                raise ValueError('línea no válida: %r (esperado mov/fNN.png)' % line)
            store.movement_by_id(mov)
            found = None
            for base in ('nativo', 'oficial'):
                anim = datasets[base].get('anims', {}).get(mov, {})
                for frame in anim.get('frames', []):
                    if int(frame['i']) == idx:
                        found = {'mov': mov, 'id': store.image_id(mov, frame)}
                        break
                if found:
                    break
            if not found:
                raise ValueError('no existe %s' % line)
            key = (found['mov'], found['id'])
            if key not in seen:
                seen.add(key)
                pares.append(found)
    return pares


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lista', default='')
    ap.add_argument('--restaurar', action='store_true')
    ap.add_argument('--vaciar', action='store_true')
    ap.add_argument('--ver', action='store_true')
    a = ap.parse_args()
    try:
        if a.vaciar:
            result = store.empty_trash()
            print('%d fichero(s) borrados definitivamente' % result['eliminados'])
        elif a.restaurar:
            result = store.restore_trash()
            print('%d fichero(s) restaurados' % result['restaurados'])
        elif a.lista:
            items = items_desde_lista(a.lista)
            result = store.send_to_trash(items)
            print('%d variante(s) movidas a la papelera' % len(result['movidos']))
        else:
            items = store.trash_catalog()
            print('papelera: %d sprite(s)' % len(items))
            for x in items:
                print('  %-14s %-12s %s · %s' %
                      (x['mov'], x['id'][:8], ', '.join(x['indices']), x['estado']))
            print('Restaurar: --restaurar · vaciar definitivamente: --vaciar')
    except Exception as e:
        print('ERROR:', e, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
