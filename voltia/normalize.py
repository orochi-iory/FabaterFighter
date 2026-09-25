#!/usr/bin/env python3
"""Sistema de coherencia de sprites de VOLTIA (canon v1.2).

Escala: la cabeza (mascara rosa) es el ancla, invariante ante la pose.
  Cada tira se escala por la mediana de cabezas de SUS frames: el de pie
  emerge a ~160px-arte y el agachado/tumbado queda mas bajo con la MISMA
  escala px/unidad. Nada se fuerza a 160 por frame.
Sombras: rampas de material fijas (traje/navy/piel/mascara/pelo = 3 tonos
  como el dash; resto 1-2) con histogram matching al ancla: toda tira
  adopta la misma estructura de contraste.
Piel: solo mapea a los 8 tonos humanos viables.
Exportacion a escala entera (NEAREST): 4x frames, 2x hoja uniforme, 1x resto.

La spec canonica vive en voltia/spec.json (analyze.py --freeze).
"""
import bisect
import json
import os
import statistics
from collections import Counter, deque
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_PATH = os.path.join(HERE, "spec.json")

# Etiqueta de material por indice de paleta maestra (48 + blanco 48)
MATERIAL_OF = {
    0: "hair", 1: "suit", 2: "skin", 3: "suit", 4: "hair", 5: "navy",
    6: "suit", 7: "navy", 8: "suit", 9: "outline", 10: "suit", 11: "hair",
    12: "outline", 13: "skin", 14: "navy", 15: "outline", 16: "suit",
    17: "outline", 18: "mask", 19: "outline", 20: "navy", 21: "hair",
    22: "navy", 23: "navy", 24: "mask", 25: "navy", 26: "mask", 27: "suit",
    28: "outline", 29: "navy", 30: "suit", 31: "suit", 32: "mask",
    33: "yellow", 34: "hair", 35: "navy", 36: "skin", 37: "suit",
    38: "outline", 39: "navy", 40: "mask", 41: "hair", 42: "hair",
    43: "hair", 44: "hair", 45: "outline", 46: "yellow", 47: "suit",
    48: "white",
}
LEVELS = {"outline": 1, "suit": 3, "navy": 3, "skin": 3, "mask": 3,
          "hair": 3, "yellow": 2, "white": 1}
NO_STANDING = {"crouch", "crouch_punch", "crouch_hit",
               "kick_weak", "jump_kick", "knockdown", "ko"}
CROUCH_LIKE = {"crouch"}
CROUCH_HEIGHT = {"crouch_punch", "crouch_hit", "kick_weak"}
FIXED_HEIGHT = {"rayo_proj": 64, "portrait": 120}


def load_spec():
    if not os.path.exists(SPEC_PATH):
        raise SystemExit("Falta voltia/spec.json: ejecuta 'python3 voltia/analyze.py --freeze'")
    with open(SPEC_PATH, encoding="utf-8") as f:
        return json.load(f)


