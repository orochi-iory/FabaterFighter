#!/usr/bin/env python3
"""Mide la coherencia de las tiras raw y congela la especificacion canonica.

Uso:
    python3 voltia/analyze.py            # solo informe -> voltia/qa_report.txt
    python3 voltia/analyze.py --freeze   # informe + voltia/spec.json + paletas

El ancla de estilo es block.png (decision del proyecto). La resolucion canon
es una REGLA fija (ART_HEIGHT), no un valor heredado de ninguna tira.
"""
import json
import math
import os
import statistics
import sys
from collections import Counter
from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_sheet import load_and_key, split_strip, SECTIONS, _sample_bg  # noqa: E402
from normalize import estimate_pixel_size, is_skin_color  # noqa: E402

ANCHOR = "block"
# Altura canonica en pixeles-arte. 160px = luchador detallado estilo SF
# (Ryu en SFA3 mide ~100px); a 4x da 640px, el tamano aprobado de block.png.
ART_HEIGHT = 160
EXPORT_SCALE = 4
PALETTE_SIZE = 48
SKIN_SIZE = 8
PALETTE_POOL = ["block", "idle", "walk", "punch_mh", "kick_lm", "kick_h", "jump"]
HEIGHT_WARN = 0.15
# Tonos humanos viables de respaldo (calidos; se usan si hay pocas muestras)
SKIN_FALLBACK = [[255, 224, 189], [244, 196, 150], [232, 170, 120], [214, 145, 100],
                 [192, 120, 85], [170, 100, 70], [148, 82, 58], [126, 66, 48]]


def top_colors(rgba, n=6):
    data = rgba.convert("RGBA").tobytes()
    c = Counter()
    for i in range(0, len(data), 4):
        if data[i + 3] > 128:
            c[(data[i] & 0xF0, data[i + 1] & 0xF0, data[i + 2] & 0xF0)] += 1
    return c.most_common(n)


def bg_flatness(path, tol=30):
    """% de pixeles a distancia <= tol del fondo muestreado (deberia ser alto)."""
    rgb = Image.open(path).convert("RGB")
    w, h = rgb.size
    key = _sample_bg(rgb)
    r, g, b = rgb.split()
    dr = ImageChops.difference(r, Image.new("L", (w, h), key[0]))
    dg = ImageChops.difference(g, Image.new("L", (w, h), key[1]))
    db = ImageChops.difference(b, Image.new("L", (w, h), key[2]))
    D = ImageChops.add(ImageChops.add(ImageChops.multiply(dr, dr), ImageChops.multiply(dg, dg)),
                       ImageChops.multiply(db, db))
    t0 = (tol / 255) ** 2 * 255
    m = D.point([255 if v <= t0 else 0 for v in range(256)])
    return sum(m.tobytes()) / 255 / (w * h), key


