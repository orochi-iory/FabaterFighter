#!/usr/bin/env python3
"""Recorta una hoja de 20 poses (5 columnas x 4 filas) en frames de un lienzo fijo.

Es el método aceptado para el modelo nuevo: **una sola hoja**, una sola
escala y un solo suelo. Todos los frames salen del mismo factor, así que no
hay deriva de tamaño entre poses.

La hoja lleva fondo verde plano en los pasillos y alrededor de cada figura.
No se recorta pose a pose ni se reescala cada frame por separado.

Uso:
    PYTHONPATH=tools/pylibs python3 tools/build_sheet.py \
        voltia/nueva/stance/src/sheet_stance.png voltia/nueva/stance 200 240 238

    argumentos: <hoja> <carpeta_salida> <ancho> <alto> <fila_del_suelo> [columnas] [filas] [alto_de_mascara]

    Con alto_de_mascara (la stance aprobada usa 30) la escala de la hoja sale
    de la cabeza y no del alto total de la figura, que cambia con la pose.

    El contorno NO se cierra por defecto: la stance aprobada se cortó sin eso y
    su borde ya sale limpio (5% de teal en el borde). Con --close se tapa todo
    píxel que toque el fondo, y entonces el contorno engorda (14% en vez de 9%).

Después de recortar, si el brazo o el guante salen manchados, se pasa
tools/fix_gloves.py (solo en los frames revisados a mano).

Ojo con el factor: se calcula con la figura de la primera celda, como en el
pipeline anterior. Un píxel de diferencia en el alto de esa figura mueve el
factor un 0,4 %, y entonces los frames no cuadran al píxel con los de otra
tirada. Por eso una animación no se mezcla nunca con frames de dos hojas.
"""

import os
import sys

from PIL import Image

# Paleta congelada del modelo (ver voltia/guide/style.json).
PALETTE = [
    (10, 8, 20), (16, 20, 54), (27, 34, 80),
    (16, 96, 104), (23, 147, 141), (31, 177, 164),
    (60, 15, 95), (85, 21, 124), (186, 104, 232),
    (120, 16, 80), (190, 25, 130),
    (196, 120, 84), (240, 176, 132),
    (176, 112, 36), (250, 210, 50), (255, 255, 255),
]


def is_green(px):
    r, g, b = px[:3]
    return g > 150 and r < 100 and b < 120 and g > r + 80 and g > b + 80


