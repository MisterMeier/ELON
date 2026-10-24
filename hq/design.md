# Design

## Ziel
Ein einheitlicher Look für App und Material: Designstandard, Elo als Leitfigur pro Fach, realistische Figuren.

## Status
gelb

## Fortschritt
60%

## Nächste 3 Schritte
- Steuerungs-Icons erzeugen (Testrunde: Timer, Freeze, Bereit-Check), in medien-eingang legen, „Steuerungs-Icons einpflegen“
- Icon-Stil festlegen, dann 19 Werkzeuge ohne Icon zuerst (Liste in elon/anleitungen/uebersicht-medien-bestand.md)
- 6 Folien-Hintergründe mit neuem Elo neu erzeugen (Flow-Bilder)
- Restliche Werkzeug-Icons per ElevenLabs erzeugen (Credits sind aufgebraucht, Liste in den Projektdateien elon/anleitungen/icons-erzeugen.md): 38 von 62 Icons sind fertig
- Realistische Elos für Doktorhut und Heft sowie kurze Töne für Klick und Fehler ergänzen
- Gemeinsame Schriftfarben-Komponente für alle Editoren (Runde 2)
- Logo und Farben für ELONUKI festlegen (Runde 6)

## In Arbeit
- 24.10., im Test: Tafel-Steuerung als Icon-Leiste unten im Stunden-Feld (Name und Status beim Drüberfahren mit der Maus). Prompts für einen neuen, ruhigen Satz Steuerungs-Icons: elon/anleitungen/steuerung-icons-prompts.md (Projektdateien); hochgeladene `st-…`-Icons ersetzen die alten automatisch
- 24.10., im Test: Neues ELONUKI-Titelbild an der Tafel (Logo und Elo aus Flow). Beim Start winkt Elo (Animation) auf dem Bild ohne Eule, nach 9 Sekunden blendet das fertige Titelbild ein. Dateien assets/folien/tafel-start.webp und tafel-start-leer.webp
- 23.10., im Test: Tafel-Ruhebild lebendig (Elo winkt zur Begrüßung, danach Standard-Elo still; altes Bild mit eingemaltem Elo ersetzt). Allgemeine Animationen (Winken, Zeit um) spielt jetzt immer das Standard-Elo, auch in Fächern mit eigenem Elo. Schlachtplan Wochenende: elon/anleitungen/uebersicht-medien-bestand.md
- 23.10., im Test: Neue Elos jetzt überall sichtbar: rund 25 fest eingetragene alte Elo-Bilder (Startbildschirm, Rollenkarten, Hefteintrag/Übungen, Hilfe- und Fleiß-Station, Rückmelde-Elos, Psst, Lehrer-Zentrale, DaZ-Lernlandschaft, Info-Seite) auf Standard-Elo und Elo-Gefühle umgestellt. Startfolien unverändert. Offen: 6 Folien-Hintergründe mit eingemaltem alten Elo. Gesamtliste zum Abhaken: elon/anleitungen/uebersicht-medien-bestand.md (Projektdateien)
- 23.10., im Test: Neue Elo-Generation aus Google Flow (Greenscreen, freigestellt mit tools/elo_keyen.py): Standard-Elo und alle Fach-Elos (Mathe, Englisch, Schottland, Kunst, Wirtschaft, Deutsch, GPG, N&T) ersetzt, neu Informatik und DaZ. Startfolien (Rakete, Atelier, Börse, Englisch-Welt) unverändert. 8 Elo-Gefühle und 4 Ansichten nur abgelegt (assets/medien/allg), noch ohne Einsatz in der App. Prompt-Listen: elon/anleitungen/flow-mini-videos.md
- 23.10., im Test: Drei neue realistische Fach-Elos (Deutsch: Dichter mit Feder, GPG: Entdecker mit Karte und Globus, N&T: Forscher mit Lupe) freigestellt und automatisch im Fach; GPG hat jetzt ein Fach-Logo im Stil der anderen Fächer am Schreibtisch (vorläufig aus den Elo-Bildern zusammengesetzt, kann bei neuen ElevenLabs-Credits ersetzt werden). Freistell-Skript: tools/elo_freistellen.py
- 23.10.: Roter Werkzeugkasten als Kachel-Symbol in der Bibliothek, vorerst als SVG; ElevenLabs-Bild folgt, sobald wieder Credits da sind (Icon-Name werkzeugkasten)
- 23.10., Vorschlag: Hefteintrag-Stil nach Designstandard (Baloo/Nunito, Zeilenabstand 1,45, gelber Merke-Kasten, Achtung gestrichelt orange, Falsch/Richtig enger gesetzt), nur Aussehen. Original-Elo animiert (blinzeln, winken, hüpfen; die gezeichnete SVG-Elo war Fabian zu schlecht) als Prototyp unter prototyp/elo-animiert.html. Animations-Skills: hq/skills.md
- 23.10.: Auftragsvorlage für Gemini-Medien (Elo-Stil, App-Farben, keine Schrift im Bild, Formate und Größen) in assets/medien/ANLEITUNG.md
- 22.10., im Test: App ist auf allen Geräten, in allen Klassen und Schulen immer hell, egal ob das iPad im dunklen Modus steht (Ursache der unlesbaren Schrift in der 7a). Dunkel nur per Schalter „Dunkles Design“ im Logo-Menü der Lehrkraft. Prüfskript deckt jetzt 43 Ansichten ab, alle WCAG AA.
- 21.10., im Test: Icon-System ico(name): Bild aus assets/icons/<name>.webp, sonst sofort ein sauberes Strich-Symbol; alle durch die Emoji-Entfernung leer gewordenen Knöpfe (SuS-Seitenleiste, Problem melden, Vorlesen, Planung, 41 Werkzeuge) haben wieder ein Symbol Bereits 38 ElevenLabs-Icons eingebunden (Seitenknöpfe, Menü, 17 Werkzeuge).
- 20.10., im Test: Kontrast zentral über Farb-Token (Heftseiten im dunklen Modus hell, WCAG AA geprüft mit tools/kontrast-check.js); neue Bilder per ElevenLabs: Standard-Elo, Startbild, Ruhebild, Freeze-Elo, Fußballfeld, 9 Fach-Logos ohne Schrift
- Designstandard für Material (elon/designstandard-material.md) bei jedem neuen Hefteintrag anwenden

## Erledigt
- Alle Emojis aus der App entfernt (20.10., Runde 4); Stimmungs-Gesichter und Ampelpunkte sind jetzt SVG
- 8 realistische Elo-Bilder (ElevenLabs) freigestellt und nach Fach eingebunden: Mathe, Englisch, Schottland, Kunst, Wirtschaft, Standard, Winken, Stark (18.10.)
- Fabians Sounds eingebunden: Futuristisch als Steuerungs-Töne (Bestätigen, Fenster auf/zu), Fußball im Kicker, Börse beim Bereit-Check, alle auch in den Tafel-Sounds (18.10.)
- Elo auf jeder Folie, Figur automatisch nach Fach aus assets/elo/figuren.json (18.10.)
- Kontrast in der Hefteintrag-Auswahl und bei Merke/Achtung-Überschriften auf mindestens WCAG AA gebracht (18.10.)
- Designstandard für Hefteinträge, Übungen und Druck (Fabian OK 12.10.)
- Fach-Elos: UK-Elo für Englisch, Maler-Elo für Kunst
- Startfolien (Rakete, Börse, Weltkugel)