def analyze_strip(sid, expected):
    p = os.path.join(HERE, "raw", f"{sid}.png")
    raw = Image.open(p)
    keyed = load_and_key(p)
    frames = split_strip(keyed, expected)
    hs = [f.height for f in frames]
    s, scores = estimate_pixel_size(frames[len(frames) // 2])
    flat, key = bg_flatness(p)
    return {
        "sid": sid, "raw_size": list(raw.size), "n": len(frames),
        "h_min": min(hs), "h_med": statistics.median(hs), "h_max": max(hs),
        "pixel": s, "h_art_med": round(statistics.median(hs) / s, 1),
        "bg_flat": round(flat, 4), "bg_key": list(key),
        "scores": {str(k): round(v, 3) for k, v in scores.items()},
        "colors": [[list(c), n] for (c, n) in top_colors(keyed)],
    }


def _median_cut(samples, n):
    side = max(2, int(math.sqrt(len(samples))))
    pool = Image.new("RGB", (side, side))
    pool.putdata((samples * ((side * side) // len(samples) + 1))[:side * side])
    q = pool.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(maxcolors=side * side), reverse=True)[:n]
    return [[pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]] for (_, i) in counts]


def freeze_spec(results):
    by_id = {r["sid"]: r for r in results}
    anchor = by_id[ANCHOR]
    # Paleta maestra: muestreo de varias tiras (incluye efectos) + median-cut
    samples = []
    for sid in PALETTE_POOL:
        if sid not in by_id:
            continue
        keyed = load_and_key(os.path.join(HERE, "raw", f"{sid}.png"))
        data = keyed.convert("RGBA").tobytes()
        for i in range(0, len(data), 36):
            if data[i + 3] > 128:
                samples.append((data[i], data[i + 1], data[i + 2]))
        if len(samples) > 90000:
            break
    palette = _median_cut(samples, PALETTE_SIZE)
    sw = Image.new("RGB", (len(palette) * 40, 40), (0, 0, 0))
    d = ImageDraw.Draw(sw)
    for i, c in enumerate(palette):
        d.rectangle([i * 40, 0, i * 40 + 39, 39], fill=tuple(c))
    sw.save(os.path.join(HERE, "master_palette.png"))
    # Subpaleta de piel: solo tonos humanos viables (protector de piel)
    skin_all = [s for s in samples if is_skin_color(*s)]
    skin_frac_ref = len(skin_all) / max(1, len(samples))
    if len(skin_all) >= 300:
        skin_palette = _median_cut(skin_all, SKIN_SIZE)
    else:
        skin_palette = SKIN_FALLBACK
    sw2 = Image.new("RGB", (len(skin_palette) * 60, 40), (0, 0, 0))
    d2 = ImageDraw.Draw(sw2)
    for i, c in enumerate(skin_palette):
        d2.rectangle([i * 60, 0, i * 60 + 59, 39], fill=tuple(c))
    sw2.save(os.path.join(HERE, "skin_palette.png"))
    spec = {
        "rules_version": 1, "anchor": ANCHOR, "anchor_pixel": anchor["pixel"],
        "art_height": ART_HEIGHT, "export_scale": EXPORT_SCALE,
        "uniform_scale": 2, "ref_scale": 1, "preview_scale": 1,
        "future_bg": "#00FF00",
        "palette_version": 1, "palette": palette,
        "skin_palette": skin_palette, "skin_frac_ref": round(skin_frac_ref, 4),
        "thresholds": {"height_warn": HEIGHT_WARN},
        "strips": {sid: {"pixel": r["pixel"], "h_art_med": r["h_art_med"],
                         "bg_flat": r["bg_flat"]} for sid, r in by_id.items()},
    }
    with open(os.path.join(HERE, "spec.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)
    return spec


def main():
    freeze = "--freeze" in sys.argv
    results = []
    for (sid, _label, _fps, _loop, exp) in SECTIONS:
        if not os.path.exists(os.path.join(HERE, "raw", f"{sid}.png")):
            continue
        print(f"  analizando {sid}...")
        results.append(analyze_strip(sid, exp))
    lines = ["COHERENCIA DE TIRAS RAW (ancla de estilo: block.png)", "=" * 60,
             f"{'tira':<12}{'raw':<12}{'n':<4}{'h_px med':<9}{'pixel':<7}{'h_arte':<8}{'fondo'}"]
    for r in results:
        lines.append(f"{r['sid']:<12}{r['raw_size'][0]}x{r['raw_size'][1]:<7}{r['n']:<4}"
                     f"{r['h_med']:<9.0f}{r['pixel']:<7}{r['h_art_med']:<8}{r['bg_flat']}")
    lines.append("")
    for r in results:
        lines.append(f"{r['sid']}: pixel_scores={r['scores']} fondo={r['bg_key']}")
        lines.append(f"  top_colores={[c for (c, _) in r['colors']]}")
    if freeze:
        spec = freeze_spec(results)
        lines.append("")
        lines.append(f"CANON v1: altura_arte={spec['art_height']}px, export={spec['export_scale']}x, "
                     f"paleta v{spec['palette_version']} ({len(spec['palette'])} colores), "
                     f"piel ({len(spec['skin_palette'])} tonos, ref {spec['skin_frac_ref']:.1%}), "
                     f"fondo_futuro={spec['future_bg']}")
        print(f"CANON v1: H={spec['art_height']}px-arte, export={spec['export_scale']}x, "
              f"{len(spec['palette'])} colores + {len(spec['skin_palette'])} piel")
    with open(os.path.join(HERE, "qa_report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines[:len(results) + 4]))


if __name__ == "__main__":
    main()
