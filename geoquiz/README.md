# GeoQuiz – tägliche Rätsel

Reine Browser-App (HTML/CSS/JS, kein Build, kein Server, keine
Abhängigkeiten) in drei Bereichen. Der Knopf oben rechts schaltet im Kreis
weiter, eine Navigation gibt es bewusst nicht:

| Bereich | Ordner | Spiele | Knopf führt zu |
|---|---|---|---|
| **Geobrudis** | `/` | GeoFind, GeoRank, GeoFlag, GeoMap (Deutschland & Welt) | Pokebrudis |
| **Pokebrudis** | `poke/` | PokeFind, PokePlay | Spielbrudis |
| **Spielbrudis** | `spiele/` | Wordplay | Geobrudis |

Nachbau von trivi.gg „Daily Country“, Geotrivia „GeoRankle“ und contexto.me,
dazu GeoMap.

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

- 8 Runden, je ein Land. Aus 19 Statistik-Kategorien die wählen, in der das
  Land in der Weltrangliste am weitesten vorn steht. Jede Kategorie nur einmal
  pro Spiel. „Vorn" heißt dabei schlicht Rang 1 der Liste, nicht gut: bei
  Alkoholkonsum, Inflation oder CO₂-Ausstoß führt, wer am meisten hat.
- Punkte nach Perzentil: 100, wenn das Land in dieser Kategorie das beste der
  acht ist, 0 für das schlechteste, dazwischen linear. Maximum 800.
- Jeden Tag ein neues Rätsel, alle bisherigen bleiben spielbar.

## GeoFlag

- 10 Runden, je eine Flagge und vier Länder zur Auswahl. Ablenker kommen
  bevorzugt vom selben Kontinent mit ähnlichen Flaggenfarben.
- Sofortige Rückmeldung, Ergebnis mit allen zehn Flaggen, Statistik.

## Wordplay (unter `spiele/`)

- Nachbau von contexto.me: ein gesuchtes Wort, beliebig viele Versuche.
- Jeder Tipp bekommt einen Rang. 1 ist das gesuchte Wort, 10.000 das am
  weitesten entfernte; der Balken zeigt den Rang logarithmisch.
- Erraten werden darf jedes der 22.732 Wörter, gezählt wird aber nur gegen die
  10.000 häufigsten. Sonst drängeln sich seltene Komposita vor: zu „Musik“
  lägen Radiomusik, Jazzmusik und Tanzmusik auf den ersten Plätzen, und alles,
  was man wirklich tippt, bekäme eine viel größere Zahl.
- Die Reihenfolge kommt aus der Bedeutungsnähe zweier Wörter (Kosinus zwischen
  ihren Wortvektoren). Gerechnet wird sie im Browser, beim Öffnen des Rätsels —
  deshalb kostet kein weiteres Rätsel zusätzliche Daten.
- `words.js` ist 2,7 MB (gepackt 1,6 MB) und wird erst geladen, wenn das Spiel
  geöffnet wird.
- **Groß- und Kleinschreibung zählt.** „fest“ und „Fest“ sind zwei Wörter mit
  zwei Vektoren und zwei Rängen. Wer groß schreibt, meint das Substantiv und
  bekommt nur das. Wer klein schreibt, bekommt beide Zeilen auf einmal — raten
  kostet ja nichts.
- Tolerant bei gebeugten Formen: „Häuser“, „lief“, „ging“ und „kindern“ finden
  Haus, laufen, gehen und Kind. Rund 11.000 solcher Formen sind hinterlegt,
  gerankt wird immer die Grundform.
- Gesucht wird nie ein Schimpfwort, ein Name oder ein Wort mit mehreren
  Bedeutungen (bei „Pass“ lägen Elfmeter und Visum gleich weit vorn). Raten
  darf man sie trotzdem alle.
