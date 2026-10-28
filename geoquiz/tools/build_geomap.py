#!/usr/bin/env python3
"""Erzeugt geomap.js: Umriss der Bundesländer und die deutschen Großstädte.

Für GeoMap: eine Stadt wird genannt, man tippt auf die Karte, Punkte gibt es
nach Luftlinie. Die Karte sind die 16 Bundesländer (Außengrenze plus innere
Linien zur Orientierung), die Städte alle kreisfreien Städte ab 100.000
Einwohnern — bekannt genug, dass man sie verorten kann.

Quellen (werden nicht mitversioniert, siehe README):
  - isellsoap/deutschlandGeoJSON   2_bundeslaender/3_mittel.geo.json
  - jgehrcke/covid-19-germany-gae  ags.json (Name, Lage und Einwohner je Kreis)

Aufruf:
  python3 tools/build_geomap.py --laender 3_mittel.geo.json --kreise ags.json \
      --out geomap.js
"""
import argparse
import json
import math
import os

# Drei Großstädte sind nicht kreisfrei und fehlen deshalb in den Kreisdaten:
# Hannover gehört zur Region Hannover, Aachen zur Städteregion Aachen,
# Saarbrücken zum Regionalverband. Lage aus GeoNames, Einwohner aus dem UN
# Demographic Yearbook (2023). Beides wird unten gegen das Bundesland geprüft.
EXTRA = [
    ("Hannover", 52.3705, 9.7332, 545045, "Niedersachsen"),
    ("Aachen", 50.7766, 6.0834, 252136, "Nordrhein-Westfalen"),
    ("Saarbrücken", 49.2326, 7.0098, 181959, "Saarland"),
]

Q = 200                                     # Gitter: 1/200 Grad, rund 500 m
MIN_EINWOHNER = 100_000
TOLERANZ = 0.004                            # Douglas-Peucker in Grad, rund 400 m


def vereinfachen(punkte, tol):
    """Douglas-Peucker, iterativ (wie in build_map.py)."""
    if len(punkte) < 3:
        return punkte
    behalten = [False] * len(punkte)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(punkte) - 1)]
    while stapel:
        a, b = stapel.pop()
        if b - a < 2:
            continue
        ax, ay = punkte[a]
        bx, by = punkte[b]
        dx, dy = bx - ax, by - ay
        laenge = math.hypot(dx, dy)
        weit, wi = -1.0, -1
        for i in range(a + 1, b):
            px, py = punkte[i]
            d = (math.hypot(px - ax, py - ay) if laenge == 0
                 else abs(dy * px - dx * py + bx * ay - by * ax) / laenge)
            if d > weit:
                weit, wi = d, i
        if weit > tol:
            behalten[wi] = True
            stapel += [(a, wi), (wi, b)]
    return [p for p, k in zip(punkte, behalten) if k]


def ringe(geometrie):
    """Alle Außenringe einer (Multi-)Polygon-Geometrie."""
    teile = (geometrie["coordinates"] if geometrie["type"] == "MultiPolygon"
             else [geometrie["coordinates"]])
    return [polygon[0] for polygon in teile]


def kodieren(punkte):
    """Erster Punkt absolut im 1/Q-Gitter, danach Differenzen."""
    raster = [(round(lon * Q), round(lat * Q)) for lon, lat in punkte]
    entpackt, vorher = [], None
    for x, y in raster:
        if vorher is None:
            entpackt += [x, y]
        elif (x, y) != vorher:
            entpackt += [x - vorher[0], y - vorher[1]]
        else:
            continue
        vorher = (x, y)
    return entpackt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--laender", required=True, help="GeoJSON der Bundesländer")
    ap.add_argument("--kreise", required=True, help="ags.json mit Name, Lage, Einwohnern")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    geo = json.load(open(a.laender, encoding="utf-8"))
    laender, punkte_roh, punkte_fein = [], 0, 0
    lats, lons = [], []
    for f in geo["features"]:
        name = f["properties"]["name"]
        gespeichert = []
        for ring in ringe(f["geometry"]):
            punkte_roh += len(ring)
            klein = vereinfachen([(lon, lat) for lon, lat in ring], TOLERANZ)
            if len(klein) < 4:                       # winzige Inseln weglassen
                continue
            punkte_fein += len(klein)
            lons += [p[0] for p in klein]
            lats += [p[1] for p in klein]
            gespeichert.append(kodieren(klein))
        laender.append([name, gespeichert])

    kreise = json.load(open(a.kreise, encoding="utf-8"))
    staedte = []
    for eintrag in kreise.values():
        name = eintrag["name"]
        # kreisfreie Städte ("SK"), dazu Berlin als Ganzes statt seiner Bezirke
        if name.startswith("SK Berlin"):
            continue
        if not (name.startswith("SK ") or name == "Berlin"):
            continue
        if eintrag["population"] < MIN_EINWOHNER:
            continue
        staedte.append({
            "n": name[3:] if name.startswith("SK ") else name,
            "la": round(eintrag["lat"], 4),
            "lo": round(eintrag["lon"], 4),
            "p": eintrag["population"],
        })
    for name, la, lo, pop, _land in EXTRA:
        staedte.append({"n": name, "la": la, "lo": lo, "p": pop})
    staedte.sort(key=lambda s: -s["p"])

    # Jede Stadt muss im Umriss liegen, die von Hand ergänzten zusätzlich im
    # genannten Bundesland — sonst stimmt etwas mit den Daten nicht
    nach_land = {}
    for name, gespeichert in laender:
        for ring in gespeichert:
            x, y = ring[0], ring[1]
            folge = [(x / Q, y / Q)]
            for i in range(2, len(ring), 2):
                x += ring[i]; y += ring[i + 1]
                folge.append((x / Q, y / Q))
            nach_land.setdefault(name, []).append(folge)

    def drinnen(lo, la, land=None):
        ringe_ = nach_land[land] if land else [r for rs in nach_land.values() for r in rs]
        for ring in ringe_:
            treffer = False
            for i in range(len(ring)):
                x1, y1 = ring[i - 1]
                x2, y2 = ring[i]
                if (y1 > la) != (y2 > la) and lo < x1 + (la - y1) / (y2 - y1) * (x2 - x1):
                    treffer = not treffer
            if treffer:
                return True
        return False

    for name, la, lo, _pop, land in EXTRA:
        if not drinnen(lo, la, land):
            raise SystemExit(f"{name} liegt nicht in {land} — Koordinate prüfen")
    daneben = [s["n"] for s in staedte if not drinnen(s["lo"], s["la"])]
    print(f'{len(laender)} Bundesländer, {punkte_roh} → {punkte_fein} Stützpunkte')
    print(f'{len(staedte)} Städte ab {MIN_EINWOHNER:,} Einwohnern'.replace(",", "."))
    print("außerhalb des Umrisses:", ", ".join(daneben) if daneben else "keine")

    daten = {
        "quelle": "deutschlandGeoJSON / covid-19-germany-gae (AGS)",
        "q": Q,
        "box": [round(min(lons), 3), round(min(lats), 3), round(max(lons), 3), round(max(lats), 3)],
        "laender": laender,
        "staedte": staedte,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("window.GEO_MAP = ")
        json.dump(daten, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("geschrieben:", a.out, os.path.getsize(a.out) // 1024, "KB")


if __name__ == "__main__":
    main()
