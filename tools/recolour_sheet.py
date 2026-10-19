#!/usr/bin/env python3
"""Recolorea la hoja ENTERA de Cammy a Voltia, a resolucion nativa.

No genera nada ni reescala: recorre la hoja, detecta filas y figuras, y cambia
el color de cada pixel con la misma tabla y las mismas reglas de vestuario que
`clone_row.py`. La salida tiene el MISMO tamano y las figuras en la MISMA
posicion, asi que se puede comparar una al lado de la otra.

    PYTHONPATH=tools/pylibs python3 tools/recolour_sheet.py <hoja> <salida.png> \
        [--x0 80] [--bg keep|green|transparent] [--json boxes.json]
"""
import argparse
import json

from PIL import Image

from clone_row import (MASK, VISOR, is_bg, lookup, paint, retarget)

GREEN = (17, 239, 6)


def runs(flags, min_len=4):
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        if not f and start is not None:
            if i - start >= min_len:
                out.append((start, i - 1))
            start = None
    if start is not None and len(flags) - start >= min_len:
        out.append((start, len(flags) - 1))
    return out


def find_rows(px, w, h, x0, gap=10):
    flags = [any(not is_bg(px[x, y]) for x in range(x0, w)) for y in range(h)]
    # unir bandas separadas por menos de `gap` filas: una coleta que baja de la
    # fila de arriba parte la banda en dos y arruina las zonas
    raw = runs(flags, 3)
    merged = []
    for a, b in raw:
        if merged and a - merged[-1][1] <= gap:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged


def find_belt(px, box):
    """Fila del cinturon dorado dentro de la caja de la figura."""
    ys = []
    for y in range(box['y0'], box['y1'] + 1):
        for x in range(box['x0'], box['x1'] + 1):
            mat, _ = lookup(px[x, y])
            if mat == 'gold':
                ys.append(y)
                break
    return min(ys) if ys else None


