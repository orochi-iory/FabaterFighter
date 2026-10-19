#!/usr/bin/env python3
"""Recorta las tiras verdes y las deja en la paleta del de pie.

El fondo se mide en el borde de cada imagen. No se usa rosa. Un píxel
se borra solo si está más cerca de ese verde que de la paleta. La máscara
rosa está en la paleta y lejos del verde, así no se come.
"""
import sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'tools' / 'pylibs'))
from PIL import Image, ImageDraw

NEW = ROOT / 'nueva'
S = 8
TARGET_H = 120
CANVAS_W, CANVAS_H, BASE = 128, 156, 146


def dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def border_key(im):
    px = im.load()
    w, h = im.size
    cols = Counter()
    for x in range(w):
        cols[px[x, 0]] += 1
        cols[px[x, h - 1]] += 1
    for y in range(h):
        cols[px[0, y]] += 1
        cols[px[w - 1, y]] += 1
    return cols.most_common(1)[0][0]


def is_bg(c, key):
    if dist2(c, key) < 70 * 70:
        return True
    # verde brillante, no el teal del visor (ese tiene azul alto)
    return c[1] > 170 and c[1] > c[0] + 70 and c[1] > c[2] + 70 and c[0] < 90


def majority(im, key):
    w, h = im.size
    px = im.load()
    nw, nh = w // S, h // S
    out = Image.new('RGBA', (nw, nh), (0, 0, 0, 0))
    op = out.load()
    for by in range(nh):
        for bx in range(nw):
            cols = Counter()
            for dy in range(S):
                for dx in range(S):
                    c = px[bx * S + dx, by * S + dy]
                    if is_bg(c, key):
                        continue
                    q = (c[0] // 8 * 8, c[1] // 8 * 8, c[2] // 8 * 8)
                    cols[q] += 1
            if not cols:
                continue
            color, n = cols.most_common(1)[0]
            if n >= (S * S) // 3:
                op[bx, by] = color + (255,)
    bb = out.getbbox()
    if not bb:
        raise SystemExit('frame vacío')
    return out.crop(bb)


def build_palette(stand):
    cols = Counter(c[:3] for c in stand.getdata() if c[3])
    # junta tintas cercanas
    seeds = []
    for color, n in cols.most_common():
        if n < 8:
            continue
        if any(dist2(color, s) < 28 * 28 for s in seeds):
            continue
        seeds.append(color)
    if len(seeds) > 22:
        seeds = seeds[:22]
    return seeds


def nearest(c, palette):
    return min(palette, key=lambda p: dist2(c, p))


def snap_palette(im, palette, key):
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sp, dp = im.load(), out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            c = sp[x, y]
            if c[3] == 0:
                continue
            ink = nearest(c[:3], palette)
            if dist2(c[:3], key) < dist2(c[:3], ink):
                continue
            dp[x, y] = ink + (255,)
    return out


def scale_to(im, height):
    if im.size[1] == height:
        return im
    w = max(1, round(im.size[0] * height / im.size[1]))
    return im.resize((w, height), Image.NEAREST)


def drop_specks(im, min_px=12):
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
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
            if len(comp) < min_px:
                for cx, cy in comp:
                    px[cx, cy] = (0, 0, 0, 0)


def components(im, min_px=12):
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    n = 0
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][3] == 0:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            count = 0
            while stack:
                cx, cy = stack.pop()
                count += 1
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if count >= min_px:
                n += 1
    return n


def mask_blob(im):
    w, h = im.size
    px = im.load()

    def is_mask(c):
        r, g, b = c[:3]
        return r > 120 and b > 40 and r > g + 40 and r > b

    seen = [[False] * w for _ in range(h)]
    best = 0
    for y in range(h):
        for x in range(w):
            if seen[y][x] or not is_mask(px[x, y]):
                continue
            stack = [(x, y)]
            seen[y][x] = True
            count = 0
            while stack:
                cx, cy = stack.pop()
                count += 1
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_mask(px[nx, ny]):
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            best = max(best, count)
    return best


def place(im, lift=0):
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    bb = im.getbbox()
    crop = im.crop(bb)
    ox = (CANVAS_W - crop.size[0]) // 2
    oy = BASE - crop.size[1] - lift
    if oy < 0:
        oy = 0
    canvas.alpha_composite(crop, (ox, oy))
    return canvas


