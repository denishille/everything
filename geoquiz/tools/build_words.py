#!/usr/bin/env python3
"""Erzeugt geoquiz/words.js: Wortliste und Wortvektoren für Wordplay.

Wordplay braucht zu jedem Rätselwort eine Rangfolge aller Wörter nach
Bedeutungsnähe. Die wird nicht vorberechnet, sondern im Browser aus
Wortvektoren gerechnet — dann kostet ein Rätsel keine zusätzlichen Daten und
alle künftigen Rätsel stecken schon in dieser einen Datei.

Drei Dinge, die dabei wichtig sind:

* **Groß- und Kleinschreibung.** „fest" und „Fest" sind im Modell zwei Wörter
  mit zwei Vektoren. Beide kommen in die Liste, sonst ist das Substantiv nicht
  erreichbar, weil das häufigere Adjektiv es verdeckt.
* **Wortformen.** Gerankt wird eine Grundform je Vektor, aber „Hunde",
  „Hundes" und „hunde" sollen trotzdem gefunden werden. Solche Formen stehen
  als Aliasse dabei und zeigen auf ihre Grundform.
* **Größe.** Die 300 Dimensionen des Modells werden per Hauptkomponenten-
  analyse auf --dims gestaucht und mit --bits Bit je Dimension quantisiert.
  192 Dimensionen zu 4 Bit sind genauso groß wie 96 zu 8 Bit, treffen die
  Nachbarschaft des Originals aber deutlich besser (Stichprobe: 0,77 statt
  0,72 der zehn nächsten Nachbarn).

Quellen (werden nicht mitversioniert, siehe README):
  - explosion/spacy-models  de_core_news_md (Wortvektoren, 20.000 × 300)
  - hermitdave/FrequencyWords  de_50k.txt (Häufigkeit, bestimmt die Wortliste)
  - gambolputty/german-nouns   nouns.csv  (Substantive: Großschreibung, Rätselwörter)
  - michmech/lemmatization-lists  lemmatization-de.txt (Grundformen und ihre Formen)

Aufruf:
  python3 tools/build_words.py --model de_core_news_md-3.7.0-py3-none-any.whl \
      --freq de_50k.txt --nouns nouns.csv --lemmas lemmatization-de.txt --out words.js
"""
import argparse
import base64
import collections
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
    "gerade", "weiß", "bitte", "selbst", "fremde", "oberst", "ficken",
}

# Gleiche Schreibweise, mehrere Bedeutungen: der Vektor mischt sie und das
# Rätsel wird unfair (bei „Pass" liegen Elfmeter und Visum gleich weit vorn).
MEHRDEUTIG = {
    "pass", "bank", "schloss", "hahn", "kiefer", "steuer", "zug", "mutter", "gericht",
    "flügel", "leiter", "strom", "blatt", "schild", "ton", "kanal", "golf", "reif",
    "messe", "bar", "kegel", "tor", "star", "linse", "mole", "hut", "kluft", "otter",
}

# Rätselwörter kommen aus den häufigsten Wörtern; weiter hinten wird es zu speziell.
POOL_BIS = 4500


def modell(pfad):
    """Vektoren und die Zeilennummer je Wort aus dem spaCy-Modell."""
    if pfad.endswith(".whl"):
        z = zipfile.ZipFile(pfad)
        basis = next(n for n in z.namelist() if n.endswith("/vocab/vectors"))[: -len("vectors")]
        lies = lambda n: z.read(basis + n)
    else:
        lies = lambda n: open(os.path.join(pfad, "vocab", n), "rb").read()
    vektoren = np.load(io.BytesIO(lies("vectors")))
    key2row = srsly.msgpack_loads(lies("key2row"))
    return vektoren, (lambda w: key2row.get(hash_string(w)))


EIGENNAME = {"Toponym", "Vorname", "Nachname", "Eigenname", "Straßenname"}