def paint_face(px, box):
    """Mascara y visor sobre la CARA detectada, no sobre una franja de altura.

    La cara se busca como la masa de piel mas grande de la mitad superior de la
    figura. Sobre esa masa se pinta la mascara en su mitad de arriba y una banda
    de visor a la altura de los ojos; el resto de la cara (mejilla, boca,
    menton) se queda de piel, que es lo que evita el efecto casco de moto.
    """
    x0, x1 = box['x0'], box['x1']
    y0 = box['y0']
    y1 = y0 + int((box['y1'] - box['y0']) * 0.45)
    skin = {}
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if lookup(px[x, y])[0] == 'skin':
                skin[(x, y)] = True
    if not skin:
        return 0
    seen, comps = set(), []
    for p in list(skin):
        if p in seen:
            continue
        comp, stack = [], [p]
        seen.add(p)
        while stack:
            cx, cy = stack.pop()
            comp.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (cx + dx, cy + dy)
                    if n in skin and n not in seen:
                        seen.add(n)
                        stack.append(n)
        comps.append(comp)
    # LA CARA ES LA PIEL PEGADA AL PELO. Ni la masa mas grande (en agachada
    # gana el brazo o el muslo) ni la mas alta (en una patada gana la pierna
    # levantada). La cara de este sprite siempre esta tocando el pelo.
    hair = set()
    for y in range(y0, box['y1'] + 1):
        for x in range(x0, x1 + 1):
            if lookup(px[x, y])[0] == 'hair':
                hair.add((x, y))
    if not hair:
        return 0
    def near_hair(comp):
        n = 0
        for (cx, cy) in comp:
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    if (cx + dx, cy + dy) in hair:
                        n += 1
                        break
                else:
                    continue
                break
        return n

    comps = [c for c in comps if len(c) >= 4]
    if not comps:
        return 0
    # La cara es la piel que toca el PELO MAS ALTO de la figura: en las poses
    # de guardia el antebrazo tambien esta pegado al pelo, pero siempre queda
    # mas bajo que la cabeza.
    hair_top = min(p[1] for p in hair)
    head_hair = [p for p in hair if p[1] <= hair_top + 24]
    head_hair = set(head_hair) or hair

    def near_head_hair(comp):
        n = 0
        for (cx, cy) in comp:
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    if (cx + dx, cy + dy) in head_hair:
                        n += 1
                        break
                else:
                    continue
                break
        return n

    scored = [(near_head_hair(c), -min(p[1] for p in c), c) for c in comps]
    scored.sort(reverse=True, key=lambda t: (t[0], t[1]))
    face = scored[0][2]

    # CONTROL DE CONFIANZA: si la masa elegida no esta claramente en la zona
    # de la cabeza, no se pinta nada. Es mejor una cara sin mascara que una
    # mascara sobre el antebrazo o la rodilla, que es peor que el fallo.
    fh0 = min(p[1] for p in face)
    fw = max(p[0] for p in face) - min(p[0] for p in face) + 1
    fig_h = max(1, box['y1'] - box['y0'])
    if (fh0 - box['y0']) / fig_h > 0.35 or fw > (x1 - x0) * 0.75:
        return 0
    if scored[0][0] == 0:
        return 0
    xs = [p[0] for p in face]
    ys = [p[1] for p in face]
    fx0, fx1, fy0, fy1 = min(xs), max(xs), min(ys), max(ys)
    fh = max(1, fy1 - fy0)
    if (fx1 - fx0) < 3 or fh < 3:
        return 0
    # si la masa elegida es enorme (cara + brazo pegados), se queda solo la
    # parte alta, que es la que corresponde a la cabeza
    if len(face) > 90:
        cut = fy0 + int(fh * 0.55)
        face = [p for p in face if p[1] <= cut]
        if not face:
            return 0
        ys = [p[1] for p in face]
        fy0, fy1 = min(ys), max(ys)
        fh = max(1, fy1 - fy0)
    # mascara en la mitad superior de la cara
    for (x, y) in face:
        t = (y - fy0) / fh
        if t <= 0.55:
            px[x, y] = MASK[3]
    # visor: banda a la altura de los ojos, sin llegar a los bordes
    vy0 = fy0 + int(fh * 0.30)
    vy1 = vy0 + max(1, int(fh * 0.22))
    for (x, y) in face:
        if vy0 <= y <= vy1 and fx0 + 1 <= x <= fx1 - 1:
            px[x, y] = VISOR[1]
    return len(face)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('out')
    ap.add_argument('--x0', type=int, default=80)
    ap.add_argument('--bg', default='keep', choices=['keep', 'green', 'transparent'])
    ap.add_argument('--json')
    a = ap.parse_args()

    im = Image.open(a.sheet).convert('RGB')
    w, h = im.size
    px = im.load()
    out = im.copy()
    op = out.load()

    rows = find_rows(px, w, h, a.x0)
    boxes = []
    for (ry0, ry1) in rows:
        flags = [any(not is_bg(px[x, y]) for y in range(ry0, ry1 + 1))
                 for x in range(a.x0, w)]
        for (cx0, cx1) in runs(flags, 5):
            bx0, bx1 = a.x0 + cx0, a.x0 + cx1
            ys = [y for y in range(ry0, ry1 + 1)
                  if any(not is_bg(px[x, y]) for x in range(bx0, bx1 + 1))]
            if not ys:
                continue
            top, bot = min(ys), max(ys)
            box = {'x0': bx0, 'x1': bx1, 'y0': top, 'y1': bot}
            boxes.append(box)
            belt = find_belt(px, box)
            box['belt'] = belt
            for y in range(top, bot + 1):
                for x in range(bx0, bx1 + 1):
                    p = px[x, y]
                    if is_bg(p):
                        continue
                    mat, idx = lookup(p)
                    mat = retarget(mat, y, top, bot, belt_row=belt)
                    op[x, y] = paint(p, mat, idx)

    faces = 0
    for box in boxes:
        faces += 1 if paint_face(op, box) else 0
    print('caras con mascara y visor: %d de %d' % (faces, len(boxes)))

    if a.bg in ('green', 'transparent'):
        out = out.convert('RGBA')
        op = out.load()
        for y in range(h):
            for x in range(w):
                p = op[x, y]
                if is_bg(p[:3]):
                    op[x, y] = GREEN + (255,) if a.bg == 'green' else (0, 0, 0, 0)
    out.save(a.out)
    print('%s -> %s  %dx%d  %d filas  %d figuras  fondo %s' %
          (a.sheet, a.out, w, h, len(rows), len(boxes), a.bg))
    if a.json:
        with open(a.json, 'w') as fh:
            json.dump(boxes, fh)
        print('cajas en', a.json)


if __name__ == '__main__':
    main()
