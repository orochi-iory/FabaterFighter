#!/usr/bin/env python3
"""Mete en el creador los PNG nuevos que se subieron desde el visor.

Los ficheros que llegan por el navegador se guardan en `creador/nuevos/` (nunca en las
carpetas buenas). Este script los valida y los coloca en `sprites/<mov>/`, renumerando para
no repetir indices.

    PYTHONPATH=tools/pylibs python3 tools/aniadir_sprites.py --mov stance
    PYTHONPATH=tools/pylibs python3 tools/aniadir_sprites.py --mov walk --limpiar

Validaciones (se rechaza el fichero y se dice por que):
  - tiene que ser PNG de verdad (cabecera), no un JPG renombrado;
  - fondo rojo puro en los bordes (si no, el recorte por rojo no lo va a separar);
  - una sola figura (si el fondo rojo casi no aparece, es que viene una hoja con varias);
  - alto minimo razonable (no confundir un icono con un sprite).

Despues de meterlos, hay que pasarlos por `trocear.py` + `encajar.py` si se quiere el tamano
oficial. Aqui solo entran en bruto: este script NO redimensiona ni recolorea nada.
"""
import argparse
import glob
import json
import os
import struct
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREADOR = os.path.join(BASE, 'voltia/nuevo/creador')
NUEVOS = os.path.join(CREADOR, 'nuevos')
SPRITES = os.path.join(CREADOR, 'sprites')


def cabecera_png(ruta):
    with open(ruta, 'rb') as fh:
        cab = fh.read(24)
    if cab[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    return struct.unpack('>II', cab[16:24])


def revisar(ruta):
    """Devuelve (tamaño, motivo_de_rechazo). Tamaño None = rechazado.

    Se acepta fondo rojo puro (material de la IA sin trocear) o fondo transparente (sprite
    ya troceado). Cualquier otra cosa se rechaza, porque el pipeline no sabría separar la
    figura del fondo.
    """
    tam = cabecera_png(ruta)
    if not tam:
        return None, 'no es un PNG (cabecera incorrecta)'
    ancho, alto = tam
    if alto < 200 or ancho < 60:
        return None, 'demasiado pequeño (%dx%d): parece un icono' % (ancho, alto)
    try:
        from PIL import Image
    except ImportError:
        return tam, ''
    im = Image.open(ruta).convert('RGBA')
    px = im.load()
    w, h = im.size
    rojo = claro = total = 0
    puntos = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
    puntos += [(0, y) for y in range(0, h, 4)] + [(w - 1, y) for y in range(0, h, 4)]
    for x, y in puntos:
        total += 1
        r, g, b, al = px[x, y]
        if al < 16:
            claro += 1
        elif r > 200 and g < 60 and b < 60:
            rojo += 1
    if rojo / max(1, total) >= 0.6:
        return tam, ''
    if claro / max(1, total) >= 0.6:
        return tam, ''
    return None, ('el borde no es rojo puro ni transparente (rojo %.0f %%, transparente %.0f %%): '
                  'el pipeline no podria separar la figura' % (100 * rojo / total, 100 * claro / total))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mov', required=True, choices=['stance', 'walk'])
    ap.add_argument('--limpiar', action='store_true', help='vacia nuevos/ al terminar')
    a = ap.parse_args()

    destino = os.path.join(SPRITES, a.mov)
    os.makedirs(destino, exist_ok=True)
    existentes = sorted(os.path.basename(p) for p in glob.glob(os.path.join(destino, 'f*.png')))
    siguiente = len(existentes)

    datos_p = os.path.join(SPRITES, 'datos.json')
    datos = json.load(open(datos_p))
    v = datos['anims'][a.mov]

    ficheros = sorted(glob.glob(os.path.join(NUEVOS, '*.png')))
    if not ficheros:
        sys.exit('no hay PNG en ' + os.path.relpath(NUEVOS, BASE))

    entrados = 0
    for p in ficheros:
        tam, problema = revisar(p)
        if not tam:
            print('  RECHAZADO %-28s %s' % (os.path.basename(p), problema))
            continue
        ancho, alto = tam
        nombre = 'f%02d.png' % siguiente
        with open(p, 'rb') as src, open(os.path.join(destino, nombre), 'wb') as dst:
            dst.write(src.read())
        v['frames'].append({'i': siguiente, 'fichero': '%s/%s' % (a.mov, nombre),
                            'nativo': [ancho, alto], 'caja_en_hoja': None,
                            'cabeza': None, 'cortado': False, 'subido': True})
        print('  %-28s -> %s/%s (%d×%d)%s'
              % (os.path.basename(p), a.mov, nombre, ancho, alto,
                 (' · ' + problema) if problema else ''))
        siguiente += 1
        entrados += 1

    with open(datos_p, 'w') as fh:
        json.dump(datos, fh, indent=1)
    print('\n%d sprite(s) añadido(s) a %s · ahora hay %d' % (entrados, a.mov, len(v['frames'])))
    if a.limpiar:
        for p in ficheros:
            os.remove(p)
        print('nuevos/ vaciado')
    print('Siguiente paso: PYTHONPATH=tools/pylibs python3 voltia/nuevo/creador/trocear.py '
          'NO hace falta para los subidos; para el tamaño oficial, encajar.py.')


if __name__ == '__main__':
    main()
