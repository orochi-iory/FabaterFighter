#!/usr/bin/env python3
"""Recorta UN sprite suelto (una pose por imagen) al lienzo del juego.

Es la alternativa a la hoja: cuando una animación necesita poses que el
generador no sabe poner en rejilla, cada pose se dibuja sola, más grande, y
se corta aquí con el mismo criterio que la hoja aprobada:

- verde -> transparente, y se queda la masa conectada mayor;
- una sola escala: la máscara a 30 px de alto (la talla de la stance);
- suelo en la fila indicada y eje de la cabeza en x=128.

Uso:
    PYTHONPATH=tools/pylibs python3 tools/build_pose.py <imagen> <salida.png> \
        [--head 30] [--axis 128] [--ground 238] [--canvas 200 240] [--pick L|R]

--pick separa dos figuras que compartan imagen (se queda la izquierda o la
derecha). Una sola figura por imagen es lo que mejor dibuja el generador.
"""

import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sheet as B  # noqa: E402


def _components(im):
    px = im.load()
    w, h = im.size
    seen, comps = set(), []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not px[x, y][3]:
                continue
            stack, comp = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        n = (cx + dx, cy + dy)
                        if (0 <= n[0] < w and 0 <= n[1] < h and n not in seen
                                and px[n[0], n[1]][3]):
                            seen.add(n)
                            stack.append(n)
            comps.append(comp)
    return comps


TEAL = ((16, 96, 104), (23, 147, 141), (31, 177, 164))
OUTLINE = (10, 8, 20)


def seal_teal_edge(im):
    """Cierra el contorno donde el traje toca el aire.

    En una pose suelta el generador deja trozos de traje asomando al borde sin
    contorno: se ve como un halo claro pegado a la silueta (lo mismo que el
    «ruido verde», pero en teal). No se engorda nada ni se pinta por dentro:
    solo se convierten en contorno los píxeles de traje que ya están en el
    borde. Devuelve cuántos píxeles cambió.
    """
    px = im.load()
    w, h = im.size
    hits = []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if not p[3] or p[:3] not in TEAL:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                    hits.append((x, y))
                    break
    for (x, y) in hits:
        px[x, y] = OUTLINE + (255,)
    return len(hits)


def cut_sprite(path, pick=None):
    """Verde -> alfa. Si 'pick' es 'L'/'R' y hay DOS figuras, se queda una.
    Sin 'pick' se queda la masa conectada mayor (el caso de una sola figura)."""
    im = Image.open(path).convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if B.is_green(px[x, y]):
                px[x, y] = (0, 0, 0, 0)
    if pick in ('L', 'R'):
        comps = [c for c in _components(im) if len(c) > 400]
        comps.sort(key=lambda c: sum(p[0] for p in c) / len(c))
        if len(comps) < 2:
            raise SystemExit('esperaba dos figuras y hay %d' % len(comps))
        keep = set(comps[0] if pick == 'L' else comps[-1])
        for y in range(h):
            for x in range(w):
                if px[x, y][3] and (x, y) not in keep:
                    px[x, y] = (0, 0, 0, 0)
        im = im.crop(im.getbbox())
    return B.cut_figure(im)


def main(argv):
    src, dst = argv[0], argv[1]
    pick = argv[argv.index('--pick') + 1].upper() if '--pick' in argv else None
    head = int(argv[argv.index('--head') + 1]) if '--head' in argv else 30
    axis = int(argv[argv.index('--axis') + 1]) if '--axis' in argv else 128
    ground = int(argv[argv.index('--ground') + 1]) if '--ground' in argv else 238
    cw, ch = 200, 240
    if '--canvas' in argv:
        i = argv.index('--canvas')
        cw, ch = int(argv[i + 1]), int(argv[i + 2])

    fig = cut_sprite(src, pick)
    fig = B.snap(fig)
    mh = B.mask_height(fig)
    if not mh:
        raise SystemExit('la figura no tiene máscara: no puedo medir la cabeza')
    k = head / mh
    w, h = max(1, round(fig.width * k)), max(1, round(fig.height * k))
    fig = B.snap(fig.resize((w, h), Image.NEAREST))

    B.strip_fringe(fig)
    sealed = seal_teal_edge(fig)

    from centre_by_head import head_axis
    hax = head_axis(fig)
    frame = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    frame.alpha_composite(fig, (round(axis - hax), ground - h))
    frame.save(dst)
    print('%s -> %s  mascara %d px -> %d px  alto %d  lienzo %dx%d  suelo %d'
          '  contorno sellado %d px'
          % (src, dst, mh, head, h, cw, ch, ground, sealed))


if __name__ == '__main__':
    main(sys.argv[1:])
