#!/usr/bin/env python3
"""Alcance de cada frame de ataque de Chun-Li, medido sobre la hoja de juego.

Se mide en px de mundo (1 px de la hoja = 1 px de mundo, scale 1) y relativo al
pivote: x+ hacia delante, y- hacia arriba desde los pies.

    PYTHONPATH=tools/pylibs python3 tools/chunli_hitboxes.py
"""
import json

from PIL import Image

HOJA = 'voltia/nuevo/chunli/game/sheet.png'
META = 'voltia/nuevo/chunli/game/sheet.json'

ATAQUES = ['punch_weak', 'punch_strong', 'kick_weak', 'kick_strong',
           'crouch_punch_weak', 'crouch_punch_strong', 'crouch_kick_weak',
           'crouch_kick_strong', 'jump_punch', 'jump_kick', 'kick_fwd_down',
           'special_dd_k', 'speed_kick']


def main():
    d = json.load(open(META))
    im = Image.open(HOJA).convert('RGBA')
    cw, ch = d['cell']['w'], d['cell']['h']
    px0, py0 = d['pivot']
    rows = {a['id']: a for a in d['animations']}
    for nom in ATAQUES:
        a = rows[nom]
        print('== %s (%d frames)' % (nom, a['frames']))
        for c in range(a['frames']):
            cel = im.crop((c * cw, a['row'] * ch, (c + 1) * cw, (a['row'] + 1) * ch))
            px = cel.load()
            # el amarillo es la estela del efecto: pega, pero no es el cuerpo
            pts = [(x - px0, y - py0) for y in range(ch) for x in range(cw)
                   if px[x, y][3] > 0 and not (px[x, y][0] > 200 and px[x, y][1] > 150 and px[x, y][2] < 130)]
            if not pts:
                continue
            alc = max(p[0] for p in pts)
            # franja de la pierna/brazo extendido: lo que pasa de 60 % del alcance
            lim = 0.8 * alc
            franja = [p[1] for p in pts if p[0] >= lim]
            x0 = int(round(lim))
            caja = {'x': x0, 'y': min(franja), 'w': int(round(alc)) - x0 + 3,
                    'h': max(franja) - min(franja) + 3}
            print('   frame %2d  alcance %3d px   caja %s' % (c, alc, caja))


if __name__ == '__main__':
    main()