- „Tipp“ verrät ein Wort, das halb so weit weg ist wie der bisher beste
  Treffer — ohne eigenen Treffer fängt es bei Rang 1000 an, danach 500, 250,
  125 … Tipps stehen mit Marke in der Liste und zählen als Versuch.
  Schimpfwörter schlägt das Spiel dabei nie vor.
- „Auflösen“ zeigt das Wort (zwei Klicks, der erste fragt nach). Das Rätsel gilt
  dann als erledigt, aber nicht als gelöst, und zählt nicht in der Statistik.

## GeoMap

Zwei Karten, dieselbe Mechanik. Der Umschalter neben der Überschrift wechselt
zwischen **Deutschland** (Städte) und **Welt** (Länder); jeder Modus hat
eigene Rätsel, eigenen Spielstand und eigene Statistik, die Wahl wird
gemerkt.

- 8 Runden, je ein Ziel. Auf die Karte tippen, „Setzen“, dann zeigt die
  Karte das Ziel und die Luftlinie. „Setzen“ klebt auf der Karte und bleibt
  dort auch beim Zoomen — in Deutschland unten rechts (da liegt Österreich),
  in der Welt unten links (Südpazifik), damit kein Ziel verdeckt wird.
- Punkte linear nach Entfernung: 100 am Ziel, 0 ab 250 km (Deutschland) bzw.
  2000 km (Welt). Maximum 800.
- **Deutschland:** gesucht sind die 71 kreisfreien Städte ab 100.000
  Einwohnern, dazu Hannover, Aachen und Saarbrücken (die sind nicht
  kreisfrei, gehören aber dazu). Gezogen wird nach Einwohnerzahl gewichtet —
  Berlin kommt öfter dran als Remscheid, drankommen kann jede. Der große
  schwarze Punkt ist die Stadt, der kleine farbige Ring dein Tipp. Die Karte
  sind die 16 Bundesländer: Außengrenze plus innere Linien zur Orientierung.
- **Welt:** gesucht sind 164 Länder — alle ab 10.000 km² oder 5 Mio.
  Einwohnern, gewichtet mit der vierten Wurzel der Fläche, damit Große etwas
  öfter kommen als Kleine. Wer ins Land trifft, hat null Kilometer und die
  volle Punktzahl; sonst zählt der Weg bis zur nächsten Grenze — ein Tipp
  ins Nachbarland ist also fast so gut wie ein Treffer. Das gesuchte Land
  wird eingefärbt statt bepunktet. Umrisse kommen aus `map.js`, den Daten,
  die auch GeoFind benutzt.
- Die Weltkarte läuft in Mercator (Breiten −58° bis 84°), nicht in der
  flachen Plattkarte: bei gleicher Breite wird sie dadurch von 0,40 auf 0,67
  der Breite hoch, am Handy also 239 statt 143 Pixel. Gerechnet wird
  weiterhin auf der Kugel, die Projektion betrifft nur die Darstellung.
- Linie und Ring sind nach Entfernung eingefärbt: grün am Ziel, bernstein in
  der Mitte, rot am Ende der Skala. In der Auswertung hat die Punktzahl jeder
  Zeile die Farbe ihrer Linie.
- Zoomen: Mausrad oder zwei Finger. Raus kommt man per Doppeltipp, über die
  Taste ⟲ oben rechts oder einfach durch Rauszoomen — ab 90 Prozent gleitet
  die Karte von allein in die Vollansicht, und danach scrollt der Finger
  wieder die Seite. Verschieben: mit der Maus immer, am Handy ein Finger,
  sobald gezoomt ist (ohne Zoom scrollt der Finger weiter die Seite), zwei
  Finger schieben immer. Ein kurzer Tipp setzt weiterhin den Pin.
