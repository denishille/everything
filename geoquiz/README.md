# GeoQuiz – Land des Tages & GeoRankle

Vier tägliche Rätsel als reine Browser-App (HTML/CSS/JS, kein Build, kein
Server, keine Abhängigkeiten). Nachbau von trivi.gg „Daily Country“, Geotrivia
„GeoRankle“ und contexto.me.

## Spielen

`index.html` im Browser öffnen oder den Ordner statisch hosten (z. B. GitHub
Pages). Alles läuft lokal, Fortschritt und Serien liegen im `localStorage`.

## Land des Tages

- Ein geheimes Land pro Tag, für alle gleich (deterministisch aus dem Datum).
- 5 Versuche. Jeder Tipp zeigt Hinweise im Vergleich zum gesuchten Land:
  Kontinent, Einwohner, Fläche, BIP pro Kopf, Zahl der Nachbarländer,
  Küste/Binnenstaat, Flaggenfarben, Sprachen, Währung. Pfeile zeigen die
  Richtung, Gelb heißt „nah dran“ (bis Faktor 2 bzw. ±2 Nachbarn).
- Tolerante Eingabe: deutsche und englische Namen, Aliasse, ohne Akzente.
- Kleinststaaten unter 250.000 Einwohnern sind nie das gesuchte Land.
- Alle bisherigen Rätsel sind über Pfeile oder Auswahl spielbar, der Stand wird pro Rätsel gespeichert. Serie, Statistik, spoilerfreies Emoji-Raster zum Teilen.

## GeoRankle

- 8 Runden, je ein Land. Aus 24 Statistik-Kategorien die wählen, in der das
  Land weltweit am besten platziert ist. Jede Kategorie nur einmal pro Spiel.
- 100 Punkte für die beste noch verfügbare Kategorie, sonst
  `100 · e^(−(Rang − Bestrang)/40)`. Maximum 800.
- Jeden Tag ein neues Rätsel, alle bisherigen bleiben spielbar.

## GeoFlag

- 10 Runden, je eine Flagge und vier Länder zur Auswahl. Ablenker kommen
  bevorzugt vom selben Kontinent mit ähnlichen Flaggenfarben.
- Sofortige Rückmeldung, Ergebnis mit allen zehn Flaggen, Statistik.

## Wordplay

- Nachbau von contexto.me: ein gesuchtes Wort, beliebig viele Versuche.
- Jeder Tipp bekommt einen Rang. 1 ist das gesuchte Wort, 9910 das am weitesten
  entfernte; der Balken zeigt den Rang logarithmisch.
- Die Reihenfolge kommt aus der Bedeutungsnähe zweier Wörter (Kosinus zwischen
  ihren Wortvektoren). Gerechnet wird sie im Browser, beim Öffnen des Rätsels —
  deshalb kostet kein weiteres Rätsel zusätzliche Daten.
- `words.js` ist 1,9 MB (gepackt 1,0 MB) und wird erst geladen, wenn das Spiel
  geöffnet wird.
- **Groß- und Kleinschreibung zählt.** „fest“ und „Fest“ sind zwei Wörter mit
  zwei Vektoren und zwei Rängen. Wer groß schreibt, meint das Substantiv und
  bekommt nur das. Wer klein schreibt, bekommt beide Zeilen auf einmal — raten
  kostet ja nichts.
- Tolerant bei gebeugten Formen: „Häuser“, „lief“, „ging“ und „strasse“ finden
  Haus, laufen, gehen und Straße. Rund 51.000 solcher Schreibweisen sind
  hinterlegt, gerankt wird immer die Grundform.
- „Auflösen“ zeigt das Wort (zwei Klicks, der erste fragt nach). Das Rätsel gilt
  dann als erledigt, aber nicht als gelöst, und zählt nicht in der Statistik.

## Daten neu erzeugen

`data.js` (196 Länder: UN-Mitglieder plus Taiwan und Kosovo) wird aus offenen
Quellen gebaut:

