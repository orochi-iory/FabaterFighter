#!/usr/bin/env python3
"""Generador procedural del tilesheet de VOLTIA (FabaterFighter).

Dibuja pixel-art programatico (64x64 por frame, fondo transparente) con
12 animaciones de un juego de peleas. Todo determinista (sin random).

Uso:
    python3 tools/generate_spritesheet.py

Salidas:
    assets/voltia_spritesheet.png   (tilesheet 6 cols x 12 rows)
    assets/voltia_spritesheet.json  (metadata de animaciones)
    assets/voltia_preview.png       (vista previa etiquetada 2x)
    assets/frames/voltia_<anim>_<n>.png (frames individuales)
"""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFont

CELL = 64
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
FRAMES = os.path.join(ASSETS, "frames")

# ---------------- Paleta ----------------
OUTLINE = (26, 20, 35, 255)
SKIN = (245, 183, 135, 255)
MASK = (229, 56, 136, 255)
MASK_D = (163, 32, 96, 255)
CYAN = (64, 224, 255, 255)
SUIT = (23, 195, 178, 255)
SUIT_D = (10, 118, 138, 255)
NAVY = (38, 44, 80, 255)
NAVY_L = (92, 102, 158, 255)
BELT = (255, 203, 61, 255)
WHITE = (255, 255, 255, 255)
SPARK = (255, 236, 140, 255)
HAIR = (74, 36, 110, 255)
VOLT = (255, 214, 90, 255)


# ---------------- Utilidades de dibujo ----------------
def seg(d, a, b, w, fill, ol=OUTLINE, ow=2):
    if ow and ol:
        d.line([a, b], fill=ol, width=w + ow * 2, joint="curve")
    d.line([a, b], fill=fill, width=w, joint="curve")


def dot(d, c, r, fill, ol=OUTLINE, ow=2):
    x, y = c
    if ow and ol:
        d.ellipse([x - r - ow, y - r - ow, x + r + ow, y + r + ow], fill=ol)
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def bolt(d, pos, s, fill):
    """Rayo decorativo centrado en pos, altura ~2*s."""
    x, y = pos
    k = s / 6.0
    pts = [(x + 2 * k, y - 6 * k), (x - 3 * k, y + 1 * k), (x - 0.5 * k, y + 1 * k),
           (x - 2 * k, y + 6 * k), (x + 3 * k, y - 1 * k), (x + 0.5 * k, y - 1 * k)]
    d.polygon(pts, fill=fill, outline=OUTLINE, width=1)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_pose(a, b, t):
    out = {}
    for k in a:
        if k == "flat":
            out[k] = b.get("flat", False)
        elif k == "head_r":
            out[k] = a[k]
        else:
            va, vb = a[k], b.get(k, a[k])
            if isinstance(va, tuple):
                out[k] = (lerp(va[0], vb[0], t), lerp(va[1], vb[1], t))
            else:
                out[k] = lerp(va, vb, t)
    return out


def base_pose():
    return {
        "neck": (32, 24), "hip": (31, 38),
        "head": (33, 15), "head_r": 7,
        "elb_f": (38, 31), "hand_f": (43, 27),
        "elb_b": (26, 31), "hand_b": (27, 27),
        "knee_f": (36, 47), "foot_f": (39, 55),
        "knee_b": (26, 47), "foot_b": (25, 55),
        "tail": 0.0, "flat": False,
    }


# ---------------- Partes del personaje ----------------
def draw_boot(d, foot, back, flat):
    x, y = foot
    col = NAVY
    if flat:
        d.rectangle([x - 1, y - 4, x + 6, y + 4], fill=OUTLINE)
        d.rectangle([x, y - 3, x + 5, y + 3], fill=col)
        d.rectangle([x, y - 3, x + 2, y + 3], fill=NAVY_L)
    else:
        d.rectangle([x - 4, y - 5, x + 5, y + 1], fill=OUTLINE)
        d.rectangle([x - 3, y - 4, x + 4, y - 1], fill=col)
        d.rectangle([x - 3, y - 4, x + 0, y - 1], fill=NAVY_L)


def draw_glove(d, hand):
    dot(d, hand, 4, NAVY)
    x, y = hand
    d.ellipse([x - 2, y - 3, x + 1, y + 0], fill=NAVY_L)


