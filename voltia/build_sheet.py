#!/usr/bin/env python3
"""Ensambla el tilesheet de VOLTIA a partir de tiras PNG generadas por IA.

Pipeline:
  1. Lee voltia/raw/<id>.png (tira horizontal sobre fondo magenta plano).
  2. Elimina el fondo (chroma magenta + floodfill desde los bordes) -> canal alfa.
  3. Detecta frames por columnas vacias (con fallback a division equitativa).
  4. Guarda frames con transparencia en voltia/frames/.
  5. Genera:
     - voltia/sheet.png          (estilo hoja Ryu: secciones etiquetadas)
     - voltia/sheet_uniform.png  + voltia/sheet.json (cuadricula uniforme + metadatos)
     - voltia/preview.png        (contacto: primer frame de cada animacion)
     - voltia/raw_contact.png    (control de calidad de las tiras)

Uso:
    python3 voltia/build_sheet.py
"""
import json
import os
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
FRAMES = os.path.join(HERE, "frames")

# (id, etiqueta, fps, loop, frames esperados)
SECTIONS = [
    ("idle", "Idle", 6, True, 4),
    ("walk", "Walking", 10, True, 6),
    ("jump", "Jump", 9, False, 4),
    ("fwdjump", "Forward Jump", 9, False, 4),
    ("crouch", "Crouch", 8, True, 3),
    ("block", "Blocking", 8, True, 2),
    ("punch_l", "L. Punch", 12, False, 3),
    ("punch_mh", "M./H. Punch", 11, False, 4),
    ("kick_lm", "L./M. Kick", 11, False, 4),
    ("kick_h", "H. Kick", 10, False, 4),
    ("crouch_punch", "Crouch Punch", 11, False, 3),
    ("crouch_kick", "Crouch Kick", 10, False, 3),
    ("jump_kick", "Jump Kick", 10, False, 3),
    ("uppercut", "Volt Uppercut", 10, False, 5),
    ("spinkick", "Volt Spin", 12, False, 4),
    ("rayo_throw", "Rayo Volt", 10, False, 4),
    ("rayo_proj", "Rayo Volt (Projectile)", 12, True, 3),
    ("hit", "Hit", 8, False, 3),
    ("crouch_hit", "Crouch Hit", 8, False, 2),
    ("knockdown", "Knockdown/Recover", 7, False, 4),
    ("dizzy", "Stunned", 6, True, 2),
    ("ko", "K.O.", 5, False, 2),
    ("victory1", "Victory 1", 8, True, 4),
    ("victory2", "Victory 2", 8, True, 3),
    ("dash", "Dash", 14, True, 3),
]

BG = (109, 127, 146)      # gris-azulado estilo referencia
LINE = (255, 255, 255)
SIDEBAR = (43, 43, 158)   # azul oscuro lateral


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


# ---------------- Paso 1-2: recorte de fondo ----------------
def load_and_key(path, tol=70, feather=50):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    r, g, b = img.split()
    # Distancia al cuadrado al magenta, en espacio /255 (todo en C, rapido).
    # D ~= 0 -> fondo magenta -> transparente.
    solid = Image.new("L", (w, h), 255)
    dr = ImageChops.difference(r, solid)
    db = ImageChops.difference(b, solid)
    D = ImageChops.add(ImageChops.add(ImageChops.multiply(dr, dr),
                                       ImageChops.multiply(g, g)),
                       ImageChops.multiply(db, db))
    t0, t1 = (tol / 255) ** 2 * 255, ((tol + feather) / 255) ** 2 * 255
    lut = [0 if v <= t0 else (255 if v >= t1 else int(255 * (v - t0) / (t1 - t0)))
           for v in range(256)]
    alpha = D.point(lut)
    # Floodfill desde bordes: pilla degradados magenta que el chroma no ve
    flood = img.copy()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        try:
            ImageDraw.floodfill(flood, s, (0, 255, 0), thresh=60)
        except Exception:
            pass
    green = Image.new("RGB", (w, h), (0, 255, 0))
    mask_green = ImageChops.difference(flood, green).convert("L").point(
        lambda v: 0 if v < 10 else 255)
    alpha = ImageChops.darker(alpha, mask_green)
    rgba = img.convert("RGBA")
    rgba.putalpha(alpha)
    total = w * h
    fg_ratio = sum(alpha.tobytes()) / 255 / total
    if fg_ratio > 0.7 or fg_ratio < 0.005:
        print(f"  AVISO {os.path.basename(path)}: fg={fg_ratio:.2f}, revisar key")
    return rgba


