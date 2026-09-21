#!/usr/bin/env python3
"""Baut map.js: stark vereinfachte Landesumrisse fuer die kleine Karte im
GeoFind-Ergebnis. Quelle: Natural Earth 1:50m admin_0_countries (GeoJSON).

  python3 tools/build_map.py --geo ne50.geojson --data data.js --out map.js
"""
import argparse
import json
import math
import os
import re

MAP = {"KOS": "UNK", "SDS": "SSD", "CYN": "CYP", "SOL": "SOM"}
SKIP = {"ATA", "ATC", "FJI_"}          # Antarktis raus, sie sprengt jede Ansicht
Q = 20                                  # Gitter: 1/20 Grad ~ 5 km


def simplify(pts, tol):
    """Douglas-Peucker, iterativ."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if norm == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def ring_span(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys))


def encode(ring):
    """Ganzzahlgitter + Delta-Kodierung."""
    out = []
    px = py = 0
    for x, y in ring:
        ix, iy = round(x * Q), round(y * Q)
        if out and ix == px and iy == py:
            continue
        out.append(ix - px if out else ix)
        out.append(iy - py if out else iy)
        px, py = ix, iy
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geo", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    iso = set(re.findall(r'"iso3":"([A-Z]{3})"', open(a.data, encoding="utf-8").read()))
    geo = json.load(open(a.geo, encoding="utf-8"))

    shapes = []
    pts_total = 0
    for f in geo["features"]:
        code = f["properties"].get("ADM0_A3") or ""
        if code in SKIP:
            continue
        code = MAP.get(code, code)
        g = f["geometry"]
        rings = []
        if g["type"] == "Polygon":
            rings = [g["coordinates"][0]]
        elif g["type"] == "MultiPolygon":
            rings = [poly[0] for poly in g["coordinates"]]
        keep = []
        for ring in sorted(rings, key=ring_span, reverse=True):
            span = ring_span(ring)
            if span < 0.7 and keep:            # winzige Inseln weglassen
                continue
            tol = min(0.22, max(0.025, span / 170))
            s = simplify([(float(x), float(y)) for x, y in ring], tol)
            if len(s) < 4 and keep:
                continue
            enc = encode(s)
            if len(enc) < 8 and keep:      # groesste Flaeche bleibt in jedem Fall
                continue
            keep.append(enc)
            pts_total += len(enc) // 2
        if not keep:
            continue
        shapes.append([code if code in iso else "", keep])

    js = "window.GEO_SHAPES={q:%d,s:%s};\n" % (Q, json.dumps(shapes, separators=(",", ":")))
    open(a.out, "w", encoding="utf-8").write(js)
    print("%d Flaechen, %d Punkte -> %s (%d KB)" % (len(shapes), pts_total, a.out, os.path.getsize(a.out) // 1024))


if __name__ == "__main__":
    main()