def draw_ponytail(d, head, s, flat):
    hx, hy = head
    p0 = (hx - 5, hy - 3)
    if flat:
        p1 = (hx - 10, hy + 2 + s * 2)
        p2 = (hx - 15, hy + 1 + s * 3)
    else:
        p1 = (hx - 11 + s * 2, hy - 6 + s * 3)
        p2 = (hx - 15 + s * 4, hy - 2 + s * 5)
    seg(d, p0, p1, 4, HAIR)
    seg(d, p1, p2, 3, HAIR)
    dot(d, p0, 2, BELT, ow=1)


def draw_fighter(d, p):
    neck, hip = p["neck"], p["hip"]
    sh = (neck[0], neck[1] + 3)
    flat = p.get("flat", False)
    # Brazo trasero
    seg(d, sh, p["elb_b"], 5, SUIT_D)
    seg(d, p["elb_b"], p["hand_b"], 4, SUIT_D)
    draw_glove(d, p["hand_b"])
    # Pierna trasera
    seg(d, hip, p["knee_b"], 6, SUIT_D)
    seg(d, p["knee_b"], p["foot_b"], 5, SUIT_D)
    draw_boot(d, p["foot_b"], True, flat)
    # Torso
    seg(d, neck, hip, 10, SUIT)
    if flat:
        d.line([(neck[0] + 2, neck[1] - 4), (hip[0] - 2, hip[1] - 4)], fill=SUIT_D, width=2)
    else:
        d.line([(neck[0] - 4, neck[1] + 2), (hip[0] - 4, hip[1] - 2)], fill=SUIT_D, width=2)
    # Cinturon
    bx, by = hip
    if flat:
        d.line([(bx + 2, by - 7), (bx + 2, by + 7)], fill=OUTLINE, width=7)
        d.line([(bx + 2, by - 7), (bx + 2, by + 7)], fill=BELT, width=4)
        d.rectangle([bx - 1, by - 2, bx + 5, by + 2], fill=OUTLINE)
        d.rectangle([bx + 0, by - 1, bx + 4, by + 1], fill=SPARK)
    else:
        d.line([(bx - 7, by - 2), (bx + 7, by - 2)], fill=OUTLINE, width=7)
        d.line([(bx - 7, by - 2), (bx + 7, by - 2)], fill=BELT, width=4)
        d.rectangle([bx - 2, by - 5, bx + 2, by + 1], fill=OUTLINE)
        d.rectangle([bx - 1, by - 4, bx + 1, by + 0], fill=SPARK)
    # Emblema de rayo en el pecho
    cx = (neck[0] + hip[0]) / 2 + 1
    cy = (neck[1] + hip[1]) / 2 - 1
    bolt(d, (cx, cy), 5, BELT)
    # Pierna delantera
    seg(d, hip, p["knee_f"], 6, SUIT)
    seg(d, p["knee_f"], p["foot_f"], 5, SUIT)
    draw_boot(d, p["foot_f"], False, flat)
    # Cabeza
    hx, hy = p["head"]
    r = p["head_r"]
    draw_ponytail(d, (hx, hy), p.get("tail", 0), flat)
    dot(d, (hx, hy), r, MASK)
    if flat:  # cara hacia arriba (tumbada)
        d.ellipse([hx - 3, hy - 7, hx + 4, hy + 0], fill=SKIN)
        d.rectangle([hx - 1, hy - 6, hx + 2, hy - 3], fill=WHITE)
        d.rectangle([hx + 0, hy - 5, hx + 2, hy - 4], fill=OUTLINE)
        bolt(d, (hx - 4, hy + 2), 3, CYAN)
    else:  # cara al frente (derecha)
        d.ellipse([hx + 0, hy - 4, hx + 7, hy + 5], fill=SKIN)
        d.rectangle([hx + 3, hy - 2, hx + 6, hy + 1], fill=WHITE)
        d.rectangle([hx + 5, hy - 1, hx + 6, hy + 0], fill=OUTLINE)
        bolt(d, (hx - 4, hy - 5), 4, CYAN)
    # Brazo delantero
    seg(d, sh, p["elb_f"], 5, SUIT)
    seg(d, p["elb_f"], p["hand_f"], 4, SUIT)
    draw_glove(d, p["hand_f"])