# ---------------- Paso 3: deteccion de frames ----------------
def split_strip(img, expected):
    w, h = img.size
    alpha = img.split()[3]
    prof = list(alpha.resize((w, 1), Image.BILINEAR).tobytes())
    fg = [v > 10 for v in prof]
    try:
        first = fg.index(True)
        last = w - 1 - fg[::-1].index(True)
    except ValueError:
        return [img]  # tira vacia: devolver entera
    # Huecos de fondo entre la primera y ultima columna con contenido
    gaps, i = [], first
    while i <= last:
        if not fg[i]:
            j = i
            while j <= last and not fg[j]:
                j += 1
            if j - i >= 2:
                gaps.append((i, j, j - i))
            i = j
        else:
            i += 1
    # Cortar por los (expected-1) huecos mas anchos
    gaps.sort(key=lambda g: -g[2])
    cuts = sorted((a + b) // 2 for (a, b, _) in gaps[:max(0, expected - 1)])
    bounds = [first] + cuts + [last + 1]
    segs = [(bounds[k], bounds[k + 1] - 1) for k in range(len(bounds) - 1)]
    min_w = max(12, w // 60)
    segs = [(a, b) for (a, b) in segs if b - a >= min_w]
    if not segs:
        segs = [(first, last)]
    # Si faltan frames (figuras pegadas), anadir cortes en los valles de
    # alfa mas cercanos a una division equitativa ideal.
    if 0 < len(segs) < expected:
        span = last - first + 1
        rad = max(2, w // 400)
        acc = [0] * (w + 1)
        for x in range(w):
            acc[x + 1] = acc[x] + prof[x]

        def col_avg(x):
            a, b = max(0, x - rad), min(w - 1, x + rad)
            return (acc[b + 1] - acc[a]) / (b - a + 1)

        cuts_set = set(cuts)
        for k in range(1, expected):
            ideal = first + span * k / expected
            lo, hi = int(max(first, ideal - span * 0.12)), int(min(last, ideal + span * 0.12))
            best, bestv = None, None
            for x in range(lo, hi + 1):
                v = col_avg(x)
                if bestv is None or v < bestv:
                    bestv, best = v, x
            if best is not None and all(abs(best - c) >= min_w for c in cuts_set):
                cuts_set.add(best)
        bounds = [first] + sorted(cuts_set) + [last + 1]
        cand = [(bounds[k], bounds[k + 1] - 1) for k in range(len(bounds) - 1)]
        cand = [(a, b) for (a, b) in cand if b - a >= min_w]
        segs = cand[:expected] if len(cand) >= expected else cand
    frames = []
    for (a, b) in segs:
        a0, b0 = max(0, a - 4), min(w, b + 5)
        crop, acrop = img.crop((a0, 0, b0, h)), alpha.crop((a0, 0, b0, h))
        bbox = acrop.getbbox()
        if bbox:
            l, t, rr, bb = bbox
            pad = 3
            crop = crop.crop((max(0, l - pad), max(0, t - pad),
                              min(crop.width, rr + pad), min(crop.height, bb + pad)))
        frames.append(crop)
    return frames


def scale_h(img, th):
    if img.height == th:
        return img
    w = max(1, round(img.width * th / img.height))
    return img.resize((w, th), Image.LANCZOS)


def hue_shift(img, deg):
    h, s, v = img.convert("RGB").convert("HSV").split()
    h = h.point(lambda x: (x + int(deg / 360 * 255)) % 256)
    out = Image.merge("HSV", (h, s, v)).convert("RGB").convert("RGBA")
    out.putalpha(img.split()[3])
    return out


# ---------------- Paso 5a: hoja estilo referencia ----------------
DISPLAY_ROWS = [
    ["idle", "walk", "jump", "fwdjump", "crouch", "block"],
    ["punch_l", "punch_mh", "kick_lm", "kick_h"],
    ["crouch_punch", "crouch_kick", "jump_kick", "dash"],
    ["uppercut", "spinkick", "rayo_throw", "rayo_proj"],
    ["hit", "crouch_hit", "knockdown", "dizzy", "ko"],
    ["victory1", "victory2", "palettes", "mugshots"],
]

ROW_H, LABEL_H, FRAME_H = 210, 34, 168
SIDEBAR_W = 300


def build_reference_sheet(data, portraits, palette_frames):
    f_label, f_title, f_small = font(24), font(64), font(17)
    data = dict(data)
    data["palettes"] = ("Alternate Palettes", palette_frames)
    data["mugshots"] = ("Mugshots", portraits)

    rows = []
    for ids in DISPLAY_ROWS:
        secs = []
        for sid in ids:
            if sid not in data:
                continue
            label, frames = data[sid]
            thumbs = [scale_h(f, FRAME_H) for f in frames]
            w = sum(t.width for t in thumbs) + 12 * (len(thumbs) + 1)
            secs.append((label, thumbs, w))
        if secs:
            rows.append(secs)
    if not rows:
        raise SystemExit("Sin secciones disponibles para la hoja de referencia")
    sheet_w = max(sum(s[2] for s in secs) + 2 * (len(secs) + 1) for secs in rows)
    sheet_h = len(rows) * (ROW_H + 2) + 2
    W = sheet_w + SIDEBAR_W
    sheet = Image.new("RGB", (W, sheet_h), BG)
    d = ImageDraw.Draw(sheet)

    y = 2
    for secs in rows:
        x = 2
        d.line([(0, y - 2), (sheet_w, y - 2)], fill=LINE, width=2)
        for (label, thumbs, w) in secs:
            d.line([(x - 2, y), (x - 2, y + ROW_H)], fill=LINE, width=2)
            d.text((x + 10, y + 4), label, fill=LINE, font=f_label)
            fx = x + 12
            for t in thumbs:
                sheet.paste(t, (fx, y + LABEL_H + (FRAME_H - t.height) // 2 + 4), t)
                fx += t.width + 12
            x += w
        d.line([(x - 2, y), (x - 2, y + ROW_H)], fill=LINE, width=2)
        y += ROW_H + 2
    d.line([(0, y - 2), (sheet_w, y - 2)], fill=LINE, width=2)

    # Barra lateral
    d.rectangle([sheet_w, 0, W - 1, sheet_h - 1], fill=SIDEBAR)
    sx = sheet_w + 24
    d.text((sx, 18), "Voltia", fill=LINE, font=f_title)
    side = [
        "Original character for",
        "FabaterFighter.",
        "",
        "Sprites generated with AI,",
        "assembled with pixel keying.",
        "No rips, no Capcom assets.",
        "",
        "Cyber luchadora from the",
        "Neo Voltage circuit. Fights",
        "with electric grapples and",
        "the Rayo Volt projectile.",
    ]
    yy = 110
    for line in side:
        d.text((sx, yy), line, fill=LINE, font=f_small)
        yy += 22
    # Miniatura 1P
    hero = data.get("victory1", data.get("idle", next(iter(data.values()))))[1][0]
    thumb = scale_h(hero, 240)
    d.rectangle([sx - 4, yy + 10, sx + thumb.width + 4, yy + 250], fill=LINE)
    sheet.paste(thumb, (sx, yy + 14), thumb)
    d.text((sx, yy + 258), "Player 1", fill=LINE, font=f_label)
    return sheet


# ---------------- Paso 5b: hoja uniforme + JSON ----------------
UH = 200


def build_uniform_sheet(rendered):
    norm = {}
    for (sid, label, fps, loop, frames) in rendered:
        norm[sid] = [scale_h(f, UH) for f in frames]
    cell_w = max(f.width for fs in norm.values() for f in fs) + 14
    cell_h = UH + 14
    cols = max(len(fs) for fs in norm.values())
    rows = len(rendered)
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    meta = []
    for r, (sid, label, fps, loop, frames) in enumerate(rendered):
        for c, f in enumerate(norm[sid]):
            x = c * cell_w + (cell_w - f.width) // 2
            y = r * cell_h + (cell_h - f.height) - 7
            sheet.paste(f, (x, y), f)
        meta.append({"id": sid, "label": label, "row": r, "frames": len(frames),
                     "fps": fps, "loop": loop})
    js = {"sprite": "sheet_uniform.png", "cell": {"w": cell_w, "h": cell_h},
          "columns": cols, "rows": rows, "frame_dir": "frames", "animations": meta}
    return sheet, js


def build_preview(rendered):
    f_label = font(20)
    label_w = 260
    thumbs = [(label, scale_h(frames[0], 110)) for (_, label, _, _, frames) in rendered]
    W = label_w + max(t.width for (_, t) in thumbs) + 30
    H = sum(t.height + 14 for (_, t) in thumbs) + 70
    prev = Image.new("RGB", (W, H), (24, 22, 34))
    d = ImageDraw.Draw(prev)
    d.text((20, 16), "VOLTIA - primer frame por animacion", fill=(255, 203, 61), font=font(26))
    y = 66
    for (label, t) in thumbs:
        d.text((20, y + 40), label, fill=(150, 255, 235), font=f_label)
        prev.paste(t, (label_w, y), t)
        y += t.height + 14
    return prev


def main():
    os.makedirs(FRAMES, exist_ok=True)
    # Contacto de tiras crudas (control de calidad)
    raws = []
    for (sid, label, fps, loop, exp) in SECTIONS + [("portrait", "Mugshots", 0, False, 3)]:
        p = os.path.join(RAW, f"{sid}.png")
        if os.path.exists(p):
            raws.append((label, scale_h(Image.open(p).convert("RGB"), 130)))
    if raws:
        cw = max(t.width for (_, t) in raws) + 280
        ch = sum(t.height + 12 for (_, t) in raws) + 60
        contact = Image.new("RGB", (cw, ch), (40, 40, 55))
        dc = ImageDraw.Draw(contact)
        dc.text((20, 12), "RAW - tiras generadas por IA", fill=(255, 255, 255), font=font(26))
        y = 56
        for (label, t) in raws:
            dc.text((20, y + 50), label, fill=(255, 203, 61), font=font(20))
            contact.paste(t, (260, y))
            y += t.height + 12
        contact.save(os.path.join(HERE, "raw_contact.png"))

    rendered, data = [], {}
    for (sid, label, fps, loop, exp) in SECTIONS:
        p = os.path.join(RAW, f"{sid}.png")
        if not os.path.exists(p):
            print(f"  FALTA tira: {sid}.png (se omite)")
            continue
        frames = split_strip(load_and_key(p), exp)
        print(f"  {sid}: {len(frames)} frames (esperados {exp})")
        for i, f in enumerate(frames):
            f.save(os.path.join(FRAMES, f"voltia_{sid}_{i}.png"))
        rendered.append((sid, label, fps, loop, frames))
        data[sid] = (label, frames)

    portraits = []
    pp = os.path.join(RAW, "portrait.png")
    if os.path.exists(pp):
        portraits = split_strip(load_and_key(pp, tol=90, feather=60), 3)
        for i, f in enumerate(portraits):
            f.save(os.path.join(FRAMES, f"voltia_portrait_{i}.png"))

    palette_frames = []
    if "idle" in data:
        base = data["idle"][1][0]
        palette_frames = [base] + [hue_shift(base, d) for d in (60, 120, 180, 240)]
        for i, f in enumerate(palette_frames):
            f.save(os.path.join(FRAMES, f"voltia_palette_{i}.png"))

    if not rendered:
        print("Sin tiras: no se genera nada.")
        return
    build_reference_sheet(data, portraits, palette_frames).save(os.path.join(HERE, "sheet.png"))
    usheet, js = build_uniform_sheet(rendered)
    usheet.save(os.path.join(HERE, "sheet_uniform.png"))
    with open(os.path.join(HERE, "sheet.json"), "w", encoding="utf-8") as f:
        json.dump(js, f, ensure_ascii=False, indent=2)
    build_preview(rendered).save(os.path.join(HERE, "preview.png"))
    total = sum(len(fr) for (_, _, _, _, fr) in rendered)
    print(f"OK: {len(rendered)} animaciones, {total} frames + {len(portraits)} retratos")


if __name__ == "__main__":
    main()