def snap(im):
    """Lleva cada píxel al color más cercano de la paleta (mantiene alfa)."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    cache = {}
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                px[x, y] = (0, 0, 0, 0)
                continue
            key = p[:3]
            if key not in cache:
                cache[key] = min(
                    PALETTE,
                    key=lambda c: (c[0] - key[0]) ** 2 + (c[1] - key[1]) ** 2 + (c[2] - key[2]) ** 2,
                )
            px[x, y] = cache[key] + (255,)
    return im


def _green_spans(flags):
    """Devuelve (inicio, fin) de cada tramo True consecutivo."""
    out, start = [], None
    for i, v in enumerate(flags):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(flags) - 1))
    return out


def rows_of_cells(im, ncol=5, nrows=4):
    """Separa la hoja en filas y columnas usando los pasillos verdes.

    Los márgenes verdes de arriba y abajo NO son filas: son separadores. Las
    filas son el hueco entre pasillos consecutivos. Las columnas se sacan de
    los pasillos verticales que están verdes en todas las filas; si la hoja no
    los trae, se reparte a partes iguales.
    """
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    full_rows = [all(is_green(px[x, y]) for x in range(w)) for y in range(h)]
    spans = _green_spans(full_rows)
    # los bordes de la hoja cuentan como pasillo: una tirada sin margen
    # arriba o abajo sigue dando 4 filas
    edges = [(-1, -1)] + spans + [(h, h)]
    bands = [(edges[i][1] + 1, edges[i + 1][0] - 1) for i in range(len(edges) - 1)]
    bands = [(a, b) for a, b in bands if b - a >= 8]
    # una hoja 4x2 (4 columnas, 2 filas) no lleva pasillo en medio: se parte
    # por la mitad, así que el número de filas se puede forzar
    if nrows and len(bands) < nrows:
        hh = h / nrows
        bands = [(round(i * hh), round((i + 1) * hh) - 1) for i in range(nrows)]
    if not bands:
        raise SystemExit('no encuentro filas de figuras en la hoja')

    # columnas: verde en todas las filas a la vez
    cols = []
    for x in range(w):
        ok = True
        for (a, b) in bands:
            for y in range(a, b + 1, 2):
                if not is_green(px[x, y]):
                    ok = False
                    break
            if not ok:
                break
        cols.append(ok)
    corridors = _green_spans(cols)
    inner = [c for c in corridors if c[0] > 0 and c[1] < w - 1]
    if len(inner) == ncol - 1:
        bounds = [0] + [(a + b) // 2 for a, b in inner] + [w]
    else:
        step = w / ncol
        bounds = [round(i * step) for i in range(ncol + 1)]
    return [[im.crop((bounds[i], a, bounds[i + 1], b + 1)) for i in range(bounds.__len__() - 1)]
            for (a, b) in bands]


def cut_figure_centre(cell, tol=70):
    """Recorta la figura de una celda de rejilla fija.

    Se queda con la masa conectada cuyo centro está más cerca del centro de la
    celda. En una hoja grande las figuras se tocan y una coleta vecina puede
    entrar en la celda; quedarse con «la masa más grande» elige entonces la
    figura del vecino. Por el centro, no.
    """
    cell = cell.convert('RGBA')
    px = cell.load()
    w, h = cell.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and g > 120 and g > r * 2.2 and g > b * 2.2:
                px[x, y] = (0, 0, 0, 0)
    solid = [(x, y) for y in range(h) for x in range(w) if px[x, y][3]]
    if not solid:
        return cell
    seen = set()
    comps = []
    for seed in solid:
        if seed in seen:
            continue
        comp = [seed]
        stack = [seed]
        seen.add(seed)
        while stack:
            cx, cy = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (cx + dx, cy + dy)
                    if n in seen or not (0 <= n[0] < w and 0 <= n[1] < h):
                        continue
                    if px[n[0], n[1]][3]:
                        seen.add(n)
                        stack.append(n)
                        comp.append(n)
        if len(comp) >= 60:
            comps.append(comp)
    if not comps:
        return cell
    cx0 = w / 2
    best = min(comps, key=lambda c: abs(sum(p[0] for p in c) / len(c) - cx0))
    keep = set(best)
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and (x, y) not in keep:
                px[x, y] = (0, 0, 0, 0)
    return cell.crop(cell.getbbox())


def cut_figure(cell):
    """Recorta la figura de su celda: verde -> transparente y se queda la
    masa conectada más grande.

    Las coletas de las figuras vecinas se cuelan en la celda como islas
    sueltas; quedarse con la masa más grande las tira sin tocar la figura.
    """
    cell = cell.convert('RGBA')
    px = cell.load()
    w, h = cell.size
    for y in range(h):
        for x in range(w):
            if is_green(px[x, y]):
                px[x, y] = (0, 0, 0, 0)
    solid = [(x, y) for y in range(h) for x in range(w) if px[x, y][3]]
    if not solid:
        return cell
    seen = set()
    best = None
    for seed in solid:
        if seed in seen:
            continue
        comp = {seed}
        stack = [seed]
        seen.add(seed)
        while stack:
            cx, cy = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (cx + dx, cy + dy)
                    if n in seen or not (0 <= n[0] < w and 0 <= n[1] < h):
                        continue
                    if px[n[0], n[1]][3]:
                        seen.add(n)
                        comp.add(n)
                        stack.append(n)
        if best is None or len(comp) > len(best):
            best = comp
    # fuera todo lo que no sea la figura (islas de las figuras vecinas)
    for (x, y) in solid:
        if (x, y) not in best:
            px[x, y] = (0, 0, 0, 0)
    xs = [p[0] for p in best]
    ys = [p[1] for p in best]
    return cell.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


MASK = {(190, 25, 130), (120, 16, 80)}


def mask_height(fig):
    """Alto en píxeles de la masa de máscara más grande (la talla de la cabeza).

    Es la referencia de escala que comparten todas las hojas: el alto total
    de la figura cambia con la pose (piernas abiertas, rodilla arriba), pero
    la cabeza no. La stance aprobada tiene la máscara a 30 px.
    """
    px = fig.load()
    w, h = fig.size
    seen = set()
    best = 0
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if (x, y) in seen or not p[3] or p[:3] not in MASK:
                continue
            comp = [(x, y)]
            stack = [(x, y)]
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (cx + dx, cy + dy)
                    if not (0 <= n[0] < w and 0 <= n[1] < h) or n in seen:
                        continue
                    q = px[n[0], n[1]]
                    if q[3] and q[:3] in MASK:
                        seen.add(n)
                        comp.append(n)
                        stack.append(n)
            ys = [c[1] for c in comp]
            best = max(best, max(ys) - min(ys) + 1)
    return best


def strip_fringe(fig, tol=26):
    """Tira el antialias del borde: píxeles opacos que no son de la paleta.

    El modelo mezcla la tinta con el verde justo en el borde. Esas mezclas no
    son un color de la paleta, y al llevarlas a la más cercana caen a veces en
    el teal del traje: eso es el «ruido verde» que se ve pegado a la coleta y
    a las botas. Se hacen transparentes solo si están pegados al fondo y solo
    si no son un color de la paleta: uno o dos píxeles de la hoja, que no se
    notan, y después el contorno se cierra sobre el borde limpio.
    """
    px = fig.load()
    w, h = fig.size
    drop = []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if not p[3]:
                continue
            near_bg = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                    near_bg = True
                    break
            if not near_bg:
                continue
            c = p[:3]
            d = min((c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2
                    for q in PALETTE)
            if d > tol * tol:
                drop.append((x, y))
    for (x, y) in drop:
        px[x, y] = (0, 0, 0, 0)
    return len(drop)


def close_outline(im):
    """Tapa con contorno cualquier píxel opaco que toque el fondo.

    Es la regla de la guía desde el principio («los píxeles de borde que
    salen verdosos se tapan con el contorno. Cero halo»).
    """
    px = im.load()
    w, h = im.size
    out = []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if not p[3] or p[:3] == PALETTE[0]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                    out.append((x, y))
                    break
    for (x, y) in out:
        px[x, y] = PALETTE[0] + (255,)
    return len(out)


def _place(fig, factor, cw, ch, ground, close=False):
    """Escala una figura, la pone en el lienzo y la centra por los pies."""
    w, h = max(1, round(fig.width * factor)), max(1, round(fig.height * factor))
    fig = snap(fig.resize((w, h), Image.NEAREST))
    px = fig.load()
    feet = [x for y in range(max(0, h - 5), h) for x in range(w) if px[x, y][3]]
    cx = sum(feet) / len(feet) if feet else w / 2
    frame = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    frame.alpha_composite(fig, (round(cw / 2 - cx), ground - h))
    if close:
        close_outline(frame)
    return frame




def _runs(flags, min_gap=6, min_len=8):
    """Agrupa índices contiguos en True, tolerando huecos menores que min_gap."""
    runs, start, last = [], None, None
    for i, f in enumerate(flags):
        if not f:
            continue
        if start is None:
            start = last = i
        elif i - last - 1 <= min_gap:
            last = i
        else:
            if last - start + 1 >= min_len:
                runs.append((start, last))
            start = last = i
    if start is not None and last - start + 1 >= min_len:
        runs.append((start, last))
    return runs



def _valley_grid(im, ncols, min_w=70):
    """Corta por los valles de densidad de tinta.

    Las figuras de una hoja generada suelen tocarse, así que no hay ninguna
    columna vacía entre ellas. Pero sí hay columnas con muy poca tinta (el
    final de una coleta, un guante). Se eligen como cortes las `ncols-1`
    columnas de mínima densidad, respetando una anchura mínima por figura: así
    el corte nunca cae sobre el torso.
    """
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    ink = [[not is_green(px[x, y]) for x in range(w)] for y in range(h)]
    rows = _runs([any(r) for r in ink], 8, 10)
    grid = []
    for (y0, y1) in rows:
        col = [sum(1 for y in range(y0, y1 + 1) if ink[y][x]) for x in range(w)]
        lo = next(x for x in range(w) if col[x])
        hi = max(x for x in range(w) if col[x])
        cand = sorted(range(lo + min_w, hi - min_w + 1), key=lambda x: col[x])
        cuts = []
        for x in cand:
            if all(abs(x - c) >= min_w for c in cuts):
                cuts.append(x)
            if len(cuts) == ncols - 1:
                break
        cuts.sort()
        edges = [lo] + cuts + [hi + 1]
        cells = []
        for a, b in zip(edges, edges[1:]):
            sub = im.crop((max(0, a - 1), y0, min(w, b + 1), y1 + 1))
            cells.append(sub)
        grid.append(cells)
    return grid

def _projection_grid(im, row_gap=8, col_gap=8):
    """Corta la hoja por proyección: el verde separa filas y columnas.

    No supone rejilla regular ni celdas de tamaño fijo: busca las bandas de
    tinta. Con una hoja cuyas figuras están separadas por verde, cada banda
    contiene exactamente una figura; después se queda la masa principal.
    """
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    ink = [[not is_green(px[x, y]) for x in range(w)] for y in range(h)]
    rows = _runs([any(ink[y]) for y in range(h)], row_gap, 10)
    grid = []
    for (y0, y1) in rows:
        cols = _runs([any(ink[y][x] for y in range(y0, y1 + 1))
                      for x in range(w)], col_gap, 6)
        grid.append([im.crop((x0, y0, x1 + 1, y1 + 1)) for (x0, x1) in cols])
    return grid

def _blob_grid(im, gap=3, min_area=120):
    """Encuentra las figuras por conectividad y las ordena en filas y columnas.

    Es el corte que no parte nada: se etiquetan los bultos de tinta (8
    vecinos), se unen los que están a menos de `gap` píxeles (coleta + cuerpo,
    guante suelto...), y cada figura resultante se coloca en su fila por la
    altura del centro y en su columna por la x. No depende de que el modelo
    reparta las figuras a intervalos regulares.
    """
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or is_green(px[x, y]):
                continue
            stack = [(x, y)]
            seen[y][x] = True
            pts = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] \
                                and not is_green(px[nx, ny]):
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if len(pts) >= min_area:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                comps.append([min(xs), min(ys), max(xs), max(ys), len(pts)])

    # unir bultos vecinos (una figura puede venir en dos trozos)
    merged = True
    while merged:
        merged = False
        for i in range(len(comps)):
            for j in range(i + 1, len(comps)):
                a, b = comps[i], comps[j]
                near = (a[0] - gap <= b[2] + gap and b[0] - gap <= a[2] + gap and
                        a[1] - gap <= b[3] + gap and b[1] - gap <= a[3] + gap)
                # solo se unen trozos pequeños a una figura grande (coleta
                # partida, guante suelto). Dos figuras completas nunca se unen:
                # eso era lo que fundía filas enteras en un bulto.
                small = min(a[4], b[4]) / max(a[4], b[4]) < 0.30
                if near and small:
                    comps[i] = [min(a[0], b[0]), min(a[1], b[1]),
                                max(a[2], b[2]), max(a[3], b[3]), a[4] + b[4]]
                    comps.pop(j)
                    merged = True
                    break
            if merged:
                break

    comps.sort(key=lambda c: (c[1] + c[3]) / 2)
    rows, cur, last = [], [], None
    for c in comps:
        cy = (c[1] + c[3]) / 2
        hh = c[3] - c[1]
        if last is None or abs(cy - last) < hh * 0.6:
            cur.append(c)
        else:
            rows.append(cur)
            cur = [c]
        last = cy
    if cur:
        rows.append(cur)

    out = []
    for r in rows:
        r.sort(key=lambda c: (c[0] + c[2]) / 2)
        out.append([im.crop((c[0], c[1], c[2] + 1, c[3] + 1)) for c in r])
    return out

def _fixed_grid(im, ncol, nrows):
    """Parte la hoja en celdas iguales.

    Es el corte que aguanta cuando el modelo dibuja las figuras casi pegadas:
    separar por pasillos verdes falla en cuanto dos poses se rozan y parte una
    figura en trozos. Con rejilla fija cada celda se queda con su figura y la
    que se cuele de la vecina se descarta por tamaño.
    """
    w, h = im.size
    cw, chh = w / ncol, h / nrows
    cells = []
    for j in range(nrows):
        row = []
        for i in range(ncol):
            row.append(im.crop((round(i * cw), round(j * chh),
                                round((i + 1) * cw), round((j + 1) * chh))))
        cells.append(row)
    return cells


def build(sheet, outdir, cw, ch, ground, ncol=5, nrows=4, write=True, head=0,
          close=False, per_cell=False, clamp=0.08, grid_mode=False,
          uniform_scale=False,
          blob_mode=False, drop_gray=False, proj_mode=False,
          valley_mode=False):
    im = Image.open(sheet)
    if drop_gray:
        im = im.convert('RGB')
        px = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                if max(r, g, b) - min(r, g, b) < 26 and 25 < r < 150:
                    px[x, y] = (17, 239, 6)
    if valley_mode:
        grid = _valley_grid(im, ncol if ncol else 6)
        nrows = len(grid)
        grid = [r + [Image.new('RGB', (8, 8), (17, 239, 6))] * (ncol - len(r))
                for r in grid]
    elif proj_mode:
        grid = _projection_grid(im)
        ncol = max(len(r) for r in grid)
        nrows = len(grid)
        grid = [r + [Image.new('RGB', (8, 8), (17, 239, 6))] * (ncol - len(r))
                for r in grid]
    elif blob_mode:
        grid = _blob_grid(im)
        ncol = max(len(r) for r in grid)
        nrows = len(grid)
        grid = [r + [Image.new('RGB', (8, 8), (17, 239, 6))] * (ncol - len(r))
                for r in grid]
    else:
        grid = _fixed_grid(im, ncol, nrows) if grid_mode else rows_of_cells(im, ncol, nrows)
    if len(grid) > nrows:
        raise SystemExit('la hoja dio %d filas, se esperaban %d' % (len(grid), nrows))
    cut = cut_figure_centre if grid_mode else cut_figure
    figs = []
    for j in range(nrows):
        for i in range(ncol):
            cell = grid[j][i]
            figs.append(cut(cell))
    for f in figs:
        strip_fringe(f)
    figs = [f for f in figs if f.width > 4 and f.height > 4]   # celdas vacías

    out = []
    if head and per_cell and uniform_scale:
        # ESCALA UNICA: un solo factor para toda la hoja, sacado de la mediana
        # de las cabezas. Es lo que impide que unas figuras salgan a 166 px y
        # otras a 127 px dentro del mismo set.
        masks = [mask_height(snap(f)) for f in figs]
        vals = sorted(m for m in masks if m)
        if not vals:
            raise SystemExit('ninguna celda tiene mascara: no puedo medir la cabeza')
        med = vals[len(vals) // 2]
        factor = head / med
        for k, fig in enumerate(figs):
            out.append(_place(fig, factor, cw, ch, ground, close))
        print('escala UNICA %.3f (cabeza mediana %d px -> %d px)' % (factor, med, head))
    elif head and per_cell:
        # Escala por celda, robusta: factor de cada celda, mediana de la hoja y
        # cada celda limitada a ±clamp de esa mediana. Así una pose rara (una
        # voltereta girada, donde la máscara no se puede medir) no se va de
        # escala, y las celdas que el modelo dibujó algo distintas se corrigen
        # sin romper la coherencia del conjunto.
        factors = {}
        for k, fig in enumerate(figs):
            m = mask_height(snap(fig))
            if m:
                factors[k] = head / m
        if not factors:
            raise SystemExit('ninguna celda tiene máscara: no puedo medir la cabeza')
        vals = sorted(factors.values())
        med = vals[len(vals) // 2]
        lo, hi = med * (1 - clamp), med * (1 + clamp)
        off = 0
        for k, fig in enumerate(figs):
            out.append(_place(fig, min(max(factors.get(k, med), lo), hi),
                              cw, ch, ground, close))
        print('escala por celda: mediana %.3f, rango aplicado %.3f-%.3f'
              % (med, lo, hi))
    else:
        if head:
            mh = mask_height(snap(figs[0]))
            if not mh:
                raise SystemExit('la primera figura no tiene máscara: no puedo medir la cabeza')
            factor = head / mh
        else:
            factor = 200 / figs[0].height    # 200 px = 170 cm con coleta
        for fig in figs:
            out.append(_place(fig, factor, cw, ch, ground, close))

    if write:
        os.makedirs(outdir, exist_ok=True)
        for k, frame in enumerate(out):
            frame.save(os.path.join(outdir, '%02d.png' % k))
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) < 5:
        raise SystemExit(__doc__)
    sheet, outdir = args[0], args[1]
    cw, ch, ground = int(args[2]), int(args[3]), int(args[4])
    ncol = int(args[5]) if len(args) > 5 else 5
    nrows = int(args[6]) if len(args) > 6 else 4
    head = int(args[7]) if len(args) > 7 else 0
    frames = build(sheet, outdir, cw, ch, ground, ncol=ncol, nrows=nrows,
                   head=head, close='--close' in args,
                   per_cell='--per-cell' in args,
                   uniform_scale='--uniform' in args,
                   grid_mode='--grid' in args,
                   blob_mode='--blobs' in args,
                   drop_gray='--drop-gray' in args,
                   proj_mode='--project' in args,
                   valley_mode='--valley' in args)
    print('%s -> %s: %d frames de %dx%d, suelo %d'
          % (sheet, outdir, len(frames), cw, ch, ground))