- In der Auswertung lässt sich jede Zeile antippen, genauso jede Marke auf
  der Karte selbst: die Karte zeigt dann nur dieses Ziel (Tipp, richtiger
  Ort, Linie) und schreibt Name und Entfernung an den Ort, der Rest wird
  blass. Beschriftungen, die über den Kartenrand ragen, werden hereingerückt.
  Gescrollt wird dabei nicht — wer auf der Karte tippt, bleibt auf der
  Karte. Ein Tipp daneben hebt die Auswahl auf.
- Die Ergebnisliste steht ab Werk nach Punkten mit der schwächsten Runde oben
  und lässt sich auf Runde umstellen; nochmal auf dasselbe Feld dreht die
  Richtung um. Bei gleicher Punktzahl entscheidet die
  Entfernung, sonst stünden alle Nuller durcheinander.

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
`geomap.js` (46 KB: Umrisse und Städte) braucht zwei Quellen:

- [isellsoap/deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON) –
  Umrisse der Bundesländer
- [jgehrcke/covid-19-germany-gae](https://github.com/jgehrcke/covid-19-germany-gae) –
  `ags.json`: Name, Lage und Einwohnerzahl je Kreis. Die kreisfreien Städte
  daraus sind die Städte des Spiels.

```bash
curl -o /tmp/bundeslaender.geo.json https://raw.githubusercontent.com/isellsoap/deutschlandGeoJSON/main/2_bundeslaender/3_mittel.geo.json
curl -o /tmp/ags.json https://raw.githubusercontent.com/jgehrcke/covid-19-germany-gae/master/ags.json

python3 tools/build_geomap.py --laender /tmp/bundeslaender.geo.json --kreise /tmp/ags.json --out geomap.js
```

Das Skript prüft zum Schluss, dass jede Stadt im Umriss liegt und die drei
von Hand ergänzten im richtigen Bundesland — sonst bricht es ab.

`words.js` (22.732 Wörter mit Vektoren, davon 1809 als Rätselwort, dazu rund
11.000 gebeugte Formen) braucht `pip install spacy numpy` und diese Quellen:

- [explosion/spacy-models](https://github.com/explosion/spacy-models) –
  `de_core_news_lg`, 500.000 Wortvektoren mit 300 Dimensionen. Es muss das
  **große** Modell sein: das mittlere hat nur 20.000 echte Vektoren und legt
  Verwandtes zusammen — Sarg, Urne, Gruft und Leichnam teilen sich dort den
  Vektor von Grab, und Beerdigung landete zu Grab auf Rang 4341 statt 66.
- [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) –
  Worthäufigkeit, bestimmt Auswahl und Reihenfolge
- [gambolputty/german-nouns](https://github.com/gambolputty/german-nouns) –
  Substantive: Großschreibung und der Vorrat an Rätselwörtern
- [michmech/lemmatization-lists](https://github.com/michmech/lemmatization-lists) –
  Grundformen und ihre gebeugten Formen
- [LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) –
  Schimpfwörter, die nie das gesuchte Wort sein sollen

Die 300 Dimensionen des Modells werden dabei auf 160 gestaucht und mit 4 Bit je
Dimension gespeichert. 4 Bit sind bei gleicher Dateigröße deutlich besser als
8 Bit bei halb so vielen Dimensionen.

Welche Wörter nicht gesucht werden, steht als Liste im Skript: Schimpfwörter
über die Datei oben hinaus, Vor- und Ortsnamen, die auch als Substantiv im
Wörterbuch stehen (Anna, Paris), englische Untertitel-Reste und Wörter mit
mehreren Bedeutungen. Sowas lässt sich nicht zuverlässig aus Daten ableiten —
die Liste ist gepflegt und darf wachsen.

```bash
# 568 MB, das große Modell
curl -LO https://github.com/explosion/spacy-models/releases/download/de_core_news_lg-3.7.0/de_core_news_lg-3.7.0-py3-none-any.whl
curl -o /tmp/de_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt
curl -o /tmp/nouns.csv https://raw.githubusercontent.com/gambolputty/german-nouns/main/german_nouns/nouns.csv
curl -o /tmp/lemmatization-de.txt https://raw.githubusercontent.com/michmech/lemmatization-lists/master/lemmatization-de.txt
curl -o /tmp/bad-words-de.txt https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/de

python3 tools/build_words.py --model de_core_news_lg-3.7.0-py3-none-any.whl \
    --freq /tmp/de_50k.txt --nouns /tmp/nouns.csv --lemmas /tmp/lemmatization-de.txt \
    --tabu /tmp/bad-words-de.txt --out words.js
```

## Pokebrudis

Unter `poke/` liegt dieselbe Idee mit den ersten 150 Pokémon: **PokeFind**
und **PokePlay**, gleiche Optik, gleiche Rätselnummern, eigener
Spielstand (`localStorage`-Präfix `pokebrudis.`). Erreichbar über den
Glumanda-Knopf in der Kopfzeile, zurück geht es über den Globus.

- **PokeFind** – geheimes Pokémon in 10 Versuchen (150 kennt nicht jeder auswendig). Hinweise: Pokédex-Nummer,
  Typ, Fundort, Lebensraum, Entwicklungsstufe, Farbe, Größe, Gewicht. Pfeile zeigen die Richtung,
  gemeinsame Typen und Fundorte stehen vorn und schwarz. Die Fundorte kommen
  aus Rot, Blau und Gelb; 32 der 150 gibt es dort nur durch Entwicklung.
  Unter dem Eingabefeld klappt „Alle 150 Pokémon“ eine Übersicht mit Sprite,
  Nummer und Name auf. Ein Klick schreibt den Namen ins Feld (geraten wird
  erst mit „Raten“), schon geratene stehen blass und sind gesperrt.
- **PokePlay** – nach Ähnlichkeit raten, mit Tipp und Auflösen wie Wordplay.
  Beide Spiele haben eine Vorschlagsliste: die 150 Namen schreibt niemand
  auswendig richtig.
  Die Ähnlichkeit ist hier keine Statistik aus Texten, sondern eine Formel
  aus fünf Dingen, die man dem Pokémon ansieht oder im Spiel erlebt: Typ
  (Gewicht 1,0), Gegend zum Fangen (0,8), Optik aus Farbe und Körperform
  (0,6), Größe (0,45) und Entwicklungsstufe (0,35). Kampfwerte bleiben
  bewusst draußen. Zu Glumanda liegen damit Glutexo, Magmar, Vulpix und
  Fukano vorn.

`poke/data.js` (31 KB) und die 150 Sprites in `poke/sprites/` (604 KB) kommen
aus [PokeAPI](https://pokeapi.co) (CC BY-NC-SA). Deutsche Namen, Typen und
Farben stehen dort direkt in den Tabellen:

```bash
git clone --depth 1 https://github.com/PokeAPI/pokeapi /tmp/pokeapi
python3 tools/build_poke.py --csv /tmp/pokeapi/data/v2/csv --out poke/data.js

# Sprites (96×96, zusammen gut 600 KB)
seq 1 150 | xargs -P 8 -I{} curl -sSL -o poke/sprites/{}.png \
    https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{}.png
```

`tools/build_single.py` baut nur Geobrudis zur Einzeldatei; Pokebrudis und
Spielbrudis brauchen ihre Ordner.

## Hosten (Cloudflare Pages)

Kein Build nötig, alles ist statisch. Zwei Wege:

1. **Ordner deployen:** Cloudflare Pages → Projekt aus dem GitHub-Repo anlegen,
   Production-Branch `main`, Build-Befehl leer lassen, Build-Output-Verzeichnis
   `geoquiz`. Jeder Push auf `main` deployt automatisch.
2. **Einzeldatei:** `python3 tools/build_single.py` erzeugt `geoquiz.html` mit
   den vier Geo-Spielen drin. Diese Datei als `index.html` per Direct Upload hochladen.
