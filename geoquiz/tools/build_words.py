#!/usr/bin/env python3
"""Erzeugt geoquiz/words.js: Wortliste und Wortvektoren für Wordplay.

Wordplay braucht zu jedem Rätselwort eine Rangfolge aller Wörter nach
Bedeutungsnähe. Die wird nicht vorberechnet, sondern im Browser aus
Wortvektoren gerechnet — dann kostet ein Rätsel keine zusätzlichen Daten und
alle künftigen Rätsel stecken schon in dieser einen Datei.

Damit das ins Netz passt, werden die 300 Dimensionen des Modells per
Hauptkomponentenanalyse auf --dims gestaucht und je Dimension auf ein Byte
quantisiert. Bei 96 Dimensionen bleibt die Nachbarschaft der Wörter dabei
praktisch erhalten (Stichprobe: ~3/4 der zehn nächsten Nachbarn identisch),
bei rund einem Drittel der Größe.

Quellen (werden nicht mitversioniert, siehe README):
  - explosion/spacy-models  de_core_news_md (Wortvektoren, 20.000 × 300)
  - hermitdave/FrequencyWords  de_50k.txt (Häufigkeit, bestimmt die Wortliste)
  - gambolputty/german-nouns   nouns.csv  (Substantive: Großschreibung, Rätselwörter)
  - michmech/lemmatization-lists  lemmatization-de.txt (nur Grundformen behalten)

Aufruf:
  python3 tools/build_words.py --model de_core_news_md-3.7.0-py3-none-any.whl \
      --freq de_50k.txt --nouns nouns.csv --lemmas lemmatization-de.txt --out words.js
"""
import argparse
import base64
import csv
import io
import json
import os
import re
import sys
import zipfile

import numpy as np
import srsly
from spacy.strings import hash_string

WORT = re.compile(r"^[a-zäöüßA-ZÄÖÜ]{3,18}$")

# Substantive, die als Rätselwort nichts taugen: Funktionswörter, die im
# Wörterbuch auch als Substantiv stehen (das Aber, das Sein), Interjektionen,
# Abkürzungen — und Derbes, das im Untertitel-Korpus weit oben steht.
GESPERRT = {
    "nein", "hallo", "warte", "schau", "dank", "leid", "miss", "bisschen", "namen", "bestes",
    "trage", "schrieb", "amen", "king", "sir", "madam", "mister", "lady", "boss", "baby",
    "arsch", "hure", "scheiße", "titten", "schwanz", "nutte", "fotze", "wichser", "bastard",
    "penis", "sex", "kacke", "pisse", "hurensohn", "schlampe", "nigger", "neger",
}

# Rätselwörter kommen aus den häufigsten Wörtern; weiter hinten wird es zu speziell.
POOL_BIS = 4500


def vokabular(model, freq, nouns, lemmas):
    """Wortliste in Häufigkeitsreihenfolge, je Wort die Zeile im Vektormodell."""
    if model.endswith(".whl"):
        z = zipfile.ZipFile(model)
        pfad = next(n for n in z.namelist() if n.endswith("/vocab/vectors"))[: -len("vectors")]
        lies = lambda n: z.read(pfad + n)
    else:
        lies = lambda n: open(os.path.join(model, "vocab", n), "rb").read()

    vektoren = np.load(io.BytesIO(lies("vectors")))
    key2row = srsly.msgpack_loads(lies("key2row"))
    zeile = lambda w: key2row.get(hash_string(w))

    grundformen = set()
    with open(lemmas, encoding="utf-8") as f:
        for line in f:
            grundformen.add(line.rstrip("\n").split("\t")[0].lstrip("\ufeff"))

    substantive, eigennamen = {}, set()
    with open(nouns, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pos, lemma = row["pos"] or "", row["lemma"]
            if "Substantiv" not in pos or not lemma[:1].isupper():
                continue
            substantive.setdefault(lemma.lower(), lemma)
            if {"Toponym", "Vorname", "Nachname", "Eigenname"} & set(pos.split(",")):
                eigennamen.add(lemma.lower())

    woerter, zeilen, pool, belegt = [], [], [], set()
    with open(freq, encoding="utf-8") as f:
        for line in f:
            klein = line.split(" ")[0]
            if not WORT.match(klein):
                continue
            # Groß oder klein? Die Schreibweise gewinnt, die im Modell häufiger
            # ist (kleinere Zeilennummer) — so wird aus "hund" das Substantiv
            # "Hund", aus "Ich" aber das Pronomen "ich".
            kandidaten = [(zeile(w), w) for w in {klein, substantive.get(klein, klein)} if zeile(w) is not None]
            if not kandidaten:
                continue
            r, wort = min(kandidaten)
            # Gebeugte Formen raus: eine Grundform je Bedeutung reicht.
            if r in belegt or not (wort in grundformen or klein in grundformen or klein in substantive):
                continue
            belegt.add(r)
            i = len(woerter)
            woerter.append(wort)
            zeilen.append(r)
            raetselwort = (
                i < POOL_BIS
                and len(wort) >= 4
                and wort[0].isupper()
                and klein in substantive
                and klein not in eigennamen
                and klein not in grundformen  # schließt Wörter aus, die auch Verb oder Adjektiv sind
                and klein not in GESPERRT
            )
            if raetselwort:
                pool.append(i)
    return woerter, vektoren[zeilen].astype(np.float32), pool


def stauchen(X, dims):
    """Auf dims Hauptkomponenten projizieren und je Dimension auf int8 quantisieren."""
    X = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    X = X - X.mean(0)
    _, _, basis = np.linalg.svd(X, full_matrices=False)
    P = X @ basis[:dims].T
    skala = np.abs(P).max(0) / 127.0
    Q = np.round(P / skala).clip(-127, 127).astype(np.int8)
    return Q, skala


def probe(woerter, Q, skala, beispiele=("Hund", "Winter", "Musik", "Meer")):
    """Zur Kontrolle: die nächsten Nachbarn so, wie der Browser sie sehen wird."""
    M = Q.astype(np.float32) * skala
    M /= np.linalg.norm(M, axis=1, keepdims=True) + 1e-9
    idx = {w: i for i, w in enumerate(woerter)}
    for w in beispiele:
        if w not in idx:
            continue
        s = M @ M[idx[w]]
        nah = [woerter[i] for i in np.argsort(-s)[:9] if i != idx[w]]
        print(f"  {w:14} {', '.join(nah)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="de_core_news_md (.whl oder entpacktes Verzeichnis)")
    ap.add_argument("--freq", required=True)
    ap.add_argument("--nouns", required=True)
    ap.add_argument("--lemmas", required=True)
    ap.add_argument("--dims", type=int, default=96)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    woerter, X, pool = vokabular(a.model, a.freq, a.nouns, a.lemmas)
    print(f"{len(woerter)} Wörter, davon {len(pool)} als Rätselwort")
    if len(pool) < 365:
        sys.exit("zu wenige Rätselwörter")

    Q, skala = stauchen(X, a.dims)
    print(f"{a.dims} Dimensionen, {Q.nbytes // 1024} KB Vektoren")
    probe(woerter, Q, skala)

    daten = {
        "quelle": "de_core_news_md / FrequencyWords / german-nouns",
        "dim": a.dims,
        "skala": [round(float(s), 8) for s in skala],
        "woerter": ",".join(woerter),
        "pool": pool,
        "vek": base64.b64encode(Q.tobytes()).decode("ascii"),
    }
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("window.WORD_DATA = ")
        json.dump(daten, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("geschrieben:", a.out, os.path.getsize(a.out) // 1024, "KB")


if __name__ == "__main__":
    main()