# ---------------- Efectos ----------------
def star(d, c, r, fill=(255, 236, 140, 255)):
    x, y = c
    pts = []
    for i in range(16):
        ang = math.pi * i / 8
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((x + rr * math.cos(ang), y + rr * math.sin(ang)))
    d.polygon(pts, fill=fill)


def glow(d, c, r, color=(255, 220, 120), alpha=110):
    for i in range(4, 0, -1):
        rr = r * i / 4
        a = int(alpha * (1 - i / 5.5))
        d.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], fill=color + (a,))


def lightning(d, a, b, segs=5, amp=3, wcore=2, seed=0):
    pts = [a]
    for i in range(1, segs):
        t = i / segs
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + (b[1] - a[1]) * t
        off = math.sin(t * 9.1 + seed * 3.7) * amp
        pts.append((x, y + off))
    pts.append(b)
    d.line(pts, fill=(255, 170, 60, 255), width=wcore + 3, joint="curve")
    d.line(pts, fill=(255, 255, 255, 255), width=wcore, joint="curve")


def dust(d, positions):
    for (x, y, r) in positions:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(200, 200, 210, 160))


def sparkle(d, c, r, fill=(255, 255, 255, 255)):
    x, y = c
    d.polygon([(x, y - r), (x + r * 0.3, y - r * 0.3), (x + r, y),
               (x + r * 0.3, y + r * 0.3), (x, y + r),
               (x - r * 0.3, y + r * 0.3), (x - r, y), (x - r * 0.3, y - r * 0.3)], fill=fill)


def silhouette(img, color=(64, 224, 255), alpha=90):
    a = img.split()[3].point(lambda v: alpha if v > 10 else 0)
    sil = Image.new("RGBA", img.size, color + (0,))
    sil.putalpha(a)
    return sil


