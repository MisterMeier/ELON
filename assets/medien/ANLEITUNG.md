# Medien aus Gemini für ELONUKI

Du erzeugst Bilder, Videos und SVG-Grafiken in Gemini. Claude macht sie klein und baut sie ein.
Danach findest du sie im Folien-Editor unter **Medien** (neben „Audio, Video“).

## Der Weg in 4 Schritten
1. In Gemini erzeugen (Vorlage unten kopieren, nur die Zeilen in [eckigen Klammern] ändern).
2. Herunterladen und so benennen: `FACH_thema_motiv.endung`, z. B. `E_london_baeckerei.png`.
3. In den Projektordner **medien-eingang** legen.
4. Im Chat schreiben: „Medien einpflegen“. Claude verkleinert alles, trägt es ein und macht einen PR.

## Dateiname
`FACH_thema_motiv.endung`, nur Kleinbuchstaben, Wörter im Motiv mit Bindestrich.

| FACH | Fach |
|---|---|
| E / M / K | Englisch / Mathe / Kunst |
| D / N / G / I / W / DZ | Deutsch / N&T / GPG / Informatik / W&B / DaZ |
| ALLG | für alle Fächer (z. B. Elo-Szenen, Rituale) |

Beispiele: `E_shopping_markt-stand.png`, `M_bruch_pizza-teilen.mp4`, `K_farben_kreis.svg`, `ALLG_elo_winkt.png`.
Video mit Ton behalten: `-ton` ans Ende, z. B. `E_london_dialog-baecker-ton.mp4`. Sonst wird der Ton entfernt.

## Was wofür
| Du brauchst | In Gemini | Format | Größe | Hinweis |
|---|---|---|---|---|
| Hintergrund für eine Folie | Bild erzeugen | PNG oder JPG, **16:9** | so groß wie möglich | wird auf 1600 px Breite verkleinert, ca. 100–250 KB |
| Figur oder Gegenstand zum Platzieren | Bild erzeugen | PNG, **1:1**, **transparenter Hintergrund** | so groß wie möglich | wird auf 800 px verkleinert; klappt Transparenz nicht, einfarbig hellen Hintergrund nehmen, Claude stellt frei |
| Kurze Bewegung (Einstieg, Übergang) | Video erzeugen (Veo) | MP4, **16:9** | 4–8 Sekunden | läuft stumm in Schleife, startet erst, wenn die Folie zu sehen ist |
| Szene mit Sprache (z. B. Elo spielt einen Dialog vor) | Video erzeugen (Veo) | MP4, 16:9, Name mit `-ton` | bis 20 Sekunden | mit Ton und Abspielknopf |
| Erklär-Grafik (Bruch, Winkel, Zeitstrahl) | Canvas: „Schreibe SVG-Code …“ | Code als `.svg` speichern | – | gestochen scharf, winzig klein, darf leicht animiert sein |
| GIF | lieber als MP4 erzeugen | – | – | GIFs werden automatisch zu MP4 (10× kleiner) |
| Lottie | **nicht nutzen** | – | – | Gemini kann es nicht sauber, MP4 oder SVG reicht |

## Regeln
- **Keine Schrift im Bild.** Texte setzt ELONUKI selbst darüber (dann sind sie scharf, korrigierbar und vorlesbar).
- Keine echten Personen, keine Kinder aus der Klasse, keine Markenlogos.
- Ein Motiv pro Bild, ruhiger Hintergrund, viel Platz für Text auf einer Seite.
- Videos kurz halten: 4–8 Sekunden reichen fast immer.
- Fremde Medien (Verlags-CD, Schulbuch-Video) gehören **nicht** hierher, sondern wie bisher in die Bibliothek (Markierung „Verlag“).

## Elo als Referenz
Für Szenen mit Elo in Gemini ein Elo-Bild als Referenz hochladen, z. B.:
- https://elio.schule/assets/elo/elo-standard-512.webp (Standard)
- https://elio.schule/assets/elo/elo-uk-real-512.webp (Englisch), `elo-kunst-real-512.webp` (Kunst), `elo-mathe-real-512.webp` (Mathe)

## Auftragsvorlage zum Kopieren
```
Erstelle [ein Bild | ein 8-Sekunden-Video] für eine Lernplattform einer 7. Klasse (12–13 Jahre).

Motiv: [z. B. ein Obst- und Gemüsestand auf einem Londoner Straßenmarkt, Blick von vorn]
Zweck: [Folienhintergrund | Figur zum Freistellen | Einstiegsszene]
Format: [16:9 | 1:1 mit transparentem Hintergrund]

Stil: freundlich, warm und hell, realistisch mit leichtem 3D-Look wie ein moderner Animationsfilm,
weiche Schatten, klare Formen, ruhiger Hintergrund mit Platz für Text [links | rechts | oben].
Farben passend zur App: Blau-Violett (#3346d3 bis #7c3aed) mit warmen gelben Akzenten (#f2b51d).
[Mit Elo: Elo ist eine freundliche blaue Eule, genau wie im Referenzbild (Gefieder, Augen, Kleidung gleich lassen).
 Elo [winkt | zeigt auf … | spricht mit …].]

Wichtig: keine Schrift, keine Buchstaben, keine Zahlen, keine Schilder mit Text, keine Logos,
keine Wasserzeichen, keine echten Personen.
[Video: ruhige Kamera, eine Bewegung, Anfang und Ende passen zusammen (Schleife). Ohne Musik.]
```

Für SVG in Canvas:
```
Schreibe eine einzelne SVG-Datei (viewBox 0 0 800 450), ohne Skripte und ohne externe Links.
Zeige [z. B. eine Pizza in 8 gleiche Stücke geteilt, 3 Stücke hervorgehoben].
Strichstärke 2, runde Ecken, Linien #18203d, Hervorhebung #e8743b, Fläche #2f63c8 mit 18 % Deckkraft.
Keine Beschriftung. [Optional: sanfte CSS-Animation, die 3 Stücke nacheinander aufleuchten lässt.]
```

## Für Claude: einpflegen
`python3 tools/medien_einpflegen.py /mnt/project-files/medien-eingang`
- Bilder → WebP (Hintergrund 1600 px, Freisteller 800 px), Videos/GIF → H.264-MP4 bis 1280 px, ohne Ton (außer `-ton`), mit `-poster.webp`, SVG → bereinigt (keine Skripte, keine fremden Links).
- Ergebnis: `assets/medien/<fach>/<thema>-<motiv>.*`, Eintrag in `assets/medien/medien.json`, Bilder und Poster in `assets/offline.json`.
- Danach in `medien.json` `titel` und `alt` (kurze Bildbeschreibung) prüfen, bei Warnung „groß“ Fabian um eine kürzere Fassung bitten.
- In der App: Folien-ID `a:<id>`; `medH(eintrag)` zeigt Bild oder Video (Poster, lädt erst sichtbar, Fallback aufs Poster).