def quellen(nouns, lemmas):
    """Substantive (mit Großschreibung), Eigennamen und Grundform → Wortformen."""
    substantive, nur_name = {}, {}
    with open(nouns, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pos, lemma = row["pos"] or "", row["lemma"]
            if "Substantiv" not in pos or not lemma[:1].isupper():
                continue
            substantive.setdefault(lemma.lower(), lemma)
            # Nur wer ausschließlich Name ist, ist ein Eigenname: Winter und Berg
            # stehen auch als Nachname im Wörterbuch, sind aber ganz normale Wörter.
            name = bool(EIGENNAME & set(pos.split(",")))
            nur_name[lemma.lower()] = nur_name.get(lemma.lower(), True) and name
    eigennamen = {w for w, nur in nur_name.items() if nur}

    formen = collections.defaultdict(set)
    with open(lemmas, encoding="utf-8") as f:
        for line in f:
            teile = line.rstrip("\n").split("\t")
            if len(teile) != 2:
                continue
            grundform, form = teile[0].lstrip("﻿"), teile[1]
            if WORT.match(form):
                formen[grundform].add(form)
    return substantive, eigennamen, formen


def taugt_als_raetsel(wort, klein, r_gross, r_klein, substantive, eigennamen, grundformen):
    """Ist das ein Substantiv, das man suchen lassen kann?

    Heikel sind Großschreibungen, die es nur als Nominalisierung gibt: „das
    Aber", „das Sein", „das Können". Sie verraten sich daran, dass die
    Kleinschreibung im Modell die häufigere ist — bei echten Substantiven ist es
    umgekehrt oder gleich (Winter, Schokolade, Haus).

    Ausnahme sind Paare aus Adjektiv und Substantiv wie fest/Fest oder
    recht/Recht: dort ist die Kleinschreibung zwar häufiger, das Substantiv aber
    trotzdem ein ganz normales Wort. Die erkennt man daran, dass die
    Kleinschreibung eine Grundform ist (also ein Adjektiv, kein Funktionswort
    und kein Infinitiv) und nicht um Größenordnungen häufiger.
    """
    if not (len(wort) >= 4 and wort[0].isupper() and klein in substantive):
        return False
    if klein in eigennamen or klein in GESPERRT or klein in MEHRDEUTIG:
        return False
    if r_klein is not None and r_gross > r_klein:
        adjektivpaar = (klein in grundformen and not klein.endswith(("en", "n"))
                        and r_gross <= 5 * r_klein)
        if not adjektivpaar:
            return False
    return True


def vokabular(freq, zeile, substantive, eigennamen, grundformen):
    """Eine Grundform je Vektorzeile, in Häufigkeitsreihenfolge.

    Klein- und Großschreibung werden getrennt geprüft: steht das Substantiv im
    Modell auf einer eigenen Zeile, bekommt es einen eigenen Eintrag.
    """
    woerter, zeilen, pool, belegt = [], [], [], set()
    with open(freq, encoding="utf-8") as f:
        for line in f:
            klein = line.split(" ")[0]
            if not WORT.match(klein):
                continue
            gross = substantive.get(klein)
            kandidaten = [(klein, klein in grundformen)]
            if gross and gross != klein:
                kandidaten.append((gross, True))          # Substantive sind immer Grundform
            r_klein = zeile(klein)
            for wort, ist_grundform in kandidaten:
                r = zeile(wort)
                if r is None or r in belegt or not ist_grundform:
                    continue
                belegt.add(r)
                i = len(woerter)
                woerter.append(wort)
                zeilen.append(r)
                if (wort != klein and i < POOL_BIS
                        and taugt_als_raetsel(wort, klein, r, r_klein,
                                              substantive, eigennamen, grundformen)):
                    pool.append(i)
    return woerter, zeilen, pool


def aliasse(woerter, zeilen, freq, zeile, formen):
    """Schreibweisen, die auf ein Wort der Liste zeigen sollen.

    Zwei Quellen: die gebeugten Formen aus der Lemmaliste und alles aus der
    Häufigkeitsliste, das im Modell auf derselben Zeile landet (Plural,
    Schweizer ss, Tippfehler aus den Untertiteln).
    """
    zeile_zu_wort = {r: i for i, r in enumerate(zeilen)}
    bekannt = {w.lower() for w in woerter}
    treffer = collections.defaultdict(set)

    for i, w in enumerate(woerter):
        for form in formen.get(w, ()):
            if form.lower() not in bekannt:
                treffer[i].add(form.lower())

    with open(freq, encoding="utf-8") as f:
        for line in f:
            w = line.split(" ")[0]
            if not WORT.match(w) or w.lower() in bekannt:
                continue
            r = zeile(w)
            i = zeile_zu_wort.get(r) if r is not None else None
            if i is not None:
                treffer[i].add(w.lower())

    # Eine Schreibweise gehört zu genau einem Wort — bei Streit gewinnt das häufigere.
    vergeben, sauber = {}, collections.defaultdict(set)
    for i in sorted(treffer):
        for form in treffer[i]:
            if form not in vergeben:
                vergeben[form] = i
                sauber[i].add(form)
    return ["|".join(sorted(sauber.get(i, ()))) for i in range(len(woerter))], len(vergeben)


def stauchen(X, dims, bits):
    """Auf dims Hauptkomponenten projizieren und je Dimension auf bits Bit quantisieren."""
    X = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    X = X - X.mean(0)
    _, _, basis = np.linalg.svd(X, full_matrices=False)
    P = X @ basis[:dims].T
    stufen = 2 ** (bits - 1) - 1
    skala = np.abs(P).max(0) / stufen
    Q = np.round(P / skala).clip(-stufen, stufen).astype(np.int8)
    return Q, skala


def packen(Q, bits):
    """int8 direkt, 4 Bit paarweise in ein Byte (unteres Halbbyte zuerst, Versatz 8)."""
    if bits == 8:
        return Q.tobytes()
    u = (Q + 8).astype(np.uint8)
    return (u[:, 0::2] | (u[:, 1::2] << 4)).tobytes()


def probe(woerter, Q, skala, beispiele=("Hund", "Winter", "Musik", "Fest")):
    """Zur Kontrolle: die nächsten Nachbarn so, wie der Browser sie sehen wird."""
    M = Q.astype(np.float32) * skala
    M /= np.linalg.norm(M, axis=1, keepdims=True) + 1e-9
    idx = {w: i for i, w in enumerate(woerter)}
    for w in beispiele:
        if w in idx:
            nah = [woerter[i] for i in np.argsort(-(M @ M[idx[w]]))[:9] if i != idx[w]]
            print(f"  {w:14} {', '.join(nah)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="de_core_news_md (.whl oder entpacktes Verzeichnis)")
    ap.add_argument("--freq", required=True)
    ap.add_argument("--nouns", required=True)
    ap.add_argument("--lemmas", required=True)
    ap.add_argument("--dims", type=int, default=192)
    ap.add_argument("--bits", type=int, default=4, choices=(4, 8))
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    vektoren, zeile = modell(a.model)
    substantive, eigennamen, formen = quellen(a.nouns, a.lemmas)
    woerter, zeilen, pool = vokabular(a.freq, zeile, substantive, eigennamen, set(formen))
    alias, n_alias = aliasse(woerter, zeilen, a.freq, zeile, formen)
    print(f"{len(woerter)} Wörter, {n_alias} weitere Schreibweisen, {len(pool)} Rätselwörter")
    if len(pool) < 365:
        sys.exit("zu wenige Rätselwörter")

    Q, skala = stauchen(vektoren[zeilen].astype(np.float32), a.dims, a.bits)
    roh = packen(Q, a.bits)
    print(f"{a.dims} Dimensionen à {a.bits} Bit, {len(roh) // 1024} KB Vektoren")
    probe(woerter, Q, skala)

    daten = {
        "quelle": "de_core_news_md / FrequencyWords / german-nouns / lemmatization-lists",
        "dim": a.dims,
        "bits": a.bits,
        "skala": [round(float(s), 8) for s in skala],
        "woerter": ",".join(woerter),
        "alias": ",".join(alias),
        "pool": pool,
        "vek": base64.b64encode(roh).decode("ascii"),
    }
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("window.WORD_DATA = ")
        json.dump(daten, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("geschrieben:", a.out, os.path.getsize(a.out) // 1024, "KB")


if __name__ == "__main__":
    main()
