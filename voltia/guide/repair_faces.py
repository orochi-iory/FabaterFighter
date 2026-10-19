#!/usr/bin/env python3
"""Cierra los huecos que se comió el recorte y devuelve la boca a la máscara.

No rellena el hueco grande de la coleta. No redibuja el cuerpo.
"""
import sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'tools' / 'pylibs'))
from PIL import Image

NEW = ROOT / 'nueva'
MASK = {(152, 40, 104), (112, 24, 80)}
VISOR = (40, 168, 168)
MOUTH = (16, 16, 48)
LIP = (232, 176, 128)
LIP_DK = (192, 120, 80)
INK = (0, 0, 0)


def enclosed(im, limit=40):
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    holes = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][3]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp = []
            touches = False
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                if cx in (0, w - 1) or cy in (0, h - 1):
                    touches = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] == 0:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if not touches and len(comp) <= limit:
                holes.append(comp)
    return holes


def fill_holes(im):
    px = im.load()
    w, h = im.size
    n = 0
    for comp in enclosed(im):
        cols = Counter()
        for x, y in comp:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3]:
                    cols[px[nx, ny]] += 1
        if not cols:
            continue
        color = cols.most_common(1)[0][0]
        for x, y in comp:
            px[x, y] = color
            n += 1
    return n


def mask_component(im):
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    best = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][:3] not in MASK:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][:3] in MASK:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    return best


STAMP = {MOUTH, LIP, LIP_DK}
# Abertura con labio. La fila de arriba es el techo, la del medio la boca,
# la de abajo el labio. Se lee de frente, mirando a la derecha.
PATTERN = (
    (INK, INK, INK, INK, INK),
    (INK, MOUTH, LIP, MOUTH, INK),
    (LIP_DK, LIP, LIP, LIP, LIP),
)
PAINT_ON = MASK | {INK} | STAMP


def components_of(im, colors):
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][:3] not in colors:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][:3] in colors:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            out.append(comp)
    return out


def find_eye(im, head):
    """El visor de la cara: el grupo teal pequeño, arriba, pegado a la máscara."""
    px = im.load()
    w, h = im.size
    hys = [p[1] for p in head]
    hxs = [p[0] for p in head]
    hy0, hy1 = min(hys), max(hys)
    head_set = set(head)
    cands = []
    for comp in components_of(im, {VISOR}):
        if not (1 <= len(comp) <= 18):
            continue
        cy = sum(p[1] for p in comp) / len(comp)
        cx = sum(p[0] for p in comp) / len(comp)
        if cy < hy0 - 6 or cy > hy0 + (hy1 - hy0) * 0.72:
            continue
        near = min(max(abs(cx - x), abs(cy - y)) for x, y in head)
        if near <= 8:
            cands.append(comp)
    if not cands:
        return None
    # El ojo está arriba. Si hay dos, el de más a la derecha (la cara mira ahí).
    cands.sort(key=lambda c: (min(p[1] for p in c), -max(p[0] for p in c)))
    eye = list(cands[0])
    eye_set = set(eye)
    for x, y in list(eye):
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][:3] == (16, 72, 80):
                    if any(max(abs(nx - ex), abs(ny - ey)) <= 2 for ex, ey in eye_set):
                        eye.append((nx, ny))
    return eye


def face_pixels(im, eye):
    px = im.load()
    w, h = im.size
    ecx = sum(p[0] for p in eye) / len(eye)
    ecy = sum(p[1] for p in eye) / len(eye)
    pts = []
    for y in range(max(0, int(ecy) - 3), min(h, int(ecy) + 14)):
        for x in range(max(0, int(ecx) - 12), min(w, int(ecx) + 8)):
            if px[x, y][:3] in MASK:
                pts.append((x, y))
    return pts


def clear_old_stamp(im, eye):
    """Quita el sello de 2 px. No toca el cuello ni las manos."""
    px = im.load()
    w, h = im.size
    ey = max(p[1] for p in eye)
    ex = max(p[0] for p in eye)
    zone = []
    for y in range(ey + 1, min(h, ey + 8)):
        for x in range(max(0, ex - 10), min(w, ex + 5)):
            if px[x, y][:3] in STAMP:
                zone.append((x, y))
    if not zone:
        return 0
    # Solo el grupo pequeño pegado a la máscara. La piel del cuello es grande.
    seen = set()
    n = 0
    zset = set(zone)
    for start in zone:
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        comp = []
        while stack:
            cx, cy = stack.pop()
            comp.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (cx + dx, cy + dy)
                    if q in zset and q not in seen:
                        seen.add(q)
                        stack.append(q)
        touches = False
        for x, y in comp:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][:3] in MASK:
                    touches = True
        if touches and len(comp) <= 8:
            for x, y in comp:
                px[x, y] = (152, 40, 104, 255)
                n += 1
    return n


