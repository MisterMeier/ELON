# Design

## Ziel
Ein einheitlicher Look für App und Material: Designstandard, Elo als Leitfigur pro Fach, realistische Figuren.

## Status
gelb

## Fortschritt
60%

## Nächste 3 Schritte
- Icons per ElevenLabs in Serie erzeugen (Anleitung elon/anleitungen/icons-erzeugen.md in den Projektdateien), Claude baut sie ein
- Realistische Elos für Doktorhut und Heft sowie kurze Töne für Klick und Fehler ergänzen
- Gemeinsame Schriftfarben-Komponente für alle Editoren (Runde 2)
- Logo und Farben für ELONUKI festlegen (Runde 6)

## In Arbeit
- 21.10., im Test: Icon-System ico(name): Bild aus assets/icons/<name>.webp, sonst sofort ein sauberes Strich-Symbol; alle durch die Emoji-Entfernung leer gewordenen Knöpfe (SuS-Seitenleiste, Problem melden, Vorlesen, Planung, 41 Werkzeuge) haben wieder ein Symbol
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
