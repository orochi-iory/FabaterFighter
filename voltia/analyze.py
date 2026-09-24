#!/usr/bin/env python3
"""Mide la coherencia de las tiras raw y congela la especificacion canonica.

Uso:
    python3 voltia/analyze.py            # solo informe -> voltia/qa_report.txt
    python3 voltia/analyze.py --freeze   # informe + voltia/spec.json + paletas

El ancla de estilo es block.png. La escala la fija la CABEZA (invariante
ante la pose); la altura de pie (~160px-arte) EMERGE, no se impone.
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
from normalize import (MATERIAL_OF, LEVELS, estimate_pixel_size,  # noqa: E402
                       is_skin_color, detect_head_px, art_image,
                       pool_material_lums, lum)

ANCHOR = "block"
STAND_H = 160  # altura de pie objetivo (emergente, no impuesta)
EXPORT_SCALE = 4
PALETTE_SIZE = 48
SKIN_SIZE = 8
WHITE_INK = [248, 248, 248]
PALETTE_POOL = ["block", "idle", "walk", "punch_mh", "kick_lm", "kick_h", "jump"]
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
    heads = [detect_head_px(f) for f in frames]
    valid = [x for x in heads if x]
    return {
        "sid": sid, "raw_size": list(raw.size), "n": len(frames),
        "h_min": min(hs), "h_med": statistics.median(hs), "h_max": max(hs),
        "pixel": s, "head_med": round(statistics.median(valid), 1) if valid else None,
        "head_n": len(valid), "bg_flat": round(flat, 4), "bg_key": list(key),
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
    exp_of = {s[0]: s[4] for s in SECTIONS}
    # Paleta CONGELADA: los indices etiquetan materiales; solo se reconstruye
    # con --repalette (y entonces hay que re-verificar MATERIAL_OF).
    spec_path = os.path.join(HERE, "spec.json")
    _old = json.load(open(spec_path, encoding="utf-8")) if os.path.exists(spec_path) else {}
    if len(_old.get("palette", [])) == PALETTE_SIZE + 1 and "--repalette" not in sys.argv:
        palette, skin_palette = _old["palette"], _old["skin_palette"]
        skin_frac_ref = _old.get("skin_frac_ref", 0)
        print("  paleta reutilizada (congelada v1)")
    else:
        # Paleta maestra + tinta blanca explicita (ojos/dientes/nucleos)
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
        palette = _median_cut(samples, PALETTE_SIZE) + [WHITE_INK]
        sw = Image.new("RGB", (len(palette) * 40, 40), (0, 0, 0))
        d = ImageDraw.Draw(sw)
        for i, c in enumerate(palette):
            d.rectangle([i * 40, 0, i * 40 + 39, 39], fill=tuple(c))
        sw.save(os.path.join(HERE, "master_palette.png"))
        # Subpaleta de piel (protector de piel)
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
    # Calibracion de cabeza con el ancla: HEAD_H hace que el de pie = 160
    a_frames = split_strip(load_and_key(os.path.join(HERE, "raw", f"{ANCHOR}.png")),
                           exp_of[ANCHOR])
    a_heads = [x for x in (detect_head_px(f) for f in a_frames) if x]
    a_head = statistics.median(a_heads)
    a_stand = max(f.height for f in a_frames)
    head_h = STAND_H * a_head / a_stand
    # Deciles de luminancia por material en el ancla (a escala canonica)
    s_a, _ = estimate_pixel_size(a_frames[len(a_frames) // 2])
    scale_a = head_h / a_head
    arts_a = [art_image(f, scale_a, s_a) for f in a_frames]
    master = [tuple(c) for c in palette]
    mat_of = MATERIAL_OF
    pools, _, _ = pool_material_lums(arts_a, master, mat_of)
    deciles = {}
    for m, vals in pools.items():
        if len(vals) >= 50:
            deciles[m] = [vals[min(len(vals) - 1, int(len(vals) * q / 10))] for q in range(11)]
    # Rampas: niveles fijos por material (3 tonos estilo dash)
    fams = {}
    for i, c in enumerate(palette):
        fams.setdefault(mat_of[i], []).append(tuple(c))
    fams["skin"] = [tuple(c) for c in skin_palette]
    def sat(c):
        mx, mn = max(c), min(c)
        return (mx - mn) / mx if mx else 0

    ramps = {}
    for m, n in LEVELS.items():
        fam = sorted(fams.get(m, []), key=lambda c: lum(*c))
        if not fam:
            continue
        if m == "outline":
            pick = [fam[0]]
        elif m == "white":
            pick = [fam[-1]]
        elif n == 2:
            pick = [fam[0], max(fam, key=sat)]
        else:
            med = fam[len(fam) // 2]
            bright = [c for c in fam if lum(*c) >= lum(*med)] or fam[-1:]
            light = max(bright, key=sat)
            if light == med:
                light = fam[-1]
            pick = [fam[0], med, light]
        ramps[m] = {"colors": [list(c) for c in pick],
                    "lums": [round(lum(*c), 2) for c in pick]}
    spec = {
        "rules_version": 1.2, "anchor": ANCHOR, "anchor_pixel": by_id[ANCHOR]["pixel"],
        "art_height": STAND_H, "head_h": round(head_h, 2), "export_scale": EXPORT_SCALE,
        "uniform_scale": 2, "ref_scale": 1, "preview_scale": 1,
        "future_bg": "#00FF00",
        "palette_version": 1, "palette": palette,
        "material_of": {str(k): v for k, v in mat_of.items()},
        "ramps": ramps, "anchor_deciles": deciles,
        "skin_palette": skin_palette, "skin_frac_ref": round(skin_frac_ref, 4),
        "strips": {sid: {"pixel": r["pixel"], "head_med": r["head_med"],
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
    spec = freeze_spec(results) if freeze else None
    head_h = spec["head_h"] if spec else None
    lines = ["COHERENCIA DE TIRAS RAW (ancla de estilo: block.png)", "=" * 70,
             f"{'tira':<12}{'raw':<12}{'n':<4}{'h_px max':<9}{'pixel':<7}{'cabeza':<9}{'arte_max':<9}{'fondo'}"]
    for r in results:
        artmax = f"{r['h_max'] / (r['head_med'] or 1) * (head_h or 0):.0f}" if head_h and r["head_med"] else "-"
        lines.append(f"{r['sid']:<12}{r['raw_size'][0]}x{r['raw_size'][1]:<7}{r['n']:<4}"
                     f"{r['h_max']:<9.0f}{r['pixel']:<7}{r['head_med'] or '-':<9}{artmax:<9}{r['bg_flat']}")
    lines.append("")
    for r in results:
        lines.append(f"{r['sid']}: cabezas={r['head_n']}/{r['n']} fondo={r['bg_key']}")
        lines.append(f"  top_colores={[c for (c, _) in r['colors']]}")
    if spec:
        lines.append("")
        lines.append(f"CANON v1.2: cabeza={spec['head_h']}px-arte (-> de pie ~{STAND_H}), "
                     f"rampas={ {m: len(v['colors']) for m, v in spec['ramps'].items()} }, "
                     f"paleta ({len(spec['palette'])} tintas) + piel ({len(spec['skin_palette'])})")
        print(f"CANON v1.2: HEAD_H={spec['head_h']}px-arte, rampas OK, "
              f"{len(spec['palette'])} tintas")
    with open(os.path.join(HERE, "qa_report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines[:len(results) + 4]))


if __name__ == "__main__":
    main()
