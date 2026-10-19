#!/usr/bin/env python3
"""Limpieza de guantes y de suciedad de color en una animación ya recortada.

El generador de la hoja de 20 poses mete tres defectos en los brazos:

  1. Piel dentro del guante  -> los dedos se leen como mano desnuda.
  2. Sombra de máscara (120,16,80) y marrón de cinturón (176,112,36)
     salpicados sobre antebrazos y guantes.
  3. Restos de esos dos colores pegados al borde del guante (ribete morado).

Este script se pasa DESPUÉS de recortar desde la hoja (build8.py) y trabaja
solo sobre colores, nunca sobre la geometría: no mueve, no recorta y no
reescala ningún frame, así que la cuadrícula, la altura y el suelo siguen
siendo los mismos.

Uso:
    PYTHONPATH=tools/pylibs python3 tools/fix_gloves.py voltia/nueva/idle

Es de una sola pasada: sobre una carpeta ya limpia el cierre de guante
volvería a comerse el antebrazo. Para eso deja una marca `.fix_gloves`
y no repite el trabajo salvo que se pase `--force`.

Para comprobar el resultado:
    - a 1:1, en preview/nueva.html
    - a 5-8x, mirando el dorso de cada mano.
"""

from collections import deque
import os
import sys

from PIL import Image

GLOVE = (27, 34, 80)
GLOVE_SHADOW = (16, 20, 54)
OUTLINE = (10, 8, 20)
SUIT = {(23, 147, 141), (31, 177, 164), (16, 96, 104)}
HAIR = {(85, 21, 124), (186, 104, 232), (60, 15, 95), (190, 25, 130)}
SKIN = {(240, 176, 132), (196, 120, 84)}
# Colores que nunca son legítimos sobre un brazo o un guante.
JUNK = {(120, 16, 80), (176, 112, 36)}
# Frames donde la mano venía abierta (piel dentro del guante), revisados a mano.
GLOVE_FRAMES = {'09.png'}
NAVY = {GLOVE, GLOVE_SHADOW}


def _components(px, w, h, pred):
    seen = set()
    out = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not pred(px[x, y]):
                continue
            comp = {(x, y)}
            q = deque([(x, y)])
            seen.add((x, y))
            while q:
                cx, cy = q.popleft()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if not (0 <= nx < w and 0 <= ny < h):
                        continue
                    if (nx, ny) in seen or not pred(px[nx, ny]):
                        continue
                    seen.add((nx, ny))
                    comp.add((nx, ny))
                    q.append((nx, ny))
            out.append(comp)
    return out


