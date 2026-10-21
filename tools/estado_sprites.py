#!/usr/bin/env python3
"""Marca los sprites aprobado/pendiente/descartado usando los mismos IDs del creador web.

    python3 tools/estado_sprites.py --estado aprobado --lista ~/Downloads/aprobar_stance.txt
    python3 tools/estado_sprites.py --ver

Lista: una ruta por línea relativa al movimiento, por ejemplo `stance/f03.png`.
"""
import argparse
import json
import os
import sys

import creator_store as store


def items_desde_lista(ruta):
    datasets = store.ensure_ids(write=True)
    pares, seen = [], set()
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


def ver():
    c = store.catalog()
    totals = {s: 0 for s in store.VALID_STATES}
    by_mov = {}
    for item in c['library']:
        state = item['estado']
        totals[state] = totals.get(state, 0) + 1
        by_mov.setdefault(item['mov'], {}).setdefault(state, 0)
        by_mov[item['mov']][state] += 1
    print('Biblioteca: %d sprite(s) · %s' %
          (len(c['library']), ', '.join('%s %d' % (k, v) for k, v in totals.items())))
    for mov in sorted(by_mov):
        print('  %-16s %s' % (mov, by_mov[mov]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--estado', choices=sorted(store.VALID_STATES), default='')
    ap.add_argument('--lista', default='')
    ap.add_argument('--ver', action='store_true')
    a = ap.parse_args()
    try:
        if a.estado and a.lista:
            result = store.set_state(items_desde_lista(a.lista), a.estado)
            print('%d variante(s) -> %s' % (result['archivos_actualizados'], a.estado))
        else:
            ver()
    except Exception as e:
        print('ERROR:', e, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