- [mledoze/countries](https://github.com/mledoze/countries) – Namen,
  Übersetzungen, Grenzen, Sprachen, Währungen, Fläche
- [factbook/factbook.json](https://github.com/factbook/factbook.json) – CIA
  World Factbook (Bevölkerung, BIP, Lebenserwartung, Küste, CO₂ …)
- [lipis/flag-icons](https://github.com/lipis/flag-icons) – Flaggen als SVG
- [Natural Earth](https://github.com/nvkelso/natural-earth-vector) 1:50m
  admin_0_countries – Landesumrisse für die Entfernung Grenze zu Grenze und
  für die Karte im GeoFind-Ergebnis (`map.js`)

```bash
git clone --depth 1 https://github.com/factbook/factbook.json /tmp/factbook
git clone --depth 1 https://github.com/lipis/flag-icons /tmp/flag-icons
curl -o /tmp/countries.json https://raw.githubusercontent.com/mledoze/countries/master/countries.json

# Flaggenfarben (rastert die SVGs in headless Chromium)
python3 tools/flag_colors.py --countries /tmp/countries.json \
    --flags /tmp/flag-icons/flags/4x3 --chrome "$(which chromium)" --out tools/flagcolors.json

python3 tools/build_data.py --countries /tmp/countries.json --factbook /tmp/factbook \
    --flags /tmp/flag-icons/flags/4x3 --colors tools/flagcolors.json --out data.js

# Entfernungen Grenze zu Grenze (braucht data.js für die Nachbarlisten), danach data.js neu bauen
curl -o /tmp/ne50.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
node tools/build_distances.js /tmp/ne50.geojson data.js tools/distances.json
python3 tools/build_data.py ... --out data.js

# Umrisse für die kleine Karte im Ergebnis (stark vereinfacht, ~100 KB)
python3 tools/build_map.py --geo /tmp/ne50.geojson --data data.js --out map.js
```

## Logo statt Schriftzug

Eine Datei `geoquiz/logo.svg` (auch `.png`, `.webp`, `.jpg`) ablegen, dann
zeigt die Kopfzeile das Logo anstelle des Schriftzugs „Geobrudis“. Ohne Datei
bleibt der Schriftzug. Höhe wird automatisch auf 30 px skaliert (26 px auf dem
Handy), am besten ein SVG oder ein PNG mit mindestens 120 px Höhe und
transparentem Hintergrund. `tools/build_single.py` bettet das Logo als
data-URI in `geoquiz.html` ein.
`words.js` (9910 Wörter mit Vektoren, davon 1939 als Rätselwort, dazu rund
51.000 weitere Schreibweisen) braucht `pip install spacy numpy` und diese
Quellen:

- [explosion/spacy-models](https://github.com/explosion/spacy-models) –
  `de_core_news_md`, 20.000 Wortvektoren mit 300 Dimensionen
- [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) –
  Worthäufigkeit, bestimmt Auswahl und Reihenfolge
- [gambolputty/german-nouns](https://github.com/gambolputty/german-nouns) –
  Substantive: Großschreibung und der Vorrat an Rätselwörtern
- [michmech/lemmatization-lists](https://github.com/michmech/lemmatization-lists) –
  Grundformen und ihre gebeugten Formen

Die 300 Dimensionen des Modells werden dabei auf 192 gestaucht und mit 4 Bit je
Dimension gespeichert. Das ist genauso groß wie 96 Dimensionen zu 8 Bit, trifft
die Nachbarschaft des Originalmodells aber besser (0,77 statt 0,72 der zehn
nächsten Nachbarn).

```bash
curl -LO https://github.com/explosion/spacy-models/releases/download/de_core_news_md-3.7.0/de_core_news_md-3.7.0-py3-none-any.whl
curl -o /tmp/de_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt
curl -o /tmp/nouns.csv https://raw.githubusercontent.com/gambolputty/german-nouns/main/german_nouns/nouns.csv
curl -o /tmp/lemmatization-de.txt https://raw.githubusercontent.com/michmech/lemmatization-lists/master/lemmatization-de.txt

python3 tools/build_words.py --model de_core_news_md-3.7.0-py3-none-any.whl \
    --freq /tmp/de_50k.txt --nouns /tmp/nouns.csv --lemmas /tmp/lemmatization-de.txt --out words.js
```

## Hosten (Cloudflare Pages)

Kein Build nötig, alles ist statisch. Zwei Wege:

1. **Ordner deployen:** Cloudflare Pages → Projekt aus dem GitHub-Repo anlegen,
   Production-Branch `main`, Build-Befehl leer lassen, Build-Output-Verzeichnis
   `geoquiz`. Jeder Push auf `main` deployt automatisch.
2. **Einzeldatei:** `python3 tools/build_single.py` erzeugt `geoquiz.html` mit
   allem drin. Diese Datei als `index.html` per Direct Upload hochladen.
