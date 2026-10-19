#!/usr/bin/env python3
"""Idle nuevo a partir de voltia/sf2/idle_0.png.

No regenera el diseño. Mueve el frame entero, aplasta sin abrir huecos
y, en el calentamiento, pega los puños recortados del propio frame.
Si un frame se parte en más de una pieza, no se guarda.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'tools' / 'pylibs'))
from PIL import Image, ImageDraw

MASTER = ROOT / 'sf2' / 'idle_0.png'
OUT = ROOT / 'canon'
INK = (0, 0, 0, 255)
NAVY = (16, 18, 46, 255)
NAVY_HI = (30, 34, 78, 255)
SKIN = (236, 184, 142, 255)
SKIN_MID = (200, 132, 92, 255)
SKIN_DK = (148, 88, 60, 255)
TEAL_DK = (8, 72, 80, 255)

CW, CH = 112, 150
BASE = 138


def components(im):
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][3] == 0:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            comps.append(comp)
    return comps


def assert_one(im, name):
    comps = components(im)
    comps = [c for c in comps if len(c) >= 8]
    if len(comps) != 1:
        raise SystemExit(f'{name}: {len(comps)} piezas, no se entrega')


def is_front_arm(x, y):
    """Brazo adelantado, el de la guardia. No incluye el rayo ni el pecho."""
    if 26 <= y <= 54 and x >= 62:
        return True
    if 34 <= y <= 50 and x >= 54:
        return True
    return False


def is_rear_arm(x, y):
    """Brazo de atrás: la carne que sale por la espalda, no el torso teal."""
    return 28 <= x <= 42 and 34 <= y <= 56


def is_fist(x, y):
    return 74 <= x <= 88 and 26 <= y <= 44


def crop_pred(im, pred):
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and pred(x, y):
                xs.append(x)
                ys.append(y)
    box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    stamp = Image.new('RGBA', (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
    sp = stamp.load()
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            if px[x, y][3] and pred(x, y):
                sp[x - box[0], y - box[1]] = px[x, y]
    return stamp


def erase(im, pred):
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and pred(x, y):
                px[x, y] = (0, 0, 0, 0)
    return out


def shift_upper(im, drop, cut):
    """Baja el cuerpo y lo solapa con las piernas. Los pies no se mueven. Sin hueco."""
    w, h = im.size
    out = Image.new('RGBA', (w, h + drop), (0, 0, 0, 0))
    sp, dp = im.load(), out.load()
    for y in range(cut, h):
        for x in range(w):
            if sp[x, y][3]:
                dp[x, y] = sp[x, y]
    for y in range(cut):
        for x in range(w):
            if sp[x, y][3]:
                dp[x, y + drop] = sp[x, y]
    bb = out.getbbox()
    return out.crop((0, 0, w, bb[3]))


def stretch_chest(im, rise, cut=62):
    """Sube el torso `rise` px y repite las filas del corte para no abrir la cintura."""
    w, h = im.size
    out = Image.new('RGBA', (w, h + rise), (0, 0, 0, 0))
    sp, dp = im.load(), out.load()
    for y in range(cut, h):
        for x in range(w):
            if sp[x, y][3]:
                dp[x, y + rise] = sp[x, y]
    for y in range(cut):
        for x in range(w):
            if sp[x, y][3]:
                dp[x, y] = sp[x, y]
    # el hueco queda en y = cut .. cut+rise-1. Se rellena con la fila de encima del corte.
    for extra in range(rise):
        for x in range(w):
            c = sp[x, cut - 1]
            if c[3] and dp[x, cut + extra][3] == 0:
                dp[x, cut + extra] = c
    bb = out.getbbox()
    return out.crop((0, 0, w, bb[3]))


def brush(px, w, h, x, y, color, rad):
    r2 = rad * rad + max(0, rad - 1)
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            if dx * dx + dy * dy <= r2:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    px[nx, ny] = color


def stroke(px, w, h, a, b, color, rad):
    x0, y0 = a
    x1, y1 = b
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        brush(px, w, h, x0 + (x1 - x0) * i // steps, y0 + (y1 - y0) * i // steps, color, rad)


def connect(im, joints):
    """El primer punto está dentro del torso, así el brazo no nace en el aire."""
    px = im.load()
    w, h = im.size
    stroke(px, w, h, joints[0], joints[1], INK, 4)
    if len(joints) > 2:
        stroke(px, w, h, joints[1], joints[2], INK, 4)
    stroke(px, w, h, joints[0], joints[1], SKIN_DK, 2)
    stroke(px, w, h, joints[0], joints[1], SKIN, 1)
    if len(joints) > 2:
        stroke(px, w, h, joints[1], joints[2], NAVY, 2)
        stroke(px, w, h, joints[1], joints[2], NAVY_HI, 1)


def paste_stamp(dst, stamp, at):
    """`at` es la esquina superior izquierda."""
    dp = dst.load()
    sp = stamp.load()
    sw, sh = stamp.size
    dw, dh = dst.size
    x0, y0 = at
    for y in range(sh):
        for x in range(sw):
            c = sp[x, y]
            if c[3] == 0:
                continue
            nx, ny = x0 + x, y0 + y
            if 0 <= nx < dw and 0 <= ny < dh:
                dp[nx, ny] = c


def body_without_arms(src):
    im = erase(src, lambda x, y: is_front_arm(x, y) or is_rear_arm(x, y))
    px = im.load()
    w, h = im.size
    # Cierra los bocados con carne y teal del propio traje, antes de poner el brazo nuevo.
    # Solo tapa el bocado. El brazo nuevo lo cubre: no añadir un muñón aparte.
    brush(px, w, h, 48, 41, TEAL_DK, 2)
    brush(px, w, h, 38, 44, TEAL_DK, 2)
    return im


def turn_fist(fist, turns):
    out = fist
    for _ in range(turns % 4):
        out = out.transpose(Image.ROTATE_270)
    return out


def with_arms(src, fist, front_at, rear_at, front_joints, rear_joints, turns=1):
    im = body_without_arms(src)
    glove = turn_fist(fist, turns)
    connect(im, front_joints)
    connect(im, rear_joints)
    px = im.load()
    w, h = im.size
    # Funde el arranque del brazo con el hombro que quedó. Si no, se ve un corte.
    brush(px, w, h, front_joints[0][0], front_joints[0][1], SKIN, 3)
    brush(px, w, h, front_joints[0][0] + 2, front_joints[0][1] + 1, SKIN_MID, 2)
    brush(px, w, h, rear_joints[0][0], rear_joints[0][1], SKIN_MID, 3)
    brush(px, w, h, rear_joints[0][0] - 1, rear_joints[0][1] + 1, SKIN, 2)
    paste_stamp(im, glove, front_at)
    paste_stamp(im, glove, rear_at)
    return im


def place(im, lift=0):
    bb = im.getbbox()
    cropped = im.crop(bb)
    dst = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    ox = (CW - cropped.size[0]) // 2
    oy = BASE - (bb[3] - 1) + bb[1] - lift
    # bb[3]-1 es la última fila opaca en el original; al recortar, el pie queda al fondo del crop.
    oy = BASE - (cropped.size[1] - 1) - lift
    dst.alpha_composite(cropped, (ox, oy))
    return dst


def build():
    src = Image.open(MASTER).convert('RGBA')
    fist = crop_pred(src, is_fist)
    fist.save(OUT / '_stamp_fist.png')

    # El puño mide ~15x19. `at` es su esquina. El último joint entra en ese puño.
    # El brazo sale del hombro hacia fuera, no atraviesa el rayo.
    # turns=1 gira el puño para que el guante mire al muslo.
    poses = {
        'mid': dict(
            front_at=(58, 40), rear_at=(16, 46), turns=0,
            front_j=[(48, 40), (64, 42), (66, 50)],
            rear_j=[(36, 44), (22, 48), (22, 54)],
        ),
        'low': dict(
            front_at=(54, 56), rear_at=(16, 62), turns=1,
            front_j=[(48, 40), (64, 50), (60, 62)],
            rear_j=[(36, 44), (22, 56), (22, 68)],
        ),
        'on': dict(
            front_at=(48, 68), rear_at=(18, 74), turns=1,
            front_j=[(48, 40), (62, 56), (54, 72)],
            rear_j=[(36, 44), (22, 60), (24, 78)],
        ),
        'in': dict(
            front_at=(44, 70), rear_at=(20, 76), turns=1,
            front_j=[(48, 40), (58, 58), (50, 74)],
            rear_j=[(36, 44), (24, 62), (26, 80)],
        ),
        'out': dict(
            front_at=(56, 60), rear_at=(14, 66), turns=1,
            front_j=[(48, 40), (68, 52), (62, 64)],
            rear_j=[(36, 44), (18, 54), (20, 70)],
        ),
    }

    frames = []

    def add(name, key, caption, im, lift=0):
        placed = place(im, lift=lift)
        assert_one(placed, name)
        frames.append((name, key, caption, placed))

    add('00_stand', 'stand', 'de pie', src)
    add('01_breath_in', '', 'inspira', stretch_chest(src, 2))
    add('02_breath_hold', '', 'aguanta', stretch_chest(src, 3))
    add('03_breath_out', '', 'suelta', stretch_chest(src, 1))
    add('04_squash', 'squash', 'se agacha', shift_upper(src, 6, 100))
    add('05_hop1', '', 'saltito', src, lift=7)
    add('06_hop1_peak', 'hop', 'arriba', src, lift=12)
    add('07_hop1_down', '', 'cae', src, lift=5)
    add('08_land', '', 'pisa', shift_upper(src, 7, 102))
    add('09_squash2', '', 'otra vez', shift_upper(src, 4, 100))
    add('10_hop2', '', 'segundo', src, lift=9)
    add('11_hop2_land', '', 'pisa', shift_upper(src, 5, 100))

    def armed(pose):
        p = poses[pose]
        return with_arms(src, fist, p['front_at'], p['rear_at'], p['front_j'], p['rear_j'], p['turns'])

    add('12_arms_mid', '', 'baja las manos', armed('mid'))
    add('13_arms_low', '', 'hacia los muslos', armed('low'))
    add('14_thighs', 'thighs', 'manos en los muslos', armed('on'))
    add('15_slap', '', 'se sacude', shift_upper(armed('in'), 2, 108))
    add('16_rebound', '', 'rebotan', armed('out'))
    add('17_slap2', '', 'otra sacudida', shift_upper(armed('in'), 2, 108))
    add('18_arms_back', '', 'vuelve a la guardia', armed('low'))

    OUT.mkdir(parents=True, exist_ok=True)
    for name, key, caption, im in frames:
        im.save(OUT / f'{name}.png')
    return frames


def contact(frames):
    scale = 3
    cols = 5
    rows = (len(frames) + cols - 1) // cols
    pad = 6
    cell_w = CW * scale + pad
    cell_h = CH * scale + 16
    sheet = Image.new('RGB', (cols * cell_w + pad, rows * cell_h + pad), (24, 22, 36))
    dr = ImageDraw.Draw(sheet)
    for i, (name, key, caption, im) in enumerate(frames):
        r, c = divmod(i, cols)
        x = pad + c * cell_w
        y = pad + r * cell_h
        dr.text((x, y), f'{i} {caption}' + (' · clave' if key else ''), fill=(255, 203, 61))
        big = im.resize((CW * scale, CH * scale), Image.NEAREST)
        # línea de suelo
        dr.line((x, y + 14 + BASE * scale, x + CW * scale, y + 14 + BASE * scale), fill=(80, 70, 50))
        sheet.paste(big, (x, y + 14), big)
    path = OUT / '_preview.png'
    sheet.save(path)
    print(path, sheet.size, 'frames', len(frames))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    contact(build())