def lum(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


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


def detect_head_px(frame):
    """Altura (max dim) del blob de mascara rosa, o None si falla."""
    rgba = frame.convert("RGBA")
    w, h = rgba.size
    dd = rgba.tobytes()
    m = bytearray(w * h)
    for i in range(w * h):
        r, g, b, a = dd[4 * i], dd[4 * i + 1], dd[4 * i + 2], dd[4 * i + 3]
        if (a > 100 and r > 140 and g < 150 and b > 70 and r >= g and b < r and b > g
                and (r - g) > 10 and (r - b) < 150):
            m[i] = 1
    if sum(m) < 400:
        return None
    mask = Image.frombytes("L", (w, h), bytes(x * 255 for x in m))
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    # Relleno de huecos: el rayo teal y la cara quedan encerrados por el rosa
    # de la mascara; sin esto fragmentan el blob y la cabeza se subestima.
    inv = ImageChops.invert(mask)
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(inv, seed, 128)
    holes = inv.point(lambda v: 255 if v == 255 else 0)
    mask = ImageChops.lighter(mask, holes)
    m2 = mask.tobytes()
    seen = bytearray(w * h)
    blobs = []
    for i in range(w * h):
        if m2[i] and not seen[i]:
            q = deque([i])
            seen[i] = 1
            xs, ys = [], []
            while q:
                j = q.popleft()
                x, y = j % w, j // w
                xs.append(x)
                ys.append(y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    k = ny * w + nx
                    if 0 <= nx < w and 0 <= ny < h and m2[k] and not seen[k]:
                        seen[k] = 1
                        q.append(k)
            blobs.append((len(xs), min(xs), min(ys), max(xs), max(ys)))
    blobs.sort(key=lambda b: -b[0])
    if not blobs or blobs[0][0] < 400:
        return None
    _, x0, y0, x1, y1 = blobs[0]
    # Absorber fragmentos proximos: el rayo teal parte el rosa de la mascara;
    # solo se fusiona a <40px (el ruido disperso bajo la cabeza queda fuera).
    for b in blobs[1:]:
        if b[0] < 100:
            continue
        _, a0, c0, a1, c1 = b
        dx = max(0, max(x0 - a1, a0 - x1))
        dy = max(0, max(y0 - c1, c0 - y1))
        if max(dx, dy) < 40:
            x0, y0, x1, y1 = min(x0, a0), min(y0, c0), max(x1, a1), max(y1, c1)
    return max(x1 - x0 + 1, y1 - y0 + 1)


def strip_scale(frames, spec, strip_s, fixed_height=None, height_target=None):
    """Escala unica por tira. Devuelve (scale, heads, metodo)."""
    if fixed_height is not None:
        return None, [], "fixed"
    heads = [detect_head_px(f) for f in frames]
    valid = [x for x in heads if x]
    if len(valid) < max(1, (len(frames) + 1) // 2):
        med = statistics.median(f.height for f in frames)
        tgt = height_target or 160.0
        return tgt / (med / strip_s), heads, "frame-fallback"
    if len(valid) >= 2 and statistics.pstdev(valid) / statistics.median(valid) > 0.12:
        # Cabezas inconsistentes (oclusiones): la mayor es la menos ocluida.
        scale, method = spec["head_h"] / max(valid), "head-max"
    else:
        scale, method = spec["head_h"] / statistics.median(valid), "head"
    if height_target:
        # Validar contra la altura esperada: si la cabeza salio fusionada
        # con la coleta, la escala colapsa -> bloquear por altura de figura.
        artmax = max(f.height for f in frames) * scale / strip_s
        if abs(artmax - height_target) / height_target > 0.12:
            med = statistics.median(f.height for f in frames)
            scale, method = height_target / (med / strip_s), "height-lock"
    return scale, heads, method


def art_image(frame, scale, strip_s):
    """Arte suavizado a escala canonica (sin paleta aun)."""
    img = frame
    if strip_s > 1:
        img = frame.resize((max(1, frame.width // strip_s), max(1, frame.height // strip_s)),
                           Image.BOX)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    if (nw, nh) == img.size:
        return img.convert("RGBA")
    return img.resize((nw, nh), Image.LANCZOS).convert("RGBA")


def _classify_unique(uniq, master, mat_of):
    out = {}
    for c in uniq:
        if is_skin_color(*c):
            out[c] = "skin"
            continue
        best, bd = None, None
        for i, p in enumerate(master):
            d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2
            if bd is None or d < bd:
                bd, best = d, mat_of[i]
        out[c] = best
    return out


def pool_material_lums(arts, master, mat_of):
    """{material: luminancias ordenadas} ponderadas por pixel."""
    counter = Counter()
    for a in arts:
        dd = a.convert("RGBA").tobytes()
        for i in range(0, len(dd), 4):
            if dd[i + 3] >= 128:
                counter[(dd[i], dd[i + 1], dd[i + 2])] += 1
    cls = _classify_unique(set(counter), master, mat_of)
    pools = {}
    for c, n in counter.items():
        pools.setdefault(cls[c], []).extend([lum(*c)] * n)
    for m in pools:
        pools[m].sort()
    return pools, counter, cls


def normalize_strip(frames, spec, strip_s, scale=None, fixed_height=None):
    """Tira completa normalizada: misma escala, rampas matched, export 4x."""
    master = [tuple(c) for c in spec["palette"]]
    mat_of = {int(k): v for k, v in spec.get("material_of", MATERIAL_OF).items()}
    if fixed_height is not None:
        scales = [fixed_height / (f.height / strip_s) for f in frames]
    else:
        scales = [scale] * len(frames)
    arts = [art_image(f, sc, strip_s) for f, sc in zip(frames, scales)]
    pools, counter, cls = pool_material_lums(arts, master, mat_of)
    mapping = {}
    for c in counter:
        m = cls[c]
        L = lum(*c)
        dec = spec["anchor_deciles"].get(m)
        ramp = spec["ramps"][m]
        if dec and m in pools and len(pools[m]) > 10:
            rank = bisect.bisect_right(pools[m], L) / len(pools[m])
            pos = min(9.999, rank * 10)
            i0, f = int(pos), pos - int(pos)
            target = dec[i0] * (1 - f) + dec[i0 + 1] * f
        else:
            target = L
        lv = min(range(len(ramp["lums"])), key=lambda k: abs(ramp["lums"][k] - target))
        mapping[c] = tuple(ramp["colors"][lv])
    out = []
    for a in arts:
        rgba = a.convert("RGBA")
        alpha = rgba.split()[3].point(lambda v: 255 if v >= 128 else 0)
        arr = bytearray(rgba.convert("RGB").tobytes())
        for i in range(0, len(arr), 3):
            mm = mapping.get((arr[i], arr[i + 1], arr[i + 2]))
            if mm:
                arr[i], arr[i + 1], arr[i + 2] = mm
        f2 = Image.frombytes("RGB", rgba.size, bytes(arr)).convert("RGBA")
        f2.putalpha(alpha)
        # Limpieza de motas: componentes sueltas <8px-arte (ruido de chroma).
        # Solo toca ruido: ningun detalle legitimo suelto es tan pequeno.
        dd = f2.tobytes()
        w0, h0 = f2.size
        occ = bytearray(w0 * h0)
        for i in range(w0 * h0):
            if dd[4 * i + 3] > 128:
                occ[i] = 1
        seen = bytearray(w0 * h0)
        am = f2.load()
        for i in range(w0 * h0):
            if occ[i] and not seen[i]:
                q = deque([i])
                seen[i] = 1
                pix = []
                while q:
                    j = q.popleft()
                    pix.append(j)
                    x, y = j % w0, j // w0
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                        k = ny * w0 + nx
                        if 0 <= nx < w0 and 0 <= ny < h0 and occ[k] and not seen[k]:
                            seen[k] = 1
                            q.append(k)
                if len(pix) < 8:
                    for j in pix:
                        am[j % w0, j // w0] = (0, 0, 0, 0)
        K = spec["export_scale"]
        out.append(f2.resize((f2.width * K, f2.height * K), Image.NEAREST))
    return out


def _skin_fraction(rgba):
    dd = rgba.convert("RGBA").tobytes()
    tot = sk = 0
    for i in range(0, len(dd), 4):
        if dd[i + 3] > 100:
            tot += 1
            if is_skin_color(dd[i], dd[i + 1], dd[i + 2]):
                sk += 1
    return sk / max(1, tot)


def qa_check_strip(sid, keyed, frames, expected, spec, strip_s, scale, heads, method):
    """Puerta de calidad. Devuelve (veredicto, [notas])."""
    notes = []
    if len(frames) != expected:
        notes.append(("RECHAZAR", f"frames {len(frames)}/{expected}"))
    if len(frames) >= 2:
        # Guardia anti-rebanado: un frame mucho más estrecho que la
        # mediana es un corte dentro de una figura (cola, puño...).
        widths = sorted(f.width for f in frames)
        med = widths[len(widths) // 2]
        if widths[0] < 0.4 * med:
            notes.append(("RECHAZAR", f"frame rebanado ({widths[0]}px vs mediana {med}px)"))
    w, h = keyed.size
    hard = keyed.split()[3].point(lambda v: 255 if v > 100 else 0)
    bb = hard.getbbox()
    if bb:
        l, t, r, b = bb
        if l <= 3 or t <= 3 or r >= w - 4 or b >= h - 4:
            notes.append(("RECHAZAR", "figura tocando el borde (posible recorte)"))
    else:
        notes.append(("RECHAZAR", "tira vacia tras el chroma"))
    # Cortes en limites de split: cada frame sale del corte con pad>=3, asi
    # que el contenido opaco pegado al borde izq/der es un corte por figura.
    if frames:
        cut = []
        nfr = len(frames)
        for i, f in enumerate(frames):
            a = f.convert("RGBA").split()[3]
            fw, fh = a.size
            px = a.load()
            n = 0
            if i > 0:
                n += sum(1 for y in range(fh) if px[0, y] > 128)
            if i < nfr - 1:
                n += sum(1 for y in range(fh) if px[fw - 1, y] > 128)
            if n >= 5:
                cut.append(f"f{i + 1}")
        if cut:
            notes.append(("AVISO", f"posible corte en borde de split ({','.join(cut)})"))
    if frames:
        ref = spec.get("skin_frac_ref", 0)
        if ref > 0 and method != "fixed":
            frac = _skin_fraction(frames[len(frames) // 2])
            if frac < ref * 0.3 or frac > ref * 3:
                notes.append(("AVISO", f"piel {frac:.1%} vs ref {ref:.1%} (revisar tonos)"))
        if method == "fixed":
            pass
        elif method == "frame-fallback":
            notes.append(("AVISO", "sin cabezas fiables (fallback por altura)"))
        else:
            if method == "height-lock":
                notes.append(("AVISO", "escala por altura de figura (cabezas no fiables)"))
            valid = [x for x in heads if x]
            if len(valid) < len(frames):
                notes.append(("AVISO", f"cabezas {len(valid)}/{len(frames)}"))
            if len(valid) >= 2:
                med = statistics.median(valid)
                cv = statistics.pstdev(valid) / med
                if cv > 0.12:
                    notes.append(("AVISO", f"cabeza inconsistente cv={cv:.0%}"))
            artmax = max(f.height for f in frames) * scale / strip_s
            artmin = min(f.height for f in frames) * scale / strip_s
            H = float(spec.get("art_height", 160))
            if sid in NO_STANDING:
                if sid in CROUCH_LIKE:
                    ratio = artmin / artmax if artmax else 1
                    if not 0.55 <= ratio <= 0.85:
                        notes.append(("AVISO", f"agachado pleno {artmin:.0f}px-arte = {ratio:.0%} del de pie (rango 55-85%)"))
                    if abs(artmax - H) / H > 0.12:
                        notes.append(("AVISO", f"de pie emergente {artmax:.0f} vs {H:.0f}"))
                elif sid in CROUCH_HEIGHT:
                    if not 0.62 * H <= artmax <= 1.11 * H:
                        notes.append(("AVISO", f"altura agachado {artmax:.0f}px-arte fuera de {0.62*H:.0f}-{1.11*H:.0f}"))
            elif abs(artmax - H) / H > 0.12:
                notes.append(("AVISO", f"de pie emergente {artmax:.0f} vs {H:.0f}"))
    verdict = "OK"
    for (lvl, _) in notes:
        if lvl == "RECHAZAR":
            verdict = "RECHAZAR"
            break
        verdict = "AVISO"
    return verdict, notes