def has_mouth(im, eye):
    """La boca ya puesta: labio entre dos píxeles de abertura, bajo el visor."""
    px = im.load()
    w, h = im.size
    ey = max(p[1] for p in eye)
    for y in range(ey, min(h - 1, ey + 8)):
        for x in range(1, w - 1):
            if (px[x, y][:3] == LIP and px[x - 1, y][:3] == MOUTH
                    and px[x + 1, y][:3] == MOUTH):
                return True
    return False


def fill_head_bites(im):
    """Bocado del visor, justo por encima de 40 px. No cierra el sobaco ni la coleta."""
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    n = 0
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][3]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp = []
            touches = False
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                if cx in (0, w - 1) or cy in (0, h - 1):
                    touches = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] == 0:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if touches or not (41 <= len(comp) <= 50):
                continue
            if max(p[1] for p in comp) > 55:
                continue
            remaining = set(comp)
            for _ in range(40):
                nxt = set()
                for cx, cy in remaining:
                    cols = Counter()
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                                   (1, 1), (1, -1), (-1, 1), (-1, -1)):
                        nx, ny = cx + dx, cy + dy
                        if (0 <= nx < w and 0 <= ny < h and px[nx, ny][3]
                                and (nx, ny) not in remaining):
                            cols[px[nx, ny]] += 1
                    if cols:
                        px[cx, cy] = cols.most_common(1)[0][0]
                        n += 1
                    else:
                        nxt.add((cx, cy))
                if not nxt or len(nxt) == len(remaining):
                    break
                remaining = nxt
    return n


def paint_mouth(im):
    """Boca con abertura y labio, bajo el visor, en la cara. No toca el cuerpo."""
    head = mask_component(im)
    if len(head) < 40:
        return False
    eye = find_eye(im, head)
    if not eye:
        return False
    if has_mouth(im, eye):
        return True
    clear_old_stamp(im, eye)
    face = set(face_pixels(im, eye))
    if len(face) < 12:
        return False
    px = im.load()
    w, h = im.size
    ey = max(p[1] for p in eye)
    ex = max(p[0] for p in eye)
    best = None
    for dy in range(1, 7):
        y = ey + dy
        for shift in range(-2, 4):
            x0 = ex - 4 + shift
            score = 0
            ok = True
            lip = 0
            opening = 0
            for row, colors in enumerate(PATTERN):
                for col, color in enumerate(colors):
                    x, yy = x0 + col, y + row
                    if not (0 <= x < w and 0 <= yy < h):
                        ok = False
                        break
                    here = px[x, yy][:3]
                    if here not in PAINT_ON and (x, yy) not in face:
                        # el perfil negro de la cara sí; el fondo no
                        if here == INK or px[x, yy][3] == 0 and color == INK:
                            score += 1
                        else:
                            ok = False
                            break
                    else:
                        if here == VISOR or here == (16, 72, 80):
                            ok = False
                            break
                        score += 3 if color != INK else 1
                        if row == 2 and color != INK:
                            lip += 1
                        if row == 1 and color == MOUTH:
                            opening += 1
                if not ok:
                    break
            if not ok or lip < 3 or opening < 2:
                continue
            # Un pixel de aire entre el visor y la boca, si se puede.
            gap = 1 if dy >= 2 else 0
            rank = (score + gap, -abs(shift), -abs(dy - 2))
            if best is None or rank > best[0]:
                best = (rank, x0, y, score)
    if best is None:
        return False
    _, x0, y, score = best
    for row, colors in enumerate(PATTERN):
        for col, color in enumerate(colors):
            x, yy = x0 + col, y + row
            here = px[x, yy]
            if here[3] == 0 and color != INK:
                continue
            if here[:3] == VISOR or here[:3] == (16, 72, 80):
                continue
            if here[:3] not in PAINT_ON and here[:3] != INK and (x, yy) not in face:
                if here[3] == 0 and color == INK:
                    px[x, yy] = INK + (255,)
                continue
            px[x, yy] = color + (255,)
    return True


def main():
    for path in sorted(NEW.glob('[0-9][0-9]_*.png')):
        im = Image.open(path).convert('RGBA')
        filled = 0
        for _ in range(4):
            n = fill_holes(im)
            filled += n
            if n == 0:
                break
        bites = fill_head_bites(im)
        ok = paint_mouth(im)
        im.save(path)
        print(path.name, 'huecos', filled, 'bocado', bites, 'boca', ok)


if __name__ == '__main__':
    main()
