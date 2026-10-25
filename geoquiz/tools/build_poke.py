#!/usr/bin/env python3
"""Erzeugt poke/data.js: die ersten 150 Pokémon für Pokebrudis.

Quellen (werden nicht mitversioniert, siehe README):
  - PokeAPI/pokeapi   data/v2/csv/*.csv  (Namen, Typen, Werte, Farben, Eigruppen,
                      Fundorte aus Rot, Blau und Gelb)
  - PokeAPI/sprites   sprites/pokemon/<id>.png  (96×96, kommen nach poke/sprites/)

Deutsch kommt direkt aus den Tabellen (language_id 6). Die Ränge je Kategorie
rechnet dieses Skript vor, damit PokeRank im Browser nichts sortieren muss.

Aufruf:
  python3 tools/build_poke.py --csv pokeapi/data/v2/csv --out poke/data.js
"""
import argparse
import csv
import json
import math
import os

DEUTSCH = "6"
ENGLISCH = "9"

# Lebensräume stehen nur englisch in den Tabellen
LEBENSRAUM = {
    "cave": "Höhle", "forest": "Wald", "grassland": "Wiese", "mountain": "Berge",
    "rare": "Selten", "rough terrain": "Ödland", "sea": "Meer", "urban": "Stadt",
    "water's edge": "Ufer",
}
BIS = 150                                   # die ersten 150, ohne Mew
GEN1 = {"1", "2", "3"}                      # Rot, Blau, Gelb

# Kategorien für PokeRank: Schlüssel, Name, Einheit, Format, Erklärung.
# Rang 1 ist immer "am meisten" — auch da, wo das nichts Gutes heißt.
KATEGORIEN = [
    ("hp", "Meiste KP", "", "int", "Basis-KP, Rang 1 = am meisten"),
    ("atk", "Höchster Angriff", "", "int", "Basiswert Angriff, Rang 1 = am höchsten"),
    ("def", "Höchste Verteidigung", "", "int", "Basiswert Verteidigung, Rang 1 = am höchsten"),
    ("spa", "Höchster Spezial-Angriff", "", "int", "Basiswert Spezial-Angriff, Rang 1 = am höchsten"),
    ("spd", "Höchste Spezial-Verteidigung", "", "int", "Basiswert Spezial-Verteidigung, Rang 1 = am höchsten"),
    ("spe", "Höchste Initiative", "", "int", "Basiswert Initiative, Rang 1 = am höchsten"),
    ("total", "Höchste Werte gesamt", "", "int", "Summe der sechs Basiswerte, Rang 1 = am höchsten"),
    ("weight", "Schwerstes Pokémon", "kg", "dec1", "Gewicht, Rang 1 = am schwersten"),
    ("height", "Größtes Pokémon", "m", "dec1", "Größe, Rang 1 = am größten"),
    ("exp", "Meiste Basis-Erfahrung", "EP", "int", "Erfahrungspunkte beim Besiegen, Rang 1 = am meisten"),
    ("gen", "Niedrigste Pokédex-Nummer", "", "int", "Rang 1 = Nummer 1"),
]


def lies(pfad, *, schluessel=None):
    with open(pfad, newline="", encoding="utf-8") as f:
        zeilen = list(csv.DictReader(f))
    return {z[schluessel]: z for z in zeilen} if schluessel else zeilen


