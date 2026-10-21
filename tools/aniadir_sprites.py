#!/usr/bin/env python3
"""Importa PNG de `creador/nuevos/` a cualquier movimiento del modelo original.

El PNG entra en la resolución nativa, sin escalar ni recolorear; si supera la validación queda
pendiente para que se revise/apruebe en el creador. Cada frame debe compartir el lienzo del
movimiento, para que no haya deformación ni anclajes inventados.

    python3 tools/aniadir_sprites.py --mov jump
    python3 tools/aniadir_sprites.py --mov stance --limpiar

La página web hace esta misma operación directamente desde «Añadir PNG».
"""
import argparse
import glob
import os
import sys

import creator_store as store

CREATOR = store.CREATOR
NUEVOS = CREATOR / 'nuevos'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mov', required=True, help='id del movimiento en voltia/sheet.json')
    ap.add_argument('--limpiar', action='store_true', help='borra de nuevos/ los que entraron')
    args = ap.parse_args()
    try:
        store.movement_by_id(args.mov)
    except ValueError as e:
        ap.error(str(e))
    files = sorted(glob.glob(str(NUEVOS / '*.png')))
    if not files:
        sys.exit('no hay PNG en ' + str(NUEVOS))
    added, rejected = [], []
    for path in files:
        try:
            with open(path, 'rb') as f:
                blob = f.read()
            result = store.add_upload(args.mov, 'nativo', os.path.basename(path), blob)
            added.append(path)
            print('  %-28s -> %s · %s×%s · pendiente' %
                  (os.path.basename(path), result['fichero'], *result['dimensiones']))
        except Exception as e:
            rejected.append((path, str(e)))
            print('  RECHAZADO %-28s %s' % (os.path.basename(path), e))
    if args.limpiar:
        for path in added:
            os.remove(path)
    print('\n%d añadido(s) a %s · %d rechazado(s)%s' %
          (len(added), args.mov, len(rejected), ' · aceptados retirados de nuevos/' if args.limpiar else ''))
    return 0 if added else 1


if __name__ == '__main__':
    raise SystemExit(main())