def load_snapped(path, palette):
    raw = Image.open(path).convert('RGB')
    key = border_key(raw)
    maj = majority(raw, key)
    snapped = snap_palette(maj, palette, key)
    snapped = scale_to(snapped, TARGET_H)
    return snapped, key


def main():
    stand_raw = Image.open(NEW / '_gen_stand.png').convert('RGB')
    key = border_key(stand_raw)
    stand_maj = majority(stand_raw, key)
    palette = build_palette(stand_maj)
    # el verde de recorte no puede colarse en la paleta
    palette = [c for c in palette if dist2(c, key) > 90 * 90]
    stand = scale_to(snap_palette(stand_maj, palette, key), TARGET_H)
    print('key', key, 'palette', len(palette), 'stand', stand.size, 'mask', mask_blob(stand))

    sources = {
        'stand': stand,
        'hop': None,
        'down': NEW / '_gen_down.png',
        'thigh': NEW / '_gen_thigh.png',
        'knee': NEW / '_gen_knee.png',
        'shin': NEW / '_gen_shin.png',
        'back': NEW / '_gen_return.png',
        'crouch': NEW / '_gen_crouch.png',
        'tuck': NEW / '_gen_squash.png',
    }
    drawn = {'stand': stand}
    for name, path in sources.items():
        if name == 'stand' or path is None or not Path(path).exists():
            continue
        im, k = load_snapped(path, palette)
        drawn[name] = im
        print(name, im.size, 'mask', mask_blob(im), 'parts', components(im), 'key', k)

    # 20 pasos. El salto reutiliza el frame entero, más alto. No se recorta una parte.
    order = [
        ('00_stand', 'stand', 'de pie', 'stand', 0),
        ('01_hop1', '', 'saltito', 'stand', 6),
        ('02_hop1_peak', 'hop', 'arriba', 'tuck', 8),
        ('03_hop1_down', '', 'cae', 'stand', 3),
        ('04_land', '', 'pisa', 'stand', 0),
        ('05_hop2', '', 'segundo', 'stand', 5),
        ('06_hop2_peak', '', 'arriba', 'tuck', 5),
        ('07_hop2_down', '', 'cae', 'stand', 2),
        ('08_land2', '', 'pisa', 'stand', 0),
        ('09_hands_down', '', 'baja las manos', 'down', 0),
        ('10_to_thigh', '', 'a los muslos', 'thigh', 0),
        ('11_stroke_high', 'groom', 'se atusa', 'thigh', 0),
        ('12_stroke_mid', '', 'baja por la pierna', 'knee', 0),
        ('13_stroke_low', '', 'hasta la caña', 'shin', 0),
        ('14_stroke_hold', '', 'sigue', 'shin', 0),
        ('15_stroke_up', '', 'sube la mano', 'knee', 0),
        ('16_stroke_2', '', 'otra pasada', 'thigh', 0),
        ('17_stroke_mid2', '', 'baja otra vez', 'knee', 0),
        ('18_return', '', 'vuelve', 'back', 0),
        ('19_stand', '', 'de pie', 'stand', 0),
    ]
    frames = []
    for name, key_id, caption, src, lift in order:
        if src not in drawn:
            raise SystemExit(f'falta {src} para {name}')
        placed = place(drawn[src], lift)
        drop_specks(placed)
        parts = components(placed)
        mask = mask_blob(placed)
        if parts != 1:
            print('AVISO', name, 'piezas', parts)
        if mask < 20:
            raise SystemExit(f'{name}: máscara comida ({mask})')
        placed.save(NEW / f'{name}.png')
        frames.append((name, key_id, caption, placed))
        print('ok', name, 'mask', mask, 'parts', parts)

    scale = 2
    cols = 5
    pad = 4
    cell_w = CANVAS_W * scale + pad
    cell_h = CANVAS_H * scale + 14
    rows = 4
    sheet = Image.new('RGB', (cols * cell_w + pad, rows * cell_h + pad), (24, 22, 36))
    dr = ImageDraw.Draw(sheet)
    for i, (name, key_id, caption, im) in enumerate(frames):
        r, c = divmod(i, cols)
        x = pad + c * cell_w
        y = pad + r * cell_h
        dr.text((x, y), f'{i} {caption}', fill=(255, 203, 61))
        big = im.resize((CANVAS_W * scale, CANVAS_H * scale), Image.NEAREST)
        sheet.paste(big, (x, y + 12), big)
    sheet.save(NEW / '_preview.png')
    print('preview', sheet.size)


if __name__ == '__main__':
    main()
