#!/usr/bin/env python3
"""Sistema de coherencia de sprites de VOLTIA.

Todo frame aceptado pasa por la normalizacion canonica:
  1. Geometria: la altura del personaje se escala a H_ART pixeles-arte.
  2. Pixel real: si la tira trae cuadricula (pixel>1) se extrae con BOX
     (division entera, sin interpolacion); si es arte suavizado se impone
     la cuadricula canonica al reescalar a H (las reglas exigen a la IA
     pixel grueso real para minimizar este paso).
  3. Paleta maestra: cada pixel se mapea al color canonico mas cercano,
     con PROTECTOR DE PIEL: la piel solo mapea a tonos humanos viables.
  4. Alfa dura: sin halos de fondo.
  5. Exportacion a escala entera (NEAREST): 4x frames, 2x hoja uniforme, 1x resto.

La spec canonica vive en voltia/spec.json (se crea con analyze.py --freeze,
usando block.png como ancla de estilo/tamano).
"""
import json
import os
import statistics
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_PATH = os.path.join(HERE, "spec.json")


def load_spec():
    if not os.path.exists(SPEC_PATH):
        raise SystemExit("Falta voltia/spec.json: ejecuta 'python3 voltia/analyze.py --freeze'")
    with open(SPEC_PATH, encoding="utf-8") as f:
        return json.load(f)


def is_skin_color(r, g, b):
    """Heuristica de piel calida. Excluye rosa de mascara (g<b),
    amarillo de cinturon/efectos (g-b grande) y frios/oscuros."""
    return (r > 95 and g > 40 and b > 20 and r >= g and g > b
            and (r - g) > 12 and (g - b) < 80
            and (max(r, g, b) - min(r, g, b)) > 12)


def estimate_pixel_size(rgba, smax=8):
    """Detecta el tamano de pixel: el factor down/upscale con menor error."""
    a = rgba.split()[3]
    bbox = a.getbbox()
    if not bbox:
        return 1, {}
    g = rgba.convert("RGB").convert("L").crop(bbox)
    w, h = g.size
    scores = {}
    for s in range(1, smax + 1):
        sw, sh = max(1, w // s), max(1, h // s)
        if sw < 8 or sh < 8:
            continue
        back = g.resize((sw, sh), Image.BOX).resize((w, h), Image.NEAREST)
        d = ImageChops.difference(g, back)
        scores[s] = sum(d.tobytes()) / (w * h)
    return min(scores, key=scores.get), scores


def _nearest_mapping(uniq_colors, palette):
    pal = [tuple(c) for c in palette]
    mapping = {}
    for c in uniq_colors:
        best, bd = None, None
        for p in pal:
            d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2
            if bd is None or d < bd:
                bd, best = d, p
        mapping[c] = best
    return mapping


def normalize_frame(frame, spec, strip_s, fix_height=True, target_h=None):
    """Devuelve el frame normalizado a escala de exportacion (entera)."""
    H = target_h or spec["art_height"]
    K = spec["export_scale"]
    art_in = frame
    if strip_s > 1:  # pixel-art real: extraer la cuadricula nativa
        art_in = frame.resize((max(1, frame.width // strip_s), max(1, frame.height // strip_s)),
                               Image.BOX)
    if fix_height and art_in.height != H:
        f = H / art_in.height
        art = art_in.resize((max(1, round(art_in.width * f)), H), Image.LANCZOS)
    else:
        art = art_in
    a = art.split()[3].point(lambda v: 255 if v >= 128 else 0)
    rgb = art.convert("RGB")
    data = rgb.tobytes()
    uniq = set(zip(data[0::3], data[1::3], data[2::3]))
    # Protector de piel: dos mapeos separados, sin contaminacion cruzada
    skin = {c for c in uniq if is_skin_color(*c)}
    rest = uniq - skin
    mapping = {}
    if skin and spec.get("skin_palette"):
        mapping.update(_nearest_mapping(skin, spec["skin_palette"]))
    if rest:
        mapping.update(_nearest_mapping(rest, spec["palette"]))
    if skin and not spec.get("skin_palette"):
        mapping.update(_nearest_mapping(skin, spec["palette"]))
    arr = bytearray(data)
    for i in range(0, len(arr), 3):
        m = mapping[(arr[i], arr[i + 1], arr[i + 2])]
        arr[i], arr[i + 1], arr[i + 2] = m
    out = Image.frombytes("RGB", rgb.size, bytes(arr)).convert("RGBA")
    out.putalpha(a)
    return out.resize((out.width * K, out.height * K), Image.NEAREST)


def _skin_fraction(rgba):
    dd = rgba.convert("RGBA").tobytes()
    tot = sk = 0
    for i in range(0, len(dd), 4):
        if dd[i + 3] > 100:
            tot += 1
            if is_skin_color(dd[i], dd[i + 1], dd[i + 2]):
                sk += 1
    return sk / max(1, tot)


def qa_check(sid, keyed, frames, expected, spec, strip_s):
    """Puerta de calidad. Devuelve (veredicto, [notas]).

    OK: se acepta. AVISO: aceptable, la normalizacion lo corrige.
    RECHAZAR: hay que regenerar la tira.
    """
    notes = []
    H = spec["art_height"]
    if len(frames) != expected:
        notes.append(("RECHAZAR", f"frames {len(frames)}/{expected}"))
    w, h = keyed.size
    hard = keyed.split()[3].point(lambda v: 255 if v > 100 else 0)
    bb = hard.getbbox()
    if bb:
        l, t, r, b = bb
        if l <= 3 or t <= 3 or r >= w - 4 or b >= h - 4:
            notes.append(("RECHAZAR", "figura tocando el borde (posible recorte)"))
    else:
        notes.append(("RECHAZAR", "tira vacia tras el chroma"))
    if frames:
        med = statistics.median(f.height for f in frames)
        dev = abs(med / strip_s - H) / H
        if dev > spec["thresholds"]["height_warn"]:
            notes.append(("AVISO", f"altura {med / strip_s:.0f}px-arte vs canon {H} (se normaliza)"))
        if strip_s != spec["anchor_pixel"]:
            notes.append(("AVISO", f"pixel {strip_s}px vs {spec['anchor_pixel']}px del ancla (se normaliza)"))
        ref = spec.get("skin_frac_ref", 0)
        if ref > 0:
            frac = _skin_fraction(frames[len(frames) // 2])
            if frac < ref * 0.3 or frac > ref * 3:
                notes.append(("AVISO", f"piel {frac:.1%} vs ref {ref:.1%} (revisar tonos)"))
    verdict = "OK"
    for (lvl, _) in notes:
        if lvl == "RECHAZAR":
            verdict = "RECHAZAR"
            break
        verdict = "AVISO"
    return verdict, notes