def decontaminate(im, rounds=60):
    """Pinta de piel o de guante los píxeles de máscara/cinturón sueltos.

    NO se usa por defecto: en los frames 12-20 del idle repintaba la boca
    (morado de máscara junto a la piel de la barbilla) y engordaba el guante
    del brazo del fondo. Se conserva para poder mirarla frame a frame.
    """
    px = im.load()
    w, h = im.size
    total = 0
    for _ in range(rounds):
        changed = 0
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                p = px[x, y]
                if not p[3] or p[:3] not in JUNK:
                    continue
                navy = skin = suit = 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                               (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    q = px[x + dx, y + dy]
                    if not q[3]:
                        continue
                    k = q[:3]
                    if k in NAVY:
                        navy += 1
                    elif k in SKIN:
                        skin += 1
                    elif k in SUIT:
                        suit += 1
                if navy + skin >= 5 and suit <= 1:
                    px[x, y] = ((GLOVE if navy >= skin else (240, 176, 132)) + (255,))
                    changed += 1
        total += changed
        if not changed:
            break
    return total


def _glove_candidates(px, w, h):
    """Masas marinas que tienen piel o suciedad justo debajo: son guantes."""
    ground = h - 1
    masses = [c for c in _components(px, w, h,
                                     lambda p: p[3] > 0 and p[:3] in NAVY)
              if len(c) >= 40]
    out = []
    for c in masses:
        ys = [p[1] for p in c]
        if max(ys) > ground - 25:          # bota o pantalón, no es una mano
            continue
        mid = min(ys) + (max(ys) - min(ys)) // 2
        cnt = 0
        for (x, y) in c:
            if y < mid:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                           (1, 1), (-1, 1), (1, -1), (-1, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    q = px[nx, ny]
                    if q[3] and q[:3] in SKIN | JUNK:
                        cnt += 1
        if cnt >= 4:
            out.append((cnt, c))
    out.sort(key=lambda t: -t[0])
    return [c for _, c in out[:2]]


def close_glove(im, max_region=420):
    """Convierte en marino la piel que asoma dentro de un guante abierto."""
    px = im.load()
    w, h = im.size
    changed_frames = []
    for mass in _glove_candidates(px, w, h):
        xs = [p[0] for p in mass]
        ys = [p[1] for p in mass]
        if max(xs) - min(xs) > 60 or max(ys) - min(ys) > 60:
            continue
        cuff = min(ys)
        bx0, bx1 = min(xs) - 10, max(xs) + 10
        by0, by1 = cuff, max(ys) + 12

        def solid(p):
            return (p[3] > 0 and p[:3] not in SUIT
                    and p[:3] != OUTLINE and p[:3] not in HAIR)

        region = set(mass)
        q = deque(mass)
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if (nx, ny) in region or ny < cuff:
                    continue
                if not (bx0 <= nx <= bx1 and by0 <= ny <= by1):
                    continue
                if not (0 <= nx < w and 0 <= ny < h):
                    continue
                if solid(px[nx, ny]):
                    region.add((nx, ny))
                    q.append((nx, ny))
        if len(region) > max_region:
            continue

        changed = 0
        for (x, y) in region:
            if px[x, y][:3] in SKIN | JUNK:
                px[x, y] = GLOVE + (255,)
                changed += 1
        # ribete morado/marrón pegado al guante -> contorno
        rim = set()
        for (x, y) in region:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if (0 <= nx < w and 0 <= ny < h) and (nx, ny) not in region:
                        q2 = px[nx, ny]
                        if q2[3] and q2[:3] in SKIN | JUNK:
                            rim.add((nx, ny))
        for (x, y) in rim:
            px[x, y] = OUTLINE + (255,)
        # sombra en el borde inferior del guante
        y1 = max(p[1] for p in region)
        for (x, y) in region:
            if y >= y1 - 1:
                px[x, y] = GLOVE_SHADOW + (255,)
        changed_frames.append((changed, len(region)))
    return changed_frames


def glove_box(im, box):
    """Repinta como guante el verde del traje dentro de una caja.

    Hace falta porque en el frame 09 (el «10/20» del visor) la mano que
    cuelga junto a la cadera se dibujó con el color del traje: a 1:1 se lee
    como mano sin guante. La caja es (x0, y0, x1, y1) en píxeles del frame.
    """
    px = im.load()
    x0, y0, x1, y1 = box
    mask = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)
            if px[x, y][3] and px[x, y][:3] in SUIT]
    for (x, y) in mask:
        px[x, y] = GLOVE + (255,)
    if mask:
        bottom = max(y for (_, y) in mask)
        for (x, y) in mask:
            if y >= bottom - 1:
                px[x, y] = GLOVE_SHADOW + (255,)
    return len(mask)


def fix_dir(path):
    names = sorted(n for n in os.listdir(path) if n.endswith('.png'))
    for name in names:
        full = os.path.join(path, name)
        im = Image.open(full).convert('RGBA')
        # OJO: decontaminate() NO se llama por defecto. Sobre esta hoja
        # repintaba el morado de la máscara (la boca) y agrandaba el guante
        # del brazo que queda al fondo. Se deja solo como herramienta suelta.
        gloves = close_glove(im) if name in GLOVE_FRAMES else []
        if name == '09.png' and 'idle' in path.lower():
            # la mano de la cadera venía pintada con el verde del traje
            gloves.append(('caja', glove_box(im, (80, 122, 95, 155))))
        if gloves:
            im.save(full)
        print('%s  %s' % (name, gloves or 'sin cambios'))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    force = '--force' in sys.argv
    target = args[0] if args else 'voltia/nueva/idle'
    marker = os.path.join(target, '.fix_gloves')
    if os.path.exists(marker) and not force:
        print('%s ya está limpio (marca %s). Usa --force solo si has vuelto a'
              ' recortar desde la hoja.' % (target, marker))
        raise SystemExit(0)
    fix_dir(target)
    with open(marker, 'w') as fh:
        fh.write('limpiado por tools/fix_gloves.py\n')