def namen(pfad, id_spalte, name_spalte="name"):
    """Deutsche Namen aus einer *_names-Tabelle."""
    return {z[id_spalte]: z[name_spalte] for z in lies(pfad) if z["local_language_id"] == DEUTSCH}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="Verzeichnis mit den PokeAPI-CSVs")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    weg = lambda n: os.path.join(a.csv, n)

    typname = namen(weg("type_names.csv"), "type_id")
    farbname = namen(weg("pokemon_color_names.csv"), "pokemon_color_id")
    ortname = {z["pokemon_habitat_id"]: LEBENSRAUM[z["name"]]
               for z in lies(weg("pokemon_habitat_names.csv")) if z["local_language_id"] == ENGLISCH}
    einame = {z["egg_group_id"]: z["name"] for z in lies(weg("egg_group_prose.csv"))
              if z["local_language_id"] == DEUTSCH}

    art = {z["pokemon_species_id"]: z for z in lies(weg("pokemon_species_names.csv"))
           if z["local_language_id"] == DEUTSCH}

    # Fundorte aus Rot, Blau und Gelb: Begegnung → Gebiet → Ort → deutscher Name
    gebiet = {z["id"]: z["location_id"] for z in lies(weg("location_areas.csv"))}
    ortsname = {z["location_id"]: z["name"] for z in lies(weg("location_names.csv"))
                if z["local_language_id"] == DEUTSCH}
    orte = {}
    for z in lies(weg("encounters.csv")):
        if z["version_id"] not in GEN1:
            continue
        name = ortsname.get(gebiet[z["location_area_id"]])
        liste = orte.setdefault(z["pokemon_id"], [])
        if name and name not in liste:
            liste.append(name)

    typen, werte, eier = {}, {}, {}
    for z in lies(weg("pokemon_types.csv")):
        typen.setdefault(z["pokemon_id"], []).append((int(z["slot"]), typname[z["type_id"]]))
    for z in lies(weg("pokemon_stats.csv")):
        werte.setdefault(z["pokemon_id"], {})[z["stat_id"]] = int(z["base_stat"])
    for z in lies(weg("pokemon_egg_groups.csv")):
        eier.setdefault(z["species_id"], []).append(einame[z["egg_group_id"]])

    arten = lies(weg("pokemon_species.csv"), schluessel="id")
    liste = []
    for z in lies(weg("pokemon.csv")):
        sid = z["species_id"]
        if z["is_default"] != "1" or not sid.isdigit() or int(sid) > BIS:
            continue
        s, w = arten[sid], werte[z["id"]]
        # Entwicklungsstufe: wie oft man zurückgehen kann
        stufe, vor = 1, s["evolves_from_species_id"]
        while vor:
            stufe += 1
            vor = arten[vor]["evolves_from_species_id"]
        liste.append({
            "id": int(sid),
            "name": art[sid]["name"],
            "genus": art[sid]["genus"],
            "types": [t for _, t in sorted(typen[z["id"]])],
            "stats": {"hp": w["1"], "atk": w["2"], "def": w["3"], "spa": w["4"], "spd": w["5"], "spe": w["6"]},
            "height": int(z["height"]) / 10,                 # Dezimeter → Meter
            "weight": int(z["weight"]) / 10,                 # Hektogramm → Kilogramm
            "exp": int(z["base_experience"] or 0),
            "catch": int(s["capture_rate"]),
            "color": farbname[s["color_id"]],
            "habitat": ortname.get(s["habitat_id"] or ""),
            "eggs": sorted(eier.get(sid, [])),
            "places": orte.get(z["id"], []),              # leer = in Gen 1 nur durch Entwicklung
            "chain": int(s["evolution_chain_id"]),
            "stage": stufe,
            "legend": s["is_legendary"] == "1" or s["is_mythical"] == "1",
        })
    liste.sort(key=lambda p: p["id"])

    # Werte, nach denen PokeRank sortiert
    def wert(p, key):
        if key in p["stats"]:
            return p["stats"][key]
        if key == "total":
            return sum(p["stats"].values())
        if key == "gen":
            return -p["id"]
        return p[key]

    for key, *_ in KATEGORIEN:
        for rang, p in enumerate(sorted(liste, key=lambda p: -wert(p, key)), 1):
            p.setdefault("ranks", {})[key] = rang
            p.setdefault("vals", {})[key] = wert(p, key) if key != "gen" else -wert(p, key)

    daten = {
        "quelle": "PokeAPI (pokeapi.co), CC BY-NC-SA",
        "categories": [dict(zip(("key", "name", "unit", "fmt", "desc"), k)) for k in KATEGORIEN],
        "pokemon": liste,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("window.POKE_DATA = ")
        json.dump(daten, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"{len(liste)} Pokémon, {len(KATEGORIEN)} Kategorien")
    print("geschrieben:", a.out, os.path.getsize(a.out) // 1024, "KB")
    fehlt = [p["name"] for p in liste if not p["types"] or not p["eggs"]]
    if fehlt:
        print("ohne Typ oder Eigruppe:", ", ".join(fehlt))
    print(f'{sum(1 for p in liste if not p["places"])} Pokémon ohne Fundort (nur Entwicklung)')


if __name__ == "__main__":
    main()