def apply_fx(img, fx):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for (pos, r) in fx.get("glows", []):
        glow(d, pos, r)
    for (pos, r) in fx.get("balls", []):
        glow(d, pos, r + 6)
        dot(d, pos, r, VOLT, ol=None, ow=0)
        dot(d, pos, max(2, r - 2), WHITE, ol=None, ow=0)
    for (a, b, seed) in fx.get("trails", []):
        lightning(d, a, b, seed=seed)
    for (pos, r) in fx.get("stars", []):
        star(d, pos, r)
        star(d, pos, max(2, r // 2), fill=WHITE)
    for ln in fx.get("lines", []):
        d.line(ln[:2], fill=ln[2] if len(ln) > 2 else WHITE, width=ln[3] if len(ln) > 3 else 2)
    for (box, s, e, col, w) in fx.get("arcs", []):
        d.arc(box, s, e, fill=col, width=w)
    if fx.get("dust"):
        dust(d, fx["dust"])
    for pos in fx.get("sparkles", []):
        sparkle(d, pos, 4)
    if fx.get("speed"):
        for (y, x0, x1) in [(20, 4, 22), (28, 2, 18), (36, 4, 24), (44, 8, 22)]:
            d.line([(x0, y), (x1, y)], fill=(160, 240, 255, 200), width=2)
    if fx.get("dizzy"):
        for i, ang in enumerate([0.3, 2.4, 4.4]):
            sx = 17 + 11 * math.cos(ang)
            sy = 40 + 4 * math.sin(ang)
            sparkle(d, (sx, sy), 3, fill=SPARK)
        d.arc([6, 34, 28, 46], 200, 340, fill=SPARK[:3] + (220,), width=2)
    return Image.alpha_composite(img, layer)


def render_frame(pose, fx):
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if fx.get("after"):
        tmp = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        draw_fighter(ImageDraw.Draw(tmp), pose)
        for (dx, alpha) in fx["after"]:
            sil = silhouette(tmp, alpha=alpha)
            layer = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            layer.paste(sil, (dx, 0), sil)
            img = Image.alpha_composite(img, layer)
    draw_fighter(ImageDraw.Draw(img), pose)
    img = apply_fx(img, fx)
    return img


# ---------------- Animaciones ----------------
def anim_idle():
    out = []
    for i, b in enumerate([0, 1, 0, -1]):
        p = base_pose()
        for k in ("neck", "hip", "head", "hand_f", "hand_b", "elb_f", "elb_b"):
            x, y = p[k]
            p[k] = (x, y + b)
        p["tail"] = [0, 0.6, 0, -0.6][i]
        out.append((p, {}))
    return out


def anim_walk():
    out = []
    for i in range(6):
        ph = i / 6 * 2 * math.pi
        s, c = math.sin(ph), math.cos(ph)
        p = base_pose()
        lift_f = 3 * max(0, c)
        lift_b = 3 * max(0, -c)
        p["foot_f"] = (32 + 8 * s, 55 - lift_f)
        p["foot_b"] = (32 - 8 * s, 55 - lift_b)
        p["knee_f"] = ((31 + p["foot_f"][0]) / 2 + 2, 47 - lift_f / 2)
        p["knee_b"] = ((31 + p["foot_b"][0]) / 2 + 2, 47 - lift_b / 2)
        bob = -abs(s) * 1.0
        for k in ("neck", "hip", "head"):
            x, y = p[k]
            p[k] = (x, y + bob)
        p["hand_f"] = (43 - 5 * s, 28)
        p["elb_f"] = (38 - 3 * s, 31)
        p["hand_b"] = (27 + 5 * s, 28)
        p["elb_b"] = (26 + 3 * s, 31)
        p["tail"] = -s
        out.append((p, {}))
    return out


def anim_jump():
    crouch = base_pose()
    for k, v in {"hip": (31, 42), "neck": (32, 28), "head": (33, 19),
                 "hand_f": (40, 34), "elb_f": (38, 34), "hand_b": (26, 34), "elb_b": (26, 34),
                 "knee_f": (38, 49), "foot_f": (39, 55), "knee_b": (24, 49), "foot_b": (25, 55)}.items():
        crouch[k] = v
    rise = base_pose()
    for k, v in {"hip": (31, 32), "neck": (32, 18), "head": (33, 9),
                 "hand_f": (42, 15), "elb_f": (39, 19), "hand_b": (24, 17), "elb_b": (26, 21),
                 "knee_f": (38, 39), "foot_f": (40, 47), "knee_b": (27, 40), "foot_b": (26, 48)}.items():
        rise[k] = v
    air = base_pose()
    for k, v in {"hip": (31, 31), "neck": (32, 17), "head": (33, 9),
                 "hand_f": (46, 20), "elb_f": (40, 21), "hand_b": (20, 20), "elb_b": (25, 21),
                 "knee_f": (39, 38), "foot_f": (41, 46), "knee_b": (26, 39), "foot_b": (25, 47)}.items():
        air[k] = v
    land = lerp_pose(base_pose(), crouch, 1.0)
    return [
        (crouch, {}),
        (rise, {}),
        (air, {}),
        (land, {"dust": [(33, 57, 4), (45, 58, 3), (21, 58, 3)]}),
    ]


def anim_crouch():
    full = base_pose()
    for k, v in {"hip": (30, 46), "neck": (31, 32), "head": (33, 23),
                 "hand_f": (44, 34), "elb_f": (40, 36), "hand_b": (26, 34), "elb_b": (25, 36),
                 "knee_f": (41, 50), "foot_f": (42, 55), "knee_b": (21, 50), "foot_b": (20, 55)}.items():
        full[k] = v
    return [
        (lerp_pose(base_pose(), full, 0.5), {}),
        (full, {}),
        (full, {}),
    ]


def anim_punch():
    f0 = base_pose()
    f1 = base_pose()
    f1["hand_f"] = (39, 28)
    f1["elb_f"] = (35, 30)
    f1["hip"] = (30, 38)
    f2 = base_pose()
    for k, v in {"hip": (32, 38), "neck": (33, 24), "head": (34, 15),
                 "hand_f": (55, 26), "elb_f": (45, 27),
                 "knee_f": (37, 47), "foot_f": (40, 55),
                 "knee_b": (28, 47), "foot_b": (27, 55)}.items():
        f2[k] = v
    fx2 = {"stars": [((59, 26), 5)],
           "lines": [((50, 20), (56, 16), WHITE, 2), ((50, 32), (56, 36), WHITE, 2)]}
    f3 = lerp_pose(f2, base_pose(), 0.6)
    return [(f0, {}), (f1, {}), (f2, fx2), (f3, {})]


def anim_kick():
    f0 = base_pose()
    f1 = base_pose()
    for k, v in {"hip": (30, 38), "knee_f": (42, 35), "foot_f": (38, 44),
                 "hand_f": (42, 28), "hand_b": (26, 28)}.items():
        f1[k] = v
    f2 = base_pose()
    for k, v in {"hip": (29, 38), "neck": (30, 24), "head": (31, 15),
                 "knee_f": (45, 30), "foot_f": (57, 20),
                 "knee_b": (27, 47), "foot_b": (25, 55),
                 "hand_f": (36, 30), "elb_f": (33, 30),
                 "hand_b": (20, 28), "elb_b": (24, 29)}.items():
        f2[k] = v
    fx2 = {"stars": [((59, 19), 5)],
           "arcs": [((8, -2, 62, 52), 300, 20, (255, 255, 255, 230), 2)]}
    f3 = lerp_pose(f2, base_pose(), 0.25)
    f4 = lerp_pose(f2, base_pose(), 0.7)
    return [(f0, {}), (f1, {}), (f2, fx2), (f3, {}), (f4, {})]


def anim_special():
    charge = base_pose()
    for k, v in {"hip": (30, 40), "neck": (31, 26), "head": (32, 17),
                 "hand_f": (44, 30), "elb_f": (39, 31),
                 "hand_b": (42, 33), "elb_b": (37, 33),
                 "knee_f": (37, 48), "foot_f": (40, 55),
                 "knee_b": (25, 48), "foot_b": (24, 55)}.items():
        charge[k] = v
    thrust = base_pose()
    for k, v in {"hip": (32, 38), "neck": (34, 24), "head": (35, 15),
                 "hand_f": (50, 28), "elb_f": (44, 28),
                 "hand_b": (48, 32), "elb_b": (42, 31),
                 "knee_f": (37, 47), "foot_f": (41, 55),
                 "knee_b": (27, 47), "foot_b": (26, 55)}.items():
        thrust[k] = v
    follow = lerp_pose(thrust, base_pose(), 0.35)
    return [
        (charge, {"glows": [((46, 30), 6)]}),
        (charge, {"glows": [((46, 30), 10)],
                  "trails": [((40, 24), (50, 30), 1), ((40, 36), (50, 30), 2)]}),
        (thrust, {"balls": [((57, 28), 5)], "trails": [((50, 28), (55, 28), 3)]}),
        (follow, {"balls": [((58, 27), 4)], "trails": [((48, 28), (57, 27), 4)]}),
        (follow, {"stars": [((59, 27), 9)],
                  "lines": [((52, 18), (58, 12), VOLT, 2), ((52, 36), (58, 42), VOLT, 2)]}),
        (base_pose(), {}),
    ]


def anim_hurt():
    f0 = base_pose()
    for k, v in {"hip": (29, 38), "neck": (28, 24), "head": (28, 14),
                 "hand_f": (44, 20), "elb_f": (38, 24),
                 "hand_b": (18, 24), "elb_b": (22, 26),
                 "knee_f": (36, 44), "foot_f": (38, 51)}.items():
        f0[k] = v
    fx0 = {"stars": [((40, 22), 7)],
           "lines": [((46, 14), (52, 10), WHITE, 2), ((34, 12), (36, 6), WHITE, 2)]}
    f1 = base_pose()
    for k, v in {"hip": (28, 39), "neck": (27, 25), "head": (26, 15),
                 "hand_f": (40, 32), "elb_f": (36, 32),
                 "hand_b": (16, 30), "elb_b": (21, 30),
                 "knee_f": (35, 47), "foot_f": (36, 55)}.items():
        f1[k] = v
    return [(f0, fx0), (f1, {}), (base_pose(), {})]


def anim_block():
    full = base_pose()
    for k, v in {"hip": (30, 39), "neck": (31, 25), "head": (32, 16),
                 "hand_f": (43, 27), "elb_f": (38, 30),
                 "hand_b": (41, 33), "elb_b": (35, 34),
                 "knee_f": (36, 48), "foot_f": (41, 55),
                 "knee_b": (25, 48), "foot_b": (22, 55)}.items():
        full[k] = v
    shield = {"arcs": [((38, 12, 60, 46), 290, 70, (64, 224, 255, 230), 3),
                       ((41, 16, 57, 42), 290, 70, (255, 255, 255, 200), 1)]}
    return [
        (lerp_pose(base_pose(), full, 0.5), {}),
        (full, shield),
        (full, shield),
    ]


def anim_ko():
    f0 = base_pose()
    for k, v in {"hip": (28, 42), "neck": (25, 30), "head": (23, 21),
                 "hand_f": (40, 22), "elb_f": (34, 25),
                 "hand_b": (16, 26), "elb_b": (20, 28),
                 "knee_f": (33, 50), "foot_f": (38, 55),
                 "knee_b": (25, 50), "foot_b": (22, 55)}.items():
        f0[k] = v
    f1 = base_pose()
    for k, v in {"hip": (28, 50), "neck": (28, 38), "head": (28, 29),
                 "hand_f": (36, 44), "elb_f": (33, 42),
                 "hand_b": (20, 44), "elb_b": (23, 42),
                 "knee_f": (38, 53), "foot_f": (44, 55),
                 "knee_b": (34, 54), "foot_b": (40, 56)}.items():
        f1[k] = v
    lie = base_pose()
    for k, v in {"neck": (26, 52), "hip": (40, 52), "head": (17, 51),
                 "hand_f": (32, 43), "elb_f": (30, 48),
                 "hand_b": (22, 58), "elb_b": (24, 54),
                 "knee_f": (47, 51), "foot_f": (53, 52),
                 "knee_b": (49, 55), "foot_b": (55, 56)}.items():
        lie[k] = v
    lie["flat"] = True
    return [
        (f0, {}),
        (f1, {"dust": [(28, 57, 4), (40, 58, 3)]}),
        (lie, {}),
        (lie, {"dizzy": True}),
    ]


def anim_victory():
    f0 = base_pose()
    for k, v in {"hip": (31, 37), "neck": (32, 23), "head": (33, 14),
                 "hand_f": (40, 20), "elb_f": (37, 25),
                 "hand_b": (24, 20), "elb_b": (27, 25)}.items():
        f0[k] = v
    f1 = base_pose()
    for k, v in {"hip": (31, 33), "neck": (32, 19), "head": (33, 10),
                 "hand_f": (42, 11), "elb_f": (39, 16),
                 "hand_b": (22, 11), "elb_b": (25, 16),
                 "knee_f": (37, 42), "foot_f": (38, 49),
                 "knee_b": (27, 42), "foot_b": (26, 49)}.items():
        f1[k] = v
    f2 = base_pose()
    for k, v in {"hand_f": (42, 15), "elb_f": (39, 20),
                 "hand_b": (22, 15), "elb_b": (25, 20)}.items():
        f2[k] = v
    f3 = base_pose()
    for k, v in {"hand_f": (44, 14), "elb_f": (40, 19),
                 "hand_b": (26, 30), "elb_b": (25, 32)}.items():
        f3[k] = v
    return [
        (f0, {"sparkles": [(14, 12), (50, 10)]}),
        (f1, {"sparkles": [(10, 16), (54, 14), (32, 4)]}),
        (f2, {"sparkles": [(12, 10), (52, 8)], "dust": [(32, 58, 3)]}),
        (f3, {"sparkles": [(50, 8)]}),
    ]


def anim_dash():
    full = base_pose()
    for k, v in {"hip": (34, 39), "neck": (37, 26), "head": (39, 17),
                 "hand_f": (30, 32), "elb_f": (34, 30),
                 "hand_b": (22, 30), "elb_b": (28, 28),
                 "knee_f": (43, 47), "foot_f": (50, 54),
                 "knee_b": (25, 46), "foot_b": (16, 50), "tail": -1.0}.items():
        full[k] = v
    fx = {"speed": True, "after": [(-10, 90), (-20, 45)]}
    return [
        (lerp_pose(base_pose(), full, 0.6), fx),
        (full, fx),
        (lerp_pose(base_pose(), full, 0.6), fx),
    ]


ANIMS = [
    ("idle", "Quieta", anim_idle, 6, True),
    ("walk", "Caminar", anim_walk, 10, True),
    ("jump", "Saltar", anim_jump, 9, False),
    ("crouch", "Agacharse", anim_crouch, 8, True),
    ("punch", "Punetazo", anim_punch, 12, False),
    ("kick", "Patada", anim_kick, 11, False),
    ("special", "Especial: Rayo Volt", anim_special, 10, False),
    ("hurt", "Dano", anim_hurt, 8, False),
    ("block", "Bloqueo", anim_block, 8, True),
    ("ko", "K.O.", anim_ko, 5, False),
    ("victory", "Victoria", anim_victory, 8, True),
    ("dash", "Dash", anim_dash, 14, True),
]


# ---------------- Ensamblado ----------------
def main():
    os.makedirs(FRAMES, exist_ok=True)
    rendered = []
    for (aid, label, fn, fps, loop) in ANIMS:
        rendered.append((aid, label, fps, loop, [render_frame(p, fx) for (p, fx) in fn()]))

    cols = max(len(fr) for (_, _, _, _, fr) in rendered)
    rows = len(rendered)
    sheet = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    meta_anims = []
    for r, (aid, label, fps, loop, frames) in enumerate(rendered):
        for c, fr in enumerate(frames):
            sheet.paste(fr, (c * CELL, r * CELL), fr)
            fr.save(os.path.join(FRAMES, f"voltia_{aid}_{c}.png"))
        meta_anims.append({
            "id": aid, "label": label, "row": r, "frames": len(frames),
            "fps": fps, "loop": loop,
            "frame": {"w": CELL, "h": CELL},
        })
    sheet.save(os.path.join(ASSETS, "voltia_spritesheet.png"))
    with open(os.path.join(ASSETS, "voltia_spritesheet.json"), "w", encoding="utf-8") as f:
        json.dump({"sprite": "voltia_spritesheet.png", "cell": CELL,
                   "columns": cols, "rows": rows, "animations": meta_anims},
                  f, ensure_ascii=False, indent=2)

    # Vista previa etiquetada 2x sobre fondo cuadriculado
    scale = 2
    label_w = 220
    pw, ph = label_w + cols * CELL * scale, rows * CELL * scale + 70
    prev = Image.new("RGB", (pw, ph), (24, 22, 34))
    pd = ImageDraw.Draw(prev)
    try:
        font_title = ImageFont.load_default(size=28)
        font = ImageFont.load_default(size=20)
    except TypeError:
        font_title = font = ImageFont.load_default()
    pd.text((20, 14), "VOLTIA - Tilesheet 64x64 x12 movimientos", fill=(255, 203, 61), font=font_title)
    top = 70
    for r, (aid, label, fps, loop, frames) in enumerate(rendered):
        y = top + r * CELL * scale
        pd.text((20, y + CELL * scale // 2 - 14), f"{r + 1:02d} {label}", fill=(150, 255, 235), font=font)
        pd.text((20, y + CELL * scale // 2 + 12), f"{len(frames)}f @ {fps}fps", fill=(120, 120, 140), font=font)
        for c in range(cols):
            x = label_w + c * CELL * scale
            # cuadriculado
            for gy in range(0, CELL * scale, 16):
                for gx in range(0, CELL * scale, 16):
                    col = (38, 36, 52) if (gx + gy) % 32 == 0 else (30, 28, 42)
                    pd.rectangle([x + gx, y + gy, x + gx + 15, y + gy + 15], fill=col)
            if c < len(frames):
                prev.paste(frames[c].resize((CELL * scale, CELL * scale), Image.NEAREST),
                           (x, y), frames[c].resize((CELL * scale, CELL * scale), Image.NEAREST))
            pd.rectangle([x, y, x + CELL * scale - 1, y + CELL * scale - 1], outline=(80, 80, 100))
    prev.save(os.path.join(ASSETS, "voltia_preview.png"))
    total = sum(len(fr) for (_, _, _, _, fr) in rendered)
    print(f"OK: {rows} animaciones, {total} frames, sheet {sheet.size}")


if __name__ == "__main__":
    main()
