#!/usr/bin/env python3
"""Erzeugt poke/data.js: die ersten 150 Pokémon für Pokebrudis (PokeFind, PokePlay).

Quellen (werden nicht mitversioniert, siehe README):
  - PokeAPI/pokeapi   data/v2/csv/*.csv  (Namen, Typen, Farben, Körperformen,
                      Fundorte aus Rot, Blau und Gelb)
  - PokeAPI/sprites   sprites/pokemon/<id>.png  (96×96, kommen nach poke/sprites/)

Deutsch kommt direkt aus den Tabellen (language_id 6), nur die neun
Lebensräume stehen dort bloß englisch und werden hier übersetzt.

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

# Lebensräume und Körperformen stehen nur englisch in den Tabellen
FORM = {
    "Ball": "Kugel", "Squiggle": "Schlange", "Fish": "Fisch", "Arms": "Arme",
    "Blob": "Klecks", "Upright": "Aufrecht", "Legs": "Beine", "Quadruped": "Vierbeiner",
    "Wings": "Flügel", "Tentacles": "Tentakel", "Heads": "Köpfe", "Humanoid": "Humanoid",
    "Bug wings": "Insektenflügel", "Armor": "Panzer",
}

LEBENSRAUM = {
    "cave": "Höhle", "forest": "Wald", "grassland": "Wiese", "mountain": "Berge",
    "rare": "Selten", "rough terrain": "Ödland", "sea": "Meer", "urban": "Stadt",
    "water's edge": "Ufer",
}
BIS = 150                                   # die ersten 150, ohne Mew
GEN1 = {"1", "2", "3"}                      # Rot, Blau, Gelb

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
    formname = {z["pokemon_shape_id"]: FORM[z["name"]]
                for z in lies(weg("pokemon_shape_prose.csv")) if z["local_language_id"] == ENGLISCH}
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

    typen = {}
    for z in lies(weg("pokemon_types.csv")):
        typen.setdefault(z["pokemon_id"], []).append((int(z["slot"]), typname[z["type_id"]]))

    arten = lies(weg("pokemon_species.csv"), schluessel="id")
    liste = []
    for z in lies(weg("pokemon.csv")):
        sid = z["species_id"]
        if z["is_default"] != "1" or not sid.isdigit() or int(sid) > BIS:
            continue
        s = arten[sid]
        # Entwicklungsstufe: wie oft man zurückgehen kann, aber nur innerhalb der
        # ersten 150 — sonst stünde Pikachu wegen Pichu auf Stufe 2
        stufe, vor = 1, s["evolves_from_species_id"]
        while vor and int(vor) <= BIS:
            stufe += 1
            vor = arten[vor]["evolves_from_species_id"]
        liste.append({
            "id": int(sid),
            "name": art[sid]["name"],
            "genus": art[sid]["genus"],
            "types": [t for _, t in sorted(typen[z["id"]])],
            "height": int(z["height"]) / 10,                 # Dezimeter → Meter
            "weight": int(z["weight"]) / 10,                 # Hektogramm → Kilogramm
            "color": farbname[s["color_id"]],
            "shape": formname.get(s["shape_id"]),
            "habitat": ortname.get(s["habitat_id"] or ""),
            "places": orte.get(z["id"], []),              # leer = in Gen 1 nur durch Entwicklung
            "stage": stufe,
        })
    liste.sort(key=lambda p: p["id"])

    daten = {
        "quelle": "PokeAPI (pokeapi.co), CC BY-NC-SA",
        "pokemon": liste,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("window.POKE_DATA = ")
        json.dump(daten, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"{len(liste)} Pokémon")
    print("geschrieben:", a.out, os.path.getsize(a.out) // 1024, "KB")
    fehlt = [p["name"] for p in liste if not p["types"] or not p["shape"]]
    if fehlt:
        print("ohne Typ oder Form:", ", ".join(fehlt))
    print(f'{sum(1 for p in liste if not p["places"])} Pokémon ohne Fundort (nur Entwicklung)')


if __name__ == "__main__":
    main()
